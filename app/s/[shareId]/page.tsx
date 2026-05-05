import type { Metadata } from "next";
import { EmployeeApp } from "@/components/employee/EmployeeApp";
import { getDb } from "@/lib/db";
import { getShareTokenFromShortId, verifyShareToken } from "@/lib/share";
import { getWorkLog } from "@/lib/work-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://wellnessbox-attendance.vercel.app";
const siteName = "웰니스박스 출퇴근기록부";

type SharePageProps = {
  params: Promise<{ shareId: string }>;
};

type EmployeeData = {
  name?: string;
  is_active?: boolean;
};

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { shareId } = await params;
  const url = `/s/${encodeURIComponent(shareId)}`;
  const fallback = getShareMetadata({
    title: siteName,
    description: "웰니스박스 구성원의 공유된 출퇴근 기록입니다.",
    url,
  });

  try {
    const token = await getShareTokenFromShortId(shareId);
    const payload = verifyShareToken(token);
    const ownerName = await getEmployeeName(payload.ownerEmployeeId);

    if (payload.type === "work-log" && payload.targetEmployeeId && payload.workDate) {
      const workLog = await getWorkLog(payload.targetEmployeeId, payload.workDate);
      const taskSummary = workLog.tasks
        .slice(0, 3)
        .map((task) => task.text.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" · ");
      const title = `${formatShareDate(workLog.workDate)} ${workLog.employeeName} 업무 기록`;
      const description =
        taskSummary ||
        `${workLog.workDate} 업무 ${workLog.taskCount}개, 완료 ${workLog.doneCount}개, 댓글 ${workLog.commentCount}개`;

      return getShareMetadata({
        title,
        description: `${workLog.workDate} · ${description}`,
        url,
      });
    }

    return getShareMetadata({
      title: `${ownerName}님의 출퇴근기록부`,
      description: "공유된 웰니스박스 출퇴근기록부 화면입니다.",
      url,
    });
  } catch {
    return fallback;
  }
}

export default function SharedPage() {
  return <EmployeeApp />;
}

function getShareMetadata({
  description,
  title,
  url,
}: {
  description: string;
  title: string;
  url: string;
}): Metadata {
  const imageUrl = "/og-image.png";
  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      siteName,
      title,
      description,
      url,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

async function getEmployeeName(employeeId: string) {
  const doc = await getDb().collection("employees").doc(employeeId).get();
  const data = doc.data() as EmployeeData | undefined;
  if (!doc.exists || !data?.is_active) {
    return "공유";
  }

  return data.name ?? "공유";
}

function formatShareDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) {
    return date;
  }

  const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdayLabels[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${date} (${weekday})`;
}
