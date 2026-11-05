"use client";

import { useCallback } from "react";
import type { AnswerRecord, ExamComponent, Topic } from "@/lib/types";
import { componentForTopic } from "@/lib/types";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";

// Records a finished run's per-question attempts into the IndexedDB progress
// store, feeding the weak-area tracker + spaced repetition. Fire-and-forget:
// a storage failure must never block the UI (the run result still shows).

export function useProgress() {
  const recordRun = useCallback(
    (records: AnswerRecord[], componentOverride?: ExamComponent) => {
      // Skipped questions (chosen === null) are NOT attempts — the candidate
      // never answered. Excluding them keeps the weak-area accuracy signal
      // honest: "didn't answer" must not count as "got it wrong". (Same reasoning
      // as excluding migrated aggregate history from the signal.)
      const attempted = records.filter((r) => r.chosen !== null);
      if (attempted.length === 0) return;
      const now = Date.now();
      // One sessionId per finished run, so within-sitting trends can be read
      // from the history without guessing from timestamps.
      const sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${now}-${Math.random().toString(36).slice(2, 10)}`;
      const attempts = attempted.map((r) => ({
        component: componentOverride ?? componentForTopic(r.topic),
        topic: (r.topic ?? null) as Topic | null,
        questionId: r.questionId,
        correct: r.isCorrect,
        timestampMs: now,
        // v2 analytics: chosen option, run grouping, and (where the runner
        // supplies them) difficulty, time-on-question and the chosen distractor's
        // plausibility rank. Omit undefined fields so attempts stay compact.
        chosenAnswer: r.chosen,
        sessionId,
        ...(r.difficulty !== undefined ? { difficulty: r.difficulty } : {}),
        ...(r.durationMs !== undefined ? { durationMs: r.durationMs } : {}),
        ...(r.distractorRank !== undefined ? { distractorRank: r.distractorRank } : {}),
      }));
      getProgressRepo()
        .recordAttempts(attempts)
        .catch(() => {
          // non-fatal — tracking is best-effort, never blocks the result view
        });
    },
    [],
  );

  return { recordRun };
}
