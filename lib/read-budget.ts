import {
  FieldValue,
  Firestore,
  Query,
  Transaction,
} from "firebase-admin/firestore";
import { ApiError } from "@/lib/http";

/**
 * 하루 Firestore 읽기 상한. Blaze라 한도를 넘으면 그대로 요금이 나가니,
 * 코드가 고장 나거나 누가 새로고침을 몰아쳐도 하루 이 이상은 안 읽는다.
 * 평소는 하루 5만 건 안팎이고, 상한까지 다 써도 무료분을 뺀 15만 건은 100원 안쪽이다.
 */
const DAILY_READ_LIMIT = Number(process.env.FIRESTORE_DAILY_READ_LIMIT) || 200_000;

// 인스턴스마다 모아 두었다가 이만큼 쌓이거나 이 시간이 지나면 공용 카운터에 더한다.
const FLUSH_EVERY_READS = 200;
const FLUSH_EVERY_MS = 30_000;

// 무료 한도는 미국 서부 자정에 초기화되니 날짜도 그 기준으로 끊는다.
const QUOTA_TIME_ZONE = "America/Los_Angeles";
const USAGE_COLLECTION = "_usage";

type ReadState = {
  day: string;
  pending: number;
  knownTotal: number;
  lastFlushAt: number;
  flushing: Promise<void> | null;
};

const state: ReadState = {
  day: "",
  pending: 0,
  knownTotal: 0,
  lastFlushAt: 0,
  flushing: null,
};

let installed = false;
let rawGetAll: Firestore["getAll"];
let db: Firestore;

function quotaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TIME_ZONE }).format(date);
}

function resetIfNewDay() {
  const day = quotaDay();
  if (state.day !== day) {
    state.day = day;
    state.pending = 0;
    state.knownTotal = 0;
    state.lastFlushAt = 0;
  }
}

function assertWithinBudget() {
  resetIfNewDay();
  if (state.knownTotal + state.pending >= DAILY_READ_LIMIT) {
    throw new ApiError(
      503,
      "오늘 서버 사용량이 한도에 닿아 잠시 멈췄습니다. 관리자에게 알려 주세요.",
    );
  }
}

async function flush() {
  const amount = state.pending;
  const day = state.day;
  state.pending = 0;
  state.lastFlushAt = Date.now();

  // 카운터는 원래 메서드로 읽고 써서 자기 자신을 세지 않는다.
  const ref = db.collection(USAGE_COLLECTION).doc(`reads-${day}`);
  try {
    if (amount > 0) {
      await ref.set({ reads: FieldValue.increment(amount), day }, { merge: true });
    }
    const [snapshot] = await rawGetAll.call(db, ref);
    if (state.day === day) {
      state.knownTotal = Number(snapshot.data()?.reads ?? 0);
    }
  } catch (error) {
    // 카운터가 실패해도 화면은 떠야 한다. 못 더한 양은 다음에 다시 더한다.
    if (state.day === day) {
      state.pending += amount;
    }
    console.warn("[read-budget] 읽기 카운터를 갱신하지 못했습니다.", error);
  }
}

function record(reads: number) {
  resetIfNewDay();
  state.pending += Math.max(1, reads);

  const due =
    state.pending >= FLUSH_EVERY_READS || Date.now() - state.lastFlushAt >= FLUSH_EVERY_MS;
  if (due && !state.flushing) {
    state.flushing = flush().finally(() => {
      state.flushing = null;
    });
  }
}

function countOf(result: unknown) {
  if (Array.isArray(result)) {
    return result.length;
  }
  if (result && typeof result === "object" && "size" in result) {
    return Number((result as { size: number }).size);
  }
  return 1;
}

function wrap<T extends object, K extends keyof T>(target: T, key: K) {
  const original = target[key] as unknown as (...args: unknown[]) => Promise<unknown>;
  (target as Record<K, unknown>)[key] = async function (this: unknown, ...args: unknown[]) {
    assertWithinBudget();
    const result = await original.apply(this, args);
    record(countOf(result));
    return result;
  };
}

/** Firestore 읽기를 전부 세고, 하루 상한을 넘으면 막는다. getDb에서 한 번만 부른다. */
export function installReadBudget(firestore: Firestore) {
  if (installed) {
    return;
  }
  installed = true;
  db = firestore;
  rawGetAll = Firestore.prototype.getAll;

  // DocumentReference.get은 안에서 Firestore.getAll을 부르니 따로 감싸지 않는다.
  // Transaction은 내부 함수로 읽어서 겹치지 않는다.
  wrap(Query.prototype, "get");
  wrap(Firestore.prototype, "getAll");
  wrap(Transaction.prototype, "get");
  wrap(Transaction.prototype, "getAll");
}
