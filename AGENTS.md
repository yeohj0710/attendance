# Codex Deployment Guardrails

- Korean user-facing changes must keep the existing product tone and layout density.
- Before editing, inspect the current dirty worktree. Do not mix unrelated dirty changes into a commit. If the same file already has unrelated edits and the requested work needs that file, either isolate the patch precisely or say the file is already dirty before committing.
- If the user asks to deploy this app, deploy the production domain unless they explicitly ask for preview only.
- Production URL is `https://wellnessbox-attendance.vercel.app`.
- After any deployment, verify the production URL with `curl.exe -I https://wellnessbox-attendance.vercel.app` and confirm:
  - HTTP status is `200`.
  - The deployment is `target production` in `vercel inspect wellnessbox-attendance.vercel.app`.
  - `Content-Security-Policy` does not block the user's expected embedding context. In particular, do not reintroduce restrictive `frame-ancestors` such as only `'self'` and Notion unless the user explicitly asks.
- Preview deployments under `*.vercel.app` may return `401` because Vercel deployment protection is enabled for all except custom domains. Do not treat a protected preview URL as the final working deployment.
- If a screenshot says "`wellnessbox-attendance.vercel.app`에서 연결을 거부했습니다" inside another page, check response headers first. This usually means iframe embedding was blocked by `Content-Security-Policy: frame-ancestors` or `X-Frame-Options`, not that the app server is down.
- `components/employee/WorkInsights.tsx` embeds the insights site (`C:\dev\etc\attendance-stats`, https://wellnessbox-attendance-stats.vercel.app) at the bottom of the logged-in employee page. It opens the child with `?embed=1` and sizes the iframe from a `postMessage` height signal, so the child keeps its own scroll off. Do not copy the statistics code into this repo, and keep the `?embed=1` + height-message contract in sync with that project's `components/EmbedBridge.tsx`.
- 콘텐츠팀 캘린더는 261008 부터 이 저장소 `public/content/` (https://wellnessbox-attendance.vercel.app/content/daily.html) 에 있다. 공용 저장소는 `app/api/calendar/route.ts` (Upstash 해시 `cal:v1`, 환경변수 `KV_REST_API_URL`/`KV_REST_API_TOKEN`). 할 일 키는 제목 글자에서 나오니 제목을 바꾸면 체크가 날아간다. JS, CSS 를 고치면 `npm run build` 앞의 prebuild 가 `?v=` 해시를 다시 붙인다. 검사는 `node scripts/test-content-calendar.mjs` (가짜 저장소, 운영 저장소는 안 건드림). 이 저장소는 공개라 급여, 단가, 편집비, 계좌, 비밀번호는 캘린더에 넣지 않는다. 옛 `C:\dev\pharmacist-mcn-structure` 는 고치지 않는다.
- 회사 일정 달력은 `/schedule` (`components/schedule/*`, `lib/company-schedule*.ts`, `app/api/schedule/*`). 노션 「일정」 DB(1533b1f9b9ae800bb0dbc264b47ae6d0)를 직접 읽고 쓴다(같은 2주는 45초 공유 캐시, 쓰면 비움). 일정 창은 노션 페이지처럼 속성, 댓글, 본문 블록 편집. 검사는 개발 서버를 띄우고 `node scripts/test-company-schedule.mjs` (API 를 가짜로 바꿔 끼워 노션은 안 건드림).
- 노션 메인 맨 위에는 `/hub` 하나만 붙인다(261008): 왼쪽 위 회사 일정(작게), 왼쪽 아래 채널 현황(`/content-board/pipeline?embed=1`), 오른쪽 업무 시스템(`/`). 노션 원본 일정 달력은 메인의 기록 → 기타 접는 칸으로 옮겨 두었고 지우지 않는다. 노션 메인을 바꿀 때는 대표님 확인을 먼저 받는다.
