import { getPipelineData } from "@/lib/content-pipeline";
import { requireContentViewer } from "@/lib/content-auth";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

/** 콘텐츠팀 채널 현황. 노션은 5분에 한 번만 읽는다 (lib/content-pipeline.ts). */
export async function GET(request: Request) {
  return withApi(async () => {
    await requireContentViewer(request);
    const data = await getPipelineData();
    return Response.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}
