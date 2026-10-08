"use client";

import { useEffect, useRef, useState } from "react";
import { Board } from "@/components/content/PipelineBoard";
import { PipelineSummary } from "@/components/content/PipelineHomeCard";
import { useContentData } from "@/components/content/useContentData";
import type { PipelineData } from "@/lib/content-pipeline";
import "@/app/content-board/content.css";
import "./pipeline-card.css";

/**
 * 업무 시스템 첫 화면의 콘텐츠팀 카드. 다른 화면으로 넘어가지 않고 토글로 바꿔 본다.
 * - 내 채널(관리자는 급한 채널): 담당 계정 요약
 * - 전체 채널: 채널 현황판 본문(/content-board/pipeline 과 같은 것)
 * - 회사 일정: /schedule?embed=1 (캘린더 이사 세션 화면을 그대로 끼움)
 * - 할 일 달력: /content/daily.html (같은 출처)
 * 사용량: 카드가 화면 가까이 와야 채널 데이터를 받고(노션 5분 캐시), 일정과 할 일 달력은 처음 펼칠 때만 불러온다.
 */
type Tab = "mine" | "all" | "schedule" | "todo";
const TAB_KEY = "attendance.contentHub.tab";

export function ContentHub({ who }: { who: string | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [tab, setTab] = useState<Tab | null>("mine");
  const [mounted, setMounted] = useState<Record<Tab, boolean>>({ mine: true, all: false, schedule: false, todo: false });
  const state = useContentData<PipelineData>("/api/content-board/pipeline", near && (tab === "mine" || tab === "all"));

  /* 마지막으로 본 토글을 기억한다 (이 브라우저에만) */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved === "closed") setTab(null);
      else if (saved === "mine" || saved === "all" || saved === "schedule" || saved === "todo") open(saved);
    } catch {
      /* 저장소를 못 쓰면 기본값 */
    }
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function open(next: Tab) {
    setMounted((m) => (m[next] ? m : { ...m, [next]: true }));
    setTab(next);
  }

  function choose(next: Tab) {
    const value = tab === next ? null : next;
    if (value) open(value);
    else setTab(null);
    try {
      localStorage.setItem(TAB_KEY, value ?? "closed");
    } catch {
      /* 무시 */
    }
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "mine", label: who ? "내 채널" : "급한 채널" },
    { key: "all", label: "전체 채널" },
    { key: "schedule", label: "회사 일정" },
    { key: "todo", label: "할 일 달력" },
  ];

  return (
    <div className="maple-quest mt-4 hub-card" ref={rootRef}>
      <div className="maple-quest-head hub-head">
        <span className="maple-quest-title">
          콘텐츠팀<small>BOARD</small>
        </span>
        <div className="hub-tabs" role="tablist" aria-label="콘텐츠팀 보기">
          {tabs.map((t) => (
            <button
              aria-selected={tab === t.key}
              className={tab === t.key ? "is-on" : ""}
              key={t.key}
              onClick={() => choose(t.key)}
              role="tab"
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "mine" || tab === "all" ? (
        state.kind === "ready" ? (
          tab === "mine" ? (
            <PipelineSummary data={state.data} onOpenAll={() => choose("all")} who={who} />
          ) : (
            <div className="hub-board">
              <Board data={state.data} embedded />
            </div>
          )
        ) : (
          <p className="pipe-card-empty">
            {state.kind === "error" ? `불러오지 못했어요. ${state.message}` : "노션에서 불러오는 중이에요."}
          </p>
        )
      ) : null}

      {mounted.schedule ? (
        <iframe
          className="hub-frame"
          hidden={tab !== "schedule"}
          loading="lazy"
          src="/schedule?embed=1"
          title="회사 일정"
        />
      ) : null}
      {mounted.todo ? (
        <iframe
          className="hub-frame"
          hidden={tab !== "todo"}
          loading="lazy"
          src={who ? `/content/daily.html#${who}` : "/content/daily.html"}
          title="콘텐츠팀 할 일 달력"
        />
      ) : null}
    </div>
  );
}
