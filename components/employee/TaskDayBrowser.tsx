"use client";

import { useEffect, useState } from "react";
import { TaskText } from "@/components/employee/TaskText";
import type { UpcomingCalendarDay } from "@/components/employee/ContentTeamToday";

/**
 * 오늘 할 일 칸에서 다른 날짜를 넘겨 보는 부분.
 * - 지난 날: 그날 업무일지를 읽어 보여 준다(보기만). 일지가 없던 날은 "기록 없음".
 * - 앞날: 콘텐츠팀이면 캘린더에 미리 잡힌 일을 보여 준다(보기만). 앞날 일지는 만들지 않는다
 *   (앞날 일지를 미리 만들면 못 끝낸 일 넘기기가 막힌다).
 */
const PAST_LIMIT_DAYS = 30;
const FUTURE_LIMIT_DAYS = 21;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type DayTask = { id: string; text: string; done: boolean; calLabel?: string; calMin?: string; note?: string };
type DayLog = { tasks: DayTask[]; createdAt: string | null } | null;

export function shiftDate(date: string, days: number) {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function dayLabel(date: string, today: string) {
  const t = new Date(`${date}T00:00:00Z`);
  const base = `${t.getUTCMonth() + 1}/${t.getUTCDate()} (${WEEKDAYS[t.getUTCDay()]})`;
  if (date === today) return `${base} 오늘`;
  if (date === shiftDate(today, -1)) return `${base} 어제`;
  if (date === shiftDate(today, 1)) return `${base} 내일`;
  return base;
}

export function TaskDayNav({
  today,
  viewDate,
  onChange,
}: {
  today: string;
  viewDate: string;
  onChange: (date: string) => void;
}) {
  const canPrev = viewDate > shiftDate(today, -PAST_LIMIT_DAYS);
  const canNext = viewDate < shiftDate(today, FUTURE_LIMIT_DAYS);
  const button = "rounded px-2 py-0.5 text-base font-bold text-muted hover:bg-field hover:text-ink disabled:opacity-30";

  return (
    <div className="flex items-center gap-1 text-sm">
      <button aria-label="전날" className={button} disabled={!canPrev} onClick={() => onChange(shiftDate(viewDate, -1))} type="button">
        ‹
      </button>
      <span className={`min-w-[7.5rem] text-center font-bold ${viewDate === today ? "text-ink" : "text-accent"}`}>
        {dayLabel(viewDate, today)}
      </span>
      <button aria-label="다음 날" className={button} disabled={!canNext} onClick={() => onChange(shiftDate(viewDate, 1))} type="button">
        ›
      </button>
      {viewDate !== today ? (
        <button className="ml-auto text-xs font-bold text-accent hover:underline" onClick={() => onChange(today)} type="button">
          오늘로
        </button>
      ) : null}
    </div>
  );
}

export function OtherDayTasks({
  date,
  today,
  loadLog,
  upcoming,
}: {
  date: string;
  today: string;
  loadLog: (date: string) => Promise<DayLog>;
  upcoming: UpcomingCalendarDay[] | null;
}) {
  const [log, setLog] = useState<DayLog | undefined>(undefined);
  const isPast = date < today;

  useEffect(() => {
    if (!isPast) return;
    let alive = true;
    setLog(undefined);
    loadLog(date)
      .then((result) => alive && setLog(result))
      .catch(() => alive && setLog(null));
    return () => {
      alive = false;
    };
  }, [date, isPast, loadLog]);

  const rows: DayTask[] | null = isPast
    ? log === undefined
      ? null
      : log && log.createdAt
        ? log.tasks
        : []
    : (upcoming?.find((day) => day.date === date)?.items ?? []).map((item) => ({
        id: item.key,
        text: item.title,
        done: false,
        calLabel: item.kind,
        calMin: item.min,
        note: item.note,
      }));

  if (rows === null) {
    return <p className="py-3 text-center text-sm text-muted">불러오는 중</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        {isPast ? "지난 날 기록이에요. 여기서는 보기만 돼요." : "미리 잡힌 일이에요. 그날이 되면 오늘 할 일로 들어와요."}
      </p>
      {rows.length ? (
        rows.map((task) => (
          <div
            className={`quest-row${task.done ? " is-done" : ""} relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-line bg-white px-3 py-2 text-sm`}
            key={task.id}
          >
            <input aria-label="했음" checked={task.done} className="h-4 w-4" disabled readOnly type="checkbox" />
            <div className="min-w-0">
              <TaskText done={task.done} label={task.calLabel} minutes={task.calMin} note={task.note} text={task.text} />
            </div>
          </div>
        ))
      ) : (
        <p className="rounded border border-line bg-white/70 px-3 py-4 text-center text-sm text-muted">
          {isPast ? "이날은 적힌 업무가 없어요." : "이날 미리 잡힌 일은 없어요. 그날이 되면 여기서 적어요."}
        </p>
      )}
    </div>
  );
}
