import {
  createAdminAttendance,
  listAdminAttendance,
  type AdminAttendanceInput,
  type WorkType,
} from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";
import { isValidDateString } from "@/lib/time";

export const runtime = "nodejs";

const workTypes: WorkType[] = ["office", "remote", "offsite", "business_trip"];

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const employeeId = searchParams.get("employeeId");

    validateOptionalDate(startDate, "시작일");
    validateOptionalDate(endDate, "종료일");

    const records = await listAdminAttendance({
      startDate,
      endDate,
      employeeId: employeeId || null,
    });

    return Response.json({ records });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAdmin(request);
    const input = validateAttendanceInput(
      (await request.json()) as Partial<AdminAttendanceInput>,
    );
    const record = await createAdminAttendance(auth, input);

    return Response.json({ record }, { status: 201 });
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

function validateOptionalDate(value: string | null, label: string) {
  if (value && !isValidDateString(value)) {
    badRequest(`${label} 형식이 올바르지 않습니다.`);
  }
}
