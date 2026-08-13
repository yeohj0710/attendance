/**
 * 댓글 알림 받은함을 기존 업무일지에서 한 번 채운다.
 *
 * 알림을 볼 때 업무일지를 30일치 읽던 걸, 댓글을 달 때 받은함에 미리 넣어두고
 * 읽을 때는 문서 한 건만 보도록 바꿨다. 바꾸기 전에 달린 댓글은 받은함에 없어서
 * 이 스크립트로 한 번 옮긴다.
 *
 *   npm run db:backfill-comment-inboxes
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const INBOX_COLLECTION = "work_comment_inboxes";
const INBOX_LIMIT = 20;

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.error("FIREBASE_* 환경변수가 없습니다. .env를 확인하세요.");
    process.exit(1);
  }

  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

const db = getFirestore();

function readComments(data) {
  if (!Array.isArray(data?.comments)) {
    return [];
  }

  return data.comments
    .map((comment) => ({
      id: comment?.id ?? "",
      authorEmployeeId: comment?.author_employee_id ?? comment?.authorEmployeeId ?? "",
      authorName: comment?.author_name ?? comment?.authorName ?? "",
      text: comment?.text ?? "",
      createdAt: comment?.created_at ?? comment?.createdAt ?? "",
    }))
    .filter((comment) => comment.id && comment.createdAt);
}

const snapshot = await db.collection("work_logs").get();
console.log(`업무일지 ${snapshot.size}건을 읽었습니다.`);

/** 받는 사람(일지 주인)별로 모은다. 자기 일지에 자기가 단 댓글은 뺀다. */
const byRecipient = new Map();
let commentTotal = 0;

for (const doc of snapshot.docs) {
  const data = doc.data();
  const ownerId = data?.employee_id;
  const workDate = data?.work_date;
  if (!ownerId || !workDate) {
    continue;
  }

  for (const comment of readComments(data)) {
    commentTotal += 1;
    if (!comment.authorEmployeeId || comment.authorEmployeeId === ownerId) {
      continue;
    }

    const entries = byRecipient.get(ownerId) ?? [];
    entries.push({ ...comment, workDate });
    byRecipient.set(ownerId, entries);
  }
}

console.log(`댓글 ${commentTotal}건 중 남이 단 것을 ${byRecipient.size}명에게 나눴습니다.`);

let written = 0;
for (const [recipientId, entries] of byRecipient) {
  const latest = entries
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, INBOX_LIMIT);

  await db
    .collection(INBOX_COLLECTION)
    .doc(recipientId)
    .set({ entries: latest, updated_at: Timestamp.now() }, { merge: true });

  written += 1;
  console.log(`  ${recipientId}: ${latest.length}건 (가장 최근 ${latest[0]?.createdAt ?? "-"})`);
}

console.log(`\n받은함 ${written}개를 채웠습니다.`);
process.exit(0);
