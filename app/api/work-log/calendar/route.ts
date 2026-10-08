import { requireAuth } from "@/lib/auth";
import { badRequest, withApi } from "@/lib/http";
import { importCalendarTasks } from "@/lib/work-log";
import type { CalendarTaskInput } from "@/lib/work-log";

export const runtime = "nodejs";

/** 콘텐츠팀 캘린더의 오늘 할 일을 본인 업무일지에 넣는다. 화면이 바뀐 게 있을 때만 부른다. */
export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    const body = (await request.json()) as {
      employeeId?: string;
      workDate?: string;
      items?: unknown[];
      keyPrefix?: string;
    };

    if (!body.employeeId || !body.workDate || !Array.isArray(body.items)) {
      badRequest("직원과 날짜, 업무 목록이 필요합니다.");
    }

    const workLog = await importCalendarTasks(auth, {
      employeeId: body.employeeId,
      workDate: body.workDate,
      items: body.items as CalendarTaskInput[],
      keyPrefix: typeof body.keyPrefix === "string" ? body.keyPrefix : undefined,
    });
    return Response.json({ workLog });
  });
}
