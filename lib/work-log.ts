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
  order?: number;
  completedOrder?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkComment = {
  id: string;
  authorEmployeeId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type WorkLog = {
  employeeId: string;
  employeeName: string;
  workDate: string;
  summary: string;
  tasks: WorkTask[];
  taskCount: number;
  doneCount: number;
  comments: WorkComment[];
  commentCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type WorkLogSummary = {
  employeeId: string;
  workDate: string;
  taskCount: number;
  doneCount: number;
  commentCount: number;
};

export type WorkCommentNotification = {
  id: string;
  authorEmployeeId: string;
  authorName: string;
  text: string;
  createdAt: string;
  workDate: string;
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
    order?: number;
    completed_order?: number | null;
    created_at?: string;
    updated_at?: string;
  }>;
  comments?: Array<{
    id?: string;
    author_employee_id?: string;
    author_name?: string;
    text?: string;
    created_at?: string;
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
  completed_order?: number | null;
  created_at?: string;
  updated_at?: string;
};

const CARRYOVER_START_DATE = "2026-05-01";

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
    const carryoverTasks =
      workDate >= CARRYOVER_START_DATE ? await getCarryoverTasks(employeeId, workDate) : [];
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

  if (auth.employee.id !== input.employeeId) {
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
  const currentData = currentDoc.data() as WorkLogData | undefined;

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: normalizeSummary(input.summary),
    tasks: tasks.map((task) => ({
      id: task.id,
      text: task.text,
      done: task.done,
      section: task.section,
      order: task.order,
      completed_order: task.completedOrder ?? null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    })),
    comments: normalizeComments(currentData?.comments ?? []),
    created_at: currentDoc.exists ? currentData?.created_at : nowTimestamp(),
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
      commentCount: normalizeComments(data.comments ?? []).length,
    } satisfies WorkLogSummary;
  });
}

export async function getWorkCommentNotifications(employeeId: string, since: string) {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  const sinceTime = Date.parse(since);
  if (!Number.isFinite(sinceTime)) {
    badRequest("댓글 확인 기준 시간이 올바르지 않습니다.");
  }

  const snapshot = await getDb()
    .collection("work_logs")
    .where("employee_id", "==", employeeId)
    .get();

  return snapshot.docs
    .flatMap((doc) => {
      const data = doc.data() as WorkLogData;
      return normalizeComments(data.comments ?? [])
        .filter(
          (comment) =>
            Boolean(comment.authorEmployeeId.trim()) &&
            comment.authorEmployeeId !== employeeId &&
            Date.parse(comment.createdAt) > sinceTime,
        )
        .map((comment) => ({
          ...comment,
          workDate: data.work_date,
        }));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20) satisfies WorkCommentNotification[];
}

export async function addWorkLogComment(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    text?: string;
  },
) {
  validateWorkLogKey(input.employeeId, input.workDate);

  const text = normalizeCommentText(input.text);
  if (!text) {
    badRequest("댓글을 입력하세요.");
  }
  if (!auth.employee.id.trim() || !auth.employee.name.trim()) {
    badRequest("댓글 작성자 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
  }

  const db = getDb();
  const [employeeDoc, authorDoc] = await Promise.all([
    db.collection("employees").doc(input.employeeId).get(),
    db.collection("employees").doc(auth.employee.id).get(),
  ]);
  const employee = employeeDoc.data() as EmployeeData | undefined;
  if (!employeeDoc.exists || !employee?.is_active) {
    badRequest("직원 정보를 찾을 수 없습니다.");
  }
  const author = authorDoc.data() as EmployeeData | undefined;
  if (!authorDoc.exists || !author?.is_active || !author.name?.trim()) {
    badRequest("댓글 작성자 정보를 확인할 수 없습니다. 다시 로그인해주세요.");
  }

  const now = new Date().toISOString();
  const docRef = db.collection("work_logs").doc(getWorkLogDocId(input.employeeId, input.workDate));
  const currentDoc = await docRef.get();
  const currentData = currentDoc.data() as WorkLogData | undefined;
  const comments = [
    ...normalizeComments(currentData?.comments ?? []),
    {
      id: randomUUID(),
      authorEmployeeId: auth.employee.id,
      authorName: author.name,
      text,
      createdAt: now,
    },
  ];

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: currentData?.summary ?? "",
    tasks: currentData?.tasks ?? [],
    comments: comments.map((comment) => ({
      id: comment.id,
      author_employee_id: comment.authorEmployeeId,
      author_name: comment.authorName,
      text: comment.text,
      created_at: comment.createdAt,
    })),
    created_at: currentDoc.exists ? currentData?.created_at : nowTimestamp(),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });
  return mapWorkLog(data, employee.name ?? "");
}

export async function updateWorkLogComment(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    commentId: string;
    text?: string;
  },
) {
  validateWorkLogKey(input.employeeId, input.workDate);
  const text = normalizeCommentText(input.text);
  if (!text) {
    badRequest("댓글을 입력하세요.");
  }

  return mutateWorkLogComment(auth, input, (comments) =>
    comments.map((comment) =>
      comment.id === input.commentId ? { ...comment, text } : comment,
    ),
  );
}

export async function deleteWorkLogComment(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    commentId: string;
  },
) {
  validateWorkLogKey(input.employeeId, input.workDate);
  return mutateWorkLogComment(auth, input, (comments) =>
    comments.filter((comment) => comment.id !== input.commentId),
  );
}

export async function getWorkLogsForKeys(
  records: Array<{ employeeId?: string; workDate?: string }>,
) {
  const seen = new Set<string>();
  const validRecords = records
    .map((record) => ({
      employeeId: record.employeeId?.trim() ?? "",
      workDate: record.workDate?.trim() ?? "",
    }))
    .filter((record) => record.employeeId && isValidDateString(record.workDate))
    .filter((record) => {
      const key = `${record.employeeId}:${record.workDate}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 80);

  return Promise.all(
    validRecords.map((record) => getWorkLog(record.employeeId, record.workDate)),
  );
}

async function mutateWorkLogComment(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    commentId: string;
  },
  mutate: (comments: WorkComment[]) => WorkComment[],
) {
  if (!input.commentId.trim()) {
    badRequest("댓글을 선택하세요.");
  }

  const db = getDb();
  const employeeDoc = await db.collection("employees").doc(input.employeeId).get();
  const employee = employeeDoc.data() as EmployeeData | undefined;
  if (!employeeDoc.exists || !employee?.is_active) {
    badRequest("직원 정보를 찾을 수 없습니다.");
  }

  const docRef = db.collection("work_logs").doc(getWorkLogDocId(input.employeeId, input.workDate));
  const currentDoc = await docRef.get();
  if (!currentDoc.exists) {
    badRequest("업무 기록을 찾을 수 없습니다.");
  }

  const currentData = currentDoc.data() as WorkLogData;
  const comments = normalizeComments(currentData.comments ?? []);
  const targetComment = comments.find((comment) => comment.id === input.commentId);
  if (!targetComment) {
    badRequest("댓글을 찾을 수 없습니다.");
  }

  const canDeleteMalformedOwnLogComment =
    input.employeeId === auth.employee.id && !targetComment.authorEmployeeId.trim();
  if (targetComment.authorEmployeeId !== auth.employee.id && !canDeleteMalformedOwnLogComment) {
    forbidden("본인이 작성한 댓글만 수정하거나 삭제할 수 있습니다.");
  }

  const nextComments = mutate(comments);
  const data: WorkLogData = {
    ...currentData,
    employee_id: input.employeeId,
    work_date: input.workDate,
    comments: nextComments.map((comment) => ({
      id: comment.id,
      author_employee_id: comment.authorEmployeeId,
      author_name: comment.authorName,
      text: comment.text,
      created_at: comment.createdAt,
    })),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });
  return mapWorkLog(data, employee.name ?? "");
}

export async function getWorkLogsForDate(workDate: string) {
  if (!isValidDateString(workDate)) {
    return [];
  }

  const db = getDb();
  const [employeesSnapshot, workLogsSnapshot] = await Promise.all([
    db.collection("employees").where("is_active", "==", true).get(),
    db.collection("work_logs").where("work_date", "==", workDate).get(),
  ]);
  const employees = new Map(
    employeesSnapshot.docs.map((doc) => [doc.id, doc.data() as EmployeeData]),
  );

  return workLogsSnapshot.docs
    .map((doc) => doc.data() as WorkLogData)
    .filter((data) => employees.has(data.employee_id))
    .map((data) => mapWorkLog(data, employees.get(data.employee_id)?.name ?? ""))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function ensureCarryoverWorkLog(employeeId: string, workDate: string) {
  validateWorkLogKey(employeeId, workDate);
  if (workDate < CARRYOVER_START_DATE) {
    return null;
  }

  const db = getDb();
  const docRef = db.collection("work_logs").doc(getWorkLogDocId(employeeId, workDate));
  const existingDoc = await docRef.get();
  if (existingDoc.exists) {
    return null;
  }

  const carryoverTasks = await getCarryoverTasks(employeeId, workDate);
  if (!carryoverTasks.length) {
    return null;
  }

  const data: WorkLogData = {
    employee_id: employeeId,
    work_date: workDate,
    summary: "",
    tasks: carryoverTasks.map((task) => ({
      id: task.id,
      text: task.text,
      done: task.done,
      section: task.section,
      order: task.order,
      completed_order: task.completedOrder ?? null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    })),
    created_at: nowTimestamp(),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data);
  return data;
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

function normalizeCommentText(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 2000);
}

function normalizeComments(comments: WorkLogData["comments"]): WorkComment[] {
  return (comments ?? [])
    .map((comment) => {
      const text = normalizeCommentText(comment.text);
      if (!text) {
        return null;
      }

      const rawCreatedAt = comment.created_at;
      const createdAt =
        rawCreatedAt && !Number.isNaN(new Date(rawCreatedAt).getTime())
          ? rawCreatedAt
          : new Date().toISOString();

      return {
        id: comment.id && comment.id.length <= 80 ? comment.id : randomUUID(),
        authorEmployeeId: normalizeCommentAuthorId(comment.author_employee_id),
        authorName: normalizeCommentAuthorName(comment.author_name),
        text,
        createdAt,
      } satisfies WorkComment;
    })
    .filter((comment): comment is WorkComment => comment !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 200);
}

function normalizeCommentAuthorId(value: string | null | undefined) {
  return (value ?? "").trim().slice(0, 120);
}

function normalizeCommentAuthorName(value: string | null | undefined) {
  const name = (value ?? "").trim();
  return name ? name.slice(0, 80) : "익명";
}

function normalizeTasks(tasks: WorkTaskInput[], now: string): WorkTask[] {
  return tasks
    .map((task, index) => {
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
      const order = Number.isFinite(task.order) ? Number(task.order) : index;
      const completedOrder = task.done
        ? getFiniteNumber(task.completedOrder ?? task.completed_order)
        : null;

      const normalizedTask: WorkTask = {
        id: task.id && task.id.length <= 80 ? task.id : randomUUID(),
        text,
        done: Boolean(task.done),
        section,
        order,
        completedOrder,
        createdAt,
        updatedAt,
      };

      return normalizedTask;
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
    .filter((data) => data.work_date >= CARRYOVER_START_DATE && data.work_date < workDate)
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
          order: carryoverTasks.length,
          completedOrder: null,
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
    comments: [],
    commentCount: 0,
    createdAt: null,
    updatedAt: null,
  };
}

function mapWorkLog(data: WorkLogData, employeeName: string): WorkLog {
  const rawTasks = data.tasks ?? [];
  const hasStoredOrder = rawTasks.some((task) => Number.isFinite(task.order));
  const tasks = withDisplayTaskOrder(
    normalizeTasks(rawTasks, new Date().toISOString()).map((task, index) => ({
      ...task,
      order: hasStoredOrder ? task.order : index,
    })),
  );
  const comments = normalizeComments(data.comments ?? []);

  return {
    employeeId: data.employee_id,
    employeeName,
    workDate: data.work_date,
    summary: data.summary ?? "",
    tasks,
    taskCount: tasks.length,
    doneCount: tasks.filter((task) => task.done).length,
    comments,
    commentCount: comments.length,
    createdAt: timestampToIso(data.created_at),
    updatedAt: timestampToIso(data.updated_at),
  };
}

function withDisplayTaskOrder(tasks: WorkTask[]) {
  return tasks
    .map((task, index) => {
      const order = getFiniteNumber(task.order) ?? index;
      if (!task.done) {
        return {
          ...task,
          order,
          completedOrder: null,
        };
      }

      return {
        ...task,
        order,
        completedOrder: getFiniteNumber(task.completedOrder),
      };
    })
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.done
          ? getDoneTaskSortOrder(a) - getDoneTaskSortOrder(b)
          : (a.order ?? 0) - (b.order ?? 0)) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

function getDoneTaskSortOrder(task: WorkTask) {
  return getFiniteNumber(task.completedOrder) ?? getFiniteNumber(task.order) ?? 0;
}

function getFiniteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
