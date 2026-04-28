import { requireAuth } from "@/lib/auth";
import { getAttendanceStatus } from "@/lib/attendance";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);
    const status = await getAttendanceStatus(auth);

    return Response.json(status);
  });
}
