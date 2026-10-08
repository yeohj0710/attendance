import { requireContentViewer } from "@/lib/content-auth";
import { withApi, badRequest } from "@/lib/http";
import { NotionAccessError } from "@/lib/notion";
import {
  archiveCompanyEvent,
  checkRange,
  createCompanyEvent,
  listCompanyEvents,
  updateCompanyEvent,
} from "@/lib/company-schedule";
import type { EventInput } from "@/lib/company-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회사 일정 달력(/schedule)의 노션 「일정」 읽고 쓰기. 로그인한 사람만.
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD, POST 새로 만들기, PATCH {id, ...바꿀 칸} 고치기, DELETE {id} 휴지통, PATCH {id, restore:true} 되살리기.
 */
async function guarded(request: Request, run: () => Promise<Response>) {
  return withApi(async () => {
    await requireContentViewer(request);
    try {
      return await run();
    } catch (error) {
      if (error instanceof NotionAccessError) {
        const message =
          error.status === 403 || error.status === 404
            ? "노션 「일정」에 쓰기 권한이 없어요. 노션에서 통합 연결을 확인해 주세요."
            : error.status === 429
              ? "노션이 잠깐 바빠요. 조금 뒤에 다시 해 주세요."
              : `노션 오류: ${error.message}`;
        return Response.json({ error: message }, { status: error.status === 429 ? 429 : 502 });
      }
      throw error;
    }
  });
}

async function body(request: Request) {
  try {
    return (await request.json()) as EventInput & { id?: unknown; restore?: unknown };
  } catch {
    badRequest("요청 본문이 이상합니다.");
  }
}

export async function GET(request: Request) {
  return guarded(request, async () => {
    const url = new URL(request.url);
    const { from, to } = checkRange(url.searchParams.get("from"), url.searchParams.get("to"));
    const events = await listCompanyEvents(from, to);
    return Response.json({ from, to, events }, { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(request: Request) {
  return guarded(request, async () => {
    const input = await body(request);
    return Response.json({ event: await createCompanyEvent(input) });
  });
}

export async function PATCH(request: Request) {
  return guarded(request, async () => {
    const input = await body(request);
    if (typeof input.id !== "string") badRequest("일정 id 가 필요합니다.");
    const id = input.id as string;
    if (input.restore === true) return Response.json({ event: await archiveCompanyEvent(id, false) });
    const { id: _id, restore: _restore, ...fields } = input;
    void _id;
    void _restore;
    return Response.json({ event: await updateCompanyEvent(id, fields) });
  });
}

export async function DELETE(request: Request) {
  return guarded(request, async () => {
    const input = await body(request);
    if (typeof input.id !== "string") badRequest("일정 id 가 필요합니다.");
    await archiveCompanyEvent(input.id as string, true);
    return Response.json({ ok: true });
  });
}
