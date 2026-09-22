"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExamComponent } from "@/lib/types";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";
import { migrateLegacyHistory } from "@/lib/storage/migrateLegacyHistory";
import {
  type PlanConfig,
  type StudyBlock,
  DEFAULT_PLAN_CONFIG,
  TECHNIQUE_LABELS,
  buildWeeklyPlan,
  toComponentStatuses,
} from "@/lib/studyPlan";

const CONFIG_KEY = "epso.planConfig";

// Where each component sends you. In-app for what the app drills well; the
// official/validated route for abstract + essay (the app can't train those).
const RESOURCE: Record<ExamComponent, { href: string; label: string }> = {
  "field-ai": { href: "/exam", label: "AI field exam / mocks" },
  verbal: { href: "/mock/verbal", label: "Verbal drill" },
  numerical: { href: "/mock/numerical", label: "Numerical drill" },
  abstract: { href: "/tutorials/abstract-reasoning", label: "Abstract technique + official tool" },
  essay: { href: "#study-externally", label: "EUFTE essay (external)" },
};

function loadConfig(): PlanConfig {
  if (typeof window === "undefined") return DEFAULT_PLAN_CONFIG;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_PLAN_CONFIG, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_PLAN_CONFIG;
}

export default function WeeklyPlan() {
  const [config, setConfig] = useState<PlanConfig>(DEFAULT_PLAN_CONFIG);
  const [blocks, setBlocks] = useState<StudyBlock[] | null>(null);

  const rebuild = useCallback(async (cfg: PlanConfig) => {
    const repo = getProgressRepo();
    try {
      await migrateLegacyHistory(repo);
      const [weakAreas, due] = await Promise.all([
        repo.getWeakAreas(),
        repo.getDueForReview(),
      ]);
      const statuses = toComponentStatuses(weakAreas);
      setBlocks(buildWeeklyPlan(statuses, due.length, cfg));
    } catch {
      setBlocks([]);
    }
  }, []);

  useEffect(() => {
    const cfg = loadConfig();
    setConfig(cfg);
    rebuild(cfg);
  }, [rebuild]);

  function updateConfig(patch: Partial<PlanConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    rebuild(next);
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">This week&rsquo;s study plan</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Weak-topic-weighted and rebuilt every visit from your latest results.
        It allocates the week across all four test parts and tells you which
        technique to use.
      </p>

      {/* Config */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-300 bg-white p-3 text-sm">
        <label className="flex items-center gap-2">
          Days/week:
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={config.daysPerWeek}
            onChange={(e) => updateConfig({ daysPerWeek: Number(e.target.value) })}
          >
            {[3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Minutes/session:
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={config.minutesPerSession}
            onChange={(e) =>
              updateConfig({ minutesPerSession: Number(e.target.value) })
            }
          >
            {[20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Plan */}
      {blocks && blocks.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {blocks.map((b, i) => {
            const res = RESOURCE[b.component];
            return (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-white">
                      Day {b.day}
                    </span>
                    <span className="font-medium">{b.label}</span>
                    <span className="text-xs text-neutral-500">· {b.minutes} min</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600">
                    <span className="font-medium text-neutral-800">
                      {TECHNIQUE_LABELS[b.technique]}
                    </span>{" "}
                    — {b.reason}
                  </p>
                </div>
                <a
                  href={res.href}
                  className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium ${
                    b.inApp
                      ? "bg-neutral-900 text-white"
                      : "border border-neutral-300 text-neutral-700"
                  }`}
                >
                  {b.inApp ? "Start" : "External"}
                </a>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">Building your plan…</p>
      )}

      {/* Evidence-based technique primer */}
      <details className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">
          How to study these (the techniques that actually work)
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
          <li>
            <strong>Retrieval practice:</strong> test yourself instead of
            re-reading. Trying to recall the answer &mdash; even failing &mdash;
            builds memory far better than reviewing notes.
          </li>
          <li>
            <strong>Spaced repetition:</strong> revisit missed items after
            growing gaps (1, 2, 4, 8 days&hellip;). Spacing beats cramming for
            long-term recall &mdash; the app queues these for you.
          </li>
          <li>
            <strong>Interleaving:</strong> mix topics in one session (the exam
            does). It feels harder but retains better than blocking one topic.
          </li>
          <li>
            <strong>Explain-why (elaboration):</strong> before revealing the
            answer, say <em>why</em> you think it&rsquo;s right. Generating the
            reasoning deepens encoding.
          </li>
          <li>
            <strong>Calibrate:</strong> notice where you were confident but
            wrong &mdash; those blind spots are the highest priority to relearn.
          </li>
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          Techniques with the strongest research support (Dunlosky et al., 2013;
          Roediger &amp; Karpicke). Highlighting and re-reading are popular but
          weak &mdash; this app is built around testing instead.
        </p>
      </details>
    </section>
  );
}
