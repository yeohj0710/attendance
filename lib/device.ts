import { getDb, nowTimestamp, timestampToIso } from "@/lib/db";
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

type DeviceData = {
  employee_id: string;
  device_id: string;
  user_agent_hash: string;
  status: DeviceStatus;
  requested_at: unknown;
  approved_at?: unknown;
  approved_by?: string | null;
  first_ip?: string | null;
  last_ip?: string | null;
  last_seen_at?: unknown;
  replacement_of?: string | null;
  created_at?: unknown;
  updated_at?: unknown;
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
  const db = getDb();
  const ip = getClientIp(request);
  const userAgentHash = hashUserAgent(request.headers.get("user-agent") ?? "");

  const approvedSnapshot = await db
    .collection("employee_devices")
    .where("employee_id", "==", employeeId)
    .where("status", "==", "approved")
    .limit(1)
    .get();
  const approvedDoc = approvedSnapshot.docs[0];
  const approved = approvedDoc?.data() as DeviceData | undefined;

  if (!approved) {
    const ref = db.collection("employee_devices").doc();
    const data: DeviceData = {
      employee_id: employeeId,
      device_id: normalizedDeviceId,
      user_agent_hash: userAgentHash,
      status: "approved",
      requested_at: nowTimestamp(),
      approved_at: nowTimestamp(),
      first_ip: ip,
      last_ip: ip,
      last_seen_at: nowTimestamp(),
      replacement_of: null,
      created_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    };
    await ref.set(data);
    return mapDevice(ref.id, data);
  }

  if (approved.device_id === normalizedDeviceId) {
    await approvedDoc.ref.update({
      user_agent_hash: userAgentHash,
      last_ip: ip,
      last_seen_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    });

    return mapDevice(approvedDoc.id, {
      ...approved,
      user_agent_hash: userAgentHash,
      last_ip: ip,
      last_seen_at: nowTimestamp(),
    });
  }

  const existingSnapshot = await db
    .collection("employee_devices")
    .where("employee_id", "==", employeeId)
    .where("device_id", "==", normalizedDeviceId)
    .limit(1)
    .get();
  const ref = existingSnapshot.docs[0]?.ref ?? db.collection("employee_devices").doc();
  const data: DeviceData = {
    employee_id: employeeId,
    device_id: normalizedDeviceId,
    user_agent_hash: userAgentHash,
    status: "pending_replacement",
    requested_at: nowTimestamp(),
    first_ip: existingSnapshot.docs[0]?.data().first_ip ?? ip,
    last_ip: ip,
    last_seen_at: null,
    replacement_of: approvedDoc.id,
    created_at: existingSnapshot.docs[0]?.data().created_at ?? nowTimestamp(),
    updated_at: nowTimestamp(),
  };
  await ref.set(data, { merge: true });

  throw new DeviceApprovalRequiredError(mapDevice(ref.id, data));
}

export async function verifyApprovedDevice(auth: AuthContext, request: Request) {
  const db = getDb();
  const doc = await db.collection("employee_devices").doc(auth.session.deviceRecordId).get();
  if (!doc.exists) {
    forbidden("등록된 회사 컴퓨터에서만 출퇴근 체크가 가능합니다.");
  }

  const device = doc.data() as DeviceData;
  if (
    device.employee_id !== auth.employee.id ||
    device.device_id !== auth.session.deviceId ||
    device.status !== "approved"
  ) {
    forbidden("등록된 회사 컴퓨터에서만 출퇴근 체크가 가능합니다.");
  }

  await doc.ref.update({
    last_ip: getClientIp(request),
    last_seen_at: nowTimestamp(),
    updated_at: nowTimestamp(),
  });

  return mapDevice(doc.id, device);
}

export async function listPendingDeviceRequests() {
  const db = getDb();
  const [devicesSnapshot, employeesSnapshot] = await Promise.all([
    db.collection("employee_devices").where("status", "==", "pending_replacement").get(),
    db.collection("employees").get(),
  ]);

  const employees = new Map(
    employeesSnapshot.docs.map((doc) => [doc.id, doc.data() as { employee_no?: string; name?: string }]),
  );

  return devicesSnapshot.docs
    .map((doc) => {
      const data = doc.data() as DeviceData;
      const employee = employees.get(data.employee_id);
      return {
        ...mapDevice(doc.id, data),
        employeeNo: employee?.employee_no,
        employeeName: employee?.name,
      };
    })
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export async function approveDeviceRequest(auth: AuthContext, deviceRecordId: string) {
  const db = getDb();
  const pendingRef = db.collection("employee_devices").doc(deviceRecordId);
  const pendingDoc = await pendingRef.get();

  if (!pendingDoc.exists) {
    badRequest("승인할 기기 변경 요청을 찾을 수 없습니다.");
  }

  const pending = pendingDoc.data() as DeviceData;
  if (pending.status !== "pending_replacement") {
    badRequest("승인할 기기 변경 요청을 찾을 수 없습니다.");
  }

  const approvedSnapshot = await db
    .collection("employee_devices")
    .where("employee_id", "==", pending.employee_id)
    .where("status", "==", "approved")
    .get();

  const batch = db.batch();
  for (const doc of approvedSnapshot.docs) {
    batch.update(doc.ref, {
      status: "replaced",
      updated_at: nowTimestamp(),
    });
  }

  batch.update(pendingRef, {
    status: "approved",
    approved_at: nowTimestamp(),
    approved_by: auth.employee.id,
    last_seen_at: nowTimestamp(),
    updated_at: nowTimestamp(),
  });
  await batch.commit();

  const updated = await pendingRef.get();
  return mapDevice(updated.id, updated.data() as DeviceData);
}

function validateDeviceId(deviceId: string) {
  const normalized = deviceId.trim();
  if (!normalized || normalized.length > 128) {
    badRequest("기기 식별값이 올바르지 않습니다.");
  }

  return normalized;
}

function mapDevice(id: string, data: DeviceData): EmployeeDevice {
  return {
    id,
    employeeId: data.employee_id,
    deviceId: data.device_id,
    userAgentHash: data.user_agent_hash,
    status: data.status,
    requestedAt: timestampToIso(data.requested_at) ?? new Date().toISOString(),
    approvedAt: timestampToIso(data.approved_at),
    firstIp: data.first_ip ?? null,
    lastIp: data.last_ip ?? null,
    lastSeenAt: timestampToIso(data.last_seen_at),
  };
}
