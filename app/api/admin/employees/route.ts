import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

type EmployeeRow = {
  employee_no: string;
  name: string;
  role: "employee" | "admin";
};

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    await requireAdmin(request);
    const snapshot = await getDb()
      .collection("employees")
      .where("is_active", "==", true)
      .get();

    return Response.json({
      employees: snapshot.docs
        .map((doc) => {
          const row = doc.data() as EmployeeRow;
          return {
            id: doc.id,
            employeeNo: row.employee_no,
            name: row.name,
            role: row.role,
          };
        })
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.employeeNo.localeCompare(b.employeeNo),
        ),
    });
  });
}
