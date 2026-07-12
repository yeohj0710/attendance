import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const employeeName = args.get("--employee-name");
const workDate = args.get("--work-date");
const checkIn = args.get("--check-in");
const reason = args.get("--reason");
const dryRun = process.argv.includes("--dry-run");
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Firebase environment variables are not configured.");
}
if (!employeeName || !/^\d{4}-\d{2}-\d{2}$/.test(workDate ?? "") || !checkIn || !reason) {
  throw new Error(
    "Usage: npm run db:fix-check-in -- --employee-name <name> --work-date YYYY-MM-DD --check-in <ISO timestamp> --reason <text>",
  );
}

const checkInAt = new Date(checkIn);
if (Number.isNaN(checkInAt.getTime())) {
  throw new Error("--check-in must be a valid ISO timestamp with an explicit timezone.");
}

const kstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(checkInAt);
if (kstDate !== workDate) {
  throw new Error(`Check-in KST date ${kstDate} does not match work date ${workDate}.`);
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
const employees = await db.collection("employees").where("name", "==", employeeName).get();
if (employees.size !== 1) {
  throw new Error(`Expected exactly one employee named ${employeeName}; found ${employees.size}.`);
}

const employee = employees.docs[0];
const recordId = `${employee.id}_${workDate}`;
const recordRef = db.collection("attendance_records").doc(recordId);
const record = await recordRef.get();
if (!record.exists) {
  throw new Error(`Attendance record ${recordId} does not exist.`);
}

const before = record.data();
if (before.employee_id !== employee.id || before.work_date !== workDate) {
  throw new Error("Attendance record identity does not match the requested employee and work date.");
}

const now = Timestamp.now();
const after = {
  ...before,
  check_in_at: Timestamp.fromDate(checkInAt),
  source: "admin",
  updated_by: "codex-maintenance",
  updated_at: now,
};

console.log(JSON.stringify({ dryRun, recordId, before: serialize(before), after: serialize(after), reason }, null, 2));

if (!dryRun) {
  const batch = db.batch();
  batch.update(recordRef, {
    check_in_at: after.check_in_at,
    source: after.source,
    updated_by: after.updated_by,
    updated_at: after.updated_at,
  });
  batch.set(db.collection("attendance_audit_logs").doc(), {
    attendance_record_id: recordId,
    action: "update",
    changed_by: "codex-maintenance",
    changed_at: now,
    before_data: serialize(before),
    after_data: serialize(after),
    reason,
  });
  await batch.commit();

  const saved = await recordRef.get();
  console.log(JSON.stringify({ saved: serialize(saved.data()) }, null, 2));
}

function serialize(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, toSerializable(value)]),
  );
}

function toSerializable(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}
