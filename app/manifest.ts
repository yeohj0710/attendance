import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "웰니스박스 업무 시스템",
    short_name: "업무 시스템",
    description: "웰니스박스 구성원의 출퇴근 기록, 업무일지, 콘텐츠팀 채널 현황을 보는 업무 시스템",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fbff",
    theme_color: "#4568f5",
    lang: "ko-KR",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
