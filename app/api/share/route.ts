import { requireAuth } from "@/lib/auth";
import {
  getAttendanceStatusForEmployee,
  getRecentAttendance,
  getTeamMonthAttendance,
  getTeamTodayAttendance,
} from "@/lib/attendance";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { getDb } from "@/lib/db";
import { badRequest, withApi } from "@/lib/http";
import {
  createShareToken,
  createShortShareId,
  getShareTokenFromShortId,
  SHARE_QUERY_PARAM,
  verifyShareToken,
} from "@/lib/share";
import { getWorkLog } from "@/lib/work-log";

export const runtime = "nodejs";

type EmployeeData = {
  employee_no?: string;
  name?: string;
  role?: "employee" | "admin";
  is_active?: boolean;
};

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const body = (await request.json()) as {
      type?: "dashboard" | "work-log";
      employeeId?: string;
      workDate?: string;
    };
    const type = body.type === "work-log" ? "work-log" : "dashboard";
    if (type === "work-log" && (!body.employeeId?.trim() || !body.workDate?.trim())) {
      badRequest("공유할 업무 기록을 찾을 수 없습니다.");
    }

    const token = createShareToken({
      type,
      ownerEmployeeId: auth.employee.id,
      targetEmployeeId: type === "work-log" ? body.employeeId?.trim() : undefined,
      workDate: type === "work-log" ? body.workDate?.trim() : undefined,
    });
    const shareId = await createShortShareId(token);

    const url = new URL(request.url);
    url.pathname = `/s/${shareId}`;
    url.search = "";
    return Response.json({ url: url.toString() });
  });
}

export async function GET(request: Request) {
  return withApi(async () => {
    const url = new URL(request.url);
    const token =
      url.searchParams.get(SHARE_QUERY_PARAM) ??
      (await getShareTokenFromShortId(url.searchParams.get("shareId")));
    const payload = verifyShareToken(token);
    const owner = await getEmployee(payload.ownerEmployeeId);

    const [status, records, teamRecords, teamMonth] = await Promise.all([
      getAttendanceStatusForEmployee(payload.ownerEmployeeId),
      getRecentAttendance(payload.ownerEmployeeId, 10),
      getTeamTodayAttendance(),
      getTeamMonthAttendance(),
    ]);
    const todayWorkLog = await getWorkLog(payload.ownerEmployeeId, status.kstDate);

    const requestedEmployeeId = url.searchParams.get("employeeId")?.trim();
    const requestedWorkDate = url.searchParams.get("workDate")?.trim();
    const targetEmployeeId =
      requestedEmployeeId || (payload.type === "work-log" ? payload.targetEmployeeId : null);
    const targetWorkDate =
      requestedWorkDate || (payload.type === "work-log" ? payload.workDate : null);
    const targetWorkLog =
      targetEmployeeId && targetWorkDate ? await getWorkLog(targetEmployeeId, targetWorkDate) : null;
    const matchedTargetRecord =
      targetWorkLog
        ? teamRecords.find(
            (record) =>
              record.employeeId === targetWorkLog.employeeId &&
              record.workDate === targetWorkLog.workDate,
          ) ??
          teamMonth.records.find(
            (record) =>
              record.employeeId === targetWorkLog.employeeId &&
              record.workDate === targetWorkLog.workDate,
          ) ??
          records.find(
            (record) =>
              record.employeeId === targetWorkLog.employeeId &&
              record.workDate === targetWorkLog.workDate,
          )
        : null;
    const targetWorkRecord = targetWorkLog
      ? {
          employeeId: targetWorkLog.employeeId,
          employeeNo: matchedTargetRecord?.employeeNo ?? "",
          employeeName: targetWorkLog.employeeName,
          workDate: targetWorkLog.workDate,
          checkInAt: matchedTargetRecord?.checkInAt ?? null,
          checkOutAt: matchedTargetRecord?.checkOutAt ?? null,
          workType: matchedTargetRecord?.workType ?? "office",
          note: matchedTargetRecord?.note ?? null,
          taskCount: targetWorkLog.taskCount,
          doneCount: targetWorkLog.doneCount,
          commentCount: targetWorkLog.commentCount,
          tasks: targetWorkLog.tasks,
        }
      : null;

    return Response.json({
      employee: owner,
      status,
      records,
      teamRecords,
      teamMonth,
      todayWorkLog,
      targetWorkLog,
      targetWorkRecord,
      shareType: payload.type,
    });
  });
}

async function getEmployee(employeeId: string) {
  const doc = await getDb().collection("employees").doc(employeeId).get();
  if (!doc.exists) {
    badRequest("공유한 직원을 찾을 수 없습니다.");
  }

  const data = doc.data() as EmployeeData;
  if (!data.is_active) {
    badRequest("공유한 직원이 비활성화되었습니다.");
  }

  return {
    id: doc.id,
    employeeNo: data.employee_no ?? "",
    name: data.name ?? "",
    role: data.role ?? "employee",
  };
}
