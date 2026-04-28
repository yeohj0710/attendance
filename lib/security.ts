import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";

const PIN_ITERATIONS = 120_000;
const PIN_KEY_LENGTH = 32;
const PIN_DIGEST = "sha256";

export const SESSION_DAYS = 90;

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(pin, salt, PIN_ITERATIONS, PIN_KEY_LENGTH, PIN_DIGEST);
  return {
    hash: hash.toString("hex"),
    salt,
  };
}

export function verifyPin(pin: string, expectedHash: string, salt: string) {
  const actual = Buffer.from(hashPin(pin, salt).hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashUserAgent(userAgent: string) {
  return createHash("sha256").update(userAgent || "unknown").digest("hex");
}

export function createSessionExpiry(from = new Date()) {
  return new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}
