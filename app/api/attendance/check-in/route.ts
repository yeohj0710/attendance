import { requireAuth } from "@/lib/auth";
import { checkIn } from "@/lib/attendance";
import { assertAttendanceActionAllowed } from "@/lib/device";
import { getClientIp } from "@/lib/ip";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    await assertAttendanceActionAllowed(auth, request);
    const record = await checkIn(auth, getClientIp(request));

    return Response.json({ record });
  });
}
