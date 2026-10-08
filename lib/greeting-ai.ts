import { buildGreetingFacts, type GreetingContext, type GreetingEvent } from "@/lib/greeting";

/**
 * 첫 화면 위에서 돌아가는 한 줄 인사말을 LLM 이 그날 상황(시간, 날씨, 할 일 진행, 함께 일하는 사람 수,
 * 칭호, 지난 기록)에 맞춰 새로 쓴다. 정해진 문장 목록에서 고르던 방식은 매일 비슷한 말이 반복됐다.
 *
 * 돈이 드는 호출이라 기본은 꺼져 있다. Vercel 환경변수 GREETING_LLM=1 과 OPENAI_API_KEY 가 있어야 켜진다.
 * 같은 사람, 같은 날, 같은 상태(출근 전, 근무 중, 퇴근 뒤), 할 일 진행 구간, 3시간 구간이면 결과를 재사용한다.
 * 실패하거나 6초 안에 답이 없으면 null 을 돌려주고, 부르는 쪽이 원래 문장 목록으로 대신한다.
 * gpt-6-luna 기준 한 번에 약 0.0003달러(입력 1,200, 출력 400 토큰)다.
 */
const MODEL = process.env.GREETING_LLM_MODEL || "gpt-6-luna";
const TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const CACHE_LIMIT = 300;
const cache = new Map<string, { at: number; messages: string[] }>();

/* 매번 소재 순서를 섞어서 같은 상황에서도 다른 말이 나오게 한다. */
const ANGLES = [
  "지금 시간대와 남은 하루",
  "오늘 날씨와 옷차림이나 컨디션",
  "오늘 할 일 진행 정도",
  "함께 일하는 동료 수",
  "요일 분위기",
  "계절이나 오늘 날짜의 소소한 의미",
  "어제나 지난 근무일 기록",
  "대표 칭호나 레벨",
  "작게 웃을 수 있는 가벼운 농담",
  "쉬는 시간이나 물 마시기 같은 작은 챙김",
];

export function isGreetingLlmEnabled() {
  return process.env.GREETING_LLM === "1" && Boolean(process.env.OPENAI_API_KEY);
}

export async function createAiGreetings(
  context: GreetingContext,
  event: GreetingEvent,
  count = 6,
): Promise<string[] | null> {
  if (!isGreetingLlmEnabled()) return null;

  const facts = buildGreetingFacts(context);
  const now = context.nowIso ? new Date(context.nowIso) : new Date();
  const kstHour = (now.getUTCHours() + 9) % 24;
  const taskBucket = facts.taskCount ? Math.round((facts.doneCount / facts.taskCount) * 4) : -1;
  const cacheKey = [
    context.employeeName ?? "",
    facts.date,
    facts.status,
    event,
    taskBucket,
    Math.floor(kstHour / 3),
  ].join("|");

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.messages;

  const name = (context.employeeName ?? "").trim();
  const firstName = name.length >= 3 ? name.slice(1) : name;
  const angles = [...ANGLES].sort(() => Math.random() - 0.5).slice(0, count);
  const factLines = [
    `부를 이름: ${firstName}님`,
    `지금: ${facts.date} ${facts.weekday} ${String(kstHour).padStart(2, "0")}시`,
    `상태: ${facts.status === "notStarted" ? "아직 출근 전" : facts.status === "working" ? "근무 중" : "오늘 퇴근함"}`,
    `방금 한 일: ${event === "checkIn" ? "출근을 눌렀음" : event === "checkOut" ? "퇴근을 눌렀음" : event === "cancelCheckOut" ? "퇴근을 취소했음" : "화면을 열었음"}`,
    facts.workedMinutes !== null ? `오늘 일한 시간: ${Math.floor(facts.workedMinutes / 60)}시간 ${facts.workedMinutes % 60}분` : "",
    facts.weather
      ? `날씨: ${facts.weather.label}${facts.weather.temperature != null ? `, ${Math.round(facts.weather.temperature)}도` : ""}${facts.weather.apparentTemperature != null ? `, 체감 ${Math.round(facts.weather.apparentTemperature)}도` : ""}${facts.weather.precipitation ? `, 강수 ${facts.weather.precipitation}mm` : ""}`
      : "",
    `오늘 할 일: ${facts.taskCount}개 중 ${facts.doneCount}개 끝냄`,
    `오늘 출근한 동료: ${facts.teamCount}명`,
    facts.streak > 1 ? `연속 출근: ${facts.streak}일째` : "",
    context.titleName ? `대표 칭호: '${context.titleName}', Lv.${context.titleLevel ?? 1}, 칭호 ${context.titleAchievedCount ?? 0}/${context.titleCount ?? 0}개` : "",
    facts.previous ? `${facts.previous.label} 기록: ${facts.previous.isAutoCheckout ? "퇴근을 안 눌러서 자동 마감됨" : facts.previous.isTooShort ? "근무 시간이 아주 짧게 찍힘" : "정상"}` : "",
  ].filter(Boolean);

  const system = [
    "회사 출퇴근기록부 첫 화면 위쪽에서 몇 초마다 바뀌는 한 줄 인사말을 쓴다.",
    `서로 다른 문장 ${count}개를 쓴다. 소재는 아래 순서를 따르되, 사실에 없는 소재면 다른 소재로 바꾼다.`,
    "규칙:",
    "- 한 문장 15자에서 40자. 사람이 옆자리에서 건네는 말투(해요체). 이름을 부를 때는 'OO님'.",
    "- 주어진 사실만 쓴다. 숫자는 사실 그대로. 날씨 정보가 없으면 날씨 이야기를 하지 않는다.",
    "- 매번 다른 표현을 쓴다. '힘내요', '가보죠', '파이팅' 같은 흔한 마무리는 전체에서 한 번까지만.",
    "- 줄표(—)와 가운뎃점(·)을 쓰지 않는다. 광고 문구, 사자성어, 과장, 건강이나 의학 조언은 쓰지 않는다.",
    "- 이모지는 전체에서 두 개까지.",
    "- 할 일을 다 끝냈거나 퇴근했으면 칭찬과 쉬라는 말 위주로 쓴다. 출근 전이면 출근 버튼을 누르라는 압박을 하지 않는다.",
  ].join("\n");
  const user = `사실\n${factLines.join("\n")}\n\n소재 순서\n${angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        reasoning_effort: "none",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "greetings",
            strict: true,
            schema: {
              type: "object",
              properties: { messages: { type: "array", items: { type: "string" } } },
              required: ["messages"],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}") as { messages?: unknown };
    const messages = (Array.isArray(parsed.messages) ? parsed.messages : [])
      .map((m) => String(m).replace(/[—·]/g, ",").trim())
      .filter((m) => m.length >= 4 && m.length <= 80)
      .slice(0, count);
    if (messages.length < 2) return null;

    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(cacheKey, { at: Date.now(), messages });
    return messages;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
