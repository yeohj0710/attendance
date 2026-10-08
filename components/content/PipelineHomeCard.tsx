"use client";

import Link from "next/link";
import { formatMonthDay, useContentData } from "@/components/content/useContentData";
import { runStageAt, stageRuns } from "@/components/content/pipelineRuns";
import type { PipelineAccount, PipelineData } from "@/lib/content-pipeline";
import "./pipeline-card.css";

/* 출퇴근기록부 이름 → 현황판 담당 이름 (components/employee/ContentTeamToday.tsx 의 사람 키와 같다) */
const OWNER_BY_WHO: Record<string, string> = {
  kim: "김호준 PD님",
  song: "송아영 PD님",
  kwon: "권현우 PD님",
  lee: "이민우님",
};

const SHOW_SLOTS = 12;

function actionText(account: PipelineAccount, today: string) {
  const next = account.next;
  if (!next) return "8주치 준비 끝";
  if (next.due < today) return `${next.label} 늦음 (${formatMonthDay(next.forDate)} 업로드분)`;
  return `${next.due === today ? "오늘" : formatMonthDay(next.due)}까지 ${next.label} (${formatMonthDay(next.forDate)} 업로드분)`;
}

/**
 * 업무 시스템 첫 화면의 채널 현황 요약. PD님은 내 계정, 관리자는 급한 계정 3곳.
 * 데이터는 채널 현황판과 같은 /api/content-board/pipeline (노션 5분 캐시)이라 노션 호출이 늘지 않는다.
 */
export function PipelineHomeCard({ who }: { who: string | null }) {
  const state = useContentData<PipelineData>("/api/content-board/pipeline");
  if (state.kind !== "ready") return null;

  const { data } = state;
  const owner = who ? OWNER_BY_WHO[who] : null;
  const accounts = owner ? data.accounts.filter((a) => a.owner === owner) : data.accounts.slice(0, 3);
  if (!accounts.length) return null;

  return (
    <div className="maple-quest mt-4 pipe-card">
      <div className="maple-quest-head">
        <span className="maple-quest-title">
          {owner ? "내 채널 현황" : "급한 채널 3곳"}
          <small>CHANNEL</small>
        </span>
        <Link className="maple-quest-link" href="/content-board/pipeline">
          전체 보기
        </Link>
      </div>
      <div className="pipe-card-body">
        {accounts.map((account) => {
          const runs = stageRuns(account, data.today);
          const slots = account.slots.slice(0, SHOW_SLOTS);
          const due = account.next?.due;
          const level = !due
            ? ""
            : due <= data.today
              ? " is-late"
              : Date.parse(due) - Date.parse(data.today) <= 3 * 86_400_000
                ? " is-soon"
                : "";
          return (
            <Link className="pipe-card-row" href="/content-board/pipeline" key={account.key}>
              <span className="pipe-card-name">{account.name}</span>
              <span className="pipe-card-bar" aria-hidden="true">
                {slots.map((slot, index) => (
                  <i className={`pc-${runStageAt(index, runs)}`} key={`${slot.date}-${index}`} />
                ))}
              </span>
              <span className="pipe-card-runs">
                편집 끝 <b>{runs.ready.count ? `${formatMonthDay(runs.ready.last!)} ${runs.ready.days}일분` : "없음"}</b>
                {"  "}소스 <b>{runs.shot.count ? `${formatMonthDay(runs.shot.last!)} ${runs.shot.days}일분` : "없음"}</b>
                {"  "}기획 <b>{runs.plan.count ? `${formatMonthDay(runs.plan.last!)} ${runs.plan.days}일분` : "없음"}</b>
              </span>
              <span className={`pipe-card-next${level}`}>{actionText(account, data.today)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
