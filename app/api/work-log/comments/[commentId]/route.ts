import { requireAuth } from "@/lib/auth";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";
import { deleteWorkLogComment, updateWorkLogComment } from "@/lib/work-log";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const { commentId } = await context.params;
    const body = (await request.json()) as {
      employeeId?: string;
      workDate?: string;
      text?: string;
    };

    if (!body.employeeId || !body.workDate) {
      badRequest("직원과 날짜를 선택하세요.");
    }

    const workLog = await updateWorkLogComment(auth, {
      employeeId: body.employeeId,
      workDate: body.workDate,
      commentId,
      text: body.text,
    });

    return Response.json({ workLog });
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ commentId: string }> },
) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);

    const { commentId } = await context.params;
    const url = new URL(request.url);
    const employeeId = url.searchParams.get("employeeId")?.trim();
    const workDate = url.searchParams.get("workDate")?.trim();

    if (!employeeId || !workDate) {
      badRequest("직원과 날짜를 선택하세요.");
    }

    const workLog = await deleteWorkLogComment(auth, {
      employeeId,
      workDate,
      commentId,
    });

    return Response.json({ workLog });
  });
}
