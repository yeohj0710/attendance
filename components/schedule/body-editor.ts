/**
 * 회사 일정 페이지 본문 편집기. 노션 블록을 줄마다 contenteditable 하나로 그리고, 고친 것만 골라 노션에 저장한다.
 * React 상태 대신 DOM 을 직접 다룬다(글을 칠 때마다 다시 그리면 커서가 튄다).
 *
 * 되는 것: 글 고치기, Enter 로 나누기, Backspace 로 합치기, 줄 앞에 "- " "1. " "[] " "# " "## " "### " "> " 를 치면 그 블록으로,
 * 굵게(Ctrl+B), 기울임(Ctrl+I), 밑줄(Ctrl+U), 링크(Ctrl+K, 글을 고른 뒤 주소 붙여넣기, 주소만 붙여넣기), 노션 페이지 주소를 붙여넣으면 페이지 멘션,
 * 할 일 체크, 여러 줄 붙여넣기. 그림, 표 같은 블록과 하위 블록은 보기만 한다(지우지 않는다).
 * 저장은 1.2초 쉬면 저절로, 창을 닫을 때 한 번 더. 저장은 한 번에 하나씩 차례로 한다.
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
  raw?: Record<string, unknown>;
};
export type Block = {
  id: string;
  type: string;
  segs: Seg[];
  checked?: boolean;
  editable: boolean;
  children?: Block[];
  info?: { label: string; href?: string };
};
type Snap = { type: string; segs: string; checked: boolean };
type SaveApi = {
  body: (ops: unknown[]) => Promise<{ refs: Record<string, string> }>;
  start: (blocks: unknown[]) => Promise<{ refs: Record<string, string> }>;
};

const MAKE = ["paragraph", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote"];
const CONTINUES = ["bulleted_list_item", "numbered_list_item", "to_do"];
const SHORTCUTS: Array<[RegExp, string]> = [
  [/^[-*]\s/, "bulleted_list_item"],
  [/^1[.)]\s/, "numbered_list_item"],
  [/^\[\s?\]\s/, "to_do"],
  [/^###\s/, "heading_3"],
  [/^##\s/, "heading_2"],
  [/^#\s/, "heading_1"],
  [/^[>"]\s/, "quote"],
];
const NOTION_PAGE = /^https?:\/\/(?:www\.|app\.)?notion\.(?:so|site|com)\/.*?([0-9a-f]{32})(?:[?#].*)?$/i;
const URL_RE = /^https?:\/\/\S+$/i;

/* 조각 비교용: 키 순서와 빈 값 차이로 "고침"이 잡히지 않게 늘 같은 모양으로 적는다 */
const canon = (segs: Seg[]) =>
  JSON.stringify(segs.map((x) => ({ t: x.t, b: !!x.b, i: !!x.i, s: !!x.s, u: !!x.u, c: !!x.c, color: x.color ?? "", href: x.href ?? "", raw: x.raw ? JSON.stringify(x.raw) : "" })));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const dashed = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
const sameStyle = (a: Seg, b: Seg) =>
  !a.raw && !b.raw && !!a.b === !!b.b && !!a.i === !!b.i && !!a.s === !!b.s && !!a.u === !!b.u && !!a.c === !!b.c && (a.color ?? "") === (b.color ?? "") && (a.href ?? "") === (b.href ?? "");

export function segsToHtml(segs: Seg[]) {
  return segs
    .map((s) => {
      if (s.raw) {
        const href = s.href ? ` data-href="${esc(s.href)}"` : "";
        return `<span class="pb-mention" contenteditable="false" data-raw="${esc(JSON.stringify(s.raw))}" data-ann="${esc(JSON.stringify({ b: s.b, i: s.i, s: s.s, u: s.u, c: s.c, color: s.color }))}"${href}>${esc(s.t)}</span>`;
      }
      let h = esc(s.t).replace(/\n/g, "<br>");
      if (s.c) h = `<code>${h}</code>`;
      if (s.b) h = `<b>${h}</b>`;
      if (s.i) h = `<i>${h}</i>`;
      if (s.s) h = `<s>${h}</s>`;
      if (s.u) h = `<u>${h}</u>`;
      if (s.color) h = `<span data-color="${esc(s.color)}">${h}</span>`;
      if (s.href) h = `<a href="${esc(s.href)}" target="_blank" rel="noopener">${h}</a>`;
      return h;
    })
    .join("");
}

export function htmlToSegs(root: HTMLElement): Seg[] {
  const out: Seg[] = [];
  const push = (seg: Seg) => {
    const last = out[out.length - 1];
    if (last && sameStyle(last, seg)) last.t += seg.t;
    else out.push(seg);
  };
  const walk = (node: Node, st: Omit<Seg, "t">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").replace(/​/g, "");
      if (t) push({ ...st, t });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains("pb-mention")) {
      let ann: Partial<Seg> = {};
      try { ann = JSON.parse(node.dataset.ann || "{}"); } catch {}
      let raw: Record<string, unknown> | undefined;
      try { raw = JSON.parse(node.dataset.raw || "null") ?? undefined; } catch {}
      out.push({ ...ann, t: node.textContent ?? "", raw, href: node.dataset.href || undefined });
      return;
    }
    const tag = node.tagName;
    if (tag === "BR") {
      if (node.nextSibling || node.parentElement !== root) push({ ...st, t: "\n" });
      return;
    }
    const next = { ...st };
    if (tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(node.style.fontWeight)) next.b = true;
    if (tag === "I" || tag === "EM" || node.style.fontStyle === "italic") next.i = true;
    if (tag === "S" || tag === "STRIKE" || tag === "DEL") next.s = true;
    if (tag === "U") next.u = true;
    if (tag === "CODE") next.c = true;
    if (tag === "A" && (node as HTMLAnchorElement).getAttribute("href")) next.href = (node as HTMLAnchorElement).getAttribute("href") as string;
    if (node.dataset.color) next.color = node.dataset.color;
    if ((tag === "DIV" || tag === "P") && node !== root && out.length) push({ ...st, t: "\n" });
    node.childNodes.forEach((c) => walk(c, next));
  };
  root.childNodes.forEach((c) => walk(c, {}));
  for (const s of out) for (const k of ["b", "i", "s", "u", "c"] as const) if (!s[k]) delete s[k];
  return out.filter((s) => s.t || s.raw);
}

function caretAtStart(el: HTMLElement) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString().replace(/​/g, "") === "" && !r.cloneContents().querySelector(".pb-mention");
}
function caretAtEnd(el: HTMLElement) {
  const sel = getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return false;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setStart(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return r.toString().replace(/​/g, "") === "" && !r.cloneContents().querySelector(".pb-mention");
}
function focusAt(el: HTMLElement, atEnd: boolean) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
}
const isEmpty = (rt: HTMLElement) => !rt.textContent?.replace(/​/g, "") && !rt.querySelector(".pb-mention");

export class BodyEditor {
  private root: HTMLElement;
  private api: SaveApi;
  private snap = new Map<string, Snap>();
  private timer: number | undefined;
  private saving: Promise<void> | null = null;
  private again = false;
  private tmp = 0;
  private onState: (s: "idle" | "dirty" | "saving" | "saved" | "error", msg?: string) => void;

  constructor(root: HTMLElement, blocks: Block[], api: SaveApi, onState: BodyEditor["onState"]) {
    this.root = root;
    this.api = api;
    this.onState = onState;
    root.classList.add("pb-root");
    root.innerHTML = "";
    for (const b of blocks) {
      root.appendChild(this.blockEl(b));
      if (b.editable) this.snap.set(b.id, { type: b.type, segs: canon(b.segs), checked: !!b.checked });
    }
    if (!root.querySelector(".pb:not(.pb-lock)") && !blocks.length) root.appendChild(this.blockEl({ id: "", type: "paragraph", segs: [], editable: true }));
    root.addEventListener("mousedown", this.onRootDown);
  }

  destroy() {
    this.root.removeEventListener("mousedown", this.onRootDown);
    window.clearTimeout(this.timer);
  }

  /** 본문 아래 빈 곳을 누르면 마지막에 빈 문단을 붙여 거기에 쓴다 */
  private onRootDown = (e: MouseEvent) => {
    if (e.target !== this.root) return;
    e.preventDefault();
    const last = this.root.lastElementChild as HTMLElement | null;
    const rt = last?.querySelector<HTMLElement>(":scope > .pb-rt");
    if (last && rt && last.dataset.type === "paragraph" && isEmpty(rt)) return focusAt(rt, true);
    const el = this.blockEl({ id: "", type: "paragraph", segs: [], editable: true });
    this.root.appendChild(el);
    focusAt(el.querySelector(".pb-rt") as HTMLElement, false);
  };

  private blockEl(b: Block): HTMLElement {
    const el = document.createElement("div");
    if (!b.editable) {
      el.className = `pb pb-lock t-${b.type}`;
      el.dataset.id = b.id;
      el.contentEditable = "false";
      if (b.type === "divider") el.innerHTML = "<hr>";
      else if (b.info?.href) el.innerHTML = `<a href="${esc(b.info.href)}" target="_blank" rel="noopener">${esc(b.info.label || "열기")}</a>`;
      else if (b.segs.length) el.innerHTML = `<div class="pb-rt">${segsToHtml(b.segs)}</div>`;
      else el.innerHTML = `<span>${esc(b.info?.label ?? "")}</span>`;
      if (b.children?.length) el.appendChild(this.kidsEl(b.children));
      return el;
    }
    el.className = `pb t-${b.type}`;
    if (b.id) el.dataset.id = b.id;
    el.dataset.type = b.type;
    if (b.type === "to_do") {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "pb-chk";
      box.checked = !!b.checked;
      box.tabIndex = -1;
      box.addEventListener("mousedown", (e) => e.preventDefault());
      box.addEventListener("change", () => { el.classList.toggle("is-checked", box.checked); this.dirty(); });
      el.classList.toggle("is-checked", !!b.checked);
      el.appendChild(box);
    }
    const rt = document.createElement("div");
    rt.className = "pb-rt";
    rt.contentEditable = "true";
    rt.spellcheck = false;
    rt.innerHTML = segsToHtml(b.segs);
    rt.addEventListener("keydown", (e) => this.onKey(e, el, rt));
    rt.addEventListener("input", () => this.onInput(el, rt));
    rt.addEventListener("paste", (e) => this.onPaste(e, el, rt));
    rt.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a, .pb-mention") as HTMLElement | null;
      const href = a?.getAttribute("href") || a?.dataset.href;
      if (href && (e.ctrlKey || e.metaKey)) window.open(href, "_blank", "noopener");
    });
    el.appendChild(rt);
    if (b.children?.length) {
      el.dataset.kids = "1";
      el.appendChild(this.kidsEl(b.children));
    }
    return el;
  }

  private kidsEl(kids: Block[]) {
    const box = document.createElement("div");
    box.className = "pb-kids";
    box.contentEditable = "false";
    box.title = "안쪽 블록은 노션에서 고쳐요";
    for (const k of kids) box.appendChild(this.blockEl({ ...k, editable: false }));
    return box;
  }

  private setType(el: HTMLElement, type: string) {
    const rt = el.querySelector(":scope > .pb-rt") as HTMLElement;
    const old = el.querySelector(":scope > .pb-chk");
    if (old) old.remove();
    el.className = `pb t-${type}`;
    el.dataset.type = type;
    if (type === "to_do") {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "pb-chk";
      box.tabIndex = -1;
      box.addEventListener("mousedown", (e) => e.preventDefault());
      box.addEventListener("change", () => { el.classList.toggle("is-checked", box.checked); this.dirty(); });
      el.insertBefore(box, rt);
    }
  }

  private newAfter(el: HTMLElement, type: string, html = "") {
    const n = this.blockEl({ id: "", type, segs: [], editable: true });
    (n.querySelector(".pb-rt") as HTMLElement).innerHTML = html;
    el.after(n);
    return n;
  }

  private onKey(e: KeyboardEvent, el: HTMLElement, rt: HTMLElement) {
    if (e.isComposing || e.keyCode === 229) return;
    const type = el.dataset.type as string;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (CONTINUES.includes(type) && isEmpty(rt) && !el.dataset.kids) {
        this.setType(el, "paragraph");
        this.dirty();
        return;
      }
      const sel = getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      tail.setEnd(rt, rt.childNodes.length);
      const frag = tail.extractContents();
      const holder = document.createElement("div");
      holder.appendChild(frag);
      const nextType = CONTINUES.includes(type) ? type : "paragraph";
      const n = this.newAfter(el, nextType, holder.innerHTML.replace(/^<br>$/, ""));
      if (rt.innerHTML === "<br>") rt.innerHTML = "";
      focusAt(n.querySelector(".pb-rt") as HTMLElement, false);
      this.dirty();
      return;
    }
    if (e.key === "Backspace" && caretAtStart(rt)) {
      if (type !== "paragraph" && MAKE.includes(type) && !el.dataset.kids) {
        e.preventDefault();
        this.setType(el, "paragraph");
        this.dirty();
        return;
      }
      const prev = el.previousElementSibling as HTMLElement | null;
      const prt = prev?.querySelector<HTMLElement>(":scope > .pb-rt");
      if (!prev || prev.classList.contains("pb-lock") || !prt || el.dataset.kids) return;
      e.preventDefault();
      const join = document.createRange();
      join.selectNodeContents(prt);
      join.collapse(false);
      const marker = document.createElement("span");
      join.insertNode(marker);
      while (rt.firstChild) prt.appendChild(rt.firstChild);
      el.remove();
      prt.focus();
      const r = document.createRange();
      r.setStartAfter(marker);
      r.collapse(true);
      marker.remove();
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      this.dirty();
      return;
    }
    if (e.key === "ArrowUp" && caretAtStart(rt)) {
      const prt = (el.previousElementSibling as HTMLElement | null)?.querySelector<HTMLElement>(":scope > .pb-rt[contenteditable=true]");
      if (prt) { e.preventDefault(); focusAt(prt, true); }
      return;
    }
    if (e.key === "ArrowDown" && caretAtEnd(rt)) {
      const nrt = (el.nextElementSibling as HTMLElement | null)?.querySelector<HTMLElement>(":scope > .pb-rt[contenteditable=true]");
      if (nrt) { e.preventDefault(); focusAt(nrt, false); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      const sel = getSelection();
      if (!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      const url = window.prompt("링크 주소를 넣어 주세요", "https://");
      if (!url || !URL_RE.test(url.trim())) return;
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("createLink", false, url.trim());
      rt.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
      this.dirty();
    }
  }

  private onInput(el: HTMLElement, rt: HTMLElement) {
    if (el.dataset.type === "paragraph" && !el.dataset.kids) {
      const first = rt.firstChild;
      const text = first && first.nodeType === Node.TEXT_NODE ? (first.textContent ?? "").replace(/ /g, " ") : "";
      for (const [re, type] of SHORTCUTS) {
        const m = text.match(re);
        if (!m) continue;
        first!.textContent = (first!.textContent ?? "").slice(m[0].length);
        this.setType(el, type);
        focusAt(rt, false);
        break;
      }
    }
    if (rt.innerHTML === "<br>") rt.innerHTML = "";
    this.dirty();
  }

  private onPaste(e: ClipboardEvent, el: HTMLElement, rt: HTMLElement) {
    e.preventDefault();
    const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n");
    if (!text) return;
    const sel = getSelection();
    const one = text.trim();
    if (!one.includes("\n") && URL_RE.test(one)) {
      const page = one.match(NOTION_PAGE);
      if (page) {
        const raw = { type: "mention", mention: { type: "page", page: { id: dashed(page[1].toLowerCase()) } } };
        document.execCommand("insertHTML", false, segsToHtml([{ t: "노션 페이지", raw, href: one }]) + "​");
      } else if (sel && !sel.isCollapsed) {
        document.execCommand("createLink", false, one);
      } else {
        document.execCommand("insertHTML", false, `<a href="${esc(one)}" target="_blank" rel="noopener">${esc(one)}</a>​`);
      }
      rt.querySelectorAll("a").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
      this.dirty();
      return;
    }
    const lines = text.split("\n");
    document.execCommand("insertText", false, lines[0]);
    let at = el;
    for (const line of lines.slice(1)) {
      let type = "paragraph";
      let body = line;
      for (const [re, t] of SHORTCUTS) {
        const m = line.match(re);
        if (m) { type = t; body = line.slice(m[0].length); break; }
      }
      at = this.newAfter(at, type, esc(body));
    }
    if (at !== el) focusAt(at.querySelector(".pb-rt") as HTMLElement, true);
    this.dirty();
  }

  private dirty() {
    this.onState("dirty");
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.save(), 1200);
  }

  /** 닫기 전에 부른다. 남은 저장을 끝까지 기다린다 */
  async flush() {
    window.clearTimeout(this.timer);
    await this.save();
  }

  private current(el: HTMLElement) {
    const rt = el.querySelector(":scope > .pb-rt") as HTMLElement;
    const box = el.querySelector(":scope > .pb-chk") as HTMLInputElement | null;
    return { type: el.dataset.type as string, segs: htmlToSegs(rt), checked: !!box?.checked };
  }

  async save(): Promise<void> {
    if (this.saving) {
      this.again = true;
      return this.saving;
    }
    this.saving = this.doSave().finally(() => {
      this.saving = null;
      if (this.again) {
        this.again = false;
        void this.save();
      }
    });
    return this.saving;
  }

  private async doSave() {
    const els = [...this.root.children] as HTMLElement[];
    const seen = new Set<string>();
    const ops: unknown[] = [];
    const after: Array<() => void> = [];
    let prev: string | null = null;
    let group: { op: "insert"; after: string; blocks: Array<Record<string, unknown>> } | null = null;
    const flushGroup = () => { if (group) ops.push(group); group = null; };
    const newRef = () => `tmp:${++this.tmp}`;
    const startBlocks: Array<Record<string, unknown>> = [];
    /* 새 블록이 노션 id 를 받으면 저장 시점의 글로 기억해 둔다 (저장 중에 더 고친 글은 다음 저장에서 잡힌다) */
    const born = new Map<string, Snap>();
    const emptyBody = this.snap.size === 0 && !this.root.querySelector(".pb-lock");

    for (const el of els) {
      if (el.classList.contains("pb-lock")) {
        flushGroup();
        prev = el.dataset.id ?? prev;
        continue;
      }
      const cur = this.current(el);
      const id = el.dataset.id;
      if (id && this.snap.has(id)) {
        flushGroup();
        seen.add(id);
        const old = this.snap.get(id)!;
        const segs = canon(cur.segs);
        if (old.type !== cur.type) {
          const ref = newRef();
          ops.push({ op: "replace", id, ref, ...cur });
          el.dataset.ref = ref;
          born.set(ref, { type: cur.type, segs, checked: cur.checked });
          after.push(() => this.snap.delete(id));
          prev = ref;
        } else {
          if (old.segs !== segs || old.checked !== cur.checked) {
            ops.push({ op: "update", id, ...cur });
            after.push(() => this.snap.set(id, { type: cur.type, segs, checked: cur.checked }));
          }
          prev = id;
        }
        continue;
      }
      /* 새 블록. 비어 있는 새 문단 하나뿐이면 저장하지 않는다 */
      if (!cur.segs.length && cur.type === "paragraph" && el === els[els.length - 1]) continue;
      const ref = newRef();
      el.dataset.ref = ref;
      born.set(ref, { type: cur.type, segs: canon(cur.segs), checked: cur.checked });
      if (emptyBody) {
        startBlocks.push({ ref, ...cur });
      } else if (prev) {
        if (!group) group = { op: "insert", after: prev, blocks: [] };
        group.blocks.push({ ref, ...cur });
      } else {
        /* 맨 앞에 새 블록이 생긴 드문 경우: 노션 API 는 맨 앞에 끼울 수 없어 첫 블록 뒤에 넣는다 */
        const anchor = els.find((x) => x.dataset.id)?.dataset.id;
        if (anchor) ops.push({ op: "insert", after: anchor, blocks: [{ ref, ...cur }] });
      }
      prev = ref;
    }
    flushGroup();
    for (const id of this.snap.keys()) if (!seen.has(id)) { ops.push({ op: "delete", id }); after.push(() => this.snap.delete(id)); }

    if (!ops.length && !startBlocks.length) {
      this.onState("saved");
      return;
    }
    this.onState("saving");
    try {
      const res = startBlocks.length ? await this.api.start(startBlocks) : await this.api.body(ops);
      after.forEach((f) => f());
      for (const el of this.root.querySelectorAll<HTMLElement>(".pb[data-ref]")) {
        const ref = el.dataset.ref as string;
        const real = res.refs[ref];
        delete el.dataset.ref;
        if (!real) continue;
        el.dataset.id = real;
        const snap = born.get(ref);
        if (snap) this.snap.set(real, snap);
      }
      /* 저장 뒤에 바뀐 글은 다음 저장에서 다시 비교된다 */
      this.onState("saved");
    } catch (err) {
      this.root.querySelectorAll<HTMLElement>(".pb[data-ref]").forEach((el) => delete el.dataset.ref);
      this.onState("error", err instanceof Error ? err.message : "저장하지 못했어요");
    }
  }
}
