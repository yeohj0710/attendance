import { getDb, nowTimestamp, timestampToIso, toTimestamp } from "@/lib/db";
import { getClientIp } from "@/lib/ip";
import {
  createSessionExpiry,
  createSessionToken,
  hashToken,
  hashUserAgent,
  verifyPin,
} from "@/lib/security";
import { conflict, forbidden, unauthorized } from "@/lib/http";
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

type EmployeeData = {
  employee_no: string;
  name: string;
  role: EmployeeRole;
  pin_hash: string;
  pin_salt: string;
  is_active: boolean;
};

type SessionData = {
  employee_id: string;
  device_record_id: string;
  device_id: string;
  expires_at: unknown;
  revoked_at?: unknown;
};

export async function loginWithPin({
  employeeName,
  pin,
  deviceId,
  deviceFingerprint,
  request,
}: {
  employeeName: string;
  pin: string;
  deviceId: string;
  deviceFingerprint?: string;
  request: Request;
}): Promise<LoginResult> {
  const db = getDb();
  const normalizedEmployeeName = normalizeLoginName(employeeName);
  const snapshot = await db
    .collection("employees")
    .where("is_active", "==", true)
    .get();
  const matchedDocs = snapshot.docs.filter((doc) => {
    const employee = doc.data() as EmployeeData;
    return (
      normalizeLoginName(employee.name) === normalizedEmployeeName ||
      normalizeLoginName(employee.employee_no) === normalizedEmployeeName
    );
  });
  const activeDocCount = matchedDocs.length;

  if (activeDocCount > 1) {
    conflict("같은 이름의 직원이 2명 이상 있습니다. 관리자에게 이름 구분을 요청하세요.");
  }

  const employeeDoc = matchedDocs[0];
  const employee = employeeDoc?.data() as EmployeeData | undefined;
  if (!employee || !verifyPin(pin, employee.pin_hash, employee.pin_salt)) {
    unauthorized("이름 또는 PIN이 올바르지 않습니다. 이름은 공백 없이 입력해주세요.");
  }

  let device;
  try {
    device = await resolveLoginDevice({
      employeeId: employeeDoc.id,
      deviceId,
      deviceFingerprint,
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
  const tokenHash = hashToken(token);
  const expiresAt = createSessionExpiry();
  const clientIp = getClientIp(request);

  await db.collection("sessions").doc(tokenHash).set({
    employee_id: employeeDoc.id,
    device_record_id: device.id,
    token_hash: tokenHash,
    device_id: deviceId,
    user_agent_hash: hashUserAgent(request.headers.get("user-agent") ?? ""),
    first_ip: clientIp,
    last_ip: clientIp,
    expires_at: toTimestamp(expiresAt),
    revoked_at: null,
    created_at: nowTimestamp(),
    last_used_at: nowTimestamp(),
  });

  return {
    ok: true,
    token,
    expiresAt: expiresAt.toISOString(),
    employee: mapEmployee(employeeDoc.id, employee),
  };
}

export async function authenticateRequest(request: Request) {
  const token = getBearerToken(request);
  const deviceId = request.headers.get("x-attendance-device")?.trim();

  if (!token || !deviceId) {
    return null;
  }

  const db = getDb();
  const sessionDoc = await db.collection("sessions").doc(hashToken(token)).get();
  if (!sessionDoc.exists) {
    return null;
  }

  const session = sessionDoc.data() as SessionData;
  const expiresAt = timestampToIso(session.expires_at);
  if (
    session.revoked_at ||
    session.device_id !== deviceId ||
    !expiresAt ||
    new Date(expiresAt) <= new Date()
  ) {
    return null;
  }

  const [employeeDoc, deviceDoc] = await Promise.all([
    db.collection("employees").doc(session.employee_id).get(),
    db.collection("employee_devices").doc(session.device_record_id).get(),
  ]);

  if (!employeeDoc.exists || !deviceDoc.exists) {
    return null;
  }

  const employee = employeeDoc.data() as EmployeeData;
  const device = deviceDoc.data() as { status?: string };
  if (!employee.is_active || device.status !== "approved") {
    return null;
  }

  await sessionDoc.ref.update({
    last_used_at: nowTimestamp(),
    last_ip: getClientIp(request),
  });

  return {
    employee: mapEmployee(employeeDoc.id, employee),
    session: {
      id: sessionDoc.id,
      deviceId: session.device_id,
      deviceRecordId: session.device_record_id,
      expiresAt,
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

  const db = getDb();
  const sessionRef = db.collection("sessions").doc(hashToken(token));
  const sessionDoc = await sessionRef.get();
  if (!sessionDoc.exists) {
    return;
  }

  const session = sessionDoc.data() as SessionData;
  if (session.device_id === deviceId) {
    await sessionRef.update({ revoked_at: nowTimestamp() });
  }
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

function normalizeLoginName(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").trim();
}

function mapEmployee(id: string, employee: EmployeeData): AuthEmployee {
  return {
    id,
    employeeNo: employee.employee_no,
    name: employee.name,
    role: employee.role,
  };
}
