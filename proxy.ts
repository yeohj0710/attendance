import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * API를 IP별로 1분에 일정 횟수까지만 받는다. 새로고침을 몰아치는 사람이나 스크립트를 막는 1차 방어다.
 * 사무실은 직원 전원이 IP 하나를 같이 쓰니 넉넉하게 잡는다. 서버 인스턴스마다 따로 세는
 * 최선 노력 방식이라, 진짜 상한은 lib/read-budget.ts의 하루 읽기 상한이 맡는다.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 300;

const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

export function proxy(request: NextRequest) {
  const now = Date.now();
  const key = clientKey(request);
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (hits.size > 5_000) {
      for (const [ip, value] of hits) {
        if (value.resetAt <= now) {
          hits.delete(ip);
        }
      }
    }
    return NextResponse.next();
  }

  entry.count += 1;
  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
