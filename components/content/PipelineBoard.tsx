"use client";

import { useState } from "react";
import { ContentShell, useTip } from "@/components/content/ContentShell";
import { formatClock, formatMonthDay, useContentData, weekdayLabel } from "@/components/content/useContentData";
import type { PipelineAccount, PipelineData, PipelineSlot, Stage } from "@/lib/content-pipeline";

/* 덜 된 단계일수록 옅게, 다 된 단계일수록 진하게 (한 가지 색으로 순서를 보인다). 빈 칸은 빨간 점선 */
const STAGES: Array<{ key: Exclude<Stage, "empty">; label: string; short: string; help: string }> = [
  { key: "ready", label: "편집 끝", short: "편집 끝", help: "편집이 끝나 올리기만 하면 되는 편" },
  { key: "edit", label: "편집 중", short: "편집 중", help: "편집자님께 맡겨서 초안이나 수정본을 기다리는 편" },
  { key: "shot", label: "촬영 소스", short: "촬영 소스", help: "찍어 두었지만 아직 편집을 맡기지 않은 편" },
  { key: "plan", label: "기획안", short: "기획안", help: "기획안만 있고 아직 찍지 않은 편" },
];

function dayLabel(date: string) {
  return `${formatMonthDay(date)} (${weekdayLabel(date)})`;
}

/** 받침 따라 을/를 */
function eul(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? `${word}을` : `${word}를`;
}

function daysText(days: number | null) {
  if (days === null) return "8주 넘게";
  return `${days}일치`;
}

function slotTip(slot: PipelineSlot, account: PipelineAccount) {
  const when = dayLabel(slot.date);
  if (slot.stage === "empty") {
    return `${when} ${account.name} 업로드 칸이 비어 있어요. 기획안부터 써야 해요.`;
  }
  const stage = STAGES.find((s) => s.key === slot.stage);
  const parts = [`${when} ${slot.title}`, `노션 상태: ${slot.status}`];
  if (slot.editor && slot.editor !== "미정") parts.push(`편집: ${slot.editor}`);
  if (stage) parts.push(`${stage.label} 단계예요.`);
  if (slot.tentative) parts.push("노션에 업로드 날짜가 없어서 빈 날에 순서대로 넣어 봤어요.");
  if (slot.offDay) parts.push("업로드 요일이 아닌 날에 잡혀 있어요.");
  return parts.join("\n");
}

function urgency(due: string, today: string) {
  if (due <= today) return "is-late";
  const diff = (Date.parse(due) - Date.parse(today)) / 86_400_000;
  return diff <= 3 ? "is-soon" : "is-ok";
}

export function PipelineBoard() {
  const state = useContentData<PipelineData>("/api/content-board/pipeline");
  return (
    <ContentShell active="/content-board/pipeline" state={state}>
      {(data) => <Board data={data} />}
    </ContentShell>
  );
}

function Board({ data }: { data: PipelineData }) {
  const [weeks, setWeeks] = useState<4 | 8>(4);
  const { bind, node } = useTip();
  const dates = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(`${data.start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <>
      <section className="content-card">
        <header className="content-head">
          <div>
            <h1 className="content-title">채널 파이프라인 현황</h1>
            <p className="content-sub">
              내일부터 올릴 업로드 칸을 노션 진행 상태로 칠했어요. 계정마다 며칠치가 준비됐는지 보고, 급한 계정이 위에 와요.
            </p>
          </div>
          <div className="content-head-side">
            <span className="content-fresh" {...bind("노션 편집 진행도와 계정별 기획안을 5분마다 다시 읽어요.")}>
              노션 {formatClock(data.fetchedAt)} 기준
            </span>
            <div className="content-toggle" role="group" aria-label="보는 기간">
              {([4, 8] as const).map((w) => (
                <button className={weeks === w ? "is-on" : ""} key={w} onClick={() => setWeeks(w)} type="button">
                  {w}주
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="pipe-legend">
          {STAGES.map((stage) => (
            <span className="pipe-legend-item" key={stage.key} {...bind(stage.help)} tabIndex={0}>
              <i className={`pipe-swatch stage-${stage.key}`} />
              {stage.label}
            </span>
          ))}
          <span className="pipe-legend-item" {...bind("올릴 영상이 아직 정해지지 않은 업로드 칸")} tabIndex={0}>
            <i className="pipe-swatch stage-empty" />빈 칸
          </span>
          <span className="pipe-legend-item" {...bind("노션에 날짜가 없어서 빈 날에 순서대로 넣어 본 편")} tabIndex={0}>
            <i className="pipe-swatch stage-edit is-tentative" />날짜 미정
          </span>
        </div>

        <div className="pipe-scroll">
          <div className="pipe-grid" style={{ gridTemplateColumns: `var(--pipe-info) repeat(${dates.length}, minmax(var(--pipe-cell), 1fr))` }}>
            <div className="pipe-corner">계정</div>
            {dates.map((date) => {
              const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
              const first = date.endsWith("-01") || date === data.start;
              return (
                <div
                  className={`pipe-date${dow === 0 || dow === 6 ? " is-weekend" : ""}${date === data.today ? " is-today" : ""}${dow === 1 ? " is-monday" : ""}`}
                  key={date}
                >
                  <span className="pipe-date-month">{first ? `${Number(date.slice(5, 7))}월` : ""}</span>
                  <span className="pipe-date-day">{Number(date.slice(8, 10))}</span>
                  <span className="pipe-date-dow">{weekdayLabel(date)}</span>
                </div>
              );
            })}

            {data.accounts.map((account) => (
              <AccountRow account={account} bind={bind} dates={dates} key={account.key} today={data.today} />
            ))}
          </div>
        </div>
      </section>

      {data.waiting.length ? (
        <section className="content-card">
          <h2 className="content-section-title">업로드 전 계정</h2>
          <div className="pipe-waiting">
            {data.waiting.map((account) => (
              <div className="pipe-waiting-item" key={account.key}>
                <div className="pipe-name">
                  {account.name}
                  <small>{account.owner}</small>
                </div>
                <p className="pipe-note">{account.note}</p>
                <p className="pipe-stock">
                  {STAGES.map((stage) => (
                    <span key={stage.key}>
                      <i className={`pipe-swatch stage-${stage.key}`} />
                      {stage.short} {account.stock[stage.key]}편
                    </span>
                  ))}
                </p>
                <ShootLine account={account} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {data.missing.length ? (
        <section className="content-card">
          <h2 className="content-section-title">노션 연결이 필요한 DB</h2>
          <p className="content-sub">
            아래 DB는 이 사이트가 못 읽어서 기획안 수가 빠져 있어요. 노션에서 DB를 열고 오른쪽 위 점 세 개 메뉴의
            「연결」에서 「여형준」을 추가하면 5분 안에 반영돼요.
          </p>
          <ul className="pipe-missing">
            {data.missing.map((m) => (
              <li key={m.url}>
                <a href={m.url} rel="noopener noreferrer" target="_blank">
                  {m.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {node}
    </>
  );
}

type Bind = ReturnType<typeof useTip>["bind"];

function AccountRow({
  account,
  dates,
  today,
  bind,
}: {
  account: PipelineAccount;
  dates: string[];
  today: string;
  bind: Bind;
}) {
  const byDate = new Map<string, PipelineSlot[]>();
  for (const slot of account.slots) byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), slot]);

  return (
    <>
      <div className="pipe-info">
        <div className="pipe-name" {...bind(account.note)} tabIndex={0}>
          {account.name}
          <small>{account.owner}</small>
        </div>
        {account.next ? (
          <p
            className={`pipe-next ${urgency(account.next.due, today)}`}
            {...bind(
              account.next.due < today
                ? `${dayLabel(account.next.forDate)} 업로드분을 맞추려면 ${formatMonthDay(account.next.due)}까지 ${eul(account.next.label)} 끝냈어야 해요. 지금 바로 챙겨야 해요.`
                : `${dayLabel(account.next.forDate)} 업로드분을 맞추려면 ${formatMonthDay(account.next.due)}까지 ${eul(account.next.label)} 끝내야 해요.`,
            )}
            tabIndex={0}
          >
            {account.next.due < today
              ? `${account.next.label} 늦음`
              : `${account.next.due === today ? "오늘" : formatMonthDay(account.next.due)}까지 ${account.next.label}`}
            <span> ({formatMonthDay(account.next.forDate)} 업로드분)</span>
          </p>
        ) : (
          <p className="pipe-next is-ok">8주치 준비 끝</p>
        )}
        <p className="pipe-days">
          {STAGES.filter((s) => s.key !== "edit").map((stage) => (
            <span
              key={stage.key}
              {...bind(
                stage.key === "ready"
                  ? "내일부터 편집이 끝난 편으로 끊기지 않고 올릴 수 있는 날 수"
                  : stage.key === "shot"
                    ? "내일부터 찍어 둔 소스(편집 중 포함)로 채울 수 있는 날 수"
                    : "내일부터 기획안까지 포함해서 채울 수 있는 날 수",
              )}
              tabIndex={0}
            >
              <i className={`pipe-swatch stage-${stage.key}`} />
              {stage.key === "ready" ? "편집 끝" : stage.key === "shot" ? "소스" : "기획"} {daysText(account.days[stage.key])}
            </span>
          ))}
        </p>
        <ShootLine account={account} />
        {account.stale ? (
          <p className="pipe-stale" {...bind("노션 업로드 예정일이 지났는데 진행 상태가 업로드 완료로 안 바뀐 편이에요. 상태를 고쳐 주세요.")} tabIndex={0}>
            날짜 지난 편 {account.stale}개 상태 확인
          </p>
        ) : null}
      </div>
      {dates.map((date) => {
        const slots = byDate.get(date) ?? [];
        const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
        return (
          <div
            className={`pipe-cell${dow === 0 || dow === 6 ? " is-weekend" : ""}${date === today ? " is-today" : ""}${dow === 1 ? " is-monday" : ""}`}
            key={date}
          >
            {slots.map((slot, index) =>
              slot.url ? (
                <a
                  className={`pipe-slot stage-${slot.stage}${slot.tentative ? " is-tentative" : ""}${slot.offDay ? " is-offday" : ""}`}
                  href={slot.url}
                  key={index}
                  rel="noopener noreferrer"
                  target="_blank"
                  {...bind(slotTip(slot, account))}
                />
              ) : (
                <span className={`pipe-slot stage-${slot.stage}`} key={index} tabIndex={0} {...bind(slotTip(slot, account))} />
              ),
            )}
          </div>
        );
      })}
    </>
  );
}

function ShootLine({ account }: { account: PipelineAccount }) {
  const next = account.shoots[0];
  return next ? (
    <p className="pipe-shoot">
      다음 촬영 {formatMonthDay(next.date)} {next.title.replace(/\s*\d{1,2}:\d{2}\s*/, " ").trim()}
    </p>
  ) : (
    <p className="pipe-shoot is-none">노션 일정에 촬영 날짜 없음</p>
  );
}
