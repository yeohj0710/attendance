import { requireAdmin } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { assertOfficeDesktopRequest } from "@/lib/device";
import { withApi } from "@/lib/http";
import type { CollectionReference } from "firebase-admin/firestore";

export const runtime = "nodejs";

const freeTier = {
  readsPerDay: 50_000,
  writesPerDay: 20_000,
  deletesPerDay: 20_000,
  storageGiB: 1,
};

export async function GET(request: Request) {
  return withApi(async () => {
    assertOfficeDesktopRequest(request);
    await requireAdmin(request);

    const db = getDb();
    const [
      employees,
      attendanceRecords,
      workLogs,
      sessions,
      employeeDevices,
    ] = await Promise.all([
      countCollection(db.collection("employees")),
      countCollection(db.collection("attendance_records")),
      countCollection(db.collection("work_logs")),
      countCollection(db.collection("sessions")),
      countCollection(db.collection("employee_devices")),
    ]);

    return Response.json({
      usage: {
        collections: {
          employees,
          attendanceRecords,
          workLogs,
          sessions,
          employeeDevices,
        },
        freeTier,
        measuredAt: new Date().toISOString(),
      },
    });
  });
}

async function countCollection(collection: CollectionReference) {
  const snapshot = await collection.count().get();
  return snapshot.data().count;
}
