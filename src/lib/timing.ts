import type { ExamComponent, Topic } from "@/lib/types";

// Single source of truth for per-question time budgets, matching the real EPSO
// pace for each test type. Used by every runner so timing is consistent.
//
// Verbal:    20 Q / 35 min = 105 s/Q
// Numerical: 10 Q / 20 min = 120 s/Q
// Abstract:  10 Q / 10 min =  60 s/Q
// Field AI:  30 Q / 40 min =  80 s/Q

export const SECONDS_PER_QUESTION: Record<ExamComponent, number> = {
  verbal: 105,
  numerical: 120,
  abstract: 60,
  "field-ai": 80,
  essay: 40 * 60, // the essay is one timed task, not per-question
};

// Topic-level lookup (reasoning topics roll up to their component budget).
export function budgetForTopic(topic: Topic): number {
  if (topic === "verbal" || topic === "verbal-rc") return SECONDS_PER_QUESTION.verbal;
  if (topic === "numerical") return SECONDS_PER_QUESTION.numerical;
  return SECONDS_PER_QUESTION["field-ai"];
}
