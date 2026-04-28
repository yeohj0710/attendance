import { requireAuth } from "@/lib/auth";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const auth = await requireAuth(request);
    return Response.json({
      employee: auth.employee,
      session: {
        expiresAt: auth.session.expiresAt,
      },
    });
  });
}
