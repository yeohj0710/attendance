import { requireAuth } from "@/lib/auth";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { withApi } from "@/lib/http";
import { getWorkLogsForKeys } from "@/lib/work-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const body = (await request.json()) as {
      records?: Array<{ employeeId?: string; workDate?: string }>;
    };
    const workLogs = await getWorkLogsForKeys(Array.isArray(body.records) ? body.records : []);

    return Response.json({ workLogs });
  });
}
