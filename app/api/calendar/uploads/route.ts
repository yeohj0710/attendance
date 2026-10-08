import { getCalendarUploads } from "@/lib/content-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 콘텐츠팀 캘린더가 PD님 계정 업로드 일정을 노션에서 받는 곳 (lib/content-uploads.ts).
 * 캘린더처럼 로그인 없이 읽는다(영상 제목과 날짜뿐, 지금까지 daily.js 에 그대로 있던 정보). 노션은 5분에 한 번만 읽는다.
 */
export async function GET() {
  try {
    const uploads = await getCalendarUploads();
    return Response.json({ uploads, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch {
    return Response.json({ error: "노션에서 업로드 일정을 읽지 못했어요" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
