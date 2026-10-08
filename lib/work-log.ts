import { randomUUID } from "node:crypto";
import { getDb, nowTimestamp, timestampToIso } from "@/lib/db";
import { badRequest, forbidden } from "@/lib/http";
import { addDaysToKstDate, isValidDateString } from "@/lib/time";
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
  /** 콘텐츠팀 캘린더에서 들어온 업무면 캘린더 쪽 키. 체크하면 캘린더에도 남긴다. */
  calKey?: string;
  /** 캘린더 업무 종류 (인수인계, 마감, 업로드 등) */
  calLabel?: string;
  /** 마우스를 올리면 뜨는 설명 */
  note?: string;
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
  /** 이 날 일지에 이미 넣은 캘린더 업무 키. 지운 업무를 다시 넣지 않으려고 둔다. */
  calImported: string[];
};

export type WorkLogSummary = {
  employeeId: string;
  workDate: string;
  taskCount: number;
  doneCount: number;
  commentCount: number;
  tasks: Array<Pick<WorkTask, "done" | "text">>;
  comments: Array<Pick<WorkComment, "authorEmployeeId" | "createdAt">>;
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
    cal_key?: string;
    cal_label?: string;
    note?: string;
  }>;
  cal_imported?: string[];
  deleted_tasks?: Array<{
    text?: string;
    deleted_at?: string;
  }>;
  comments?: WorkCommentData[];
  created_at?: unknown;
  updated_at?: unknown;
};

type EmployeeData = {
  name?: string;
  is_active?: boolean;
};

type WorkCommentData = {
  id?: string | null;
  author_employee_id?: string | null;
  authorEmployeeId?: string | null;
  author_name?: string | null;
  authorName?: string | null;
  text?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

type WorkTaskInput = Partial<WorkTask> & {
  text?: string;
  cal_key?: string;
  cal_label?: string;
  completed_order?: number | null;
  created_at?: string;
  updated_at?: string;
};

type DeletedWorkTask = {
  text: string;
  deletedAt: string;
};

const CARRYOVER_START_DATE = "2026-05-01";
const TASK_NOTE_MAX_LENGTH = 2000;
const CAL_IMPORTED_LIMIT = 300;

/** Firestore 에는 undefined 를 못 넣어서, 캘린더 칸은 있을 때만 붙인다. */
function serializeTask(task: WorkTask): NonNullable<WorkLogData["tasks"]>[number] {
  return {
    id: task.id,
    text: task.text,
    done: task.done,
    section: task.section,
    order: task.order,
    completed_order: task.completedOrder ?? null,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
    ...(task.calKey ? { cal_key: task.calKey } : {}),
    ...(task.calLabel ? { cal_label: task.calLabel } : {}),
    ...(task.note ? { note: task.note } : {}),
  };
}

/** 화면이 캘린더 칸을 빼고 보내도, 같은 id 의 서버 값을 살린다. */
function keepCalendarFields(sentTasks: WorkTask[], currentTasks: WorkTask[]) {
  const byId = new Map(currentTasks.map((task) => [task.id, task]));
  return sentTasks.map((task) => {
    const current = byId.get(task.id);
    if (!current || task.calKey || !current.calKey) return task;
    return {
      ...task,
      calKey: current.calKey,
      ...(current.calLabel ? { calLabel: current.calLabel } : {}),
      ...(task.note || current.note ? { note: task.note || current.note } : {}),
    };
  });
}

export type CalendarTaskInput = {
  key?: unknown;
  text?: unknown;
  label?: unknown;
  note?: unknown;
  done?: unknown;
};

/**
 * 콘텐츠팀 캘린더의 오늘 할 일을 그날 업무일지에 진짜 업무로 넣는다.
 * 한 번 넣은 키는 cal_imported 에 남겨서, 직원이 지운 업무가 다시 생기지 않게 한다.
 * 이미 들어온 업무는 설명과 종류만 맞추고, 캘린더에서 끝냈으면 끝냄으로 바꾼다(되돌리기는 안 따라감).
 * 화면이 바뀐 게 있을 때만 부르므로 보통 하루 한두 번이고, 한 번에 문서 읽기 2건 + 쓰기 1건이다.
 */
export async function importCalendarTasks(
  auth: AuthContext,
  input: {
    employeeId: string;
    workDate: string;
    items: CalendarTaskInput[];
    /** 이 날짜 캘린더 키의 앞부분 (예: kim:10-08:). 여기 해당하는데 목록에 없는 안 끝난 업무는 뺀다. */
    keyPrefix?: string;
  },
) {
  validateWorkLogKey(input.employeeId, input.workDate);
  if (auth.employee.id !== input.employeeId) {
    forbidden("본인의 업무 기록만 수정할 수 있습니다.");
  }

  const items = input.items
    .map((item) => ({
      key: String(item?.key ?? "").slice(0, 80),
      text: String(item?.text ?? "").trim().slice(0, 300),
      label: String(item?.label ?? "").slice(0, 20),
      note: String(item?.note ?? "").slice(0, TASK_NOTE_MAX_LENGTH),
      done: item?.done === true,
    }))
    .filter((item) => item.key && item.text)
    .slice(0, 40);

  const db = getDb();
  const docRef = db.collection("work_logs").doc(getWorkLogDocId(input.employeeId, input.workDate));
  const [employeeDoc, currentDoc] = await Promise.all([
    db.collection("employees").doc(input.employeeId).get(),
    docRef.get(),
  ]);
  const employee = employeeDoc.data() as EmployeeData | undefined;
  if (!employeeDoc.exists || !employee?.is_active) {
    badRequest("직원 정보를 찾을 수 없습니다.");
  }

  const now = new Date().toISOString();
  const currentData = currentDoc.data() as WorkLogData | undefined;
  const tasks = currentDoc.exists
    ? normalizeTasks(currentData?.tasks ?? [], now)
    : await getCarryoverTasks(input.employeeId, input.workDate);
  const imported = new Set(
    Array.isArray(currentData?.cal_imported) ? currentData.cal_imported.map(String) : [],
  );
  let completedOrder =
    tasks.reduce((max, task) => Math.max(max, getFiniteNumber(task.completedOrder) ?? -1), -1) + 1;
  const added: WorkTask[] = [];

  for (const item of items) {
    const existing =
      tasks.find((task) => task.calKey === item.key) ??
      // 어제 못 끝내 넘어온 같은 업무(아침 점검 같은 매일 업무)는 새로 만들지 않고 오늘 키로 잇는다.
      (!imported.has(item.key)
        ? tasks.find((task) => !task.done && task.calKey && task.text === item.text)
        : undefined);
    if (existing) {
      existing.calKey = item.key;
      if (item.label) existing.calLabel = item.label;
      if (item.note) existing.note = item.note;
      if (item.done && !existing.done) {
        existing.done = true;
        existing.completedOrder = completedOrder++;
        existing.updatedAt = now;
      }
    } else if (!imported.has(item.key)) {
      added.push({
        id: randomUUID(),
        text: item.text,
        done: item.done,
        section: "today",
        order: 0,
        completedOrder: item.done ? completedOrder++ : null,
        createdAt: now,
        updatedAt: now,
        calKey: item.key,
        ...(item.label ? { calLabel: item.label } : {}),
        ...(item.note ? { note: item.note } : {}),
      });
    }
    imported.add(item.key);
  }

  // 캘린더에서 이름이 바뀌었거나 다른 날로 옮긴 오늘 업무는, 아직 안 끝났으면 뺀다.
  const keyPrefix = String(input.keyPrefix ?? "").slice(0, 40);
  const liveKeys = new Set(items.map((item) => item.key));
  if (keyPrefix) {
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (task.calKey?.startsWith(keyPrefix) && !liveKeys.has(task.calKey) && !task.done) {
        tasks.splice(i, 1);
        imported.delete(task.calKey); // 캘린더에서 다시 오늘로 돌아오면 다시 넣을 수 있게
      }
    }
  }

  // 새로 들어온 캘린더 업무는 캘린더 순서대로 목록 맨 위에 둔다.
  const minOrder = tasks.reduce((min, task) => Math.min(min, getFiniteNumber(task.order) ?? 0), 0);
  added.forEach((task, index) => {
    task.order = minOrder - added.length + index;
  });
  const nextTasks = [...added, ...tasks].slice(0, 80);

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: currentData?.summary ?? "",
    tasks: nextTasks.map(serializeTask),
    cal_imported: Array.from(imported).slice(-CAL_IMPORTED_LIMIT),
    comments: serializeComments(normalizeComments(currentData?.comments ?? [])),
    created_at: currentDoc.exists ? currentData?.created_at : nowTimestamp(),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });
  return mapWorkLog(data, employee.name ?? "");
}

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
    deletedTasks?: Array<{ id?: string; text?: string }>;
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
  const docRef = db.collection("work_logs").doc(getWorkLogDocId(input.employeeId, input.workDate));
  const currentDoc = await docRef.get();
  const currentData = currentDoc.data() as WorkLogData | undefined;
  const currentTasks = currentDoc.exists
    ? normalizeTasks(currentData?.tasks ?? [], now)
    : await getCarryoverTasks(input.employeeId, input.workDate);
  const sentTasks = keepCalendarFields(normalizeTasks(input.tasks ?? [], now), currentTasks);
  // 문서가 아직 없으면 이월 업무 id가 요청마다 새로 나와서 맞춰 볼 수 없다. 그땐 보낸 목록 그대로.
  const tasks = currentDoc.exists
    ? keepTasksUnknownToClient(sentTasks, currentTasks, input.deletedTasks ?? [])
    : sentTasks;
  const deletedTasks = mergeDeletedTasks(
    currentData?.deleted_tasks ?? [],
    currentTasks,
    tasks,
    now,
  );

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: normalizeSummary(input.summary),
    tasks: tasks.map(serializeTask),
    deleted_tasks: deletedTasks.map((task) => ({
      text: task.text,
      deleted_at: task.deletedAt,
    })),
    comments: serializeComments(normalizeComments(currentData?.comments ?? [])),
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

  return snapshot.docs.map((doc) => mapWorkLogSummary(doc.data() as WorkLogData));
}

export async function getWorkLogSummariesForEmployee(employeeId: string) {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  const snapshot = await getDb()
    .collection("work_logs")
    .where("employee_id", "==", employeeId)
    .get();

  return snapshot.docs.map((doc) => mapWorkLogSummary(doc.data() as WorkLogData));
}

export async function getAllWorkLogSummaries() {
  const snapshot = await getDb().collection("work_logs").get();
  return snapshot.docs.map((doc) => mapWorkLogSummary(doc.data() as WorkLogData));
}

function mapWorkLogSummary(data: WorkLogData) {
  const tasks = normalizeTasks(data.tasks ?? [], new Date().toISOString());
  const comments = normalizeComments(data.comments ?? []);
  return {
    employeeId: data.employee_id,
    workDate: data.work_date,
    taskCount: tasks.length,
    doneCount: tasks.filter((task) => task.done).length,
    commentCount: comments.length,
    tasks: tasks.map(({ done, text }) => ({ done, text })),
    comments: comments.map(({ authorEmployeeId, createdAt }) => ({
      authorEmployeeId,
      createdAt,
    })),
  } satisfies WorkLogSummary;
}

export async function getWorkLogCommentAuthorStats(employeeId: string) {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  const snapshot = await getDb().collection("work_logs").get();
  const commentedPeerIds = new Set<string>();
  const commentedPeerDates = new Set<string>();
  let commentGivenCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as WorkLogData;
    const ownerEmployeeId = data.employee_id;
    if (!ownerEmployeeId || ownerEmployeeId === employeeId) {
      continue;
    }

    const authoredComments = normalizeComments(data.comments ?? []).filter(
      (comment) => comment.authorEmployeeId === employeeId,
    );
    if (!authoredComments.length) {
      continue;
    }

    commentGivenCount += authoredComments.length;
    commentedPeerIds.add(ownerEmployeeId);
    commentedPeerDates.add(data.work_date);
  }

  return {
    commentGivenCount,
    commentedPeerDays: commentedPeerDates.size,
    commentedPeerCount: commentedPeerIds.size,
  };
}

export async function getWorkCommentNotifications(employeeId: string, since: string) {
  if (!employeeId.trim()) {
    badRequest("직원을 선택하세요.");
  }

  const sinceTime = Date.parse(since);
  if (!Number.isFinite(sinceTime)) {
    badRequest("댓글 확인 기준 시간이 올바르지 않습니다.");
  }

  // 페이지를 열 때마다 부르는 함수다. 예전에는 그 직원의 업무일지를 30일치
  // 읽어서 남이 단 댓글을 골라냈다. 알림이 있나 보려고 스물몇 건을 읽는 셈이라,
  // 댓글을 달 때 받은함에 미리 넣어두고 여기서는 그 문서 한 건만 읽는다.
  const doc = await getDb().collection(COMMENT_INBOX_COLLECTION).doc(employeeId).get();
  const entries = normalizeInboxEntries(doc.data()?.entries);

  return entries
    .filter((entry) => Date.parse(entry.createdAt) > sinceTime)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, COMMENT_INBOX_LIMIT) satisfies WorkCommentNotification[];
}

const COMMENT_INBOX_COLLECTION = "work_comment_inboxes";
/** 받은함에 남겨두는 알림 개수. 화면이 최근 20건만 보여준다. */
const COMMENT_INBOX_LIMIT = 20;

function normalizeInboxEntries(value: unknown): WorkCommentNotification[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((raw) => {
    const entry = raw as Partial<WorkCommentNotification>;
    if (!entry?.id || !entry.createdAt || !entry.workDate) {
      return [];
    }

    return [
      {
        id: String(entry.id),
        authorEmployeeId: String(entry.authorEmployeeId ?? ""),
        authorName: String(entry.authorName ?? ""),
        text: String(entry.text ?? ""),
        createdAt: String(entry.createdAt),
        workDate: String(entry.workDate),
      },
    ];
  });
}

/**
 * 받은함을 고친다. 댓글을 달거나 지울 때만 돈다. 읽기 1건 + 쓰기 1건이고,
 * 여기서 실패해도 댓글 자체는 이미 저장돼 있으니 알림만 빠진다.
 */
async function updateCommentInbox(
  recipientEmployeeId: string,
  change: (entries: WorkCommentNotification[]) => WorkCommentNotification[],
) {
  if (!recipientEmployeeId.trim()) {
    return;
  }

  const ref = getDb().collection(COMMENT_INBOX_COLLECTION).doc(recipientEmployeeId);
  try {
    await getDb().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const next = change(normalizeInboxEntries(doc.data()?.entries))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, COMMENT_INBOX_LIMIT);

      tx.set(ref, { entries: next, updated_at: nowTimestamp() }, { merge: true });
    });
  } catch (error) {
    console.warn("[work-log] 댓글 받은함을 고치지 못했습니다.", error);
  }
}

export async function addCommentToInbox(
  recipientEmployeeId: string,
  entry: WorkCommentNotification,
) {
  // 자기 일지에 자기가 단 댓글은 알릴 일이 아니다.
  if (recipientEmployeeId === entry.authorEmployeeId) {
    return;
  }

  await updateCommentInbox(recipientEmployeeId, (entries) => [
    ...entries.filter((item) => item.id !== entry.id),
    entry,
  ]);
}

async function removeCommentFromInbox(recipientEmployeeId: string, commentId: string) {
  await updateCommentInbox(recipientEmployeeId, (entries) =>
    entries.filter((item) => item.id !== commentId),
  );
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
  const newComment = {
    id: randomUUID(),
    authorEmployeeId: auth.employee.id,
    authorName: author.name,
    text,
    createdAt: now,
  };
  const comments = [...normalizeComments(currentData?.comments ?? []), newComment];

  const data: WorkLogData = {
    employee_id: input.employeeId,
    work_date: input.workDate,
    summary: currentData?.summary ?? "",
    tasks: currentData?.tasks ?? [],
    comments: serializeComments(comments),
    created_at: currentDoc.exists ? currentData?.created_at : nowTimestamp(),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });
  // 일지 주인의 받은함에 넣어둔다. 알림을 볼 때 이 문서 한 건만 읽으면 된다.
  await addCommentToInbox(input.employeeId, { ...newComment, workDate: input.workDate });

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
    comments: serializeComments(nextComments),
    updated_at: nowTimestamp(),
  };

  await docRef.set(data, { merge: true });

  // 받은함도 같이 맞춘다. 지운 댓글이 알림에 남아 있으면 안 되고, 고친 댓글은
  // 고친 내용으로 보여야 한다.
  const stillThere = nextComments.find((comment) => comment.id === input.commentId);
  if (stillThere) {
    await addCommentToInbox(input.employeeId, { ...stillThere, workDate: input.workDate });
  } else {
    await removeCommentFromInbox(input.employeeId, input.commentId);
  }

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
    tasks: carryoverTasks.map(serializeTask),
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

      const rawCreatedAt = comment.created_at ?? comment.createdAt;
      const createdAt =
        rawCreatedAt && !Number.isNaN(new Date(rawCreatedAt).getTime())
          ? rawCreatedAt
          : new Date().toISOString();

      return {
        id: comment.id && comment.id.length <= 80 ? comment.id : randomUUID(),
        authorEmployeeId: normalizeCommentAuthorId(
          comment.author_employee_id ?? comment.authorEmployeeId,
        ),
        authorName: normalizeCommentAuthorName(comment.author_name ?? comment.authorName),
        text,
        createdAt,
      } satisfies WorkComment;
    })
    .filter((comment): comment is WorkComment => comment !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, 200);
}

function serializeComments(comments: WorkComment[]): WorkCommentData[] {
  return comments.map((comment) => ({
    id: comment.id,
    author_employee_id: comment.authorEmployeeId,
    author_name: comment.authorName,
    text: comment.text,
    created_at: comment.createdAt,
  }));
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
      const calKey = String(task.calKey ?? task.cal_key ?? "").slice(0, 80);
      const calLabel = String(task.calLabel ?? task.cal_label ?? "").slice(0, 20);
      const note = String(task.note ?? "").slice(0, TASK_NOTE_MAX_LENGTH);
      if (calKey) normalizedTask.calKey = calKey;
      if (calLabel) normalizedTask.calLabel = calLabel;
      if (note) normalizedTask.note = note;

      return normalizedTask;
    })
    .filter((task): task is WorkTask => task !== null)
    .slice(0, 80);
}

function normalizeDeletedTasks(tasks: WorkLogData["deleted_tasks"]): DeletedWorkTask[] {
  const seenTexts = new Set<string>();
  return (tasks ?? [])
    .map((task) => {
      const text = getTaskCarryoverKey(task.text ?? "");
      if (!text || seenTexts.has(text)) {
        return null;
      }

      seenTexts.add(text);
      const rawDeletedAt = task.deleted_at;
      const deletedAt =
        rawDeletedAt && !Number.isNaN(new Date(rawDeletedAt).getTime())
          ? rawDeletedAt
          : new Date().toISOString();

      return { text, deletedAt } satisfies DeletedWorkTask;
    })
    .filter((task): task is DeletedWorkTask => task !== null)
    .slice(0, 200);
}

function mergeDeletedTasks(
  storedDeletedTasks: WorkLogData["deleted_tasks"],
  currentTasks: WorkTask[],
  nextTasks: WorkTask[],
  now: string,
) {
  const deletedTasksByText = new Map(
    normalizeDeletedTasks(storedDeletedTasks).map((task) => [task.text, task]),
  );
  const nextTasksById = new Map(nextTasks.map((task) => [task.id, task]));
  const nextTaskTexts = new Set(nextTasks.map((task) => getTaskCarryoverKey(task.text)));

  for (const currentTask of currentTasks) {
    const currentText = getTaskCarryoverKey(currentTask.text);
    if (!currentText || nextTaskTexts.has(currentText)) {
      continue;
    }

    const nextTask = nextTasksById.get(currentTask.id);
    const nextText = nextTask ? getTaskCarryoverKey(nextTask.text) : "";
    if (nextTask && nextText === currentText) {
      continue;
    }

    deletedTasksByText.set(currentText, {
      text: currentText,
      deletedAt: now,
    });
  }

  return Array.from(deletedTasksByText.values()).slice(0, 200);
}

// 화면은 목록 전체를 보낸다. 오래 열어둔 탭이나 다른 기기가 옛 목록을 보내면
// 그 사이 추가한 업무가 통째로 지워졌다(2026-10-01). 그래서 서버에 있는데 보낸 목록에
// 없는 업무는, 화면이 지웠다고 명시한 경우(deletedTasks)에만 지운다.
// 이름을 바꾼 업무는 id로, 같은 글자의 업무는 글자로 맞춘다.
function keepTasksUnknownToClient(
  nextTasks: WorkTask[],
  currentTasks: WorkTask[],
  deletedTasks: Array<{ id?: string; text?: string }>,
) {
  const sentIds = new Set(nextTasks.map((task) => task.id));
  const sentTexts = new Set(nextTasks.map((task) => getTaskCarryoverKey(task.text)));
  const deletedIds = new Set(deletedTasks.map((task) => task.id).filter(Boolean));
  const deletedTexts = new Set(
    deletedTasks.map((task) => getTaskCarryoverKey(task.text ?? "")).filter(Boolean),
  );

  const kept = currentTasks.filter((task) => {
    const text = getTaskCarryoverKey(task.text);
    return (
      !sentIds.has(task.id) &&
      !sentTexts.has(text) &&
      !deletedIds.has(task.id) &&
      !deletedTexts.has(text)
    );
  });
  if (!kept.length) {
    return nextTasks;
  }

  let nextOrder = nextTasks.reduce((max, task) => Math.max(max, task.order ?? -1), -1) + 1;
  return [...nextTasks, ...kept.map((task) => ({ ...task, order: task.done ? task.order : nextOrder++ }))].slice(0, 80);
}

// 미완료 업무는 매일 다음 날로 넘어가니 최근 일지만 봐도 남은 일이 다 나온다.
// 예전엔 직원의 일지 전부를 읽어서, 일지가 쌓일수록 한 번에 수백 건씩 읽었다.
const CARRYOVER_LOOKBACK_DAYS = [14, 60, 180];

async function getRecentLogsBefore(employeeId: string, workDate: string) {
  for (const days of CARRYOVER_LOOKBACK_DAYS) {
    const from = addDaysToKstDate(workDate, -days);
    // 색인(employee_id 오름 + work_date 오름)에 맞춰 범위만 건다.
    const snapshot = await getDb()
      .collection("work_logs")
      .where("employee_id", "==", employeeId)
      .where("work_date", ">=", from > CARRYOVER_START_DATE ? from : CARRYOVER_START_DATE)
      .where("work_date", "<", workDate)
      .get();
    if (!snapshot.empty || from <= CARRYOVER_START_DATE) {
      return snapshot.docs.map((doc) => doc.data() as WorkLogData);
    }
  }
  return [];
}

async function getCarryoverTasks(employeeId: string, workDate: string) {
  const now = new Date().toISOString();
  const seenTexts = new Set<string>();
  const carryoverTasks: WorkTask[] = [];

  const previousLogs = (await getRecentLogsBefore(employeeId, workDate)).sort((a, b) =>
    b.work_date.localeCompare(a.work_date),
  );

  for (const log of previousLogs) {
    const tasks = normalizeTasks(log.tasks ?? [], now);
    for (const task of tasks) {
      const key = getTaskCarryoverKey(task.text);
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

    for (const deletedTask of normalizeDeletedTasks(log.deleted_tasks)) {
      seenTexts.add(deletedTask.text);
    }
  }

  return carryoverTasks;
}

function getTaskCarryoverKey(text: string) {
  return text.trim();
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
    calImported: [],
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
    calImported: Array.isArray(data.cal_imported) ? data.cal_imported.map(String) : [],
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
