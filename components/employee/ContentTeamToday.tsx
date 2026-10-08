"use client";

import { useEffect, useState } from "react";

/**
 * 콘텐츠팀 네 분에게만 "콘텐츠팀 오늘 할 일"을 붙인다.
 *
 * 할 일은 콘텐츠팀 캘린더(별도 사이트) 한 곳에만 있고 여기서는 그 사람의 오늘 칸만 빌려 온다.
 * 출퇴근기록부의 할 일, 일지, Firestore 는 건드리지 않는다. 체크는 캘린더 쪽 저장소에 남는다.
 * 관리자는 네 분 중 한 명을 골라 같은 칸을 미리 볼 수 있다 (PD님 계정으로 로그인하지 않아도 되게).
 */
const CALENDAR_URL =
  process.env.NEXT_PUBLIC_CONTENT_CALENDAR_URL ?? "https://pharmacist-mcn-structure.vercel.app";
const MESSAGE_SOURCE = "content-calendar";
const FALLBACK_HEIGHT = 640;

/* 출퇴근기록부 이름 → 캘린더의 사람 키 */
const CONTENT_TEAM: Record<string, string> = {
  김호준: "kim",
  송아영: "song",
  권현우: "kwon",
  이민우: "lee",
};

export function contentTeamKey(name: string | null | undefined) {
  const plain = (name ?? "").replace(/\s/g, "");
  const hit = Object.keys(CONTENT_TEAM).find((k) => plain.includes(k));
  return hit ? CONTENT_TEAM[hit] : null;
}

export function ContentTeamToday({
  name,
  isAdmin = false,
}: {
  name: string | null | undefined;
  isAdmin?: boolean;
}) {
  const own = contentTeamKey(name);
  const [picked, setPicked] = useState("kim");
  const who = own ?? (isAdmin ? picked : null);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);

  useEffect(() => {
    if (!who) return;
    const origin = new URL(CALENDAR_URL).origin;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== origin) return;
      const data = event.data as { source?: string; type?: string; height?: number } | null;
      if (!data || data.source !== MESSAGE_SOURCE || data.type !== "height") return;
      const next = Number(data.height);
      if (!Number.isFinite(next) || next < 120) return;
      setHeight(Math.min(6000, Math.ceil(next) + 4));
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [who]);

  if (!who) return null;

  return (
    <div className="mt-4 rounded border border-line bg-field/60">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-3">
        <span className="block text-sm font-bold text-ink">
          콘텐츠팀 오늘 할 일{own ? "" : " (관리자 미리보기)"}
        </span>
        {own ? null : (
          <select
            aria-label="미리 볼 사람"
            className="rounded border border-line bg-white px-2 py-1 text-xs text-ink"
            onChange={(event) => setPicked(event.target.value)}
            value={picked}
          >
            {Object.entries(CONTENT_TEAM).map(([label, key]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
      {own ? null : (
        <p className="px-3 pt-1 text-[0.7rem] text-muted">
          그분 화면과 같습니다. 여기서 체크하면 실제 기록에 남으니 보기만 해 주세요.
        </p>
      )}
      <div className="px-2 pb-2 pt-2">
        <iframe
          className="w-full border-0 bg-transparent"
          key={who}
          src={`${CALENDAR_URL}/daily.html?embed=today&who=${who}`}
          style={{ height: `${height}px` }}
          title="콘텐츠팀 오늘 할 일"
        />
      </div>
    </div>
  );
}
