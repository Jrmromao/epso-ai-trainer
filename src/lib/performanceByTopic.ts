import type { AnswerRecord, Topic } from "@/lib/types";
import { TOPIC_LABELS } from "@/lib/types";

// Pure helpers for the end-of-test "Performance by topic" breakdown. Kept
// separate from the component so the grouping/scoring math is unit-testable.

export interface TopicStat {
  topic: Topic;
  label: string;
  correct: number;
  total: number;
  pct: number; // 0..100
}

// Group a run's answer records by the topic each question belongs to and
// compute accuracy. Skipped answers (isCorrect === false) count as not-correct,
// matching the overall score. Sorted weakest-first — the most useful ordering
// for deciding what to revise next.
export function toTopicStats(records: AnswerRecord[]): TopicStat[] {
  const byTopic = new Map<Topic, { correct: number; total: number }>();
  for (const r of records) {
    const agg = byTopic.get(r.topic) ?? { correct: 0, total: 0 };
    agg.total += 1;
    if (r.isCorrect) agg.correct += 1;
    byTopic.set(r.topic, agg);
  }
  return [...byTopic.entries()]
    .map(([topic, { correct, total }]) => ({
      topic,
      label: TOPIC_LABELS[topic],
      correct,
      total,
      pct: total > 0 ? Math.round((correct / total) * 100) : 0,
    }))
    .sort((a, b) => a.pct - b.pct);
}

export interface PerformanceBand {
  bar: string;
  text: string;
  label: string;
}

// Color bands: red (<50) weak, amber (50-74) borderline, green (>=75) solid.
// Full static class strings so Tailwind doesn't purge them.
export function performanceBand(pct: number): PerformanceBand {
  if (pct < 50) return { bar: "bg-red-500", text: "text-red-700", label: "Needs work" };
  if (pct < 75) return { bar: "bg-amber-500", text: "text-amber-700", label: "Borderline" };
  return { bar: "bg-green-500", text: "text-green-700", label: "Solid" };
}
