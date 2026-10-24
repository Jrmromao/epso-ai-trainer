"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExamComponent } from "@/lib/types";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";
import { migrateLegacyHistory } from "@/lib/storage/migrateLegacyHistory";
import {
  type PlanConfig,
  type StudyBlock,
  type StudyLevel,
  DEFAULT_PLAN_CONFIG,
  LEVEL_LABELS,
  TECHNIQUE_LABELS,
  buildWeeklyPlan,
  toComponentStatuses,
} from "@/lib/studyPlan";

const CONFIG_KEY = "epso.planConfig";

// Where each component sends you. Primary = the drill to do; secondary (where
// present) = the technique/tutorial to read first. Abstract now drills in-app
// at /abstract, with the technique tutorial as a secondary link.
const RESOURCE: Record<
  ExamComponent,
  { href: string; label: string; secondary?: { href: string; label: string } }
> = {
  "field-ai": { href: "/exam", label: "AI field exam / mocks" },
  verbal: { href: "/mock/verbal", label: "Verbal drill" },
  numerical: { href: "/mock/numerical", label: "Numerical drill" },
  abstract: {
    href: "/abstract",
    label: "Abstract practice",
    secondary: { href: "/tutorials/abstract-reasoning", label: "Technique guide" },
  },
  essay: { href: "/eufte", label: "EUFTE essay (timed + graded)" },
};

// Where a beginner "learn" (study-first) block sends the user. Field AI has no
// single Study page, so route to the AI Act study entry as the starting point;
// abstract routes to its technique tutorial.
const STUDY_RESOURCE: Partial<Record<ExamComponent, { href: string; label: string }>> = {
  "field-ai": { href: "/study/ai-act", label: "Study: AI concepts" },
  numerical: { href: "/mock/numerical", label: "Numerical learn mode" },
  verbal: { href: "/mock/verbal", label: "Verbal learn mode" },
  abstract: { href: "/tutorials/abstract-reasoning", label: "Read the technique guide" },
  essay: { href: "/eufte", label: "EUFTE essay guide" },
};

const PHASE_LABELS: Record<1 | 2 | 3, string> = {
  1: "Phase 1 · Learn",
  2: "Phase 2 · Gentle practice",
  3: "Phase 3 · Exam conditions",
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
        {config.level === "beginner" ? (
          <>
            A foundations-first ramp for someone new to the material:{" "}
            <strong>learn the concepts first</strong>, then gentle untimed
            practice, then your first timed mock. No weak-area weighting yet
            &mdash; switch to Intermediate once you have some results.
          </>
        ) : (
          <>
            Weak-topic-weighted and rebuilt every visit from your latest
            results. It allocates the week across all five exam components
            &mdash; including the eliminatory abstract gate, now drillable in-app
            &mdash; and tells you which technique to use for each block.
          </>
        )}
      </p>

      {/* Config */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-300 bg-white p-3 text-sm">
        <label className="flex items-center gap-2">
          Level:
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={config.level}
            onChange={(e) => updateConfig({ level: e.target.value as StudyLevel })}
          >
            {(["beginner", "intermediate", "advanced"] as StudyLevel[]).map((lvl) => (
              <option key={lvl} value={lvl}>
                {LEVEL_LABELS[lvl]}
              </option>
            ))}
          </select>
        </label>
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
            const studyRes = b.mode === "study" ? STUDY_RESOURCE[b.component] : undefined;
            const primary = studyRes ?? res;
            return (
              <li
                key={i}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-neutral-900 px-2 py-0.5 text-xs font-semibold text-white">
                        Day {b.day}
                      </span>
                      {b.phase && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                          {PHASE_LABELS[b.phase]}
                        </span>
                      )}
                      <span className="font-medium">{b.label}</span>
                      <span className="text-xs text-neutral-500">· {b.minutes} min</span>
                      {b.component === "abstract" && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800">
                          eliminatory gate
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      <span className="font-medium text-neutral-800">
                        {TECHNIQUE_LABELS[b.technique]}
                      </span>{" "}
                      — {b.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <a
                      href={primary.href}
                      className={`rounded px-3 py-1.5 text-xs font-medium ${
                        b.inApp
                          ? "bg-neutral-900 text-white"
                          : "border border-neutral-300 text-neutral-700"
                      }`}
                    >
                      {b.inApp ? primary.label : "External"}
                    </a>
                    {!studyRes && res.secondary && (
                      <a
                        href={res.secondary.href}
                        className="rounded border border-neutral-300 px-3 py-1 text-[11px] text-neutral-600 hover:border-neutral-900"
                      >
                        {res.secondary.label}
                      </a>
                    )}
                  </div>
                </div>
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
