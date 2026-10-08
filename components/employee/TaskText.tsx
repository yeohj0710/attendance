"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 업무 한 줄의 글 부분. 직접 적은 업무와 콘텐츠팀 캘린더에서 들어온 업무가 같은 모양으로 보인다.
 * - 캘린더 업무는 글 앞에 종류(인수인계, 마감 등)를 둥근 라벨로 붙여 한 줄에 넣는다.
 * - 글은 한 줄로 보이고, 넘치는 줄은 글을 누르면 펼쳐진다("접기"로 닫음).
 * - 설명(note)이 있으면 마우스를 올렸을 때 줄 아래에 설명창이 뜬다. 터치 화면은 글을 누르면 뜬다.
 * 모양은 app/maple-quest.css 의 quest-chip, quest-tip.
 */
const CHIP_CLASS: Record<string, string> = {
  인수인계: "quest-chip-hand",
  "할 일": "quest-chip-hand",
  "빈 날": "quest-chip-gap",
  마감: "quest-chip-due",
  촬영: "quest-chip-due",
  업로드: "quest-chip-up",
  예약: "quest-chip-up",
  편집: "quest-chip-up",
  루틴: "quest-chip-routine",
  확인: "quest-chip-routine",
};

export function TaskText({
  done,
  label,
  minutes,
  note,
  text,
  children,
}: {
  done: boolean;
  label?: string;
  /** 걸리는 시간. 줄 오른쪽 끝에 회색 작은 글씨로 */
  minutes?: string;
  note?: string;
  text: string;
  /** 링크를 살려 그리는 글 (없으면 text 그대로) */
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const canHoverRef = useRef(false);
  // 설명창은 줄 밖(body)에 띄운다. 줄 안에 두면 끝낸 줄의 흐림(opacity)을 같이 먹고, 아래 줄들이 위에 겹쳐 그려졌다.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tipStyle, setTipStyle] = useState<CSSProperties | null>(null);

  function place() {
    const anchor = (wrapRef.current?.closest(".quest-row, [data-task-row], li") as HTMLElement | null) ?? wrapRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const below = r.bottom < window.innerHeight * 0.6;
    setTipStyle({
      position: "fixed",
      zIndex: 1000,
      left: r.left + 10,
      right: "auto",
      width: Math.max(220, r.width - 20),
      ...(below
        ? { top: r.bottom + 6, bottom: "auto", maxHeight: window.innerHeight - r.bottom - 16 }
        : { top: "auto", bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 16 }),
    });
  }

  useEffect(() => {
    if (!showNote) return;
    const hide = () => setShowNote(false);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [showNote]);

  /* 한 줄에 다 안 들어가는지 잰다. 폭이 바뀌면 다시 잰다. */
  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  useEffect(() => {
    canHoverRef.current = window.matchMedia?.("(hover: hover)").matches ?? false;
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function open() {
    if (!note || !canHoverRef.current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      place();
      setShowNote(true);
    }, 220);
  }

  function close() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setShowNote(false), 120);
  }

  return (
    <div onMouseEnter={open} onMouseLeave={close} ref={wrapRef}>
      <div className="flex items-baseline gap-2">
      <span
        className={`min-w-0 flex-1 break-words leading-relaxed ${expanded ? "block whitespace-pre-wrap" : "line-clamp-1"} ${
          done ? "text-muted line-through" : label === "빈 날" ? "font-bold text-danger" : "text-ink"
        } ${overflows && !expanded ? "cursor-pointer" : note ? "cursor-help" : ""}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) return;
          if (note && !canHoverRef.current) {
            place();
            setShowNote((v) => !v);
          }
          else if (overflows && !expanded) setExpanded(true);
        }}
        ref={textRef}
        title={overflows && !expanded ? "눌러서 펼치기" : undefined}
      >
        {label ? (
          <span className={`quest-chip ${done ? "quest-chip-done" : CHIP_CLASS[label] ?? "quest-chip-etc"}`}>{label}</span>
        ) : null}
        {children ?? text}
      </span>
      {minutes ? <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted">{minutes}</span> : null}
      </div>
      {expanded ? (
        <button
          className="mt-0.5 text-xs font-bold text-accent hover:underline"
          onClick={() => setExpanded(false)}
          type="button"
        >
          접기
        </button>
      ) : null}
      {note && showNote && tipStyle
        ? createPortal(
            <QuestTip
              note={note}
              onMouseEnter={() => timerRef.current && window.clearTimeout(timerRef.current)}
              onMouseLeave={close}
              style={tipStyle}
              title={text}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

/* 설명을 빈 줄로 나눠 칸마다 구분선을 긋는다. "하는 순서"는 하늘색, 걸리는 시간은 연두색. */
function QuestTip({
  note,
  title,
  style,
  onMouseEnter,
  onMouseLeave,
}: {
  note: string;
  title: string;
  style: CSSProperties;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const parts = note
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const heading = title.split("\n")[0].slice(0, 80);

  return (
    <div className="quest-tip" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} role="tooltip" style={style}>
      <p className="quest-tip-title">{heading}</p>
      {parts.map((part, index) => {
        if (part.startsWith("하는 순서")) {
          return (
            <div className="quest-tip-part" key={index}>
              <span className="quest-tip-sec">하는 순서</span>
              {part.slice("하는 순서".length)}
            </div>
          );
        }
        if (/(걸립니다|걸려요)\.?$/.test(part)) {
          return (
            <div className="quest-tip-part quest-tip-time" key={index}>
              {part}
            </div>
          );
        }
        return (
          <div className="quest-tip-part" key={index}>
            {part}
          </div>
        );
      })}
    </div>
  );
}
