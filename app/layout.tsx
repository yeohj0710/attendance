import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "웰니스박스 출퇴근기록부",
  description: "웰니스박스 사내 출퇴근 기록 웹사이트",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
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
