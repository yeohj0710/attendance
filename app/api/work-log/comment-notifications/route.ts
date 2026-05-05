import { requireAuth } from "@/lib/auth";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";
import { getWorkCommentNotifications } from "@/lib/work-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const url = new URL(request.url);
    const checkedAt = new Date().toISOString();
    const since = url.searchParams.get("since")?.trim() || checkedAt;
    const notifications = await getWorkCommentNotifications(auth.employee.id, since);

    return Response.json({
      checkedAt,
      notifications,
    });
  });
}
