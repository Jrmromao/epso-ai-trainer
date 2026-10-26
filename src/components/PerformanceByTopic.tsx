"use client";

import type { AnswerRecord } from "@/lib/types";
import { toTopicStats, performanceBand } from "@/lib/performanceByTopic";

// Per-topic performance breakdown shown at the end of a test. Groups the run's
// answer records by the topic each question belongs to, computes accuracy
// (0-100%), and renders a color-coded bar per topic. Skipped answers (chosen
// === null) count as not-correct for the score, matching how the overall score
// is computed.

export default function PerformanceByTopic({ records }: { records: AnswerRecord[] }) {
  const stats = toTopicStats(records);
  if (stats.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-neutral-800">Performance by topic</h3>
      <ul className="mt-3 space-y-3">
        {stats.map((s) => {
          const b = performanceBand(s.pct);
          return (
            <li key={s.topic}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-neutral-800">{s.label}</span>
                <span className={`font-semibold tabular-nums ${b.text}`}>
                  {s.pct}%{" "}
                  <span className="font-normal text-neutral-500">
                    ({s.correct}/{s.total})
                  </span>
                </span>
              </div>
              <div
                className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100"
                role="progressbar"
                aria-valuenow={s.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${s.label}: ${s.pct}% correct`}
              >
                <div
                  className={`h-full rounded-full transition-all ${b.bar}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
              <div className={`mt-0.5 text-[11px] font-medium ${b.text}`}>{b.label}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

