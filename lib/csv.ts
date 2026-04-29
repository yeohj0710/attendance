import type { AttendanceRecord } from "@/lib/attendance";

const workTypeLabels: Record<string, string> = {
  office: "사무실",
  remote: "재택",
  offsite: "외근",
  business_trip: "출장",
};

export function attendanceToCsv(records: AttendanceRecord[]) {
  const headers = [
    "날짜",
    "사번",
    "이름",
    "출근시각(KST)",
    "퇴근시각(KST)",
    "근무유형",
    "메모",
    "출근IP",
    "퇴근IP",
    "출근기기",
    "퇴근기기",
  ];

  const rows = records.map((record) => [
    record.workDate,
    record.employeeNo ?? "",
    record.employeeName ?? "",
    formatKst(record.checkInAt),
    formatKst(record.checkOutAt),
    workTypeLabels[record.workType] ?? record.workType,
    record.note ?? "",
    formatIp(record.checkInIp),
    formatIp(record.checkOutIp),
    shortDevice(record.checkInDeviceId),
    shortDevice(record.checkOutDeviceId),
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value: string) {
  const escaped = value.replaceAll('"', '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function formatKst(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function shortDevice(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "";
}

function formatIp(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  if (value === "::1" || value === "127.0.0.1" || value === "::ffff:127.0.0.1") {
    return "개발환경(localhost)";
  }

  if (value === "auto") {
    return "자동마감";
  }

  return value;
}
