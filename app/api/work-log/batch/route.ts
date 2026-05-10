import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";
import { getWorkLogsForKeys } from "@/lib/work-log";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

    const body = (await request.json()) as {
      records?: Array<{ employeeId?: string; workDate?: string }>;
    };
    const workLogs = await getWorkLogsForKeys(Array.isArray(body.records) ? body.records : []);

    return Response.json({ workLogs });
  });
}
