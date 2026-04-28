import { requireAdmin } from "@/lib/auth";
import { approveDeviceRequest, assertOfficeDesktopRequest } from "@/lib/device";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    const auth = await requireAdmin(request);
    const { id } = await context.params;
    const device = await approveDeviceRequest(auth, id);

    return Response.json({ device });
  });
}
