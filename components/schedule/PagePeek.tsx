"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BodyEditor, segsToHtml } from "@/components/schedule/body-editor";
import type { Block, Seg } from "@/components/schedule/body-editor";

/**
 * 일정을 누르면 뜨는 가운데 큰 창. 노션 페이지 열기와 같은 순서: 큰 제목, 속성 줄(날짜, 담당자, 장소, 정렬시간, 그 밖의 속성, 속성 추가),
 * 댓글, 본문. 노션처럼 저장 버튼 없이 고치면 바로 노션에 저장한다(글은 잠깐 쉬면, 날짜와 담당자는 바로).
 * 새로 만들 때는 제목을 적는 순간 노션에 페이지가 생기고, 그다음부터 본문과 댓글을 쓸 수 있다.
 */

export type PeekEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  time: string;
  place: string;
  people: string[];
  who: Array<{ id: string; name: string }>;
  /** 노션 사람이 아닌 담당자 (노션 「담당자 이름」 글 칸) */
  names?: string[];
  order: number | null;
  url: string;
  extra: Array<{ name: string; value: string }>;
};
type Person = { id: string; name: string };
type Comment = { id: string; at: string; who: string; segs: Seg[] };
type Call = <T>(path: string, init?: RequestInit) => Promise<T>;
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const longDate = (d: string) => `${d.slice(0, 4)}년 ${+d.slice(5, 7)}월 ${+d.slice(8, 10)}일`;
const dowOf = (d: string) => DOW[new Date(`${d}T00:00:00Z`).getUTCDay()];
const timeAgo = (iso: string) => {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
};

const Icon = {
  date: <svg viewBox="0 0 20 20"><rect x="3.5" y="4.5" width="13" height="12" rx="2" /><path d="M3.5 8.5h13M7 3v3M13 3v3" /></svg>,
  people: <svg viewBox="0 0 20 20"><circle cx="8" cy="7.5" r="3" /><path d="M2.8 16c.7-2.8 2.7-4.3 5.2-4.3s4.5 1.5 5.2 4.3M13.5 4.8a3 3 0 0 1 0 5.4M15.2 12.2c1 .7 1.7 2 2 3.8" /></svg>,
  text: <svg viewBox="0 0 20 20"><path d="M4 5h12M4 10h12M4 15h7" /></svg>,
  num: <svg viewBox="0 0 20 20"><path d="M8 3.5 6.5 16.5M13.5 3.5 12 16.5M4 7.5h12.5M3.5 12.5H16" /></svg>,
  other: <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5" /><path d="M10 7v3.5l2 1.5" /></svg>,
  plus: <svg viewBox="0 0 20 20"><path d="M10 4.5v11M4.5 10h11" /></svg>,
  open: <svg viewBox="0 0 20 20"><path d="M11.5 4h4.5v4.5M16 4l-5.5 5.5M8.5 16H4v-4.5M4 16l5.5-5.5" /></svg>,
  trash: <svg viewBox="0 0 20 20"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" /></svg>,
  close: <svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>,
  comment: <svg viewBox="0 0 20 20"><path d="M4 5.5h12v8H9l-3.5 3v-3H4z" /></svg>,
};

export function PagePeek({
  initial,
  newDate,
  call,
  onChange,
  onDelete,
  onClose,
  toast,
}: {
  initial: PeekEvent | null;
  newDate: string | null;
  call: Call;
  onChange: (e: PeekEvent) => void;
  onDelete: (e: PeekEvent) => void;
  onClose: () => void;
  toast: (text: string) => void;
}) {
  const [ev, setEv] = useState<PeekEvent | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [place, setPlace] = useState(initial?.place ?? "");
  const [order, setOrder] = useState(initial?.order == null ? "" : String(initial.order));
  const [date, setDate] = useState(initial?.start ?? newDate ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [editDate, setEditDate] = useState(false);
  const [pickPeople, setPickPeople] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [findPerson, setFindPerson] = useState("");
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(!!initial);
  const [bodyErr, setBodyErr] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const editorBox = useRef<HTMLDivElement>(null);
  const editor = useRef<BodyEditor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const propTimer = useRef<number | undefined>(undefined);
  const pendingProps = useRef<Record<string, unknown>>({});
  const evRef = useRef(ev);
  const creating = useRef<Promise<PeekEvent | null> | null>(null);
  evRef.current = ev;

  /* 제목 칸 높이를 글에 맞춘다 */
  useEffect(() => {
    const t = titleRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = `${t.scrollHeight}px`;
  }, [title]);
  useEffect(() => { if (!initial) titleRef.current?.focus(); }, [initial]);

  const loadPage = useCallback(async (id: string) => {
    setLoading(true);
    setBodyErr("");
    try {
      const data = await call<{ event: PeekEvent; blocks: Block[]; comments: Comment[] | null; people: Person[] }>(`/api/schedule/page?id=${id}`);
      setPeople(data.people);
      setComments(data.comments);
      if (data.event) { setEv(data.event); onChange(data.event); }
      editor.current?.destroy();
      if (editorBox.current) {
        editor.current = new BodyEditor(
          editorBox.current,
          data.blocks,
          {
            body: (ops) => call("/api/schedule/page", { method: "POST", body: JSON.stringify({ id, action: "body", ops }) }),
            start: (blocks) => call("/api/schedule/page", { method: "POST", body: JSON.stringify({ id, action: "start", blocks }) }),
          },
          (s, msg) => { setState(s); if (s === "error") setBodyErr(msg ?? "본문을 저장하지 못했어요"); },
        );
      }
    } catch (err) {
      setBodyErr(err instanceof Error ? err.message : "불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }, [call, onChange]);

  useEffect(() => {
    if (initial) void loadPage(initial.id);
    return () => editor.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 새 일정: 제목을 처음 적으면 노션에 만든다 */
  const ensure = useCallback(async (): Promise<PeekEvent | null> => {
    if (evRef.current) return evRef.current;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      setState("saving");
      try {
        const res = await call<{ event: PeekEvent }>("/api/schedule", {
          method: "POST",
          body: JSON.stringify({ title: titleRef.current?.value.trim() || "제목 없음", date, end: end || null, time: time || null, place, order: order === "" ? null : Number(order) }),
        });
        setEv(res.event);
        evRef.current = res.event;
        onChange(res.event);
        setState("saved");
        void loadPage(res.event.id);
        return res.event;
      } catch (err) {
        setState("error");
        toast(err instanceof Error ? err.message : "만들지 못했어요");
        creating.current = null;
        return null;
      }
    })();
    return creating.current;
  }, [call, date, end, time, place, order, onChange, loadPage, toast]);

  const flushProps = useCallback(async () => {
    window.clearTimeout(propTimer.current);
    const fields = pendingProps.current;
    pendingProps.current = {};
    if (!Object.keys(fields).length) return;
    const cur = evRef.current ?? (await ensure());
    if (!cur) return;
    setState("saving");
    try {
      const res = await call<{ event: PeekEvent }>("/api/schedule", { method: "PATCH", body: JSON.stringify({ id: cur.id, ...fields }) });
      setEv(res.event);
      onChange(res.event);
      setState("saved");
    } catch (err) {
      setState("error");
      toast(err instanceof Error ? err.message : "저장하지 못했어요");
    }
  }, [call, ensure, onChange, toast]);

  const queue = useCallback((fields: Record<string, unknown>, wait = 700) => {
    Object.assign(pendingProps.current, fields);
    setState("dirty");
    window.clearTimeout(propTimer.current);
    propTimer.current = window.setTimeout(() => void flushProps(), wait);
  }, [flushProps]);

  async function close() {
    try {
      await flushProps();
      await editor.current?.flush();
    } finally {
      onClose();
    }
  }

  function setDateField(next: { date?: string; end?: string; time?: string }) {
    const d = next.date ?? date, e = next.end ?? end, t = next.time ?? time;
    if (next.date !== undefined) setDate(d);
    if (next.end !== undefined) setEnd(e);
    if (next.time !== undefined) setTime(t);
    if (!d) return;
    if (!evRef.current && !title.trim()) return;
    queue({ date: d, end: e && e > d ? e : null, time: t || null }, 0);
  }

  async function togglePerson(p: Person) {
    const cur = evRef.current ?? (await ensure());
    if (!cur) return;
    const ids = cur.who.some((w) => w.id === p.id) ? cur.who.filter((w) => w.id !== p.id) : [...cur.who, p];
    setEv({ ...cur, who: ids, people: [...ids.map((w) => w.name), ...(cur.names ?? [])] });
    queue({ people: ids.map((w) => w.id) }, 0);
  }

  /* 노션 사람 목록에 없는 사람은 이름만 글로 (노션 「담당자 이름」 칸) */
  async function setNames(next: string[]) {
    const cur = evRef.current ?? (await ensure());
    if (!cur) return;
    setEv({ ...cur, names: next, people: [...cur.who.map((w) => w.name), ...next] });
    queue({ names: next }, 0);
  }
  function addTyped() {
    const name = findPerson.trim().replace(/[,，、]/g, " ").slice(0, 30).trim();
    if (!name) return;
    const hit = people.find((p) => p.name === name);
    if (hit) { if (!ev?.who.some((w) => w.id === hit.id)) void togglePerson(hit); }
    else if (!(ev?.names ?? []).includes(name)) void setNames([...(ev?.names ?? []), name]);
    setFindPerson("");
  }

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    const cur = evRef.current ?? (await ensure());
    if (!cur) return;
    try {
      const res = await call<{ comment: Comment }>("/api/schedule/page", { method: "POST", body: JSON.stringify({ id: cur.id, action: "comment", text }) });
      setComments((c) => [...(c ?? []), res.comment]);
      setComment("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "댓글을 남기지 못했어요");
    }
  }

  const stateText = { idle: "", dirty: "고치는 중", saving: "노션에 저장 중", saved: "노션에 저장됨", error: "저장 안 됨" }[state];
  const dateText = date ? `${longDate(date)} (${dowOf(date)})${time ? ` ${time}` : ""}${end && end > date ? ` → ${longDate(end)}` : ""}` : "비어 있음";

  return (
    <div className="pk-back" onMouseDown={(e) => { if (e.target === e.currentTarget) void close(); }}>
      <div className="pk" role="dialog" aria-modal="true" aria-label={title || "새 일정"} onKeyDown={(e) => { if (e.key === "Escape" && !pickPeople && !editDate) void close(); }}>
        <div className="pk-top">
          <button type="button" className="pk-ic" title="닫기" aria-label="닫기" onClick={() => void close()}>{Icon.close}</button>
          {ev ? <a className="pk-ic" href={ev.url} target="_blank" rel="noopener" title="노션에서 열기" aria-label="노션에서 열기">{Icon.open}</a> : null}
          <span className={`pk-state is-${state}`}>{stateText}</span>
          {ev ? <button type="button" className="pk-ic pk-del" title="휴지통으로" aria-label="휴지통으로" onClick={() => onDelete(ev)}>{Icon.trash}</button> : null}
        </div>

        <div className="pk-scroll">
          <textarea
            ref={titleRef}
            className="pk-title"
            rows={1}
            maxLength={200}
            placeholder="제목 없음"
            value={title}
            onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) queue({ title: e.target.value }, evRef.current ? 700 : 900); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void flushProps(); (editorBox.current?.querySelector(".pb-rt") as HTMLElement | null)?.focus(); } }}
          />

          <div className="pk-props">
            <div className="pk-row">
              <span className="pk-name">{Icon.date}날짜</span>
              {editDate ? (
                <div className="pk-val pk-date" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditDate(false); }}>
                  <input type="date" value={date} autoFocus onChange={(e) => setDateField({ date: e.target.value })} aria-label="날짜" />
                  <input type="time" value={time} onChange={(e) => setDateField({ time: e.target.value })} aria-label="시각" />
                  <span>끝나는 날</span>
                  <input type="date" value={end} min={date} onChange={(e) => setDateField({ end: e.target.value })} aria-label="끝나는 날" />
                  {end ? <button type="button" onClick={() => setDateField({ end: "" })}>끝나는 날 빼기</button> : null}
                </div>
              ) : (
                <button type="button" className="pk-val" onClick={() => setEditDate(true)}>{dateText}</button>
              )}
            </div>

            <div className="pk-row">
              <span className="pk-name">{Icon.people}담당자</span>
              <div className="pk-val pk-people">
                <button type="button" className="pk-chips" onClick={() => setPickPeople((v) => !v)}>
                  {ev?.who.length || ev?.names?.length ? (
                    <>
                      {ev.who.map((p) => <span key={p.id} className="pk-chip"><i>{p.name.slice(0, 1)}</i>{p.name}</span>)}
                      {(ev.names ?? []).map((n) => <span key={`n-${n}`} className="pk-chip"><i>{n.slice(0, 1)}</i>{n}</span>)}
                    </>
                  ) : <span className="pk-empty">비어 있음</span>}
                </button>
                {pickPeople ? (
                  <div className="pk-pop" onMouseLeave={() => setPickPeople(false)}>
                    <input
                      className="pk-pop-find"
                      autoFocus
                      placeholder="이름 찾기, 없으면 적고 Enter"
                      maxLength={30}
                      value={findPerson}
                      onChange={(e) => setFindPerson(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } if (e.key === "Escape") { e.stopPropagation(); setPickPeople(false); } }}
                    />
                    {(ev?.names ?? []).map((n) => (
                      <label key={`n-${n}`}>
                        <input type="checkbox" checked onChange={() => void setNames((ev?.names ?? []).filter((x) => x !== n))} />
                        <i>{n.slice(0, 1)}</i>{n}
                      </label>
                    ))}
                    {people.filter((p) => !findPerson.trim() || p.name.includes(findPerson.trim())).map((p) => (
                      <label key={p.id}>
                        <input type="checkbox" checked={!!ev?.who.some((w) => w.id === p.id)} onChange={() => void togglePerson(p)} />
                        <i>{p.name.slice(0, 1)}</i>{p.name}
                      </label>
                    ))}
                    {findPerson.trim() && !people.some((p) => p.name === findPerson.trim()) && !(ev?.names ?? []).includes(findPerson.trim()) ? (
                      <button type="button" className="pk-pop-add" onClick={addTyped}>+ 「{findPerson.trim()}」 담당자로 넣기</button>
                    ) : null}
                    <p className="pk-pop-note">노션 사람 목록에 없는 이름은 노션 「담당자 이름」 칸에 글로 저장해요</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="pk-row">
              <span className="pk-name">{Icon.text}장소</span>
              <input className="pk-val pk-input" placeholder="비어 있음" maxLength={200} value={place} onChange={(e) => { setPlace(e.target.value); queue({ place: e.target.value }); }} />
            </div>

            <div className="pk-row">
              <span className="pk-name">{Icon.num}정렬시간</span>
              <input className="pk-val pk-input" type="number" placeholder="비어 있음" value={order} onChange={(e) => { setOrder(e.target.value); queue({ order: e.target.value === "" ? null : Number(e.target.value) }); }} />
            </div>

            {ev?.extra.map((x) => (
              <div className="pk-row" key={x.name}>
                <span className="pk-name">{Icon.other}{x.name}</span>
                <span className="pk-val pk-ro" title="이 속성은 노션에서 고쳐요">{x.value || "비어 있음"}</span>
              </div>
            ))}

            <div className="pk-row">
              <button type="button" className="pk-name pk-add" onClick={() => toast("속성 추가는 노션의 「일정」 데이터베이스에서 해 주세요. 추가하면 여기에도 바로 보여요")}>
                {Icon.plus}속성 추가
              </button>
            </div>
          </div>

          <div className="pk-comments">
            {comments?.map((c) => (
              <div className="pk-cm" key={c.id}>
                <i>{c.who.slice(0, 1)}</i>
                <div>
                  <b>{c.who}</b> <time>{timeAgo(c.at)}</time>
                  <p dangerouslySetInnerHTML={{ __html: segsToHtml(c.segs) }} />
                </div>
              </div>
            ))}
            <div className="pk-cm pk-cm-new">
              <i className="pk-cm-me">{Icon.comment}</i>
              <input
                placeholder={comments === null && ev ? "댓글을 읽지 못했어요" : "댓글 추가..."}
                value={comment}
                maxLength={2000}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void sendComment(); } }}
              />
            </div>
          </div>

          <div className="pk-body">
            {!ev ? <p className="pk-hint">제목을 적으면 노션에 일정이 만들어지고, 여기에 본문을 쓸 수 있어요.</p> : null}
            {loading ? <p className="pk-hint">노션에서 본문을 불러오는 중이에요.</p> : null}
            {bodyErr ? (
              <p className="pk-err">
                {bodyErr} {ev ? <button type="button" onClick={() => void loadPage(ev.id)}>노션에서 다시 불러오기</button> : null}
              </p>
            ) : null}
            <div ref={editorBox} className="pk-editor" />
          </div>
        </div>
      </div>
    </div>
  );
}
