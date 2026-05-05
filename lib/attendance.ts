import { getDb, nowTimestamp, timestampToIso, toTimestamp } from "@/lib/db";
import { badRequest, conflict } from "@/lib/http";
import { getWorkDateString, isValidDateString, parseKstDateTimeInput } from "@/lib/time";
import {
  ensureCarryoverWorkLog,
  getWorkLogSummariesForRange,
  getWorkLogsForDate,
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
    canCheckOut: true,
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
  const openRecord =
    (await getOpenRecord(auth.employee.id)) ??
    (await getRecordByEmployeeDate(auth.employee.id, workDate));
  const now = nowTimestamp();

  if (!openRecord) {
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

  const ref = db.collection("attendance_records").doc(openRecord.id);
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
