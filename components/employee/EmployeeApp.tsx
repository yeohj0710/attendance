"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  apiFetch,
  clearToken,
  formatKstClock,
  formatKstDateTime,
  getShareRequestParamsFromLocation,
  getStoredAuth,
  isAuthError,
  type StoredAuth,
} from "@/components/api";
import { LoginPanel } from "@/components/LoginPanel";
import { Spinner } from "@/components/Spinner";
import {
  createLocalGreetings,
  type GreetingContext,
  type GreetingEvent,
  type GreetingWeather,
} from "@/lib/greeting";

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

type SharedDashboardResponse = DashboardResponse & {
  todayWorkLog: WorkLog | null;
  targetWorkLog: WorkLog | null;
  targetWorkRecord: TeamAttendanceRecord | null;
  shareType?: "dashboard" | "work-log";
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
  completedOrder?: number | null;
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

type WorkCommentNotification = WorkComment & {
  workDate: string;
};

type WorkCommentNotificationResponse = {
  checkedAt: string;
  notifications: WorkCommentNotification[];
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

const TASK_DRAFT_MAX_LINES = 5;
const TASK_DRAFT_MAX_LENGTH = 280;
const COMMENT_DRAFT_MAX_LENGTH = 2000;
const GREETING_ROTATION_INTERVAL_MS = 5200;
const CALENDAR_COLUMN_MIN_WIDTH = 88;
const CALENDAR_CELL_INLINE_PADDING = 12;
const CALENDAR_RECORD_INLINE_PADDING = 14;
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const formerTeamMemberNames = new Set(["홍현석"]);
const fixedPublicHolidayNames: Record<string, string> = {
  "01-01": "신정",
  "03-01": "삼일절",
  "05-05": "어린이날",
  "06-06": "현충일",
  "08-15": "광복절",
  "10-03": "개천절",
  "10-09": "한글날",
  "12-25": "성탄절",
};
const publicHolidayNamesByDate: Record<string, string> = {
  "2026-02-16": "설 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설 연휴",
  "2026-03-02": "대체공휴일",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거일",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-05": "대체공휴일",
};
const COMMENT_NOTIFICATION_LAST_SEEN_KEY = "attendance.commentNotifications.lastSeen";
const COMMENT_NOTIFICATION_INITIAL_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

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
  const [isSharedView, setIsSharedView] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [greetingMessages, setGreetingMessages] = useState<string[]>([]);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const [greetingRotationNonce, setGreetingRotationNonce] = useState(0);
  const [officeWeather, setOfficeWeather] = useState<GreetingWeather | null>(null);
  const [deskRefreshSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [encouragement, setEncouragement] = useState("");
  const [selectedWorkRecord, setSelectedWorkRecord] = useState<TeamAttendanceRecord | null>(null);
  const [deleteTaskRequest, setDeleteTaskRequest] = useState<{
    scope: "today" | "work";
    task: WorkTask;
  } | null>(null);
  const [commentNotificationState, setCommentNotificationState] = useState<{
    checkedAt: string;
    notifications: WorkCommentNotification[];
  } | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [deleteWithoutAskingAgain, setDeleteWithoutAskingAgain] = useState(false);
  const [workLog, setWorkLog] = useState<WorkLog | null>(null);
  const [workLogMessage, setWorkLogMessage] = useState("");
  const [workLogShareMessage, setWorkLogShareMessage] = useState("");
  const [workLogShareToastId, setWorkLogShareToastId] = useState(0);
  const [dashboardShareUrl, setDashboardShareUrl] = useState("");
  const [workLogShareUrl, setWorkLogShareUrl] = useState("");
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
  const workLogShareMessageTimerRef = useRef<number | null>(null);
  const commentNotificationCheckedRef = useRef(false);

  const load = useCallback(async (storedAuth: StoredAuth, knownEmployee?: Employee) => {
    setMessage("");
    setIsRefreshing(true);

    try {
      const dashboard = await apiFetch<DashboardResponse>(
        "/api/attendance/dashboard?limit=10",
        { auth: storedAuth },
      );

      applyDashboardState({
        ...dashboard,
        employee: knownEmployee ?? dashboard.employee,
      });
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const shareParams = getShareRequestParamsFromLocation();
    if (shareParams) {
      setAuth(null);
      setIsSharedView(true);
      apiFetch<SharedDashboardResponse>(`/api/share?${shareParams.toString()}`)
        .then((dashboard) => applySharedDashboardState(dashboard))
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "공유 화면을 불러오지 못했습니다.");
        })
        .finally(() => {
          setIsLoading(false);
          setIsRefreshing(false);
        });
      return;
    }

    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    setIsSharedView(false);

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
    if (!auth || !employee || isSharedView || commentNotificationCheckedRef.current) return;
    commentNotificationCheckedRef.current = true;
    void loadCommentNotifications(auth, employee);
  }, [auth, employee?.id, isSharedView]);

  useEffect(() => {
    if (!auth || !employee || !status?.kstDate) return;

    const context = getGreetingContext();
    const fallbackMessages = createLocalGreetings(context, "visit", 6);
    setGreetingMessages(fallbackMessages);
    setGreetingIndex(0);
    void fetchGreeting("visit", context).then((nextGreeting) => {
      if (nextGreeting?.messages.length) {
        setGreetingMessages(nextGreeting.messages);
        setGreetingIndex(0);
      }
      if (nextGreeting?.weather !== undefined) {
        setOfficeWeather(nextGreeting.weather);
      }
    });
  }, [
    auth,
    employee?.id,
    status?.kstDate,
    status?.openRecord?.checkInAt,
    status?.openRecord?.checkOutAt,
    status?.todayRecord?.checkInAt,
    status?.todayRecord?.checkOutAt,
  ]);

  useEffect(() => {
    if (greetingMessages.length <= 1) return;
    const timer = window.setTimeout(() => {
      setGreetingIndex((currentIndex) => (currentIndex + 1) % greetingMessages.length);
    }, GREETING_ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [greetingIndex, greetingMessages, greetingRotationNonce]);

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

  useEffect(() => {
    return () => {
      if (workLogShareMessageTimerRef.current !== null) {
        window.clearTimeout(workLogShareMessageTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!auth || isSharedView) {
      setDashboardShareUrl("");
      return;
    }

    let cancelled = false;
    void createShareUrl({ type: "dashboard" })
      .then((url) => {
        if (!cancelled) {
          setDashboardShareUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboardShareUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth, isSharedView]);

  useEffect(() => {
    setWorkLogShareUrl("");
    if (!auth || isSharedView || !selectedWorkRecord) {
      return;
    }

    let cancelled = false;
    void createShareUrl({
      type: "work-log",
      employeeId: selectedWorkRecord.employeeId,
      workDate: selectedWorkRecord.workDate,
    })
      .then((url) => {
        if (!cancelled) {
          setWorkLogShareUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkLogShareUrl("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [auth, isSharedView, selectedWorkRecord?.employeeId, selectedWorkRecord?.workDate]);

  async function refresh(loginEmployee?: Employee) {
    const storedAuth = getStoredAuth();
    setAuth(storedAuth);
    commentNotificationCheckedRef.current = false;
    if (!storedAuth) return;
    if (loginEmployee) {
      setEmployee(loginEmployee);
      setIsLoading(false);
    }
    await load(storedAuth, loginEmployee);
  }

  async function loadCommentNotifications(requestAuth: StoredAuth, currentEmployee: Employee) {
    const since = getCommentNotificationLastSeen(currentEmployee.id);

    try {
      const params = new URLSearchParams({ since });
      const result = await apiFetch<WorkCommentNotificationResponse>(
        `/api/work-log/comment-notifications?${params.toString()}`,
        { auth: requestAuth },
      );

      if (!result.notifications.length) {
        setCommentNotificationLastSeen(currentEmployee.id, result.checkedAt);
        return;
      }

      setCommentNotificationState({
        checkedAt: result.checkedAt,
        notifications: result.notifications,
      });
    } catch {
      // 댓글 알림은 보조 기능이라 대시보드 진입을 막지 않는다.
    }
  }

  function dismissCommentNotifications() {
    if (employee && commentNotificationState?.checkedAt) {
      setCommentNotificationLastSeen(employee.id, commentNotificationState.checkedAt);
    }
    setCommentNotificationState(null);
  }

  function openCommentNotification(notification: WorkCommentNotification) {
    if (!employee) return;

    dismissCommentNotifications();
    void openWorkLog({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      employeeName: employee.name,
      workDate: notification.workDate,
      checkInAt: null,
      checkOutAt: null,
      workType: "office",
      note: null,
    });
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
      const greetingEvent = getGreetingEvent(actionLabel);
      const greetingContext = getGreetingContext(result.record);
      setEncouragement(createLocalGreetings(greetingContext, greetingEvent, 1)[0]);
      void fetchGreeting(greetingEvent, greetingContext).then((nextGreeting) => {
        if (nextGreeting?.message) {
          setEncouragement(nextGreeting.message);
        }
        if (nextGreeting?.weather !== undefined) {
          setOfficeWeather(nextGreeting.weather);
        }
      });
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

  function getGreetingContext(recordOverride?: AttendanceRecord | null): GreetingContext {
    const greetingRecord = recordOverride ?? status?.openRecord ?? status?.todayRecord ?? null;
    const myTeamRecord = teamRecords.find((record) => record.employeeId === employee?.id);
    const visibleTeamCount = teamRecords.filter(
      (record) =>
        record.checkInAt &&
        record.employeeId !== employee?.id &&
        !formerTeamMemberNames.has(record.employeeName),
    ).length;

    return {
      employeeName: employee?.name,
      kstDate: status?.kstDate ?? greetingRecord?.workDate,
      record: greetingRecord
        ? {
            workDate: greetingRecord.workDate,
            checkInAt: greetingRecord.checkInAt,
            checkOutAt: greetingRecord.checkOutAt,
          }
        : null,
      records: records.map((record) => ({
        workDate: record.workDate,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
      })),
      teamCount: visibleTeamCount,
      taskCount: todayWorkLog?.taskCount ?? myTeamRecord?.taskCount ?? 0,
      doneCount: todayWorkLog?.doneCount ?? myTeamRecord?.doneCount ?? 0,
    };
  }

  async function fetchGreeting(event: GreetingEvent, context: GreetingContext) {
    if (!auth) return null;

    const result = await apiFetch<{
      message: string;
      messages?: string[];
      weather?: GreetingWeather | null;
    }>("/api/greeting", {
      method: "POST",
      auth,
      body: JSON.stringify({ event, context }),
    }).catch(() => null);

    return result
      ? {
          message: result.message,
          messages: result.messages?.length ? result.messages : [result.message],
          weather: result.weather ?? null,
        }
      : null;
  }

  function applyDashboardState(dashboard: DashboardResponse) {
    setEmployee(dashboard.employee);
    setStatus(dashboard.status);
    setRecords(dashboard.records);
    setTeamRecords(dashboard.teamRecords);
    setTeamMonth(dashboard.teamMonth);
    teamMonthCacheRef.current.set(dashboard.teamMonth.month, dashboard.teamMonth);
  }

  function applySharedDashboardState(dashboard: SharedDashboardResponse) {
    applyDashboardState(dashboard);
    setTodayWorkLog(dashboard.todayWorkLog ? normalizeWorkLogCounts(dashboard.todayWorkLog) : null);
    if (dashboard.todayWorkLog) {
      rememberWorkLog(normalizeWorkLogCounts(dashboard.todayWorkLog));
    }

    if (dashboard.targetWorkLog) {
      const targetWorkLog = normalizeWorkLogCounts(dashboard.targetWorkLog);
      const targetRecord =
        dashboard.targetWorkRecord ??
        resolveSharedWorkLogRecord(
          { employeeId: targetWorkLog.employeeId, workDate: targetWorkLog.workDate },
          {
            employee: dashboard.employee,
            records: dashboard.records,
            status: dashboard.status,
            teamMonth: dashboard.teamMonth,
            teamRecords: dashboard.teamRecords,
          },
      );
      setSelectedWorkRecord(targetRecord);
      setWorkLog(targetWorkLog);
      rememberWorkLog(targetWorkLog);
    } else if (dashboard.shareType === "work-log") {
      setWorkLogMessage("공유된 업무 기록을 찾지 못했어요.");
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
        canCheckOut: !record.checkOutAt,
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
    if (!auth && !isSharedView) return;

    const cacheKey = getWorkLogCacheKey(record.employeeId, record.workDate);
    const cachedWorkLog = workLogCacheRef.current.get(cacheKey) ?? null;
    const requestId = workLogLoadRequestIdRef.current + 1;
    workLogLoadRequestIdRef.current = requestId;
    setSelectedWorkRecord(record);
    setWorkLog(cachedWorkLog);
    setWorkLogMessage("");
    setWorkLogShareMessage("");
    setNewTaskText("");
    setNewCommentText("");
    setIsWorkLogLoading(!cachedWorkLog);

    try {
      const freshWorkLog =
        auth
          ? await fetchWorkLog(record, auth, { force: true })
          : await fetchSharedWorkLog(record);
      if (workLogLoadRequestIdRef.current === requestId) {
        setWorkLog(freshWorkLog);
        setSelectedWorkRecord((currentRecord) =>
          currentRecord?.employeeId === freshWorkLog.employeeId &&
          currentRecord.workDate === freshWorkLog.workDate
            ? { ...currentRecord, employeeName: freshWorkLog.employeeName }
            : currentRecord,
        );
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

  async function fetchSharedWorkLog(record: Pick<TeamAttendanceRecord, "employeeId" | "workDate">) {
    const params = getShareRequestParamsFromLocation();
    if (!params) {
      throw new Error("공유 링크를 찾을 수 없어요.");
    }
    params.set("employeeId", record.employeeId);
    params.set("workDate", record.workDate);
    const result = await apiFetch<SharedDashboardResponse>(`/api/share?${params.toString()}`);
    if (!result.targetWorkLog) {
      throw new Error("업무 기록을 찾을 수 없습니다.");
    }

    return normalizeWorkLogCounts(result.targetWorkLog);
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
      text: newCommentText.trim().slice(0, COMMENT_DRAFT_MAX_LENGTH),
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
    const nextText = text.trim().slice(0, COMMENT_DRAFT_MAX_LENGTH);
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
    setWorkLogShareMessage("");
    setNewTaskText("");
    setNewCommentText("");
    setEditingCommentId(null);
    setEditingCommentText("");
  }

  async function copySelectedWorkLogLink() {
    if (!selectedWorkRecord) return;

    try {
      const url =
        workLogShareUrl ||
        (await createShareUrl({
          type: "work-log",
          employeeId: selectedWorkRecord.employeeId,
          workDate: selectedWorkRecord.workDate,
        }));
      setWorkLogShareUrl(url);
      await copyPreparedShareUrl(url);
    } catch {
      showShareToast("공유 링크 복사에 실패했어요.");
    }
  }

  async function copyDashboardShareLink() {
    try {
      const url = dashboardShareUrl || (await createShareUrl({ type: "dashboard" }));
      setDashboardShareUrl(url);
      await copyPreparedShareUrl(url);
    } catch {
      showShareToast("공유 링크 복사에 실패했어요.");
    }
  }

  async function copyPreparedShareUrl(url: string) {
    try {
      await copyTextToClipboard(url);
      showShareToast("공유 링크가 복사되었어요.");
    } catch {
      showShareToast("공유 링크 복사에 실패했어요.");
    }
  }

  function showShareToast(message: string) {
    setWorkLogShareMessage(message);
    setWorkLogShareToastId((currentId) => currentId + 1);
    if (workLogShareMessageTimerRef.current !== null) {
      window.clearTimeout(workLogShareMessageTimerRef.current);
    }
    workLogShareMessageTimerRef.current = window.setTimeout(() => {
      setWorkLogShareMessage("");
      workLogShareMessageTimerRef.current = null;
    }, 2500);
  }

  async function createShareUrl(input: {
    type: "dashboard" | "work-log";
    employeeId?: string;
    workDate?: string;
  }) {
    if (!auth) {
      return window.location.href;
    }

    const result = await apiFetch<{ url: string }>("/api/share", {
      method: "POST",
      auth,
      body: JSON.stringify(input),
    });
    return result.url;
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
          order: getNextTaskOrder(workLog.tasks),
          completedOrder: null,
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
          order: getNextTaskOrder(todayWorkLog.tasks),
          completedOrder: null,
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
      const now = new Date().toISOString();
      const nextCompletedOrder = getNextCompletedOrder(workLog.tasks);
      await persistWorkLog({
        ...workLog,
        tasks: withTaskOrder(
          workLog.tasks.map((task) => {
            if (task.id !== taskId) {
              return task;
            }

            const done = !task.done;
            return {
              ...task,
              done,
              order:
                done || getFiniteNumber(task.completedOrder) !== null
                  ? task.order
                  : getRestoredOpenOrder(task, workLog.tasks),
              completedOrder: done ? nextCompletedOrder : null,
              updatedAt: now,
            };
          }),
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
      const now = new Date().toISOString();
      const nextCompletedOrder = getNextCompletedOrder(todayWorkLog.tasks);
      await persistTodayWorkLog({
        ...todayWorkLog,
        tasks: withTaskOrder(
          todayWorkLog.tasks.map((task) => {
            if (task.id !== taskId) {
              return task;
            }

            const done = !task.done;
            return {
              ...task,
              done,
              order:
                done || getFiniteNumber(task.completedOrder) !== null
                  ? task.order
                  : getRestoredOpenOrder(task, todayWorkLog.tasks),
              completedOrder: done ? nextCompletedOrder : null,
              updatedAt: now,
            };
          }),
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

  const selectGreetingIndex = useCallback((index: number) => {
    setGreetingIndex(index);
    setGreetingRotationNonce((currentNonce) => currentNonce + 1);
  }, []);

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

  if (!employee) {
    return <LoginPanel onLogin={refresh} />;
  }

  const isReadOnly = isSharedView || !auth;
  const currentRecord = status?.openRecord ?? status?.todayRecord;
  const currentWorkingMinutes =
    currentRecord?.checkInAt && !currentRecord.checkOutAt
      ? getDeskWorkedMinutes(currentRecord, clock)
      : null;
  const statusText = currentRecord?.checkOutAt
    ? "오늘도 고생했어요"
    : currentRecord?.checkInAt
      ? "함께 일하는 중"
      : isRefreshing
        ? "확인 중"
        : "좋은 하루 시작";
  const displayStatusText =
    currentWorkingMinutes !== null
      ? `함께 일하는 중 · ${formatWorkingSinceLabel(currentWorkingMinutes)}`
      : statusText;
  const statusHeatClassName =
    currentWorkingMinutes !== null ? getWorkDurationHeatClassName(currentWorkingMinutes) : "";
  const canPressCheckOut =
    !isReadOnly && Boolean(status?.canCheckOut) && !isMutating;
  const canCancelCheckOut = !isReadOnly && Boolean(status?.todayRecord?.checkOutAt) && !isMutating;
  const workingTeamRecords = teamRecords.filter(
    (record) =>
      record.checkInAt &&
      !record.checkOutAt &&
      !formerTeamMemberNames.has(record.employeeName),
  );
  const liveDeskRecords = getLiveDeskRecords({
    currentEmployeeId: employee.id,
    currentRecord,
    employee,
    records: workingTeamRecords,
    todayWorkLog,
  });
  const visibleTeamRecords = workingTeamRecords.filter(
    (record) => record.employeeId !== employee.id,
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
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span
              className={`work-status-pill whitespace-nowrap rounded-full bg-accentSoft px-3 py-1 text-sm font-semibold text-accent ${statusHeatClassName}`}
            >
              {displayStatusText}
            </span>
            {!isSharedView ? (
              <button
                className="rounded border border-line bg-white px-2 py-1 text-xs font-bold text-muted transition hover:bg-field hover:text-ink"
                onClick={copyDashboardShareLink}
                type="button"
              >
                공유
              </button>
            ) : (
              <span className="rounded bg-field px-2 py-1 text-xs font-bold text-muted">
                공유 화면
              </span>
            )}
          </div>
        </div>
        <GreetingTicker
          currentIndex={greetingIndex}
          message={greetingMessages[greetingIndex]}
          messages={greetingMessages}
          onSelect={selectGreetingIndex}
          total={greetingMessages.length}
        />

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            className="primary-button min-h-14 text-base"
            disabled={isReadOnly || !status?.canCheckIn || isMutating}
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
            canEdit={!isReadOnly}
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
        <TeamDeskScene
          currentEmployeeId={employee.id}
          now={clock}
          onPrefetchRecord={prefetchWorkLog}
          onSelectRecord={openWorkLog}
          refreshSeed={deskRefreshSeed}
          records={liveDeskRecords}
          todayDate={status?.kstDate}
          weather={officeWeather}
        />
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
              지금 함께 일하는 사람이 없어요. 첫 기록을 기다리는 중이에요.
            </p>
          ) : null}
        </div>
      </section>

      <section className="mt-4 w-full max-w-5xl self-center rounded-lg border border-line bg-white/95 p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <button
                aria-label="이전 달"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted transition hover:border-slate-300 hover:bg-field hover:text-ink disabled:bg-slate-100 disabled:text-slate-400"
                disabled={isTeamMonthLoading || isSharedView}
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
                disabled={isTeamMonthLoading || isSharedView}
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
        <MyTitlesPanel
          employeeId={employee.id}
          teamMonth={teamMonth}
          todayDate={status?.kstDate}
          todayWorkLog={todayWorkLog}
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

      {!isSharedView ? <div className="mt-5 flex items-center justify-center gap-3 text-xs">
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
      </div> : null}
    </main>
    {commentNotificationState ? (
      <CommentNotificationModal
        notifications={commentNotificationState.notifications}
        onClose={dismissCommentNotifications}
        onOpen={openCommentNotification}
      />
    ) : null}
    {selectedWorkRecord ? (
      <WorkLogModal
        canComment={!isReadOnly}
        canEdit={!isReadOnly && selectedWorkRecord.employeeId === employee.id}
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
        onCopyLink={copySelectedWorkLogLink}
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
    {workLogShareMessage ? (
      <Toast key={workLogShareToastId} message={workLogShareMessage} />
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

function Toast({ message }: { message: string }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-5 z-[70] -translate-x-1/2 animate-[toast-slide_2.5s_ease-in-out_forwards] rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-2xl"
      role="status"
    >
      {message}
    </div>
  );
}

function LinkifiedText({ text }: { text: string }) {
  const parts = splitTextIntoLinks(text);
  return (
    <>
      {parts.map((part, index) =>
        part.href ? (
          <a
            className="font-semibold text-accent underline underline-offset-2 hover:text-[#3f5fe0]"
            href={part.href}
            key={`${part.href}-${index}`}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
          >
            {part.text}
          </a>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const blocks = parseMarkdownBlocks(text);

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre
              className="overflow-x-auto rounded border border-line bg-white px-3 py-2 text-xs leading-relaxed text-ink"
              key={`code-${index}`}
            >
              <code>{block.lines.join("\n")}</code>
            </pre>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote
              className="border-l-2 border-accent/50 pl-3 text-sm leading-relaxed text-muted"
              key={`quote-${index}`}
            >
              {renderMarkdownLines(block.lines)}
            </blockquote>
          );
        }

        if (block.type === "heading") {
          const HeadingTag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
          return (
            <HeadingTag
              className={`${getMarkdownHeadingClassName(block.level)} leading-snug text-ink`}
              key={`heading-${index}`}
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              className={`space-y-1 pl-5 text-sm leading-relaxed text-ink ${
                block.ordered ? "list-decimal" : "list-disc"
              }`}
              key={`list-${index}`}
            >
              {block.items.map((item, lineIndex) => (
                <li
                  className={item.checked === null ? "" : "list-none"}
                  key={`${item.text}-${lineIndex}`}
                  style={item.level ? { marginLeft: `${item.level * 18}px` } : undefined}
                >
                  {item.checked === null ? null : (
                    <span
                      aria-hidden="true"
                      className={`mr-1.5 inline-flex h-4 w-4 translate-y-0.5 items-center justify-center rounded-sm border text-[11px] font-black shadow-sm ${
                        item.checked
                          ? "border-accent bg-white text-accent"
                          : "border-slate-400 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                  )}
                  {renderInlineMarkdown(item.text)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p className="text-sm leading-relaxed text-ink" key={`paragraph-${index}`}>
            {renderMarkdownLines(block.lines)}
          </p>
        );
      })}
    </div>
  );
}

function renderMarkdownLines(lines: string[]) {
  return lines.flatMap((line, index) => [
    index > 0 ? <br key={`br-${index}`} /> : null,
    <span key={`line-${index}`}>{renderInlineMarkdown(line)}</span>,
  ]);
}

function renderInlineMarkdown(text: string) {
  const parts = splitInlineMarkdown(text);
  return parts.map((part, index) => {
    if (part.kind === "bold") {
      return (
        <strong className="font-bold" key={`${part.text}-${index}`}>
          {renderInlineMarkdown(part.text)}
        </strong>
      );
    }

    if (part.kind === "italic") {
      return (
        <em className="italic" key={`${part.text}-${index}`}>
          {renderInlineMarkdown(part.text)}
        </em>
      );
    }

    if (part.kind === "code") {
      return (
        <code className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em] text-ink" key={`${part.text}-${index}`}>
          {part.text}
        </code>
      );
    }

    if (part.kind === "strike") {
      return (
        <del className="text-muted" key={`${part.text}-${index}`}>
          {renderInlineMarkdown(part.text)}
        </del>
      );
    }

    if (part.kind === "link") {
      return (
        <a
          className="font-semibold text-accent underline underline-offset-2 hover:text-[#3f5fe0]"
          href={part.href}
          key={`${part.href}-${index}`}
          onClick={(event) => event.stopPropagation()}
          rel="noreferrer"
          target="_blank"
        >
          {part.text}
        </a>
      );
    }

    return <span key={`${part.text}-${index}`}>{part.text}</span>;
  });
}

function CommentNotificationModal({
  notifications,
  onClose,
  onOpen,
}: {
  notifications: WorkCommentNotification[];
  onClose: () => void;
  onOpen: (notification: WorkCommentNotification) => void;
}) {
  const groupedCount = new Set(notifications.map((notification) => notification.workDate)).size;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/35 px-3 py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line bg-white p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold text-accent">
              새 댓글 {notifications.length}개 · 업무기록 {groupedCount}곳
            </p>
            <h3 className="mt-1 text-lg font-bold text-ink">내 업무기록에 댓글이 달렸어요</h3>
          </div>
          <button
            className="rounded px-2 py-1 text-sm font-bold text-muted hover:bg-field hover:text-ink"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>
        <ul className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {notifications.map((notification) => (
            <li
              className="rounded border border-line bg-field/70 px-3 py-2"
              key={`${notification.workDate}-${notification.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {notification.authorName}님이 댓글을 달았어요
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-muted">
                    {formatWorkDateWithWeekday(notification.workDate)} ·{" "}
                    {formatKstDateTime(notification.createdAt)}
                  </p>
                </div>
                <button
                  className="shrink-0 rounded border border-line bg-white px-2.5 py-1.5 text-xs font-bold text-accent hover:border-accent/40 hover:bg-accentSoft"
                  onClick={() => onOpen(notification)}
                  type="button"
                >
                  바로 보러가기
                </button>
              </div>
              <div className="mt-2 line-clamp-2 break-words text-sm text-ink">
                <MarkdownText text={notification.text} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TeamDeskScene({
  currentEmployeeId,
  now,
  onPrefetchRecord,
  onSelectRecord,
  refreshSeed,
  records,
  todayDate,
  weather,
}: {
  currentEmployeeId: string;
  now: Date;
  onPrefetchRecord: (record: TeamAttendanceRecord) => void;
  onSelectRecord: (record: TeamAttendanceRecord) => void;
  refreshSeed: number;
  records: TeamAttendanceRecord[];
  todayDate?: string | null;
  weather: GreetingWeather | null;
}) {
  if (!records.length) {
    return null;
  }

  const ambience = getDeskAmbience(now, todayDate, weather);

  return (
    <div className={`team-pixel-room mt-3 ${ambience.className}`} aria-label="실시간 작업실">
      <div className="team-pixel-room-header">
        <span>실시간 작업실</span>
        <span>{records.length}명 작업 중</span>
      </div>
      <span className="team-pixel-clock" aria-hidden="true">
        {ambience.clockLabel}
      </span>
      <span className="team-pixel-weather-badge">{ambience.weatherText}</span>
      {ambience.eventLabel ? <span className="team-pixel-event-banner">{ambience.eventLabel}</span> : null}
      <span className="team-pixel-weather-layer" aria-hidden="true" />
      <span className="team-pixel-window" aria-hidden="true">
        <span />
        <span />
      </span>
      <span className="team-pixel-board" aria-hidden="true">
        WORK
      </span>
      <div className="team-pixel-grid">
        {records.map((record, index) => (
          <TeamDeskSeat
            currentEmployeeId={currentEmployeeId}
            dateKey={todayDate ?? record.workDate}
            index={index}
            key={record.employeeId}
            now={now}
            onPrefetchRecord={onPrefetchRecord}
            onSelectRecord={onSelectRecord}
            refreshSeed={refreshSeed}
            record={record}
          />
        ))}
      </div>
    </div>
  );
}

function TeamDeskSeat({
  currentEmployeeId,
  dateKey,
  index,
  now,
  onPrefetchRecord,
  onSelectRecord,
  refreshSeed,
  record,
}: {
  currentEmployeeId: string;
  dateKey?: string | null;
  index: number;
  now: Date;
  onPrefetchRecord: (record: TeamAttendanceRecord) => void;
  onSelectRecord: (record: TeamAttendanceRecord) => void;
  refreshSeed: number;
  record: TeamAttendanceRecord;
}) {
  const palette = getDeskPalette(index, record.employeeId, dateKey ?? record.workDate);
  const state = getDeskSeatState(record, now, refreshSeed);
  const isMe = record.employeeId === currentEmployeeId;
  const taskCount = record.taskCount ?? record.tasks?.length ?? 0;
  const doneCount = record.doneCount ?? record.tasks?.filter((task) => task.done).length ?? 0;
  const taskText = taskCount > 0 ? `${doneCount}/${taskCount} 완료` : "업무 중";
  const workedMinutes = getDeskWorkedMinutes(record, now);
  const workingLabel = formatWorkingSinceLabel(workedMinutes);
  const workHeatClassName = getWorkDurationHeatClassName(workedMinutes);
  const mumbleLines = getDeskMumbleLines(record, refreshSeed);
  const [mumbleIndex, setMumbleIndex] = useState(0);
  const safeMumbleIndex = mumbleIndex % mumbleLines.length;

  useEffect(() => {
    if (mumbleLines.length <= 1) {
      setMumbleIndex(0);
      return;
    }

    const timer = window.setTimeout(
      () => setMumbleIndex((currentIndex) => (currentIndex + 1) % mumbleLines.length),
      3300 + index * 260,
    );
    return () => window.clearTimeout(timer);
  }, [index, mumbleIndex, mumbleLines.length]);

  return (
    <button
      aria-label={`${record.employeeName} 업무 기록 보기`}
      className={`team-pixel-seat team-pixel-hair-${palette.hairStyle} team-pixel-outfit-${palette.outfit} team-pixel-posture-${state.posture} team-pixel-mood-${state.mood} team-pixel-screen-${state.screen}${state.rare ? ` team-pixel-rare-${state.rare}` : ""}${isMe ? " team-pixel-seat-me" : ""}`}
      onFocus={() => onPrefetchRecord(record)}
      onClick={() => onSelectRecord(record)}
      onPointerEnter={() => onPrefetchRecord(record)}
      style={getDeskPaletteStyle(palette)}
      title={`${record.employeeName} · ${formatKstTimeRange(record)}`}
      type="button"
    >
      <span className="team-pixel-nameplate">
        <span className="team-pixel-name">{record.employeeName}</span>
        <span className={`team-pixel-time ${workHeatClassName}`}>{workingLabel}</span>
      </span>
      <span className="team-pixel-mumble" key={`${record.employeeId}-${safeMumbleIndex}`}>
        {mumbleLines[safeMumbleIndex]}
      </span>
      <span className="team-pixel-art" aria-hidden="true">
        <span className="team-pixel-rug" />
        <span className="team-pixel-ground-shadow" />
        <span className="team-pixel-lamp">
          <span />
        </span>
        <span className="team-pixel-chair" />
        <span className="team-pixel-worker">
          <span className="team-pixel-head">
            <span className="team-pixel-hair" />
            <span className="team-pixel-face" />
            <span className="team-pixel-mouth" />
          </span>
          <span className="team-pixel-body" />
          <span className="team-pixel-leg team-pixel-leg-left" />
          <span className="team-pixel-leg team-pixel-leg-right" />
          <span className="team-pixel-arm team-pixel-arm-left" />
          <span className="team-pixel-arm team-pixel-arm-right" />
        </span>
        <span className="team-pixel-desk">
          <span className="team-pixel-monitor">
            <span />
            <span />
            <span />
          </span>
          <span className="team-pixel-keyboard" />
          <span className="team-pixel-desk-items">
            {state.items.map((item) => (
              <span aria-hidden="true" className={`team-pixel-item team-pixel-item-${item}`} key={item} />
            ))}
          </span>
        </span>
        {state.showZzz ? <span className="team-pixel-zzz">zzz</span> : null}
        <span className="team-pixel-plant">
          <span />
          <span />
        </span>
      </span>
      <span className="team-pixel-stat">
        <span>{taskText}</span>
        <span>{isMe ? "내 자리" : "클릭해서 보기"}</span>
      </span>
    </button>
  );
}

function getDeskMumbleLines(
  record: Pick<TeamAttendanceRecord, "employeeId" | "tasks" | "workDate">,
  refreshSeed: number,
) {
  const tasks = record.tasks ?? [];
  const activeTasks = tasks.filter((task) => !task.done && task.text.trim());
  const fallbackTasks = tasks.filter((task) => task.text.trim());
  const sourceTasks = activeTasks.length ? activeTasks : fallbackTasks;
  const startIndex =
    sourceTasks.length > 0
      ? hashString(`${record.employeeId}:${record.workDate}:${refreshSeed}:mumble`) %
        sourceTasks.length
      : 0;
  const rotatedTasks = rotateFromIndex(sourceTasks, startIndex);
  const lines = rotatedTasks
    .slice(0, 5)
    .map((task) => `…${compactDeskTaskText(task.text)}`);

  return lines.length ? lines : ["…업무 정리 중"];
}

function rotateFromIndex<T>(items: T[], startIndex: number) {
  if (items.length <= 1 || startIndex <= 0) {
    return items;
  }

  return [...items.slice(startIndex), ...items.slice(0, startIndex)];
}

function compactDeskTaskText(value: string) {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > 64 ? `${compacted.slice(0, 64)}…` : compacted;
}

type DeskMood = "boosted" | "focused" | "normal" | "sleepy" | "tired";
type DeskPosture = "lean" | "stretch" | "typing" | "upright";
type DeskScreen = "chart" | "code" | "doc" | "mail" | "spark";
type DeskItem = "book" | "coffee" | "memo" | "snack" | "trophy" | "water";
type DeskRare = "gold" | "sparkle" | null;

function getDeskSeatState(record: TeamAttendanceRecord, now: Date, refreshSeed: number) {
  const seed = hashString(`${record.employeeId}:${record.workDate}:${refreshSeed}`);
  const workedMinutes = getDeskWorkedMinutes(record, now);
  const taskCount = record.taskCount ?? record.tasks?.length ?? 0;
  const doneCount = record.doneCount ?? record.tasks?.filter((task) => task.done).length ?? 0;
  const completionRate = taskCount > 0 ? doneCount / taskCount : 0;
  const hour = getKstHour(now);
  const mood: DeskMood =
    workedMinutes >= 12 * 60 || (hour >= 23 && workedMinutes >= 8 * 60)
      ? "sleepy"
      : workedMinutes >= 10 * 60 || (hour >= 22 && workedMinutes >= 6 * 60 && completionRate < 0.8)
        ? "tired"
        : taskCount >= 6 && completionRate < 0.6
          ? "focused"
          : doneCount >= 5 || completionRate === 1
            ? "boosted"
            : "normal";
  const posture: DeskPosture =
    mood === "sleepy"
      ? pickBySeed(["typing", "lean"], seed + 2)
      : mood === "tired"
        ? pickBySeed(["typing", "upright"], seed + 3)
        : mood === "focused"
          ? "typing"
          : pickBySeed(["typing", "upright", "stretch"], seed + 5);
  const screen: DeskScreen = pickBySeed(["chart", "code", "doc", "mail", "spark"], seed + workedMinutes + taskCount);
  const items = getDeskItems(seed, mood, workedMinutes);
  const rareRoll = seed % 97;
  const rare: DeskRare = rareRoll === 0 ? "gold" : rareRoll === 1 ? "sparkle" : null;

  return {
    items,
    mood,
    posture,
    rare,
    screen,
    showZzz: mood === "sleepy" && seed % 2 === 0,
  };
}

function getDeskItems(seed: number, mood: DeskMood, workedMinutes: number) {
  const items: DeskItem[] = [];
  const addItem = (item: DeskItem) => {
    if (!items.includes(item)) {
      items.push(item);
    }
  };

  if (workedMinutes >= 6 * 60 || mood === "tired" || mood === "sleepy") {
    addItem("coffee");
  } else {
    addItem(pickBySeed<DeskItem>(["water", "memo", "book"], seed + 1));
  }

  addItem(pickBySeed<DeskItem>(["memo", "book", "snack", "water"], seed + 9));
  addItem(pickBySeed<DeskItem>(["book", "memo", "snack", "water", "trophy"], seed + 17));

  if (seed % 13 === 0) {
    addItem("trophy");
  }

  addItem(pickBySeed<DeskItem>(["memo", "water", "book", "snack"], seed + 31));

  return items.slice(0, 3);
}

function getDeskWorkedMinutes(record: Pick<TeamAttendanceRecord, "checkInAt" | "checkOutAt">, now: Date) {
  if (!record.checkInAt) return 0;
  const checkIn = new Date(record.checkInAt).getTime();
  const checkOut = record.checkOutAt ? new Date(record.checkOutAt).getTime() : now.getTime();
  if (!Number.isFinite(checkIn) || !Number.isFinite(checkOut) || checkOut <= checkIn) return 0;
  return Math.round((checkOut - checkIn) / 60000);
}

function getKstHour(now: Date) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

function getDeskAmbience(now: Date, todayDate: string | null | undefined, weather: GreetingWeather | null) {
  const kstParts = getKstDateParts(now, todayDate);
  const period =
    kstParts.hour < 6
      ? "night"
      : kstParts.hour < 11
        ? "morning"
        : kstParts.hour < 17
          ? "day"
          : kstParts.hour < 20
            ? "evening"
            : "night";
  const season =
    kstParts.month <= 2 || kstParts.month === 12
      ? "winter"
      : kstParts.month <= 5
        ? "spring"
        : kstParts.month <= 8
          ? "summer"
          : "autumn";
  const weatherLabel = weather?.label ?? "unknown";
  const eventLabel = getDeskEventLabel(kstParts);
  const temperature =
    weather?.apparentTemperature !== null && weather?.apparentTemperature !== undefined
      ? weather.apparentTemperature
      : weather?.temperature;
  const weatherText =
    temperature !== null && temperature !== undefined
      ? `${getDeskWeatherLabel(weatherLabel)} ${temperature.toFixed(1)}도`
      : getDeskWeatherLabel(weatherLabel);

  return {
    className: [
      `team-pixel-${period}`,
      `team-pixel-season-${season}`,
      `team-pixel-weather-${weatherLabel}`,
      eventLabel ? "team-pixel-has-event" : "",
    ]
      .filter(Boolean)
      .join(" "),
    clockLabel: period === "night" ? "NIGHT" : period === "evening" ? "SUNSET" : "LIVE",
    eventLabel,
    weatherText,
  };
}

function getKstDateParts(now: Date, todayDate: string | null | undefined) {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const [year, month, day] =
    todayDate && /^\d{4}-\d{2}-\d{2}$/.test(todayDate)
      ? todayDate.split("-").map(Number)
      : [kstNow.getUTCFullYear(), kstNow.getUTCMonth() + 1, kstNow.getUTCDate()];

  return {
    year,
    month,
    day,
    hour: kstNow.getUTCHours(),
  };
}

function getDeskWeatherLabel(label: string) {
  if (label === "rain") return "비";
  if (label === "snow") return "눈";
  if (label === "fog") return "안개";
  if (label === "windy") return "바람";
  if (label === "hot") return "더움";
  if (label === "cold") return "추움";
  if (label === "clear") return "맑음";
  if (label === "cloudy") return "흐림";
  return "광진구";
}

function getDeskEventLabel(parts: { month: number; day: number }) {
  const key = `${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  const labels: Record<string, string> = {
    "01-01": "새해",
    "02-14": "밸런타인",
    "03-01": "삼일절",
    "04-01": "만우절",
    "05-01": "근로자의 날",
    "05-05": "어린이날",
    "05-08": "어버이날",
    "05-15": "스승의 날",
    "06-06": "현충일",
    "08-15": "광복절",
    "10-03": "개천절",
    "10-09": "한글날",
    "11-11": "11.11",
    "12-24": "이브",
    "12-25": "크리스마스",
    "12-31": "연말",
  };

  if (labels[key]) return labels[key];
  if (parts.day === 1) return `${parts.month}월 첫날`;
  return "";
}

function getLiveDeskRecords({
  currentEmployeeId,
  currentRecord,
  employee,
  records,
  todayWorkLog,
}: {
  currentEmployeeId: string;
  currentRecord: AttendanceRecord | null | undefined;
  employee: Employee;
  records: TeamAttendanceRecord[];
  todayWorkLog: WorkLog | null;
}) {
  const currentEmployeeRecord =
    currentRecord?.checkInAt && !currentRecord.checkOutAt
      ? {
          employeeId: employee.id,
          employeeName: employee.name,
          employeeNo: employee.employeeNo,
          workDate: currentRecord.workDate,
          checkInAt: currentRecord.checkInAt,
          checkOutAt: currentRecord.checkOutAt,
          workType: currentRecord.workType,
          note: currentRecord.note,
          taskCount: todayWorkLog?.taskCount ?? 0,
          doneCount: todayWorkLog?.doneCount ?? 0,
          commentCount: todayWorkLog?.commentCount ?? 0,
          tasks: todayWorkLog?.tasks ?? [],
        }
      : null;
  const mergedRecords = currentEmployeeRecord
    ? [
        currentEmployeeRecord,
        ...records.filter((record) => record.employeeId !== currentEmployeeRecord.employeeId),
      ]
    : records;

  return [...mergedRecords].sort(
    (a, b) =>
      Number(b.employeeId === currentEmployeeId) - Number(a.employeeId === currentEmployeeId) ||
      a.employeeName.localeCompare(b.employeeName, "ko"),
  );
}

type DeskPalette = {
  chair: string;
  desk: string;
  hairStyle: "cap" | "flat" | "side" | "soft";
  hair: string;
  outfit: "cardigan" | "hoodie" | "tie" | "vest";
  screen: string;
  shirt: string;
  skin: string;
};

function getDeskPalette(index: number, employeeId: string, dateKey?: string | null) {
  const seed = hashString(`${employeeId}:${dateKey ?? ""}:${index}`);
  const skins = ["#f2c7a7", "#ffd6a5", "#fed7aa", "#f5c9a8"];
  const hairs = ["#27324a", "#4a2f28", "#172033", "#2f241f"];
  const shirts = ["#6f89f5", "#38bdf8", "#5b7cff", "#60a5fa", "#4f7df3"];
  const chairs = ["#8ea2ff", "#7dd3fc", "#9bb1ff", "#93c5fd"];
  const desks = ["#d7e6ff", "#e0f2fe", "#eff6ff", "#dbeafe"];
  const screens = ["#4568f5", "#0ea5e9", "#3b82f6", "#64748b"];
  const hairStyles: DeskPalette["hairStyle"][] = ["cap", "flat", "side"];
  const outfits: DeskPalette["outfit"][] = ["cardigan", "hoodie"];

  return {
    chair: pickBySeed(chairs, seed + 7),
    desk: pickBySeed(desks, seed + 11),
    hair: pickBySeed(hairs, seed + 13),
    hairStyle: pickBySeed(hairStyles, seed + 17),
    outfit: pickBySeed(outfits, seed + 19),
    screen: pickBySeed(screens, seed + 23),
    shirt: pickBySeed(shirts, seed + 29),
    skin: pickBySeed(skins, seed + 31),
  };
}

function getDeskPaletteStyle(palette: DeskPalette) {
  return {
    "--pixel-chair": palette.chair,
    "--pixel-desk": palette.desk,
    "--pixel-hair": palette.hair,
    "--pixel-screen": palette.screen,
    "--pixel-shirt": palette.shirt,
    "--pixel-skin": palette.skin,
  } as CSSProperties;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickBySeed<T>(items: T[], seed: number) {
  return items[Math.abs(seed) % items.length];
}

function GreetingTicker({
  currentIndex,
  message,
  messages,
  onSelect,
  total,
}: {
  currentIndex: number;
  message?: string;
  messages: string[];
  onSelect: (index: number) => void;
  total: number;
}) {
  const visibleMessage = message || "오늘도 가볍게 시작해봐요!";
  const dotCount = Math.min(total, 6);

  return (
    <div className="mx-auto mt-3 w-full max-w-md overflow-hidden rounded border border-line bg-field/70 px-3 py-2.5 text-center">
      <div>
        <GreetingTickerLine
          animated
          key={`${currentIndex}-${visibleMessage}`}
          message={visibleMessage}
        />
        {total > 1 ? (
          <GreetingTickerDots
            currentIndex={currentIndex}
            dotCount={dotCount}
            onSelect={onSelect}
          />
        ) : null}
      </div>
    </div>
  );
}

function GreetingTickerLine({ animated, message }: { animated?: boolean; message: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_0_4px_rgba(69,104,245,0.10)]"
      />
      <p
        className={`${animated ? "greeting-marquee-line " : ""}min-w-0 truncate whitespace-nowrap text-sm font-semibold leading-relaxed text-muted`}
      >
        {message}
      </p>
    </div>
  );
}

function GreetingTickerDots({
  currentIndex,
  dotCount,
  onSelect,
}: {
  currentIndex: number;
  dotCount: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <div className="mt-2 flex justify-center gap-1.5">
      {Array.from({ length: dotCount }).map((_, dotIndex) => {
        const isActive = dotIndex === currentIndex % dotCount;
        const className = `h-1.5 rounded-full transition-all ${
          isActive ? "w-5 bg-accent" : "w-2 bg-slate-300"
        }`;

        return onSelect ? (
          <button
            aria-label={`${dotIndex + 1}번째 멘트 보기`}
            aria-pressed={isActive}
            className={`${className} hover:bg-accent/70 focus:outline-none focus:ring-2 focus:ring-accent/20`}
            key={dotIndex}
            onClick={() => onSelect(dotIndex)}
            type="button"
          >
            <span className="sr-only">{dotIndex + 1}번째 멘트</span>
          </button>
        ) : (
          <span className={className} key={dotIndex} />
        );
      })}
    </div>
  );
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
          <span className={task.done ? "text-muted line-through" : ""}>
            <LinkifiedText text={task.text} />
          </span>
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScroll, setCanScroll] = useState(false);

  function updateScrollProgress() {
    const element = scrollRef.current;
    if (!element) return;

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setCanScroll(maxScrollLeft > 1);
    setScrollProgress(maxScrollLeft > 0 ? element.scrollLeft / maxScrollLeft : 0);
  }

  function scrollCalendar(delta: number) {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }

  useEffect(() => {
    const timer = window.setTimeout(updateScrollProgress, 0);
    window.addEventListener("resize", updateScrollProgress);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", updateScrollProgress);
    };
  }, [teamMonth?.month]);

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
  const columnWidths = getCalendarColumnWidths(days, recordsByDate);
  const minCalendarWidth = columnWidths.reduce((total, width) => total + width, 0);
  const calendarFrameStyle = {
    minWidth: `${minCalendarWidth}px`,
  };
  const calendarGridStyle = {
    gridTemplateColumns: columnWidths.map((width) => `minmax(${width}px, 1fr)`).join(" "),
  };

  return (
    <div className="mt-3">
      {canScroll ? (
        <div className="mb-2 flex items-center gap-2 rounded border border-line bg-field/60 px-2 py-1.5">
          <button
            aria-label="달력 왼쪽으로 이동"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted transition hover:border-slate-300 hover:bg-field hover:text-ink"
            onClick={() => scrollCalendar(-260)}
            type="button"
          >
            ‹
          </button>
          <input
            aria-label="달력 좌우 위치"
            className="calendar-scroll-range w-full"
            max={100}
            min={0}
            onChange={(event) => {
              const element = scrollRef.current;
              if (!element) return;
              const maxScrollLeft = element.scrollWidth - element.clientWidth;
              element.scrollLeft = (Number(event.target.value) / 100) * maxScrollLeft;
              updateScrollProgress();
            }}
            type="range"
            value={Math.round(scrollProgress * 100)}
          />
          <button
            aria-label="달력 오른쪽으로 이동"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line bg-white text-sm font-bold text-muted transition hover:border-slate-300 hover:bg-field hover:text-ink"
            onClick={() => scrollCalendar(260)}
            type="button"
          >
            ›
          </button>
        </div>
      ) : null}
      <div
        className="scrollbar-none overflow-x-auto"
        onScroll={updateScrollProgress}
        ref={scrollRef}
      >
        <div className="w-full rounded border-l border-t border-line" style={calendarFrameStyle}>
          <div
            className="grid text-center text-[10px] font-bold text-muted sm:text-xs"
            style={calendarGridStyle}
          >
            {weekdayLabels.map((weekday, index) => (
              <div
                className={`border-b border-r border-line bg-field/80 py-2 ${weekendTextClass(index)}`}
                key={weekday}
              >
                {weekday}
              </div>
            ))}
          </div>
          <div className="grid" style={calendarGridStyle}>
            {days.map((day) => {
              const dayRecords = recordsByDate.get(day.date) ?? [];
              const dayToneClassName = getDateToneTextClass(day.date);

              return (
                <div
                  className={`min-h-32 min-w-0 border-b border-r border-line p-1.5 sm:min-h-36 ${
                    day.isCurrentMonth ? "bg-white" : "bg-field/35"
                  }`}
                  key={day.key}
                >
                  <div
                    className={`mb-1 text-right text-[10px] font-bold sm:mb-2 sm:text-xs ${
                      day.isCurrentMonth ? dayToneClassName : "text-slate-400"
                    }`}
                    title={getPublicHolidayName(day.date) || undefined}
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
    </div>
  );
}

function CalendarLegend() {
  const items = [
    { className: "border-warn/50 bg-warn/10", label: "10시간+", tone: "warm" },
    { className: "border-danger/50 bg-danger/10", label: "12시간+", tone: "danger" },
    { className: "border-accent/45 bg-accentSoft", label: "완료 5개+", tone: "accent" },
    { className: "border-ink/30 bg-slate-100", label: "전부 완료", tone: "complete" },
  ];

  return (
    <div
      aria-label="달력 범례"
      className="hidden flex-wrap justify-end gap-1.5 text-[11px] text-muted sm:flex"
    >
      {items.map((item) => (
        <span
          className={`calendar-legend-badge calendar-legend-badge-${item.tone} inline-flex items-center gap-1 rounded border px-2 py-1`}
          key={item.label}
        >
          <span
            aria-hidden="true"
            className={`calendar-legend-dot h-2.5 w-2.5 rounded-sm border ${item.className}`}
          />
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

type EmployeeTitleTone = "accent" | "complete" | "danger" | "ink" | "warm";

type EmployeeTitle = {
  achieved: boolean;
  description: string;
  id: string;
  kind?: "duration";
  name: string;
  progress: number;
  target: number;
  tone: EmployeeTitleTone;
  unit?: string;
  value: number;
};

type EmployeeTitleBase = Omit<EmployeeTitle, "achieved" | "progress">;

type EmployeeTitleStats = {
  attendanceDays: number;
  checkoutDays: number;
  commentCount: number;
  completedTasks: number;
  currentStreak: number;
  heavyDoneDays: number;
  perfectTaskDays: number;
  tenHourDays: number;
  totalTasks: number;
  totalWorkedMinutes: number;
  twelveHourDays: number;
};

function MyTitlesPanel({
  employeeId,
  teamMonth,
  todayDate,
  todayWorkLog,
}: {
  employeeId: string;
  teamMonth: TeamMonthAttendance | null;
  todayDate?: string;
  todayWorkLog: WorkLog | null;
}) {
  if (!teamMonth) {
    return null;
  }

  const stats = getEmployeeTitleStats(employeeId, teamMonth, todayDate, todayWorkLog);
  const titles = getEmployeeTitles(stats);
  const achievedTitles = titles.filter((title) => title.achieved);
  const representativeTitle = achievedTitles[0] ?? titles[0];
  const doneSummary =
    stats.totalTasks > 0 ? `${stats.completedTasks}/${stats.totalTasks}개` : "0개";

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">나의 칭호</h3>
          <p className="mt-1 text-xs text-muted">
            이번 달 기록으로 {achievedTitles.length}개 달성했어요. 다음 칭호까지 남은 흐름도 바로 볼 수 있어요.
          </p>
        </div>
        <span className="rounded-full border border-accent/25 bg-accentSoft px-3 py-1 text-xs font-bold text-accent">
          대표 칭호 · {representativeTitle.name}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <TitleSummaryChip label="이번 달 출근" value={`${stats.attendanceDays}일`} />
        <TitleSummaryChip label="총 근무시간" value={formatWorkedDuration(stats.totalWorkedMinutes)} />
        <TitleSummaryChip label="완료한 업무" value={doneSummary} />
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {titles.map((title) => (
          <div
            className={`rounded border p-3 transition ${getTitleCardClassName(title)}`}
            key={title.id}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{title.name}</p>
                <p className="mt-1 text-xs leading-relaxed opacity-80">{title.description}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  title.achieved ? "bg-white/75 text-ink" : "bg-slate-100 text-muted"
                }`}
              >
                {title.achieved ? "달성" : "진행"}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-semibold">
              <span>{formatTitleProgressValue(title)}</span>
              <span>{Math.round(title.progress * 100)}%</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80">
              <div
                className={`h-full rounded-full ${getTitleProgressClassName(title)}`}
                style={{ width: `${Math.max(7, Math.round(title.progress * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TitleSummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-white/75 px-3 py-2">
      <p className="font-semibold text-muted">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

function getEmployeeTitleStats(
  employeeId: string,
  teamMonth: TeamMonthAttendance,
  todayDate: string | undefined,
  todayWorkLog: WorkLog | null,
): EmployeeTitleStats {
  const records = teamMonth.records
    .filter(
      (record) =>
        record.employeeId === employeeId &&
        record.workDate >= teamMonth.startDate &&
        record.workDate <= teamMonth.endDate,
    )
    .sort((a, b) => a.workDate.localeCompare(b.workDate));

  let totalWorkedMinutes = 0;
  let tenHourDays = 0;
  let twelveHourDays = 0;
  let completedTasks = 0;
  let totalTasks = 0;
  let heavyDoneDays = 0;
  let perfectTaskDays = 0;
  let commentCount = 0;

  for (const record of records) {
    const workedMinutes = getWorkedMinutes(record);
    if (workedMinutes !== null) {
      totalWorkedMinutes += workedMinutes;
      if (workedMinutes >= 10 * 60) {
        tenHourDays += 1;
      }
      if (workedMinutes >= 12 * 60) {
        twelveHourDays += 1;
      }
    }

    const taskCount =
      todayWorkLog?.employeeId === employeeId && todayWorkLog.workDate === record.workDate
        ? todayWorkLog.taskCount
        : record.taskCount ?? record.tasks?.length ?? 0;
    const doneCount =
      todayWorkLog?.employeeId === employeeId && todayWorkLog.workDate === record.workDate
        ? todayWorkLog.doneCount
        : record.doneCount ?? record.tasks?.filter((task) => task.done).length ?? 0;
    const recordCommentCount =
      todayWorkLog?.employeeId === employeeId && todayWorkLog.workDate === record.workDate
        ? todayWorkLog.commentCount
        : record.commentCount ?? 0;

    totalTasks += taskCount;
    completedTasks += doneCount;
    commentCount += recordCommentCount;

    if (doneCount >= 5) {
      heavyDoneDays += 1;
    }
    if (taskCount >= 3 && doneCount === taskCount) {
      perfectTaskDays += 1;
    }
  }

  return {
    attendanceDays: records.filter((record) => record.checkInAt || record.checkOutAt).length,
    checkoutDays: records.filter((record) => record.checkOutAt).length,
    commentCount,
    completedTasks,
    currentStreak: getCurrentAttendanceStreak(records, todayDate),
    heavyDoneDays,
    perfectTaskDays,
    tenHourDays,
    totalTasks,
    totalWorkedMinutes,
    twelveHourDays,
  };
}

function getEmployeeTitles(stats: EmployeeTitleStats) {
  const titles: EmployeeTitleBase[] = [
    {
      description: "이번 달 출근 기록을 남긴 날",
      id: "attendance-starter",
      name: "출근 스타터",
      target: 1,
      tone: "accent",
      unit: "일",
      value: stats.attendanceDays,
    },
    {
      description: `현재 연속 출근 ${stats.currentStreak}일`,
      id: "streak-3",
      name: "3일 연속 출근",
      target: 3,
      tone: "accent",
      unit: "일",
      value: stats.currentStreak,
    },
    {
      description: `현재 연속 출근 ${stats.currentStreak}일`,
      id: "streak-5",
      name: "5일 연속 추진력",
      target: 5,
      tone: "warm",
      unit: "일",
      value: stats.currentStreak,
    },
    {
      description: "하루 10시간 이상 근무한 날",
      id: "ten-hour",
      name: "10시간 돌파",
      target: 1,
      tone: "warm",
      unit: "일",
      value: stats.tenHourDays,
    },
    {
      description: "하루 12시간 이상 근무한 날",
      id: "twelve-hour",
      name: "12시간 불꽃근무",
      target: 1,
      tone: "danger",
      unit: "일",
      value: stats.twelveHourDays,
    },
    {
      description: "하루에 완료 업무 5개 이상",
      id: "task-five",
      name: "완료 5개+",
      target: 1,
      tone: "accent",
      unit: "일",
      value: stats.heavyDoneDays,
    },
    {
      description: "업무 3개 이상을 전부 완료한 날",
      id: "perfect-task-day",
      name: "전부 완료",
      target: 1,
      tone: "complete",
      unit: "일",
      value: stats.perfectTaskDays,
    },
    {
      description: "이번 달 누적 근무시간 40시간",
      id: "month-40h",
      kind: "duration",
      name: "월간 40시간",
      target: 40 * 60,
      tone: "ink",
      value: stats.totalWorkedMinutes,
    },
    {
      description: "이번 달 누적 근무시간 80시간",
      id: "month-80h",
      kind: "duration",
      name: "월간 80시간",
      target: 80 * 60,
      tone: "danger",
      value: stats.totalWorkedMinutes,
    },
    {
      description: "업무 댓글 3개 이상",
      id: "comment-connector",
      name: "댓글 연결자",
      target: 3,
      tone: "ink",
      unit: "개",
      value: stats.commentCount,
    },
    {
      description: "퇴근 기록까지 남긴 날 5일",
      id: "checkout-routine",
      name: "마무리 루틴",
      target: 5,
      tone: "complete",
      unit: "일",
      value: stats.checkoutDays,
    },
  ];

  return titles
    .map((title) => ({
      ...title,
      achieved: title.value >= title.target,
      progress: Math.min(1, title.value / title.target),
    }))
    .sort(
      (a, b) =>
        Number(b.achieved) - Number(a.achieved) ||
        b.progress - a.progress ||
        a.target - b.target,
    );
}

function getCurrentAttendanceStreak(records: TeamAttendanceRecord[], todayDate?: string) {
  const attendanceDates = new Set(
    records
      .filter((record) => record.checkInAt || record.checkOutAt)
      .map((record) => record.workDate),
  );
  if (attendanceDates.size === 0) {
    return 0;
  }

  const sortedDates = [...attendanceDates].sort();
  const latestDate = sortedDates[sortedDates.length - 1];
  const cursorStart =
    todayDate && todayDate.slice(0, 7) === latestDate.slice(0, 7) && todayDate <= latestDate
      ? todayDate
      : latestDate;
  let cursor = attendanceDates.has(cursorStart) ? cursorStart : latestDate;
  let streak = 0;

  while (attendanceDates.has(cursor)) {
    streak += 1;
    cursor = addDateString(cursor, -1);
  }

  return streak;
}

function addDateString(value: string, deltaDays: number) {
  const date = dateStringToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function formatTitleProgressValue(title: EmployeeTitle) {
  if (title.kind === "duration") {
    return `${formatWorkedDuration(title.value)} / ${formatWorkedDuration(title.target)}`;
  }

  return `${title.value}${title.unit ?? ""} / ${title.target}${title.unit ?? ""}`;
}

function getTitleCardClassName(title: EmployeeTitle) {
  if (!title.achieved) {
    return "border-line bg-white/70 text-ink";
  }

  if (title.tone === "danger") {
    return "border-danger/30 bg-danger/10 text-danger shadow-[0_14px_30px_-26px_rgba(222,69,69,0.85)]";
  }

  if (title.tone === "warm") {
    return "border-warn/35 bg-warn/10 text-warn shadow-[0_14px_30px_-26px_rgba(235,133,38,0.85)]";
  }

  if (title.tone === "complete") {
    return "border-ink/25 bg-slate-100 text-ink shadow-[0_14px_30px_-26px_rgba(23,32,51,0.55)]";
  }

  if (title.tone === "ink") {
    return "border-slate-300 bg-field text-ink";
  }

  return "border-accent/30 bg-accentSoft text-accent shadow-[0_14px_30px_-26px_rgba(69,104,245,0.85)]";
}

function getTitleProgressClassName(title: EmployeeTitle) {
  if (!title.achieved) {
    return "bg-slate-400";
  }

  if (title.tone === "danger") {
    return "bg-danger";
  }

  if (title.tone === "warm") {
    return "bg-warn";
  }

  if (title.tone === "complete" || title.tone === "ink") {
    return "bg-ink";
  }

  return "bg-accent";
}

function getCalendarColumnWidths(
  days: Array<{ date: string; isCurrentMonth: boolean; key: string }>,
  recordsByDate: Map<string, TeamAttendanceRecord[]>,
) {
  const widths = Array.from({ length: 7 }, () => CALENDAR_COLUMN_MIN_WIDTH);

  for (const day of days) {
    const dayOfWeek = dateStringToUtcDate(day.date).getUTCDay();
    const dayLabelWidth =
      estimateCalendarTextWidth(String(Number(day.date.slice(8, 10)))) +
      CALENDAR_CELL_INLINE_PADDING * 2;
    widths[dayOfWeek] = Math.max(widths[dayOfWeek], dayLabelWidth);

    for (const record of recordsByDate.get(day.date) ?? []) {
      widths[dayOfWeek] = Math.max(
        widths[dayOfWeek],
        estimateCalendarRecordWidth(record) + CALENDAR_CELL_INLINE_PADDING,
      );
    }
  }

  return widths.map((width) => Math.ceil(width));
}

function estimateCalendarRecordWidth(record: TeamAttendanceRecord) {
  const commentWidth = record.commentCount
    ? estimateCalendarTextWidth(`💬${record.commentCount}`)
    : 0;
  const commentGap = record.commentCount ? 4 : 0;

  return (
    estimateCalendarTextWidth(record.employeeName, { isBold: true }) +
    estimateCalendarTextWidth(formatKstTime(record.checkInAt)) +
    commentWidth +
    commentGap +
    4 +
    CALENDAR_RECORD_INLINE_PADDING
  );
}

function estimateCalendarTextWidth(value: string, options: { isBold?: boolean } = {}) {
  let width = 0;

  for (const character of value) {
    if (/[\uAC00-\uD7A3]/.test(character)) {
      width += 12;
    } else if (/[0-9]/.test(character)) {
      width += 6.6;
    } else if (character === ":") {
      width += 3.8;
    } else if (character === " ") {
      width += 3.5;
    } else if (character === "💬") {
      width += 14;
    } else {
      width += 7;
    }
  }

  return options.isBold ? width + 1.5 : width;
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
      className={`flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded border px-1.5 text-left text-xs leading-none transition hover:border-accent/50 hover:bg-white hover:shadow-md hover:ring-1 hover:ring-inset hover:ring-accent/20 ${markerClassName}`}
      onFocus={() => onPrefetch(record)}
      onClick={() => onSelect(record)}
      onPointerEnter={() => onPrefetch(record)}
      title={`${record.employeeName}${isMe ? " (나)" : ""} ${timeRangeText}${durationText ? ` · ${durationText}` : ""}${marker ? ` · ${marker.title}` : ""}${record.commentCount ? ` · 댓글 ${record.commentCount}개` : ""}`}
      type="button"
    >
      <span className="shrink-0 whitespace-nowrap font-bold">{record.employeeName}</span>
      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
        {record.commentCount ? (
          <span
            aria-label={`댓글 ${record.commentCount}개`}
            className="shrink-0 text-xs font-bold opacity-70"
            title={`댓글 ${record.commentCount}개`}
          >
            💬{record.commentCount}
          </span>
        ) : null}
        <span className="shrink-0 text-xs font-semibold opacity-80">{checkInText}</span>
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
  canEdit,
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
  canEdit: boolean;
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
        <div className="flex items-center justify-center gap-2 pb-5 pt-8 text-sm font-semibold text-muted">
          <Spinner />
          오늘 업무를 불러오는 중
        </div>
      ) : null}

      {!isLoading && workLog ? (
        <div className="space-y-3 pt-3">
          <TaskSection
            canEdit={canEdit}
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

          {canEdit ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              className="field min-h-20 resize-none text-sm leading-relaxed"
              maxLength={TASK_DRAFT_MAX_LENGTH}
              onChange={(event) => onTaskTextChange(normalizeTaskDraft(event.target.value))}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  onAddTask();
                }
              }}
              placeholder="할 일 또는 한 일을 입력하세요"
              rows={3}
              value={newTaskText}
            />
            <button
              className="primary-button min-h-20 px-4 py-2 text-sm"
              disabled={!newTaskText.trim()}
              onClick={onAddTask}
              type="button"
            >
              추가
            </button>
          </div> : null}
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
  canComment,
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
  onCopyLink,
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
  canComment: boolean;
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
  onCopyLink: () => void;
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
  const holidayName = getPublicHolidayName(record.workDate);
  const dateToneClassName = getDateToneTextClass(record.workDate);

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
            <p className={`text-xs font-semibold ${dateToneClassName}`}>
              {formatWorkDateWithWeekday(record.workDate)}
              {holidayName ? (
                <span className="ml-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
                  {holidayName}
                </span>
              ) : null}
            </p>
            <h3 className="truncate text-lg font-bold text-ink">
              {record.employeeName} 업무 기록
            </h3>
            <p className="mt-1 text-xs text-muted">
              {formatKstTimeRange(record)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div>
              <button
                className="rounded border border-line px-2 py-1 text-sm font-bold text-muted hover:bg-field hover:text-ink"
                onClick={onCopyLink}
                type="button"
              >
                공유
              </button>
            </div>
            <button
            className="rounded px-2 py-1 text-sm font-bold text-muted hover:bg-field hover:text-ink"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
          </div>
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
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <textarea
                      className="field min-h-20 resize-none text-sm leading-relaxed"
                      maxLength={TASK_DRAFT_MAX_LENGTH}
                      onChange={(event) => onTaskTextChange(normalizeTaskDraft(event.target.value))}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                          event.preventDefault();
                          onAddTask();
                        }
                      }}
                      placeholder="할 일을 입력하세요"
                      rows={3}
                      value={newTaskText}
                    />
                    <button
                      className="primary-button min-h-20 px-4 py-2 text-sm"
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
                      const isMine = canComment && comment.authorEmployeeId === currentEmployeeId;
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
                                maxLength={COMMENT_DRAFT_MAX_LENGTH}
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
                              <div className="mt-1 break-words text-ink">
                                <MarkdownText text={comment.text} />
                              </div>
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
                {canComment ? <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <textarea
                    className="field min-h-20 resize-y text-sm leading-relaxed"
                    disabled={isCommentSaving}
                    maxLength={COMMENT_DRAFT_MAX_LENGTH}
                    onChange={(event) => onCommentTextChange(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        onAddComment();
                      }
                    }}
                    placeholder="댓글을 입력하세요. Markdown도 사용할 수 있어요."
                    rows={3}
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
                </div> : null}
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
                    <LinkifiedText text={task.text} />
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

function formatWorkDateWithWeekday(value: string) {
  const dayOfWeek = dateStringToUtcDate(value).getUTCDay();
  return `${value} (${weekdayLabels[dayOfWeek] ?? ""})`;
}

function isDateInRange(date: string, range: { startDate: string; endDate: string }) {
  return date >= range.startDate && date <= range.endDate;
}

function getDateToneTextClass(date: string) {
  if (getPublicHolidayName(date)) {
    return "text-danger";
  }

  const dayOfWeek = dateStringToUtcDate(date).getUTCDay();
  return weekendTextClass(dayOfWeek) || "text-muted";
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

function getPublicHolidayName(date: string) {
  return publicHolidayNamesByDate[date] ?? fixedPublicHolidayNames[date.slice(5)] ?? "";
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

function formatWorkingSinceLabel(minutes: number) {
  return `${formatWorkedDuration(Math.max(0, minutes))}째`;
}

function getWorkDurationHeatClassName(minutes: number) {
  if (minutes >= 12 * 60) {
    return "work-heat-fire";
  }

  if (minutes >= 10 * 60) {
    return "work-heat-hot";
  }

  if (minutes >= 8 * 60) {
    return "work-heat-warm";
  }

  if (minutes >= 4 * 60) {
    return "work-heat-steady";
  }

  return "work-heat-fresh";
}

function getGreetingEvent(actionLabel: string): GreetingEvent {
  if (actionLabel === "출근 처리 중") {
    return "checkIn";
  }

  if (actionLabel === "퇴근 처리 중") {
    return "checkOut";
  }

  if (actionLabel === "퇴근 취소 중") {
    return "cancelCheckOut";
  }

  return "visit";
}

function normalizeTaskDraft(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, TASK_DRAFT_MAX_LINES)
    .join("\n")
    .slice(0, TASK_DRAFT_MAX_LENGTH);
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

function getCommentNotificationLastSeen(employeeId: string) {
  const key = getCommentNotificationStorageKey(employeeId);
  const storedValue = localStorage.getItem(key);
  if (storedValue && Number.isFinite(Date.parse(storedValue))) {
    return storedValue;
  }

  return new Date(Date.now() - COMMENT_NOTIFICATION_INITIAL_LOOKBACK_MS).toISOString();
}

function setCommentNotificationLastSeen(employeeId: string, value: string) {
  if (!Number.isFinite(Date.parse(value))) return;
  localStorage.setItem(getCommentNotificationStorageKey(employeeId), value);
}

function getCommentNotificationStorageKey(employeeId: string) {
  return `${COMMENT_NOTIFICATION_LAST_SEEN_KEY}:${encodeURIComponent(employeeId)}`;
}

function resolveSharedWorkLogRecord(
  target: { employeeId: string; workDate: string },
  context: {
    employee: Employee;
    records: AttendanceRecord[];
    status: StatusResponse | null;
    teamMonth: TeamMonthAttendance | null;
    teamRecords: TeamAttendanceRecord[];
  },
): TeamAttendanceRecord {
  const teamRecord =
    context.teamRecords.find(
      (record) => record.employeeId === target.employeeId && record.workDate === target.workDate,
    ) ??
    context.teamMonth?.records.find(
      (record) => record.employeeId === target.employeeId && record.workDate === target.workDate,
    );
  if (teamRecord) {
    return teamRecord;
  }

  const ownRecord =
    target.employeeId === context.employee.id
      ? context.records.find((record) => record.workDate === target.workDate) ??
        (context.status?.todayRecord?.workDate === target.workDate
          ? context.status.todayRecord
          : null)
      : null;
  if (ownRecord) {
    return {
      employeeId: context.employee.id,
      employeeNo: context.employee.employeeNo,
      employeeName: context.employee.name,
      workDate: ownRecord.workDate,
      checkInAt: ownRecord.checkInAt,
      checkOutAt: ownRecord.checkOutAt,
      workType: ownRecord.workType,
      note: ownRecord.note,
    };
  }

  const isCurrentEmployee = target.employeeId === context.employee.id;
  return {
    employeeId: target.employeeId,
    employeeNo: isCurrentEmployee ? context.employee.employeeNo : "",
    employeeName: isCurrentEmployee ? context.employee.name : "업무 기록",
    workDate: target.workDate,
    checkInAt: null,
    checkOutAt: null,
    workType: "office",
    note: null,
  };
}

async function copyTextToClipboard(text: string) {
  if (copyTextWithSelection(text)) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("copy failed");
}

function copyTextWithSelection(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function splitTextIntoLinks(text: string) {
  const parts: Array<{ text: string; href?: string }> = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index) });
    }

    const { href, suffix } = splitTrailingLinkPunctuation(match[0]);
    parts.push({ text: href, href });
    if (suffix) {
      parts.push({ text: suffix });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ text }];
}

function splitTrailingLinkPunctuation(value: string) {
  let href = value;
  let suffix = "";
  while (href.length > "https://".length && /[.,!?;:)\]}。！？、，]$/.test(href)) {
    suffix = href[href.length - 1] + suffix;
    href = href.slice(0, -1);
  }

  return { href, suffix };
}

type MarkdownBlock =
  | { type: "paragraph"; lines: string[] }
  | {
      type: "list";
      items: Array<{ checked: boolean | null; level: number; text: string }>;
      ordered: boolean;
    }
  | { type: "quote"; lines: string[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "code"; lines: string[] };

type InlineMarkdownPart =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strike"; text: string }
  | { kind: "link"; text: string; href: string };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const paragraphLines: string[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let codeLines: string[] | null = null;
  let listBlock: {
    items: Array<{ checked: boolean | null; level: number; text: string }>;
    ordered: boolean;
  } | null = null;
  let quoteLines: string[] | null = null;

  function flushParagraph() {
    if (!paragraphLines.length) return;
    blocks.push({ type: "paragraph", lines: [...paragraphLines] });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!listBlock) return;
    blocks.push({ type: "list", items: listBlock.items, ordered: listBlock.ordered });
    listBlock = null;
  }

  function flushQuote() {
    if (!quoteLines) return;
    blocks.push({ type: "quote", lines: quoteLines });
    quoteLines = null;
  }

  function flushTextBlocks() {
    flushParagraph();
    flushList();
    flushQuote();
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (line.trim().startsWith("```")) {
      if (codeLines) {
        blocks.push({ type: "code", lines: codeLines });
        codeLines = null;
      } else {
        flushTextBlocks();
        codeLines = [];
      }
      continue;
    }

    if (codeLines) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushTextBlocks();
      continue;
    }

    const unorderedMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    const quoteMatch = line.match(/^\s*>\s?(.+)$/);
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      flushTextBlocks();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      flushQuote();
      const ordered = Boolean(orderedMatch);
      if (!listBlock || listBlock.ordered !== ordered) {
        flushList();
        listBlock = { items: [], ordered };
      }
      listBlock.items.push(
        parseMarkdownListItem({
          indent: unorderedMatch?.[1] ?? orderedMatch?.[1] ?? "",
          text: unorderedMatch?.[2] ?? orderedMatch?.[2] ?? "",
        }),
      );
      continue;
    }

    if (quoteMatch) {
      flushParagraph();
      flushList();
      quoteLines = [...(quoteLines ?? []), quoteMatch[1]];
      continue;
    }

    flushList();
    flushQuote();
    paragraphLines.push(line);
  }

  if (codeLines) {
    blocks.push({ type: "code", lines: codeLines });
  }
  flushTextBlocks();

  return blocks.length ? blocks : [{ type: "paragraph", lines: [""] }];
}

function splitInlineMarkdown(text: string): InlineMarkdownPart[] {
  const parts: InlineMarkdownPart[] = [];
  const tokenPattern =
    /(\*\*[^*\n][\s\S]*?\*\*|~~[^~\n][\s\S]*?~~|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>"']+|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push({ kind: "bold", text: token.slice(2, -2) });
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      parts.push({ kind: "strike", text: token.slice(2, -2) });
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push({ kind: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const labelEnd = token.indexOf("](");
      parts.push({
        kind: "link",
        text: token.slice(1, labelEnd),
        href: token.slice(labelEnd + 2, -1),
      });
    } else if (token.startsWith("http")) {
      const { href, suffix } = splitTrailingLinkPunctuation(token);
      parts.push({ kind: "link", text: href, href });
      if (suffix) {
        parts.push({ kind: "text", text: suffix });
      }
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push({ kind: "italic", text: token.slice(1, -1) });
    } else {
      parts.push({ kind: "text", text: token });
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push({ kind: "text", text: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ kind: "text", text }];
}

function parseMarkdownListItem({ indent, text }: { indent: string; text: string }) {
  const taskMatch = text.match(/^\[([ xX])]\s+(.+)$/);
  const level = getMarkdownListLevel(indent);
  if (!taskMatch) {
    return { checked: null, level, text };
  }

  return {
    checked: taskMatch[1].toLowerCase() === "x",
    level,
    text: taskMatch[2],
  };
}

function getMarkdownListLevel(indent: string) {
  const spaces = indent.replace(/\t/g, "  ").length;
  return Math.min(4, Math.floor(spaces / 2));
}

function getMarkdownHeadingClassName(level: number) {
  if (level <= 1) return "text-base font-extrabold";
  if (level === 2) return "text-[15px] font-extrabold";
  return "text-sm font-bold";
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
      order: getFiniteNumber(task.order) ?? index,
      completedOrder: task.done ? getFiniteNumber(task.completedOrder) : null,
    }))
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.done
          ? getDoneTaskSortOrder(a) - getDoneTaskSortOrder(b)
          : (a.order ?? 0) - (b.order ?? 0)) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

function getNextTaskOrder(tasks: WorkTask[]) {
  return (
    tasks.reduce((maxOrder, task) => {
      const order = getFiniteNumber(task.order);
      return order === null ? maxOrder : Math.max(maxOrder, order);
    }, -1) + 1
  );
}

function getNextCompletedOrder(tasks: WorkTask[]) {
  return (
    tasks.reduce((maxOrder, task) => {
      return task.done ? Math.max(maxOrder, getDoneTaskSortOrder(task)) : maxOrder;
    }, -1) + 1
  );
}

function applyManualTaskOrder(tasks: WorkTask[]) {
  let nextOpenOrder = 0;
  let nextCompletedOrder = 0;

  return tasks.map((task) => {
    if (task.done) {
      return {
        ...task,
        completedOrder: nextCompletedOrder++,
      };
    }

    return {
      ...task,
      order: nextOpenOrder++,
      completedOrder: null,
    };
  });
}

function getRestoredOpenOrder(taskToRestore: WorkTask, tasks: WorkTask[]) {
  const currentOrder = getFiniteNumber(taskToRestore.order);
  if (getFiniteNumber(taskToRestore.completedOrder) !== null) {
    return currentOrder ?? getNextTaskOrder(tasks);
  }

  const previousOrders: number[] = [];
  const nextOrders: number[] = [];
  for (const task of tasks) {
    if (task.id === taskToRestore.id || task.done) {
      continue;
    }

    const order = getFiniteNumber(task.order);
    if (order === null) {
      continue;
    }

    if (compareTaskCreatedAt(task, taskToRestore) < 0) {
      previousOrders.push(order);
    } else {
      nextOrders.push(order);
    }
  }

  const previousOrder = previousOrders.length ? Math.max(...previousOrders) : null;
  const nextOrder = nextOrders.length ? Math.min(...nextOrders) : null;
  if (previousOrder !== null && nextOrder !== null) {
    return previousOrder < nextOrder ? (previousOrder + nextOrder) / 2 : currentOrder ?? nextOrder;
  }

  if (previousOrder !== null) {
    return previousOrder + 1;
  }

  if (nextOrder !== null) {
    return nextOrder - 1;
  }

  return currentOrder ?? 0;
}

function compareTaskCreatedAt(a: WorkTask, b: WorkTask) {
  const createdCompare = a.createdAt.localeCompare(b.createdAt);
  return createdCompare || a.id.localeCompare(b.id);
}

function getDoneTaskSortOrder(task: WorkTask) {
  return getFiniteNumber(task.completedOrder) ?? getFiniteNumber(task.order) ?? 0;
}

function getFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  return withTaskOrder(applyManualTaskOrder(reorderedTasks));
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
