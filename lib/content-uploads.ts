import { getPipelineData } from "@/lib/content-pipeline";

/**
 * 콘텐츠팀 캘린더(public/content/daily.js)의 PD님 계정 업로드 일정 (/api/calendar/uploads).
 * 노션 편집 진행도는 채널 현황판(lib/content-pipeline.ts)이 5분에 한 번 읽어 uploads 로 내보낸다(2026-10-09 고정 시작). 여기서는 그걸 나눠 쓴다.
 * 줄 모양은 daily.js 의 UPLOADS 와 같다: [MM-DD, 계정키, 영상 제목, 상태, 편집자, 메모].
 * 어라운드팜, 미미팜은 드라이브 릴스 목록이 원본이라 빼고 daily.js 표를 쓴다.
 * 제목은 공백을 한 칸으로 모으고 앞뒤를 자른다. 할 일 체크 키가 제목에서 나오니 이 다듬기 규칙을 바꾸지 않는다.
 */
const FROM_NOTION = new Set(["jejo", "oyak", "jay", "jaykr", "owmb", "jessi", "taeeun"]);

export type UploadRow = [string, string, string, string, string, string?];

export async function getCalendarUploads(): Promise<UploadRow[]> {
  const data = await getPipelineData();
  return (data.uploads ?? [])
    .filter((r) => FROM_NOTION.has(r[1]))
    .map(([d, acc, title, st, editor, note]) => [d, acc, (title || "제목 없음").replace(/\s+/g, " ").trim(), st, editor === "미정" ? "" : editor, note || undefined]);
}
