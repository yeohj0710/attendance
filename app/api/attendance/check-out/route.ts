import { requireAuth } from "@/lib/auth";
import { checkOut } from "@/lib/attendance";
import { assertOfficeDesktopRequest, verifyApprovedDevice } from "@/lib/device";
import { getClientIp } from "@/lib/ip";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAuth(request);
    await verifyApprovedDevice(auth, request);
    const record = await checkOut(auth, getClientIp(request));

    return Response.json({ record });
  });
}
