"use client";

import { useCallback, useEffect, useState } from "react";
import {
  apiFetch,
  clearToken,
  formatKstClock,
  formatKstDateTime,
  getStoredAuth,
  type StoredAuth,
} from "@/components/api";
import { LoginPanel } from "@/components/LoginPanel";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  role: "employee" | "admin";
};

type AttendanceRecord = {
  id: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workType: "office" | "remote" | "offsite" | "business_trip";
  note: string | null;
};

type StatusResponse = {
  kstDate: string;
  todayRecord: AttendanceRecord | null;
  openRecord: AttendanceRecord | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  hasPreviousOpen: boolean;
};

const workTypeLabels: Record<AttendanceRecord["workType"], string> = {
  office: "사무실",
  remote: "재택",
  offsite: "외근",
  business_trip: "출장",
};

export function EmployeeApp() {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback(async (storedAuth: StoredAuth) => {
    setMessage("");
    const me = await apiFetch<{ employee: Employee }>("/api/auth/me", {
      auth: storedAuth,
    });
    const [statusResult, recentResult] = await Promise.all([
      apiFetch<StatusResponse>("/api/attendance/status", { auth: storedAuth }),
      apiFetch<{ records: AttendanceRecord[] }>("/api/attendance/recent?limit=10", {
        auth: storedAuth,
      }),
    ]);

    setEmployee(me.employee);
    setStatus(statusResult);
    setRecords(recentResult.records);
  }, []);

  useEffect(() => {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);

    if (!storedAuth) {
      setIsLoading(false);
      return;
    }

    load(storedAuth)
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "정보를 불러오지 못했습니다.");
        clearToken();
        setAuth(null);
      })
      .finally(() => setIsLoading(false));
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh() {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    if (!storedAuth) {
      return;
    }

    await load(storedAuth);
  }

  async function runAction(path: string) {
    if (!auth) {
      return;
    }

    setMessage("");
    setIsMutating(true);
    try {
      await apiFetch(path, {
        method: "POST",
        auth,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setIsMutating(false);
    }
  }

  async function logout() {
    if (auth) {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        auth,
      }).catch(() => undefined);
    }

    clearToken();
    setAuth(null);
    setEmployee(null);
    setStatus(null);
    setRecords([]);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted">
        불러오는 중
      </main>
    );
  }

  if (!auth || !employee) {
    return <LoginPanel onLogin={refresh} />;
  }

  const currentRecord = status?.openRecord ?? status?.todayRecord;
  const statusText = currentRecord?.checkOutAt
    ? "퇴근 완료"
    : currentRecord?.checkInAt
      ? "근무 중"
      : "출근 전";

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-3 py-4 sm:px-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">{formatKstClock(clock)}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{employee.name}</h1>
          </div>
          <span className="rounded-full bg-field px-3 py-1 text-sm font-semibold text-ink">
            {statusText}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="primary-button min-h-14 text-base"
            disabled={!status?.canCheckIn || isMutating}
            onClick={() => runAction("/api/attendance/check-in")}
            type="button"
          >
            출근
          </button>
          <button
            className="secondary-button min-h-14 text-base"
            disabled={!status?.canCheckOut || isMutating}
            onClick={() => runAction("/api/attendance/check-out")}
            type="button"
          >
            퇴근
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {message}
          </p>
        ) : null}

        {status?.hasPreviousOpen ? (
          <p className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            이전 출근 기록에 퇴근이 없습니다. 관리자에게 수정 요청하세요.
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-line bg-field p-3">
            <dt className="label">출근</dt>
            <dd className="mt-1 font-semibold text-ink">
              {formatKstDateTime(currentRecord?.checkInAt)}
            </dd>
          </div>
          <div className="rounded border border-line bg-field p-3">
            <dt className="label">퇴근</dt>
            <dd className="mt-1 font-semibold text-ink">
              {formatKstDateTime(currentRecord?.checkOutAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-white p-4 shadow-panel">
        <h2 className="text-base font-bold text-ink">최근 기록</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-96 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pr-3">날짜</th>
                <th className="py-2 pr-3">출근</th>
                <th className="py-2 pr-3">퇴근</th>
                <th className="py-2">유형</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 font-medium">{record.workDate}</td>
                  <td className="py-2 pr-3">{formatKstDateTime(record.checkInAt)}</td>
                  <td className="py-2 pr-3">{formatKstDateTime(record.checkOutAt)}</td>
                  <td className="py-2">{workTypeLabels[record.workType]}</td>
                </tr>
              ))}
              {records.length === 0 ? (
                <tr>
                  <td className="py-5 text-center text-muted" colSpan={4}>
                    기록이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-5 text-center">
        <button
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          onClick={logout}
          type="button"
        >
          이 기기 로그아웃
        </button>
      </div>
    </main>
  );
}
