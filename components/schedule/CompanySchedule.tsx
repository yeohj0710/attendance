"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getStoredAuth, isAuthError } from "@/components/api";
import { PagePeek } from "@/components/schedule/PagePeek";
import type { PeekEvent } from "@/components/schedule/PagePeek";

/**
 * 회사 일정 달력. 노션 메인 「일정」 DB 를 노션 캘린더 보기 모양으로 보여 주고 고친다(app/api/schedule).
 * 노션에서는 주 단위 달력 두 개를 겹쳐 놓았는데, 여기서는 이번 주와 다음 주를 달력 하나에 그린다.
 * 새로 만들기, 카드를 누르면 노션처럼 가운데 큰 창(속성, 댓글, 본문 고치기, PagePeek), 끌어서 날짜 옮기기, 휴지통과 되돌리기,
 * 필터(담당자), 정렬, 검색, 오늘과 앞뒤 이동.
 */

type CompanyEvent = PeekEvent;

type Toast = { text: string; undo?: () => void } | null;

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const NOTION_DB_URL = "https://www.notion.so/1533b1f9b9ae800bb0dbc264b47ae6d0";
const WEEKS = 2;
const REFRESH_MS = 120_000;
const NO_PERSON = "담당자 없음";

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const sundayOf = (date: string) => addDays(date, -dowOf(date));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const label = (date: string) => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;
/* 일정의 시각(분). 날짜 속성에 시각이 없으면 제목 속 "10:30", "오후 1시", "2시 30분" 을 읽는다. 없으면 null */
function minutesOf(e: CompanyEvent): number | null {
  if (e.time) return +e.time.slice(0, 2) * 60 + +e.time.slice(3, 5);
  const t = e.title;
  let m = t.match(/(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/(오전|오후)\s*(\d{1,2})시(?:\s*(\d{1,2})분|\s*반)?/);
  if (m) {
    let h = +m[2] % 12;
    if (m[1] === "오후") h += 12;
    return h * 60 + (m[3] ? +m[3] : /반/.test(m[0]) ? 30 : 0);
  }
  m = t.match(/(?:^|[^\d])(\d{1,2})시(?!간)(?:\s*(\d{1,2})분|\s*반)?/);
  if (m && +m[1] <= 24) return +m[1] * 60 + (m[2] ? +m[2] : /반/.test(m[0]) ? 30 : 0);
  return null;
}

/* 하루 안의 순서. 기본은 시각 순(이른 시각부터, 시각 없는 일정은 뒤로).
   그날 일정이 모두 정렬시간을 가지고 있으면(카드를 끌어 순서를 바꾼 날) 정렬시간 순서를 따른다. 노션도 정렬시간으로 줄 세운다 */
function sortDay(list: CompanyEvent[]) {
  const manual = list.length > 1 && list.every((e) => e.order != null);
  return [...list].sort((a, b) => {
    if (manual) return (a.order as number) - (b.order as number) || a.title.localeCompare(b.title, "ko");
    const ta = minutesOf(a), tb = minutesOf(b);
    if (ta !== tb) return ta == null ? 1 : tb == null ? -1 : ta - tb;
    return (a.order ?? 999) - (b.order ?? 999) || a.title.localeCompare(b.title, "ko");
  });
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem("company-schedule-view") || "null");
    return { hidePeople: Array.isArray(raw?.hidePeople) ? (raw.hidePeople as string[]) : [] };
  } catch {
    return { hidePeople: [] as string[] };
  }
}

export function CompanySchedule() {
  const today = useMemo(kstToday, []);
  const [weekStart, setWeekStart] = useState(() => sundayOf(today));
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [state, setState] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [hidePeople, setHidePeople] = useState<string[]>([]);
  const [menu, setMenu] = useState<null | { kind: "filter"; x: number; y: number }>(null);
  const [dropAt, setDropAt] = useState<{ date: string; id: string; before: boolean } | null>(null);
  const [peek, setPeek] = useState<{ initial: CompanyEvent | null; newDate: string | null; key: number } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const dragRef = useRef<CompanyEvent | null>(null);
  const lastLoad = useRef(0);
  const peekOpen = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const from = weekStart;
  const to = addDays(weekStart, WEEKS * 7 - 1);

  /* 노션 메인에 붙일 때(?embed=1)는 노션 제목이 따로 있으니 화면 제목과 바깥 여백을 뺀다 */
  const [embed, setEmbed] = useState(false);
  useEffect(() => { setEmbed(new URLSearchParams(window.location.search).get("embed") === "1"); }, []);

  useEffect(() => {
    const prefs = loadPrefs();
    setHidePeople(prefs.hidePeople);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("company-schedule-view", JSON.stringify({ hidePeople })); } catch {}
  }, [hidePeople]);

  const showToast = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 3500);
  }, []);

  const call = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const auth = getStoredAuth();
    if (!auth) {
      setState("login");
      throw new Error("login");
    }
    try {
      return await apiFetch<T>(path, { ...init, auth });
    } catch (err) {
      if (isAuthError(err)) setState("login");
      throw err;
    }
  }, []);

  const load = useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const data = await call<{ events: CompanyEvent[] }>(`/api/schedule?from=${from}&to=${to}`);
      setEvents(data.events);
      setState("ready");
    } catch (err) {
      if (err instanceof Error && err.message === "login") return;
      if (isAuthError(err)) return;
      setError(err instanceof Error ? err.message : "불러오지 못했어요.");
      setState((s) => (s === "ready" ? s : "error"));
    }
  }, [call, from, to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible" && !peekOpen.current && !dragRef.current && Date.now() - lastLoad.current > 60_000) void load();
    };
    const timer = window.setInterval(() => { if (Date.now() - lastLoad.current >= REFRESH_MS) again(); }, 30_000);
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", again); document.removeEventListener("visibilitychange", again); };
  }, [load]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".cs-menu, .cs-ic-menu")) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, []);

  useEffect(() => { peekOpen.current = !!peek; }, [peek]);

  const people = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => (e.people.length ? e.people.forEach((p) => set.add(p)) : set.add(NO_PERSON)));
    hidePeople.forEach((p) => set.add(p));
    return [...set].sort((a, b) => (a === NO_PERSON ? 1 : b === NO_PERSON ? -1 : a.localeCompare(b, "ko")));
  }, [events, hidePeople]);

  const visible = useCallback(
    (e: CompanyEvent) => {
      const names = e.people.length ? e.people : [NO_PERSON];
      if (hidePeople.length && names.every((p) => hidePeople.includes(p))) return false;
      const q = query.trim().toLowerCase();
      return !q || `${e.title} ${e.place} ${e.people.join(" ")}`.toLowerCase().includes(q);
    },
    [hidePeople, query],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CompanyEvent[]>();
    for (const e of events) {
      if (!visible(e)) continue;
      const last = e.end ?? e.start;
      for (let d = e.start < from ? from : e.start; d <= last && d <= to; d = addDays(d, 1)) {
        map.set(d, [...(map.get(d) ?? []), e]);
      }
    }
    for (const [d, list] of map) map.set(d, sortDay(list));
    return map;
  }, [events, visible, from, to]);

  function openNew(date: string) {
    setPeek({ initial: null, newDate: date, key: Date.now() });
  }
  function openEdit(e: CompanyEvent) {
    setPeek({ initial: e, newDate: null, key: Date.now() });
  }
  const upsert = useCallback((e: CompanyEvent) => {
    setEvents((list) => (list.some((x) => x.id === e.id) ? list.map((x) => (x.id === e.id ? e : x)) : [...list, e]));
  }, []);

  async function remove(e: { id: string; title: string }) {
    setPeek(null);
    const before = events;
    setEvents((list) => list.filter((x) => x.id !== e.id));
    try {
      await call("/api/schedule", { method: "DELETE", body: JSON.stringify({ id: e.id }) });
      showToast("노션 휴지통으로 보냈어요", async () => {
        try {
          const res = await call<{ event: CompanyEvent }>("/api/schedule", { method: "PATCH", body: JSON.stringify({ id: e.id, restore: true }) });
          setEvents((list) => [...list.filter((x) => x.id !== e.id), res.event]);
          showToast("되살렸어요");
        } catch (err) {
          showToast(err instanceof Error ? err.message : "되살리지 못했어요");
        }
      });
    } catch (err) {
      setEvents(before);
      if (!(err instanceof Error && err.message === "login")) showToast(err instanceof Error ? err.message : "지우지 못했어요");
    }
  }
  const peekCall = useCallback(<T,>(path: string, init?: RequestInit) => call<T>(path, init), [call]);

  async function move(e: CompanyEvent, date: string) {
    if (date === e.start) return;
    const shift = daysBetween(e.start, date);
    const end = e.end ? addDays(e.end, shift) : null;
    const before = events;
    setEvents((list) => list.map((x) => (x.id === e.id ? { ...x, start: date, end } : x)));
    try {
      const res = await call<{ event: CompanyEvent }>("/api/schedule", { method: "PATCH", body: JSON.stringify({ id: e.id, date, end, time: e.time || null }) });
      setEvents((list) => list.map((x) => (x.id === e.id ? res.event : x)));
      showToast(`${label(date)}(${DOW[dowOf(date)]})로 옮겼어요`);
    } catch (err) {
      setEvents(before);
      if (!(err instanceof Error && err.message === "login")) showToast(err instanceof Error ? err.message : "옮기지 못했어요");
    }
  }

  /* 같은 날 안에서 끌어 놓으면 그날 일정에 정렬시간 1, 2, 3... 을 매겨 노션에 저장한다 (노션 보기도 같은 순서가 된다) */
  async function reorder(date: string, dragged: CompanyEvent, targetId: string, before: boolean) {
    const list = (byDay.get(date) ?? []).filter((x) => x.id !== dragged.id);
    const at = list.findIndex((x) => x.id === targetId);
    if (at < 0) return;
    list.splice(before ? at : at + 1, 0, dragged);
    const changes = list.map((x, i) => ({ e: x, order: i + 1 })).filter(({ e, order }) => e.order !== order);
    if (!changes.length) return;
    const beforeAll = events;
    const next = new Map(changes.map(({ e, order }) => [e.id, order]));
    setEvents((all) => all.map((x) => (next.has(x.id) ? { ...x, order: next.get(x.id) as number } : x)));
    try {
      for (const { e, order } of changes) {
        await call("/api/schedule", { method: "PATCH", body: JSON.stringify({ id: e.id, order }) });
      }
      showToast("순서를 바꿨어요. 노션 정렬시간에도 저장했어요");
    } catch (err) {
      setEvents(beforeAll);
      if (!(err instanceof Error && err.message === "login")) showToast(err instanceof Error ? err.message : "순서를 저장하지 못했어요");
      void load();
    }
  }

  function openMenu(kind: "filter", target: HTMLElement) {
    if (menu?.kind === kind) return setMenu(null);
    const r = target.getBoundingClientRect();
    setMenu({ kind, x: Math.max(8, Math.min(window.innerWidth - 248, r.right - 240)), y: r.bottom + 6 });
  }

  const m1 = +addDays(from, 1).slice(5, 7), m2 = +addDays(to, -1).slice(5, 7);
  const monthText = `${from.slice(0, 4)}년 ${m1}월${m1 === m2 ? "" : ` ~ ${m2}월`}`;
  const filtered = hidePeople.length > 0;

  return (
    <main className={`cs${embed ? " is-embed" : ""}`}>
      <header className="cs-head">
        <h1>일정</h1>
      </header>

      <div className="cs-bar">
        <nav className="cs-views">
          <span className="is-on">
            <svg viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></svg>
            캘린더 보기
          </span>
        </nav>
        <div className="cs-tools">
          <button type="button" className={`cs-ic cs-ic-menu${filtered ? " is-on" : ""}`} title="필터" aria-label="필터" onClick={(e) => openMenu("filter", e.currentTarget)}>
            <svg viewBox="0 0 20 20"><path d="M3.5 6h13M6 10h8M8.5 14h3" /></svg>
          </button>
          <span className={`cs-search${searchOpen || query ? " is-open" : ""}`}>
            <button type="button" className="cs-ic" title="검색" aria-label="검색" onClick={() => setSearchOpen(true)}>
              <svg viewBox="0 0 20 20"><circle cx="8.8" cy="8.8" r="5.2" /><path d="m12.7 12.7 3.8 3.8" /></svg>
            </button>
            <input
              aria-label="일정 검색"
              autoFocus={searchOpen}
              onBlur={() => !query && setSearchOpen(false)}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setSearchOpen(false); } }}
              placeholder="검색"
              type="search"
              value={query}
            />
          </span>
          <a className="cs-ic" href={NOTION_DB_URL} rel="noopener" target="_blank" title="노션에서 열기" aria-label="노션에서 열기">
            <svg viewBox="0 0 20 20"><path d="M11.5 4h4.5v4.5M16 4l-5.5 5.5M8.5 16H4v-4.5M4 16l5.5-5.5" /></svg>
          </a>
          <button type="button" className="cs-new" onClick={() => openNew(today >= from && today <= to ? today : from)} disabled={state !== "ready"}>
            새로 만들기
          </button>
        </div>
      </div>

      <div className="cs-sub">
        <b>{monthText}</b>
        <div className="cs-nav">
          <button type="button" onClick={() => setWeekStart(sundayOf(today))}>오늘</button>
          <button type="button" className="cs-arrow" title="이전 주" aria-label="이전 주" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <svg viewBox="0 0 20 20"><path d="m12 5-5 5 5 5" /></svg>
          </button>
          <button type="button" className="cs-arrow" title="다음 주" aria-label="다음 주" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <svg viewBox="0 0 20 20"><path d="m8 5 5 5-5 5" /></svg>
          </button>
        </div>
      </div>

      {state === "login" ? (
        <p className="cs-msg">업무 시스템에 로그인하면 볼 수 있어요. <Link href="/">로그인하러 가기</Link></p>
      ) : state === "error" ? (
        <p className="cs-msg">불러오지 못했어요. {error}</p>
      ) : (
        <div className={`cs-grid${state === "loading" ? " is-loading" : ""}`}>
          <div className="cs-dow">{DOW.map((d) => <div key={d}>{d}</div>)}</div>
          {Array.from({ length: WEEKS }, (_, w) => (
            <div className="cs-week" key={w}>
              {Array.from({ length: 7 }, (_, i) => {
                const date = addDays(weekStart, w * 7 + i);
                const list = byDay.get(date) ?? [];
                const weekend = i === 0 || i === 6;
                const day = +date.slice(8, 10);
                return (
                  <div
                    key={date}
                    className={`cs-day${weekend ? " is-off" : ""}${date === today ? " is-today" : ""}${overDay === date ? " is-over" : ""}`}
                    data-d={date}
                    onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest(".cs-card")) openNew(date); }}
                    onDragOver={(e) => {
                      if (!dragRef.current) return;
                      e.preventDefault();
                      setOverDay(date);
                      if (!(e.target as HTMLElement).closest(".cs-card")) setDropAt(null);
                    }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setOverDay(null); setDropAt(null); } }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const ev = dragRef.current;
                      const spot = dropAt;
                      dragRef.current = null;
                      setOverDay(null);
                      setDropAt(null);
                      if (!ev) return;
                      /* 같은 날 카드 위에 놓으면 순서 바꾸기, 다른 날이면 날짜 옮기기 */
                      if (list.some((x) => x.id === ev.id)) {
                        if (spot && spot.date === date && spot.id !== ev.id) void reorder(date, ev, spot.id, spot.before);
                      } else void move(ev, date);
                    }}
                  >
                    <div className="cs-dhead">
                      <button type="button" className="cs-plus" title="새로 만들기" aria-label={`${label(date)} 일정 만들기`} onClick={() => openNew(date)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" /></svg>
                      </button>
                      <span className="cs-num">{day === 1 ? `${+date.slice(5, 7)}월 1일` : day}</span>
                      <span className="cs-full">{label(date)} ({DOW[i]}){date === today ? " 오늘" : ""}</span>
                    </div>
                    {list.map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        className={`cs-card${dropAt?.date === date && dropAt.id === e.id ? (dropAt.before ? " is-drop-before" : " is-drop-after") : ""}`}
                        draggable
                        onClick={() => openEdit(e)}
                        onDragStart={(ev) => { dragRef.current = e; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", e.id); }}
                        onDragEnd={() => { dragRef.current = null; setOverDay(null); setDropAt(null); }}
                        onDragOver={(ev) => {
                          if (!dragRef.current) return;
                          const r = ev.currentTarget.getBoundingClientRect();
                          const before = ev.clientY < r.top + r.height / 2;
                          if (dropAt?.id !== e.id || dropAt.before !== before || dropAt.date !== date) setDropAt({ date, id: e.id, before });
                        }}
                        title={[e.title, e.place && `장소 ${e.place}`, e.people.length ? `담당 ${e.people.join(", ")}` : ""].filter(Boolean).join("\n")}
                      >
                        <span className="cs-ct">{e.title || "제목 없음"}{e.time ? ` ${e.time}` : ""}</span>
                        {e.place ? <span className="cs-cp">{e.place}</span> : null}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {menu ? (
        <div className="cs-menu" style={{ left: menu.x, top: menu.y }}>
          <h4>담당자</h4>
          {people.length ? people.map((p) => (
            <label key={p}>
              <input type="checkbox" checked={!hidePeople.includes(p)} onChange={(e) => setHidePeople((h) => (e.target.checked ? h.filter((x) => x !== p) : [...h, p]))} />
              {p}
            </label>
          )) : <p className="cs-menu-empty">이 2주에는 담당자가 적힌 일정이 없어요</p>}
          <hr />
          <button type="button" className="cs-mbtn" onClick={() => setHidePeople([])}>필터 지우기</button>
        </div>
      ) : null}

      {peek ? (
        <PagePeek
          key={peek.key}
          initial={peek.initial}
          newDate={peek.newDate}
          call={peekCall}
          onChange={upsert}
          onDelete={(e) => void remove(e)}
          onClose={() => setPeek(null)}
          toast={(t) => showToast(t)}
        />
      ) : null}

      {toast ? (
        <div className="cs-toast" role="status">
          <span>{toast.text}</span>
          {toast.undo ? <button type="button" onClick={() => { const u = toast.undo; setToast(null); u?.(); }}>되돌리기</button> : null}
        </div>
      ) : null}
    </main>
  );
}
