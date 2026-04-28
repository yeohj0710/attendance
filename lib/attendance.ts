import { getSql } from "@/lib/db";
import { badRequest, conflict } from "@/lib/http";
import { getKstDateString, parseKstDateTimeInput } from "@/lib/time";
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

type AttendanceRow = {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_ip: string | null;
  check_out_ip: string | null;
  check_in_device_id?: string | null;
  check_out_device_id?: string | null;
  work_type: WorkType;
  note: string | null;
  source: "employee" | "admin";
  created_at: string;
  updated_at: string;
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

export async function getAttendanceStatus(auth: AuthContext) {
  const sql = getSql();
  const today = getKstDateString();

  const todayRows = await sql<AttendanceRow[]>`
    select *
    from attendance_records
    where employee_id = ${auth.employee.id}
      and work_date = ${today}
    limit 1
  `;

  const openRows = await sql<AttendanceRow[]>`
    select *
    from attendance_records
    where employee_id = ${auth.employee.id}
      and check_in_at is not null
      and check_out_at is null
    order by work_date desc, check_in_at desc
    limit 1
  `;

  const todayRecord = todayRows[0] ? mapAttendance(todayRows[0]) : null;
  const openRecord = openRows[0] ? mapAttendance(openRows[0]) : null;
  const hasPreviousOpen =
    openRecord !== null && openRecord.workDate !== today && !openRecord.checkOutAt;

  return {
    kstDate: today,
    todayRecord,
    openRecord,
    canCheckIn: !todayRecord?.checkInAt && !hasPreviousOpen,
    canCheckOut: Boolean(openRecord),
    hasPreviousOpen,
  };
}

export async function getRecentAttendance(employeeId: string, limit: number) {
  const sql = getSql();
  const rows = await sql<AttendanceRow[]>`
    select *
    from attendance_records
    where employee_id = ${employeeId}
    order by work_date desc
    limit ${limit}
  `;

  return rows.map(mapAttendance);
}

export async function checkIn(auth: AuthContext, ip: string | null) {
  const sql = getSql();
  const today = getKstDateString();
  const status = await getAttendanceStatus(auth);

  if (status.hasPreviousOpen) {
    conflict("이전 출근 기록에 퇴근이 없어 새 출근을 할 수 없습니다. 관리자에게 수정 요청하세요.");
  }

  if (status.todayRecord?.checkInAt) {
    conflict("이미 오늘 출근 처리되었습니다.");
  }

  const rows = await sql<AttendanceRow[]>`
    insert into attendance_records (
      employee_id,
      work_date,
      check_in_at,
      check_in_ip,
      check_in_session_id,
      work_type,
      source,
      created_by,
      updated_by
    )
    values (
      ${auth.employee.id},
      ${today},
      now(),
      ${ip},
      ${auth.session.id},
      'office',
      'employee',
      ${auth.employee.id},
      ${auth.employee.id}
    )
    on conflict (employee_id, work_date)
    do update set
      check_in_at = excluded.check_in_at,
      check_in_ip = excluded.check_in_ip,
      check_in_session_id = excluded.check_in_session_id,
      source = 'employee',
      updated_by = excluded.updated_by
    where attendance_records.check_in_at is null
    returning *
  `;

  if (!rows[0]) {
    conflict("이미 오늘 출근 처리되었습니다.");
  }

  return mapAttendance(rows[0]);
}

export async function checkOut(auth: AuthContext, ip: string | null) {
  const sql = getSql();
  const openRows = await sql<AttendanceRow[]>`
    select *
    from attendance_records
    where employee_id = ${auth.employee.id}
      and check_in_at is not null
      and check_out_at is null
    order by work_date desc, check_in_at desc
    limit 1
  `;

  const openRecord = openRows[0];
  if (!openRecord) {
    conflict("퇴근 처리할 출근 기록이 없습니다.");
  }

  const rows = await sql<AttendanceRow[]>`
    update attendance_records
    set check_out_at = now(),
        check_out_ip = ${ip},
        check_out_session_id = ${auth.session.id},
        updated_by = ${auth.employee.id}
    where id = ${openRecord.id}
      and check_out_at is null
    returning *
  `;

  if (!rows[0]) {
    conflict("이미 퇴근 처리되었습니다.");
  }

  return mapAttendance(rows[0]);
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
  const sql = getSql();
  const rows = await sql<AttendanceRow[]>`
    select
      ar.*,
      e.employee_no,
      e.name as employee_name,
      cis.device_id as check_in_device_id,
      cos.device_id as check_out_device_id
    from attendance_records ar
    join employees e on e.id = ar.employee_id
    left join sessions cis on cis.id = ar.check_in_session_id
    left join sessions cos on cos.id = ar.check_out_session_id
    where (${startDate}::date is null or ar.work_date >= ${startDate}::date)
      and (${endDate}::date is null or ar.work_date <= ${endDate}::date)
      and (${employeeId}::uuid is null or ar.employee_id = ${employeeId}::uuid)
    order by ar.work_date desc, e.name asc
  `;

  return rows.map(mapAttendance);
}

export async function createAdminAttendance(
  auth: AuthContext,
  input: AdminAttendanceInput,
) {
  const sql = getSql();
  const checkInAt = parseKstDateTimeInput(input.checkInAt);
  const checkOutAt = parseKstDateTimeInput(input.checkOutAt);
  validateChronology(checkInAt, checkOutAt);
  const existingRows = await sql<{ id: string }[]>`
    select id
    from attendance_records
    where employee_id = ${input.employeeId}
      and work_date = ${input.workDate}
    limit 1
  `;

  if (existingRows[0]) {
    conflict("이미 해당 날짜 기록이 있습니다. 기존 기록을 수정하세요.");
  }

  const after = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    check_in_at: checkInAt?.toISOString() ?? null,
    check_out_at: checkOutAt?.toISOString() ?? null,
    work_type: input.workType,
    note: input.note ?? null,
    source: "admin",
  };

  const rows = await sql<AttendanceRow[]>`
    insert into attendance_records (
      employee_id,
      work_date,
      check_in_at,
      check_out_at,
      work_type,
      note,
      source,
      created_by,
      updated_by
    )
    values (
      ${input.employeeId},
      ${input.workDate},
      ${checkInAt?.toISOString() ?? null},
      ${checkOutAt?.toISOString() ?? null},
      ${input.workType},
      ${input.note ?? null},
      'admin',
      ${auth.employee.id},
      ${auth.employee.id}
    )
    returning *
  `;

  const record = rows[0];
  await sql`
    insert into attendance_audit_logs (
      attendance_record_id,
      action,
      changed_by,
      before_data,
      after_data,
      reason
    )
    values (
      ${record.id},
      'create',
      ${auth.employee.id},
      null,
      ${JSON.stringify(after)}::jsonb,
      ${input.reason ?? null}
    )
  `;

  return mapAttendance(record);
}

export async function updateAdminAttendance(
  auth: AuthContext,
  id: string,
  input: AdminAttendanceInput,
) {
  const sql = getSql();
  const beforeRows = await sql<AttendanceRow[]>`
    select *
    from attendance_records
    where id = ${id}
    limit 1
  `;

  const before = beforeRows[0];
  if (!before) {
    conflict("수정할 기록을 찾을 수 없습니다.");
  }

  const checkInAt = parseKstDateTimeInput(input.checkInAt);
  const checkOutAt = parseKstDateTimeInput(input.checkOutAt);
  validateChronology(checkInAt, checkOutAt);
  const duplicateRows = await sql<{ id: string }[]>`
    select id
    from attendance_records
    where employee_id = ${input.employeeId}
      and work_date = ${input.workDate}
      and id <> ${id}
    limit 1
  `;

  if (duplicateRows[0]) {
    conflict("해당 직원의 같은 날짜 기록이 이미 있습니다.");
  }

  const rows = await sql<AttendanceRow[]>`
    update attendance_records
    set employee_id = ${input.employeeId},
        work_date = ${input.workDate},
        check_in_at = ${checkInAt?.toISOString() ?? null},
        check_out_at = ${checkOutAt?.toISOString() ?? null},
        work_type = ${input.workType},
        note = ${input.note ?? null},
        source = 'admin',
        updated_by = ${auth.employee.id}
    where id = ${id}
    returning *
  `;

  const record = rows[0];
  await sql`
    insert into attendance_audit_logs (
      attendance_record_id,
      action,
      changed_by,
      before_data,
      after_data,
      reason
    )
    values (
      ${record.id},
      'update',
      ${auth.employee.id},
      ${JSON.stringify(before)}::jsonb,
      ${JSON.stringify(record)}::jsonb,
      ${input.reason ?? null}
    )
  `;

  return mapAttendance(record);
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

export function mapAttendance(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeNo: row.employee_no,
    employeeName: row.employee_name,
    workDate: row.work_date,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    checkInIp: row.check_in_ip,
    checkOutIp: row.check_out_ip,
    checkInDeviceId: row.check_in_device_id,
    checkOutDeviceId: row.check_out_device_id,
    workType: row.work_type,
    note: row.note,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
