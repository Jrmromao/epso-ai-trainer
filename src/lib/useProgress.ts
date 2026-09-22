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
      if (records.length === 0) return;
      const now = Date.now();
      const attempts = records.map((r) => ({
        component: componentOverride ?? componentForTopic(r.topic),
        topic: (r.topic ?? null) as Topic | null,
        questionId: r.questionId,
        correct: r.isCorrect,
        timestampMs: now,
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
