import { requireAuth } from "@/lib/auth";
import {
  getAttendanceStatus,
  getEmployeeTitleProfile,
  getCompanyTitleProfiles,
  getRecentAttendance,
  getTeamMonthAttendance,
  getTeamTodayAttendance,
} from "@/lib/attendance";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 31);
    const [status, records, teamRecords, teamMonth, companyTitleProfiles] = await Promise.all([
      getAttendanceStatus(auth),
      getRecentAttendance(auth.employee.id, limit),
      getTeamTodayAttendance(),
      getTeamMonthAttendance(),
      getCompanyTitleProfiles(),
    ]);
    const titleProfile =
      companyTitleProfiles.find((profile) => profile.employeeId === auth.employee.id) ??
      (await getEmployeeTitleProfile(auth.employee.id));

    return Response.json({
      employee: auth.employee,
      status,
      records,
      teamRecords,
      teamMonth,
      titleProfile,
      companyTitleProfiles,
    });
  });
}
