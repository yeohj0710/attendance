"use client";

import { useState } from "react";
import { ContentShell, useTip } from "@/components/content/ContentShell";
import { formatClock, formatMonthDay, useContentData, weekdayLabel } from "@/components/content/useContentData";
import type { ScheduleData, ScheduleEvent } from "@/lib/content-schedule";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const AGENDA_DAYS = 14;

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function shiftMonth(key: string, delta: number) {
  const d = new Date(`${key}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
}

/** 제목 끝에 붙여 쓴 시각은 앞으로 빼서 보여준다 */
function plainTitle(event: ScheduleEvent) {
  return event.title.replace(/\s*\b([01]?\d|2[0-3]):[0-5]\d\b\s*/, " ").trim();
}

function eventTip(event: ScheduleEvent) {
  const when = event.end
    ? `${formatMonthDay(event.start)} (${weekdayLabel(event.start)})부터 ${formatMonthDay(event.end)} (${weekdayLabel(event.end)})까지`
    : `${formatMonthDay(event.start)} (${weekdayLabel(event.start)})${event.time ? ` ${event.time}` : ""}`;
  const lines = [`${when} ${plainTitle(event)}`];
  if (event.place) lines.push(`장소: ${event.place}`);
  if (event.people.length) lines.push(`담당: ${event.people.join(", ")}`);
  lines.push("누르면 노션 페이지를 열어요.");
  return lines.join("\n");
}

function covers(event: ScheduleEvent, date: string) {
  return event.end ? event.start <= date && date <= event.end : event.start === date;
}

export function ScheduleCalendar() {
  const state = useContentData<ScheduleData>("/api/content-board/schedule");
  return (
    <ContentShell active="/content-board/schedule" state={state}>
      {(data) => <Calendar data={data} />}
    </ContentShell>
  );
}

function Calendar({ data }: { data: ScheduleData }) {
  const [month, setMonth] = useState(monthKey(data.today));
  const { bind, node } = useTip();
  const canPrev = shiftMonth(month, -1) >= monthKey(data.from);
  const canNext = shiftMonth(month, 1) <= monthKey(data.to);

  const first = `${month}-01`;
  const gridStart = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
  const lastOfMonth = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const gridEnd = addDays(lastOfMonth, 6 - new Date(`${lastOfMonth}T00:00:00Z`).getUTCDay());
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const agendaEnd = addDays(data.today, AGENDA_DAYS - 1);
  const agenda = data.events.filter((e) => (e.end ?? e.start) >= data.today && e.start <= agendaEnd);

  return (
    <>
      <section className="content-card">
        <header className="content-head">
          <div>
            <h1 className="content-title">회사 일정 달력</h1>
            <p className="content-sub">노션 「일정」 캘린더를 그대로 읽어 와요. 고치는 건 노션에서 해 주세요.</p>
          </div>
          <div className="content-head-side">
            <span className="content-fresh" {...bind("노션 일정을 5분마다 다시 읽어요.")}>
              노션 {formatClock(data.fetchedAt)} 기준
            </span>
            <a className="content-link" href={data.notionUrl} rel="noopener noreferrer" target="_blank">
              노션에서 열기
            </a>
          </div>
        </header>

        <div className="cal-bar">
          <button disabled={!canPrev} onClick={() => setMonth(shiftMonth(month, -1))} type="button" aria-label="지난달">
            ‹
          </button>
          <strong>
            {month.slice(0, 4)}년 {Number(month.slice(5, 7))}월
          </strong>
          <button disabled={!canNext} onClick={() => setMonth(shiftMonth(month, 1))} type="button" aria-label="다음 달">
            ›
          </button>
          {month !== monthKey(data.today) ? (
            <button className="cal-today" onClick={() => setMonth(monthKey(data.today))} type="button">
              오늘
            </button>
          ) : null}
        </div>

        <div className="cal-grid">
          {DOW.map((d, i) => (
            <div className={`cal-dow${i === 0 ? " is-sun" : ""}${i === 6 ? " is-sat" : ""}`} key={d}>
              {d}
            </div>
          ))}
          {days.map((date) => {
            const events = data.events.filter((e) => covers(e, date));
            const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
            const outside = monthKey(date) !== month;
            return (
              <div
                className={`cal-day${outside ? " is-outside" : ""}${date === data.today ? " is-today" : ""}${dow === 0 ? " is-sun" : ""}${dow === 6 ? " is-sat" : ""}`}
                key={date}
              >
                <span className="cal-num">{Number(date.slice(8, 10))}</span>
                {events.map((event) => (
                  <a
                    className={`cal-event${event.title.includes("촬영") ? " is-shoot" : ""}`}
                    href={event.url}
                    key={event.id}
                    rel="noopener noreferrer"
                    target="_blank"
                    {...bind(eventTip(event))}
                  >
                    {event.time ? <b>{event.time}</b> : null}
                    {plainTitle(event)}
                  </a>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="content-card">
        <h2 className="content-section-title">앞으로 2주 일정</h2>
        {agenda.length ? (
          <ul className="cal-agenda">
            {agenda.map((event) => (
              <li key={event.id}>
                <span className="cal-agenda-date">
                  {formatMonthDay(event.start)} ({weekdayLabel(event.start)})
                </span>
                <span className="cal-agenda-time">{event.time}</span>
                <a
                  className={event.title.includes("촬영") ? "is-shoot" : ""}
                  href={event.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {plainTitle(event)}
                  {event.end ? ` (${formatMonthDay(event.end)}까지)` : ""}
                </a>
                <span className="cal-agenda-people">{[event.place, event.people.join(", ")].filter(Boolean).join(", ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="content-sub">앞으로 2주 동안 잡힌 일정이 없어요.</p>
        )}
      </section>
      {node}
    </>
  );
}
