import { logoutCurrentDevice } from "@/lib/auth";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    await logoutCurrentDevice(request);
    return Response.json({ ok: true });
  });
}
