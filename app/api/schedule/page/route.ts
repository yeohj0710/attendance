import { requireContentViewer } from "@/lib/content-auth";
import { withApi, badRequest } from "@/lib/http";
import { NotionAccessError } from "@/lib/notion";
import { addScheduleComment, getSchedulePage, saveScheduleBody, startScheduleBody } from "@/lib/company-schedule-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 회사 일정 한 페이지 열기 (노션 페이지처럼 속성, 댓글, 본문).
 * GET ?id= 읽기. POST {id, action:"body", ops} 본문 고치기, {id, action:"start", blocks} 빈 본문에 첫 블록, {id, action:"comment", text} 댓글.
 */
async function guarded(request: Request, run: () => Promise<Response>) {
  return withApi(async () => {
    await requireContentViewer(request);
    try {
      return await run();
    } catch (error) {
      if (error instanceof NotionAccessError) {
        const message =
          error.status === 403
            ? "노션에서 이 일을 할 권한이 없어요. 노션 통합 권한을 확인해 주세요."
            : error.status === 404
              ? "노션에서 이 페이지나 블록을 찾지 못했어요. 새로고침해 주세요."
              : error.status === 409
                ? "노션에서 동시에 고쳐지고 있어요. 잠깐 뒤에 다시 해 주세요."
                : error.status === 429
                  ? "노션이 잠깐 바빠요. 조금 뒤에 다시 해 주세요."
                  : `노션 오류: ${error.message}`;
        return Response.json({ error: message }, { status: error.status === 429 || error.status === 409 ? error.status : 502 });
      }
      throw error;
    }
  });
}

export async function GET(request: Request) {
  return guarded(request, async () => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) badRequest("일정 id 가 필요합니다.");
    return Response.json(await getSchedulePage(id as string), { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(request: Request) {
  return guarded(request, async () => {
    let body: { id?: unknown; action?: unknown; ops?: unknown; blocks?: unknown; text?: unknown };
    try {
      body = await request.json();
    } catch {
      badRequest("요청 본문이 이상합니다.");
    }
    if (typeof body!.id !== "string") badRequest("일정 id 가 필요합니다.");
    const id = body!.id as string;
    if (body!.action === "body") return Response.json(await saveScheduleBody(id, body!.ops));
    if (body!.action === "start") return Response.json(await startScheduleBody(id, body!.blocks));
    if (body!.action === "comment") return Response.json({ comment: await addScheduleComment(id, body!.text) });
    badRequest("모르는 요청입니다.");
  });
}
