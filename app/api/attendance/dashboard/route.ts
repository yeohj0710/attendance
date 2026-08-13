import { requireAuth } from "@/lib/auth";
import {
  getAttendanceStatus,
  getCompanyTitleProfiles,
  getEmployeeTitleProfile,
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
    // status가 최근 목록까지 같이 돌려준다. 같은 기록을 두 번 읽지 않는다.
    const [status, teamRecords, teamMonth, companyTitleProfiles] = await Promise.all([
      getAttendanceStatus(auth, limit),
      getTeamTodayAttendance(),
      getTeamMonthAttendance(),
      getCompanyTitleProfiles(),
    ]);
    const records = status.recentRecords;
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
