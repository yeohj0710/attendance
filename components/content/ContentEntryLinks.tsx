import Link from "next/link";

/** 업무 시스템 오늘 할 일 칸 머리줄에 붙는 콘텐츠팀 화면 입구 */
export function ContentEntryLinks({ alone }: { alone: boolean }) {
  return (
    <span style={{ marginLeft: alone ? "auto" : 12, display: "inline-flex", gap: 12 }}>
      <Link className="maple-quest-link" href="/content-board/pipeline" style={{ marginLeft: 0 }}>
        채널 현황
      </Link>
      <Link className="maple-quest-link" href="/content-board/schedule" style={{ marginLeft: 0 }}>
        일정 달력
      </Link>
    </span>
  );
}
