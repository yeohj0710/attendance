import { getDb, nowTimestamp, timestampToIso, toTimestamp } from "@/lib/db";
import { badRequest, conflict } from "@/lib/http";
import { getWorkDateString, isValidDateString, parseKstDateTimeInput } from "@/lib/time";
import {
  ensureCarryoverWorkLog,
  getWorkLogCommentAuthorStats,
  getWorkLogSummariesForEmployee,
  getWorkLogSummariesForRange,
  getWorkLogsForDate,
  type WorkLogSummary,
} from "@/lib/work-log";
import type { AuthContext } from "@/lib/auth";

export type WorkType = "office" | "remote" | "offsite" | "business_trip";

export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInIp: string | null;
  checkOutIp: string | null;
  checkInDeviceId?: string | null;
  checkOutDeviceId?: string | null;
  workType: WorkType;
  note: string | null;
  source: "employee" | "admin";
  createdAt: string;
  updatedAt: string;
};

export type AdminAttendanceInput = {
  employeeId: string;
  workDate: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workType: WorkType;
  note?: string | null;
  reason?: string | null;
};

export type EmployeeTitleProfile = {
  generatedAt: string;
    stats: {
      activeMonths: number;
      attendanceDays: number;
      bestStreak: number;
      checkoutDays: number;
      commentGivenCount: number;
      commentCount: number;
      commentedPeerCount: number;
      commentedPeerDays: number;
      completedTasks: number;
      currentStreak: number;
      christmasAttendanceDays: number;
      dawnCheckOutDays: number;
      doubleDateAttendanceDays: number;
      earlyCheckInDays: number;
      eveningCheckInDays: number;
      firstRecordDate: string | null;
      fridayCheckOutDays: number;
      heavyDoneDays: number;
      holidayLongWorkDays: number;
      latestRecordDate: string | null;
      lateCheckInDays: number;
      luckyDropDays: number;
      mondayAttendanceDays: number;
      monthEndCheckOutDays: number;
      monthStartAttendanceDays: number;
      nextDayCheckOutDays: number;
      nightCheckOutDays: number;
      perfectTaskDays: number;
      publicHolidayAttendanceDays: number;
      sameNumberClockDays: number;
      seollalAttendanceDays: number;
      saturdayAttendanceDays: number;
      substituteHolidayAttendanceDays: number;
      sundayAttendanceDays: number;
      chuseokAttendanceDays: number;
      staleTaskItemCount: number;
      staleTaskMaxDays: number;
      tasklessAttendanceDays: number;
      tenHourDays: number;
      totalTasks: number;
      totalWorkedMinutes: number;
      twelveHourDays: number;
      weekendAttendanceDays: number;
      weekendLongWorkDays: number;
    };
  };

export type CompanyTitleProfile = EmployeeTitleProfile & {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
};

type AttendanceData = {
  employee_id: string;
  work_date: string;
  check_in_at?: unknown;
  check_out_at?: unknown;
  check_in_ip?: string | null;
  check_out_ip?: string | null;
  check_in_session_id?: string | null;
  check_out_session_id?: string | null;
  work_type: WorkType;
  note?: string | null;
  source: "employee" | "admin";
  created_by?: string | null;
  updated_by?: string | null;
  created_at: unknown;
  updated_at: unknown;
};

type EmployeeData = {
  employee_no?: string;
  name?: string;
  is_active?: boolean;
};

type SessionData = {
  device_id?: string;
};

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

export async function getAttendanceStatus(auth: AuthContext) {
  await autoCloseForgottenCheckOuts(auth);

  return getAttendanceStatusForEmployee(auth.employee.id);
}

export async function getAttendanceStatusForEmployee(employeeId: string) {
  const today = getWorkDateString();
  const [todayRecord, openRecord] = await Promise.all([
    getRecordByEmployeeDate(employeeId, today),
    getOpenRecord(employeeId),
  ]);
  const hasPreviousOpen =
    openRecord !== null && openRecord.workDate !== today && !openRecord.checkOutAt;

  return {
    kstDate: today,
    todayRecord,
    openRecord,
    canCheckIn: !todayRecord?.checkInAt && !todayRecord?.checkOutAt && !hasPreviousOpen,
    canCheckOut: canCheckOutFromRecords(todayRecord, openRecord),
    hasPreviousOpen,
  };
}

export async function getRecentAttendance(employeeId: string, limit: number) {
  const db = getDb();
  const snapshot = await db
    .collection("attendance_records")
    .where("employee_id", "==", employeeId)
    .get();

  return snapshot.docs
    .map((doc) => mapAttendance(doc.id, doc.data() as AttendanceData))
    .sort((a, b) => b.workDate.localeCompare(a.workDate))
    .slice(0, limit);
}

export async function getEmployeeTitleProfile(employeeId: string): Promise<EmployeeTitleProfile> {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  const [attendanceSnapshot, workLogSummaries, commentAuthorStats] = await Promise.all([
    getDb()
      .collection("attendance_records")
      .where("employee_id", "==", employeeId)
      .get(),
    getWorkLogSummariesForEmployee(employeeId),
    getWorkLogCommentAuthorStats(employeeId),
  ]);

  const attendanceRecords = attendanceSnapshot.docs
    .map((doc) => mapAttendance(doc.id, doc.data() as AttendanceData))
    .sort((a, b) => a.workDate.localeCompare(b.workDate));
  const recordDates = new Set<string>();
  const attendanceDates: string[] = [];
  let totalWorkedMinutes = 0;
  let tenHourDays = 0;
  let twelveHourDays = 0;
  let checkoutDays = 0;
  let christmasAttendanceDays = 0;
  let dawnCheckOutDays = 0;
  let doubleDateAttendanceDays = 0;
  let earlyCheckInDays = 0;
  let eveningCheckInDays = 0;
  let fridayCheckOutDays = 0;
  let holidayLongWorkDays = 0;
  let lateCheckInDays = 0;
  let luckyDropDays = 0;
  let mondayAttendanceDays = 0;
  let monthEndCheckOutDays = 0;
  let monthStartAttendanceDays = 0;
  let nextDayCheckOutDays = 0;
  let nightCheckOutDays = 0;
  let publicHolidayAttendanceDays = 0;
  let sameNumberClockDays = 0;
  let seollalAttendanceDays = 0;
  let saturdayAttendanceDays = 0;
  let substituteHolidayAttendanceDays = 0;
  let sundayAttendanceDays = 0;
  let chuseokAttendanceDays = 0;
  let weekendAttendanceDays = 0;
  let weekendLongWorkDays = 0;

  for (const record of attendanceRecords) {
    const hasAttendance = Boolean(record.checkInAt || record.checkOutAt);
    const dayOfWeek = getDateDayOfWeek(record.workDate);
    const publicHolidayName = getPublicHolidayName(record.workDate);
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPublicHoliday = Boolean(publicHolidayName);
    const checkInParts = getKstTimeParts(record.checkInAt);
    const checkOutParts = getKstTimeParts(record.checkOutAt);
    const workedMinutes = getRecordWorkedMinutes(record);

    if (hasAttendance) {
      recordDates.add(record.workDate);
      attendanceDates.push(record.workDate);

      if (isWeekend) {
        weekendAttendanceDays += 1;
      }
      if (dayOfWeek === 0) {
        sundayAttendanceDays += 1;
      }
      if (dayOfWeek === 1) {
        mondayAttendanceDays += 1;
      }
      if (dayOfWeek === 6) {
        saturdayAttendanceDays += 1;
      }
      if (isPublicHoliday) {
        publicHolidayAttendanceDays += 1;
      }
      if (record.workDate.slice(5) === "12-25") {
        christmasAttendanceDays += 1;
      }
      if (publicHolidayName.includes("설")) {
        seollalAttendanceDays += 1;
      }
      if (publicHolidayName.includes("추석")) {
        chuseokAttendanceDays += 1;
      }
      if (publicHolidayName.includes("대체")) {
        substituteHolidayAttendanceDays += 1;
      }
      if (isDoubleDate(record.workDate)) {
        doubleDateAttendanceDays += 1;
      }
      if (Number(record.workDate.slice(8, 10)) <= 3) {
        monthStartAttendanceDays += 1;
      }
      if (isLuckyTitleDrop(employeeId, record.workDate)) {
        luckyDropDays += 1;
      }
    }
    if (record.checkOutAt) {
      checkoutDays += 1;
      if (dayOfWeek === 5) {
        fridayCheckOutDays += 1;
      }
      if (isMonthEndWindow(record.workDate)) {
        monthEndCheckOutDays += 1;
      }
    }

    if (checkInParts) {
      if (checkInParts.hour < 8) {
        earlyCheckInDays += 1;
      }
      if (checkInParts.hour >= 13) {
        lateCheckInDays += 1;
      }
      if (checkInParts.hour >= 18) {
        eveningCheckInDays += 1;
      }
      if (isSameNumberClock(checkInParts)) {
        sameNumberClockDays += 1;
      }
    }

    if (checkOutParts) {
      if (checkOutParts.hour < 6) {
        dawnCheckOutDays += 1;
      }
      if (checkOutParts.hour >= 22 || checkOutParts.hour < 6) {
        nightCheckOutDays += 1;
      }
      if (checkOutParts.date > record.workDate) {
        nextDayCheckOutDays += 1;
      }
      if (isSameNumberClock(checkOutParts)) {
        sameNumberClockDays += 1;
      }
    }

    if (workedMinutes !== null) {
      totalWorkedMinutes += workedMinutes;
      if (workedMinutes >= 10 * 60) {
        tenHourDays += 1;
      }
      if (workedMinutes >= 12 * 60) {
        twelveHourDays += 1;
      }
      if (isPublicHoliday && workedMinutes >= 10 * 60) {
        holidayLongWorkDays += 1;
      }
      if (isWeekend && workedMinutes >= 8 * 60) {
        weekendLongWorkDays += 1;
      }
    }
  }

  let totalTasks = 0;
  let completedTasks = 0;
  let heavyDoneDays = 0;
  let perfectTaskDays = 0;
  let commentCount = 0;
  const taskCountByDate = new Map<string, number>();

  for (const summary of workLogSummaries) {
    recordDates.add(summary.workDate);
    taskCountByDate.set(summary.workDate, summary.taskCount);
    totalTasks += summary.taskCount;
    completedTasks += summary.doneCount;
    commentCount += summary.commentCount;
    if (summary.doneCount >= 5) {
      heavyDoneDays += 1;
    }
    if (summary.taskCount >= 3 && summary.doneCount === summary.taskCount) {
      perfectTaskDays += 1;
    }
  }

  const sortedRecordDates = [...recordDates].sort();
  const activeMonths = new Set(sortedRecordDates.map((date) => date.slice(0, 7))).size;
  const staleTaskStats = getStaleTaskStats(workLogSummaries);
  const tasklessAttendanceDays = [...new Set(attendanceDates)].filter(
    (workDate) => (taskCountByDate.get(workDate) ?? 0) === 0,
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      activeMonths,
      attendanceDays: new Set(attendanceDates).size,
      bestStreak: getBestAttendanceStreak(attendanceDates),
      checkoutDays,
      commentCount,
      commentGivenCount: commentAuthorStats.commentGivenCount,
      commentedPeerCount: commentAuthorStats.commentedPeerCount,
      commentedPeerDays: commentAuthorStats.commentedPeerDays,
      completedTasks,
      currentStreak: getCurrentAttendanceStreak(attendanceDates, getWorkDateString()),
      christmasAttendanceDays,
      dawnCheckOutDays,
      doubleDateAttendanceDays,
      earlyCheckInDays,
      eveningCheckInDays,
      firstRecordDate: sortedRecordDates[0] ?? null,
      fridayCheckOutDays,
      heavyDoneDays,
      holidayLongWorkDays,
      latestRecordDate: sortedRecordDates[sortedRecordDates.length - 1] ?? null,
      lateCheckInDays,
      luckyDropDays,
      mondayAttendanceDays,
      monthEndCheckOutDays,
      monthStartAttendanceDays,
      nextDayCheckOutDays,
      nightCheckOutDays,
      perfectTaskDays,
      publicHolidayAttendanceDays,
      sameNumberClockDays,
      seollalAttendanceDays,
      saturdayAttendanceDays,
      substituteHolidayAttendanceDays,
      sundayAttendanceDays,
      chuseokAttendanceDays,
      staleTaskItemCount: staleTaskStats.itemCount,
      staleTaskMaxDays: staleTaskStats.maxDays,
      tasklessAttendanceDays,
      tenHourDays,
      totalTasks,
      totalWorkedMinutes,
      twelveHourDays,
      weekendAttendanceDays,
      weekendLongWorkDays,
    },
  };
}

function getStaleTaskStats(workLogSummaries: WorkLogSummary[]) {
  const staleTaskKeys = new Set<string>();
  let maxDays = 0;
  let streakByTask = new Map<string, number>();

  for (const summary of [...workLogSummaries].sort((a, b) => a.workDate.localeCompare(b.workDate))) {
    const openTaskKeys = new Set(
      summary.tasks
        .filter((task) => !task.done)
        .map((task) => getStableTaskKey(task.text))
        .filter(Boolean),
    );
    const nextStreakByTask = new Map<string, number>();

    for (const taskKey of openTaskKeys) {
      const streak = (streakByTask.get(taskKey) ?? 0) + 1;
      nextStreakByTask.set(taskKey, streak);
      maxDays = Math.max(maxDays, streak);
      if (streak >= 3) {
        staleTaskKeys.add(taskKey);
      }
    }

    streakByTask = nextStreakByTask;
  }

  return {
    itemCount: staleTaskKeys.size,
    maxDays,
  };
}

function getStableTaskKey(text: string) {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function getCompanyTitleProfiles(): Promise<CompanyTitleProfile[]> {
  const snapshot = await getDb().collection("employees").where("is_active", "==", true).get();
  const employees = snapshot.docs
    .map((doc) => {
      const employee = doc.data() as EmployeeData;
      return {
        employeeId: doc.id,
        employeeNo: employee.employee_no ?? "",
        employeeName: employee.name ?? "",
      };
    })
    .filter(
      (employee) =>
        !formerTeamMemberNames.has(employee.employeeName.normalize("NFC").replace(/\s+/g, "")),
    )
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  return Promise.all(
    employees.map(async (employee) => ({
      ...employee,
      ...(await getEmployeeTitleProfile(employee.employeeId)),
    })),
  );
}

export async function getTeamTodayAttendance() {
  const db = getDb();
  const today = getWorkDateString();
  const [employeesSnapshot, attendanceSnapshot, workLogs] = await Promise.all([
    db.collection("employees").where("is_active", "==", true).get(),
    db.collection("attendance_records").where("work_date", "==", today).get(),
    getWorkLogsForDate(today),
  ]);

  const attendanceByEmployee = new Map(
    attendanceSnapshot.docs.map((doc) => {
      const record = mapAttendance(doc.id, doc.data() as AttendanceData);
      return [record.employeeId, record];
    }),
  );
  const workLogByEmployee = new Map(workLogs.map((workLog) => [workLog.employeeId, workLog]));

  return employeesSnapshot.docs
    .map((doc) => {
      const employee = doc.data() as EmployeeData;
      const record = attendanceByEmployee.get(doc.id);

      return {
        employeeId: doc.id,
        employeeNo: employee.employee_no ?? "",
        employeeName: employee.name ?? "",
        workDate: today,
        checkInAt: record?.checkInAt ?? null,
        checkOutAt: record?.checkOutAt ?? null,
        workType: record?.workType ?? "office",
        note: record?.note ?? null,
        taskCount: workLogByEmployee.get(doc.id)?.taskCount ?? 0,
        doneCount: workLogByEmployee.get(doc.id)?.doneCount ?? 0,
        commentCount: workLogByEmployee.get(doc.id)?.commentCount ?? 0,
        tasks: workLogByEmployee.get(doc.id)?.tasks ?? [],
      };
    })
    .filter(
      (record) =>
        Boolean(record.checkInAt) &&
        !formerTeamMemberNames.has(record.employeeName.normalize("NFC").replace(/\s+/g, "")),
    )
    .sort((a, b) => {
      const statusCompare = teamStatusRank(a) - teamStatusRank(b);
      return statusCompare || a.employeeName.localeCompare(b.employeeName);
    });
}

export async function getTeamMonthAttendance(monthValue?: string | null) {
  const db = getDb();
  const { startDate, endDate, month } = getKstMonthRange(monthValue);
  const { calendarStartDate, calendarEndDate } = getCalendarRange(startDate, endDate);
  const [employeesSnapshot, attendanceSnapshot] = await Promise.all([
    db.collection("employees").where("is_active", "==", true).get(),
    db
      .collection("attendance_records")
      .where("work_date", ">=", calendarStartDate)
      .where("work_date", "<=", calendarEndDate)
      .get(),
  ]);
  const workLogSummaries = await getWorkLogSummariesForRange(calendarStartDate, calendarEndDate);

  const employees = new Map(
    employeesSnapshot.docs.map((doc) => [doc.id, doc.data() as EmployeeData]),
  );
  const workSummaryByKey = new Map(
    workLogSummaries.map((summary) => [
      `${summary.employeeId}:${summary.workDate}`,
      summary,
    ]),
  );

  const records = attendanceSnapshot.docs
    .map((doc) => mapAttendance(doc.id, doc.data() as AttendanceData, employees))
    .filter((record) => employees.has(record.employeeId))
    .map((record) => ({
      employeeId: record.employeeId,
      employeeNo: record.employeeNo ?? "",
      employeeName: record.employeeName ?? "",
      workDate: record.workDate,
      checkInAt: record.checkInAt,
      checkOutAt: record.checkOutAt,
      workType: record.workType,
      note: record.note,
      taskCount: workSummaryByKey.get(`${record.employeeId}:${record.workDate}`)?.taskCount ?? 0,
      doneCount: workSummaryByKey.get(`${record.employeeId}:${record.workDate}`)?.doneCount ?? 0,
      commentCount: workSummaryByKey.get(`${record.employeeId}:${record.workDate}`)?.commentCount ?? 0,
    }))
    .sort(
      (a, b) =>
        a.workDate.localeCompare(b.workDate) ||
        a.employeeName.localeCompare(b.employeeName),
    );

  return {
    month,
    startDate,
    endDate,
    calendarStartDate,
    calendarEndDate,
    records,
  };
}

export async function checkIn(auth: AuthContext, ip: string | null) {
  const db = getDb();
  const today = getWorkDateString();
  const status = await getAttendanceStatus(auth);

  if (status.hasPreviousOpen) {
    conflict("이전 출근 기록에 퇴근이 없어 새 출근을 할 수 없습니다. 관리자에게 수정 요청하세요.");
  }

  if (status.todayRecord?.checkInAt) {
    conflict("이미 오늘 출근 처리되었습니다.");
  }

  if (status.todayRecord?.checkOutAt) {
    conflict("이미 퇴근 처리된 기록이 있어 출근 처리할 수 없습니다. 퇴근 취소 후 다시 시도하세요.");
  }

  const ref = db.collection("attendance_records").doc(attendanceDocId(auth.employee.id, today));
  const now = nowTimestamp();
  const data: AttendanceData = {
    employee_id: auth.employee.id,
    work_date: today,
    check_in_at: now,
    check_out_at: null,
    check_in_ip: ip,
    check_out_ip: null,
    check_in_session_id: auth.session.id,
    check_out_session_id: null,
    work_type: "office",
    note: null,
    source: "employee",
    created_by: auth.employee.id,
    updated_by: auth.employee.id,
    created_at: now,
    updated_at: now,
  };

  await ref.set(data, { merge: true });
  await ensureCarryoverWorkLog(auth.employee.id, today);
  return mapAttendance(ref.id, data);
}

export async function checkOut(auth: AuthContext, ip: string | null) {
  const db = getDb();
  const workDate = getWorkDateString();
  const openRecord = await getOpenRecord(auth.employee.id);
  const todayRecord =
    openRecord?.workDate === workDate
      ? openRecord
      : await getRecordByEmployeeDate(auth.employee.id, workDate);
  const targetRecord = openRecord ?? todayRecord;
  const now = nowTimestamp();

  if (todayRecord?.checkOutAt) {
    conflict("이미 퇴근 처리되었습니다. 다시 퇴근하려면 퇴근 취소 후 시도하세요.");
  }

  if (!targetRecord) {
    const ref = db.collection("attendance_records").doc(attendanceDocId(auth.employee.id, workDate));
    const data: AttendanceData = {
      employee_id: auth.employee.id,
      work_date: workDate,
      check_in_at: null,
      check_out_at: now,
      check_in_ip: null,
      check_out_ip: ip,
      check_in_session_id: null,
      check_out_session_id: auth.session.id,
      work_type: "office",
      note: "출근 미기록",
      source: "employee",
      created_by: auth.employee.id,
      updated_by: auth.employee.id,
      created_at: now,
      updated_at: now,
    };

    await ref.set(data);
    return mapAttendance(ref.id, data);
  }

  const ref = db.collection("attendance_records").doc(targetRecord.id);
  await ref.update({
    check_out_at: now,
    check_out_ip: ip,
    check_out_session_id: auth.session.id,
    updated_by: auth.employee.id,
    updated_at: nowTimestamp(),
  });

  const updated = await ref.get();
  return mapAttendance(updated.id, updated.data() as AttendanceData);
}

export async function cancelCheckOut(auth: AuthContext) {
  const db = getDb();
  const workDate = getWorkDateString();
  const record = await getRecordByEmployeeDate(auth.employee.id, workDate);

  if (!record?.checkOutAt) {
    conflict("취소할 퇴근 기록이 없습니다.");
  }

  const ref = db.collection("attendance_records").doc(record.id);
  await ref.update({
    check_out_at: null,
    check_out_ip: null,
    check_out_session_id: null,
    updated_by: auth.employee.id,
    updated_at: nowTimestamp(),
  });

  const updated = await ref.get();
  return mapAttendance(updated.id, updated.data() as AttendanceData);
}

export async function listAdminAttendance({
  startDate,
  endDate,
  employeeId,
}: {
  startDate: string | null;
  endDate: string | null;
  employeeId: string | null;
}) {
  await autoCloseForgottenCheckOutsForAll();

  const db = getDb();
  const [attendanceSnapshot, employeesSnapshot, sessionsSnapshot] = await Promise.all([
    db.collection("attendance_records").get(),
    db.collection("employees").get(),
    db.collection("sessions").get(),
  ]);

  const employees = new Map(
    employeesSnapshot.docs.map((doc) => [doc.id, doc.data() as EmployeeData]),
  );
  const sessions = new Map(
    sessionsSnapshot.docs.map((doc) => [doc.id, doc.data() as SessionData]),
  );

  return attendanceSnapshot.docs
    .map((doc) =>
      mapAttendance(
        doc.id,
        doc.data() as AttendanceData,
        employees,
        sessions,
      ),
    )
    .filter((record) => !startDate || record.workDate >= startDate)
    .filter((record) => !endDate || record.workDate <= endDate)
    .filter((record) => !employeeId || record.employeeId === employeeId)
    .sort((a, b) => {
      const dateCompare = b.workDate.localeCompare(a.workDate);
      return dateCompare || (a.employeeName ?? "").localeCompare(b.employeeName ?? "");
    });
}

export async function createAdminAttendance(
  auth: AuthContext,
  input: AdminAttendanceInput,
) {
  const db = getDb();
  const checkInAt = parseKstDateTimeInput(input.checkInAt);
  const checkOutAt = parseKstDateTimeInput(input.checkOutAt);
  validateChronology(checkInAt, checkOutAt);

  const existing = await getRecordByEmployeeDate(input.employeeId, input.workDate);
  if (existing) {
    conflict("이미 해당 날짜 기록이 있습니다. 기존 기록을 수정하세요.");
  }

  const ref = db.collection("attendance_records").doc(attendanceDocId(input.employeeId, input.workDate));
  const now = nowTimestamp();
  const data: AttendanceData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    check_in_at: toTimestamp(checkInAt),
    check_out_at: toTimestamp(checkOutAt),
    check_in_ip: null,
    check_out_ip: null,
    check_in_session_id: null,
    check_out_session_id: null,
    work_type: input.workType,
    note: input.note ?? null,
    source: "admin",
    created_by: auth.employee.id,
    updated_by: auth.employee.id,
    created_at: now,
    updated_at: now,
  };

  await ref.set(data);
  await createAuditLog({
    attendanceRecordId: ref.id,
    action: "create",
    changedBy: auth.employee.id,
    beforeData: null,
    afterData: serializeAttendance(data),
    reason: input.reason ?? null,
  });

  return mapAttendance(ref.id, data);
}

export async function updateAdminAttendance(
  auth: AuthContext,
  id: string,
  input: AdminAttendanceInput,
) {
  const db = getDb();
  const beforeDoc = await db.collection("attendance_records").doc(id).get();
  if (!beforeDoc.exists) {
    conflict("수정할 기록을 찾을 수 없습니다.");
  }

  const before = beforeDoc.data() as AttendanceData;
  const checkInAt = parseKstDateTimeInput(input.checkInAt);
  let checkOutAt = parseKstDateTimeInput(input.checkOutAt);

  if (isEmployeeCheckOutLocked(before)) {
    const originalCheckOutAt = timestampToIso(before.check_out_at);
    if (!isSameMinute(checkOutAt, originalCheckOutAt)) {
      conflict("직원이 퇴근 버튼으로 남긴 퇴근시각은 수정할 수 없습니다.");
    }
    checkOutAt = originalCheckOutAt ? new Date(originalCheckOutAt) : null;
  }

  validateChronology(checkInAt, checkOutAt);

  const targetId = attendanceDocId(input.employeeId, input.workDate);
  if (targetId !== id) {
    const duplicate = await db.collection("attendance_records").doc(targetId).get();
    if (duplicate.exists) {
      conflict("해당 직원의 같은 날짜 기록이 이미 있습니다.");
    }
  }

  const data: AttendanceData = {
    ...before,
    employee_id: input.employeeId,
    work_date: input.workDate,
    check_in_at: toTimestamp(checkInAt),
    check_out_at: toTimestamp(checkOutAt),
    work_type: input.workType,
    note: input.note ?? null,
    source: "admin",
    updated_by: auth.employee.id,
    updated_at: nowTimestamp(),
  };

  const batch = db.batch();
  const currentRef = db.collection("attendance_records").doc(id);
  const targetRef = db.collection("attendance_records").doc(targetId);
  if (targetId !== id) {
    batch.delete(currentRef);
    batch.set(targetRef, data);
  } else {
    batch.set(currentRef, data, { merge: true });
  }
  await batch.commit();

  await createAuditLog({
    attendanceRecordId: targetId,
    action: "update",
    changedBy: auth.employee.id,
    beforeData: serializeAttendance(before),
    afterData: serializeAttendance(data),
    reason: input.reason ?? null,
  });

  return mapAttendance(targetId, data);
}

export function mapAttendance(
  id: string,
  data: AttendanceData,
  employees?: Map<string, EmployeeData>,
  sessions?: Map<string, SessionData>,
): AttendanceRecord {
  const employee = employees?.get(data.employee_id);
  const checkInAt = timestampToIso(data.check_in_at);
  const checkOutAt = timestampToIso(data.check_out_at);

  return {
    id,
    employeeId: data.employee_id,
    employeeNo: employee?.employee_no,
    employeeName: employee?.name,
    workDate: data.work_date,
    checkInAt,
    checkOutAt,
    checkInIp: data.check_in_ip ?? null,
    checkOutIp: data.check_out_ip ?? null,
    checkInDeviceId: data.check_in_session_id
      ? sessions?.get(data.check_in_session_id)?.device_id ?? null
      : null,
    checkOutDeviceId: data.check_out_session_id
      ? sessions?.get(data.check_out_session_id)?.device_id ?? null
      : null,
    workType: data.work_type,
    note: data.note ?? null,
    source: data.source,
    createdAt: timestampToIso(data.created_at) ?? "",
    updatedAt: timestampToIso(data.updated_at) ?? "",
  };
}

async function getRecordByEmployeeDate(employeeId: string, workDate: string) {
  const db = getDb();
  const doc = await db.collection("attendance_records").doc(attendanceDocId(employeeId, workDate)).get();
  return doc.exists ? mapAttendance(doc.id, doc.data() as AttendanceData) : null;
}

async function getOpenRecord(employeeId: string) {
  const records = await getRecentAttendance(employeeId, 500);
  return (
    records.find((record) => record.checkInAt && !record.checkOutAt) ?? null
  );
}

async function autoCloseForgottenCheckOuts(auth: AuthContext) {
  const db = getDb();
  const today = getWorkDateString();
  const snapshot = await db
    .collection("attendance_records")
    .where("employee_id", "==", auth.employee.id)
    .get();
  const batch = db.batch();
  let changed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as AttendanceData;
    if (!data.check_in_at || data.check_out_at || data.work_date >= today) {
      continue;
    }

    batch.update(doc.ref, {
      check_out_at: toTimestamp(getEndOfWorkDate(data.work_date)),
      check_out_ip: "auto",
      check_out_session_id: null,
      updated_by: auth.employee.id,
      updated_at: nowTimestamp(),
    });
    changed += 1;
  }

  if (changed > 0) {
    await batch.commit();
  }
}

async function autoCloseForgottenCheckOutsForAll() {
  const db = getDb();
  const today = getWorkDateString();
  const snapshot = await db.collection("attendance_records").get();
  const batch = db.batch();
  let changed = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as AttendanceData;
    if (!data.check_in_at || data.check_out_at || data.work_date >= today) {
      continue;
    }

    batch.update(doc.ref, {
      check_out_at: toTimestamp(getEndOfWorkDate(data.work_date)),
      check_out_ip: "auto",
      check_out_session_id: null,
      updated_by: null,
      updated_at: nowTimestamp(),
    });
    changed += 1;
  }

  if (changed > 0) {
    await batch.commit();
  }
}

async function createAuditLog({
  attendanceRecordId,
  action,
  changedBy,
  beforeData,
  afterData,
  reason,
}: {
  attendanceRecordId: string;
  action: "create" | "update";
  changedBy: string;
  beforeData: unknown;
  afterData: unknown;
  reason: string | null;
}) {
  const db = getDb();
  await db.collection("attendance_audit_logs").add({
    attendance_record_id: attendanceRecordId,
    action,
    changed_by: changedBy,
    changed_at: nowTimestamp(),
    before_data: beforeData,
    after_data: afterData,
    reason,
  });
}

function attendanceDocId(employeeId: string, workDate: string) {
  return `${employeeId}_${workDate}`;
}

function canCheckOutFromRecords(
  todayRecord: AttendanceRecord | null,
  openRecord: AttendanceRecord | null,
) {
  if (openRecord?.checkInAt && !openRecord.checkOutAt) {
    return true;
  }

  if (!todayRecord) {
    return false;
  }

  return Boolean(todayRecord.checkInAt) && !todayRecord.checkOutAt;
}

function teamStatusRank(record: {
  checkInAt: string | null;
  checkOutAt: string | null;
}) {
  if (record.checkInAt && !record.checkOutAt) {
    return 0;
  }

  if (record.checkOutAt) {
    return 1;
  }

  return 2;
}

function getRecordWorkedMinutes(record: Pick<AttendanceRecord, "checkInAt" | "checkOutAt">) {
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

function getKstTimeParts(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return {
    date: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function getDateDayOfWeek(date: string) {
  return dateStringToUtcDate(date).getUTCDay();
}

function getPublicHolidayName(date: string) {
  return publicHolidayNamesByDate[date] ?? fixedPublicHolidayNames[date.slice(5)] ?? "";
}

function isDoubleDate(date: string) {
  return date.slice(5, 7) === date.slice(8, 10);
}

function isMonthEndWindow(date: string) {
  const day = Number(date.slice(8, 10));
  const monthEnd = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  return day >= Math.max(1, monthEnd - 2);
}

function isSameNumberClock(parts: { hour: number; minute: number }) {
  return parts.hour === parts.minute && parts.hour >= 1 && parts.hour <= 23;
}

function isLuckyTitleDrop(employeeId: string, workDate: string) {
  return stableHash(`${employeeId}:${workDate}:title-drop`) % 29 === 0;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getCurrentAttendanceStreak(dates: string[], todayDate: string) {
  const attendanceDates = new Set(dates);
  if (attendanceDates.size === 0) {
    return 0;
  }

  const sortedDates = [...attendanceDates].sort();
  const latestDate = sortedDates[sortedDates.length - 1];
  let cursor = attendanceDates.has(todayDate) || todayDate <= latestDate ? todayDate : latestDate;
  if (!attendanceDates.has(cursor)) {
    cursor = latestDate;
  }

  let streak = 0;
  while (attendanceDates.has(cursor)) {
    streak += 1;
    cursor = addDateString(cursor, -1);
  }

  return streak;
}

function getBestAttendanceStreak(dates: string[]) {
  const attendanceDates = [...new Set(dates)].sort();
  let bestStreak = 0;
  let currentStreak = 0;
  let previousDate = "";

  for (const date of attendanceDates) {
    currentStreak = previousDate && addDateString(previousDate, 1) === date ? currentStreak + 1 : 1;
    bestStreak = Math.max(bestStreak, currentStreak);
    previousDate = date;
  }

  return bestStreak;
}

function addDateString(value: string, deltaDays: number) {
  const date = dateStringToUtcDate(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function getKstMonthRange(value?: string | null) {
  if (value && !/^\d{4}-\d{2}$/.test(value)) {
    badRequest("달 형식이 올바르지 않습니다.");
  }

  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = value ? Number(value.slice(0, 4)) : kstNow.getUTCFullYear();
  const month = value ? Number(value.slice(5, 7)) : kstNow.getUTCMonth() + 1;

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    badRequest("달 형식이 올바르지 않습니다.");
  }

  const monthText = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${monthText}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return { month: monthText, startDate, endDate };
}

function getCalendarRange(startDate: string, endDate: string) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
    badRequest("날짜 형식이 올바르지 않습니다.");
  }

  const start = dateStringToUtcDate(startDate);
  const calendarStart = new Date(start);
  calendarStart.setUTCDate(calendarStart.getUTCDate() - calendarStart.getUTCDay());

  const end = dateStringToUtcDate(endDate);
  const calendarEnd = new Date(end);
  calendarEnd.setUTCDate(calendarEnd.getUTCDate() + (6 - calendarEnd.getUTCDay()));

  return {
    calendarStartDate: calendarStart.toISOString().slice(0, 10),
    calendarEndDate: calendarEnd.toISOString().slice(0, 10),
  };
}

function dateStringToUtcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function getEndOfWorkDate(workDate: string) {
  return new Date(`${workDate}T23:59:00+09:00`);
}

function isEmployeeCheckOutLocked(data: AttendanceData) {
  return Boolean(data.check_out_at && data.check_out_session_id);
}

function isSameMinute(value: Date | null, isoValue: string | null) {
  if (!value || !isoValue) {
    return value === null && isoValue === null;
  }

  const original = new Date(isoValue);
  if (Number.isNaN(value.getTime()) || Number.isNaN(original.getTime())) {
    return false;
  }

  return Math.floor(value.getTime() / 60000) === Math.floor(original.getTime() / 60000);
}

function serializeAttendance(data: AttendanceData) {
  return {
    ...data,
    check_in_at: timestampToIso(data.check_in_at),
    check_out_at: timestampToIso(data.check_out_at),
    created_at: timestampToIso(data.created_at),
    updated_at: timestampToIso(data.updated_at),
  };
}

function validateChronology(checkInAt: Date | null, checkOutAt: Date | null) {
  if (checkInAt && Number.isNaN(checkInAt.getTime())) {
    badRequest("출근시각 형식이 올바르지 않습니다.");
  }

  if (checkOutAt && Number.isNaN(checkOutAt.getTime())) {
    badRequest("퇴근시각 형식이 올바르지 않습니다.");
  }

  if (checkInAt && checkOutAt && checkOutAt < checkInAt) {
    badRequest("퇴근시각은 출근시각 이후여야 합니다.");
  }
}
