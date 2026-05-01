"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  apiFetch,
  clearToken,
  formatKstClock,
  formatKstDateTime,
  getStoredAuth,
  isAuthError,
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

type TeamMonthAttendance = {
  month: string;
  startDate: string;
  endDate: string;
  calendarStartDate?: string;
  calendarEndDate?: string;
  records: TeamAttendanceRecord[];
};

type WorkTaskSection = "today" | "later";

type WorkTask = {
  id: string;
  text: string;
  done: boolean;
  section: WorkTaskSection;
  order?: number;
  createdAt: string;
  updatedAt: string;
};

type WorkComment = {
  id: string;
  authorEmployeeId: string;
  authorName: string;
  text: string;
  createdAt: string;
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
  commentCount?: number;
  tasks?: WorkTask[];
};

type WorkLog = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  summary: string;
  tasks: WorkTask[];
  taskCount: number;
  doneCount: number;
  comments: WorkComment[];
  commentCount: number;
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
const formerTeamMemberNames = new Set(["홍현석"]);

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
  const [isTeamMonthLoading, setIsTeamMonthLoading] = useState(false);
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
  const [isCommentSaving, setIsCommentSaving] = useState(false);
  const [pendingCommentId, setPendingCommentId] = useState<string | null>(null);
  const [pendingWorkTaskId, setPendingWorkTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState("");
  const [newCommentText, setNewCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");
  const [todayWorkLog, setTodayWorkLog] = useState<WorkLog | null>(null);
  const [todayWorkMessage, setTodayWorkMessage] = useState("");
  const [isTodayWorkLoading, setIsTodayWorkLoading] = useState(false);
  const [isTodayWorkSaving, setIsTodayWorkSaving] = useState(false);
  const [pendingTodayTaskId, setPendingTodayTaskId] = useState<string | null>(null);
  const [todayTaskText, setTodayTaskText] = useState("");
  const workLogCacheRef = useRef(new Map<string, WorkLog>());
  const teamMonthCacheRef = useRef(new Map<string, TeamMonthAttendance>());
  const workLogLoadRequestIdRef = useRef(0);
  const todayWorkLogLoadRequestIdRef = useRef(0);
  const teamMonthLoadRequestIdRef = useRef(0);
  const workLogSaveSeqRef = useRef(0);
  const todayWorkLogSaveSeqRef = useRef(0);
  const workLogSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const todayWorkLogSaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const prefetchingWorkLogKeysRef = useRef(new Set<string>());

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
      teamMonthCacheRef.current.set(dashboard.teamMonth.month, dashboard.teamMonth);
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
        if (isAuthError(error)) {
          clearToken();
          setAuth(null);
        }
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

  useEffect(() => {
    if (!auth || !teamMonth?.month) return;
    prefetchTeamMonth(shiftMonth(teamMonth.month, -1));
    prefetchTeamMonth(shiftMonth(teamMonth.month, 1));
  }, [auth, teamMonth?.month]);

  useEffect(() => {
    if (!auth || !teamMonth?.records.length) return;

    const recordsToPrefetch = teamMonth.records.filter(
      (record) => record.workDate >= teamMonth.startDate && record.workDate <= teamMonth.endDate,
    );
    const timer = window.setTimeout(() => prefetchWorkLogs(recordsToPrefetch), 250);
    return () => window.clearTimeout(timer);
  }, [auth, teamMonth?.month, teamMonth?.records]);

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

    setTeamRecords((currentRecords) => {
      if (!employee?.id || record.workDate !== status?.kstDate) {
        return currentRecords;
      }

      const nextRecord: TeamAttendanceRecord = {
        employeeId: employee.id,
        employeeNo: employee.employeeNo,
        employeeName: employee.name,
        workDate: record.workDate,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        workType: record.workType,
        note: record.note,
        taskCount: todayWorkLog?.taskCount ?? 0,
        doneCount: todayWorkLog?.doneCount ?? 0,
        commentCount: todayWorkLog?.commentCount ?? 0,
        tasks: todayWorkLog?.tasks ?? [],
      };
      const recordsWithoutMe = currentRecords.filter((item) => item.employeeId !== employee.id);
      return record.checkInAt
        ? [...recordsWithoutMe, nextRecord].sort((a, b) => a.employeeName.localeCompare(b.employeeName))
        : recordsWithoutMe;
    });

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
        commentCount: existingRecord?.commentCount ?? 0,
      };

      const recordsWithoutMe = currentMonth.records.filter(
        (item) => !(item.employeeId === employee.id && item.workDate === record.workDate),
      );

      const nextMonth = {
        ...currentMonth,
        records: [...recordsWithoutMe, nextRecord].sort(
          (a, b) =>
            a.workDate.localeCompare(b.workDate) ||
            a.employeeName.localeCompare(b.employeeName),
        ),
      };
      teamMonthCacheRef.current.set(nextMonth.month, nextMonth);
      return nextMonth;
    });
  }

  async function openWorkLog(record: TeamAttendanceRecord) {
    if (!auth) return;

    const cacheKey = getWorkLogCacheKey(record.employeeId, record.workDate);
    const cachedWorkLog = workLogCacheRef.current.get(cacheKey) ?? null;
    const requestId = workLogLoadRequestIdRef.current + 1;
    workLogLoadRequestIdRef.current = requestId;
    setSelectedWorkRecord(record);
    setWorkLog(cachedWorkLog);
    setWorkLogMessage("");
    setNewTaskText("");
    setNewCommentText("");
    setIsWorkLogLoading(!cachedWorkLog);

    try {
      const freshWorkLog = await fetchWorkLog(record, auth, { force: true });
      if (workLogLoadRequestIdRef.current === requestId) {
        setWorkLog(freshWorkLog);
      }
    } catch (error) {
      if (workLogLoadRequestIdRef.current === requestId) {
        setWorkLogMessage(error instanceof Error ? error.message : "업무 기록을 불러오지 못했습니다.");
      }
    } finally {
      if (workLogLoadRequestIdRef.current === requestId) {
        setIsWorkLogLoading(false);
      }
    }
  }

  async function loadTeamMonth(month: string) {
    if (!auth) return;

    const cachedMonth = teamMonthCacheRef.current.get(month) ?? null;
    const requestId = teamMonthLoadRequestIdRef.current + 1;
    teamMonthLoadRequestIdRef.current = requestId;
    if (cachedMonth) {
      setTeamMonth(cachedMonth);
    }
    setIsTeamMonthLoading(!cachedMonth);
    setMessage("");
    try {
      const freshMonth = await fetchTeamMonth(month, auth);
      if (teamMonthLoadRequestIdRef.current === requestId) {
        setTeamMonth(freshMonth);
      }
    } catch (error) {
      if (teamMonthLoadRequestIdRef.current === requestId) {
        setMessage(error instanceof Error ? error.message : "달력을 불러오지 못했습니다.");
      }
    } finally {
      if (teamMonthLoadRequestIdRef.current === requestId) {
        setIsTeamMonthLoading(false);
      }
    }
  }

  function moveTeamMonth(delta: number) {
    const month = teamMonth?.month ?? getMonthFromDate(status?.kstDate);
    void loadTeamMonth(shiftMonth(month, delta));
  }

  function openAttendanceWorkLog(record: AttendanceRecord) {
    if (!employee) return;

    void openWorkLog({
      employeeId: record.employeeId ?? employee.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.name,
      workDate: record.workDate,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      workType: record.workType,
      note: record.note,
    });
  }

  async function loadTodayWorkLog() {
    if (!auth || !employee || !status?.kstDate) return;

    const cacheKey = getWorkLogCacheKey(employee.id, status.kstDate);
    const cachedWorkLog = workLogCacheRef.current.get(cacheKey) ?? null;
    const requestId = todayWorkLogLoadRequestIdRef.current + 1;
    todayWorkLogLoadRequestIdRef.current = requestId;
    if (cachedWorkLog) {
      setTodayWorkLog(cachedWorkLog);
    }
    setTodayWorkMessage("");
    setIsTodayWorkLoading(!cachedWorkLog);
    try {
      const freshWorkLog = await fetchWorkLog(
        {
          employeeId: employee.id,
          workDate: status.kstDate,
        },
        auth,
        { force: true },
      );
      if (todayWorkLogLoadRequestIdRef.current === requestId) {
        setTodayWorkLog(freshWorkLog);
      }
    } catch (error) {
      if (todayWorkLogLoadRequestIdRef.current === requestId) {
        setTodayWorkMessage(error instanceof Error ? error.message : "오늘 업무를 불러오지 못했습니다.");
      }
    } finally {
      if (todayWorkLogLoadRequestIdRef.current === requestId) {
        setIsTodayWorkLoading(false);
      }
    }
  }

  async function fetchWorkLog(
    record: Pick<TeamAttendanceRecord, "employeeId" | "workDate">,
    requestAuth: StoredAuth,
    options: { force?: boolean } = {},
  ) {
    const cacheKey = getWorkLogCacheKey(record.employeeId, record.workDate);
    const cachedWorkLog = workLogCacheRef.current.get(cacheKey);
    if (cachedWorkLog && !options.force) {
      return cachedWorkLog;
    }

    const params = new URLSearchParams({
      employeeId: record.employeeId,
      workDate: record.workDate,
    });
    const result = await apiFetch<{ workLog: WorkLog }>(`/api/work-log?${params.toString()}`, {
      auth: requestAuth,
    });
    const workLogWithCounts = normalizeWorkLogCounts(result.workLog);
    rememberWorkLog(workLogWithCounts);
    return workLogWithCounts;
  }

  function prefetchWorkLog(record: Pick<TeamAttendanceRecord, "employeeId" | "workDate">) {
    if (!auth) return;
    const cacheKey = getWorkLogCacheKey(record.employeeId, record.workDate);
    if (workLogCacheRef.current.has(cacheKey) || prefetchingWorkLogKeysRef.current.has(cacheKey)) return;
    prefetchingWorkLogKeysRef.current.add(cacheKey);
    void fetchWorkLog(record, auth)
      .catch(() => undefined)
      .finally(() => {
        prefetchingWorkLogKeysRef.current.delete(cacheKey);
      });
  }

  function prefetchWorkLogs(records: Array<Pick<TeamAttendanceRecord, "employeeId" | "workDate">>) {
    if (!auth) return;

    const seen = new Set<string>();
    const recordsToLoad = records
      .filter((record) => {
        const cacheKey = getWorkLogCacheKey(record.employeeId, record.workDate);
        if (
          seen.has(cacheKey) ||
          workLogCacheRef.current.has(cacheKey) ||
          prefetchingWorkLogKeysRef.current.has(cacheKey)
        ) {
          return false;
        }
        seen.add(cacheKey);
        prefetchingWorkLogKeysRef.current.add(cacheKey);
        return true;
      })
      .slice(0, 80);

    if (!recordsToLoad.length) return;

    void apiFetch<{ workLogs: WorkLog[] }>("/api/work-log/batch", {
      method: "POST",
      auth,
      body: JSON.stringify({ records: recordsToLoad }),
    })
      .then((result) => {
        for (const workLog of result.workLogs) {
          rememberWorkLog(normalizeWorkLogCounts(workLog));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        for (const record of recordsToLoad) {
          prefetchingWorkLogKeysRef.current.delete(
            getWorkLogCacheKey(record.employeeId, record.workDate),
          );
        }
      });
  }

  async function fetchTeamMonth(month: string, requestAuth: StoredAuth) {
    const params = new URLSearchParams({ month });
    const result = await apiFetch<{ teamMonth: TeamMonthAttendance }>(
      `/api/attendance/team-month?${params.toString()}`,
      { auth: requestAuth },
    );
    teamMonthCacheRef.current.set(result.teamMonth.month, result.teamMonth);
    return result.teamMonth;
  }

  function prefetchTeamMonth(month: string) {
    if (!auth || teamMonthCacheRef.current.has(month)) return;
    void fetchTeamMonth(month, auth).catch(() => undefined);
  }

  async function saveWorkLogRequest(nextLog: WorkLog, requestAuth: StoredAuth) {
    const result = await apiFetch<{ workLog: WorkLog }>("/api/work-log", {
      method: "PUT",
      auth: requestAuth,
      body: JSON.stringify({
        employeeId: nextLog.employeeId,
        workDate: nextLog.workDate,
        summary: nextLog.summary,
        tasks: nextLog.tasks,
      }),
    });
    return normalizeWorkLogCounts(result.workLog);
  }

  async function addWorkComment() {
    if (!auth || !employee || !workLog || !newCommentText.trim()) return;

    const now = new Date().toISOString();
    const optimisticComment: WorkComment = {
      id: crypto.randomUUID(),
      authorEmployeeId: employee.id,
      authorName: employee.name,
      text: newCommentText.trim().slice(0, 500),
      createdAt: now,
    };
    const optimisticLog = normalizeWorkLogCounts({
      ...workLog,
      comments: [...workLog.comments, optimisticComment],
    });
    setNewCommentText("");
    setWorkLog(optimisticLog);
    rememberWorkLog(optimisticLog);
    updateTeamMonthWorkSummary(optimisticLog);
    updateTeamTodayWorkLog(optimisticLog);
    setIsCommentSaving(true);

    try {
      const result = await apiFetch<{ workLog: WorkLog }>("/api/work-log", {
        method: "POST",
        auth,
        body: JSON.stringify({
          employeeId: workLog.employeeId,
          workDate: workLog.workDate,
          text: optimisticComment.text,
        }),
      });
      const savedLog = normalizeWorkLogCounts(result.workLog);
      setWorkLog(savedLog);
      rememberWorkLog(savedLog);
      updateTeamMonthWorkSummary(savedLog);
      updateTeamTodayWorkLog(savedLog);
    } catch (error) {
      setWorkLogMessage(error instanceof Error ? error.message : "댓글을 저장하지 못했습니다.");
      void refreshWorkLogFromServer(optimisticLog, auth, "modal");
    } finally {
      setIsCommentSaving(false);
    }
  }

  async function updateWorkComment(commentId: string, text: string) {
    const nextText = text.trim().slice(0, 500);
    if (!auth || !workLog || !nextText) return;

    const optimisticLog = normalizeWorkLogCounts({
      ...workLog,
      comments: workLog.comments.map((comment) =>
        comment.id === commentId ? { ...comment, text: nextText } : comment,
      ),
    });
    setPendingCommentId(commentId);
    setEditingCommentId(null);
    setEditingCommentText("");
    setWorkLog(optimisticLog);
    rememberWorkLog(optimisticLog);
    updateTeamMonthWorkSummary(optimisticLog);
    updateTeamTodayWorkLog(optimisticLog);

    try {
      const result = await apiFetch<{ workLog: WorkLog }>(
        `/api/work-log/comments/${encodeURIComponent(commentId)}`,
        {
          method: "PATCH",
          auth,
          body: JSON.stringify({
            employeeId: workLog.employeeId,
            workDate: workLog.workDate,
            text: nextText,
          }),
        },
      );
      const savedLog = normalizeWorkLogCounts(result.workLog);
      setWorkLog(savedLog);
      rememberWorkLog(savedLog);
      updateTeamMonthWorkSummary(savedLog);
      updateTeamTodayWorkLog(savedLog);
    } catch (error) {
      setWorkLogMessage(error instanceof Error ? error.message : "댓글을 수정하지 못했습니다.");
      void refreshWorkLogFromServer(optimisticLog, auth, "modal");
    } finally {
      setPendingCommentId(null);
    }
  }

  async function deleteWorkComment(commentId: string) {
    if (!auth || !workLog) return;

    const optimisticLog = normalizeWorkLogCounts({
      ...workLog,
      comments: workLog.comments.filter((comment) => comment.id !== commentId),
    });
    setPendingCommentId(commentId);
    setWorkLog(optimisticLog);
    rememberWorkLog(optimisticLog);
    updateTeamMonthWorkSummary(optimisticLog);
    updateTeamTodayWorkLog(optimisticLog);

    try {
      const params = new URLSearchParams({
        employeeId: workLog.employeeId,
        workDate: workLog.workDate,
      });
      const result = await apiFetch<{ workLog: WorkLog }>(
        `/api/work-log/comments/${encodeURIComponent(commentId)}?${params.toString()}`,
        {
          method: "DELETE",
          auth,
        },
      );
      const savedLog = normalizeWorkLogCounts(result.workLog);
      setWorkLog(savedLog);
      rememberWorkLog(savedLog);
      updateTeamMonthWorkSummary(savedLog);
      updateTeamTodayWorkLog(savedLog);
    } catch (error) {
      setWorkLogMessage(error instanceof Error ? error.message : "댓글을 삭제하지 못했습니다.");
      void refreshWorkLogFromServer(optimisticLog, auth, "modal");
    } finally {
      setPendingCommentId(null);
    }
  }

  async function refreshWorkLogFromServer(
    currentLog: WorkLog,
    requestAuth: StoredAuth,
    target: "modal" | "today",
  ) {
    try {
      const freshLog = await fetchWorkLog(currentLog, requestAuth, { force: true });
      if (target === "today") {
        setTodayWorkLog(freshLog);
      } else {
        setWorkLog(freshLog);
      }
      updateTeamMonthWorkSummary(freshLog);
      updateTeamTodayWorkLog(freshLog);
    } catch {
      // Keep the optimistic state visible; the explicit save error message is already shown.
    }
  }

  function rememberWorkLog(nextLog: WorkLog) {
    workLogCacheRef.current.set(getWorkLogCacheKey(nextLog.employeeId, nextLog.workDate), nextLog);
  }

  async function persistTodayWorkLog(nextLog: WorkLog) {
    if (!auth) return;

    const optimisticLog = normalizeWorkLogCounts(nextLog);
    const seq = todayWorkLogSaveSeqRef.current + 1;
    todayWorkLogSaveSeqRef.current = seq;
    setTodayWorkLog(optimisticLog);
    setTodayWorkMessage("");
    rememberWorkLog(optimisticLog);
    updateTeamMonthWorkSummary(optimisticLog);
    updateTeamTodayWorkLog(optimisticLog);
    setWorkLog((currentLog) =>
      currentLog?.employeeId === optimisticLog.employeeId &&
      currentLog.workDate === optimisticLog.workDate
        ? optimisticLog
        : currentLog,
    );
    setIsTodayWorkSaving(true);
    const requestAuth = auth;
    const saveJob = todayWorkLogSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const savedLog = await saveWorkLogRequest(optimisticLog, requestAuth);
          rememberWorkLog(savedLog);
          if (todayWorkLogSaveSeqRef.current === seq) {
            setTodayWorkLog(savedLog);
            updateTeamMonthWorkSummary(savedLog);
            updateTeamTodayWorkLog(savedLog);
            setWorkLog((currentLog) =>
              currentLog?.employeeId === savedLog.employeeId &&
              currentLog.workDate === savedLog.workDate
                ? savedLog
                : currentLog,
            );
          }
        } catch (error) {
          if (todayWorkLogSaveSeqRef.current === seq) {
            setTodayWorkMessage(error instanceof Error ? error.message : "오늘 업무를 저장하지 못했습니다.");
            void refreshWorkLogFromServer(optimisticLog, requestAuth, "today");
          }
        } finally {
          if (todayWorkLogSaveSeqRef.current === seq) {
            setIsTodayWorkSaving(false);
          }
        }
      });
    todayWorkLogSaveChainRef.current = saveJob.catch(() => undefined);
  }

  function closeWorkLog() {
    workLogLoadRequestIdRef.current += 1;
    setSelectedWorkRecord(null);
    setWorkLog(null);
    setWorkLogMessage("");
    setNewTaskText("");
    setNewCommentText("");
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  async function persistWorkLog(nextLog: WorkLog) {
    if (!auth) return;

    const optimisticLog = normalizeWorkLogCounts(nextLog);
    const seq = workLogSaveSeqRef.current + 1;
    workLogSaveSeqRef.current = seq;
    setWorkLog(optimisticLog);
    setWorkLogMessage("");
    rememberWorkLog(optimisticLog);
    updateTeamMonthWorkSummary(optimisticLog);
    updateTeamTodayWorkLog(optimisticLog);
    setTodayWorkLog((currentLog) =>
      currentLog?.employeeId === optimisticLog.employeeId &&
      currentLog.workDate === optimisticLog.workDate
        ? optimisticLog
        : currentLog,
    );
    setIsWorkLogSaving(true);
    const requestAuth = auth;
    const saveJob = workLogSaveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const savedLog = await saveWorkLogRequest(optimisticLog, requestAuth);
          rememberWorkLog(savedLog);
          if (workLogSaveSeqRef.current === seq) {
            setWorkLog(savedLog);
            updateTeamMonthWorkSummary(savedLog);
            updateTeamTodayWorkLog(savedLog);
            setTodayWorkLog((currentLog) =>
              currentLog?.employeeId === savedLog.employeeId &&
              currentLog.workDate === savedLog.workDate
                ? savedLog
                : currentLog,
            );
          }
        } catch (error) {
          if (workLogSaveSeqRef.current === seq) {
            setWorkLogMessage(error instanceof Error ? error.message : "업무 기록을 저장하지 못했습니다.");
            void refreshWorkLogFromServer(optimisticLog, requestAuth, "modal");
          }
        } finally {
          if (workLogSaveSeqRef.current === seq) {
            setIsWorkLogSaving(false);
          }
        }
      });
    workLogSaveChainRef.current = saveJob.catch(() => undefined);
  }

  function updateTeamMonthWorkSummary(nextLog: WorkLog) {
    setTeamMonth((currentMonth) => {
      if (!currentMonth) {
        return currentMonth;
      }

      const nextMonth = {
        ...currentMonth,
        records: currentMonth.records.map((record) =>
          record.employeeId === nextLog.employeeId && record.workDate === nextLog.workDate
            ? {
                ...record,
                taskCount: nextLog.taskCount,
                doneCount: nextLog.doneCount,
                commentCount: nextLog.commentCount,
              }
            : record,
        ),
      };
      teamMonthCacheRef.current.set(nextMonth.month, nextMonth);
      return nextMonth;
    });
  }

  function updateTeamTodayWorkLog(nextLog: WorkLog) {
    setTeamRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.employeeId === nextLog.employeeId && record.workDate === nextLog.workDate
          ? {
              ...record,
              taskCount: nextLog.taskCount,
              doneCount: nextLog.doneCount,
              commentCount: nextLog.commentCount,
              tasks: nextLog.tasks,
            }
          : record,
      ),
    );
  }

  async function addWorkTask() {
    if (!workLog || !newTaskText.trim()) return;

    const now = new Date().toISOString();
    const nextLog = {
      ...workLog,
      tasks: withTaskOrder([
        ...workLog.tasks,
        {
          id: crypto.randomUUID(),
          text: newTaskText.trim(),
          done: false,
          section: "today" as WorkTaskSection,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    };
    setNewTaskText("");
    await persistWorkLog(nextLog);
  }

  async function addTodayTask() {
    if (!todayWorkLog || !todayTaskText.trim()) return;

    const now = new Date().toISOString();
    const nextLog = {
      ...todayWorkLog,
      tasks: withTaskOrder([
        ...todayWorkLog.tasks,
        {
          id: crypto.randomUUID(),
          text: todayTaskText.trim(),
          done: false,
          section: "today" as WorkTaskSection,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    };
    setTodayTaskText("");
    await persistTodayWorkLog(nextLog);
  }

  async function toggleWorkTask(taskId: string) {
    if (!workLog) return;

    setPendingWorkTaskId(taskId);
    try {
      await persistWorkLog({
        ...workLog,
        tasks: withTaskOrder(
          workLog.tasks.map((task) =>
            task.id === taskId
              ? { ...task, done: !task.done, updatedAt: new Date().toISOString() }
              : task,
          ),
        ),
      });
    } finally {
      setPendingWorkTaskId(null);
    }
  }

  async function toggleTodayTask(taskId: string) {
    if (!todayWorkLog) return;

    setPendingTodayTaskId(taskId);
    try {
      await persistTodayWorkLog({
        ...todayWorkLog,
        tasks: withTaskOrder(
          todayWorkLog.tasks.map((task) =>
            task.id === taskId
              ? { ...task, done: !task.done, updatedAt: new Date().toISOString() }
              : task,
          ),
        ),
      });
    } finally {
      setPendingTodayTaskId(null);
    }
  }

  async function updateWorkTask(taskId: string, text: string) {
    const nextText = text.trim();
    if (!workLog || !nextText) return;

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
    if (!todayWorkLog || !nextText) return;

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
    if (!workLog) return;

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
    if (!todayWorkLog) return;

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

  async function reorderWorkTasks(nextTasks: WorkTask[]) {
    if (!workLog) return;

    await persistWorkLog({
      ...workLog,
      tasks: withTaskOrder(nextTasks),
    });
  }

  async function reorderTodayTasks(nextTasks: WorkTask[]) {
    if (!todayWorkLog) return;

    await persistTodayWorkLog({
      ...todayWorkLog,
      tasks: withTaskOrder(nextTasks),
    });
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
    setNewCommentText("");
    setEditingCommentId(null);
    setEditingCommentText("");
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
  const visibleTeamRecords = teamRecords.filter(
    (record) =>
      record.checkInAt &&
      record.employeeId !== employee.id &&
      !formerTeamMemberNames.has(record.employeeName),
  );

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
            <span className="block text-sm font-bold text-ink">오늘 할 일 / 한 일</span>
          </div>
          <QuickWorkLogPanel
            isLoading={isTodayWorkLoading}
            isSaving={isTodayWorkSaving}
            message={todayWorkMessage}
            newTaskText={todayTaskText}
            onAddTask={addTodayTask}
            onRemoveTask={requestRemoveTodayTask}
            onReorderTasks={reorderTodayTasks}
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
        <div className="mt-3 space-y-2">
          {visibleTeamRecords.map((record) => (
            <details
              className="group rounded border border-line bg-field/70 px-3 py-2 text-sm"
              key={record.employeeId}
              open
            >
              <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-ink">{record.employeeName}</span>
                    <TeamStatusBadge record={record} />
                  </div>
                  <p className="mt-1 text-xs text-muted">{formatKstTimeRange(record)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ChevronDownIcon className="mt-1 h-4 w-4 text-muted transition group-open:rotate-180" />
                </div>
              </summary>
              <TodayTeamTasks record={record} />
            </details>
          ))}
          {visibleTeamRecords.length === 0 && isRefreshing ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <div className="rounded border border-line bg-field/70 px-3 py-3" key={index}>
                  <LoadingLine />
                </div>
              ))}
            </div>
          ) : null}
          {visibleTeamRecords.length === 0 && !isRefreshing ? (
            <p className="rounded border border-line py-5 text-center text-sm text-muted">
              아직 출근한 사람이 없어요. 첫 기록을 기다리는 중이에요.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 w-full max-w-4xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                aria-label="이전 달"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted transition hover:border-slate-300 hover:bg-field hover:text-ink disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isTeamMonthLoading}
                onClick={() => moveTeamMonth(-1)}
                type="button"
              >
                ‹
              </button>
              <h2 className="min-w-0 truncate text-base font-bold text-ink">
                {formatMonthLabel(teamMonth?.month)} 팀 달력 🗓️
              </h2>
              <button
                aria-label="다음 달"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted transition hover:border-slate-300 hover:bg-field hover:text-ink disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isTeamMonthLoading}
                onClick={() => moveTeamMonth(1)}
                type="button"
              >
                ›
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">날짜별로 서로의 하루 흐름을 가볍게 볼 수 있어요.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isRefreshing || isTeamMonthLoading ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                <Spinner className="h-3 w-3" />
                갱신 중
              </span>
            ) : null}
            <CalendarLegend />
          </div>
        </div>
        <TeamMonthCalendar
          currentEmployeeId={employee.id}
          onPrefetchRecord={prefetchWorkLog}
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
                <tr
                  key={record.id}
                  className="cursor-pointer border-b border-line transition hover:bg-field/70 last:border-0"
                  onClick={() => openAttendanceWorkLog(record)}
                >
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
        canEdit={selectedWorkRecord.employeeId === employee.id}
        currentEmployeeId={employee.id}
        editingCommentId={editingCommentId}
        editingCommentText={editingCommentText}
        isCommentSaving={isCommentSaving}
        isLoading={isWorkLogLoading}
        isSaving={isWorkLogSaving}
        message={workLogMessage}
        newCommentText={newCommentText}
        newTaskText={newTaskText}
        onAddComment={addWorkComment}
        onAddTask={addWorkTask}
        onClose={closeWorkLog}
        onCommentTextChange={setNewCommentText}
        onDeleteComment={deleteWorkComment}
        onEditCommentCancel={() => {
          setEditingCommentId(null);
          setEditingCommentText("");
        }}
        onEditCommentStart={(comment) => {
          setEditingCommentId(comment.id);
          setEditingCommentText(comment.text);
        }}
        onEditCommentTextChange={setEditingCommentText}
        onRemoveTask={requestRemoveWorkTask}
        onReorderTasks={reorderWorkTasks}
        onTaskTextChange={setNewTaskText}
        onToggleTask={toggleWorkTask}
        onUpdateComment={updateWorkComment}
        onUpdateTask={updateWorkTask}
        pendingCommentId={pendingCommentId}
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

function TodayTeamTasks({ record }: { record: TeamAttendanceRecord }) {
  const tasks = record.tasks ?? [];
  const mainTasks = tasks.filter((task) => task.section !== "later");
  const laterTasks = tasks.filter((task) => task.section === "later");

  if (!tasks.length) {
    return (
      <p className="mt-3 rounded border border-dashed border-line bg-white/60 px-3 py-3 text-sm text-muted">
        아직 공유된 업무가 없어요.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <TaskPreviewList tasks={mainTasks} />
      {laterTasks.length ? (
        <div>
          <p className="mb-1 text-[11px] font-bold text-muted">후순위</p>
          <TaskPreviewList tasks={laterTasks} />
        </div>
      ) : null}
    </div>
  );
}

function TaskPreviewList({ tasks }: { tasks: WorkTask[] }) {
  if (!tasks.length) {
    return null;
  }

  return (
      <ul className="space-y-1.5">
      {tasks.map((task) => (
        <li
          className="flex items-center gap-2 rounded bg-white/75 px-2.5 py-2 text-sm leading-relaxed text-ink ring-1 ring-line/70"
          key={task.id}
        >
          <span
            aria-hidden="true"
            className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
              task.done
                ? "border-accent bg-accent text-white"
                : "border-slate-300 bg-white text-transparent"
            }`}
          >
            ✓
          </span>
          <span className={task.done ? "text-muted line-through" : ""}>{task.text}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamMonthCalendar({
  currentEmployeeId,
  onPrefetchRecord,
  onSelectRecord,
  teamMonth,
}: {
  currentEmployeeId: string;
  onPrefetchRecord: (record: TeamAttendanceRecord) => void;
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

  const days = getCalendarDays(teamMonth);

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
            const dayRecords = recordsByDate.get(day.date) ?? [];
            const dayOfWeek = dateStringToUtcDate(day.date).getUTCDay();

            return (
              <div
                className={`min-h-32 min-w-0 border-b border-r border-line p-1.5 sm:min-h-36 sm:p-2 ${
                  day.isCurrentMonth ? "bg-white" : "bg-field/35"
                }`}
                key={day.key}
              >
                <div
                  className={`mb-1 text-right text-[10px] font-bold sm:mb-2 sm:text-xs ${
                    day.isCurrentMonth ? weekendTextClass(dayOfWeek) || "text-muted" : "text-slate-400"
                  }`}
                >
                  {Number(day.date.slice(8, 10))}
                </div>
                <div className={day.isCurrentMonth ? "space-y-1" : "space-y-1 opacity-65"}>
                  {dayRecords.map((record) => (
                    <TeamCalendarRecord
                      currentEmployeeId={currentEmployeeId}
                      key={`${record.employeeId}-${record.workDate}`}
                      onPrefetch={onPrefetchRecord}
                      onSelect={onSelectRecord}
                      record={record}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CalendarLegend() {
  const items = [
    { className: "border-warn/50 bg-warn/10", label: "10시간+" },
    { className: "border-danger/50 bg-danger/10", label: "12시간+" },
    { className: "border-accent/45 bg-accentSoft", label: "완료 5개+" },
    { className: "border-ink/30 bg-slate-100", label: "전부 완료" },
  ];

  return (
    <div
      aria-label="달력 범례"
      className="hidden flex-wrap justify-end gap-1.5 text-[11px] text-muted sm:flex"
    >
      {items.map((item) => (
        <span
          className="inline-flex items-center gap-1 rounded border border-line bg-field/70 px-2 py-1"
          key={item.label}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-sm border ${item.className}`}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function TeamCalendarRecord({
  currentEmployeeId,
  onPrefetch,
  onSelect,
  record,
}: {
  currentEmployeeId: string;
  onPrefetch: (record: TeamAttendanceRecord) => void;
  onSelect: (record: TeamAttendanceRecord) => void;
  record: TeamAttendanceRecord;
}) {
  const isMe = record.employeeId === currentEmployeeId;
  const checkInText = formatKstTime(record.checkInAt);
  const timeRangeText = formatKstTimeRange(record);
  const workedMinutes = getWorkedMinutes(record);
  const durationText = workedMinutes === null ? "" : formatWorkedDuration(workedMinutes);
  const marker = getCalendarMarker(record, workedMinutes);
  const markerClassName = marker?.className ?? "border-line bg-field/80 text-ink";

  return (
    <button
      className={`flex h-7 w-full min-w-0 items-center justify-between gap-1 rounded border px-1.5 text-left text-[10px] leading-none transition hover:border-accent/50 hover:bg-white hover:shadow-md hover:ring-1 hover:ring-inset hover:ring-accent/20 sm:h-8 sm:px-2 sm:text-xs ${markerClassName}`}
      onFocus={() => onPrefetch(record)}
      onClick={() => onSelect(record)}
      onPointerEnter={() => onPrefetch(record)}
      title={`${record.employeeName}${isMe ? " (나)" : ""} ${timeRangeText}${durationText ? ` · ${durationText}` : ""}${marker ? ` · ${marker.title}` : ""}${record.commentCount ? ` · 댓글 ${record.commentCount}개` : ""}`}
      type="button"
    >
      <span className="min-w-0 truncate font-bold">{record.employeeName}</span>
      <span className="flex shrink-0 items-center gap-1 pl-1">
        {record.commentCount ? (
          <span
            aria-label={`댓글 ${record.commentCount}개`}
            className="text-[10px] font-bold opacity-70"
            title={`댓글 ${record.commentCount}개`}
          >
            💬{record.commentCount}
          </span>
        ) : null}
        <span className="text-[10px] font-semibold opacity-80 sm:text-[11px]">{checkInText}</span>
      </span>
    </button>
  );
}

function getCalendarMarker(
  record: Pick<TeamAttendanceRecord, "doneCount" | "taskCount">,
  workedMinutes: number | null,
) {
  const taskCount = record.taskCount ?? 0;
  const doneCount = record.doneCount ?? 0;

  if (workedMinutes !== null && workedMinutes >= 12 * 60) {
    return {
      className: "border-danger/50 bg-danger/10 text-danger",
      title: "12시간 이상 열일",
    };
  }

  if (taskCount >= 3 && doneCount === taskCount) {
    return {
      className: "border-ink/30 bg-slate-100 text-ink",
      title: "업무 전부 완료",
    };
  }

  if (doneCount >= 5) {
    return {
      className: "border-accent/45 bg-accentSoft text-accent",
      title: "완료 업무 5개 이상",
    };
  }

  if (workedMinutes !== null && workedMinutes >= 10 * 60) {
    return {
      className: "border-warn/50 bg-warn/10 text-warn",
      title: "10시간 이상 열일",
    };
  }

  return null;
}

function QuickWorkLogPanel({
  isLoading,
  isSaving,
  message,
  newTaskText,
  onAddTask,
  onRemoveTask,
  onReorderTasks,
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
  onReorderTasks: (tasks: WorkTask[]) => void;
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
        <div className="flex items-center justify-center gap-2 py-5 text-sm font-semibold text-muted">
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
            onReorderTasks={onReorderTasks}
            onToggleTask={onToggleTask}
            onUpdateTask={onUpdateTask}
            processingTaskId={processingTaskId}
            tasks={tasks}
          />

          {tasks.length === 0 ? (
            <p className="rounded border border-line bg-white/70 px-3 py-4 text-center text-sm text-muted">
              아직 적힌 업무가 없어요. 하나만 적어도 퇴근할 때 훨씬 편해져요.
            </p>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input
              className="field text-sm"
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
              disabled={!newTaskText.trim()}
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
  currentEmployeeId,
  editingCommentId,
  editingCommentText,
  isCommentSaving,
  isLoading,
  isSaving,
  message,
  newCommentText,
  newTaskText,
  onAddComment,
  onAddTask,
  onClose,
  onCommentTextChange,
  onDeleteComment,
  onEditCommentCancel,
  onEditCommentStart,
  onEditCommentTextChange,
  onRemoveTask,
  onReorderTasks,
  onTaskTextChange,
  onToggleTask,
  onUpdateComment,
  onUpdateTask,
  pendingCommentId,
  processingTaskId,
  record,
  workLog,
}: {
  canEdit: boolean;
  currentEmployeeId: string;
  editingCommentId: string | null;
  editingCommentText: string;
  isCommentSaving: boolean;
  isLoading: boolean;
  isSaving: boolean;
  message: string;
  newCommentText: string;
  newTaskText: string;
  onAddComment: () => void;
  onAddTask: () => void;
  onClose: () => void;
  onCommentTextChange: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
  onEditCommentCancel: () => void;
  onEditCommentStart: (comment: WorkComment) => void;
  onEditCommentTextChange: (text: string) => void;
  onRemoveTask: (task: WorkTask) => void;
  onReorderTasks: (tasks: WorkTask[]) => void;
  onTaskTextChange: (text: string) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateComment: (commentId: string, text: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  pendingCommentId: string | null;
  processingTaskId: string | null;
  record: TeamAttendanceRecord;
  workLog: WorkLog | null;
}) {
  const tasks = workLog?.tasks ?? [];
  const comments = workLog?.comments ?? [];

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
              {formatKstTimeRange(record)}
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
                onReorderTasks={onReorderTasks}
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
                      disabled={!newTaskText.trim()}
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

              <section className="rounded border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-ink">댓글</p>
                  <span className="text-xs font-semibold text-muted">{comments.length}개</span>
                </div>
                {comments.length ? (
                  <ul className="mt-3 space-y-2">
                    {comments.map((comment) => {
                      const isMine = comment.authorEmployeeId === currentEmployeeId;
                      const isEditing = editingCommentId === comment.id;
                      const isPending = pendingCommentId === comment.id;

                      return (
                        <li className="rounded bg-field/70 px-3 py-2 text-sm" key={comment.id}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-ink">{comment.authorName}</span>
                            <span className="shrink-0 text-[11px] text-muted">
                              {formatKstDateTime(comment.createdAt)}
                            </span>
                          </div>
                          {isEditing ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                autoFocus
                                className="field min-h-20 resize-y text-sm"
                                disabled={isPending}
                                onChange={(event) => onEditCommentTextChange(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    onEditCommentCancel();
                                  }
                                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                                    event.preventDefault();
                                    onUpdateComment(comment.id, editingCommentText);
                                  }
                                }}
                                value={editingCommentText}
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  className="secondary-button px-3 py-1.5 text-xs"
                                  disabled={isPending}
                                  onClick={onEditCommentCancel}
                                  type="button"
                                >
                                  취소
                                </button>
                                <button
                                  className="primary-button px-3 py-1.5 text-xs"
                                  disabled={isPending || !editingCommentText.trim()}
                                  onClick={() => onUpdateComment(comment.id, editingCommentText)}
                                  type="button"
                                >
                                  저장
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="mt-1 whitespace-pre-wrap break-words text-ink">{comment.text}</p>
                              {isMine ? (
                                <div className="mt-2 flex justify-end gap-2">
                                  {isPending ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                                      <Spinner className="h-3 w-3" />
                                      처리 중
                                    </span>
                                  ) : (
                                    <>
                                      <button
                                        className="text-xs font-semibold text-muted underline-offset-4 hover:text-ink hover:underline"
                                        onClick={() => onEditCommentStart(comment)}
                                        type="button"
                                      >
                                        수정
                                      </button>
                                      <button
                                        className="text-xs font-semibold text-danger underline-offset-4 hover:underline"
                                        onClick={() => onDeleteComment(comment.id)}
                                        type="button"
                                      >
                                        삭제
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-3 rounded border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
                    아직 댓글이 없어요.
                  </p>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className="field text-sm"
                    disabled={isCommentSaving}
                    onChange={(event) => onCommentTextChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onAddComment();
                      }
                    }}
                    placeholder="댓글을 입력하세요"
                    value={newCommentText}
                  />
                  <button
                    className="secondary-button px-4 py-2 text-sm"
                    disabled={isCommentSaving || !newCommentText.trim()}
                    onClick={onAddComment}
                    type="button"
                  >
                    {isCommentSaving ? (
                      <>
                        <Spinner className="mr-2 h-3 w-3" />
                        저장
                      </>
                    ) : (
                      "댓글"
                    )}
                  </button>
                </div>
              </section>
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
  onReorderTasks,
  onToggleTask,
  onUpdateTask,
  processingTaskId,
  tasks,
  title,
}: {
  canEdit: boolean;
  isSaving: boolean;
  onRemoveTask: (task: WorkTask) => void;
  onReorderTasks: (tasks: WorkTask[]) => void;
  onToggleTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, text: string) => void;
  processingTaskId: string | null;
  tasks: WorkTask[];
  title?: string;
}) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const draggingTaskIdRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    placement: "before" | "after";
    taskId: string;
  } | null>(null);

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

  function handleDragStart(
    event: DragEvent<HTMLSpanElement>,
    task: WorkTask,
    isEditing: boolean,
    isProcessing: boolean,
  ) {
    if (!canEdit || isEditing || isProcessing) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
    event.dataTransfer.setData("application/x-attendance-task-id", task.id);
    const row = event.currentTarget.closest("[data-task-row]") as HTMLElement | null;
    if (row) {
      const preview = row.cloneNode(true) as HTMLElement;
      preview.style.position = "fixed";
      preview.style.top = "-1000px";
      preview.style.left = "-1000px";
      preview.style.width = `${row.offsetWidth}px`;
      preview.style.transform = "scale(0.96)";
      preview.style.opacity = "0.92";
      preview.style.boxShadow = "0 18px 35px -24px rgba(23, 32, 51, 0.65)";
      preview.style.pointerEvents = "none";
      document.body.appendChild(preview);
      event.dataTransfer.setDragImage(preview, 18, 18);
      window.setTimeout(() => preview.remove(), 0);
    }
    draggingTaskIdRef.current = task.id;
    setDraggingTaskId(task.id);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>, taskId: string) {
    const sourceTaskId = draggingTaskIdRef.current ?? draggingTaskId;
    if (!sourceTaskId || sourceTaskId === taskId) return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ placement, taskId });
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, taskId: string) {
    event.preventDefault();
    const sourceTaskId =
      event.dataTransfer.getData("application/x-attendance-task-id") ||
      event.dataTransfer.getData("text/plain") ||
      draggingTaskIdRef.current ||
      draggingTaskId;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerPlacement = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    const placement = dropTarget?.taskId === taskId ? dropTarget.placement : pointerPlacement;
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTarget(null);

    if (!sourceTaskId || sourceTaskId === taskId) return;

    onReorderTasks(moveTask(tasks, sourceTaskId, taskId, placement));
  }

  function handleDragEnd() {
    draggingTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDropTarget(null);
  }

  return (
    <section>
      {title ? <h4 className="mb-2 text-sm font-bold text-ink">{title}</h4> : null}
      <div className="space-y-2">
        {tasks.map((task) => {
          const isProcessing = processingTaskId === task.id;
          const isEditing = editingTaskId === task.id;
          const isDragging = draggingTaskId === task.id;
          const isDropTarget = dropTarget?.taskId === task.id && !isDragging;

          return (
            <div
              className={`relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded border px-3 py-2 text-sm transition ${
                isProcessing
                  ? "border-accent/30 bg-accentSoft/60"
                  : isDragging
                    ? "border-accent/40 bg-field opacity-60"
                    : "border-line bg-white"
              }`}
              data-task-row
              key={task.id}
              onDragOver={(event) => handleDragOver(event, task.id)}
              onDrop={(event) => handleDrop(event, task.id)}
            >
              {isDropTarget ? (
                <span
                  className={`pointer-events-none absolute left-3 right-3 h-0.5 rounded bg-accent ${
                    dropTarget.placement === "before" ? "top-0" : "bottom-0"
                  }`}
                />
              ) : null}
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <span
                    aria-label={`${task.text} 순서 변경`}
                    className={`rounded p-0.5 text-muted transition ${
                      isEditing || isProcessing
                        ? "opacity-40"
                        : "cursor-grab hover:bg-field hover:text-ink active:cursor-grabbing"
                    }`}
                    draggable={canEdit && !isEditing && !isProcessing}
                    onDragEnd={handleDragEnd}
                    onDragStart={(event) => handleDragStart(event, task, isEditing, isProcessing)}
                    role="button"
                    tabIndex={0}
                    title="드래그해서 순서 바꾸기"
                  >
                    <GripIcon />
                  </span>
                ) : null}
                {isProcessing ? (
                  <Spinner className="h-4 w-4 text-accent" />
                ) : (
                  <input
                    checked={task.done}
                    className="h-4 w-4 accent-accent"
                    disabled={!canEdit}
                    onChange={() => onToggleTask(task.id)}
                    type="checkbox"
                  />
                )}
              </div>
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
                isProcessing ? (
                  <div className="flex min-w-12 justify-end text-accent">
                    <Spinner className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      aria-label={`${task.text} 수정`}
                      className="rounded p-1 text-muted transition hover:bg-accent/10 hover:text-accent disabled:hover:bg-transparent disabled:hover:text-muted"
                      disabled={isEditing}
                      onClick={() => startEditing(task)}
                      type="button"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      aria-label={`${task.text} 삭제`}
                      className="rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger disabled:hover:bg-transparent disabled:hover:text-muted"
                      disabled={isEditing}
                      onClick={() => onRemoveTask(task)}
                      type="button"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )
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

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
    </svg>
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

function getCalendarDays(teamMonth: TeamMonthAttendance) {
  const days: Array<{ date: string; isCurrentMonth: boolean; key: string }> = [];
  const cursor = dateStringToUtcDate(teamMonth.calendarStartDate ?? getCalendarStartDate(teamMonth.startDate));
  const end = dateStringToUtcDate(teamMonth.calendarEndDate ?? getCalendarEndDate(teamMonth.endDate));

  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({
      date,
      isCurrentMonth: date >= teamMonth.startDate && date <= teamMonth.endDate,
      key: date,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

function getCalendarStartDate(startDate: string) {
  const date = dateStringToUtcDate(startDate);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function getCalendarEndDate(endDate: string) {
  const date = dateStringToUtcDate(endDate);
  date.setUTCDate(date.getUTCDate() + (6 - date.getUTCDay()));
  return date.toISOString().slice(0, 10);
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

function formatKstTimeRange(record: Pick<AttendanceRecord, "checkInAt" | "checkOutAt">) {
  const checkInText = formatKstTime(record.checkInAt);

  if (!record.checkOutAt) {
    return checkInText;
  }

  return `${checkInText} ~ ${formatKstTime(record.checkOutAt)}`;
}

function getWorkLogCacheKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function normalizeWorkLogCounts(workLog: WorkLog): WorkLog {
  const tasks = withTaskOrder(workLog.tasks);
  const comments = [...(workLog.comments ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  return {
    ...workLog,
    tasks,
    comments,
    taskCount: tasks.length,
    doneCount: tasks.filter((task) => task.done).length,
    commentCount: comments.length,
  };
}

function formatMonthLabel(month: string | null | undefined) {
  const safeMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : getMonthFromDate();
  const [year, monthNumber] = safeMonth.split("-");
  return `${year}년 ${Number(monthNumber)}월`;
}

function getMonthFromDate(date?: string | null) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date.slice(0, 7);
  }

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function withTaskOrder(tasks: WorkTask[]) {
  return tasks
    .map((task, index) => ({
      ...task,
      order: index,
    }))
    .sort(
      (a, b) =>
        Number(b.done) - Number(a.done) ||
        a.order - b.order ||
        a.createdAt.localeCompare(b.createdAt),
    )
    .map((task, index) => ({
      ...task,
      order: index,
    }));
}

function moveTask(
  tasks: WorkTask[],
  sourceTaskId: string,
  targetTaskId: string,
  placement: "before" | "after",
) {
  const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
  if (sourceIndex === -1) {
    return tasks;
  }

  const movingTask = tasks[sourceIndex];
  const remainingTasks = tasks.filter((task) => task.id !== sourceTaskId);
  const targetIndex = remainingTasks.findIndex((task) => task.id === targetTaskId);
  if (targetIndex === -1) {
    return tasks;
  }

  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  const reorderedTasks = [...remainingTasks];
  reorderedTasks.splice(insertIndex, 0, movingTask);
  return withTaskOrder(reorderedTasks);
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
