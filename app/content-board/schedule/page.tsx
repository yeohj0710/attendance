import type { Metadata } from "next";
import { ScheduleCalendar } from "@/components/content/ScheduleCalendar";

export const metadata: Metadata = { title: "일정 달력" };

export default function ContentSchedulePage() {
  return <ScheduleCalendar />;
}
