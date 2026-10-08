"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import type { ContentState } from "@/components/content/useContentData";

const TABS = [
  { href: "/content-board/pipeline", label: "채널 현황" },
  { href: "/content-board/schedule", label: "일정 달력" },
];

/** 콘텐츠팀 화면 공통 틀: 위쪽 이동 줄, 로그인 안내, 불러오는 중 표시 */
export function ContentShell<T>({
  active,
  state,
  children,
}: {
  active: string;
  state: ContentState<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <main className="content-page">
      <div className="content-bg" aria-hidden="true" />
      <nav className="content-nav">
        <Link className="content-back" href="/">
          업무 시스템으로
        </Link>
        <div className="content-tabs">
          {TABS.map((tab) => (
            <Link
              aria-current={tab.href === active ? "page" : undefined}
              className={tab.href === active ? "is-on" : ""}
              href={tab.href}
              key={tab.href}
            >
              {tab.label}
            </Link>
          ))}
          <a href="/content/daily.html">할 일 달력</a>
        </div>
      </nav>

      {state.kind === "ready" ? (
        children(state.data)
      ) : (
        <section className="content-card content-message">
          {state.kind === "loading" ? <p>노션에서 불러오는 중이에요.</p> : null}
          {state.kind === "login" ? (
            <p>
              업무 시스템에 로그인한 뒤에 볼 수 있어요. <Link href="/">로그인하러 가기</Link>
            </p>
          ) : null}
          {state.kind === "error" ? <p>불러오지 못했어요. {state.message}</p> : null}
        </section>
      )}
    </main>
  );
}

type Tip = { text: string; x: number; y: number; below: boolean } | null;

/** 마우스를 올리면 뜨는 설명창. 줄 밖(body 기준 fixed)에 띄워서 스크롤 칸에 잘리지 않게 한다 */
export function useTip() {
  const [tip, setTip] = useState<Tip>(null);

  const bind = useCallback(
    (text: string) => ({
      onMouseEnter: (event: React.MouseEvent<HTMLElement>) => show(event.currentTarget, text),
      onFocus: (event: React.FocusEvent<HTMLElement>) => show(event.currentTarget, text),
      onMouseLeave: () => setTip(null),
      onBlur: () => setTip(null),
      "aria-label": text,
    }),
    [],
  );

  function show(target: HTMLElement, text: string) {
    const rect = target.getBoundingClientRect();
    const below = rect.top < 140;
    setTip({ text, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : rect.top - 8, below });
  }

  const node = tip ? (
    <div
      className={`content-tip${tip.below ? " is-below" : ""}`}
      role="tooltip"
      style={{
        left: Math.min(Math.max(tip.x, 150), (typeof window === "undefined" ? 1200 : window.innerWidth) - 150),
        top: tip.y,
      }}
    >
      {tip.text}
    </div>
  ) : null;

  return { bind, node };
}
