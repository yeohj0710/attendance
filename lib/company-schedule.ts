import { revalidateTag, unstable_cache } from "next/cache";
import { NotionAccessError, propDate, propText, queryNotionDatabase } from "@/lib/notion";
import type { NotionPage } from "@/lib/notion";
import { badRequest } from "@/lib/http";

/**
 * 회사 일정 달력(/schedule). 노션 메인 왼쪽 「일정」 DB 를 그대로 읽고 쓴다. 데이터를 옮기지 않으니 노션과 늘 같다.
 * 이 DB 의 칸: 이름(제목), 날짜, 장소, 담당자(사람), 담당자 이름(글, 노션 사람 목록에 없는 사람을 쉼표로), 정렬시간(숫자, 같은 날 안의 순서). 시각은 보통 제목 글자에 적는다("바로팜 미팅 10:00").
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
  /** 담당자 id 와 이름 (고칠 때 쓴다) */
  who: Array<{ id: string; name: string }>;
  /** 노션 사람이 아닌 담당자 (「담당자 이름」 글 칸) */
  names: string[];
  order: number | null;
  url: string;
  /** 위 칸 말고 노션에 더 있는 속성 (보기만) */
  extra: Array<{ name: string; value: string }>;
};

const KNOWN_PROPS = ["이름", "날짜", "장소", "담당자", "담당자 이름", "정렬시간"];
const NAMES_PROP = "담당자 이름";
const splitNames = (text: string) => text.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);

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

/* 노션 이름을 한국식으로: "아영 송" → "송아영", "권혁찬(약학대학 약학과)" → "권혁찬" */
export function koName(name: string) {
  const n = name.replace(/\s*\(.*?\)\s*/g, "").trim();
  const m = /^([가-힣]{1,3}) ([가-힣])$/.exec(n);
  return m ? m[2] + m[1] : n;
}

function whoOf(page: NotionPage) {
  const prop = page.properties["담당자"] as unknown as { type?: string; people?: Array<{ id: string; name?: string }> } | undefined;
  return prop?.type === "people" ? (prop.people ?? []).map((p) => ({ id: p.id, name: koName(p.name ?? "") })) : [];
}

export function toEvent(page: NotionPage): CompanyEvent | null {
  const date = propDate(page, "날짜");
  if (!date) return null;
  const start = kstDate(date.start);
  const end = date.end ? kstDate(date.end) : null;
  const order = page.properties["정렬시간"]?.number;
  const names = splitNames(propText(page, NAMES_PROP));
  return {
    id: page.id,
    title: propText(page, "이름"),
    start,
    end: end && end > start ? end : null,
    time: kstTime(date.start),
    place: propText(page, "장소"),
    people: [...whoOf(page).map((p) => p.name).filter(Boolean), ...names],
    who: whoOf(page),
    names,
    order: typeof order === "number" ? order : null,
    url: page.url,
    extra: Object.keys(page.properties)
      .filter((name) => !KNOWN_PROPS.includes(name))
      .map((name) => ({ name, value: propText(page, name) })),
  };
}

export function checkRange(from: string | null, to: string | null) {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || to < from) badRequest("날짜 범위가 이상합니다.");
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS) badRequest("한 번에 70일까지만 볼 수 있습니다.");
  return { from: from as string, to: to as string };
}

/** 범위 안에 걸치는 일정 (여러 날 일정은 시작이 범위 앞이어도 끝이 범위 안이면 포함) */
async function readCompanyEvents(from: string, to: string) {
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

/* 노션 통합 하나에 초당 3회 안팎 한도라, 보는 사람 수와 상관없이 같은 2주는 45초에 한 번만 읽는다.
   쓰고 나면 태그를 비워 다음 읽기가 바로 노션에서 온다 (쓴 사람 화면은 응답으로 바로 맞춘다) */
const SCHEDULE_TAG = "company-schedule";
export const listCompanyEvents = unstable_cache(readCompanyEvents, ["company-schedule-v1"], { revalidate: 45, tags: [SCHEDULE_TAG] });
export const fresh = () => {
  /* 캐시 비우기가 실패해도 노션 쓰기는 이미 끝났으니 오류로 돌려주지 않는다 (45초 뒤에는 저절로 새로 읽는다) */
  try {
    revalidateTag(SCHEDULE_TAG, { expire: 0 });
  } catch {}
};

function addDaysIso(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function notion(path: string, method: string, body?: unknown) {
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
export async function ownPage(id: string) {
  if (!ID_RE.test(id)) badRequest("일정 id 가 이상합니다.");
  const page = (await notion(`pages/${id}`, "GET")) as unknown as NotionPage & { parent?: { database_id?: string } };
  const parent = (page.parent?.database_id ?? "").replace(/-/g, "");
  if (parent !== COMPANY_SCHEDULE_DB) badRequest("회사 일정이 아닙니다.");
  return page;
}

export type EventInput = { title?: unknown; date?: unknown; end?: unknown; time?: unknown; place?: unknown; order?: unknown; people?: unknown; names?: unknown };

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
  if (input.people !== undefined) {
    const ids = Array.isArray(input.people) ? input.people : [];
    if (ids.length > 20 || ids.some((x) => typeof x !== "string" || !ID_RE.test(x))) badRequest("담당자가 이상합니다.");
    props["담당자"] = { people: (ids as string[]).map((id) => ({ id })) };
  }
  if (input.names !== undefined) {
    const names = Array.isArray(input.names) ? input.names : [];
    if (names.length > 20 || names.some((x) => typeof x !== "string" || !x.trim() || x.length > 30 || /[,，、]/.test(x))) badRequest("담당자 이름이 이상합니다.");
    const text = (names as string[]).map((x) => x.trim()).join(", ");
    props[NAMES_PROP] = { rich_text: text ? [{ text: { content: text } }] : [] };
  }
  return props;
}

export async function createCompanyEvent(input: EventInput) {
  const page = (await notion("pages", "POST", {
    parent: { database_id: COMPANY_SCHEDULE_DB },
    properties: toProperties(input, true),
  })) as unknown as NotionPage;
  fresh();
  return toEvent(page);
}

export async function updateCompanyEvent(id: string, input: EventInput) {
  await ownPage(id);
  const page = (await notion(`pages/${id}`, "PATCH", { properties: toProperties(input, false) })) as unknown as NotionPage;
  fresh();
  return toEvent(page);
}

/** 노션 휴지통으로 보내거나(archived true) 되살린다(false) */
export async function archiveCompanyEvent(id: string, archived: boolean) {
  await ownPage(id);
  const page = (await notion(`pages/${id}`, "PATCH", { archived })) as unknown as NotionPage;
  fresh();
  return archived ? null : toEvent(page);
}
