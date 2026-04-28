import { assertOfficeDesktopRequest, isLikelyDesktopRequest } from "@/lib/device";
import { getClientIp, isOfficeIp } from "@/lib/ip";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApi(async () => {
    const ip = getClientIp(request);
    return Response.json({
      detectedIp: ip,
      isOfficeIp: isOfficeIp(ip),
      isDesktop: isLikelyDesktopRequest(request),
    });
  });
}

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    return Response.json({ ok: true });
  });
}
