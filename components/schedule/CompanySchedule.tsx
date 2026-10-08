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
const titleTime = (e: CompanyEvent) => e.time || (e.title.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0] ?? "").padStart(5, "0");

function sortEvents(list: CompanyEvent[], sort: string) {
  return [...list].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "ko");
    const oa = a.order ?? 999, ob = b.order ?? 999;
    if (oa !== ob) return oa - ob;
    return (titleTime(a) || "99").localeCompare(titleTime(b) || "99") || a.title.localeCompare(b.title, "ko");
  });
}

function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem("company-schedule-view") || "null");
    return { hidePeople: Array.isArray(raw?.hidePeople) ? (raw.hidePeople as string[]) : [], sort: raw?.sort === "title" ? "title" : "order" };
  } catch {
    return { hidePeople: [] as string[], sort: "order" };
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
  const [sort, setSort] = useState("order");
  const [menu, setMenu] = useState<null | { kind: "filter" | "sort"; x: number; y: number }>(null);
  const [peek, setPeek] = useState<{ initial: CompanyEvent | null; newDate: string | null; key: number } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const dragRef = useRef<CompanyEvent | null>(null);
  const lastLoad = useRef(0);
  const peekOpen = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const from = weekStart;
  const to = addDays(weekStart, WEEKS * 7 - 1);

  useEffect(() => {
    const prefs = loadPrefs();
    setHidePeople(prefs.hidePeople);
    setSort(prefs.sort);
  }, []);
  useEffect(() => {
    try { localStorage.setItem("company-schedule-view", JSON.stringify({ hidePeople, sort })); } catch {}
  }, [hidePeople, sort]);

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
    for (const [d, list] of map) map.set(d, sortEvents(list, sort));
    return map;
  }, [events, visible, from, to, sort]);

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

  function openMenu(kind: "filter" | "sort", target: HTMLElement) {
    if (menu?.kind === kind) return setMenu(null);
    const r = target.getBoundingClientRect();
    setMenu({ kind, x: Math.max(8, Math.min(window.innerWidth - 248, r.right - 240)), y: r.bottom + 6 });
  }

  const m1 = +addDays(from, 1).slice(5, 7), m2 = +addDays(to, -1).slice(5, 7);
  const monthText = `${from.slice(0, 4)}년 ${m1}월${m1 === m2 ? "" : ` ~ ${m2}월`}`;
  const filtered = hidePeople.length > 0;

  return (
    <main className="cs">
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
          <button type="button" className={`cs-ic cs-ic-menu${sort !== "order" ? " is-on" : ""}`} title="정렬" aria-label="정렬" onClick={(e) => openMenu("sort", e.currentTarget)}>
            <svg viewBox="0 0 20 20"><path d="M6.5 15V5M3.8 7.7 6.5 5l2.7 2.7M13.5 5v10M10.8 12.3l2.7 2.7 2.7-2.7" /></svg>
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
                    onDragOver={(e) => { if (dragRef.current) { e.preventDefault(); setOverDay(date); } }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverDay(null); }}
                    onDrop={(e) => { e.preventDefault(); setOverDay(null); const ev = dragRef.current; dragRef.current = null; if (ev) void move(ev, date); }}
                  >
                    <div className="cs-dhead">
                      <button type="button" className="cs-plus" title="새로 만들기" aria-label={`${label(date)} 일정 만들기`} onClick={() => openNew(date)}>+</button>
                      <span className="cs-num">{day === 1 ? `${+date.slice(5, 7)}월 1일` : day}</span>
                      <span className="cs-full">{label(date)} ({DOW[i]}){date === today ? " 오늘" : ""}</span>
                    </div>
                    {list.map((e) => (
                      <button
                        type="button"
                        key={e.id}
                        className="cs-card"
                        draggable
                        onClick={() => openEdit(e)}
                        onDragStart={(ev) => { dragRef.current = e; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", e.id); }}
                        onDragEnd={() => { dragRef.current = null; setOverDay(null); }}
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
          {menu.kind === "filter" ? (
            <>
              <h4>담당자</h4>
              {people.length ? people.map((p) => (
                <label key={p}>
                  <input type="checkbox" checked={!hidePeople.includes(p)} onChange={(e) => setHidePeople((h) => (e.target.checked ? h.filter((x) => x !== p) : [...h, p]))} />
                  {p}
                </label>
              )) : <p className="cs-menu-empty">이 2주에는 담당자가 적힌 일정이 없어요</p>}
              <hr />
              <button type="button" className="cs-mbtn" onClick={() => setHidePeople([])}>필터 지우기</button>
            </>
          ) : (
            <>
              <h4>칸 안의 순서</h4>
              <label><input type="radio" name="cs-sort" checked={sort === "order"} onChange={() => setSort("order")} />정렬시간, 시각 순 (노션과 같음)</label>
              <label><input type="radio" name="cs-sort" checked={sort === "title"} onChange={() => setSort("title")} />이름 순</label>
            </>
          )}
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
