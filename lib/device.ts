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
  deviceFingerprint: string | null;
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
  device_fingerprint?: string | null;
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
  deviceFingerprint,
  request,
}: {
  employeeId: string;
  deviceId: string;
  deviceFingerprint?: string;
  request: Request;
}) {
  const normalizedDeviceId = validateDeviceId(deviceId);
  const normalizedFingerprint = validateDeviceFingerprint(deviceFingerprint);
  const db = getDb();
  const ip = getClientIp(request);
  const userAgentHash = hashUserAgent(request.headers.get("user-agent") ?? "");

  const existingByDeviceSnapshot = await db
    .collection("employee_devices")
    .where("employee_id", "==", employeeId)
    .where("device_id", "==", normalizedDeviceId)
    .limit(1)
    .get();
  const existingDoc = existingByDeviceSnapshot.docs[0];

  if (!existingDoc) {
    const ref = db.collection("employee_devices").doc();
    const data: DeviceData = {
      employee_id: employeeId,
      device_id: normalizedDeviceId,
      device_fingerprint: normalizedFingerprint,
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

  const existing = existingDoc.data() as DeviceData;
  const data: Partial<DeviceData> = {
    device_id: normalizedDeviceId,
    device_fingerprint: normalizedFingerprint,
    user_agent_hash: userAgentHash,
    status: "approved",
    approved_at: existing.approved_at ?? nowTimestamp(),
    last_ip: ip,
    last_seen_at: nowTimestamp(),
    updated_at: nowTimestamp(),
  };
  await existingDoc.ref.set(data, { merge: true });

  return mapDevice(existingDoc.id, {
    ...existing,
    ...data,
  } as DeviceData);
}

export async function verifyApprovedDevice(auth: AuthContext, request: Request) {
  const db = getDb();
  const ref = db.collection("employee_devices").doc(auth.session.deviceRecordId);
  const doc = await ref.get();

  if (!doc.exists) {
    forbidden("?깅줉???뚯궗 而댄벂?곗뿉?쒕쭔 異쒗눜洹?泥댄겕媛 媛?ν빀?덈떎.");
  }

  const device = doc.data() as DeviceData;
  if (
    device.employee_id !== auth.employee.id ||
    device.device_id !== auth.session.deviceId ||
    device.status !== "approved"
  ) {
    forbidden("?깅줉???뚯궗 而댄벂?곗뿉?쒕쭔 異쒗눜洹?泥댄겕媛 媛?ν빀?덈떎.");
  }

  try {
    await ref.update({
      last_ip: getClientIp(request),
      last_seen_at: nowTimestamp(),
      updated_at: nowTimestamp(),
    });
  } catch {
    forbidden("등록된 회사 컴퓨터에서만 출퇴근 체크가 가능합니다.");
  }

  return null;
}

export async function listPendingDeviceRequests() {
  return [];
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

  await pendingRef.update({
    status: "approved",
    approved_at: nowTimestamp(),
    approved_by: auth.employee.id,
    last_seen_at: nowTimestamp(),
    updated_at: nowTimestamp(),
  });

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

function validateDeviceFingerprint(deviceFingerprint: string | undefined) {
  const normalized = deviceFingerprint?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  if (!/^[a-zA-Z0-9+/=:-]{16,256}$/.test(normalized)) {
    badRequest("기기 정보를 확인할 수 없습니다.");
  }

  return normalized;
}

function mapDevice(id: string, data: DeviceData): EmployeeDevice {
  return {
    id,
    employeeId: data.employee_id,
    deviceId: data.device_id,
    deviceFingerprint: data.device_fingerprint ?? null,
    userAgentHash: data.user_agent_hash,
    status: data.status,
    requestedAt: timestampToIso(data.requested_at) ?? new Date().toISOString(),
    approvedAt: timestampToIso(data.approved_at),
    firstIp: data.first_ip ?? null,
    lastIp: data.last_ip ?? null,
    lastSeenAt: timestampToIso(data.last_seen_at),
  };
}
