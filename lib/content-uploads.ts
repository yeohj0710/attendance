import { unstable_cache } from "next/cache";
import { propDate, propText, queryNotionDatabase } from "@/lib/notion";

/**
 * 콘텐츠팀 캘린더(public/content/daily.js)의 PD님 계정 업로드 일정을 노션 편집 진행도에서 읽는다 (/api/calendar/uploads).
 * 돌려주는 줄 모양은 daily.js 의 UPLOADS 와 같다: [MM-DD, 계정키, 영상 제목, 상태, 편집자, 메모].
 * 10/9 부터만 쓴다(그 전은 daily.js 표 그대로라 체크 키가 안 바뀐다). 어라운드팜, 미미팜은 드라이브 릴스 목록이 원본이라 여기서 빼고 daily.js 표를 쓴다.
 * 노션은 5분에 한 번만 읽고 모두가 나눠 쓴다.
 */
const PROGRESS_DB = "3453b1f9b9ae80e8b0c0f319797c99f3";
const FROM = "2026-10-09";
const TO = "2026-12-31";

/* 편집 진행도 「인플루언서」 → daily.js 계정 키. 제이약사님은 10/26 부터 한국 계정(jaykr) */
const ACCOUNT: Record<string, string> = {
  "김주성 대표님": "jejo",
  "오주헌 약사님": "oyak",
  "제선영 약사님": "jessi",
  "전종열 약사님": "jay",
  "닥터 닭갈비": "taeeun",
  "OWM 분당 약국장": "owmb",
};
const JAY_KR_FROM = "2026-10-26";

/* 진행 상태 → daily.js 상태 (ok 준비됨, rv 검수 중, ed 편집 중, raw 의뢰 전, noed 편집자 미정, nosh 촬영본 없음) */
function stateOf(status: string, editor: string) {
  if (["편집 완료", "업로드 예정", "업로드 완료"].includes(status)) return "ok";
  if (["초안 완료", "피드백 진행중", "피드백 반영중", "수정 완료"].includes(status)) return "rv";
  if (status === "요청 완료") return "ed";
  if (status === "녹화 완료") return !editor || editor === "미정" ? "noed" : "raw";
  return "nosh";
}

export type UploadRow = [string, string, string, string, string, string?];

async function loadUploads(): Promise<UploadRow[]> {
  const pages = await queryNotionDatabase(PROGRESS_DB, {
    and: [
      { property: "업로드 예정일", date: { on_or_after: FROM } },
      { property: "업로드 예정일", date: { on_or_before: TO } },
    ],
  });
  const rows: UploadRow[] = [];
  for (const page of pages) {
    const status = propText(page, "진행 상태");
    if (status === "반려" || status === "업로드 보류") continue;
    const date = propDate(page, "업로드 예정일")?.start.slice(0, 10);
    let acc = ACCOUNT[propText(page, "인플루언서")];
    if (!date || !acc) continue;
    if (acc === "jay" && date >= JAY_KR_FROM) acc = "jaykr";
    const editor = propText(page, "편집자").replace(/^미정$/, "");
    const st = stateOf(status, editor);
    /* 검수 중, 편집 중이면 노션 상태 이름을 그대로 꼬리표에 (어디까지 왔는지 보이게) */
    const note = st === "rv" || st === "ed" ? status : undefined;
    rows.push([date.slice(5), acc, (propText(page, "영상 제목") || "제목 없음").replace(/\s+/g, " ").trim(), st, editor, note]);
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

export const getCalendarUploads = unstable_cache(loadUploads, ["calendar-uploads-v1"], { revalidate: 300, tags: ["calendar-uploads"] });
