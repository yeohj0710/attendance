"use client";

export type StoredAuth = {
  token: string;
  deviceId: string;
};

const TOKEN_KEY = "attendance.token";
const DEVICE_KEY = "attendance.deviceId";

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, deviceId);
  }

  return deviceId;
}

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const deviceId = getDeviceId();
  return token ? { token, deviceId } : null;
}

export function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
    throw new Error(body?.error ?? "요청 처리에 실패했습니다.");
  }

  return body as T;
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
