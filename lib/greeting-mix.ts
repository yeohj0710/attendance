import {
  buildGreetingFacts,
  createLocalGreetings,
  type GreetingContext,
  type GreetingEvent,
} from "@/lib/greeting";

/**
 * 첫 화면 위에서 돌아가는 한 줄 인사말을 AI 없이 매번 다르게 만든다.
 *
 * 예전에는 정해진 문장 몇 개에서 골라서 매일 비슷한 말이 나왔다("칭호 81/120개까지 열렸어요" 등).
 * 이제는 그날 실제 정보(다음 할 일, 출근한 동료 이름, 다가오는 공휴일, 날씨, 이번 달 출근 일수,
 * 출근한 지 몇 시간)를 여러 말투 틀에 끼워 넣고, 생활 팁 묶음에서도 몇 개 섞는다.
 * 화면은 최근에 보여 준 문장을 그 PC에 기억해 두고 다시 내보내지 않는다(pickFreshGreetings).
 * 서버 호출이나 돈 드는 API 는 없다.
 */
export type GreetingExtras = {
  /** 오늘 출근한 동료 이름 (나 빼고) */
  teamNames?: string[];
  /** 아직 안 끝낸 오늘 할 일, 순서대로 */
  openTasks?: string[];
};

export type MixedGreetingContext = GreetingContext & GreetingExtras;

/* 2026년 10월부터 2027년 공휴일. 다가오는 날까지 며칠 남았는지 말할 때 쓴다. */
const HOLIDAYS: Array<[string, string]> = [
  ["2026-10-09", "한글날"],
  ["2026-12-25", "크리스마스"],
  ["2027-01-01", "새해 첫날"],
  ["2027-02-06", "설 연휴"],
  ["2027-03-01", "삼일절"],
  ["2027-05-05", "어린이날"],
  ["2027-05-13", "부처님 오신 날"],
  ["2027-06-06", "현충일"],
  ["2027-08-15", "광복절"],
  ["2027-09-14", "추석 연휴"],
  ["2027-10-03", "개천절"],
  ["2027-10-09", "한글날"],
  ["2027-12-25", "크리스마스"],
];

/* 아무 날에나 섞는 소소한 말. 사실을 지어내지 않는 말만 둔다. */
const SMALL_TALK = [
  "물 한 잔 마실 타이밍이에요. 컵이 비어 있으면 지금 채워 와요.",
  "모니터에서 잠깐 눈을 떼고 창밖 먼 곳을 20초만 봐요.",
  "어깨를 한 번 크게 돌려 보세요. 생각보다 많이 굳어 있어요.",
  "책상 위 컵 하나만 치워도 기분이 조금 가벼워져요.",
  "회의 전에 결론 한 줄을 먼저 적어 두면 회의가 짧아져요.",
  "메일 제목에 날짜를 넣어 두면 나중에 찾기 훨씬 쉬워요.",
  "긴 일은 첫 10분만 해 보자는 마음으로 시작해 봐요.",
  "할 일이 많을 땐 제일 작은 것부터 하나 지워 봐요.",
  "답장이 애매한 메시지는 일단 '확인했어요' 한마디만 보내 둬요.",
  "파일 이름에 버전 번호를 붙여 두면 덮어쓰기 사고가 줄어요.",
  "점심 먹고 10분 걷기, 오후 졸음에 꽤 잘 들어요.",
  "오늘 끝낸 일은 체크해 두면 퇴근할 때 정리가 금방 끝나요.",
  "막히는 일은 옆자리에 30초만 물어보는 게 30분 고민보다 빨라요.",
  "잘 안 풀리면 자리에서 한 번 일어났다 앉아 봐요.",
  "중요한 일은 알림을 잠깐 끄고 25분만 몰아서 해 봐요.",
  "자주 쓰는 문장은 메모장에 모아 두면 하루가 짧아져요.",
  "의자 높이 한 번 확인해 봐요. 팔꿈치가 책상과 비슷하면 딱 좋아요.",
  "오늘 고마웠던 동료가 있으면 한마디 남겨 봐요.",
  "급한 일과 중요한 일을 한 줄씩 나눠 적으면 순서가 보여요.",
  "스트레칭 한 번이면 오후 집중력이 조금 돌아와요.",
  "창문을 잠깐 열어 환기하면 머리가 맑아져요.",
  "퇴근 전에 내일 첫 할 일 하나만 적어 두면 아침이 편해요.",
  "작은 일 세 개를 끝내면 큰일도 시작하기 쉬워져요.",
  "오늘 하루 중 제일 집중 잘 되는 시간을 한 번 찾아봐요.",
];

const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);
/* 할 일 제목은 자르지 않고 첫 줄을 다 적는다 ("…" 로 자르면 무슨 일인지 알 수 없다, 사용자 지적 261008) */
const shortTask = (text: string) => text.split("\n")[0].trim();
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00+09:00`) - Date.parse(`${from}T00:00:00+09:00`)) / 86_400_000);

function kstClock(nowIso?: string | null) {
  const now = nowIso ? new Date(nowIso) : new Date();
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  return { hour: kst.getUTCHours(), minute: kst.getUTCMinutes() };
}

/* lib/weather.ts 가 주는 날씨 코드 → 말 */
const WEATHER_WORD: Record<string, string> = {
  clear: "맑고",
  cloudy: "흐리고",
  rain: "비가 오고",
  snow: "눈이 오고",
  fog: "안개가 끼고",
  windy: "바람이 세고",
  hot: "덥고",
  cold: "춥고",
};

function weekdayLine(weekday: string) {
  const lines: Record<string, string> = {
    월요일: "월요일이에요. 이번 주 할 일을 한 번 훑어보고 시작해요.",
    화요일: "화요일, 이번 주 속도가 붙는 날이에요.",
    수요일: "수요일, 한 주의 한가운데예요. 반은 왔어요.",
    목요일: "목요일이에요. 주말까지 이틀만 더 가요.",
    금요일: "금요일이에요. 이번 주 마무리할 일부터 챙겨요.",
    토요일: "토요일에도 나오셨네요. 짧고 굵게 끝내고 쉬어요.",
    일요일: "일요일인데 출근이라니, 오늘은 꼭 일찍 들어가요.",
  };
  return lines[weekday] ?? `${weekday}이에요. 오늘도 반가워요.`;
}

function firstNameOf(name?: string | null) {
  const trimmed = (name ?? "").trim();
  return trimmed.length >= 3 ? trimmed.slice(1) : trimmed;
}

export function createMixedGreetings(
  context: MixedGreetingContext,
  event: GreetingEvent = "visit",
  count = 12,
) {
  const facts = buildGreetingFacts(context);
  const me = firstNameOf(context.employeeName);
  const { hour } = kstClock(context.nowIso);
  const groups: string[][] = [];

  // 기록 챙김(어제 퇴근 안 찍힘 등)과 출퇴근 버튼 직후 말은 원래 문장을 앞에 둔다.
  const local = createLocalGreetings(context, event, 2);
  if (event !== "visit" || facts.previous?.isAutoCheckout || facts.previous?.isTooShort) {
    groups.push(local.slice(0, 1));
  }

  // 할 일
  const open = (context.openTasks ?? []).filter(Boolean);
  const left = Math.max(0, facts.taskCount - facts.doneCount);
  if (open.length) {
    const next = shortTask(open[0]);
    groups.push([
      `다음 할 일은 '${next}'이에요. 이것부터 끝내 볼까요?`,
      `'${next}' 하나만 끝내면 목록이 한결 가벼워져요.`,
      `지금 손댈 일은 '${next}'. 체크하는 맛 보러 가요.`,
      open.length >= 2 ? `남은 일 ${open.length}개 중에 '${next}'부터 해 봐요.` : `오늘 남은 일은 '${next}' 하나예요.`,
    ]);
  }
  if (facts.taskCount) {
    const ratio = facts.doneCount / facts.taskCount;
    groups.push(
      ratio >= 1
        ? [`오늘 할 일 ${facts.taskCount}개를 전부 끝냈어요. ${me}님 오늘 정말 잘했어요.`, `할 일 목록이 깨끗하게 비었어요. 남은 시간은 내일 준비에 써 봐요.`]
        : ratio >= 0.5
          ? [`할 일 ${facts.taskCount}개 중 ${facts.doneCount}개 끝, 벌써 반을 넘겼어요.`, `${left}개만 남았어요. 이 속도면 퇴근 전에 다 끝나요.`]
          : facts.doneCount
            ? [`할 일 ${facts.doneCount}개 끝냈어요. 남은 ${left}개도 하나씩 가요.`, `${facts.taskCount}개 중 ${facts.doneCount}개 체크했어요. 좋은 출발이에요.`]
            : [`오늘 할 일이 ${facts.taskCount}개 잡혀 있어요. 첫 체크가 제일 어려워요.`, `할 일 ${facts.taskCount}개, 가벼운 것부터 하나 지워 봐요.`],
    );
  } else if (facts.status !== "finished") {
    groups.push([`오늘 할 일을 한 줄만 적어 둬도 하루가 정리돼요.`, `할 일 칸이 비어 있어요. 떠오르는 것 하나만 적어 볼까요?`]);
  }

  // 동료
  const names = shuffle((context.teamNames ?? []).filter(Boolean)).slice(0, 3);
  if (names.length >= 2) {
    groups.push([
      `오늘 ${names[0]}님, ${names[1]}님${facts.teamCount > 2 ? ` 포함 ${facts.teamCount}명` : ""}이 같이 일해요.`,
      `${names[0]}님도 출근했어요. 막히는 일은 편하게 물어봐요.`,
      `${names.join("님, ")}님이 벌써 자리에 있어요.`,
    ]);
  } else if (names.length === 1) {
    groups.push([`오늘 ${names[0]}님도 출근했어요. 반갑게 인사 한 번 해요.`]);
  } else if (facts.teamCount) {
    groups.push([`오늘 동료 ${facts.teamCount}명이 같이 일해요.`]);
  }

  // 시간대
  if (facts.status === "working" && facts.workedMinutes !== null) {
    const h = Math.floor(facts.workedMinutes / 60);
    const m = facts.workedMinutes % 60;
    groups.push([
      h ? `출근한 지 ${h}시간 ${m}분 지났어요. 잠깐 기지개 한 번 켜요.` : `출근한 지 ${m}분, 아직 몸 푸는 시간이에요.`,
    ]);
  }
  if (hour < 10) groups.push([`아침 첫 30분이 하루 속도를 정해요. 제일 중요한 일부터 봐요.`, `좋은 아침이에요, ${me}님. 커피는 챙기셨어요?`]);
  else if (hour < 12) groups.push([`점심까지 ${12 - hour}시간쯤 남았어요. 오전 일 하나만 마무리해 봐요.`]);
  else if (hour < 14) groups.push([`점심 맛있게 먹었어요? 오후는 가벼운 일부터 풀어 봐요.`]);
  else if (hour < 16) groups.push([`오후 ${hour - 12}시, 졸음이 오는 시간이에요. 물 한 잔 어때요?`]);
  else if (hour < 19) groups.push([`하루가 거의 다 왔어요. 오늘 끝낸 일 체크하고 마무리해요.`, `퇴근 전에 내일 첫 할 일 하나만 적어 둬요.`]);
  else groups.push([`늦은 시간까지 수고 많아요, ${me}님. 무리하지 말고 들어가요.`]);

  // 날씨
  const w = facts.weather;
  if (w && w.temperature != null) {
    const t = Math.round(w.temperature);
    const feel = w.apparentTemperature != null ? Math.round(w.apparentTemperature) : null;
    const sky = WEATHER_WORD[w.label] ?? "";
    const lines = [sky ? `지금 바깥은 ${sky} ${t}도예요.` : `지금 바깥은 ${t}도예요.`];
    if (feel !== null && Math.abs(feel - t) >= 3) lines.push(`기온은 ${t}도인데 체감은 ${feel}도예요. 나갈 때 옷 한 겹 챙겨요.`);
    if (w.precipitation) lines.push(`밖에 비가 와요(${w.precipitation}mm). 우산 챙겨 두세요.`);
    if (t <= 5) lines.push(`${t}도, 꽤 추워요. 따뜻한 차 한 잔 어때요?`);
    if (t >= 28) lines.push(`${t}도, 덥네요. 물 자주 마셔요.`);
    groups.push(lines);
  }

  // 날짜, 공휴일, 이번 달
  const upcoming = HOLIDAYS.map(([d, n]) => [daysBetween(facts.date, d), n] as const).find(([diff]) => diff >= 1);
  if (upcoming && upcoming[0] <= 30) {
    groups.push([upcoming[0] === 1 ? `내일은 ${upcoming[1]}이에요. 오늘 일은 오늘 닫고 가요.` : `${upcoming[1]}까지 ${upcoming[0]}일 남았어요.`]);
  }
  const [y, mo, d] = facts.date.split("-").map(Number);
  const lastDay = new Date(y, mo, 0).getDate();
  const monthKey = facts.date.slice(0, 7);
  const monthDays = new Set(
    (context.records ?? []).filter((r) => r.workDate?.startsWith(monthKey) && r.checkInAt).map((r) => r.workDate),
  ).size;
  groups.push([
    `${mo}월도 ${lastDay - d}일 남았어요.`,
    monthDays >= 3 ? `이번 달 ${monthDays}번째 출근이에요. 꾸준한 게 제일 어려운데 잘하고 있어요.` : weekdayLine(facts.weekday),
    facts.streak >= 3 ? `${facts.streak}일 연속 출근 기록 중이에요.` : `${mo}월 ${d}일 ${facts.weekday}, 오늘도 반가워요 ${me}님.`,
  ]);

  // 칭호는 가끔만
  if (context.titleName && Math.random() < 0.35) {
    groups.push([`대표 칭호 '${context.titleName}' 달고 오늘도 출발해요.`, `Lv.${context.titleLevel ?? 1}까지 왔어요. 오늘 기록도 하나 더 쌓아요.`]);
  }

  // 소소한 말 몇 개
  groups.push(shuffle(SMALL_TALK).slice(0, 4));

  // 묶음마다 한 문장씩 돌고, 두 바퀴째에 한 문장씩 더. 같은 소재가 세 번 나오지 않게 한다.
  // 첫 묶음(기록 챙김, 출퇴근 직후 말)은 맨 앞에 두고 나머지 순서는 섞는다.
  const [head, ...others] = groups.map((g) => shuffle(g));
  const pools = [head, ...shuffle(others)].filter((p) => p?.length);
  const out: string[] = [];
  for (let round = 0; round < 2; round++) {
    for (const pool of pools) if (pool[round]) out.push(pool[round]);
  }
  return Array.from(new Set(out.map((line) => line.replace(/[—·]/g, ",").trim()))).slice(0, count);
}

/* 이 PC에서 최근 보여 준 문장은 빼고 고른다. 숫자만 다른 같은 틀도 같은 문장으로 본다. */
const SEEN_KEY = "greeting-seen-v1";
const SEEN_LIMIT = 80;
const shapeOf = (line: string) => line.replace(/\d+/g, "#").replace(/'[^']*'/g, "'_'");

export function pickFreshGreetings(candidates: string[], count = 6) {
  let seen: string[] = [];
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    seen = [];
  }
  const seenSet = new Set(seen);
  const fresh = candidates.filter((line) => !seenSet.has(shapeOf(line)));
  const chosen = (fresh.length >= Math.min(4, count) ? fresh : candidates).slice(0, count);
  try {
    const next = [...seen.filter((s) => !chosen.some((c) => shapeOf(c) === s)), ...chosen.map(shapeOf)].slice(-SEEN_LIMIT);
    localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막힌 브라우저면 그냥 매번 새로 고른다.
  }
  return chosen;
}
