/**
 * 콘텐츠팀 캘린더(public/content/daily.html) 공용 저장소. Upstash Redis, Vercel Marketplace, 사용한 만큼 과금.
 * 해시 하나(cal:v1)에 "바구니|키" 칸으로 모두 담는다. 그래서 읽기는 HGETALL 한 번 = 명령 1회.
 * GET  /api/calendar        → 전부 읽기 (페이지 열 때, 창을 다시 볼 때, 보고 있는 동안 2분마다)
 * POST /api/calendar {op, bucket, key, value} → 한 칸 쓰기나 지우기 = 명령 1회
 * 바구니: done 체크, move 옮긴 날짜, hide 지운 기본 항목, edit 고친 글, add 사람이 추가한 항목
 * 261008 pharmacist-mcn-structure 의 api/calendar.js 에서 옮겨 왔다. 저장소와 키는 그대로다.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKETS = ["done", "move", "hide", "edit", "add"];
/* 비용 상한: 하루 요청 1만 5천 번을 넘으면 그날은 멈춘다 (요청 1번 = 명령 2번, 월 최대 약 $1.8).
   평소 쓰임은 하루 1~2천 번. Upstash Pay As You Go 는 저장소별 예산 상한이 없어서 코드로 막는다 */
const DAILY_CAP = 15000;
const HASH = "cal:v1";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const NO_STORE = { "Cache-Control": "no-store" };

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

async function redis(command: unknown[]) {
  const r = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return ((await r.json()) as { result: unknown }).result;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** 하루 요청 수를 세고 상한을 넘었으면 true */
async function overCap() {
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const used = Number(await redis(["INCR", `cal:n:${day}`]));
  return used > DAILY_CAP;
}

export async function GET() {
  if (!REDIS_URL || !REDIS_TOKEN) return reply({ error: "storage not configured" }, 503);
  try {
    if (await overCap()) return reply({ error: "daily cap" }, 429);
    const flat = ((await redis(["HGETALL", HASH])) as string[] | null) || [];
    const state: Record<string, Record<string, string>> = Object.fromEntries(BUCKETS.map((b) => [b, {}]));
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const f = flat[i];
      const cut = f.indexOf("|");
      const b = f.slice(0, cut);
      if (state[b]) state[b][f.slice(cut + 1)] = flat[i + 1];
    }
    return reply(state);
  } catch {
    return reply({ error: "storage error" }, 500);
  }
}

export async function POST(request: Request) {
  if (!REDIS_URL || !REDIS_TOKEN) return reply({ error: "storage not configured" }, 503);
  try {
    if (await overCap()) return reply({ error: "daily cap" }, 429);
    if (!sameOrigin(request)) return reply({ error: "origin" }, 403);
    let body: { op?: unknown; bucket?: unknown; key?: unknown; value?: unknown };
    try {
      body = JSON.parse((await request.text()) || "{}");
    } catch {
      return reply({ error: "bad request" }, 400);
    }
    const { op, bucket, key, value } = body;
    if (
      typeof bucket !== "string" ||
      !BUCKETS.includes(bucket) ||
      typeof key !== "string" ||
      !key ||
      key.length > 200 ||
      key.includes("|")
    ) {
      return reply({ error: "bad request" }, 400);
    }
    const field = `${bucket}|${key}`;
    if (op === "set") {
      const v = typeof value === "string" ? value : JSON.stringify(value);
      if (v.length > 4000) return reply({ error: "too long" }, 400);
      await redis(["HSET", HASH, field, v]);
    } else if (op === "del") {
      await redis(["HDEL", HASH, field]);
    } else {
      return reply({ error: "bad op" }, 400);
    }
    return reply({ ok: true });
  } catch {
    return reply({ error: "storage error" }, 500);
  }
}
