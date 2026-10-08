import { authenticateRequest } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { hashToken } from "@/lib/security";

/**
 * 콘텐츠팀 현황판과 일정 달력은 5분마다 새로 받는다. 그때마다 로그인 확인으로 Firestore를 읽지 않게
 * 확인된 세션을 이 서버 안에서 30분 기억한다. 화면을 켜 둔 사람 한 명이 하루에 쓰는 읽기는 수십 건이다.
 */
const MEMO_MS = 30 * 60 * 1000;
const verified = new Map<string, { until: number; name: string; role: string }>();

/** 로그인한 사람의 이름과 역할을 돌려준다 (현황판이 PD님 담당 채널만 고를 때 쓴다) */
export async function requireContentViewer(request: Request): Promise<{ name: string; role: string }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/, "").trim();
  const deviceId = request.headers.get("x-attendance-device")?.trim();
  if (!token || !deviceId) unauthorized();

  const key = `${hashToken(token)}:${deviceId}`;
  const memo = verified.get(key);
  if (memo && memo.until > Date.now()) return { name: memo.name, role: memo.role };

  const auth = await authenticateRequest(request);
  if (!auth) unauthorized();

  if (verified.size > 500) verified.clear();
  const viewer = { name: auth.employee.name, role: auth.employee.role };
  verified.set(key, { until: Date.now() + MEMO_MS, ...viewer });
  return viewer;
}
