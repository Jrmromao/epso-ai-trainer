"use client";

import { useCallback } from "react";
import type {
  AnswerRecord,
  ExamComponent,
  Question,
  Topic,
} from "@/lib/types";
import { componentForTopic } from "@/lib/types";
import type { ReviewItem } from "@/lib/storage/progressRepo";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";

// Saves a completed test (full question content + the user's answers) so it can
// be reviewed later — see wrong answers, the correct answer, and the built-in
// explanation without taking notes during the timed test. Returns the saved
// test's id (or null on failure) so the caller can deep-link to its review.
// Never throws: a storage failure must not block the result view.
export function useTestReview() {
  const saveReview = useCallback(
    async (
      label: string,
      questions: Question[],
      records: AnswerRecord[],
      componentOverride?: ExamComponent,
    ): Promise<string | null> => {
      if (questions.length === 0) return null;

      // Index the user's answers by questionId for a robust join (records may
      // be shorter than questions if a run ended early).
      const chosenById = new Map(records.map((r) => [r.questionId, r]));

      const items: ReviewItem[] = questions.map((q) => {
        const rec = chosenById.get(q.id);
        return {
          question: q,
          chosen: rec ? rec.chosen : null,
          correct: rec ? rec.isCorrect : false,
        };
      });

      const correct = items.filter((i) => i.correct).length;
      const firstTopic = (questions[0]?.topic ?? null) as Topic | null;

      try {
        return await getProgressRepo().saveTestReview({
          dateMs: Date.now(),
          label,
          component: componentOverride ?? componentForTopic(firstTopic ?? "verbal"),
          topic: firstTopic,
          correct,
          total: items.length,
          items,
        });
      } catch {
        // non-fatal — review saving is best-effort, never blocks the result
        return null;
      }
    },
    [],
  );

  return { saveReview };
}
