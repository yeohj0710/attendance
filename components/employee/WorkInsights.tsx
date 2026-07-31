"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 근무 인사이트(별도 사이트)를 출퇴근기록부 아래에 이어 붙인다.
 *
 * 통계 계산·차트는 전부 인사이트 사이트에 있고 여기서는 화면만 빌려 온다.
 * 코드를 복사해 오지 않으므로 통계 로직은 한 곳에서만 관리된다.
 *
 * 비용을 아끼는 두 가지 장치:
 *  1. 스크롤이 근처에 올 때까지 iframe을 만들지 않는다. 안 내려보면 요청 0건.
 *  2. 인사이트 사이트는 Firestore를 업무일당 1회만 읽고 그 결과를 모두가 나눠 쓴다.
 *     여기서 열어도 읽기 횟수는 늘지 않는다.
 */
const STATS_URL =
  process.env.NEXT_PUBLIC_STATS_URL ?? "https://wellnessbox-attendance-stats.vercel.app";
const MESSAGE_SOURCE = "wellnessbox-attendance-stats";
const FALLBACK_HEIGHT = 900;

export function WorkInsights() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [height, setHeight] = useState(FALLBACK_HEIGHT);
  const [isFitted, setIsFitted] = useState(false);

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      // 화면에 닿기 조금 전에 미리 불러와서 기다리는 느낌을 줄인다.
      { rootMargin: "500px 0px" },
    );

    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad) return;

    const statsOrigin = new URL(STATS_URL).origin;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== statsOrigin) return;

      const data = event.data as { source?: string; type?: string; height?: number } | null;
      if (!data || data.source !== MESSAGE_SOURCE || data.type !== "height") return;

      const next = Number(data.height);
      if (!Number.isFinite(next) || next < 240) return;

      // 내용 높이보다 몇 px 넉넉히 잡아 iframe 안쪽에 스크롤바가 뜨지 않게 한다.
      setHeight(Math.min(24000, Math.ceil(next) + 4));
      setIsFitted(true);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [shouldLoad]);

  return (
    <section
      aria-labelledby="work-insights-heading"
      className="mx-auto w-full max-w-[1180px] px-3 pb-16 sm:px-5"
    >
      <div className="mb-3 border-t border-line pt-8">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[0.66rem] font-bold tracking-[0.2em] text-accent">WELLNESSBOX</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-ink" id="work-insights-heading">
              근무 인사이트
            </h2>
            <p className="mt-1 text-xs text-muted">
              팀 전체 출퇴근·업무 기록을 통계로 봅니다. 보기 전용이라 기록은 바뀌지 않아요.
            </p>
          </div>
          <a
            className="text-xs font-semibold text-muted underline-offset-4 hover:text-accent hover:underline"
            href={STATS_URL}
            rel="noreferrer"
            target="_blank"
          >
            새 탭에서 열기
          </a>
        </div>
      </div>

      <div ref={anchorRef}>
        {shouldLoad ? (
          <iframe
            className="w-full rounded-lg border border-line bg-white/60"
            loading="lazy"
            // 높이 신호가 끝내 오지 않아도(차단 등) 기본 높이로 계속 볼 수 있게 둔다.
            onLoad={() => window.setTimeout(() => setIsFitted(true), 4000)}
            src={`${STATS_URL}/?embed=1`}
            style={{ height: `${height}px` }}
            title="웰니스박스 근무 인사이트"
          />
        ) : (
          <div className="h-[420px] w-full animate-pulse rounded-lg border border-line bg-white/60" />
        )}
      </div>

      {shouldLoad && !isFitted ? (
        <p className="mt-2 text-center text-[0.7rem] text-muted">인사이트를 불러오는 중</p>
      ) : null}
    </section>
  );
}
