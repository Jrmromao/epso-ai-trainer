"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExamComponent } from "@/lib/types";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";
import { migrateLegacyHistory } from "@/lib/storage/migrateLegacyHistory";
import {
  type ComponentStatus,
  type Recommendation,
  recommendToday,
  toComponentStatuses,
} from "@/lib/studyPlan";

// Where to send the user for each component. In-app components deep-link to a
// mock; abstract/essay point at the external practice panel (anchor on home).
const COMPONENT_LINK: Record<ExamComponent, string> = {
  "field-ai": "/exam",
  verbal: "/mock/verbal",
  numerical: "/mock/numerical",
  abstract: "/tutorials/abstract-reasoning",
  essay: "#study-externally",
};

function accuracyColor(accuracy: number, attempts: number): string {
  if (attempts === 0) return "text-neutral-400";
  if (accuracy >= 0.7) return "text-green-700";
  if (accuracy >= 0.5) return "text-amber-600";
  return "text-red-600";
}

function recency(status: ComponentStatus): string {
  if (status.attempts === 0) return "never practised";
  if (status.daysSince === 0) return "today";
  if (status.daysSince === 1) return "yesterday";
  return `${status.daysSince} days ago`;
}

export default function StudyDashboard() {
  const [statuses, setStatuses] = useState<ComponentStatus[] | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [dueCount, setDueCount] = useState(0);

  const load = useCallback(async () => {
    const repo = getProgressRepo();
    try {
      await migrateLegacyHistory(repo);
      const [weakAreas, due] = await Promise.all([
        repo.getWeakAreas(),
        repo.getDueForReview(),
      ]);
      const s = toComponentStatuses(weakAreas);
      setStatuses(s);
      setRecommendation(recommendToday(s));
      setDueCount(due.length);
    } catch {
      setStatuses([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (statuses === null) {
    return (
      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-500">
        Loading your progress…
      </div>
    );
  }

  const totalAttempts = statuses.reduce((n, s) => n + s.attempts, 0);

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Your study dashboard</h2>

      {totalAttempts === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          No practice logged yet. Run a mock or the full exam and your
          weak areas will start showing here.
        </p>
      ) : (
        <>
          {recommendation && (
            <div className="mt-3 rounded-lg border border-neutral-900 bg-neutral-900 p-4 text-white">
              <p className="text-xs uppercase tracking-wide text-neutral-300">
                Study today
              </p>
              <p className="mt-1 text-lg font-semibold">{recommendation.label}</p>
              <p className="mt-1 text-sm text-neutral-200">{recommendation.reason}</p>
              <a
                href={COMPONENT_LINK[recommendation.component]}
                className="mt-3 inline-block rounded bg-white px-3 py-1.5 text-sm font-medium text-neutral-900"
              >
                {recommendation.inApp ? "Practise now" : "How to practise this"} &rarr;
              </a>
              {!recommendation.inApp && (
                <p className="mt-2 text-xs text-neutral-300">
                  Not drilled in-app — practise on the official EPSO tool (see
                  the study-externally panel below).
                </p>
              )}
            </div>
          )}

          {dueCount > 0 && (
            <p className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {dueCount} question{dueCount === 1 ? "" : "s"} you previously missed
              {dueCount === 1 ? " is" : " are"} due for review (spaced repetition).
            </p>
          )}

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {statuses.map((s) => (
              <a
                key={s.component}
                href={COMPONENT_LINK[s.component]}
                className="block rounded-lg border border-neutral-300 bg-white p-3 transition hover:border-neutral-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.label}</span>
                  {!s.inApp && (
                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                      external
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className={accuracyColor(s.accuracy, s.attempts)}>
                    {s.attempts > 0 ? `${Math.round(s.accuracy * 100)}% · ${s.attempts} attempts` : "—"}
                  </span>
                  <span className="text-neutral-500">{recency(s)}</span>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
