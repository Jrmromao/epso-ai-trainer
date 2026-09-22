import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { ExamComponent, Topic } from "@/lib/types";
import type {
  Attempt,
  DueItem,
  ProgressRepo,
  ProgressSnapshot,
  WeakArea,
} from "@/lib/storage/progressRepo";

// IndexedDB-backed ProgressRepo. Local, single-user, private — no server, no
// network. Handles thousands of attempts comfortably (unlike localStorage).

const DB_NAME = "epso-progress";
const DB_VERSION = 1;
const STORE = "attempts";

interface ProgressDb extends DBSchema {
  attempts: {
    key: string;
    value: Attempt;
    indexes: { "by-question": string; "by-component": string };
  };
}

// Spaced-repetition intervals (ms) by consecutive-correct streak. A miss resets
// the streak to 0 (due again within the first interval). Deliberately simple —
// a documented Leitner-style ladder, not full SM-2.
const DAY = 24 * 60 * 60 * 1000;
const SR_INTERVALS_MS = [DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY, 32 * DAY];

function bucketKey(component: ExamComponent, topic: Topic | null): string {
  return `${component}::${topic ?? "-"}`;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class IndexedDbProgressRepo implements ProgressRepo {
  private dbPromise: Promise<IDBPDatabase<ProgressDb>> | null = null;

  private db(): Promise<IDBPDatabase<ProgressDb>> {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB unavailable (server context)"));
    }
    if (!this.dbPromise) {
      this.dbPromise = openDB<ProgressDb>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-question", "questionId");
          store.createIndex("by-component", "component");
        },
      });
    }
    return this.dbPromise;
  }

  async recordAttempt(attempt: Omit<Attempt, "id">): Promise<void> {
    const db = await this.db();
    await db.add(STORE, { ...attempt, id: uuid() });
  }

  async recordAttempts(attempts: Omit<Attempt, "id">[]): Promise<void> {
    if (attempts.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    await Promise.all([
      ...attempts.map((a) => tx.store.add({ ...a, id: uuid() })),
      tx.done,
    ]);
  }

  async getWeakAreas(): Promise<WeakArea[]> {
    const db = await this.db();
    const all = await db.getAll(STORE);

    const buckets = new Map<string, WeakArea>();
    for (const a of all) {
      const key = bucketKey(a.component, a.topic);
      const wa =
        buckets.get(key) ??
        ({
          component: a.component,
          topic: a.topic,
          attempts: 0,
          correct: 0,
          accuracy: 0,
          lastPractisedMs: null,
        } satisfies WeakArea);
      wa.attempts += 1;
      if (a.correct) wa.correct += 1;
      wa.lastPractisedMs = Math.max(wa.lastPractisedMs ?? 0, a.timestampMs);
      buckets.set(key, wa);
    }

    return [...buckets.values()]
      .map((wa) => ({
        ...wa,
        accuracy: wa.attempts > 0 ? wa.correct / wa.attempts : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy); // weakest first
  }

  async getDueForReview(nowMs: number = Date.now()): Promise<DueItem[]> {
    const db = await this.db();
    const all = await db.getAll(STORE);

    // Reduce per question to a streak of consecutive-correct-since-last-miss.
    const byQuestion = new Map<string, Attempt[]>();
    for (const a of all) {
      const arr = byQuestion.get(a.questionId) ?? [];
      arr.push(a);
      byQuestion.set(a.questionId, arr);
    }

    const due: DueItem[] = [];
    for (const [questionId, attemptsRaw] of byQuestion) {
      const attempts = attemptsRaw.sort((x, y) => x.timestampMs - y.timestampMs);
      const misses = attempts.filter((a) => !a.correct).length;
      if (misses === 0) continue; // never missed -> not a review item
      if (questionId.startsWith("migrated:")) continue; // aggregate history, not reviewable

      // Consecutive correct since the last miss determines the interval rung.
      let streak = 0;
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].correct) streak += 1;
        else break;
      }
      const last = attempts[attempts.length - 1];
      const rung = Math.min(streak, SR_INTERVALS_MS.length - 1);
      const interval = streak === 0 ? SR_INTERVALS_MS[0] : SR_INTERVALS_MS[rung];
      const dueMs = last.timestampMs + interval;

      if (dueMs <= nowMs) {
        due.push({
          questionId,
          component: last.component,
          topic: last.topic,
          misses,
          lastSeenMs: last.timestampMs,
          dueMs,
        });
      }
    }

    return due.sort((a, b) => a.dueMs - b.dueMs); // most overdue first
  }

  async exportAll(): Promise<ProgressSnapshot> {
    const db = await this.db();
    const attempts = await db.getAll(STORE);
    return { version: 1, exportedAtMs: Date.now(), attempts };
  }

  async importAll(snapshot: ProgressSnapshot): Promise<{ imported: number }> {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.attempts)) {
      throw new Error("Invalid progress snapshot");
    }
    const db = await this.db();
    const existing = new Set(await db.getAllKeys(STORE));
    const tx = db.transaction(STORE, "readwrite");
    let imported = 0;
    for (const a of snapshot.attempts) {
      // Skip duplicates by id (idempotent import / merge).
      if (a && typeof a.id === "string" && !existing.has(a.id)) {
        await tx.store.add(a);
        imported += 1;
      }
    }
    await tx.done;
    return { imported };
  }

  async clear(): Promise<void> {
    const db = await this.db();
    await db.clear(STORE);
  }
}

// Singleton — one DB connection per tab.
let instance: IndexedDbProgressRepo | null = null;

export function getProgressRepo(): IndexedDbProgressRepo {
  if (!instance) instance = new IndexedDbProgressRepo();
  return instance;
}
