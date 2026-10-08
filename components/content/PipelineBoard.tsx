"use client";

import { useState } from "react";
import { ContentShell, useTip } from "@/components/content/ContentShell";
import { formatClock, formatMonthDay, useContentData, weekdayLabel } from "@/components/content/useContentData";
import { RUN_LABEL, runStageAt, stageRuns, type RunStage } from "@/components/content/pipelineRuns";
import type { PipelineAccount, PipelineData, PipelineSlot, Stage } from "@/lib/content-pipeline";

/*
 * 영상 한 편 = 네모 하나. 네모 안에 업로드 날짜와 요일을 적고 단계 색으로 칠한다.
 * 업로드가 없는 날(주말, 공휴일)은 아예 안 나온다. 주가 바뀌는 곳만 살짝 띄운다.
 * 덜 된 단계일수록 옅게, 다 된 단계일수록 진하게 (한 가지 파란색). 빈 칸은 빨간 점선.
 */
const STAGES: Array<{ key: Exclude<Stage, "empty">; label: string; help: string }> = [
  { key: "ready", label: "편집 끝", help: "편집이 끝나 올리기만 하면 되는 편" },
  { key: "edit", label: "편집 중", help: "편집자님께 맡겨서 초안이나 수정본을 기다리는 편" },
  { key: "shot", label: "촬영 소스", help: "찍어 두었지만 아직 편집을 맡기지 않은 편" },
  { key: "plan", label: "기획안", help: "기획안만 있고 아직 찍지 않은 편" },
];

const COUNTS = [12, 24] as const;
const BOARD_URL = "https://wellnessbox-board.vercel.app";

function dayLabel(date: string) {
  return `${formatMonthDay(date)} (${weekdayLabel(date)})`;
}

/** 받침 따라 을/를 */
function eul(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? `${word}을` : `${word}를`;
}

/** 월요일 날짜로 주를 나눈다 */
function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function slotTip(slot: PipelineSlot, account: PipelineAccount, isTarget: boolean) {
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
  if (isTarget && account.next) parts.push(`지금 가장 급한 편이에요. ${formatMonthDay(account.next.due)}까지 ${eul(account.next.label)} 끝내야 해요.`);
  parts.push("누르면 노션, 보드, 소스 폴더 링크가 아래에 펼쳐져요.");
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
  const [count, setCount] = useState<(typeof COUNTS)[number]>(12);
  const { bind, node } = useTip();

  return (
    <>
      <section className="content-card">
        <header className="content-head">
          <div>
            <h1 className="content-title">채널 파이프라인 현황</h1>
            <p className="content-sub">
              네모 하나가 앞으로 올릴 영상 한 편이에요. 노션 진행 상태로 칠했고, 급한 계정이 위에 와요.
            </p>
          </div>
          <div className="content-head-side">
            <span className="content-fresh" {...bind("노션 편집 진행도와 계정별 기획안을 5분마다 다시 읽어요.")}>
              노션 {formatClock(data.fetchedAt)} 기준
            </span>
            <div className="content-toggle" role="group" aria-label="보는 편수">
              {COUNTS.map((c) => (
                <button className={count === c ? "is-on" : ""} key={c} onClick={() => setCount(c)} type="button">
                  {c}편
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
          <span className="pipe-legend-item" {...bind("노션에 업로드 날짜가 없어서 빈 날에 순서대로 넣어 본 편")} tabIndex={0}>
            <i className="pipe-swatch stage-edit is-tentative" />날짜 미정
          </span>
          <span className="pipe-legend-item" {...bind("그 계정에서 지금 가장 먼저 챙겨야 하는 편")} tabIndex={0}>
            <i className="pipe-swatch is-target-swatch" />가장 급한 편
          </span>
        </div>

        <div className="pipe-rows">
          {data.accounts.map((account) => (
            <AccountRow account={account} bind={bind} count={count} key={account.key} today={data.today} />
          ))}
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
                      {stage.label} {account.stock[stage.key]}편
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
  count,
  today,
  bind,
}: {
  account: PipelineAccount;
  count: number;
  today: string;
  bind: Bind;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const slots = account.slots.slice(0, count);
  const pickedSlot = picked !== null ? slots[picked] : undefined;
  const runs = stageRuns(account, today);
  const level = account.next ? urgency(account.next.due, today) : "is-ok";
  const targetIndex = account.next ? account.slots.findIndex((s) => s.date === account.next?.forDate) : -1;

  const actionText = account.next
    ? account.next.due < today
      ? `${account.next.label} 늦음 (마감 ${formatMonthDay(account.next.due)})`
      : `${account.next.due === today ? "오늘" : formatMonthDay(account.next.due)}까지 ${account.next.label}`
    : "준비 끝";

  return (
    <div className="pipe-row">
      <div className="pipe-info">
        <div className="pipe-name" {...bind(account.note)} tabIndex={0}>
          {account.name}
          <small>{account.owner}</small>
        </div>
        <ShootLine account={account} />
        {account.stale ? (
          <p
            className="pipe-stale"
            {...bind("노션 업로드 예정일이 지났는데 진행 상태가 업로드 완료로 안 바뀐 편이에요. 상태를 고쳐 주세요.")}
            tabIndex={0}
          >
            날짜 지난 편 {account.stale}개 상태 확인
          </p>
        ) : null}
      </div>

      <div className="pipe-track">
        <div className="pipe-scroll-x">
        <div className="pipe-squares">
          {slots.map((slot, index) => {
            const gap = index > 0 && weekOf(slot.date) !== weekOf(slots[index - 1].date);
            const isTarget = index === targetIndex;
            const className = [
              "pipe-sq",
              `stage-${slot.stage}`,
              slot.tentative ? "is-tentative" : "",
              isTarget ? "is-target" : "",
              gap ? "is-week-start" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const body = (
              <>
                <span className="pipe-sq-date">{formatMonthDay(slot.date)}</span>
                <span className={`pipe-sq-dow${slot.offDay ? " is-off" : ""}`}>
                  {slot.holiday ? "공휴일" : weekdayLabel(slot.date)}
                </span>
              </>
            );
            return (
              <button
                aria-pressed={picked === index}
                className={`${className}${picked === index ? " is-picked" : ""}`}
                key={`${slot.date}-${index}`}
                onClick={() => setPicked(picked === index ? null : index)}
                type="button"
                {...bind(slotTip(slot, account, isTarget))}
              >
                {body}
              </button>
            );
          })}
        </div>
        <div className="pipe-bar" aria-hidden="true">
          {slots.map((slot, index) => {
            const gap = index > 0 && weekOf(slot.date) !== weekOf(slots[index - 1].date);
            const stage = runStageAt(index, runs);
            return (
              <span
                className={`pipe-bar-cell stage-${stage}${gap ? " is-week-start" : ""}${index === 0 ? " is-first" : ""}${index === slots.length - 1 ? " is-last" : ""}`}
                key={`${slot.date}-${index}`}
              />
            );
          })}
        </div>
        </div>
        <p className="pipe-runs">
          {(["ready", "edit", "shot", "plan"] as RunStage[]).map((stage) => {
            const run = runs[stage];
            return (
              <span
                className={run.count ? "" : "is-none"}
                key={stage}
                {...bind(
                  run.count
                    ? `${RUN_LABEL[stage]} 빈틈없이 ${run.count}편, ${dayLabel(run.last!)} 업로드까지 채워져 있어요. 오늘부터 ${run.days}일분이에요.${run.beyond ? " 8주 안 업로드가 모두 채워졌어요." : ""}`
                    : `다음 업로드할 영상부터 ${RUN_LABEL[stage].replace("까지", "")} 단계가 아니에요.`,
                )}
                tabIndex={0}
              >
                <i className={`pipe-swatch stage-${stage}`} />
                {RUN_LABEL[stage]}{" "}
                {run.count ? (
                  <>
                    <b>{formatMonthDay(run.last!)}</b> {run.beyond ? `${run.days}일분 넘게` : `${run.days}일분`}
                  </>
                ) : (
                  <b>없음</b>
                )}
              </span>
            );
          })}
        </p>
        <p
          className={`pipe-next ${level}`}
          {...bind(
            account.next
              ? `${dayLabel(account.next.forDate)} 업로드분을 맞추려면 ${formatMonthDay(account.next.due)}까지 ${eul(account.next.label)} ${account.next.due < today ? "끝냈어야 해요. 지금 바로 챙겨야 해요." : "끝내야 해요."}`
              : "앞으로 8주 업로드분이 모두 편집까지 끝났어요.",
          )}
          tabIndex={0}
        >
          {actionText}
          {account.next ? <span> ({formatMonthDay(account.next.forDate)} 업로드분, 빨간 테두리)</span> : null}
        </p>
        {pickedSlot ? <SlotDetail slot={pickedSlot} /> : null}
      </div>
    </div>
  );
}

/** 네모를 누르면 줄 아래에 펼치는 그 영상의 정보와 링크 */
function SlotDetail({ slot }: { slot: PipelineSlot }) {
  const stage = STAGES.find((s) => s.key === slot.stage);
  return (
    <div className="pipe-detail">
      <p className="pipe-detail-title">
        {dayLabel(slot.date)} {slot.stage === "empty" ? "올릴 영상 없음" : slot.title}
      </p>
      {slot.stage !== "empty" ? (
        <p className="pipe-detail-meta">
          {stage?.label}, 노션 상태 {slot.status}
          {slot.editor && slot.editor !== "미정" ? `, 편집 ${slot.editor}` : ""}
          {slot.tentative ? ", 노션에 업로드 날짜 없음" : ""}
        </p>
      ) : null}
      <p className="pipe-detail-links">
        {slot.url ? (
          <a href={slot.url} rel="noopener noreferrer" target="_blank">
            노션
          </a>
        ) : null}
        <a href={BOARD_URL} rel="noopener noreferrer" target="_blank">
          보드에서 보기
        </a>
        {slot.folder ? (
          <a href={slot.folder} rel="noopener noreferrer" target="_blank">
            소스 폴더
          </a>
        ) : (
          <span className="is-none">소스 폴더 없음</span>
        )}
      </p>
    </div>
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
