import { NotionAccessError, propDate, propPeople, propText, queryNotionDatabase } from "@/lib/notion";
import type { NotionPage } from "@/lib/notion";
import { badRequest } from "@/lib/http";

/**
 * 회사 일정 달력(/schedule). 노션 메인 왼쪽 「일정」 DB 를 그대로 읽고 쓴다. 데이터를 옮기지 않으니 노션과 늘 같다.
 * 이 DB 의 칸: 이름(제목), 날짜, 장소, 담당자(사람), 정렬시간(숫자, 같은 날 안의 순서). 시각은 보통 제목 글자에 적는다("바로팜 미팅 10:00").
 * 쓰기는 이 DB 에 속한 페이지에만 한다(고치거나 지우기 전에 부모 DB 를 확인). 지우기는 노션 휴지통으로 보내기라 되살릴 수 있다.
 * lib/notion.ts 는 채널 현황판 세션의 읽기 도우미라 고치지 않고, 쓰기 호출은 이 파일에만 둔다.
 */
export const COMPANY_SCHEDULE_DB = "1533b1f9b9ae800bb0dbc264b47ae6d0";
const NOTION_VERSION = "2022-06-28";
const MAX_RANGE_DAYS = 70;

export type CompanyEvent = {
  id: string;
  title: string;
  /** YYYY-MM-DD (한국 날짜) */
  start: string;
  end: string | null;
  /** 날짜에 시각이 있으면 HH:MM */
  time: string;
  place: string;
  people: string[];
  order: number | null;
  url: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function kstDate(value: string) {
  if (value.length <= 10) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(value));
}

function kstTime(value: string) {
  if (value.length <= 10) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function toEvent(page: NotionPage): CompanyEvent | null {
  const date = propDate(page, "날짜");
  if (!date) return null;
  const start = kstDate(date.start);
  const end = date.end ? kstDate(date.end) : null;
  const order = page.properties["정렬시간"]?.number;
  return {
    id: page.id,
    title: propText(page, "이름"),
    start,
    end: end && end > start ? end : null,
    time: kstTime(date.start),
    place: propText(page, "장소"),
    people: propPeople(page, "담당자"),
    order: typeof order === "number" ? order : null,
    url: page.url,
  };
}

export function checkRange(from: string | null, to: string | null) {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) badRequest("날짜 범위가 이상합니다.");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) badRequest("한 번에 70일까지만 볼 수 있습니다.");
  return { from: from as string, to: to as string };
}

/** 범위 안에 걸치는 일정 (여러 날 일정은 시작이 범위 앞이어도 끝이 범위 안이면 포함) */
export async function listCompanyEvents(from: string, to: string) {
  const pages = await queryNotionDatabase(COMPANY_SCHEDULE_DB, {
    or: [
      { and: [{ property: "날짜", date: { on_or_after: from } }, { property: "날짜", date: { on_or_before: to } }] },
      { and: [{ property: "날짜", date: { before: from } }, { property: "날짜", date: { on_or_after: addDaysIso(from, -31) } }] },
    ],
  });
  return pages
    .map(toEvent)
    .filter((e): e is CompanyEvent => !!e && (e.end ?? e.start) >= from && e.start <= to);
}

function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function notion(path: string, method: string, body?: unknown) {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new NotionAccessError(500, "NOTION_TOKEN 이 없습니다.");
  const response = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await response.json()) as { message?: string } & Record<string, unknown>;
  if (!response.ok) throw new NotionAccessError(response.status, json.message ?? "노션 요청 실패");
  return json;
}

/** 이 DB 의 페이지인지 확인한다. 다른 노션 페이지를 고치지 못하게 */
async function ownPage(id: string) {
  if (!ID_RE.test(id)) badRequest("일정 id 가 이상합니다.");
  const page = (await notion(`pages/${id}`, "GET")) as { parent?: { database_id?: string } };
  const parent = (page.parent?.database_id ?? "").replace(/-/g, "");
  if (parent !== COMPANY_SCHEDULE_DB) badRequest("회사 일정이 아닙니다.");
}

export type EventInput = { title?: unknown; date?: unknown; end?: unknown; time?: unknown; place?: unknown; order?: unknown };

function cleanText(value: unknown, max: number) {
  if (value == null) return "";
  if (typeof value !== "string") badRequest("글이 이상합니다.");
  const text = (value as string).trim();
  if (text.length > max) badRequest(`${max}자까지 적을 수 있습니다.`);
  return text;
}

/** 화면에서 받은 값을 노션 속성으로. 바꾸지 않을 칸은 undefined 로 둔다 */
function toProperties(input: EventInput, isNew: boolean) {
  const props: Record<string, unknown> = {};
  if (input.title !== undefined || isNew) {
    props["이름"] = { title: [{ text: { content: cleanText(input.title, 200) } }] };
  }
  if (input.date !== undefined || isNew) {
    const date = input.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) badRequest("날짜가 이상합니다.");
    const time = input.time == null || input.time === "" ? "" : String(input.time);
    if (time && !TIME_RE.test(time)) badRequest("시각은 10:00 처럼 적어 주세요.");
    const end = input.end == null || input.end === "" ? null : String(input.end);
    if (end && (!DATE_RE.test(end) || end < (date as string))) badRequest("끝나는 날이 이상합니다.");
    props["날짜"] = {
      date: {
        start: time ? `${date}T${time}:00.000+09:00` : date,
        end: end && end !== date ? end : null,
      },
    };
  }
  if (input.place !== undefined) {
    const place = cleanText(input.place, 200);
    props["장소"] = { rich_text: place ? [{ text: { content: place } }] : [] };
  }
  if (input.order !== undefined) {
    const order = input.order === null || input.order === "" ? null : Number(input.order);
    if (order !== null && !Number.isFinite(order)) badRequest("순서가 이상합니다.");
    props["정렬시간"] = { number: order };
  }
  return props;
}

export async function createCompanyEvent(input: EventInput) {
  const page = (await notion("pages", "POST", {
    parent: { database_id: COMPANY_SCHEDULE_DB },
    properties: toProperties(input, true),
  })) as unknown as NotionPage;
  return toEvent(page);
}

export async function updateCompanyEvent(id: string, input: EventInput) {
  await ownPage(id);
  const page = (await notion(`pages/${id}`, "PATCH", { properties: toProperties(input, false) })) as unknown as NotionPage;
  return toEvent(page);
}

/** 노션 휴지통으로 보내거나(archived true) 되살린다(false) */
export async function archiveCompanyEvent(id: string, archived: boolean) {
  await ownPage(id);
  const page = (await notion(`pages/${id}`, "PATCH", { archived })) as unknown as NotionPage;
  return archived ? null : toEvent(page);
}
