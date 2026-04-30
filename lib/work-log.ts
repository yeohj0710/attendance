import { randomUUID } from "node:crypto";
import { getDb, nowTimestamp, timestampToIso } from "@/lib/db";
import { badRequest, forbidden } from "@/lib/http";
import { isValidDateString } from "@/lib/time";
import type { AuthContext } from "@/lib/auth";

export type WorkTaskSection = "today" | "later";

export type WorkTask = {
  id: string;
  text: string;
  done: boolean;
  section: WorkTaskSection;
  createdAt: string;
  updatedAt: string;
};

export type WorkLog = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  summary: string;
  tasks: WorkTask[];
  taskCount: number;
  doneCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkLogSummary = {
  employeeId: string;
  workDate: string;
  taskCount: number;
  doneCount: number;
};

type WorkLogData = {
  employee_id: string;
  work_date: string;
  summary?: string | null;
  tasks?: Array<{
    id?: string;
    text?: string;
    done?: boolean;
    section?: WorkTaskSection;
    created_at?: string;
    updated_at?: string;
  }>;
  created_at?: unknown;
  updated_at?: unknown;
};

type EmployeeData = {
  name?: string;
  is_active?: boolean;
};

type WorkTaskInput = Partial<WorkTask> & {
  text?: string;
  created_at?: string;
  updated_at?: string;
};

export async function getWorkLog(employeeId: string, workDate: string) {
  validateWorkLogKey(employeeId, workDate);

  const db = getDb();
  const [employeeDoc, logDoc] = await Promise.all([
    db.collection("employees").doc(employeeId).get(),
    db.collection("work_logs").doc(getWorkLogDocId(employeeId, workDate)).get(),
  ]);

  const employee = employeeDoc.data() as EmployeeData | undefined;
  if (!employeeDoc.exists || !employee?.is_active) {
    badRequest("직원 정보를 찾을 수 없습니다.");
  }

  if (!logDoc.exists) {
    const carryoverTasks = await getCarryoverTasks(employeeId, workDate);
    const workLog = emptyWorkLog(employeeId, employee.name ?? "", workDate);
    return {
      ...workLog,
      tasks: carryoverTasks,
      taskCount: carryoverTasks.length,
    };
  }

  return mapWorkLog(logDoc.data() as WorkLogData, employee.name ?? "");
}

export async function saveWorkLog(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    summary?: string;
    tasks?: WorkTaskInput[];
  },
) {
  validateWorkLogKey(input.employeeId, input.workDate);

  if (auth.employee.id !== input.employeeId && auth.employee.role !== "admin") {
    forbidden("본인의 업무 기록만 수정할 수 있습니다.");
  }

  const db = getDb();
  const employeeDoc = await db.collection("employees").doc(input.employeeId).get();
  const employee = employeeDoc.data() as EmployeeData | undefined;
  if (!employeeDoc.exists || !employee?.is_active) {
    badRequest("직원 정보를 찾을 수 없습니다.");
  }

  const now = new Date().toISOString();
  const tasks = normalizeTasks(input.tasks ?? [], now);
  const docRef = db.collection("work_logs").doc(getWorkLogDocId(input.employeeId, input.workDate));
  const currentDoc = await docRef.get();

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: normalizeSummary(input.summary),
    tasks: tasks.map((task) => ({
      id: task.id,
      text: task.text,
      done: task.done,
      section: task.section,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    })),
    created_at: currentDoc.exists ? currentDoc.data()?.created_at : nowTimestamp(),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });
  return mapWorkLog(data, employee.name ?? "");
}

export async function getWorkLogSummariesForRange(startDate: string, endDate: string) {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    return [];
  }

  const snapshot = await getDb()
    .collection("work_logs")
    .where("work_date", ">=", startDate)
    .where("work_date", "<=", endDate)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data() as WorkLogData;
    const tasks = normalizeTasks(data.tasks ?? [], new Date().toISOString());
    return {
      employeeId: data.employee_id,
      workDate: data.work_date,
      taskCount: tasks.length,
      doneCount: tasks.filter((task) => task.done).length,
    } satisfies WorkLogSummary;
  });
}

function getWorkLogDocId(employeeId: string, workDate: string) {
  return `${encodeURIComponent(employeeId)}_${workDate}`;
}

function validateWorkLogKey(employeeId: string, workDate: string) {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  if (!isValidDateString(workDate)) {
    badRequest("날짜 형식이 올바르지 않습니다.");
  }
}

function normalizeSummary(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 2000);
}

function normalizeTasks(tasks: WorkTaskInput[], now: string) {
  return tasks
    .map((task) => {
      const text = (task.text ?? "").trim().slice(0, 300);
      if (!text) {
        return null;
      }

      const section: WorkTaskSection = task.section === "later" ? "later" : "today";
      const rawCreatedAt = task.createdAt ?? task.created_at;
      const rawUpdatedAt = task.updatedAt ?? task.updated_at;
      const createdAt =
        rawCreatedAt && !Number.isNaN(new Date(rawCreatedAt).getTime())
          ? rawCreatedAt
          : now;
      const updatedAt =
        rawUpdatedAt && !Number.isNaN(new Date(rawUpdatedAt).getTime())
          ? rawUpdatedAt
          : now;

      return {
        id: task.id && task.id.length <= 80 ? task.id : randomUUID(),
        text,
        done: Boolean(task.done),
        section,
        createdAt,
        updatedAt,
      } satisfies WorkTask;
    })
    .filter((task): task is WorkTask => task !== null)
    .slice(0, 80);
}

async function getCarryoverTasks(employeeId: string, workDate: string) {
  const snapshot = await getDb()
    .collection("work_logs")
    .where("employee_id", "==", employeeId)
    .get();
  const now = new Date().toISOString();
  const seenTexts = new Set<string>();
  const carryoverTasks: WorkTask[] = [];

  const previousLogs = snapshot.docs
    .map((doc) => doc.data() as WorkLogData)
    .filter((data) => data.work_date < workDate)
    .sort((a, b) => b.work_date.localeCompare(a.work_date));

  for (const log of previousLogs) {
    const tasks = normalizeTasks(log.tasks ?? [], now);
    for (const task of tasks) {
      const key = task.text.trim();
      if (!key || seenTexts.has(key)) {
        continue;
      }

      seenTexts.add(key);
      if (!task.done) {
        carryoverTasks.push({
          ...task,
          id: randomUUID(),
          done: false,
          section: "today",
          createdAt: now,
          updatedAt: now,
        });
      }

      if (carryoverTasks.length >= 80) {
        return carryoverTasks;
      }
    }
  }

  return carryoverTasks;
}

function emptyWorkLog(employeeId: string, employeeName: string, workDate: string): WorkLog {
  return {
    employeeId,
    employeeName,
    workDate,
    summary: "",
    tasks: [],
    taskCount: 0,
    doneCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}

function mapWorkLog(data: WorkLogData, employeeName: string): WorkLog {
  const tasks = normalizeTasks(data.tasks ?? [], new Date().toISOString());

  return {
    employeeId: data.employee_id,
    employeeName,
    workDate: data.work_date,
    summary: data.summary ?? "",
    tasks,
    taskCount: tasks.length,
    doneCount: tasks.filter((task) => task.done).length,
    createdAt: timestampToIso(data.created_at),
    updatedAt: timestampToIso(data.updated_at),
  };
}
