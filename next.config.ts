import type { NextConfig } from "next";

/* 콘텐츠팀 캘린더(public/content). JS, CSS 는 주소에 ?v=내용해시 가 붙어서 오래 둬도 된다 (scripts/stamp-content.mjs).
   HTML 은 매번 새로 받는다. 검색에는 안 나오게 한다. */
const CONTENT_ASSET_CACHE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/content/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        source: "/content/:file([a-z]+\.(?:js|css))",
        headers: [{ key: "Cache-Control", value: CONTENT_ASSET_CACHE }],
      },
    ];
  },
  async redirects() {
    return [{ source: "/content", destination: "/content/index.html", permanent: false }];
  },
};

export default nextConfig;
