import { requireAuth } from "@/lib/auth";
import {
  getAttendanceStatus,
  getRecentAttendance,
  getTeamTodayAttendance,
} from "@/lib/attendance";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 31);
    const [status, records, teamRecords] = await Promise.all([
      getAttendanceStatus(auth),
      getRecentAttendance(auth.employee.id, limit),
      getTeamTodayAttendance(),
    ]);

    return Response.json({
      employee: auth.employee,
      status,
      records,
      teamRecords,
    });
  });
}
