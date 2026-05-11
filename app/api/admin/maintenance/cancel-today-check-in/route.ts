import { getDb } from "@/lib/db";
import { badRequest, unauthorized, withApi } from "@/lib/http";
import { getWorkDateString } from "@/lib/time";

export const runtime = "nodejs";

const DEFAULT_ADMIN_PAGE_PASSWORD = "010903";

type EmployeeData = {
  employee_no?: string;
  name?: string;
  is_active?: boolean;
};

type AttendanceData = {
  check_in_at?: unknown;
  check_out_at?: unknown;
};

export async function POST(request: Request) {
  return withApi(async () => {
    const body = (await request.json()) as {
      password?: string;
      employeeName?: string;
    };
    const password = body.password?.trim();
    const employeeName = body.employeeName?.trim();
    const expectedPassword = process.env.ADMIN_PAGE_PASSWORD || DEFAULT_ADMIN_PAGE_PASSWORD;

    if (!password || password !== expectedPassword) {
      unauthorized("관리자 비밀번호가 올바르지 않습니다.");
    }

    if (!employeeName) {
      badRequest("직원 이름을 입력하세요.");
    }

    const db = getDb();
    const normalizedName = normalizeLoginName(employeeName);
    const employees = await db.collection("employees").where("is_active", "==", true).get();
    const matched = employees.docs.filter((doc) => {
      const employee = doc.data() as EmployeeData;
      return (
        normalizeLoginName(employee.name ?? "") === normalizedName ||
        normalizeLoginName(employee.employee_no ?? "") === normalizedName
      );
    });

    if (matched.length !== 1) {
      badRequest("직원을 하나로 특정할 수 없습니다.");
    }

    const workDate = getWorkDateString();
    const recordRef = db.collection("attendance_records").doc(`${matched[0].id}_${workDate}`);
    const record = await recordRef.get();
    if (!record.exists) {
      return Response.json({ ok: true, deleted: false, reason: "not_found", workDate });
    }

    const data = record.data() as AttendanceData;
    if (!data.check_in_at) {
      return Response.json({ ok: true, deleted: false, reason: "no_check_in", workDate });
    }

    if (data.check_out_at) {
      badRequest("이미 퇴근 기록이 있어 자동 삭제하지 않았습니다.");
    }

    await recordRef.delete();
    return Response.json({ ok: true, deleted: true, workDate, recordId: recordRef.id });
  });
}

function normalizeLoginName(value: string) {
  return value.normalize("NFC").replace(/\s+/g, "").trim();
}
