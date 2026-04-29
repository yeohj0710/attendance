import { loginWithPin } from "@/lib/auth";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { badRequest, withApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);

    const body = (await request.json()) as {
      employeeName?: string;
      pin?: string;
      deviceId?: string;
    };
    const employeeName = body.employeeName?.trim();
    const pin = body.pin?.trim();
    const deviceId = body.deviceId?.trim();

    if (!employeeName) {
      badRequest("이름을 입력하세요.");
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      badRequest("4자리 PIN을 입력하세요.");
    }

    if (!deviceId) {
      badRequest("기기 정보를 확인할 수 없습니다.");
    }

    const result = await loginWithPin({
      employeeName,
      pin,
      deviceId,
      request,
    });

    return Response.json(result, { status: result.ok ? 200 : 202 });
  });
}
