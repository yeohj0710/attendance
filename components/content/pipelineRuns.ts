import type { PipelineAccount, PipelineSlot, Stage } from "@/lib/content-pipeline";

export type RunStage = Exclude<Stage, "empty">;

const RANK: Record<Stage, number> = { empty: 0, plan: 1, shot: 2, edit: 3, ready: 4 };

export const RUN_LABEL: Record<RunStage, string> = {
  ready: "편집 끝",
  edit: "편집 중까지",
  shot: "촬영 소스까지",
  plan: "기획안까지",
};

/**
 * 단계별로 "오늘부터 빈틈없이 몇 편, 며칠 업로드까지" 채워졌는지.
 * 편집 중까지 = 편집 중이거나 편집 끝인 편. 아래 단계일수록 앞 단계를 포함해서 길어진다.
 */
export function stageRuns(account: PipelineAccount, today: string) {
  const out = {} as Record<RunStage, { count: number; last: string | null; days: number; beyond: boolean }>;
  for (const stage of ["ready", "edit", "shot", "plan"] as const) {
    let count = 0;
    while (count < account.slots.length && RANK[account.slots[count].stage] >= RANK[stage]) count += 1;
    const last = count ? account.slots[count - 1].date : null;
    out[stage] = {
      count,
      last,
      days: last ? Math.round((Date.parse(last) - Date.parse(today)) / 86_400_000) : 0,
      beyond: count === account.slots.length && count > 0,
    };
  }
  return out;
}

/** 칸 하나가 막대에서 어느 구간에 들어가는지 (그 칸까지 빈틈없이 이어진 가장 높은 단계) */
export function runStageAt(index: number, runs: ReturnType<typeof stageRuns>): Stage {
  for (const stage of ["ready", "edit", "shot", "plan"] as const) {
    if (index < runs[stage].count) return stage;
  }
  return "empty";
}

export function slotWeek(slot: PipelineSlot) {
  const d = new Date(`${slot.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
