import { NextResponse } from "next/server";

export function GET() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://wellnessbox-attendance.vercel.app";

  return NextResponse.redirect(`${siteUrl}/sitemap.xml`, 308);
}
