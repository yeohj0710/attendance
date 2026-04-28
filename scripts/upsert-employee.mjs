import { neon } from "@neondatabase/serverless";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const databaseUrl = process.env.DATABASE_URL;
const employeeNo = args.get("--employee-no");
const name = args.get("--name");
const pin = args.get("--pin");
const role = args.get("--role") ?? "employee";

if (!databaseUrl || !employeeNo || !name || !pin) {
  console.error(
    "Usage: DATABASE_URL=... npm run db:upsert-employee -- --employee-no E001 --name 홍길동 --pin 1234 --role employee",
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

const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(pin, salt, 120_000, 32, "sha256").toString("hex");
const sql = neon(databaseUrl);

await sql`
  insert into employees (employee_no, name, role, pin_hash, pin_salt)
  values (${employeeNo}, ${name}, ${role}, ${hash}, ${salt})
  on conflict (employee_no)
  do update set
    name = excluded.name,
    role = excluded.role,
    pin_hash = excluded.pin_hash,
    pin_salt = excluded.pin_salt,
    is_active = true
`;

console.log(`Upserted ${employeeNo} (${name}) as ${role}.`);
