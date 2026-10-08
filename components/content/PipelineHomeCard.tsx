"use client";

import { formatMonthDay } from "@/components/content/useContentData";
import { stageRuns } from "@/components/content/pipelineRuns";
import type { PipelineAccount, PipelineData } from "@/lib/content-pipeline";

/* 출퇴근기록부 이름 → 현황판 담당 이름 (components/employee/ContentTeamToday.tsx 의 사람 키와 같다) */
export const OWNER_BY_WHO: Record<string, string> = {
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

/** 내 계정(PD님) 또는 급한 계정 3곳(관리자) 요약. 계정 줄을 누르면 전체 채널 토글로 넘어간다 */
export function PipelineSummary({
  data,
  who,
  onOpenAll,
}: {
  data: PipelineData;
  who: string | null;
  onOpenAll: () => void;
}) {
  const owner = who ? OWNER_BY_WHO[who] : null;
  const accounts = owner ? data.accounts.filter((a) => a.owner === owner) : data.accounts.slice(0, 3);
  if (!accounts.length) {
    return <p className="pipe-card-empty">지금 맡은 계정 가운데 업로드 일정이 잡힌 곳이 없어요.</p>;
  }

  return (
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
          <button className="pipe-card-row" key={account.key} onClick={onOpenAll} type="button">
            <span className="pipe-card-name">{account.name}</span>
            <span className="pipe-card-bar" aria-hidden="true">
              {slots.map((slot, index) => (
                <i className={`pc-${slot.stage}`} key={`${slot.date}-${index}`} />
              ))}
            </span>
            <span className="pipe-card-runs">
              {(
                [
                  ["편집 완료", runs.ready],
                  ["촬영 소스", runs.shot],
                  ["기획안", runs.plan],
                ] as const
              ).map(([label, run]) => (
                <span key={label}>
                  {label}{" "}
                  <b className={run.count ? "" : "is-none"}>
                    {run.count ? `${formatMonthDay(run.last!)} ${run.days}일분` : "없음"}
                  </b>
                </span>
              ))}
            </span>
            <span className={`pipe-card-next${level}`}>{actionText(account, data.today)}</span>
          </button>
        );
      })}
    </div>
  );
}
