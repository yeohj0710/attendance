"use client";

import { useEffect, useRef, useState } from "react";
import { TaskText } from "@/components/employee/TaskText";

/**
 * 콘텐츠팀 캘린더(public/content/daily.html, 같은 출처)의 오늘 할 일을 출퇴근기록부 업무일지에 진짜 업무로 넣는다.
 *
 * 보이지 않는 창으로 캘린더를 ?embed=data 로 열면 캘린더가 오늘 할 일 목록을 보내 준다.
 * 일지에 없는 게 있거나 설명이 바뀌었으면 /api/work-log/calendar 를 한 번 불러 맞춘다.
 * 넣고 나면 보통 업무와 똑같이 드래그, 고치기, 지우기, 이월이 된다.
 * 체크는 양쪽에 남는다: 여기서 체크하면 sendCalendarToggle 로 캘린더에도 보내고,
 * 캘린더에서 끝낸 일은 다음 동기화 때 여기도 끝냄으로 바뀐다.
 * 메시지 모양은 public/content/daily.js 의 sendTasks 와 맞춘다.
 */
const CALENDAR_URL = process.env.NEXT_PUBLIC_CONTENT_CALENDAR_URL ?? "/content";
/* 261008 캘린더를 출퇴근기록부 안으로 옮겨서 보통은 같은 출처다 */
function calendarOrigin() {
  return new URL(CALENDAR_URL, window.location.href).origin;
}
const FRAME_ATTR = "data-content-calendar";

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

export function contentCalendarUrl(who: string) {
  return `${CALENDAR_URL}/daily.html#${who}`;
}

type CalendarItem = {
  key: string;
  kind: string;
  title: string;
  note: string;
  /** 걸리는 시간 (캘린더 daily.js itemData 의 min) */
  min?: string;
  done: boolean;
};
type CalendarDay = { d: string; label: string; items: CalendarItem[] };
type CalendarData = { who: string; today: CalendarDay; upcoming: CalendarDay[]; url: string };

/** 앞날 할 일 미리보기용 (출퇴근기록부 날짜 넘기기에서 쓴다) */
export type UpcomingCalendarDay = { date: string; items: Array<{ key: string; kind: string; title: string; note: string; min: string }> };

export type CalendarImportItem = { key: string; text: string; label: string; note: string; min: string; done: boolean };

type SyncTask = { calKey?: string; calLabel?: string; calMin?: string; note?: string; done: boolean; text: string };
type SyncLog = { workDate: string; tasks: SyncTask[]; calImported?: string[] };

/* 여기서 막 체크한 키. 캘린더가 아직 옛 상태를 보내도 되돌리지 않게 잠깐 기억한다. */
const recentToggles = new Map<string, number>();
const TOGGLE_GRACE_MS = 60_000;

function isRecentlyToggled(key: string) {
  const at = recentToggles.get(key);
  return at !== undefined && Date.now() - at < TOGGLE_GRACE_MS;
}

/** 출퇴근기록부에서 캘린더 업무를 체크하면 캘린더 저장소에도 남긴다. */
export function sendCalendarToggle(key: string, done: boolean) {
  recentToggles.set(key, Date.now());
  const frame = document.querySelector<HTMLIFrameElement>(`iframe[${FRAME_ATTR}]`);
  frame?.contentWindow?.postMessage({ source: "attendance", type: "toggle", key, done }, calendarOrigin());
}

function useCalendarData(who: string | null) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [data, setData] = useState<CalendarData | null>(null);

  useEffect(() => {
    setData(null);
    if (!who) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== calendarOrigin()) return;
      const msg = event.data as (CalendarData & { source?: string; type?: string }) | null;
      if (!msg || msg.source !== "content-calendar" || msg.type !== "tasks" || msg.who !== who) return;
      setData({ who: msg.who, today: msg.today, upcoming: msg.upcoming ?? [], url: msg.url });
    }

    /* 창을 다시 볼 때 캘린더에서 바뀐 것 받아 오기 */
    function handleFocus() {
      frameRef.current?.contentWindow?.postMessage({ source: "attendance", type: "refresh" }, calendarOrigin());
    }

    window.addEventListener("message", handleMessage);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("focus", handleFocus);
    };
  }, [who]);

  const frame = who ? (
    <iframe
      aria-hidden="true"
      className="pointer-events-none absolute h-px w-px opacity-0"
      key={who}
      ref={frameRef}
      src={`${CALENDAR_URL}/daily.html?embed=data&who=${who}`}
      tabIndex={-1}
      title="콘텐츠팀 캘린더 데이터"
      {...{ [FRAME_ATTR]: who }}
    />
  ) : null;

  return { data, frame };
}

/**
 * 콘텐츠팀 본인 화면에 숨어서 캘린더와 일지를 맞춘다. 화면에는 아무것도 그리지 않는다.
 * 바뀐 게 없으면 서버를 부르지 않는다.
 */
export function ContentCalendarSync({
  who,
  workLog,
  onImport,
  onUpcoming,
}: {
  who: string | null;
  workLog: SyncLog | null;
  onImport: (items: CalendarImportItem[], keyPrefix: string) => Promise<void>;
  /** 캘린더의 다음 출근일 5일치. 날짜 넘기기에서 앞날 할 일을 보여 줄 때 쓴다. */
  onUpcoming?: (days: UpcomingCalendarDay[]) => void;
}) {
  const { data, frame } = useCalendarData(who);
  const lastSentRef = useRef("");
  const busyRef = useRef(false);
  const onImportRef = useRef(onImport);
  onImportRef.current = onImport;
  const onUpcomingRef = useRef(onUpcoming);
  onUpcomingRef.current = onUpcoming;

  useEffect(() => {
    if (!data || !workLog) return;
    const year = workLog.workDate.slice(0, 4);
    onUpcomingRef.current?.(
      data.upcoming.map((day) => ({
        // 캘린더는 MM-DD 로 준다. 연말을 넘기면 다음 해로.
        date: `${day.d < data.today.d ? Number(year) + 1 : year}-${day.d}`,
        items: day.items.map((item) => ({ key: item.key, kind: item.kind, title: item.title, note: item.note, min: item.min ?? "" })),
      })),
    );
  }, [data, workLog?.workDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!who || !data || !workLog || busyRef.current) return;
    // 캘린더의 오늘(MM-DD)과 일지 날짜가 같을 때만 맞춘다. 자정 무렵 어긋남 방지.
    if (workLog.workDate.slice(5) !== data.today.d) return;

    const items = data.today.items.map((item) => ({
      key: item.key,
      text: item.title,
      label: item.kind,
      note: item.note,
      min: item.min ?? "",
      done: item.done,
    }));
    const byKey = new Map(workLog.tasks.filter((task) => task.calKey).map((task) => [task.calKey, task]));
    const imported = new Set(workLog.calImported ?? []);
    const keyPrefix = items.length ? `${who}:${data.today.d}:` : "";
    const liveKeys = new Set(items.map((item) => item.key));

    // 여기서 끝냈는데 캘린더가 모르면 캘린더에 알려 준다 (서버 호출 아님).
    for (const task of workLog.tasks) {
      if (task.calKey && task.done && liveKeys.has(task.calKey) && !isRecentlyToggled(task.calKey)) {
        const item = items.find((x) => x.key === task.calKey);
        if (item && !item.done) sendCalendarToggle(task.calKey, true);
      }
    }

    const needsImport =
      items.some((item) => {
        const task = byKey.get(item.key);
        if (!task) return !imported.has(item.key);
        return (
          (item.done && !task.done && !isRecentlyToggled(item.key)) ||
          (task.note ?? "") !== item.note ||
          (task.calLabel ?? "") !== item.label ||
          (task.calMin ?? "") !== item.min
        );
      }) ||
      (keyPrefix !== "" &&
        workLog.tasks.some((task) => task.calKey?.startsWith(keyPrefix) && !task.done && !liveKeys.has(task.calKey)));
    if (!needsImport) return;

    const sent = items.map((item) => ({ ...item, done: item.done && !isRecentlyToggled(item.key) }));
    const signature = JSON.stringify([workLog.workDate, sent, keyPrefix]);
    if (signature === lastSentRef.current) return;
    lastSentRef.current = signature;
    busyRef.current = true;
    void onImportRef.current(sent, keyPrefix).finally(() => {
      busyRef.current = false;
    });
  }, [data, who, workLog]);

  return frame ? <div className="relative">{frame}</div> : null;
}

/** 관리자: 네 분 중 골라서 그분 캘린더 할 일을 보기만 한다 (일지에는 안 넣는다) */
export function ContentTeamPreview() {
  const [picked, setPicked] = useState("kim");
  const { data, frame } = useCalendarData(picked);

  return (
    <div className="maple-quest mt-5">
      {frame}
      <div className="maple-quest-head flex-wrap">
        <span className="maple-quest-title">콘텐츠팀 화면 미리보기</span>
        <select
          aria-label="미리 볼 사람"
          className="rounded border border-line bg-white px-1.5 py-0.5 text-xs text-ink"
          onChange={(event) => setPicked(event.target.value)}
          value={picked}
        >
          {Object.entries(CONTENT_TEAM).map(([label, key]) => (
            <option key={key} value={key}>
              {key === "lee" ? `${label}님` : `${label} PD님`}
            </option>
          ))}
        </select>
        <a
          className="maple-quest-link"
          href={contentCalendarUrl(picked)}
          rel="noopener noreferrer"
          target="_blank"
        >
          콘텐츠팀 캘린더
        </a>
      </div>
      <div className="space-y-2 p-[14px]">
        {!data ? <p className="text-xs text-muted">불러오는 중</p> : null}
        {data?.today.items.map((item) => (
          <div
            className="quest-row relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-line bg-white px-3 py-2 text-sm"
            key={item.key}
          >
            <input checked={item.done} className="h-4 w-4 accent-accent" disabled readOnly type="checkbox" />
            <div className="min-w-0">
              <TaskText done={item.done} label={item.kind} note={item.note} text={item.title} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
