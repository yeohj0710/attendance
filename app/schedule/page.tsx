import type { Metadata } from "next";
import { CompanySchedule } from "@/components/schedule/CompanySchedule";
import "./schedule.css";

export const metadata: Metadata = {
  title: "일정",
  robots: { index: false, follow: false },
};

/** 회사 일정 달력. 노션 메인 「일정」 DB 를 읽고 쓴다 (components/schedule/CompanySchedule.tsx) */
export default function SchedulePage() {
  return <CompanySchedule />;
}
