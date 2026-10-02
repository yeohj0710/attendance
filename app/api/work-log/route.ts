import { requireAuth } from "@/lib/auth";
import { badRequest, withApi } from "@/lib/http";
import { addWorkLogComment, getWorkLog, saveWorkLog } from "@/lib/work-log";
import type { WorkTask } from "@/lib/work-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

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
    const auth = await requireAuth(request);

    const body = (await request.json()) as {
      employeeId?: string;
      workDate?: string;
      summary?: string;
      tasks?: unknown[];
      deletedTasks?: unknown[];
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
      deletedTasks: Array.isArray(body.deletedTasks)
        ? (body.deletedTasks as Array<{ id?: unknown; text?: unknown }>)
            .slice(0, 80)
            .map((task) => ({
              id: typeof task?.id === "string" ? task.id : undefined,
              text: typeof task?.text === "string" ? task.text : undefined,
            }))
        : [],
    });

    return Response.json({ workLog });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);

    const body = (await request.json()) as {
      employeeId?: string;
      workDate?: string;
      text?: string;
    };

    if (!body.employeeId || !body.workDate) {
      badRequest("직원과 날짜를 선택하세요.");
    }

    const workLog = await addWorkLogComment(auth, {
      employeeId: body.employeeId,
      workDate: body.workDate,
      text: body.text,
    });

    return Response.json({ workLog }, { status: 201 });
  });
}
