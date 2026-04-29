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
      pinConfirm?: string;
      deviceId?: string;
      deviceFingerprint?: string;
    };
    const employeeName = body.employeeName?.trim();
    const pin = body.pin?.trim();
    const pinConfirm = body.pinConfirm?.trim();
    const deviceId = body.deviceId?.trim();
    const deviceFingerprint = body.deviceFingerprint?.trim();

    if (!employeeName) {
      badRequest("이름을 입력하세요.");
    }

    if (!pin || !/^\d{4}$/.test(pin)) {
      badRequest("4자리 PIN을 입력하세요.");
    }

    if (pinConfirm !== pin) {
      badRequest("PIN이 서로 일치하지 않습니다.");
    }

    if (!deviceId) {
      badRequest("기기 정보를 확인할 수 없습니다.");
    }

    const result = await loginWithPin({
      employeeName,
      pin,
      deviceId,
      deviceFingerprint,
      request,
    });

    return Response.json(result, { status: result.ok ? 200 : 202 });
  });
}
