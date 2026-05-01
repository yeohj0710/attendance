"use client";

export type StoredAuth = {
  token: string;
  deviceId: string;
};

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

const TOKEN_KEY = "attendance.token";
const DEVICE_KEY = "attendance.deviceId";
const ACTIVE_DEVICE_KEY = "attendance.activeDeviceId";

export function getDeviceId(owner?: string) {
  const storageKey = getDeviceStorageKey(owner);
  let deviceId = localStorage.getItem(storageKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(storageKey, deviceId);
  }

  return deviceId;
}

export async function getDeviceFingerprint() {
  const source = [
    navigator.userAgent,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width,
    screen.height,
    screen.colorDepth,
    navigator.hardwareConcurrency ?? "",
    navigator.platform ?? "",
  ].join("|");

  if (!crypto.subtle) {
    return btoa(source).slice(0, 128);
  }

  const encoded = new TextEncoder().encode(source);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const deviceId = localStorage.getItem(ACTIVE_DEVICE_KEY) ?? getDeviceId();
  return token ? { token, deviceId } : null;
}

export function storeToken(token: string, deviceId = getDeviceId()) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACTIVE_DEVICE_KEY, deviceId);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTIVE_DEVICE_KEY);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: StoredAuth | null } = {},
) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.auth?.token) {
    headers.set("Authorization", `Bearer ${options.auth.token}`);
  }

  const deviceId = options.auth?.deviceId ?? getDeviceId();
  headers.set("X-Attendance-Device", deviceId);

  const response = await fetch(path, {
    ...options,
    headers,
  });

  const isJson = response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json");
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiClientError(body?.error ?? "요청 처리에 실패했습니다.", response.status);
  }

  return body as T;
}

export function isAuthError(error: unknown) {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
}

export function formatKstDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatKstClock(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getDeviceStorageKey(owner?: string) {
  const normalizedOwner = owner?.normalize("NFC").replace(/\s+/g, "").trim();
  if (!normalizedOwner) {
    return DEVICE_KEY;
  }

  return `${DEVICE_KEY}:${encodeURIComponent(normalizedOwner.toLowerCase())}`;
}
