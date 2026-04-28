import { listAdminAttendance } from "@/lib/attendance";
import { requireAdmin } from "@/lib/auth";
import { attendanceToCsv } from "@/lib/csv";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";
import { isValidDateString } from "@/lib/time";

export const runtime = "nodejs";

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
    const csv = `\uFEFF${attendanceToCsv(records)}`;

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="attendance.csv"',
      },
    });
  });
}

function validateOptionalDate(value: string | null, label: string) {
  if (value && !isValidDateString(value)) {
    badRequest(`${label} 형식이 올바르지 않습니다.`);
  }
}
