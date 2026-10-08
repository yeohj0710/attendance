/**
 * 노션 API 읽기 전용 도우미. 콘텐츠팀 현황판과 일정 달력이 쓴다.
 * 토큰은 NOTION_TOKEN (업무 시스템 attendance .env 와 Vercel 환경변수). 쓰기 호출은 만들지 않는다.
 */
const NOTION_VERSION = "2022-06-28";

export type NotionPage = {
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

type RichText = { plain_text: string };
type NotionProperty = {
  type: string;
  title?: RichText[];
  rich_text?: RichText[];
  select?: { name: string } | null;
  status?: { name: string } | null;
  date?: { start: string; end: string | null } | null;
  people?: Array<{ name?: string }>;
  number?: number | null;
  url?: string | null;
};

export class NotionAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 데이터베이스 행을 전부 읽는다. 통합이 연결되지 않은 DB는 NotionAccessError(404). */
export async function queryNotionDatabase(databaseId: string, filter?: unknown) {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    throw new NotionAccessError(500, "NOTION_TOKEN 이 없습니다.");
  }

  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 100, start_cursor: cursor, filter }),
      cache: "no-store",
    });
    const body = (await response.json()) as {
      results?: NotionPage[];
      has_more?: boolean;
      next_cursor?: string | null;
      message?: string;
    };
    if (!response.ok) {
      throw new NotionAccessError(response.status, body.message ?? "노션 읽기 실패");
    }
    pages.push(...(body.results ?? []));
    cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
  } while (cursor);

  return pages;
}

export function propText(page: NotionPage, name: string) {
  const prop = page.properties[name];
  if (!prop) return "";
  switch (prop.type) {
    case "title":
      return (prop.title ?? []).map((t) => t.plain_text).join("").trim();
    case "rich_text":
      return (prop.rich_text ?? []).map((t) => t.plain_text).join("").trim();
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "people":
      return (prop.people ?? []).map((p) => p.name ?? "").filter(Boolean).join(", ");
    case "number":
      return prop.number == null ? "" : String(prop.number);
    case "url":
      return prop.url ?? "";
    default:
      return "";
  }
}

export function propDate(page: NotionPage, name: string) {
  const prop = page.properties[name];
  return prop?.type === "date" && prop.date ? prop.date : null;
}

export function propPeople(page: NotionPage, name: string) {
  const prop = page.properties[name];
  return prop?.type === "people" ? (prop.people ?? []).map((p) => p.name ?? "").filter(Boolean) : [];
}

/** 한 번에 몇 개씩만 부른다. 노션 API는 초당 3회 안팎을 권한다. */
export async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await run(items[index]);
      }
    }),
  );
  return out;
}

/** 한국 날짜 YYYY-MM-DD */
export function kstToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
