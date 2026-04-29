# 웰니스박스 출퇴근기록부

Next.js App Router 기반의 웰니스박스 사내 출퇴근 기록 웹사이트입니다. Notion 임베드, 회사 IP 제한, 직원별 승인 회사 컴퓨터 1대, 관리자 수동 수정/CSV 다운로드를 전제로 만들었습니다.

## 주요 설계 결정

- DB는 Firebase Cloud Firestore를 사용합니다. 별도 DB 서버를 운영하지 않아도 되고, 5명 규모의 텍스트성 출퇴근 데이터는 무료 할당량 안에서 충분히 운영 가능합니다.
- 인증은 이름 + 4자리 PIN입니다. 첫 로그인 후 90일 세션 토큰을 브라우저 localStorage에 저장해 같은 컴퓨터에서는 자동 로그인됩니다.
- 직원별 승인 기기는 1대만 허용합니다. 첫 회사 컴퓨터 로그인은 자동 승인되고, 이후 다른 컴퓨터 로그인은 관리자 승인 전까지 출퇴근이 막힙니다.
- 모바일/태블릿은 서버에서 User-Agent와 Client Hint 기준으로 차단합니다. 실제 출퇴근 허용은 회사 IP + 승인 기기 + PIN 세션 조합으로 처리합니다.
- 모든 저장 시각은 Firestore Timestamp로 저장하고, 화면 표시는 KST(`Asia/Seoul`) 기준입니다. 업무일 경계는 KST 06:00입니다.

## 로컬 실행

```bash
npm install
npm run dev
```

로컬에서는 `.env`에 Firebase 서비스 계정 환경변수가 필요합니다. 현재 작업 디렉터리의 `.env`는 로컬 실행용으로 세팅되어 있습니다. `ALLOWED_OFFICE_IPS`는 개발 편의를 위해 `127.0.0.1`과 `::1`을 포함해 테스트할 수 있습니다.

```env
ALLOWED_OFFICE_IPS="127.0.0.1,::1"
```

## 환경변수

```env
FIREBASE_PROJECT_ID="attendance-check-32475"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@attendance-check-32475.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ALLOWED_OFFICE_IPS="203.0.113.10,198.51.100.0/24,2001:db8::/48"
```

- `FIREBASE_PROJECT_ID`: Firebase 프로젝트 ID
- `FIREBASE_CLIENT_EMAIL`: Firebase Admin SDK 서비스 계정 이메일
- `FIREBASE_PRIVATE_KEY`: Firebase Admin SDK 비공개 키. 줄바꿈은 `\n` 그대로 넣습니다.
- `ALLOWED_OFFICE_IPS`: 출퇴근/관리자 API를 허용할 회사 공인 IP 목록. 쉼표로 여러 개를 넣을 수 있고 CIDR 대역을 지원합니다.

회사 공인 IP 확인은 배포 후 회사 컴퓨터에서 `/api/network`를 열어 `detectedIp` 값을 확인한 뒤 Vercel 환경변수에 넣으면 됩니다. 첫 접속 IP를 자동으로 회사 IP로 등록하지는 않습니다.

## 직원/관리자 계정 생성

Firestore 스키마 파일 적용은 필요 없습니다. 첫 계정은 스크립트로 생성합니다.

```bash
npm run db:upsert-employee -- --name 홍길동 --pin 1234 --role employee
npm run db:upsert-employee -- --name 관리자 --pin 1234 --role admin
```

사번을 따로 관리하고 싶으면 `--employee-no E001`를 추가로 넣을 수 있습니다. 생략하면 이름이 내부 식별값으로 저장됩니다.

## 배포

1. Firebase Console에서 Cloud Firestore를 생성합니다.
2. Firebase 프로젝트 설정 > 서비스 계정에서 새 비공개 키 JSON을 발급합니다.
3. Vercel에 프로젝트를 연결합니다.
4. `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `ALLOWED_OFFICE_IPS`를 Vercel 환경변수에 등록합니다.
5. 관리자/직원 계정을 생성합니다.
6. 배포 URL을 Notion 페이지에 임베드합니다.

## Firestore 컬렉션

### `employees`

직원 기본 정보와 PIN 해시를 저장합니다.

- `employee_no`: 내부 식별값. 사번을 쓰지 않으면 이름과 동일하게 저장할 수 있습니다.
- `name`: 이름
- `role`: `employee` 또는 `admin`
- `pin_hash`, `pin_salt`: PIN 검증용
- `is_active`: 비활성 직원 차단

### `employee_devices`

직원별 승인 회사 컴퓨터를 관리합니다.

- `device_id`: 브라우저 localStorage에 저장된 기기 식별자
- `status`: `approved`, `pending_replacement`, `replaced`, `revoked`
- 직원당 `approved` 상태는 앱 로직에서 하나만 허용합니다.
- 새 컴퓨터에서 PIN 로그인하면 `pending_replacement`가 생성되고, 관리자가 승인하면 기존 승인 기기가 `replaced`로 바뀝니다.

### `sessions`

90일 로그인 세션입니다. 문서 ID는 세션 토큰 해시입니다.

- `device_record_id`: 승인 기기 문서 ID
- `expires_at`: 90일 만료
- `revoked_at`: 이 기기 로그아웃 처리

### `attendance_records`

하루 1 row 방식의 출퇴근 기록입니다. 문서 ID는 `employeeId_YYYY-MM-DD`입니다.

- `work_date`: KST 기준 업무일
- `check_in_at`, `check_out_at`: Firestore Timestamp
- `check_in_ip`, `check_out_ip`: 서버에서 확인한 요청 IP
- `check_in_session_id`, `check_out_session_id`: 어떤 승인 기기/세션에서 찍었는지 추적
- `work_type`: `office`, `remote`, `offsite`, `business_trip`

### `attendance_audit_logs`

관리자 수동 추가/수정 이력을 저장합니다.

- `action`: `create` 또는 `update`
- `changed_by`: 변경 관리자
- `before_data`, `after_data`: 변경 전후 JSON
- `reason`: 수정 사유

## 엣지 케이스 처리

- 같은 날 출근 두 번: 거부
- 같은 근무일 퇴근 두 번: 마지막 퇴근 시각으로 갱신
- 퇴근 취소: 현재 근무일의 퇴근 기록을 취소하고 다시 근무 중 상태로 변경
- 퇴근 없이 다음 날로 넘어감: 이전 근무일 기록을 23:59 퇴근으로 자동 정리
- 06:00 전 새벽 퇴근: 전날 근무 기록에 퇴근 처리
- 회사 IP가 아님: “회사 네트워크에 연결된 상태에서만 체크할 수 있습니다”
- 승인되지 않은 컴퓨터: 기기 변경 요청 생성 후 관리자 승인 대기
- 모바일/태블릿: 서버 API에서 차단

## 주요 화면

- `/`: 직원용 출퇴근 화면
- `/admin`: 관리자 현황/수정/CSV/기기 변경 승인 화면
- `/api/network`: 서버가 감지한 현재 IP와 회사 IP 허용 여부 확인

## 검증

```bash
npm run typecheck
npm run build
```

Firebase Admin SDK 하위 의존성은 Vercel 런타임 호환성을 위해 `uuid` 강제 override를 하지 않습니다.
