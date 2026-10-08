import { getPipelineData } from "@/lib/content-pipeline";
import { requireContentViewer } from "@/lib/content-auth";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

/** 콘텐츠팀 채널 현황. 노션은 5분에 한 번만 읽는다 (lib/content-pipeline.ts). */
export async function GET(request: Request) {
  return withApi(async () => {
    const viewer = await requireContentViewer(request);
    const data = await getPipelineData();
    /* 노션 결과는 모두가 나눠 쓰고, 보는 사람 이름만 붙여 보낸다 (PD님이면 화면이 담당 채널만 고른다) */
    return Response.json({ ...data, viewer }, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}
