import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const notionToken = args.token ?? process.env.NOTION_TOKEN;
const databaseId = parseNotionId(
  args.database ?? process.env.NOTION_DATABASE_ID ?? process.env.NOTION_DATABASE_URL,
);
const dryRun = Boolean(args.dryRun);

if (!notionToken || !databaseId) {
  printUsage();
  console.error("\nNOTION_TOKEN and a Notion database URL/ID are required.");
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
const employeesByName = await loadEmployeesByName();
const now = Timestamp.now();
const nowIso = new Date().toISOString();
const pages = await queryNotionDatabase(databaseId);
const stats = {
  dryRun,
  notionPages: pages.length,
  employeesCreated: 0,
  employeesUpdated: 0,
  workLogsUpserted: 0,
  skipped: [],
};

for (const page of pages) {
  const title = normalizeSpaces(getTitle(page.properties?.["이름"]));
  const date = getDate(page.properties?.["날짜"]);
  const employeeName = getEmployeeName(title, getPeopleName(page.properties?.["태그"]));

  if (!employeeName || !date) {
    stats.skipped.push({
      pageId: page.id,
      title,
      reason: "employee/date missing",
    });
    continue;
  }

  if (!isDateInSelectedRange(date)) {
    continue;
  }

  const blocks = await getAllBlocks(page.id);
  const tasks = extractTasks(blocks, page.created_time ?? nowIso);
  const summary = normalizeSpaces(getPlainText(page.properties?.["텍스트"]));

  if (!tasks.length && !summary) {
    stats.skipped.push({
      pageId: page.id,
      title,
      date,
      reason: "no tasks or summary",
    });
    continue;
  }

  const employeeId = await ensureEmployee(employeeName);
  const docId = `${encodeURIComponent(employeeId)}_${date}`;
  const workLog = {
    employee_id: employeeId,
    work_date: date,
    summary,
    tasks,
    created_at: now,
    updated_at: now,
    imported_from: "notion_api",
    imported_notion_page_id: page.id,
    imported_notion_title: title,
  };

  if (!dryRun) {
    await db.collection("work_logs").doc(docId).set(workLog, { merge: true });
  }

  stats.workLogsUpserted += 1;
}

console.log(JSON.stringify(stats, null, 2));

async function queryNotionDatabase(id) {
  const pages = [];
  let cursor = undefined;

  do {
    const body = cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 };
    const response = await notionFetch(`https://api.notion.com/v1/databases/${id}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    pages.push(...response.results);
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return pages;
}

async function getAllBlocks(blockId) {
  const blocks = [];
  let cursor = undefined;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) {
      url.searchParams.set("start_cursor", cursor);
    }

    const response = await notionFetch(url);
    for (const block of response.results) {
      blocks.push(block);
      if (block.has_children) {
        const children = await getAllBlocks(block.id);
        blocks.push(...children.map((child) => ({ ...child, parentBlock: block })));
      }
    }
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

async function notionFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

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
    if (!dryRun) {
      await db.collection("employees").doc(existing.id).set(update, { merge: true });
    }
    stats.employeesUpdated += 1;
    return existing.id;
  }

  const ref = db.collection("employees").doc();
  if (!dryRun) {
    await ref.set({
      employee_no: name,
      name,
      role: "employee",
      is_active: true,
      created_at: now,
      updated_at: now,
      imported_from: "notion_api",
    });
  }
  employeesByName.set(key, {
    id: ref.id,
    data: { name, employee_no: name, role: "employee", is_active: true },
  });
  stats.employeesCreated += 1;
  return ref.id;
}

function extractTasks(blocks, fallbackCreatedAt) {
  const allTasks = [];
  let isAfterCheckout = false;

  for (const block of blocks) {
    const blockText = normalizeSpaces(richTextToPlain(block[block.type]?.rich_text));

    if (block.type === "divider" || /^퇴근\s*시각/.test(blockText)) {
      isAfterCheckout = true;
      continue;
    }

    if (!isTaskBlock(block)) {
      continue;
    }

    const text = normalizeSpaces(richTextToPlain(block[block.type]?.rich_text));
    if (!text || /^Untitled$/i.test(text)) {
      continue;
    }

    const isToDo = block.type === "to_do";
    allTasks.push({
      id: randomUUID(),
      text,
      done: isToDo ? Boolean(block.to_do?.checked) : isAfterCheckout,
      section: isLaterTask(block.parentBlock) ? "later" : "today",
      createdAt: block.created_time ?? fallbackCreatedAt,
      updatedAt: block.last_edited_time ?? block.created_time ?? fallbackCreatedAt,
    });
  }

  const seen = new Set();
  const deduped = [];
  for (let index = allTasks.length - 1; index >= 0; index -= 1) {
    const task = allTasks[index];
    const key = normalizeLoginName(task.text);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.unshift(task);
  }

  return deduped.map((task, index) => ({
    ...task,
    order: index,
  }));
}

function isTaskBlock(block) {
  return ["to_do", "bulleted_list_item", "numbered_list_item"].includes(block.type);
}

function isLaterTask(parentBlock) {
  if (!parentBlock) {
    return false;
  }

  const text = normalizeSpaces(richTextToPlain(parentBlock[parentBlock.type]?.rich_text));
  return /후순위|나중|later/i.test(text);
}

function getTitle(property) {
  return richTextToPlain(property?.title);
}

function getPlainText(property) {
  return richTextToPlain(property?.rich_text);
}

function getPeopleName(property) {
  return property?.created_by?.name ?? "";
}

function getDate(property) {
  const date = property?.date?.start;
  return typeof date === "string" ? date.slice(0, 10) : null;
}

function richTextToPlain(richText) {
  return Array.isArray(richText)
    ? richText.map((item) => item.plain_text ?? "").join("")
    : "";
}

function getEmployeeName(title, tag) {
  const titleMatch = title.match(/^([가-힣]{2,4})(?:\s|$)/);
  if (titleMatch) {
    return titleMatch[1];
  }

  const tagMatch = normalizeSpaces(tag).match(/^([가-힣]{2,4})/);
  return tagMatch?.[1] ?? null;
}

function isDateInSelectedRange(date) {
  if (args.fromDate && date < args.fromDate) {
    return false;
  }

  if (args.toDate && date > args.toDate) {
    return false;
  }

  return true;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--database") {
      parsed.database = argv[++index];
    } else if (arg === "--token") {
      parsed.token = argv[++index];
    } else if (arg === "--from") {
      parsed.fromDate = argv[++index];
    } else if (arg === "--to") {
      parsed.toDate = argv[++index];
    }
  }
  return parsed;
}

function parseNotionId(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).trim();
  const withoutQuery = normalized.split("?")[0];
  const idMatch = withoutQuery.match(/[0-9a-f]{32}/i);
  const dashedMatch = withoutQuery.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const compact = (idMatch?.[0] ?? dashedMatch?.[0]?.replace(/-/g, ""))?.toLowerCase();

  if (!compact || compact.length !== 32) {
    return normalized.replace(/-/g, "");
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

function normalizeSpaces(value) {
  return String(value ?? "").normalize("NFC").replace(/\\\\/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLoginName(value) {
  return normalizeSpaces(value).replace(/\s+/g, "");
}

function printUsage() {
  console.log(`Usage:
  node --env-file=.env scripts/import-notion-worklogs.mjs --database <notion-db-url-or-id>

Environment:
  NOTION_TOKEN             Notion integration token with access to the database
  NOTION_DATABASE_ID       Optional database id
  NOTION_DATABASE_URL      Optional database url

Options:
  --database <url-or-id>   Notion database URL or ID
  --token <token>          Notion token, overrides NOTION_TOKEN
  --from YYYY-MM-DD        Import pages on or after this date
  --to YYYY-MM-DD          Import pages on or before this date
  --dry-run                Parse and report without writing Firestore
  --help                   Show this help
`);
}
