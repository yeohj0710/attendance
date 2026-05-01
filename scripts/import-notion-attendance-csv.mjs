import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: node --env-file=.env scripts/import-notion-attendance-csv.mjs <csv-path>");
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Firebase environment variables are not configured.");
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    }),
  });
}

const db = getFirestore();
const rows = parseCsv(readFileSync(csvPath, "utf8").replace(/^\uFEFF/, ""));
const now = Timestamp.now();
const employeesByName = await loadEmployeesByName();
const stats = {
  file: basename(csvPath),
  rows: rows.length,
  employeesCreated: 0,
  employeesUpdated: 0,
  recordsUpserted: 0,
  workLogsUpserted: 0,
  skipped: [],
};

for (const row of rows) {
  const title = normalizeSpaces(row["이름"]);
  const date = parseKoreanDate(row["날짜"]);
  const employeeName = getEmployeeName(title, row["태그"]);
  const times = parseTimes(title);

  if (!employeeName || !date || !times.checkIn) {
    stats.skipped.push({ title, date: row["날짜"], reason: "name/date/check-in missing" });
    continue;
  }

  const employeeId = await ensureEmployee(employeeName);
  const checkInAt = toKstTimestamp(date, times.checkIn, 0);
  const checkOutAt = times.checkOut
    ? toKstTimestamp(date, times.checkOut, shouldUseNextDay(times.checkIn, times.checkOut) ? 1 : 0)
    : null;
  const attendanceRef = db.collection("attendance_records").doc(`${employeeId}_${date}`);

  await attendanceRef.set(
    {
      employee_id: employeeId,
      work_date: date,
      check_in_at: checkInAt,
      check_out_at: checkOutAt,
      check_in_ip: null,
      check_out_ip: null,
      check_in_session_id: null,
      check_out_session_id: null,
      work_type: "office",
      note: title,
      source: "admin",
      created_by: "notion-import",
      updated_by: "notion-import",
      created_at: now,
      updated_at: now,
      imported_from: "notion_csv",
      imported_title: title,
    },
    { merge: true },
  );
  stats.recordsUpserted += 1;

  const text = normalizeSpaces(row["텍스트"]);
  if (text) {
    await db.collection("work_logs").doc(`${encodeURIComponent(employeeId)}_${date}`).set(
      {
        employee_id: employeeId,
        work_date: date,
        summary: text,
        created_at: now,
        updated_at: now,
        imported_from: "notion_csv",
      },
      { merge: true },
    );
    stats.workLogsUpserted += 1;
  }
}

console.log(JSON.stringify(stats, null, 2));

async function loadEmployeesByName() {
  const snapshot = await db.collection("employees").get();
  return new Map(
    snapshot.docs.map((doc) => {
      const data = doc.data();
      return [normalizeLoginName(data.name ?? data.employee_no ?? ""), { id: doc.id, data }];
    }),
  );
}

async function ensureEmployee(name) {
  const key = normalizeLoginName(name);
  const existing = employeesByName.get(key);
  if (existing) {
    const update = {
      employee_no: existing.data.employee_no ?? name,
      name: existing.data.name ?? name,
      role: existing.data.role ?? "employee",
      is_active: existing.data.is_active ?? true,
      updated_at: now,
    };
    await db.collection("employees").doc(existing.id).set(update, { merge: true });
    stats.employeesUpdated += 1;
    return existing.id;
  }

  const ref = db.collection("employees").doc();
  await ref.set({
    employee_no: name,
    name,
    role: "employee",
    is_active: true,
    created_at: now,
    updated_at: now,
    imported_from: "notion_csv",
  });
  employeesByName.set(key, { id: ref.id, data: { name, employee_no: name, role: "employee", is_active: true } });
  stats.employeesCreated += 1;
  return ref.id;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }

  const headers = rows.shift() ?? [];
  return rows
    .filter((items) => items.some((item) => item.trim()))
    .map((items) =>
      Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ""])),
    );
}

function parseKoreanDate(value) {
  const match = normalizeSpaces(value).match(/^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일$/);
  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function getEmployeeName(title, tag) {
  const titleMatch = title.match(/^([가-힣]{2,4})(?:\s|$)/);
  if (titleMatch) {
    return titleMatch[1];
  }

  const tagMatch = normalizeSpaces(tag).match(/^([가-힣]{2,4})/);
  return tagMatch?.[1] ?? null;
}

function parseTimes(title) {
  const normalized = title
    .replace(/[~～]/g, "~")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  const timeMatches = [...normalized.matchAll(/(\d{1,2})(?::|시\s*)(\d{2})?/g)].map((match) =>
    normalizeTime(match[1], match[2] ?? "00"),
  );

  if (!timeMatches.length) {
    return { checkIn: null, checkOut: null };
  }

  const hasOpenEndedLastRange = /(?:~|-)\s*(?:$|\(|예정)/.test(normalized.trim());
  return {
    checkIn: timeMatches[0],
    checkOut: timeMatches.length >= 2 && !hasOpenEndedLastRange ? timeMatches[timeMatches.length - 1] : null,
  };
}

function normalizeTime(hour, minute) {
  const numericHour = Number(hour);
  const safeHour = numericHour === 24 ? 0 : numericHour;
  return `${String(safeHour).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
}

function shouldUseNextDay(start, end) {
  return minutes(end) <= minutes(start);
}

function minutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function toKstTimestamp(date, time, dayOffset) {
  const value = new Date(`${date}T${time}:00+09:00`);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  return Timestamp.fromDate(value);
}

function normalizeSpaces(value) {
  return String(value ?? "").normalize("NFC").replace(/\\\\/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLoginName(value) {
  return normalizeSpaces(value).replace(/\s+/g, "");
}
