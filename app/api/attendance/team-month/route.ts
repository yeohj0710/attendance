import { requireAuth } from "@/lib/auth";
import { getTeamMonthAttendance } from "@/lib/attendance";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const teamMonth = await getTeamMonthAttendance(month);

    return Response.json({ teamMonth });
  });
}
