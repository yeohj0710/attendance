import { getSql } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import {
  createSessionExpiry,
  createSessionToken,
  hashToken,
  hashUserAgent,
  verifyPin,
} from "@/lib/security";
import { forbidden, unauthorized } from "@/lib/http";
import { DeviceApprovalRequiredError, resolveLoginDevice } from "@/lib/device";

export type EmployeeRole = "employee" | "admin";

export type AuthEmployee = {
  id: string;
  employeeNo: string;
  name: string;
  role: EmployeeRole;
};

export type AuthContext = {
  employee: AuthEmployee;
  session: {
    id: string;
    deviceId: string;
    deviceRecordId: string;
    expiresAt: string;
  };
};

export type LoginResult =
  | {
      ok: true;
      token: string;
      expiresAt: string;
      employee: AuthEmployee;
    }
  | {
      ok: false;
      requiresDeviceApproval: true;
      message: string;
    };

type EmployeeRow = {
  id: string;
  employee_no: string;
  name: string;
  role: EmployeeRole;
  pin_hash: string;
  pin_salt: string;
};

type SessionRow = {
  session_id: string;
  device_record_id: string;
  device_id: string;
  expires_at: string;
  employee_id: string;
  employee_no: string;
  name: string;
  role: EmployeeRole;
};

export async function loginWithPin({
  employeeNo,
  pin,
  deviceId,
  request,
}: {
  employeeNo: string;
  pin: string;
  deviceId: string;
  request: Request;
}): Promise<LoginResult> {
  const sql = getSql();
  const rows = await sql<EmployeeRow[]>`
    select id, employee_no, name, role, pin_hash, pin_salt
    from employees
    where employee_no = ${employeeNo}
      and is_active = true
    limit 1
  `;

  const employee = rows[0];
  if (!employee || !verifyPin(pin, employee.pin_hash, employee.pin_salt)) {
    unauthorized("사번 또는 PIN이 올바르지 않습니다.");
  }

  let device: Awaited<ReturnType<typeof resolveLoginDevice>>;
  try {
    device = await resolveLoginDevice({
      employeeId: employee.id,
      deviceId,
      request,
    });
  } catch (error) {
    if (error instanceof DeviceApprovalRequiredError) {
      return {
        ok: false,
        requiresDeviceApproval: true,
        message:
          "새 컴퓨터에서 접속했습니다. 관리자에게 기기 변경 승인을 요청하세요.",
      };
    }

    throw error;
  }
  const token = createSessionToken();
  const expiresAt = createSessionExpiry();
  const clientIp = getClientIp(request);
  const userAgentHash = hashUserAgent(request.headers.get("user-agent") ?? "");

  const sessionRows = await sql<{ id: string; expires_at: string }[]>`
    insert into sessions (
      employee_id,
      device_record_id,
      token_hash,
      device_id,
      user_agent_hash,
      first_ip,
      last_ip,
      expires_at,
      last_used_at
    )
    values (
      ${employee.id},
      ${device.id},
      ${hashToken(token)},
      ${deviceId},
      ${userAgentHash},
      ${clientIp},
      ${clientIp},
      ${expiresAt.toISOString()},
      now()
    )
    returning id, expires_at
  `;

  return {
    ok: true,
    token,
    expiresAt: sessionRows[0].expires_at,
    employee: mapEmployee(employee),
  };
}

export async function authenticateRequest(request: Request) {
  const token = getBearerToken(request);
  const deviceId = request.headers.get("x-attendance-device")?.trim();

  if (!token || !deviceId) {
    return null;
  }

  const sql = getSql();
  const tokenHash = hashToken(token);
  const rows = await sql<SessionRow[]>`
    select
      s.id as session_id,
      s.device_record_id,
      s.device_id,
      s.expires_at,
      e.id as employee_id,
      e.employee_no,
      e.name,
      e.role
    from sessions s
    join employees e on e.id = s.employee_id
    join employee_devices d on d.id = s.device_record_id
    where s.token_hash = ${tokenHash}
      and s.revoked_at is null
      and s.expires_at > now()
      and d.status = 'approved'
      and e.is_active = true
    limit 1
  `;

  const row = rows[0];
  if (!row || row.device_id !== deviceId) {
    return null;
  }

  await sql`
    update sessions
    set last_used_at = now(),
        last_ip = ${getClientIp(request)}
    where id = ${row.session_id}
  `;

  return {
    employee: {
      id: row.employee_id,
      employeeNo: row.employee_no,
      name: row.name,
      role: row.role,
    },
    session: {
      id: row.session_id,
      deviceId: row.device_id,
      deviceRecordId: row.device_record_id,
      expiresAt: row.expires_at,
    },
  } satisfies AuthContext;
}

export async function requireAuth(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    unauthorized();
  }

  return auth;
}

export async function requireAdmin(request: Request) {
  const auth = await requireAuth(request);
  if (auth.employee.role !== "admin") {
    forbidden("관리자만 접근할 수 있습니다.");
  }

  return auth;
}

export async function logoutCurrentDevice(request: Request) {
  const token = getBearerToken(request);
  const deviceId = request.headers.get("x-attendance-device")?.trim();
  if (!token || !deviceId) {
    return;
  }

  const sql = getSql();
  await sql`
    update sessions
    set revoked_at = now()
    where token_hash = ${hashToken(token)}
      and device_id = ${deviceId}
      and revoked_at is null
  `;
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

function mapEmployee(employee: EmployeeRow): AuthEmployee {
  return {
    id: employee.id,
    employeeNo: employee.employee_no,
    name: employee.name,
    role: employee.role,
  };
}
