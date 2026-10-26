// Per-tab persistence for an in-progress mock session.
//
// The bug this fixes: generated questions and in-progress answers lived only in
// React state, so a refresh or back/forward navigation remounted the component
// and wiped everything. We persist to sessionStorage (NOT localStorage) on
// purpose:
//   - survives refresh and back/forward within the same tab,
//   - scoped per-tab so two open sessions don't clobber each other,
//   - cleared automatically when the tab closes, so stale sets don't linger.
//
// Keyed by topic so each topic's session is independent. Everything is
// best-effort: any parse/shape mismatch returns null and the caller falls back
// to the seeded bank (same as before), so a corrupt entry can never break the
// page.

import type { AnswerRecord, ChoiceKey, Question, Topic } from "@/lib/types";

const VERSION = 1;

export interface PersistedRun {
  index: number;
  records: AnswerRecord[];
  chosen: ChoiceKey | null;
  revealed: boolean;
  finished: boolean;
  sessionLeft: number;
}

export interface PersistedSession {
  version: number;
  topic: Topic;
  questions: Question[];
  notice: string | null;
  // Present once the user has started answering; absent for a freshly loaded set.
  run?: PersistedRun;
  savedAt: number;
}

function keyFor(topic: Topic): string {
  return `epso.mockSession.${topic}`;
}

function available(): boolean {
  return typeof window !== "undefined" && !!window.sessionStorage;
}

export function loadSession(topic: Topic): PersistedSession | null {
  if (!available()) return null;
  try {
    const raw = window.sessionStorage.getItem(keyFor(topic));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (
      !parsed ||
      parsed.version !== VERSION ||
      parsed.topic !== topic ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: Omit<PersistedSession, "version" | "savedAt">): void {
  if (!available()) return;
  try {
    const payload: PersistedSession = { ...session, version: VERSION, savedAt: Date.now() };
    window.sessionStorage.setItem(keyFor(session.topic), JSON.stringify(payload));
  } catch {
    // Quota or serialization failure — persistence is best-effort; ignore.
  }
}

// Update just the run-progress portion of an already-saved session. No-op if
// nothing is saved yet for this topic (shouldn't happen — the question set is
// saved first on load/generate).
export function saveRunProgress(topic: Topic, run: PersistedRun): void {
  if (!available()) return;
  const existing = loadSession(topic);
  if (!existing) return;
  saveSession({ ...existing, run });
}

export function clearSession(topic: Topic): void {
  if (!available()) return;
  try {
    window.sessionStorage.removeItem(keyFor(topic));
  } catch {
    // ignore
  }
}
