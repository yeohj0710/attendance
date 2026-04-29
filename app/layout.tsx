import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wellnessbox-attendance.vercel.app";
const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const naverSiteVerification = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "웰니스박스 출퇴근기록부",
    template: "%s | 웰니스박스 출퇴근기록부",
  },
  description: "웰니스박스 구성원을 위한 사내 출퇴근 기록 웹사이트입니다.",
  applicationName: "웰니스박스 출퇴근기록부",
  keywords: [
    "웰니스박스",
    "웰니스박스 출퇴근",
    "웰니스박스 출퇴근기록부",
    "출퇴근 체크",
    "출퇴근 기록",
  ],
  authors: [{ name: "웰니스박스" }],
  creator: "웰니스박스",
  publisher: "웰니스박스",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: "웰니스박스 출퇴근기록부",
    title: "웰니스박스 출퇴근기록부",
    description: "웰니스박스 구성원을 위한 사내 출퇴근 기록 웹사이트입니다.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "웰니스박스 출퇴근기록부",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "웰니스박스 출퇴근기록부",
    description: "웰니스박스 구성원을 위한 사내 출퇴근 기록 웹사이트입니다.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
    ...(naverSiteVerification
      ? { other: { "naver-site-verification": naverSiteVerification } }
      : {}),
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
