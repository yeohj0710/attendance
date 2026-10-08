import { badRequest } from "@/lib/http";
import { unstable_cache } from "next/cache";
import { COMPANY_SCHEDULE_DB, koName, notion, ownPage, toEvent } from "@/lib/company-schedule";
import type { NotionPage } from "@/lib/notion";

/**
 * 회사 일정 한 페이지를 노션처럼 열기: 속성, 댓글, 본문 블록 읽고 쓰기 (/api/schedule/page).
 * 본문은 맨 위 단계 블록만 고친다. 글 블록(문단, 제목, 글머리표, 번호, 할 일, 인용, 토글, 콜아웃)은 글과 서식, 링크, 멘션을 고칠 수 있고
 * 그 밖의 블록(그림, 표, 하위 페이지 같은 것)은 보기만 하고 절대 지우지 않는다. 하위 블록도 보기만 하고 건드리지 않는다.
 * 고치기 전에 블록 id 가 이 페이지의 맨 위 블록인지 확인한다.
 */

export type Seg = {
  t: string;
  b?: boolean;
  i?: boolean;
  s?: boolean;
  u?: boolean;
  c?: boolean;
  color?: string;
  href?: string;
  /** 멘션, 수식처럼 글자로 바꾸면 안 되는 조각은 노션 원본을 그대로 들고 다닌다 */
  raw?: Record<string, unknown>;
};
export type Block = {
  id: string;
  type: string;
  segs: Seg[];
  checked?: boolean;
  editable: boolean;
  children?: Block[];
  /** 보기만 하는 블록의 한 줄 설명 */
  info?: { label: string; href?: string };
};

const TEXT_TYPES = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote", "toggle", "callout"];
/* 새로 만들거나 종류를 바꿀 수 있는 블록 (토글, 콜아웃은 노션에서만 만든다) */
const MAKE_TYPES = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote"];
const COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
  "gray_background", "brown_background", "orange_background", "yellow_background", "green_background", "blue_background", "purple_background", "pink_background", "red_background"];
const ID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const MAX_OPS = 60;

type RichItem = {
  type: string;
  plain_text?: string;
  href?: string | null;
  text?: { content: string; link: { url: string } | null };
  mention?: Record<string, unknown>;
  equation?: { expression: string };
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; underline?: boolean; code?: boolean; color?: string };
};
type RawBlock = { id: string; type: string; has_children?: boolean } & Record<string, unknown>;

const norm = (id: string) => id.replace(/-/g, "").toLowerCase();

function toSegs(rich: RichItem[] | undefined): Seg[] {
  return (rich ?? []).map((r) => {
    const a = r.annotations ?? {};
    const seg: Seg = { t: r.type === "text" ? r.text?.content ?? "" : r.plain_text ?? "" };
    if (a.bold) seg.b = true;
    if (a.italic) seg.i = true;
    if (a.strikethrough) seg.s = true;
    if (a.underline) seg.u = true;
    if (a.code) seg.c = true;
    if (a.color && a.color !== "default") seg.color = a.color;
    const href = r.type === "text" ? r.text?.link?.url : r.href;
    if (href) seg.href = href;
    if (r.type === "mention" && r.mention) seg.raw = { type: "mention", mention: r.mention };
    if (r.type === "equation" && r.equation) seg.raw = { type: "equation", equation: r.equation };
    return seg;
  });
}

function infoOf(b: RawBlock): Block["info"] {
  const v = (b[b.type] ?? {}) as Record<string, unknown>;
  const fileUrl = (x: Record<string, unknown>) => ((x.file as { url?: string })?.url ?? (x.external as { url?: string })?.url) || undefined;
  switch (b.type) {
    case "divider": return { label: "" };
    case "child_page": return { label: `하위 페이지: ${String(v.title ?? "")}` };
    case "child_database": return { label: `하위 데이터베이스: ${String(v.title ?? "")}` };
    case "image": return { label: "그림", href: fileUrl(v) };
    case "file": case "pdf": case "video": case "audio": return { label: "첨부 파일", href: fileUrl(v) };
    case "bookmark": case "embed": case "link_preview": return { label: String(v.url ?? "링크"), href: String(v.url ?? "") || undefined };
    case "link_to_page": return { label: "다른 페이지로 가는 링크" };
    case "table": return { label: "표 (노션에서 보기)" };
    case "code": return { label: `코드: ${((v.rich_text as RichItem[]) ?? []).map((r) => r.plain_text).join("").slice(0, 80)}` };
    default: return { label: `노션에서만 보이는 블록 (${b.type})` };
  }
}

function toBlock(b: RawBlock): Block {
  const v = (b[b.type] ?? {}) as { rich_text?: RichItem[]; checked?: boolean };
  if (TEXT_TYPES.includes(b.type)) {
    return { id: b.id, type: b.type, segs: toSegs(v.rich_text), checked: b.type === "to_do" ? !!v.checked : undefined, editable: true };
  }
  return { id: b.id, type: b.type, segs: [], editable: false, info: infoOf(b) };
}

async function listChildren(id: string) {
  const out: RawBlock[] = [];
  let cursor: string | undefined;
  do {
    const res = (await notion(`blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`, "GET")) as {
      results: RawBlock[]; has_more: boolean; next_cursor: string | null;
    };
    out.push(...res.results);
    cursor = res.has_more && res.next_cursor ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function readBlocks(pageId: string) {
  const raw = await listChildren(pageId);
  const blocks = raw.map(toBlock);
  /* 하위 블록은 보기만. 노션 호출을 아끼려고 맨 위 블록 10개까지만 펼친다 */
  let opened = 0;
  for (let i = 0; i < raw.length && opened < 10; i++) {
    if (!raw[i].has_children || raw[i].type === "child_page" || raw[i].type === "child_database") continue;
    opened++;
    blocks[i].children = (await listChildren(raw[i].id)).map((c) => ({ ...toBlock(c), editable: false }));
  }
  return blocks;
}

type Person = { id: string; name: string };
type RawUser = { id: string; type?: string; name?: string | null };
const PROGRESS_DB = "3453b1f9b9ae80e8b0c0f319797c99f3";

/* 노션 API 는 게스트를 사람 목록에 안 준다. 일정 DB 와 편집 진행도에 한 번이라도 나온 사람(담당자, 기획자, 만든 사람, 고친 사람)을
   모아 이름을 묻는다. 사람이 자주 바뀌지 않아 6시간에 한 번만 다시 모은다 */
async function readPeople(): Promise<Person[]> {
  const seen = new Map<string, number>();
  const note = (id: string | undefined, weight: number) => { if (id) seen.set(id, Math.max(seen.get(id) ?? 0, weight)); };
  const scan = async (db: string, pages: number) => {
    let cursor: string | undefined;
    for (let i = 0; i < pages; i++) {
      const res = (await notion(`databases/${db}/query`, "POST", {
        page_size: 100,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        ...(cursor ? { start_cursor: cursor } : {}),
      })) as { results: Array<{ created_by?: { id: string }; last_edited_by?: { id: string }; properties: Record<string, { type: string; people?: RawUser[] }> }>; has_more: boolean; next_cursor: string | null };
      for (const page of res.results) {
        note(page.created_by?.id, 1);
        note(page.last_edited_by?.id, 1);
        for (const prop of Object.values(page.properties)) if (prop.type === "people") for (const u of prop.people ?? []) note(u.id, 2);
      }
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }
  };
  const users: RawUser[] = [];
  try {
    users.push(...((await notion("users?page_size=100", "GET")) as { results: RawUser[] }).results);
  } catch {}
  await Promise.all([scan(COMPANY_SCHEDULE_DB, 3).catch(() => {}), scan(PROGRESS_DB, 2).catch(() => {})]);
  const known = new Set(users.map((u) => u.id));
  for (const id of seen.keys()) {
    if (known.has(id)) continue;
    try {
      users.push((await notion(`users/${id}`, "GET")) as RawUser);
    } catch {}
  }
  /* 사람만, 이름이 같으면 하나만. 일정 담당자로 쓰인 사람이 앞에 */
  const byName = new Map<string, Person & { w: number }>();
  for (const u of users) {
    if (u.type !== "person" || !u.name) continue;
    const name = koName(u.name);
    const w = seen.get(u.id) ?? 0;
    const prev = byName.get(name);
    if (!prev || w > prev.w) byName.set(name, { id: u.id, name, w });
  }
  return [...byName.values()].sort((a, b) => b.w - a.w || a.name.localeCompare(b.name, "ko")).map(({ id, name }) => ({ id, name }));
}
const knownPeople = unstable_cache(readPeople, ["company-schedule-people-v1"], { revalidate: 21_600 });
async function workspacePeople(): Promise<Person[]> {
  try {
    return await knownPeople();
  } catch {
    return [];
  }
}

type RawComment = { id: string; created_time: string; created_by: { id: string }; rich_text: RichItem[] };
async function readComments(pageId: string, names: Map<string, string>) {
  try {
    const res = (await notion(`comments?block_id=${pageId}&page_size=100`, "GET")) as { results: RawComment[] };
    return res.results.map((c) => ({ id: c.id, at: c.created_time, who: names.get(norm(c.created_by.id)) ?? "업무 시스템", segs: toSegs(c.rich_text) }));
  } catch {
    return null;
  }
}

export async function getSchedulePage(id: string) {
  const page = (await ownPage(id)) as NotionPage;
  const [blocks, people] = await Promise.all([readBlocks(id), workspacePeople()]);
  const event = toEvent(page);
  /* 담당자 고르기 목록: 워크스페이스 사람 + 이 페이지에 이미 있는 사람(게스트 포함) */
  const all = new Map<string, Person>();
  for (const p of [...people, ...(event?.who ?? [])]) if (p.name && !all.has(norm(p.id))) all.set(norm(p.id), p);
  const comments = await readComments(id, new Map([...all.values()].map((p) => [norm(p.id), p.name])));
  return { event, blocks, comments, people: [...all.values()] };
}

/* ───────── 쓰기 ───────── */

function cleanSegs(input: unknown): unknown[] {
  if (!Array.isArray(input) || input.length > 200) badRequest("본문이 이상합니다.");
  const out: unknown[] = [];
  for (const x of input as Seg[]) {
    if (!x || typeof x !== "object") badRequest("본문이 이상합니다.");
    const annotations = {
      bold: !!x.b, italic: !!x.i, strikethrough: !!x.s, underline: !!x.u, code: !!x.c,
      color: typeof x.color === "string" && COLORS.includes(x.color) ? x.color : "default",
    };
    const raw = x.raw as { type?: string; mention?: Record<string, unknown>; equation?: { expression?: unknown } } | undefined;
    if (raw && raw.type === "mention" && raw.mention && typeof raw.mention === "object") {
      const m = raw.mention as { type?: string; page?: { id?: string }; database?: { id?: string }; user?: { id?: string }; date?: { start?: string; end?: string | null } };
      if (m.type === "page" && m.page?.id && ID_RE.test(m.page.id)) { out.push({ type: "mention", mention: { page: { id: m.page.id } }, annotations }); continue; }
      if (m.type === "database" && m.database?.id && ID_RE.test(m.database.id)) { out.push({ type: "mention", mention: { database: { id: m.database.id } }, annotations }); continue; }
      if (m.type === "user" && m.user?.id && ID_RE.test(m.user.id)) { out.push({ type: "mention", mention: { user: { id: m.user.id } }, annotations }); continue; }
      if (m.type === "date" && typeof m.date?.start === "string") { out.push({ type: "mention", mention: { date: { start: m.date.start, end: m.date.end ?? null } }, annotations }); continue; }
    }
    if (raw && raw.type === "equation" && typeof raw.equation?.expression === "string") {
      out.push({ type: "equation", equation: { expression: raw.equation.expression.slice(0, 1000) }, annotations });
      continue;
    }
    const text = typeof x.t === "string" ? x.t : "";
    const href = typeof x.href === "string" && /^https?:\/\//i.test(x.href) && x.href.length <= 2000 ? x.href : null;
    for (let i = 0; i < text.length; i += 2000) {
      out.push({ type: "text", text: { content: text.slice(i, i + 2000), link: href ? { url: href } : null }, annotations });
    }
  }
  if (out.length > 100) badRequest("한 블록에 서식 조각이 너무 많습니다.");
  return out;
}

function blockBody(type: unknown, segs: unknown, checked: unknown, forCreate: boolean) {
  if (typeof type !== "string" || !(forCreate ? MAKE_TYPES : TEXT_TYPES).includes(type)) badRequest("블록 종류가 이상합니다.");
  const inner: Record<string, unknown> = { rich_text: cleanSegs(segs) };
  if (type === "to_do") inner.checked = !!checked;
  return { type: type as string, inner };
}

type Op =
  | { op: "update"; id: string; type: string; segs: Seg[]; checked?: boolean }
  | { op: "replace"; id: string; type: string; segs: Seg[]; checked?: boolean; ref: string }
  | { op: "insert"; after: string; blocks: Array<{ ref: string; type: string; segs: Seg[]; checked?: boolean }> }
  | { op: "delete"; id: string };

/** 화면에서 받은 본문 바꾸기를 차례로 노션에 반영한다. 새 블록의 임시 이름(ref)과 실제 id 를 돌려준다 */
export async function saveScheduleBody(pageId: string, opsInput: unknown) {
  if (!Array.isArray(opsInput) || !opsInput.length) badRequest("바꿀 것이 없습니다.");
  if (opsInput.length > MAX_OPS) badRequest("한 번에 너무 많이 바꿨어요. 나눠서 저장해 주세요.");
  await ownPage(pageId);
  const existing = await listChildren(pageId);
  const own = new Map(existing.map((b) => [norm(b.id), b]));
  const refs = new Map<string, string>();
  const resolve = (key: unknown) => {
    if (typeof key !== "string") badRequest("블록 위치가 이상합니다.");
    const k = key as string;
    if (k.startsWith("tmp:")) {
      const real = refs.get(k);
      if (!real) badRequest("새 블록 순서가 이상합니다.");
      return real as string;
    }
    if (!ID_RE.test(k) || !own.has(norm(k))) badRequest("이 페이지의 블록이 아닙니다.");
    return k;
  };
  const editableOwn = (key: unknown) => {
    const id = resolve(key);
    const raw = own.get(norm(id));
    if (raw && !TEXT_TYPES.includes(raw.type)) badRequest("이 블록은 노션에서만 고칠 수 있어요.");
    return id;
  };
  const append = async (after: string, items: Array<{ type: unknown; segs: unknown; checked?: unknown }>) => {
    const children = items.map((x) => { const { type, inner } = blockBody(x.type, x.segs, x.checked, true); return { object: "block", type, [type]: inner }; });
    const res = (await notion(`blocks/${pageId}/children`, "PATCH", { children, after })) as { results: RawBlock[] };
    /* after 를 주면 노션이 새 블록과 그 뒤 블록까지 돌려줄 수 있어서, 앞에서부터 새로 만든 개수만 쓴다 */
    return res.results.slice(0, children.length).map((b) => b.id);
  };

  for (const raw of opsInput as Op[]) {
    if (!raw || typeof raw !== "object") badRequest("바꾸기가 이상합니다.");
    if (raw.op === "update") {
      const id = editableOwn(raw.id);
      const { type, inner } = blockBody(raw.type, raw.segs, raw.checked, false);
      if (own.get(norm(id)) && own.get(norm(id))!.type !== type) badRequest("블록 종류는 replace 로 바꿉니다.");
      await notion(`blocks/${id}`, "PATCH", { [type]: inner });
    } else if (raw.op === "replace") {
      const id = editableOwn(raw.id);
      if (own.get(norm(id))?.has_children) badRequest("하위 블록이 있는 블록은 종류를 바꿀 수 없어요. 노션에서 바꿔 주세요.");
      const [newId] = await append(id, [raw]);
      await notion(`blocks/${id}`, "DELETE");
      own.delete(norm(id));
      if (typeof raw.ref === "string" && raw.ref.startsWith("tmp:")) refs.set(raw.ref, newId);
    } else if (raw.op === "insert") {
      const after = resolve(raw.after);
      if (!Array.isArray(raw.blocks) || !raw.blocks.length || raw.blocks.length > 50) badRequest("새 블록이 이상합니다.");
      const ids = await append(after, raw.blocks);
      raw.blocks.forEach((b, i) => { if (typeof b.ref === "string" && b.ref.startsWith("tmp:")) refs.set(b.ref, ids[i]); });
    } else if (raw.op === "delete") {
      const id = editableOwn(raw.id);
      await notion(`blocks/${id}`, "DELETE");
      own.delete(norm(id));
    } else {
      badRequest("모르는 바꾸기입니다.");
    }
  }
  return { refs: Object.fromEntries(refs) };
}

/** 본문이 비어 있는 페이지에 첫 블록들을 넣는다 (after 없이 맨 끝 = 맨 위) */
export async function startScheduleBody(pageId: string, blocks: unknown) {
  if (!Array.isArray(blocks) || !blocks.length || blocks.length > 50) badRequest("새 블록이 이상합니다.");
  await ownPage(pageId);
  const existing = await listChildren(pageId);
  if (existing.length) badRequest("본문이 이미 있어요. 새로 불러온 뒤 다시 해 주세요.");
  const children = (blocks as Array<{ type: unknown; segs: unknown; checked?: unknown; ref?: unknown }>).map((x) => {
    const { type, inner } = blockBody(x.type, x.segs, x.checked, true);
    return { object: "block", type, [type]: inner };
  });
  const res = (await notion(`blocks/${pageId}/children`, "PATCH", { children })) as { results: RawBlock[] };
  const refs: Record<string, string> = {};
  (blocks as Array<{ ref?: unknown }>).forEach((b, i) => { if (typeof b.ref === "string" && b.ref.startsWith("tmp:")) refs[b.ref] = res.results[i]?.id; });
  return { refs };
}

export async function addScheduleComment(pageId: string, text: unknown) {
  if (typeof text !== "string" || !text.trim() || text.length > 2000) badRequest("댓글이 이상합니다.");
  await ownPage(pageId);
  const c = (await notion("comments", "POST", { parent: { page_id: pageId }, rich_text: [{ type: "text", text: { content: (text as string).trim() } }] })) as unknown as RawComment;
  return { id: c.id, at: c.created_time, who: "업무 시스템", segs: toSegs(c.rich_text) };
}
