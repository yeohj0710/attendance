import { requireAdmin } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

type EmployeeRow = {
  id: string;
  employee_no: string;
  name: string;
  role: "employee" | "admin";
};

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    await requireAdmin(request);
    const sql = getSql();
    const rows = await sql<EmployeeRow[]>`
      select id, employee_no, name, role
      from employees
      where is_active = true
      order by name asc, employee_no asc
    `;

    return Response.json({
      employees: rows.map((row) => ({
        id: row.id,
        employeeNo: row.employee_no,
        name: row.name,
        role: row.role,
      })),
    });
  });
}
