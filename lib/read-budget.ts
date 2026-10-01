import { AsyncLocalStorage } from "node:async_hooks";
import {
  FieldValue,
  Firestore,
  Query,
  Transaction,
  WriteBatch,
} from "firebase-admin/firestore";
import { ApiError } from "@/lib/http";

/**
 * 하루 Firestore 사용 상한. Blaze라 무료분을 넘으면 그대로 요금이 나가니,
 * 코드가 고장 나거나 누가 새로고침을 몰아쳐도 하루 이 이상은 읽고 쓰지 않는다.
 * 평소는 읽기 5만, 쓰기 수백 건이다. 상한까지 매일 다 써도 한 달 5천 원을 넘지 않는다.
 * 무료분: 읽기 5만, 쓰기 2만. 넘는 분은 읽기 10만 건에 100원 안쪽, 쓰기 10만 건에 300원 안쪽.
 */
const LIMITS = {
  reads: Number(process.env.FIRESTORE_DAILY_READ_LIMIT) || 200_000,
  writes: Number(process.env.FIRESTORE_DAILY_WRITE_LIMIT) || 40_000,
};

type Meter = keyof typeof LIMITS;

// 인스턴스마다 모아 두었다가 이만큼 쌓이거나 이 시간이 지나면 공용 카운터에 더한다.
const FLUSH_EVERY_OPS = 200;
const FLUSH_EVERY_MS = 30_000;

// 무료 한도는 미국 서부 자정에 초기화되니 날짜도 그 기준으로 끊는다.
const QUOTA_TIME_ZONE = "America/Los_Angeles";
const USAGE_COLLECTION = "_usage";

const BLOCKED_MESSAGE = "오늘 서버 사용량이 한도에 닿아 잠시 멈췄습니다. 관리자에게 알려 주세요.";

const state = {
  day: "",
  pending: { reads: 0, writes: 0 },
  known: { reads: 0, writes: 0 },
  lastFlushAt: 0,
  flushing: null as Promise<void> | null,
};

// 카운터 자신을 읽고 쓸 때는 세지도 막지도 않는다.
const counterScope = new AsyncLocalStorage<true>();

let installed = false;
let db: Firestore;

function quotaDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: QUOTA_TIME_ZONE }).format(date);
}

function resetIfNewDay() {
  const day = quotaDay();
  if (state.day !== day) {
    state.day = day;
    state.pending = { reads: 0, writes: 0 };
    state.known = { reads: 0, writes: 0 };
    state.lastFlushAt = 0;
  }
}

function assertWithinBudget(meter: Meter) {
  resetIfNewDay();
  if (state.known[meter] + state.pending[meter] >= LIMITS[meter]) {
    console.error(`[usage-budget] 하루 ${meter} 상한 ${LIMITS[meter]}건에 닿아 막았습니다.`);
    throw new ApiError(503, BLOCKED_MESSAGE);
  }
}

async function flush() {
  const amount = { ...state.pending };
  const day = state.day;
  state.pending = { reads: 0, writes: 0 };
  state.lastFlushAt = Date.now();

  const ref = db.collection(USAGE_COLLECTION).doc(`day-${day}`);
  try {
    await counterScope.run(true, async () => {
      if (amount.reads > 0 || amount.writes > 0) {
        await ref.set(
          {
            day,
            reads: FieldValue.increment(amount.reads),
            writes: FieldValue.increment(amount.writes),
            limits: LIMITS,
          },
          { merge: true },
        );
      }
      const snapshot = await ref.get();
      if (state.day === day) {
        state.known = {
          reads: Number(snapshot.data()?.reads ?? 0),
          writes: Number(snapshot.data()?.writes ?? 0),
        };
      }
    });
  } catch (error) {
    // 카운터가 실패해도 화면은 떠야 한다. 못 더한 양은 다음에 다시 더한다.
    if (state.day === day) {
      state.pending.reads += amount.reads;
      state.pending.writes += amount.writes;
    }
    console.warn("[usage-budget] 사용량 카운터를 갱신하지 못했습니다.", error);
  }
}

function record(meter: Meter, count: number) {
  resetIfNewDay();
  state.pending[meter] += Math.max(1, count);

  const pendingTotal = state.pending.reads + state.pending.writes;
  const due = pendingTotal >= FLUSH_EVERY_OPS || Date.now() - state.lastFlushAt >= FLUSH_EVERY_MS;
  if (due && !state.flushing) {
    state.flushing = flush().finally(() => {
      state.flushing = null;
    });
  }
}

function resultCount(result: unknown) {
  if (Array.isArray(result)) {
    return result.length;
  }
  if (result && typeof result === "object" && "size" in result) {
    return Number((result as { size: number }).size);
  }
  return 1;
}

type AnyMethod = (...args: unknown[]) => Promise<unknown>;

function wrapRead<T extends object>(target: T, key: keyof T) {
  const original = target[key] as unknown as AnyMethod;
  (target as Record<keyof T, unknown>)[key] = async function (this: unknown, ...args: unknown[]) {
    if (counterScope.getStore()) {
      return original.apply(this, args);
    }
    assertWithinBudget("reads");
    const result = await original.apply(this, args);
    record("reads", resultCount(result));
    return result;
  };
}

/**
 * 쓰기는 set, update, delete, 일괄 쓰기, 트랜잭션 모두 WriteBatch._commit 하나로 모인다.
 * 내부 메서드라 firebase-admin을 올릴 때 이 이름이 그대로인지 확인한다.
 */
function wrapWrites() {
  const proto = WriteBatch.prototype as unknown as {
    _commit: AnyMethod;
    _opCount?: number;
  };
  const original = proto._commit;
  if (typeof original !== "function") {
    console.error("[usage-budget] WriteBatch._commit이 없어 쓰기 상한을 걸지 못했습니다.");
    return;
  }
  proto._commit = async function (this: { _opCount?: number }, ...args: unknown[]) {
    if (counterScope.getStore()) {
      return original.apply(this, args);
    }
    assertWithinBudget("writes");
    const count = Number(this._opCount ?? 1);
    const result = await original.apply(this, args);
    record("writes", count);
    return result;
  };
}

/** Firestore 읽기와 쓰기를 전부 세고, 하루 상한을 넘으면 막는다. getDb에서 한 번만 부른다. */
export function installReadBudget(firestore: Firestore) {
  if (installed) {
    return;
  }
  installed = true;
  db = firestore;

  // DocumentReference.get은 안에서 Firestore.getAll을 부르니 따로 감싸지 않는다.
  // Transaction은 내부 함수로 읽어서 겹치지 않는다.
  wrapRead(Query.prototype, "get");
  wrapRead(Firestore.prototype, "getAll");
  wrapRead(Transaction.prototype, "get");
  wrapRead(Transaction.prototype, "getAll");
  wrapWrites();
}
