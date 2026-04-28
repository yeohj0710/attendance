import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "출퇴근 체크",
  description: "사내 출퇴근 기록 웹사이트",
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
