import {
  updateAdminAttendance,
  type AdminAttendanceInput,
  type WorkType,
} from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";
import { isValidDateString } from "@/lib/time";

export const runtime = "nodejs";

const workTypes: WorkType[] = ["office", "remote", "offsite", "business_trip"];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAdmin(request);
    const { id } = await context.params;
    const input = validateAttendanceInput(
      (await request.json()) as Partial<AdminAttendanceInput>,
    );
    const record = await updateAdminAttendance(auth, id, input);

    return Response.json({ record });
  });
}

function validateAttendanceInput(
  input: Partial<AdminAttendanceInput>,
): AdminAttendanceInput {
  if (!input.employeeId) {
    badRequest("직원을 선택하세요.");
  }

  if (!input.workDate || !isValidDateString(input.workDate)) {
    badRequest("근무일을 YYYY-MM-DD 형식으로 입력하세요.");
  }

  if (!input.workType || !workTypes.includes(input.workType)) {
    badRequest("근무 유형이 올바르지 않습니다.");
  }

  return {
    employeeId: input.employeeId,
    workDate: input.workDate,
    checkInAt: input.checkInAt ?? null,
    checkOutAt: input.checkOutAt ?? null,
    workType: input.workType,
    note: input.note ?? null,
    reason: input.reason ?? null,
  };
}
