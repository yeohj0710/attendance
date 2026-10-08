import { getScheduleData } from "@/lib/content-schedule";
import { requireContentViewer } from "@/lib/content-auth";
import { withApi } from "@/lib/http";

export const runtime = "nodejs";

/** 노션 「일정」 캘린더. 노션은 5분에 한 번만 읽는다 (lib/content-schedule.ts). */
export async function GET(request: Request) {
  return withApi(async () => {
    await requireContentViewer(request);
    const data = await getScheduleData();
    return Response.json(data, { headers: { "Cache-Control": "private, max-age=60" } });
  });
}
