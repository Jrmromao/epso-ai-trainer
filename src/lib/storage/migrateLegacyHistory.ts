import type { Attempt, ProgressRepo } from "@/lib/storage/progressRepo";
import { componentForTopic, type Topic } from "@/lib/types";

// One-time migration of the legacy localStorage mock history (aggregate-only:
// topic + correct/total per run) into the IndexedDB attempt store.
//
// The old data has no per-question detail, so we synthesise attempts that
// preserve per-topic ACCURACY for the dashboard, tagged with a "migrated:"
// questionId so they are excluded from spaced repetition (they aren't real
// reviewable questions). Runs once, guarded by a flag key.

const LEGACY_KEY = "epso.mockHistory";
const MIGRATED_FLAG = "epso.progress.migrated.v1";

interface LegacyRun {
  date: string;
  topic: Topic;
  correct: number;
  total: number;
}

export async function migrateLegacyHistory(repo: ProgressRepo): Promise<number> {
  if (typeof window === "undefined") return 0;
  if (window.localStorage.getItem(MIGRATED_FLAG)) return 0;

  let runs: LegacyRun[] = [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (raw) runs = JSON.parse(raw) as LegacyRun[];
  } catch {
    runs = [];
  }

  if (runs.length === 0) {
    window.localStorage.setItem(MIGRATED_FLAG, "1");
    return 0;
  }

  const attempts: Omit<Attempt, "id">[] = [];
  for (const run of runs) {
    if (!run || typeof run.total !== "number") continue;
    const ts = Date.parse(run.date) || Date.now();
    for (let i = 0; i < run.total; i++) {
      attempts.push({
        component: componentForTopic(run.topic),
        topic: run.topic ?? null,
        questionId: `migrated:${run.topic}:${run.date}:${i}`,
        correct: i < run.correct,
        timestampMs: ts,
      });
    }
  }

  await repo.recordAttempts(attempts);
  window.localStorage.setItem(MIGRATED_FLAG, "1");
  return attempts.length;
}
