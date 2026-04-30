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
  teamMonth: TeamMonthAttendance;
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
  taskCount?: number;
  doneCount?: number;
};

type TeamMonthAttendance = {
  startDate: string;
  endDate: string;
  records: TeamAttendanceRecord[];
};

type WorkTaskSection = "today" | "later";

type WorkTask = {
  id: string;
  text: string;
  done: boolean;
  section: WorkTaskSection;
  createdAt: string;
  updatedAt: string;
};

type WorkLog = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  summary: string;
  tasks: WorkTask[];
  taskCount: number;
  doneCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

const workTypeLabels: Record<AttendanceRecord["workType"], string> = {
  office: "사무실",
  remote: "재택",
  offsite: "외근",
  business_trip: "출장",
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function EmployeeApp() {
  const [auth, setAuth] = useState<StoredAuth | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teamRecords, setTeamRecords] = useState<TeamAttendanceRecord[]>([]);
  const [teamMonth, setTeamMonth] = useState<TeamMonthAttendance | null>(null);
  const [message, setMessage] = useState("");
  const [clock, setClock] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState("");
  const [selectedWorkRecord, setSelectedWorkRecord] = useState<TeamAttendanceRecord | null>(null);
  const [deleteTaskRequest, setDeleteTaskRequest] = useState<{
    scope: "today" | "work";
    task: WorkTask;
  } | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [deleteWithoutAskingAgain, setDeleteWithoutAskingAgain] = useState(false);
  const [workLog, setWorkLog] = useState<WorkLog | null>(null);
  const [workLogMessage, setWorkLogMessage] = useState("");
  const [isWorkLogLoading, setIsWorkLogLoading] = useState(false);
  const [isWorkLogSaving, setIsWorkLogSaving] = useState(false);
  const [pendingWorkTaskId, setPendingWorkTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [todayWorkLog, setTodayWorkLog] = useState<WorkLog | null>(null);
  const [todayWorkMessage, setTodayWorkMessage] = useState("");
  const [isTodayWorkLoading, setIsTodayWorkLoading] = useState(false);
  const [isTodayWorkSaving, setIsTodayWorkSaving] = useState(false);
  const [pendingTodayTaskId, setPendingTodayTaskId] = useState<string | null>(null);
  const [todayTaskText, setTodayTaskText] = useState("");

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
      setTeamMonth(dashboard.teamMonth);
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

  useEffect(() => {
    if (!auth || !employee || !status?.kstDate) return;
    void loadTodayWorkLog();
  }, [auth, employee, status?.kstDate]);

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

    setTeamMonth((currentMonth) => {
      if (!currentMonth || !employee?.id || !isDateInRange(record.workDate, currentMonth)) {
        return currentMonth;
      }

      const existingRecord = currentMonth.records.find(
        (item) => item.employeeId === employee.id && item.workDate === record.workDate,
      );
      const nextRecord: TeamAttendanceRecord = {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.name,
        workDate: record.workDate,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        workType: record.workType,
        note: record.note,
        taskCount: existingRecord?.taskCount ?? 0,
        doneCount: existingRecord?.doneCount ?? 0,
      };

      const recordsWithoutMe = currentMonth.records.filter(
        (item) => !(item.employeeId === employee.id && item.workDate === record.workDate),
      );

      return {
        ...currentMonth,
        records: [...recordsWithoutMe, nextRecord].sort(
          (a, b) =>
            a.workDate.localeCompare(b.workDate) ||
            a.employeeName.localeCompare(b.employeeName),
        ),
      };
    });
  }

  async function openWorkLog(record: TeamAttendanceRecord) {
    if (!auth) return;

    setSelectedWorkRecord(record);
    setWorkLog(null);
    setWorkLogMessage("");
    setNewTaskText("");
    setIsWorkLogLoading(true);

    try {
      const params = new URLSearchParams({
        employeeId: record.employeeId,
        workDate: record.workDate,
      });
      const result = await apiFetch<{ workLog: WorkLog }>(`/api/work-log?${params.toString()}`, {
        auth,
      });
      setWorkLog(result.workLog);
    } catch (error) {
      setWorkLogMessage(error instanceof Error ? error.message : "업무 기록을 불러오지 못했습니다.");
    } finally {
      setIsWorkLogLoading(false);
    }
  }

  async function loadTodayWorkLog() {
    if (!auth || !employee || !status?.kstDate) return;

    setTodayWorkMessage("");
    setIsTodayWorkLoading(true);
    try {
      const params = new URLSearchParams({
        employeeId: employee.id,
        workDate: status.kstDate,
      });
      const result = await apiFetch<{ workLog: WorkLog }>(`/api/work-log?${params.toString()}`, {
        auth,
      });
      setTodayWorkLog(result.workLog);
    } catch (error) {
      setTodayWorkMessage(error instanceof Error ? error.message : "오늘 업무를 불러오지 못했습니다.");
    } finally {
      setIsTodayWorkLoading(false);
    }
  }

  async function persistTodayWorkLog(nextLog: WorkLog) {
    if (!auth) return;

    setTodayWorkLog(nextLog);
    setTodayWorkMessage("");
    setIsTodayWorkSaving(true);
    try {
      const result = await apiFetch<{ workLog: WorkLog }>("/api/work-log", {
        method: "PUT",
        auth,
        body: JSON.stringify({
          employeeId: nextLog.employeeId,
          workDate: nextLog.workDate,
          summary: nextLog.summary,
          tasks: nextLog.tasks,
        }),
      });
      setTodayWorkLog(result.workLog);
      updateTeamMonthWorkSummary(result.workLog);
      setWorkLog((currentLog) =>
        currentLog?.employeeId === result.workLog.employeeId &&
        currentLog.workDate === result.workLog.workDate
          ? result.workLog
          : currentLog,
      );
    } catch (error) {
      setTodayWorkMessage(error instanceof Error ? error.message : "오늘 업무를 저장하지 못했습니다.");
    } finally {
      setIsTodayWorkSaving(false);
    }
  }

  function closeWorkLog() {
    setSelectedWorkRecord(null);
    setWorkLog(null);
    setWorkLogMessage("");
    setNewTaskText("");
  }

  async function persistWorkLog(nextLog: WorkLog) {
    if (!auth) return;

    setWorkLog(nextLog);
    setWorkLogMessage("");
    setIsWorkLogSaving(true);

    try {
      const result = await apiFetch<{ workLog: WorkLog }>("/api/work-log", {
        method: "PUT",
        auth,
        body: JSON.stringify({
          employeeId: nextLog.employeeId,
          workDate: nextLog.workDate,
          summary: nextLog.summary,
          tasks: nextLog.tasks,
        }),
      });
      setWorkLog(result.workLog);
      updateTeamMonthWorkSummary(result.workLog);
    } catch (error) {
      setWorkLogMessage(error instanceof Error ? error.message : "업무 기록을 저장하지 못했습니다.");
    } finally {
      setIsWorkLogSaving(false);
    }
  }

  function updateTeamMonthWorkSummary(nextLog: WorkLog) {
    setTeamMonth((currentMonth) => {
      if (!currentMonth) {
        return currentMonth;
      }

      return {
        ...currentMonth,
        records: currentMonth.records.map((record) =>
          record.employeeId === nextLog.employeeId && record.workDate === nextLog.workDate
            ? {
                ...record,
                taskCount: nextLog.taskCount,
                doneCount: nextLog.doneCount,
              }
            : record,
        ),
      };
    });
  }

  async function addWorkTask() {
    if (!workLog || !newTaskText.trim()) return;

    const now = new Date().toISOString();
    const nextLog = {
      ...workLog,
      tasks: [
        {
          id: crypto.randomUUID(),
          text: newTaskText.trim(),
          done: false,
          section: "today" as WorkTaskSection,
          createdAt: now,
          updatedAt: now,
        },
        ...workLog.tasks,
      ],
    };
    setNewTaskText("");
    await persistWorkLog(nextLog);
  }

  async function addTodayTask() {
    if (!todayWorkLog || !todayTaskText.trim()) return;

    const now = new Date().toISOString();
    const nextLog = {
      ...todayWorkLog,
      tasks: [
        {
          id: crypto.randomUUID(),
          text: todayTaskText.trim(),
          done: false,
          section: "today" as WorkTaskSection,
          createdAt: now,
          updatedAt: now,
        },
        ...todayWorkLog.tasks,
      ],
    };
    setTodayTaskText("");
    await persistTodayWorkLog(nextLog);
  }

  async function toggleWorkTask(taskId: string) {
    if (!workLog || isWorkLogSaving) return;

    setPendingWorkTaskId(taskId);
    try {
      await persistWorkLog({
        ...workLog,
        tasks: workLog.tasks.map((task) =>
          task.id === taskId
            ? { ...task, done: !task.done, updatedAt: new Date().toISOString() }
            : task,
        ),
      });
    } finally {
      setPendingWorkTaskId(null);
    }
  }

  async function toggleTodayTask(taskId: string) {
    if (!todayWorkLog || isTodayWorkSaving) return;

    setPendingTodayTaskId(taskId);
    try {
      await persistTodayWorkLog({
        ...todayWorkLog,
        tasks: todayWorkLog.tasks.map((task) =>
          task.id === taskId
            ? { ...task, done: !task.done, updatedAt: new Date().toISOString() }
            : task,
        ),
      });
    } finally {
      setPendingTodayTaskId(null);
    }
  }

  async function updateWorkTask(taskId: string, text: string) {
    const nextText = text.trim();
    if (!workLog || isWorkLogSaving || !nextText) return;

    setPendingWorkTaskId(taskId);
    try {
      await persistWorkLog({
        ...workLog,
        tasks: workLog.tasks.map((task) =>
          task.id === taskId
            ? { ...task, text: nextText, updatedAt: new Date().toISOString() }
            : task,
        ),
      });
    } finally {
      setPendingWorkTaskId(null);
    }
  }

  async function updateTodayTask(taskId: string, text: string) {
    const nextText = text.trim();
    if (!todayWorkLog || isTodayWorkSaving || !nextText) return;

    setPendingTodayTaskId(taskId);
    try {
      await persistTodayWorkLog({
        ...todayWorkLog,
        tasks: todayWorkLog.tasks.map((task) =>
          task.id === taskId
            ? { ...task, text: nextText, updatedAt: new Date().toISOString() }
            : task,
        ),
      });
    } finally {
      setPendingTodayTaskId(null);
    }
  }

  function requestRemoveWorkTask(task: WorkTask) {
    if (skipDeleteConfirm) {
      void removeWorkTask(task.id);
      return;
    }

    setDeleteWithoutAskingAgain(false);
    setDeleteTaskRequest({ scope: "work", task });
  }

  function requestRemoveTodayTask(task: WorkTask) {
    if (skipDeleteConfirm) {
      void removeTodayTask(task.id);
      return;
    }

    setDeleteWithoutAskingAgain(false);
    setDeleteTaskRequest({ scope: "today", task });
  }

  async function confirmRemoveTask() {
    if (!deleteTaskRequest) return;

    if (deleteWithoutAskingAgain) {
      setSkipDeleteConfirm(true);
    }

    const request = deleteTaskRequest;
    setDeleteTaskRequest(null);

    if (request.scope === "today") {
      await removeTodayTask(request.task.id);
      return;
    }

    await removeWorkTask(request.task.id);
  }

  async function removeWorkTask(taskId: string) {
    if (!workLog || isWorkLogSaving) return;

    setPendingWorkTaskId(taskId);
    try {
      await persistWorkLog({
        ...workLog,
        tasks: workLog.tasks.filter((task) => task.id !== taskId),
      });
    } finally {
      setPendingWorkTaskId(null);
    }
  }

  async function removeTodayTask(taskId: string) {
    if (!todayWorkLog || isTodayWorkSaving) return;

    setPendingTodayTaskId(taskId);
    try {
      await persistTodayWorkLog({
        ...todayWorkLog,
        tasks: todayWorkLog.tasks.filter((task) => task.id !== taskId),
      });
    } finally {
      setPendingTodayTaskId(null);
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
    setTeamRecords([]);
    setTeamMonth(null);
    setTodayWorkLog(null);
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
    <>
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-start px-3 pb-16 pt-6 sm:px-5 sm:pt-8">
      <section className="w-full max-w-xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
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

        <div className="mt-5 rounded border border-line bg-field/60">
          <div className="px-3 py-3">
            <span>
              <span className="block text-sm font-bold text-ink">오늘 할 일 / 한 일</span>
              <span className="mt-0.5 block text-xs text-muted">
                오늘 할 일을 적어두고 끝난 항목은 체크하세요.
              </span>
            </span>
          </div>
          <QuickWorkLogPanel
            isLoading={isTodayWorkLoading}
            isSaving={isTodayWorkSaving}
            message={todayWorkMessage}
            newTaskText={todayTaskText}
            onAddTask={addTodayTask}
            onRemoveTask={requestRemoveTodayTask}
            onTaskTextChange={setTodayTaskText}
            onToggleTask={toggleTodayTask}
            onUpdateTask={updateTodayTask}
            processingTaskId={pendingTodayTaskId}
            workLog={todayWorkLog}
          />
        </div>
      </section>

      <section className="mt-4 w-full max-w-xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
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

      <section className="mt-4 w-full max-w-4xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">이번 달 팀 달력 🗓️</h2>
            <p className="mt-1 text-xs text-muted">날짜별로 서로의 하루 흐름을 가볍게 볼 수 있어요.</p>
          </div>
          {isRefreshing ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
              <Spinner className="h-3 w-3" />
              갱신 중
            </span>
          ) : null}
        </div>
        <TeamMonthCalendar
          currentEmployeeId={employee.id}
          onSelectRecord={openWorkLog}
          teamMonth={teamMonth}
        />
      </section>

      <section className="mt-4 w-full max-w-4xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
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

      <div className="mt-5 flex items-center justify-center gap-3 text-xs">
        <button
          className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
          onClick={logout}
          type="button"
        >
          이 기기 로그아웃
        </button>
        <span className="text-line">|</span>
        <a className="text-muted underline-offset-4 hover:text-ink hover:underline" href="/admin">
          관리자 로그인
        </a>
      </div>
    </main>
    {selectedWorkRecord ? (
      <WorkLogModal
        canEdit={selectedWorkRecord.employeeId === employee.id || employee.role === "admin"}
        isLoading={isWorkLogLoading}
        isSaving={isWorkLogSaving}
        message={workLogMessage}
        newTaskText={newTaskText}
        onAddTask={addWorkTask}
        onClose={closeWorkLog}
        onRemoveTask={requestRemoveWorkTask}
        onTaskTextChange={setNewTaskText}
        onToggleTask={toggleWorkTask}
        onUpdateTask={updateWorkTask}
        processingTaskId={pendingWorkTaskId}
        record={selectedWorkRecord}
        workLog={workLog}
      />
    ) : null}
    {deleteTaskRequest ? (
      <DeleteTaskConfirmModal
        dontAskAgain={deleteWithoutAskingAgain}
        onCancel={() => setDeleteTaskRequest(null)}
        onConfirm={confirmRemoveTask}
        onDontAskAgainChange={setDeleteWithoutAskingAgain}
        taskText={deleteTaskRequest.task.text}
      />
    ) : null}
    </>
  );
}

function LoadingLine() {
  return <span className="block h-4 w-20 animate-pulse rounded bg-line" />;
}

function TeamMonthCalendar({
  currentEmployeeId,
  onSelectRecord,
  teamMonth,
}: {
  currentEmployeeId: string;
  onSelectRecord: (record: TeamAttendanceRecord) => void;
  teamMonth: TeamMonthAttendance | null;
}) {
  if (!teamMonth) {
    return (
      <div className="mt-3 rounded border border-line bg-field/70 px-3 py-5 text-center text-sm text-muted">
        달력을 불러오는 중이에요.
      </div>
    );
  }

  const recordsByDate = new Map<string, TeamAttendanceRecord[]>();
  for (const record of teamMonth.records) {
    const dayRecords = recordsByDate.get(record.workDate) ?? [];
    dayRecords.push(record);
    recordsByDate.set(record.workDate, dayRecords);
  }

  const days = getCalendarDays(teamMonth.startDate, teamMonth.endDate);

  return (
    <div className="mt-3 overflow-hidden rounded border-l border-t border-line">
      <div className="w-full">
        <div className="grid grid-cols-7 text-center text-[10px] font-bold text-muted sm:text-xs">
          {weekdayLabels.map((weekday, index) => (
            <div
              className={`border-b border-r border-line bg-field/80 py-2 ${weekendTextClass(index)}`}
              key={weekday}
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const dayRecords = day.date ? recordsByDate.get(day.date) ?? [] : [];
            const dayOfWeek = day.date ? dateStringToUtcDate(day.date).getUTCDay() : null;

            return (
              <div
                className="min-h-32 min-w-0 border-b border-r border-line bg-white p-1.5 sm:min-h-36 sm:p-2"
                key={day.key}
              >
                {day.date ? (
                  <>
                    <div className={`mb-1 text-right text-[10px] font-bold sm:mb-2 sm:text-xs ${weekendTextClass(dayOfWeek) || "text-muted"}`}>
                      {Number(day.date.slice(8, 10))}
                    </div>
                    <div className="max-h-28 space-y-1 overflow-y-auto pr-0.5 sm:max-h-32">
                      {dayRecords.map((record) => (
                        <TeamCalendarRecord
                          currentEmployeeId={currentEmployeeId}
                          key={`${record.employeeId}-${record.workDate}`}
                          onSelect={onSelectRecord}
                          record={record}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamCalendarRecord({
  currentEmployeeId,
  onSelect,
  record,
}: {
  currentEmployeeId: string;
  onSelect: (record: TeamAttendanceRecord) => void;
  record: TeamAttendanceRecord;
}) {
  const isMe = record.employeeId === currentEmployeeId;
  const timeText = `${formatKstTime(record.checkInAt)}~${formatKstTime(record.checkOutAt)}`;
  const workedMinutes = getWorkedMinutes(record);
  const durationText = workedMinutes === null ? "" : formatWorkedDuration(workedMinutes);
  const isLongDay = workedMinutes !== null && workedMinutes >= 10 * 60;
  const isVeryLongDay = workedMinutes !== null && workedMinutes >= 12 * 60;
  const cardClassName = isVeryLongDay
    ? "border-warn/40 bg-warn/10 text-warn shadow-[0_0_0_1px_rgba(234,88,12,0.08)]"
    : isLongDay || isMe
      ? "border-accent/30 bg-accentSoft text-accent"
      : "border-line bg-field/80 text-ink";
  const hasTasks = Boolean(record.taskCount);

  return (
    <button
      className={`w-full min-w-0 rounded border px-1.5 py-1 text-left text-[10px] leading-tight transition hover:border-accent/50 hover:shadow-md hover:ring-1 hover:ring-inset hover:ring-accent/20 sm:px-2 sm:py-1.5 sm:text-xs ${cardClassName}`}
      onClick={() => onSelect(record)}
      title={`${record.employeeName} ${timeText}${durationText ? ` · ${durationText}` : ""}`}
      type="button"
    >
      <div className="truncate font-bold">
        {record.employeeName} {isMe ? "나" : ""} {isLongDay ? "🔥" : ""}
      </div>
      <div className="mt-0.5 break-words text-[10px] opacity-80 sm:text-[11px]">{timeText}</div>
      {durationText ? (
        <div className="mt-1 inline-flex rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-bold opacity-90">
          {durationText}
        </div>
      ) : null}
      {hasTasks ? (
        <div className="mt-1 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-bold opacity-90">
          업무 {record.doneCount ?? 0}/{record.taskCount}
        </div>
      ) : null}
    </button>
  );
}

function QuickWorkLogPanel({
  isLoading,
  isSaving,
  message,
  newTaskText,
  onAddTask,
  onRemoveTask,
  onTaskTextChange,
  onToggleTask,
  onUpdateTask,
  processingTaskId,
  workLog,
}: {
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  newTaskText: string;
  onAddTask: () => void;
  onRemoveTask: (task: WorkTask) => void;
  onTaskTextChange: (text: string) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  processingTaskId: string | null;
  workLog: WorkLog | null;
}) {
  const tasks = workLog?.tasks ?? [];

  return (
    <div className="border-t border-line px-3 pb-3">
      {isLoading ? (
        <div className="flex items-center gap-2 py-5 text-sm font-semibold text-muted">
          <Spinner />
          오늘 업무를 불러오는 중
        </div>
      ) : null}

      {!isLoading && workLog ? (
        <div className="space-y-3 pt-3">
          <TaskSection
            canEdit
            isSaving={isSaving}
            onRemoveTask={onRemoveTask}
            onToggleTask={onToggleTask}
            onUpdateTask={onUpdateTask}
            processingTaskId={processingTaskId}
            tasks={tasks}
            title="오늘의 업무"
          />

          {tasks.length === 0 ? (
            <p className="rounded border border-line bg-white/70 px-3 py-4 text-center text-sm text-muted">
              아직 적힌 업무가 없어요. 하나만 적어도 퇴근할 때 훨씬 편해져요.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className="field text-sm"
              disabled={isSaving}
              onChange={(event) => onTaskTextChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddTask();
                }
              }}
              placeholder="할 일 또는 한 일을 입력하세요"
              value={newTaskText}
            />
            <button
              className="primary-button px-4 py-2 text-sm"
              disabled={isSaving || !newTaskText.trim()}
              onClick={onAddTask}
              type="button"
            >
              추가
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function WorkLogModal({
  canEdit,
  isLoading,
  isSaving,
  message,
  newTaskText,
  onAddTask,
  onClose,
  onRemoveTask,
  onTaskTextChange,
  onToggleTask,
  onUpdateTask,
  processingTaskId,
  record,
  workLog,
}: {
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  newTaskText: string;
  onAddTask: () => void;
  onClose: () => void;
  onRemoveTask: (task: WorkTask) => void;
  onTaskTextChange: (text: string) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  processingTaskId: string | null;
  record: TeamAttendanceRecord;
  workLog: WorkLog | null;
}) {
  const tasks = workLog?.tasks ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 px-3 py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-full w-full max-w-2xl overflow-hidden rounded-lg border border-line bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-muted">{record.workDate}</p>
            <h3 className="truncate text-lg font-bold text-ink">
              {record.employeeName} 업무 기록
            </h3>
            <p className="mt-1 text-xs text-muted">
              {formatKstTime(record.checkInAt)} ~ {formatKstTime(record.checkOutAt)}
            </p>
          </div>
          <button
            className="rounded px-2 py-1 text-sm font-bold text-muted hover:bg-field hover:text-ink"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-muted">
              <Spinner />
              업무 기록을 불러오는 중
            </div>
          ) : null}

          {!isLoading && workLog ? (
            <div className="space-y-5">
              <TaskSection
                canEdit={canEdit}
                isSaving={isSaving}
                onRemoveTask={onRemoveTask}
                onToggleTask={onToggleTask}
                onUpdateTask={onUpdateTask}
                processingTaskId={processingTaskId}
                tasks={tasks}
                title="오늘의 업무"
              />

              {tasks.length === 0 ? (
                <p className="rounded border border-line py-8 text-center text-sm text-muted">
                  아직 업무 체크리스트가 없어요. 오늘 할 일을 하나씩 적어두면 하루가 조금 선명해져요.
                </p>
              ) : null}

              {canEdit ? (
                <div className="rounded border border-line p-3">
                  <p className="text-sm font-bold text-ink">업무 추가</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      className="field"
                      disabled={isSaving}
                      onChange={(event) => onTaskTextChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          onAddTask();
                        }
                      }}
                      placeholder="할 일을 입력하세요"
                      value={newTaskText}
                    />
                    <button
                      className="primary-button px-4 py-2 text-sm"
                      disabled={isSaving || !newTaskText.trim()}
                      onClick={onAddTask}
                      type="button"
                    >
                      추가
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rounded border border-line bg-field/70 px-3 py-2 text-xs text-muted">
                  다른 사람의 업무 기록은 참고용으로만 볼 수 있어요.
                </p>
              )}
            </div>
          ) : null}

          {message ? (
            <p className="mt-3 rounded border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TaskSection({
  canEdit,
  isSaving,
  onRemoveTask,
  onToggleTask,
  onUpdateTask,
  processingTaskId,
  tasks,
  title,
}: {
  canEdit: boolean;
  isSaving: boolean;
  onRemoveTask: (task: WorkTask) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  processingTaskId: string | null;
  tasks: WorkTask[];
  title: string;
}) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  if (tasks.length === 0) {
    return null;
  }

  function startEditing(task: WorkTask) {
    setEditingTaskId(task.id);
    setEditingText(task.text);
  }

  function cancelEditing() {
    setEditingTaskId(null);
    setEditingText("");
  }

  function saveEditing(task: WorkTask) {
    const nextText = editingText.trim();
    if (!nextText) return;

    if (nextText !== task.text) {
      onUpdateTask(task.id, nextText);
    }
    cancelEditing();
  }

  return (
    <section>
      <h4 className="mb-2 text-sm font-bold text-ink">{title}</h4>
      <div className="space-y-2">
        {tasks.map((task) => {
          const isProcessing = processingTaskId === task.id;
          const isEditing = editingTaskId === task.id;

          return (
            <div
              className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded border px-3 py-2 text-sm transition ${
                isProcessing ? "border-accent/30 bg-accentSoft/60" : "border-line bg-white"
              }`}
              key={task.id}
            >
              <input
                checked={task.done}
                className="mt-1 h-4 w-4 accent-accent"
                disabled={!canEdit || isProcessing}
                onChange={() => onToggleTask(task.id)}
                type="checkbox"
              />
              <div className="min-w-0">
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      className="field min-h-20 resize-y text-sm"
                      disabled={isProcessing}
                      onChange={(event) => setEditingText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEditing();
                        }
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          event.preventDefault();
                          saveEditing(task);
                        }
                      }}
                      value={editingText}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        className="secondary-button px-3 py-1.5 text-xs"
                        onClick={cancelEditing}
                        type="button"
                      >
                        취소
                      </button>
                      <button
                        className="primary-button px-3 py-1.5 text-xs"
                        disabled={!editingText.trim() || isProcessing}
                        onClick={() => saveEditing(task)}
                        type="button"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <span
                    className={`block whitespace-pre-wrap break-words leading-relaxed ${
                      task.done ? "text-muted line-through" : "text-ink"
                    }`}
                  >
                    {task.text}
                  </span>
                )}
              </div>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`${task.text} 수정`}
                    className="rounded p-1 text-muted transition hover:bg-accent/10 hover:text-accent disabled:hover:bg-transparent disabled:hover:text-muted"
                    disabled={isProcessing || isEditing}
                    onClick={() => startEditing(task)}
                    type="button"
                  >
                    <PencilIcon />
                  </button>
                  <button
                    aria-label={`${task.text} 삭제`}
                    className="rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger disabled:hover:bg-transparent disabled:hover:text-muted"
                    disabled={isProcessing || isEditing}
                    onClick={() => onRemoveTask(task)}
                    type="button"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeleteTaskConfirmModal({
  dontAskAgain,
  onCancel,
  onConfirm,
  onDontAskAgainChange,
  taskText,
}: {
  dontAskAgain: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onDontAskAgainChange: (value: boolean) => void;
  taskText: string;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 px-3 py-6"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="w-full max-w-sm rounded-lg border border-line bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="text-base font-bold text-ink">업무를 삭제할까요?</h3>
        <p className="mt-2 break-words rounded border border-line bg-field/70 px-3 py-2 text-sm text-muted">
          {taskText}
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-muted">
          <input
            checked={dontAskAgain}
            className="h-4 w-4 accent-accent"
            onChange={(event) => onDontAskAgainChange(event.target.checked)}
            type="checkbox"
          />
          이 화면에서는 다시 묻지 않기
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button className="secondary-button px-3 py-2 text-sm" onClick={onCancel} type="button">
            취소
          </button>
          <button
            className="inline-flex items-center justify-center rounded bg-danger px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#991b1b]"
            onClick={onConfirm}
            type="button"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        d="m16.9 4.6 2.5 2.5m-1.2-3.8a1.8 1.8 0 0 1 2.5 2.5L8.7 17.8 4.8 19.2l1.4-3.9 12-12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        d="M14.7 6.3v-.8c0-.9-.7-1.5-1.5-1.5h-2.4c-.9 0-1.5.7-1.5 1.5v.8m-3.6 0h12.6m-10.8 0 .8 12.2c.1.9.8 1.5 1.7 1.5h4c.9 0 1.6-.7 1.7-1.5l.8-12.2M10 10v6m4-6v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

function getCalendarDays(startDate: string, endDate: string) {
  const days: Array<{ date: string | null; key: string }> = [];
  const cursor = dateStringToUtcDate(startDate);
  const end = dateStringToUtcDate(endDate);
  const startDayOfWeek = cursor.getUTCDay();

  for (let index = 0; index < startDayOfWeek; index += 1) {
    days.push({ date: null, key: `start-${index}` });
  }

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({ date, key: date });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let paddingIndex = 0;
  while (days.length % 7 !== 0) {
    days.push({ date: null, key: `end-${paddingIndex}` });
    paddingIndex += 1;
  }

  return days;
}

function dateStringToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isDateInRange(date: string, range: { startDate: string; endDate: string }) {
  return date >= range.startDate && date <= range.endDate;
}

function weekendTextClass(dayOfWeek: number | null) {
  if (dayOfWeek === 0) {
    return "text-danger";
  }

  if (dayOfWeek === 6) {
    return "text-accent";
  }

  return "";
}

function getWorkedMinutes(record: Pick<AttendanceRecord, "checkInAt" | "checkOutAt">) {
  if (!record.checkInAt || !record.checkOutAt) {
    return null;
  }

  const checkIn = new Date(record.checkInAt).getTime();
  const checkOut = new Date(record.checkOutAt).getTime();
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) {
    return null;
  }

  return Math.round((checkOut - checkIn) / 60000);
}

function formatWorkedDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours === 0) {
    return `${restMinutes}분`;
  }

  if (restMinutes === 0) {
    return `${hours}시간`;
  }

  return `${hours}시간 ${restMinutes}분`;
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
