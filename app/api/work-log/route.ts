import { requireAuth } from "@/lib/auth";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";
import { getWorkLog, saveWorkLog } from "@/lib/work-log";
import type { WorkTask } from "@/lib/work-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId")?.trim();
    const workDate = url.searchParams.get("workDate")?.trim();

    if (!employeeId || !workDate) {
      badRequest("직원과 날짜를 선택하세요.");
    }

    const workLog = await getWorkLog(employeeId, workDate);
    return Response.json({ workLog });
  });
}

export async function PUT(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const body = (await request.json()) as {
      employeeId?: string;
      workDate?: string;
      summary?: string;
      tasks?: unknown[];
    };

    if (!body.employeeId || !body.workDate) {
      badRequest("직원과 날짜를 선택하세요.");
    }

    const workLog = await saveWorkLog(auth, {
      employeeId: body.employeeId,
      workDate: body.workDate,
      summary: body.summary,
      tasks: Array.isArray(body.tasks)
        ? (body.tasks as Array<Partial<WorkTask> & { text?: string }>)
        : [],
    });

    return Response.json({ workLog });
  });
}
