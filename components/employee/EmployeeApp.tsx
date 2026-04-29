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
import { Spinner } from "@/components/Spinner";

type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  role: "employee" | "admin";
};

type AttendanceRecord = {
  id: string;
  employeeId?: string;
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

type AttendanceActionResponse = {
  record: AttendanceRecord;
};

type DashboardResponse = {
  employee: Employee;
  status: StatusResponse;
  records: AttendanceRecord[];
  teamRecords: TeamAttendanceRecord[];
};

type TeamAttendanceRecord = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workType: AttendanceRecord["workType"];
  note: string | null;
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
  const [teamRecords, setTeamRecords] = useState<TeamAttendanceRecord[]>([]);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState("");

  const load = useCallback(async (storedAuth: StoredAuth, knownEmployee?: Employee) => {
    setMessage("");
    setIsRefreshing(true);

    try {
      const dashboard = await apiFetch<DashboardResponse>(
        "/api/attendance/dashboard?limit=10",
        { auth: storedAuth },
      );

      setEmployee(knownEmployee ?? dashboard.employee);
      setStatus(dashboard.status);
      setRecords(dashboard.records);
      setTeamRecords(dashboard.teamRecords);
    } finally {
      setIsRefreshing(false);
    }
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
        setMessage(
          error instanceof Error ? error.message : "정보를 불러오지 못했습니다.",
        );
        clearToken();
        setAuth(null);
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function refresh(loginEmployee?: Employee) {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    if (!storedAuth) return;
    if (loginEmployee) {
      setEmployee(loginEmployee);
      setIsLoading(false);
    }
    await load(storedAuth, loginEmployee);
  }

  async function runAction(path: string, actionLabel: string) {
    if (!auth) return;

    setMessage("");
    setIsMutating(true);
    setPendingAction(actionLabel);
    try {
      const result = await apiFetch<AttendanceActionResponse>(path, {
        method: "POST",
        auth,
      });
      applyRecord(result.record);
      setEncouragement(getActionMessage(actionLabel, result.record));
      void load(auth).catch((error) => {
        setMessage(error instanceof Error ? error.message : "최신 정보를 불러오지 못했습니다.");
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "처리하지 못했습니다.");
    } finally {
      setIsMutating(false);
      setPendingAction(null);
    }
  }

  function applyRecord(record: AttendanceRecord) {
    setRecords((currentRecords) => {
      const nextRecords = [
        record,
        ...currentRecords.filter((item) => item.id !== record.id),
      ].sort((a, b) => b.workDate.localeCompare(a.workDate));
      return nextRecords.slice(0, 10);
    });

    setStatus((currentStatus) => {
      if (!currentStatus || currentStatus.kstDate !== record.workDate) {
        return currentStatus;
      }

      return {
        ...currentStatus,
        todayRecord: record,
        openRecord: record.checkInAt && !record.checkOutAt ? record : null,
        canCheckIn: !record.checkInAt && !record.checkOutAt,
        canCheckOut: true,
        hasPreviousOpen: false,
      };
    });

    setTeamRecords((currentRecords) =>
      currentRecords.map((item) =>
        item.employeeId === employee?.id
          ? {
              ...item,
              checkInAt: record.checkInAt,
              checkOutAt: record.checkOutAt,
              workType: record.workType,
              note: record.note,
            }
          : item,
      ),
    );
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
    setTeamRecords([]);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <Spinner />
          불러오는 중
        </span>
      </main>
    );
  }

  if (!auth || !employee) {
    return <LoginPanel onLogin={refresh} />;
  }

  const currentRecord = status?.openRecord ?? status?.todayRecord;
  const statusText = currentRecord?.checkOutAt
    ? "오늘도 고생했어요"
    : currentRecord?.checkInAt
      ? "함께 일하는 중"
      : isRefreshing
        ? "확인 중"
        : "좋은 하루 시작";
  const canPressCheckOut =
    Boolean(status?.canCheckOut || status?.todayRecord?.checkInAt) && !isMutating;
  const canCancelCheckOut = Boolean(status?.todayRecord?.checkOutAt) && !isMutating;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-3 py-8 sm:px-5">
      <section className="rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <img
              alt="웰니스박스"
              className="mb-3 h-7 w-auto"
              height={28}
              src="/brand/wellnessbox-logo.png"
              width={140}
            />
            <p className="text-xs font-semibold text-muted">{formatKstClock(clock)}</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">{employee.name}</h1>
            <p className="mt-2 text-sm text-muted">{getWarmGreeting(currentRecord)}</p>
          </div>
          <span className="rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent">
            {statusText}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="primary-button min-h-14 text-base"
            disabled={!status?.canCheckIn || isMutating}
            onClick={() => runAction("/api/attendance/check-in", "출근 처리 중")}
            type="button"
          >
            {pendingAction === "출근 처리 중" ? (
              <>
                <Spinner className="mr-2" />
                출근 처리 중
              </>
            ) : (
              "좋은 하루 시작하기 ☀️"
            )}
          </button>
          <button
            className="secondary-button min-h-14 text-base"
            disabled={!canPressCheckOut}
            onClick={() => runAction("/api/attendance/check-out", "퇴근 처리 중")}
            type="button"
          >
            {pendingAction === "퇴근 처리 중" ? (
              <>
                <Spinner className="mr-2" />
                퇴근 처리 중
              </>
            ) : (
              "오늘 마무리하기 🌙"
            )}
          </button>
        </div>

        {canCancelCheckOut ? (
          <div className="mt-3 text-right">
            <button
              className="text-xs font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
              onClick={() => runAction("/api/attendance/cancel-check-out", "퇴근 취소 중")}
              type="button"
            >
              {pendingAction === "퇴근 취소 중" ? (
                <span className="inline-flex items-center gap-1">
                  <Spinner className="h-3 w-3" />
                  취소 중
                </span>
              ) : (
                "퇴근 취소"
              )}
            </button>
          </div>
        ) : null}

        {message ? (
          <p className="mt-4 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            {message}
          </p>
        ) : null}

        {encouragement ? (
          <p className="mt-4 rounded border border-accent/20 bg-accentSoft px-3 py-2 text-sm font-semibold text-accent">
            {encouragement}
          </p>
        ) : null}

        {status?.hasPreviousOpen ? (
          <p className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            이전 퇴근 기록이 비어 있어요. 다음날 접속 시 23:59 퇴근으로 자동 정리해둘게요.
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded border border-line bg-field/80 p-3">
            <dt className="label">오늘의 시작</dt>
            <dd className="mt-1 font-semibold text-ink">
              {isRefreshing && !currentRecord ? <LoadingLine /> : formatKstDateTime(currentRecord?.checkInAt)}
            </dd>
          </div>
          <div className="rounded border border-line bg-field/80 p-3">
            <dt className="label">오늘의 마무리</dt>
            <dd className="mt-1 font-semibold text-ink">
              {isRefreshing && !currentRecord ? <LoadingLine /> : formatKstDateTime(currentRecord?.checkOutAt)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">오늘 함께하는 사람들 🤝</h2>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
              <Spinner className="h-3 w-3" />
              갱신 중
            </span>
          ) : null}
        </div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
          {teamRecords.map((record) => (
            <div
              className="grid grid-cols-[1fr_auto] gap-3 rounded border border-line bg-field/70 px-3 py-2 text-sm"
              key={record.employeeId}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold text-ink">{record.employeeName}</span>
                  <TeamStatusBadge record={record} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  시작 {formatKstTime(record.checkInAt)} · 마무리 {formatKstTime(record.checkOutAt)}
                </p>
              </div>
              {record.employeeId === employee.id ? (
                <span className="self-start rounded bg-white px-2 py-1 text-xs font-bold text-accent ring-1 ring-line">
                  나
                </span>
              ) : null}
            </div>
          ))}
          {teamRecords.length === 0 && isRefreshing ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div className="rounded border border-line bg-field/70 px-3 py-3" key={index}>
                  <LoadingLine />
                </div>
              ))}
            </div>
          ) : null}
          {teamRecords.length === 0 && !isRefreshing ? (
            <p className="rounded border border-line py-5 text-center text-sm text-muted">
              아직 오늘의 현황이 없어요. 첫 기록을 기다리는 중이에요.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink">나의 최근 발자국 👣</h2>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
              <Spinner className="h-3 w-3" />
              갱신 중
            </span>
          ) : null}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-96 border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 pr-3">날짜</th>
                <th className="py-2 pr-3">시작</th>
                <th className="py-2 pr-3">마무리</th>
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
              {records.length === 0 && isRefreshing ? (
                <RecentLoadingRows />
              ) : null}
              {records.length === 0 && !isRefreshing ? (
                <tr>
                  <td className="py-5 text-center text-muted" colSpan={4}>
                    아직 기록이 없어요. 오늘부터 천천히 쌓아가면 돼요.
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

function LoadingLine() {
  return <span className="block h-4 w-20 animate-pulse rounded bg-line" />;
}

function TeamStatusBadge({ record }: { record: TeamAttendanceRecord }) {
  const isMissingCheckIn = !record.checkInAt && record.checkOutAt;
  const label = isMissingCheckIn
    ? "시작 깜빡"
    : record.checkOutAt
      ? "마무리"
      : record.checkInAt
        ? "함께하는 중"
        : "준비 중";
  const className = isMissingCheckIn
    ? "bg-warn/10 text-warn"
    : record.checkOutAt
      ? "bg-accent/10 text-accent"
      : record.checkInAt
        ? "bg-warn/10 text-warn"
        : "bg-slate-100 text-muted";

  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${className}`}>{label}</span>;
}

function getWarmGreeting(record: AttendanceRecord | null | undefined) {
  if (record?.checkOutAt) {
    return "고생 많았어요. 남은 하루는 조금 가볍게 보내요.";
  }

  if (record?.checkInAt) {
    return "오늘도 천천히, 할 수 있는 만큼만 잘 해봐요.";
  }

  return "어서 와요. 오늘도 무리하지 말고 차근차근 시작해요.";
}

function getActionMessage(actionLabel: string, record: AttendanceRecord) {
  if (actionLabel === "출근 처리 중") {
    return "좋은 아침이에요. 오늘도 같이 잘 보내봐요!";
  }

  if (actionLabel === "퇴근 처리 중") {
    return record.checkInAt
      ? "오늘도 고생하셨어요. 퇴근 기록을 남겨뒀어요!"
      : "출근을 깜빡했어도 괜찮아요. 퇴근 기록부터 남겨뒀어요.";
  }

  if (actionLabel === "퇴근 취소 중") {
    return "괜찮아요. 퇴근 기록을 다시 열어뒀어요.";
  }

  return "";
}

function formatKstTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function RecentLoadingRows() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <tr key={index} className="border-b border-line last:border-0">
          <td className="py-3 pr-3">
            <span className="block h-4 w-20 animate-pulse rounded bg-line" />
          </td>
          <td className="py-3 pr-3">
            <span className="block h-4 w-16 animate-pulse rounded bg-line" />
          </td>
          <td className="py-3 pr-3">
            <span className="block h-4 w-16 animate-pulse rounded bg-line" />
          </td>
          <td className="py-3">
            <span className="block h-4 w-12 animate-pulse rounded bg-line" />
          </td>
        </tr>
      ))}
    </>
  );
}
