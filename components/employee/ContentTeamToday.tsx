"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 콘텐츠팀 할 일을 출퇴근기록부의 "오늘 할 일 / 한 일" 목록에 같은 모양으로 섞어 보여 준다.
 *
 * 할 일을 계산하고 체크를 저장하는 곳은 콘텐츠팀 캘린더(별도 사이트) 하나뿐이다.
 * 여기서는 보이지 않는 창으로 캘린더를 ?embed=data 로 열어 오늘, 다음 출근일 할 일을 받아 그리고,
 * 체크하면 그 창에 돌려보내 캘린더 저장소에 남긴다. 그래서 캘린더에서 고친 것도 그대로 따라온다.
 * 출퇴근기록부의 할 일, 일지, Firestore 는 건드리지 않는다.
 * 계약(메시지 모양)은 C:\dev\pharmacist-mcn-structure\dist\daily.js 의 sendTasks 와 맞춘다.
 */
const CALENDAR_URL =
  process.env.NEXT_PUBLIC_CONTENT_CALENDAR_URL ?? "https://pharmacist-mcn-structure.vercel.app";
const CALENDAR_ORIGIN = new URL(CALENDAR_URL).origin;

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

type CalendarItem = {
  key: string;
  kind: string;
  k: string;
  title: string;
  tag: string;
  min: string;
  sub: string;
  steps: string[];
  ref: string;
  moved: string;
  links: { t: string; href: string }[];
  done: boolean;
};
type CalendarDay = { d: string; label: string; work: boolean; items: CalendarItem[] };
type CalendarData = { who: string; today: CalendarDay; next: CalendarDay; url: string };

const KIND_TONE: Record<string, string> = {
  todo: "text-danger",
  gap: "text-danger",
  due: "text-warn",
  shoot: "text-accent",
  up: "text-accent",
  mirror: "text-accent",
};

function useContentCalendar(who: string | null) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [data, setData] = useState<CalendarData | null>(null);

  useEffect(() => {
    setData(null);
    if (!who) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== CALENDAR_ORIGIN) return;
      const msg = event.data as (CalendarData & { source?: string; type?: string }) | null;
      if (!msg || msg.source !== "content-calendar" || msg.type !== "tasks" || msg.who !== who) return;
      setData({ who: msg.who, today: msg.today, next: msg.next, url: msg.url });
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [who]);

  const send = useCallback((message: Record<string, unknown>) => {
    frameRef.current?.contentWindow?.postMessage({ source: "attendance", ...message }, CALENDAR_ORIGIN);
  }, []);

  const toggle = useCallback(
    (key: string, done: boolean) => {
      setData((prev) => {
        if (!prev) return prev;
        const flip = (day: CalendarDay) => ({
          ...day,
          items: day.items.map((item) => (item.key === key ? { ...item, done } : item)),
        });
        return { ...prev, today: flip(prev.today), next: flip(prev.next) };
      });
      send({ type: "toggle", key, done });
    },
    [send],
  );

  /* 창을 다시 볼 때 캘린더에서 바뀐 것 받아 오기 */
  useEffect(() => {
    if (!who) return;
    const onFocus = () => send({ type: "refresh" });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [send, who]);

  const frame = who ? (
    <iframe
      aria-hidden="true"
      className="pointer-events-none absolute h-px w-px opacity-0"
      key={who}
      ref={frameRef}
      src={`${CALENDAR_URL}/daily.html?embed=data&who=${who}`}
      tabIndex={-1}
      title="콘텐츠팀 캘린더 데이터"
    />
  ) : null;

  return { data, frame, toggle };
}

function CalendarRow({
  item,
  onToggle,
  readOnly,
}: {
  item: CalendarItem;
  onToggle: (key: string, done: boolean) => void;
  readOnly: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasMore = Boolean(item.sub || item.steps.length || item.ref || item.links.length || item.moved);
  const tone = item.done ? "text-muted" : KIND_TONE[item.k] ?? "text-muted";

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded border border-line bg-white px-3 py-2 text-sm">
      <div className="flex items-center gap-2 pt-0.5">
        <span aria-hidden="true" className="w-5" />
        <input
          aria-label={`${item.title} 했음`}
          checked={item.done}
          className="h-4 w-4 accent-accent"
          disabled={readOnly}
          onChange={(event) => onToggle(item.key, event.target.checked)}
          type="checkbox"
        />
      </div>
      <div className="min-w-0">
        <button
          className={`block w-full text-left ${hasMore ? "cursor-pointer" : "cursor-default"}`}
          onClick={() => hasMore && setOpen((v) => !v)}
          title={hasMore ? "눌러서 하는 방법 보기" : undefined}
          type="button"
        >
          <span className={`block text-[11px] font-semibold ${tone}`}>
            {item.kind}
            {item.tag ? ` ${item.tag}` : ""}
          </span>
          <span
            className={`block whitespace-pre-wrap break-words leading-relaxed ${
              item.done ? "text-muted line-through" : item.k === "gap" ? "font-semibold text-danger" : "text-ink"
            }`}
          >
            {item.title}
          </span>
        </button>
        {open ? (
          <div className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-muted">
            {item.sub ? <p>{item.sub}</p> : null}
            {item.steps.length ? (
              <ol className="list-decimal space-y-0.5 pl-4">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            {item.ref ? <p className="break-all">{item.ref}</p> : null}
            {item.links.map((link) => (
              <a
                className="mr-2 font-semibold text-accent hover:underline"
                href={link.href}
                key={link.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {link.t || "링크"}
              </a>
            ))}
            {item.moved ? <p>{item.moved}에서 옮긴 일</p> : null}
          </div>
        ) : null}
      </div>
      <span className="whitespace-nowrap pt-0.5 text-xs text-muted">{item.min}</span>
    </div>
  );
}

function CalendarList({
  data,
  onToggle,
  readOnly,
}: {
  data: CalendarData | null;
  onToggle: (key: string, done: boolean) => void;
  readOnly: boolean;
}) {
  const [showNext, setShowNext] = useState(false);

  if (!data) {
    return <p className="px-1 text-xs text-muted">콘텐츠팀 할 일을 불러오는 중</p>;
  }

  const next = data.next;
  return (
    <div className="space-y-2">
      {data.today.items.map((item) => (
        <CalendarRow item={item} key={item.key} onToggle={onToggle} readOnly={readOnly} />
      ))}
      {showNext ? (
        <>
          <p className="pt-1 text-xs font-bold text-muted">다음 출근일 {next.label}</p>
          {next.items.length ? (
            next.items.map((item) => (
              <CalendarRow item={item} key={item.key} onToggle={onToggle} readOnly={readOnly} />
            ))
          ) : (
            <p className="text-xs text-muted">잡힌 일 없음</p>
          )}
        </>
      ) : null}
      <div className="flex items-center gap-3 px-1 text-xs font-semibold">
        <button className="text-accent hover:underline" onClick={() => setShowNext((v) => !v)} type="button">
          {showNext ? "다음 출근일 접기" : `다음 출근일(${next.label}) ${next.items.length}개 보기`}
        </button>
        <a className="ml-auto text-muted hover:text-accent" href={data.url} rel="noopener noreferrer" target="_blank">
          콘텐츠팀 캘린더에서 고치기
        </a>
      </div>
    </div>
  );
}

/** 콘텐츠팀 본인: 오늘 할 일 목록 맨 위에 섞어 넣는다 */
export function ContentCalendarTasks({ who }: { who: string | null }) {
  const { data, frame, toggle } = useContentCalendar(who);
  if (!who) return null;
  return (
    <div className="relative">
      {frame}
      <CalendarList data={data} onToggle={toggle} readOnly={false} />
    </div>
  );
}

/** 관리자: 네 분 중 골라서 그분 목록을 보기만 한다 */
export function ContentTeamPreview() {
  const [picked, setPicked] = useState("kim");
  const { data, frame, toggle } = useContentCalendar(picked);

  return (
    <div className="relative mt-5 rounded border border-line bg-field/60">
      {frame}
      <div className="flex flex-wrap items-center gap-2 px-3 py-3">
        <span className="text-sm font-bold text-ink">콘텐츠팀 화면 미리보기</span>
        <select
          aria-label="미리 볼 사람"
          className="rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink"
          onChange={(event) => setPicked(event.target.value)}
          value={picked}
        >
          {Object.entries(CONTENT_TEAM).map(([label, key]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="border-t border-line px-3 pb-3 pt-3">
        <CalendarList data={data} onToggle={toggle} readOnly />
      </div>
    </div>
  );
}
