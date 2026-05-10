import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getWorkCommentNotifications } from "@/lib/work-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

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
