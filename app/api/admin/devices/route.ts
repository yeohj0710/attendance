import { requireAdmin } from "@/lib/auth";
import { assertOfficeDesktopRequest, listPendingDeviceRequests } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    await requireAdmin(request);
    const devices = await listPendingDeviceRequests();
    return Response.json({ devices });
  });
}
