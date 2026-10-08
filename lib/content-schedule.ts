import { unstable_cache } from "next/cache";
import { addDays, kstToday, propDate, propPeople, propText, queryNotionDatabase } from "@/lib/notion";

/**
 * 노션 왼쪽 「일정」 캘린더를 업무 시스템 달력(/content-board/schedule)으로 보여준다.
 * 노션 「일정 보기」(3c83b1f9b9ae80449f37d2739608fec6)는 이 DB를 보여주는 보기라 데이터 원본은 하나다
 * (collection://5ca2d15f-9b3e-4bee-8620-74beb77a0b0f). 데이터는 옮기지 않고 5분에 한 번 읽기만 한다.
 */
export const SCHEDULE_DATABASE_ID = "1533b1f9b9ae800bb0dbc264b47ae6d0";
export const SCHEDULE_NOTION_URL = "https://www.notion.so/3c83b1f9b9ae80449f37d2739608fec6";

const CACHE_SECONDS = 300;
/* 지난달 1일부터 석 달 뒤까지만 읽는다 */
const PAST_DAYS = 45;
const FUTURE_DAYS = 120;

export type ScheduleEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  /** 시각이 있는 일정이면 HH:MM */
  time: string;
  place: string;
  people: string[];
  url: string;
};

export type ScheduleData = {
  today: string;
  from: string;
  to: string;
  fetchedAt: string;
  notionUrl: string;
  events: ScheduleEvent[];
};

function timeOf(start: string, title: string) {
  if (start.length > 10) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(start));
  }
  return title.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0]?.padStart(5, "0") ?? "";
}

function kstDate(value: string) {
  return value.length > 10 ? kstToday(new Date(value)) : value;
}

async function loadSchedule(): Promise<ScheduleData> {
  const today = kstToday();
  const from = addDays(today, -PAST_DAYS);
  const to = addDays(today, FUTURE_DAYS);
  const pages = await queryNotionDatabase(SCHEDULE_DATABASE_ID, {
    and: [
      { property: "날짜", date: { on_or_after: from } },
      { property: "날짜", date: { on_or_before: to } },
    ],
  });

  const events: ScheduleEvent[] = [];
  for (const page of pages) {
    const date = propDate(page, "날짜");
    if (!date) continue;
    const title = propText(page, "이름");
    if (!title) continue;
    const start = kstDate(date.start);
    const end = date.end ? kstDate(date.end) : null;
    events.push({
      id: page.id,
      title,
      start,
      end: end && end > start ? end : null,
      time: timeOf(date.start, title),
      place: propText(page, "장소"),
      people: propPeople(page, "담당자"),
      url: page.url,
    });
  }
  events.sort((a, b) => a.start.localeCompare(b.start) || (a.time || "99").localeCompare(b.time || "99"));

  return { today, from, to, fetchedAt: new Date().toISOString(), notionUrl: SCHEDULE_NOTION_URL, events };
}

export const getScheduleData = unstable_cache(loadSchedule, ["content-schedule-v1"], {
  revalidate: CACHE_SECONDS,
});
