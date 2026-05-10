import { requireAuth } from "@/lib/auth";
import { cancelCheckOut } from "@/lib/attendance";
import { assertAttendanceActionAllowed } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    await assertAttendanceActionAllowed(auth, request);
    const record = await cancelCheckOut(auth);

    return Response.json({ record });
  });
}
