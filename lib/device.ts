import { getSql } from "@/lib/db";
import { badRequest, forbidden } from "@/lib/http";
import { getClientIp, getOfficeNetworkMessage, isOfficeIp } from "@/lib/ip";
import { hashUserAgent } from "@/lib/security";
import type { AuthContext } from "@/lib/auth";

export type DeviceStatus =
  | "approved"
  | "pending_replacement"
  | "replaced"
  | "revoked";

export type EmployeeDevice = {
  id: string;
  employeeId: string;
  employeeNo?: string;
  employeeName?: string;
  deviceId: string;
  userAgentHash: string;
  status: DeviceStatus;
  requestedAt: string;
  approvedAt: string | null;
  firstIp: string | null;
  lastIp: string | null;
  lastSeenAt: string | null;
};

type DeviceRow = {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  device_id: string;
  user_agent_hash: string;
  status: DeviceStatus;
  requested_at: string;
  approved_at: string | null;
  first_ip: string | null;
  last_ip: string | null;
  last_seen_at: string | null;
};

export class DeviceApprovalRequiredError extends Error {
  deviceRequest: EmployeeDevice;

  constructor(deviceRequest: EmployeeDevice) {
    super("새 컴퓨터 기기 변경 승인이 필요합니다.");
    this.deviceRequest = deviceRequest;
  }
}

export function assertOfficeDesktopRequest(request: Request) {
  if (!isLikelyDesktopRequest(request)) {
    forbidden("회사 컴퓨터에서만 사용할 수 있습니다. 모바일/태블릿에서는 출퇴근 체크가 불가합니다.");
  }

  if (!isOfficeIp(getClientIp(request))) {
    forbidden(getOfficeNetworkMessage());
  }
}

export function isLikelyDesktopRequest(request: Request) {
  const mobileHint = request.headers.get("sec-ch-ua-mobile");
  if (mobileHint === "?1") {
    return false;
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent) {
    return true;
  }

  return !/(mobi|android|iphone|ipad|ipod|windows phone|tablet|kindle|silk)/i.test(
    userAgent,
  );
}

export async function resolveLoginDevice({
  employeeId,
  deviceId,
  request,
}: {
  employeeId: string;
  deviceId: string;
  request: Request;
}) {
  const normalizedDeviceId = validateDeviceId(deviceId);
  const sql = getSql();
  const ip = getClientIp(request);
  const userAgentHash = hashUserAgent(request.headers.get("user-agent") ?? "");

  const approvedRows = await sql<DeviceRow[]>`
    select *
    from employee_devices
    where employee_id = ${employeeId}
      and status = 'approved'
    limit 1
  `;

  const approved = approvedRows[0];
  if (!approved) {
    const rows = await sql<DeviceRow[]>`
      insert into employee_devices (
        employee_id,
        device_id,
        user_agent_hash,
        status,
        requested_at,
        approved_at,
        first_ip,
        last_ip,
        last_seen_at
      )
      values (
        ${employeeId},
        ${normalizedDeviceId},
        ${userAgentHash},
        'approved',
        now(),
        now(),
        ${ip},
        ${ip},
        now()
      )
      returning *
    `;

    return mapDevice(rows[0]);
  }

  if (approved.device_id === normalizedDeviceId) {
    const rows = await sql<DeviceRow[]>`
      update employee_devices
      set user_agent_hash = ${userAgentHash},
          last_ip = ${ip},
          last_seen_at = now()
      where id = ${approved.id}
      returning *
    `;

    return mapDevice(rows[0]);
  }

  const rows = await sql<DeviceRow[]>`
    insert into employee_devices (
      employee_id,
      device_id,
      user_agent_hash,
      status,
      requested_at,
      first_ip,
      last_ip,
      replacement_of
    )
    values (
      ${employeeId},
      ${normalizedDeviceId},
      ${userAgentHash},
      'pending_replacement',
      now(),
      ${ip},
      ${ip},
      ${approved.id}
    )
    on conflict (employee_id, device_id)
    do update set
      user_agent_hash = excluded.user_agent_hash,
      status = case
        when employee_devices.status = 'approved' then employee_devices.status
        else 'pending_replacement'
      end,
      requested_at = now(),
      last_ip = excluded.last_ip,
      replacement_of = excluded.replacement_of
    returning *
  `;

  throw new DeviceApprovalRequiredError(mapDevice(rows[0]));
}

export async function verifyApprovedDevice(auth: AuthContext, request: Request) {
  const sql = getSql();
  const rows = await sql<DeviceRow[]>`
    select *
    from employee_devices
    where employee_id = ${auth.employee.id}
      and device_id = ${auth.session.deviceId}
      and status = 'approved'
    limit 1
  `;

  if (!rows[0]) {
    forbidden("등록된 회사 컴퓨터에서만 출퇴근 체크가 가능합니다.");
  }

  await sql`
    update employee_devices
    set last_ip = ${getClientIp(request)},
        last_seen_at = now()
    where id = ${rows[0].id}
  `;

  return mapDevice(rows[0]);
}

export async function listPendingDeviceRequests() {
  const sql = getSql();
  const rows = await sql<DeviceRow[]>`
    select
      d.*,
      e.employee_no,
      e.name as employee_name
    from employee_devices d
    join employees e on e.id = d.employee_id
    where d.status = 'pending_replacement'
    order by d.requested_at asc
  `;

  return rows.map(mapDevice);
}

export async function approveDeviceRequest(auth: AuthContext, deviceRecordId: string) {
  const sql = getSql();
  const pendingRows = await sql<DeviceRow[]>`
    select *
    from employee_devices
    where id = ${deviceRecordId}
      and status = 'pending_replacement'
    limit 1
  `;

  const pending = pendingRows[0];
  if (!pending) {
    badRequest("승인할 기기 변경 요청을 찾을 수 없습니다.");
  }

  await sql`
    update employee_devices
    set status = 'replaced'
    where employee_id = ${pending.employee_id}
      and status = 'approved'
  `;

  const rows = await sql<DeviceRow[]>`
    update employee_devices
    set status = 'approved',
        approved_at = now(),
        approved_by = ${auth.employee.id},
        last_seen_at = now()
    where id = ${pending.id}
    returning *
  `;

  return mapDevice(rows[0]);
}

function validateDeviceId(deviceId: string) {
  const normalized = deviceId.trim();
  if (!normalized || normalized.length > 128) {
    badRequest("기기 식별값이 올바르지 않습니다.");
  }

  return normalized;
}

function mapDevice(row: DeviceRow): EmployeeDevice {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeNo: row.employee_no,
    employeeName: row.employee_name,
    deviceId: row.device_id,
    userAgentHash: row.user_agent_hash,
    status: row.status,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    firstIp: row.first_ip,
    lastIp: row.last_ip,
    lastSeenAt: row.last_seen_at,
  };
}
