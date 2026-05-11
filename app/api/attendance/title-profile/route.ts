import { requireAuth } from "@/lib/auth";
import { getEmployeeTitleProfile } from "@/lib/attendance";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    const titleProfile = await getEmployeeTitleProfile(auth.employee.id);
    return Response.json({ titleProfile });
  });
}
