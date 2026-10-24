// Cross-generation answer-position history.
//
// Per-question shuffling fixes the "correct answer is always A" LLM bias, and
// the per-batch balancer (see questionSchema.ts) spreads correct positions
// evenly WITHIN one generated set. But when questions are generated one at a
// time (count = 1), there is no set to balance — so successive single
// generations could still land the correct answer on the same letter (e.g. B,
// B, B). This module remembers the LAST correct position per (topic, language)
// so the balancer can avoid immediately repeating it across separate requests.
//
// Same contract as rateLimit.ts: in-memory, best-effort, resets on serverless
// cold start. Acceptable for a personal app — it removes the common warm-session
// repeat without needing a datastore.

import type { ChoiceKey } from "@/lib/types";

// Keep a short rolling tail of recent correct positions per key so the balancer
// can also discourage short cycles (A,B,A,B) across single generations, not
// just immediate repeats.
const MAX_TAIL = 4;
const store = new Map<string, ChoiceKey[]>();

function keyOf(topic: string, language: string): string {
  return `${topic}::${language}`;
}

// The most recent correct position for this (topic, language), or null if none
// recorded yet (cold start / first generation).
export function lastCorrectPosition(topic: string, language: string): ChoiceKey | null {
  const tail = store.get(keyOf(topic, language));
  return tail && tail.length > 0 ? tail[tail.length - 1] : null;
}

// The recent tail (oldest -> newest), used by the balancer to break short
// cycles. Returns a copy so callers can't mutate internal state.
export function recentCorrectPositions(topic: string, language: string): ChoiceKey[] {
  const tail = store.get(keyOf(topic, language));
  return tail ? [...tail] : [];
}

// Record the correct positions of a freshly generated set, in order. Call this
// AFTER the final (post-harden, post-balance) set is built so the history
// reflects what the user actually sees.
export function recordCorrectPositions(topic: string, language: string, positions: ChoiceKey[]): void {
  if (positions.length === 0) return;
  const k = keyOf(topic, language);
  const next = [...(store.get(k) ?? []), ...positions].slice(-MAX_TAIL);
  store.set(k, next);
}

// Test/maintenance helper — clears all history.
export function __resetAnswerPositionHistory(): void {
  store.clear();
}
