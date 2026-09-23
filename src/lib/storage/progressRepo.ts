import type { ChoiceKey, ExamComponent, Question, Topic } from "@/lib/types";

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

// One question inside a saved test, with the full content needed to review it
// later (stem, options, correct answer, explanation, table) plus what the user
// chose. Storing the whole Question means the review screen shows everything
// without re-generating or looking anything up.
export interface ReviewItem {
  question: Question;
  chosen: ChoiceKey | null; // null = left unanswered / timed out
  correct: boolean;
}

// A completed test, saved so the user can revisit their wrong answers (and the
// correct answer + explanation) afterwards — no note-taking needed during the
// timed test. Kept in a separate IndexedDB store from `attempts` because it is
// heavy content queried only on the review screen, not aggregated per-attempt.
export interface TestReview {
  id: string; // uuid
  dateMs: number;
  label: string; // e.g. "Full exam" or the topic label
  component: ExamComponent;
  topic: Topic | null;
  correct: number;
  total: number;
  items: ReviewItem[];
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
  // Saved test reviews (see wrong answers + correct answer afterwards).
  saveTestReview(review: Omit<TestReview, "id">): Promise<string>; // returns new id
  listTestReviews(): Promise<TestReview[]>; // newest first, no items (list view)
  getTestReview(id: string): Promise<TestReview | null>; // full, with items
  deleteTestReview(id: string): Promise<void>;
}
