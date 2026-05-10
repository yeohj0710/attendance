import { requireAuth } from "@/lib/auth";
import { getAttendanceStatus } from "@/lib/attendance";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    const status = await getAttendanceStatus(auth);

    return Response.json(status);
  });
}
