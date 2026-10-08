"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getStoredAuth, isAuthError } from "@/components/api";

/* 서버가 노션을 5분에 한 번 읽으니 화면도 5분마다만 다시 받는다. 탭이 안 보이면 받지 않는다 */
const REFRESH_MS = 5 * 60 * 1000;

export type ContentState<T> =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: T };

export function useContentData<T>(path: string) {
  const [state, setState] = useState<ContentState<T>>({ kind: "loading" });
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    const auth = getStoredAuth();
    if (!auth) {
      setState({ kind: "login" });
      return;
    }
    lastLoadRef.current = Date.now();
    try {
      const data = await apiFetch<T>(path, { auth });
      setState({ kind: "ready", data });
    } catch (error) {
      if (isAuthError(error)) {
        setState({ kind: "login" });
        return;
      }
      setState((prev) =>
        prev.kind === "ready"
          ? prev
          : { kind: "error", message: error instanceof Error ? error.message : "불러오지 못했어요." },
      );
    }
  }, [path]);

  useEffect(() => {
    void load();

    function refreshIfStale() {
      if (document.visibilityState === "visible" && Date.now() - lastLoadRef.current >= REFRESH_MS) {
        void load();
      }
    }

    const timer = window.setInterval(refreshIfStale, 60_000);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [load]);

  return state;
}

export function formatMonthDay(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayLabel(date: string) {
  return DOW[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
