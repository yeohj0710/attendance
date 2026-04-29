import { assertOfficeDesktopRequest } from "@/lib/device";
import { badRequest, unauthorized, withApi } from "@/lib/http";

export const runtime = "nodejs";

const DEFAULT_ADMIN_PAGE_PASSWORD = "010903";

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);

    const body = (await request.json()) as { password?: string };
    const password = body.password?.trim();
    const expectedPassword =
      process.env.ADMIN_PAGE_PASSWORD ?? DEFAULT_ADMIN_PAGE_PASSWORD;

    if (!password) {
      badRequest("관리자 비밀번호를 입력하세요.");
    }

    if (password !== expectedPassword) {
      unauthorized("관리자 비밀번호가 올바르지 않습니다.");
    }

    return Response.json({ ok: true });
  });
}
