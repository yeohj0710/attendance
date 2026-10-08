import { unstable_cache } from "next/cache";
import {
  NotionAccessError,
  addDays,
  dayOfWeek,
  daysBetween,
  kstToday,
  mapLimited,
  propDate,
  propText,
  queryNotionDatabase,
  type NotionPage,
} from "@/lib/notion";
import { SCHEDULE_DATABASE_ID } from "@/lib/content-schedule";

/**
 * 콘텐츠팀 채널 현황판 (/content-board/pipeline).
 * 계정마다 앞으로 올릴 업로드 칸을 만들고, 노션 편집 진행도와 계정별 기획안 DB로 칸을 단계별로 칠한다.
 * 업로드 요일과 시작일은 콘텐츠팀 캘린더(public/content/daily.js 의 rawTasks, MIRROR)와 맞춘다.
 * 캘린더 규칙이 바뀌면 ACCOUNTS 의 cadence 를 같이 고친다.
 * 노션은 5분에 한 번만 읽고 결과를 모두가 나눠 쓴다.
 */

const PROGRESS_DATABASE_ID = "3453b1f9b9ae80e8b0c0f319797c99f3";
/*
 * 할 일 달력 업로드 줄(getPipelineData().uploads)은 캘린더(lib/content-uploads.ts → public/content/daily.js)가 그대로 쓴다.
 * 캘린더는 제목(공백 정리)으로 할 일 체크 키를 만들어서, 아래 셋을 바꾸면 체크가 사라진다. 바꾸기 전에 캘린더 쪽과 먼저 맞춘다.
 * 1. 시작일 UPLOADS_FROM(10/9 고정) 2. 제목은 노션 「영상 제목」 원문 3. 계정 키(calendarAccount: 전종열 약사님 jay, 10/26 부터 jaykr, 닥터 닭갈비 taeeun)
 */
const UPLOADS_FROM = "2026-10-09";
const HORIZON_DAYS = 56;
const CACHE_SECONDS = 300;

/* 평일 공휴일. 김제조, 어라운드팜, 미미팜만 올리고 나머지는 쉰다 (10/8 공지) */
const HOLIDAYS = new Set(["2026-10-09", "2026-12-25", "2027-01-01"]);

type Cadence = { from?: string; to?: string; days: number[] };

type AccountConfig = {
  key: string;
  name: string;
  owner: string;
  /** 편집 진행도 「인플루언서」 선택지 */
  notion: string[];
  planDb?: string;
  /** 업로드 요일 (0 일요일). 비어 있으면 우리가 올리지 않는 계정 */
  cadence: Cadence[];
  /** 평일 공휴일에도 올리는지 */
  holidays: boolean;
  /** 노션 일정에서 이 계정 촬영을 찾을 낱말 */
  shootWords: string[];
  note: string;
};

const WEEKDAYS = [1, 2, 3, 4, 5];

const ACCOUNTS: AccountConfig[] = [
  {
    key: "jejo",
    name: "김제조 약사님",
    owner: "김호준 PD님",
    notion: ["김주성 대표님"],
    planDb: "1043b1f9b9ae82039e3e81e44227d9d7",
    cadence: [{ days: WEEKDAYS }],
    holidays: true,
    shootWords: ["김제조"],
    note: "평일 17시에 올려요. 월 20편 계약이라 2주에 10편씩 찍어요. 평일 공휴일에도 올려요.",
  },
  {
    key: "oyak",
    name: "오주헌 약사님",
    owner: "송아영 PD님",
    notion: ["오주헌 약사님"],
    planDb: "32c3b1f9b9ae8095853aff9289cd8eda",
    cadence: [{ days: WEEKDAYS }],
    holidays: false,
    shootWords: ["오주헌"],
    note: "평일 저녁에 올려요. 유튜브와 틱톡에는 7일 뒤에 같은 영상을 올려요(10/12부터).",
  },
  {
    key: "jessi",
    name: "제씨약사님",
    owner: "송아영 PD님",
    notion: ["제선영 약사님"],
    planDb: "3303b1f9b9ae80b5be8cd09f16c9febd",
    cadence: [
      { to: "2026-10-31", days: [2, 4] },
      { from: "2026-11-01", days: [1, 3, 5] },
    ],
    holidays: false,
    shootWords: ["제씨", "제선영"],
    note: "10월은 화요일과 목요일, 11월부터 월수금에 약사님이 직접 올려요. 촬영은 월화 저녁에만 돼요. 유튜브와 틱톡은 7일 뒤에 올려요.",
  },
  {
    key: "jay",
    name: "제이약사님",
    owner: "권현우 PD님",
    notion: ["전종열 약사님"],
    planDb: "cc83b1f9b9ae83328848017bd402e0e1",
    cadence: [
      { to: "2026-10-15", days: WEEKDAYS },
      { from: "2026-10-26", days: WEEKDAYS },
    ],
    holidays: false,
    shootWords: ["전종열", "제이약사"],
    note: "영어 계정은 10/15까지만 올리고, 한국 계정은 10/26부터 평일에 올려요. 10/16 촬영분 20편이 한국 계정 첫 4주를 채워요.",
  },
  {
    key: "taeeun",
    name: "김태은 원장님",
    owner: "권현우 PD님",
    notion: ["닥터 닭갈비"],
    planDb: "eae3b1f9b9ae83eba83681ee62d75a91",
    cadence: [{ from: "2026-10-12", days: WEEKDAYS }],
    holidays: false,
    shootWords: ["김태은"],
    note: "닥터 닭갈비 계정이에요. 10/12에 첫 영상을 올리고 평일마다 올려요(10/8 김호준 PD님 확인). 춘천에서 한 달에 한 번 20편을 찍어요.",
  },
  {
    key: "around",
    name: "어라운드팜",
    owner: "이민우님",
    notion: ["어라운드팜"],
    planDb: "be33b1f9b9ae8212ad1a815ba421305e",
    cadence: [{ days: [2, 4, 6] }],
    holidays: true,
    shootWords: ["어라운드팜", "에이트명동"],
    note: "릴스는 화목토에 올려요. 촬영은 김호준 PD님, 편집은 조하늘님이 맡아요.",
  },
  {
    key: "mimi",
    name: "미미팜",
    owner: "이민우님",
    notion: ["MIMIPharm"],
    planDb: "3d13b1f9b9ae80d6929adfba5608030c",
    cadence: [{ days: [2, 4] }],
    holidays: true,
    shootWords: ["미미팜", "미미약국"],
    note: "릴스는 화요일과 목요일에 올려요. 기획은 권현우 PD님, 촬영은 김호준 PD님, 편집은 조하늘님이 맡아요.",
  },
  {
    key: "owmb",
    name: "OWM 분당 약국장님",
    owner: "김호준 PD님",
    notion: ["OWM 분당 약국장"],
    planDb: "cd43b1f9b9ae837eb94b01e96105452c",
    cadence: [{ from: "2026-10-12", days: WEEKDAYS }],
    holidays: false,
    shootWords: ["OWM 분당"],
    note: "10/12부터 평일마다 올려요(10/8 김호준 PD님 확인). 게시는 크리투스 OS에서 하고, 촬영하고 7일 안에 1차 편집본 10편을 크리투스 OS에 올려요.",
  },
  {
    key: "seominji",
    name: "서민지 약사님",
    owner: "김호준 PD님",
    notion: [],
    planDb: "29b3b1f9b9ae833bb551813da36c2c44",
    cadence: [],
    holidays: false,
    shootWords: ["서민지"],
    note: "새 계정이에요. 10편을 먼저 모은 다음 업로드를 시작해요.",
  },
  {
    key: "owmm",
    name: "OWM 명동 약국장님",
    owner: "김호준 PD님",
    notion: ["OWM 명동 약국장"],
    planDb: "ad43b1f9b9ae838a8bae8110bffd2fba",
    cadence: [],
    holidays: false,
    shootWords: ["OWM 명동"],
    note: "크리투스 킥오프를 기다리고 있어요.",
  },
  {
    key: "yoo",
    name: "유지선 대표님",
    owner: "권현우 PD님",
    notion: [],
    planDb: "31c3b1f9b9ae821899ee81596a58ea35",
    cadence: [],
    holidays: false,
    shootWords: ["유지선"],
    note: "시작 날짜가 정해지면 업로드 요일을 넣어요.",
  },
];

export type Stage = "ready" | "edit" | "shot" | "plan" | "empty";

const STAGE_RANK: Record<Stage, number> = { empty: 0, plan: 1, shot: 2, edit: 3, ready: 4 };

const PROGRESS_STAGE: Record<string, Exclude<Stage, "empty"> | null> = {
  "편집 완료": "ready",
  "업로드 예정": "ready",
  "요청 완료": "edit",
  "초안 완료": "edit",
  "피드백 진행중": "edit",
  "피드백 반영중": "edit",
  "수정 완료": "edit",
  "녹화 완료": "shot",
  "작성 중": "plan",
  "검토 대기": "plan",
  채택: "plan",
  "수정 필요": "plan",
  "녹화 확정": "plan",
  반려: null,
  "업로드 보류": null,
  "업로드 완료": null,
};

/* 기획안 DB에서는 아직 안 찍은 기획만 센다. 찍은 뒤로는 편집 진행도가 원장이다 */
const PLAN_STATUSES = new Set(["작성 중", "작성 완료(검토 대기)", "수정 필요", "채택됨", "채택", "녹화 확정"]);

export type PipelineItem = {
  title: string;
  stage: Exclude<Stage, "empty">;
  status: string;
  editor: string;
  date: string | null;
  url: string;
  /** 편집 진행도 「영상 폴더」 (소스 폴더) */
  folder?: string;
  /** 편집 진행도 「비고」 */
  memo?: string;
};

export type PipelineSlot = {
  date: string;
  stage: Stage;
  title?: string;
  status?: string;
  editor?: string;
  url?: string;
  folder?: string;
  /** 노션에 날짜가 없어 순서대로 넣어 본 편 */
  tentative?: boolean;
  /** 업로드 요일이 아닌 날에 노션 날짜가 잡힌 편 */
  offDay?: boolean;
  /** 평일 공휴일 */
  holiday?: boolean;
};

export type PipelineAction = {
  label: string;
  due: string;
  forDate: string;
  title?: string;
};

export type PipelineAccount = {
  key: string;
  name: string;
  owner: string;
  note: string;
  slots: PipelineSlot[];
  /** 단계별 며칠치. null 은 8주 넘게 채워짐 */
  days: Record<Exclude<Stage, "empty">, number | null>;
  stock: Record<Exclude<Stage, "empty">, number>;
  next: PipelineAction | null;
  shoots: Array<{ date: string; title: string }>;
  /** 날짜가 지났는데 업로드 완료로 안 바뀐 편 */
  stale: number;
  planDbMissing: boolean;
};

export type PipelineData = {
  /** 보는 사람 (API 가 붙인다, 캐시에는 없다) */
  viewer?: { name: string; role: string };
  today: string;
  /** 칸을 세기 시작하는 날 (내일) */
  start: string;
  horizonDays: number;
  fetchedAt: string;
  accounts: PipelineAccount[];
  waiting: PipelineAccount[];
  missing: Array<{ account: string; label: string; url: string }>;
  /**
   * 콘텐츠팀 할 일 달력(public/content/daily.js)의 UPLOADS 와 같은 모양: [MM-DD, 계정 키, 제목, 상태, 편집자, 메모(비고)].
   * 2026-10-09(고정)부터 120일 앞까지, 노션 편집 진행도에 업로드 예정일이 있는 편(업로드 완료 포함, 반려와 업로드 보류 제외). 업로드 요일이 있는 계정만.
   * 캘린더 쪽(lib/content-uploads.ts)이 노션을 따로 읽지 않고 getPipelineData().uploads 를 쓰면 노션 호출이 늘지 않는다.
   */
  uploads: Array<[string, string, string, string, string, string]>;
};

/* daily.js 상태 기호: ok 편집 끝, rv 검수 중, ed 편집 중, raw 의뢰 전, noed 편집자 미정, nosh 촬영본 없음 */
function calendarStatus(item: PipelineItem) {
  if (item.stage === "ready") return "ok";
  if (item.stage === "edit") return item.status === "요청 완료" ? "ed" : "rv";
  if (item.stage === "shot") return item.editor && item.editor !== "미정" ? "raw" : "noed";
  return "nosh";
}

/* 현황판 계정 키 → daily.js 계정 키. 제이약사님은 영어 계정(10/15까지)과 한국 계정(10/26부터)이 나뉜다 */
function calendarAccount(key: string, date: string) {
  if (key === "jay") return date <= "2026-10-15" ? "jay" : "jaykr";
  return key;
}

const PLAN_LEAD = [
  { stage: "empty" as const, lead: 17, label: "기획안 쓰기" },
  { stage: "plan" as const, lead: 10, label: "촬영" },
  { stage: "shot" as const, lead: 7, label: "편집 맡기기" },
  { stage: "edit" as const, lead: 2, label: "편집본 받기" },
];

function normalizeTitle(title: string) {
  return title
    .replace(/\([^)]*\)/g, "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

function sameTitle(a: string, b: string) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return false;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  return long.includes(short.slice(0, Math.min(short.length, 10)));
}

function isUploadDay(account: AccountConfig, date: string) {
  if (!account.holidays && HOLIDAYS.has(date)) return false;
  const dow = dayOfWeek(date);
  return account.cadence.some(
    (c) => (!c.from || date >= c.from) && (!c.to || date <= c.to) && c.days.includes(dow),
  );
}

/** 편집 진행도 한 줄. item 은 현황판에 쓰는 것(업로드 완료, 반려, 보류는 null), 나머지는 할 일 달력 업로드 줄용 */
function progressRow(page: NotionPage) {
  const status = propText(page, "진행 상태");
  return {
    status,
    influencer: propText(page, "인플루언서"),
    title: propText(page, "영상 제목") || "제목 없음",
    date: propDate(page, "업로드 예정일")?.start.slice(0, 10) ?? null,
    editor: propText(page, "편집자"),
    memo: propText(page, "비고"),
    item: progressItem(page, status),
  };
}

function progressItem(page: NotionPage, status: string): (PipelineItem & { influencer: string }) | null {
  const stage = PROGRESS_STAGE[status];
  if (!stage) return null;
  return {
    title: propText(page, "영상 제목") || "제목 없음",
    stage,
    status,
    editor: propText(page, "편집자"),
    date: propDate(page, "업로드 예정일")?.start.slice(0, 10) ?? null,
    url: page.url,
    folder: propText(page, "영상 폴더") || undefined,
    memo: propText(page, "비고") || undefined,
    influencer: propText(page, "인플루언서"),
  };
}

function planItem(page: NotionPage): PipelineItem | null {
  const status = propText(page, "상태");
  if (!PLAN_STATUSES.has(status)) return null;
  return {
    title: propText(page, "이름") || "제목 없음",
    stage: "plan",
    status: `기획안 ${status}`,
    editor: propText(page, "편집자님"),
    date: null,
    url: page.url,
  };
}

function buildAccount(
  account: AccountConfig,
  today: string,
  items: PipelineItem[],
  shoots: Array<{ date: string; title: string }>,
  planDbMissing: boolean,
): PipelineAccount {
  /* 오늘 올린 편은 업로드 완료로 빠져서 빈 칸처럼 보이니 칸은 내일부터 센다 */
  const start = addDays(today, 1);
  const end = addDays(today, HORIZON_DAYS);
  const stock = { ready: 0, edit: 0, shot: 0, plan: 0 };
  let stale = 0;
  const dated = new Map<string, PipelineItem[]>();
  const undated: PipelineItem[] = [];

  for (const item of items) {
    if (item.date && item.date < today) {
      stale += 1;
      continue;
    }
    if (item.date === today) continue;
    stock[item.stage] += 1;
    if (item.date) {
      if (item.date <= end) dated.set(item.date, [...(dated.get(item.date) ?? []), item]);
    } else {
      undated.push(item);
    }
  }

  undated.sort((a, b) => STAGE_RANK[b.stage] - STAGE_RANK[a.stage]);

  const slots: PipelineSlot[] = [];
  if (account.cadence.length) {
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const onDay = dated.get(date) ?? [];
      const uploadDay = isUploadDay(account, date);
      const holiday = HOLIDAYS.has(date) && dayOfWeek(date) >= 1 && dayOfWeek(date) <= 5;
      for (const item of onDay) {
        slots.push({ date, stage: item.stage, title: item.title, status: item.status, editor: item.editor, url: item.url, folder: item.folder, offDay: !uploadDay, holiday });
      }
      if (uploadDay && onDay.length === 0) {
        const item = undated.shift();
        slots.push(
          item
            ? { date, stage: item.stage, title: item.title, status: item.status, editor: item.editor, url: item.url, folder: item.folder, tentative: true, holiday }
            : { date, stage: "empty", holiday },
        );
      }
    }
  }

  const days = { ready: null, edit: null, shot: null, plan: null } as PipelineAccount["days"];
  for (const stage of ["ready", "edit", "shot", "plan"] as const) {
    const gap = slots.find((slot) => STAGE_RANK[slot.stage] < STAGE_RANK[stage]);
    days[stage] = gap ? daysBetween(start, gap.date) : account.cadence.length ? null : 0;
  }

  let next: PipelineAction | null = null;
  for (const slot of slots) {
    const rule = PLAN_LEAD.find((r) => r.stage === slot.stage);
    if (!rule) continue;
    const due = addDays(slot.date, -rule.lead);
    if (!next || due < next.due) {
      next = { label: rule.label, due, forDate: slot.date, title: slot.title };
    }
  }

  return {
    key: account.key,
    name: account.name,
    owner: account.owner,
    note: account.note,
    slots,
    days,
    stock,
    next,
    shoots,
    stale,
    planDbMissing,
  };
}

async function loadPipeline(): Promise<PipelineData> {
  const today = kstToday();

  /* 현황판: 업로드 완료가 아닌 편(최근 30일, 날짜 없음). 할 일 달력 업로드 줄: UPLOADS_FROM 부터는 업로드 완료까지 전부 */
  const notDone = { property: "진행 상태", status: { does_not_equal: "업로드 완료" } };
  const progressFilter = {
    or: [
      { and: [notDone, { property: "업로드 예정일", date: { on_or_after: addDays(today, -30) } }] },
      { and: [notDone, { property: "업로드 예정일", date: { is_empty: true } }] },
      { property: "업로드 예정일", date: { on_or_after: UPLOADS_FROM } },
    ],
  };
  const scheduleFilter = {
    and: [
      { property: "날짜", date: { on_or_after: addDays(today, -1) } },
      { property: "날짜", date: { before: addDays(today, HORIZON_DAYS + 14) } },
    ],
  };

  const planIds = ACCOUNTS.flatMap((a) => (a.planDb ? [a.planDb] : []));
  const [progressPages, schedulePages, ...planResults] = await mapLimited(
    [
      () => queryNotionDatabase(PROGRESS_DATABASE_ID, progressFilter),
      () => queryNotionDatabase(SCHEDULE_DATABASE_ID, scheduleFilter),
      ...planIds.map((id) => () =>
        queryNotionDatabase(id).catch((error: unknown) => {
          if (error instanceof NotionAccessError && (error.status === 404 || error.status === 400)) return null;
          throw error;
        }),
      ),
    ],
    3,
    (run) => run(),
  );

  const planById = new Map<string, NotionPage[] | null>();
  planIds.forEach((id, index) => planById.set(id, planResults[index] as NotionPage[] | null));

  const progressRows = (progressPages as NotionPage[]).map(progressRow);
  const progress = progressRows.map((row) => row.item).filter((x) => x !== null);
  const shootEvents = (schedulePages as NotionPage[])
    .map((page) => ({ date: propDate(page, "날짜")?.start.slice(0, 10) ?? "", title: propText(page, "이름") }))
    .filter((e) => e.date >= today && e.title.includes("촬영"))
    .sort((a, b) => a.date.localeCompare(b.date));

  const missing: PipelineData["missing"] = [];
  const uploads: PipelineData["uploads"] = [];
  const uploadTo = addDays(today, 120);
  const built = ACCOUNTS.map((account) => {
    const mine: PipelineItem[] = progress.filter((p) => account.notion.includes(p.influencer));
    if (account.cadence.length) {
      for (const row of progressRows) {
        if (!account.notion.includes(row.influencer) || !row.date) continue;
        if (row.date < UPLOADS_FROM || row.date > uploadTo) continue;
        if (row.status === "반려" || row.status === "업로드 보류") continue;
        const status = row.status === "업로드 완료" ? "ok" : row.item ? calendarStatus(row.item) : "nosh";
        uploads.push([
          row.date.slice(5),
          calendarAccount(account.key, row.date),
          row.title,
          status,
          row.editor === "미정" ? "" : row.editor,
          row.memo,
        ]);
      }
    }
    const planPages = account.planDb ? planById.get(account.planDb) : undefined;
    const planDbMissing = Boolean(account.planDb) && planPages === null;
    if (planDbMissing && account.planDb) {
      missing.push({
        account: account.name,
        label: `${account.name} 기획안 목록`,
        url: `https://www.notion.so/${account.planDb}`,
      });
    }
    for (const page of planPages ?? []) {
      const item = planItem(page);
      if (item && !mine.some((m) => sameTitle(m.title, item.title))) mine.push(item);
    }
    const shoots = shootEvents.filter((e) => account.shootWords.some((w) => e.title.includes(w)));
    return buildAccount(account, today, mine, shoots, planDbMissing);
  });

  /* 급한 순서: 편집 완료가 며칠분 남았나(화면 왼쪽 표 숫자)가 적은 순, 같으면 다음 할 일 마감이 빠른 순 */
  const readyDays = (a: PipelineAccount) => {
    let n = 0;
    while (n < a.slots.length && a.slots[n].stage === "ready") n += 1;
    if (n === a.slots.length) return 9999;
    return n ? daysBetween(today, a.slots[n - 1].date) : 0;
  };
  const accounts = built
    .filter((a) => a.slots.length > 0)
    .sort((a, b) => {
      const diff = readyDays(a) - readyDays(b);
      if (diff) return diff;
      return (a.next?.due ?? "9999").localeCompare(b.next?.due ?? "9999");
    });

  return {
    today,
    start: addDays(today, 1),
    horizonDays: HORIZON_DAYS,
    fetchedAt: new Date().toISOString(),
    accounts,
    waiting: built.filter((a) => a.slots.length === 0),
    missing,
    uploads: uploads.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])),
  };
}

export const getPipelineData = unstable_cache(loadPipeline, ["content-pipeline-v2"], {
  revalidate: CACHE_SECONDS,
});
