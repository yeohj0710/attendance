import { requireAuth } from "@/lib/auth";
import { getRecentAttendance } from "@/lib/attendance";
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
    const records = await getRecentAttendance(auth.employee.id, limit);

    return Response.json({ records });
  });
}
