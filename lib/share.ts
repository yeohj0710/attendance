import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { badRequest, unauthorized } from "@/lib/http";

export const SHARE_QUERY_PARAM = "share";
const SHARE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type ShareTokenPayload = {
  type: "dashboard" | "work-log";
  ownerEmployeeId: string;
  targetEmployeeId?: string;
  workDate?: string;
  expiresAt: number;
};

export function createShareToken(
  payload: Omit<ShareTokenPayload, "expiresAt">,
  now = Date.now(),
) {
  const fullPayload: ShareTokenPayload = {
    ...payload,
    expiresAt: now + SHARE_TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  return `${body}.${signShareBody(body)}`;
}

export function verifyShareToken(token: string | null | undefined): ShareTokenPayload {
  const normalized = token?.trim() ?? "";
  const [body, signature] = normalized.split(".");
  if (!body || !signature || normalized.split(".").length !== 2) {
    unauthorized("공유 링크가 올바르지 않습니다.");
  }

  const expected = signShareBody(body);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    unauthorized("공유 링크가 올바르지 않습니다.");
  }

  let payload: ShareTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ShareTokenPayload;
  } catch {
    unauthorized("공유 링크가 올바르지 않습니다.");
  }

  if (payload.expiresAt <= Date.now()) {
    unauthorized("공유 링크가 만료되었습니다.");
  }

  if (
    (payload.type !== "dashboard" && payload.type !== "work-log") ||
    !payload.ownerEmployeeId ||
    (payload.type === "work-log" && (!payload.targetEmployeeId || !payload.workDate))
  ) {
    badRequest("공유 링크 정보가 올바르지 않습니다.");
  }

  return payload;
}

export async function createShortShareId(token: string) {
  const db = getDb();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = randomBytes(6).toString("base64url");
    const ref = db.collection("share_links").doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      continue;
    }

    await ref.set({
      token,
      created_at: new Date().toISOString(),
    });
    return id;
  }

  badRequest("공유 링크를 만들지 못했어요. 잠시 후 다시 시도해주세요.");
}

export async function getShareTokenFromShortId(shareId: string | null | undefined) {
  const id = shareId?.trim() ?? "";
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) {
    badRequest("공유 링크가 올바르지 않습니다.");
  }

  const doc = await getDb().collection("share_links").doc(id).get();
  const token = doc.data()?.token;
  if (!doc.exists || typeof token !== "string" || !token.trim()) {
    badRequest("공유 링크를 찾을 수 없습니다.");
  }

  return token;
}

function signShareBody(body: string) {
  return createHmac("sha256", getShareSecret()).update(body).digest("base64url");
}

function getShareSecret() {
  const secret =
    process.env.ATTENDANCE_SHARE_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.FIREBASE_PRIVATE_KEY ??
    process.env.FIREBASE_CLIENT_EMAIL;
  if (!secret) {
    throw new Error("ATTENDANCE_SHARE_SECRET is required for share links.");
  }

  return secret;
}
