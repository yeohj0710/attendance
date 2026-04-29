import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const name = args.get("--name");
const employeeNo = args.get("--employee-no") ?? name;
const pin = args.get("--pin");
const role = args.get("--role") ?? "employee";

if (!projectId || !clientEmail || !privateKey || !name || !pin) {
  console.error(
    "Usage: FIREBASE_PROJECT_ID=... FIREBASE_CLIENT_EMAIL=... FIREBASE_PRIVATE_KEY=... npm run db:upsert-employee -- --name 홍길동 --pin 1234 --role employee",
  );
  process.exit(1);
}

if (!/^\d{4}$/.test(pin)) {
  console.error("PIN must be exactly 4 digits.");
  process.exit(1);
}

if (!["employee", "admin"].includes(role)) {
  console.error("Role must be employee or admin.");
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

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(pin, salt, 120_000, 32, "sha256").toString("hex");
const db = getFirestore();
const snapshot = await db
  .collection("employees")
  .where("employee_no", "==", employeeNo)
  .limit(1)
  .get();
const ref = snapshot.docs[0]?.ref ?? db.collection("employees").doc();
const now = Timestamp.now();

await ref.set(
  {
    employee_no: employeeNo,
    name,
    role,
    pin_hash: hash,
    pin_salt: salt,
    is_active: true,
    created_at: snapshot.docs[0]?.data().created_at ?? now,
    updated_at: now,
  },
  { merge: true },
);

console.log(`Upserted ${employeeNo} (${name}) as ${role}.`);
