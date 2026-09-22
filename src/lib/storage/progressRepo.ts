import type { ExamComponent, Topic } from "@/lib/types";

// One recorded practice attempt at a single question. This is the atomic unit
// the weak-area tracker aggregates over. Stored locally (IndexedDB).
export interface Attempt {
  id: string; // uuid
  component: ExamComponent;
  topic: Topic | null; // null for components without a generatable topic (abstract/essay)
  questionId: string;
  correct: boolean;
  timestampMs: number;
}

// Aggregated accuracy + recency for one component or topic bucket.
export interface WeakArea {
  component: ExamComponent;
  topic: Topic | null;
  attempts: number;
  correct: number;
  accuracy: number; // 0..1
  lastPractisedMs: number | null;
}

// A missed question due to be resurfaced by spaced repetition.
export interface DueItem {
  questionId: string;
  component: ExamComponent;
  topic: Topic | null;
  misses: number;
  lastSeenMs: number;
  dueMs: number; // when it becomes due for review
}

// Portable snapshot for JSON export/import (backup + moving machines).
export interface ProgressSnapshot {
  version: 1;
  exportedAtMs: number;
  attempts: Attempt[];
}

// Storage abstraction. IndexedDB backs this today; a hosted DB (Turso/Vercel PG)
// could be swapped in behind the same interface if cross-device sync is ever
// needed — without touching tracking/dashboard logic.
export interface ProgressRepo {
  recordAttempt(attempt: Omit<Attempt, "id">): Promise<void>;
  recordAttempts(attempts: Omit<Attempt, "id">[]): Promise<void>;
  getWeakAreas(): Promise<WeakArea[]>;
  getDueForReview(nowMs?: number): Promise<DueItem[]>;
  getHistoryTotals(): Promise<{ freshAttempts: number; migratedAttempts: number }>;
  exportAll(): Promise<ProgressSnapshot>;
  importAll(snapshot: ProgressSnapshot): Promise<{ imported: number }>;
  clear(): Promise<void>;
}
