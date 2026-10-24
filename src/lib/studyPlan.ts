import type { ExamComponent } from "@/lib/types";
import { COMPONENT_LABELS } from "@/lib/types";
import type { WeakArea } from "@/lib/storage/progressRepo";

// "What should I study today?" — a deterministic recommendation across all five
// exam components. Over a months-long prep the biggest risk is IMBALANCE:
// over-practising the fun AI part while abstract/numerical rot. So the priority
// is (1) never-touched components, then (2) most-neglected by recency, then
// (3) weakest by accuracy. Abstract/essay are recommended but flagged as
// external (the app can't drill them in-house).

const ALL_COMPONENTS: ExamComponent[] = [
  "field-ai",
  "verbal",
  "numerical",
  "abstract",
  "essay",
];

// Components the app can drill in-house. Abstract has a rule-engine practice at
// /abstract; essay has an AI-graded EUFTE at /eufte. All five are now in-app.
export const IN_APP_COMPONENTS: ReadonlySet<ExamComponent> = new Set<ExamComponent>([
  "field-ai",
  "verbal",
  "numerical",
  "abstract",
  "essay",
]);

export interface ComponentStatus {
  component: ExamComponent;
  label: string;
  attempts: number;
  accuracy: number; // 0..1
  lastPractisedMs: number | null;
  daysSince: number | null; // null = never practised
  inApp: boolean;
}

export interface Recommendation {
  component: ExamComponent;
  label: string;
  reason: string;
  inApp: boolean;
}

function daysSince(ms: number | null, nowMs: number): number | null {
  if (ms == null) return null;
  return Math.floor((nowMs - ms) / (24 * 60 * 60 * 1000));
}

// Roll per-topic weak areas up to per-component status across ALL five
// components (including ones with zero attempts).
export function toComponentStatuses(
  weakAreas: WeakArea[],
  nowMs: number = Date.now(),
): ComponentStatus[] {
  const byComponent = new Map<ExamComponent, { attempts: number; correct: number; last: number | null }>();
  for (const wa of weakAreas) {
    const agg = byComponent.get(wa.component) ?? { attempts: 0, correct: 0, last: null };
    agg.attempts += wa.attempts;
    agg.correct += Math.round(wa.accuracy * wa.attempts);
    agg.last = Math.max(agg.last ?? 0, wa.lastPractisedMs ?? 0) || agg.last;
    byComponent.set(wa.component, agg);
  }

  return ALL_COMPONENTS.map((component) => {
    const agg = byComponent.get(component);
    const attempts = agg?.attempts ?? 0;
    const lastPractisedMs = agg?.last ?? null;
    return {
      component,
      label: COMPONENT_LABELS[component],
      attempts,
      accuracy: attempts > 0 ? (agg?.correct ?? 0) / attempts : 0,
      lastPractisedMs,
      daysSince: daysSince(lastPractisedMs, nowMs),
      inApp: IN_APP_COMPONENTS.has(component),
    };
  });
}

// Pick the single highest-priority component to study next.
export function recommendToday(statuses: ComponentStatus[]): Recommendation {
  // 1. Never touched — highest priority (a total blind spot).
  const untouched = statuses.filter((s) => s.attempts === 0);
  if (untouched.length > 0) {
    const pick = untouched[0];
    return {
      component: pick.component,
      label: pick.label,
      reason: "You haven't practised this at all yet — start here to cover the blind spot.",
      inApp: pick.inApp,
    };
  }

  // 2. Most neglected by recency (>= 4 days since last practice).
  const stale = statuses
    .filter((s) => (s.daysSince ?? 0) >= 4)
    .sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
  if (stale.length > 0) {
    const pick = stale[0];
    return {
      component: pick.component,
      label: pick.label,
      reason: `Not practised in ${pick.daysSince} days — keep it warm before it slips.`,
      inApp: pick.inApp,
    };
  }

  // 3. Weakest by accuracy.
  const weakest = [...statuses].sort((a, b) => a.accuracy - b.accuracy)[0];
  return {
    component: weakest.component,
    label: weakest.label,
    reason: `Lowest accuracy (${Math.round(weakest.accuracy * 100)}%) — target the weak spot.`,
    inApp: weakest.inApp,
  };
}

// ---------------------------------------------------------------------------
// Weekly study plan — the "director".
//
// Grounded in the learning techniques with the strongest empirical support
// (Dunlosky et al. 2013; Roediger & Karpicke, testing effect; Bjork, desirable
// difficulties): retrieval practice, distributed practice (spacing),
// interleaving, elaborative interrogation. It does NOT teach content — it
// allocates the week across the four test parts, weighting weak/neglected
// areas, and routes each block to the best resource (in-app where the app
// helps; official/validated tools where it must, e.g. abstract + essay).
// ---------------------------------------------------------------------------

export type StudyTechnique =
  | "retrieval" // active recall under time pressure (in-app testing)
  | "spaced-review" // resurface previously-missed items (successive relearning)
  | "interleaving" // mixed-topic set (mirrors the real exam)
  | "external-drill" // visual/essay practice on a validated external tool
  | "elaboration"; // explain-why before checking (deepens encoding

export const TECHNIQUE_LABELS: Record<StudyTechnique, string> = {
  retrieval: "Retrieval practice (timed recall)",
  "spaced-review": "Spaced review of missed items",
  interleaving: "Interleaved mixed set",
  "external-drill": "Drill on the official/validated tool",
  elaboration: "Explain-why before revealing",
};

export type StudyLevel = "beginner" | "intermediate" | "advanced";

export interface PlanConfig {
  daysPerWeek: number; // 1..7
  minutesPerSession: number;
  level: StudyLevel;
}

export const DEFAULT_PLAN_CONFIG: PlanConfig = {
  daysPerWeek: 5,
  minutesPerSession: 30,
  level: "intermediate",
};

export const LEVEL_LABELS: Record<StudyLevel, string> = {
  beginner: "Beginner — new to the material",
  intermediate: "Intermediate — some familiarity",
  advanced: "Advanced — revising for the exam",
};

export interface StudyBlock {
  day: number; // 1-based day of the plan week
  component: ExamComponent;
  label: string;
  technique: StudyTechnique;
  minutes: number;
  reason: string;
  inApp: boolean;
  // Beginner plans run in phases (learn -> gentle practice -> exam conditions).
  // Omitted for intermediate/advanced (adaptive) plans.
  phase?: 1 | 2 | 3;
  // For a beginner "learn" block, send the user to the Study page first.
  mode?: "study" | "practice";
}

// Priority score for allocation: weaker + more neglected + never-touched rank
// higher. The reasoning gate (verbal/numerical/abstract) and essay get a floor
// boost because failing the gate eliminates you regardless of field score.
function priorityScore(s: ComponentStatus, nowGateBoost: number): number {
  const weakness = s.attempts > 0 ? 1 - s.accuracy : 1; // untouched treated as fully weak
  const neglect = s.daysSince == null ? 1 : Math.min(s.daysSince / 14, 1);
  const untouched = s.attempts === 0 ? 0.5 : 0;
  return weakness * 1.5 + neglect + untouched + nowGateBoost;
}

// The reasoning gate + essay are elimination-critical; ensure they get weekly
// time even when the (in-app) accuracy signal is thin.
const GATE_BOOST: Partial<Record<ExamComponent, number>> = {
  abstract: 0.6, // visual, external-only, and it eliminates — never let it rot
  verbal: 0.3,
  numerical: 0.3,
  essay: 0.3,
};

function techniqueFor(component: ExamComponent, isReview: boolean): StudyTechnique {
  if (isReview) return "spaced-review";
  if (component === "essay") return "elaboration"; // write + self-explain, AI-graded in-app
  if (component === "abstract") return "retrieval"; // in-app pattern practice
  if (component === "field-ai") return "interleaving";
  return "retrieval";
}

// Build a rolling weekly plan. Recompute on each visit so it always reflects
// current weakness (adaptive; no frozen plan is persisted). For beginners, the
// plan is a foundations-first phased ramp instead (see buildBeginnerPlan).
export function buildWeeklyPlan(
  statuses: ComponentStatus[],
  dueCount: number,
  config: PlanConfig = DEFAULT_PLAN_CONFIG,
): StudyBlock[] {
  if (config.level === "beginner") {
    return buildBeginnerPlan(statuses, config);
  }
  return buildAdaptivePlan(statuses, dueCount, config);
}

// Beginner plan — foundations-first. A near-beginner has no useful accuracy
// signal and should NOT be dropped into timed, interleaved mocks: the research
// (and common sense) says you need baseline schema before desirable-difficulty
// techniques (spacing, interleaving, timed retrieval) pay off. So the week
// ramps through three phases:
//   Phase 1 — LEARN: read the concept (Study page) with explain-why elaboration.
//   Phase 2 — GENTLE PRACTICE: untimed/learn-mode drills, ONE component at a
//             time (blocked, not interleaved) to build confidence.
//   Phase 3 — RAMP: a first timed, interleaved mock to meet exam conditions.
// Field AI concepts come first (the bulk of the field test), then the
// eliminatory reasoning gate, then the essay. Abstract is flagged as the gate
// and gets a learn-the-technique block.
function buildBeginnerPlan(statuses: ComponentStatus[], config: PlanConfig): StudyBlock[] {
  const days = Math.max(1, Math.min(config.daysPerWeek, 7));
  const minutes = config.minutesPerSession;

  // Learn-first order: field AI (largest surface), then the reasoning gate
  // components, then essay. Abstract gets a technique-learning slot.
  const learnOrder: { component: ExamComponent; technique: StudyTechnique; reason: string }[] = [
    { component: "field-ai", technique: "elaboration", reason: "Start with the AI field concepts — read and explain them back before testing." },
    { component: "numerical", technique: "elaboration", reason: "Learn the numerical operation types (percentage change, ratio, share) in learn mode — untimed." },
    { component: "verbal", technique: "elaboration", reason: "Learn how verbal reading-comprehension traps work before practising under time." },
    { component: "abstract", technique: "external-drill", reason: "Read the abstract-reasoning technique guide — this gate is pattern-spotting, not knowledge." },
    { component: "essay", technique: "elaboration", reason: "Read the EUFTE essay structure; draft one untimed before the graded version." },
  ];

  const blocks: StudyBlock[] = [];
  let day = 1;

  // Phase 1 — LEARN (first ~60% of the week, at least 1 day): concept reading.
  const learnDays = Math.max(1, Math.round(days * 0.6));
  for (let i = 0; i < learnDays && day <= days; i++) {
    const item = learnOrder[i % learnOrder.length];
    blocks.push({
      day,
      component: item.component,
      label: `Learn: ${COMPONENT_LABELS[item.component]}`,
      technique: item.technique,
      minutes,
      reason: item.reason,
      inApp: IN_APP_COMPONENTS.has(item.component),
      phase: 1,
      mode: "study",
    });
    day += 1;
  }

  // Phase 2 — GENTLE PRACTICE (blocked, untimed/learn-mode): consolidate the
  // first couple of learned components one at a time.
  const practiceComponents: ExamComponent[] = ["field-ai", "numerical", "verbal"];
  let pi = 0;
  while (day <= days && day <= days - 1 && blocks.length < days) {
    const component = practiceComponents[pi % practiceComponents.length];
    blocks.push({
      day,
      component,
      label: `Practice (untimed): ${COMPONENT_LABELS[component]}`,
      technique: "retrieval",
      minutes,
      reason: "Gentle, untimed practice on one topic at a time — build accuracy before adding the clock.",
      inApp: IN_APP_COMPONENTS.has(component),
      phase: 2,
      mode: "practice",
    });
    pi += 1;
    day += 1;
  }

  // Phase 3 — RAMP: one timed, interleaved field mock to meet exam conditions.
  if (day <= days) {
    blocks.push({
      day,
      component: "field-ai",
      label: "First timed mock (exam conditions)",
      technique: "interleaving",
      minutes,
      reason: "Now add the clock: a mixed, timed set so the format and pressure feel familiar before the real thing.",
      inApp: true,
      phase: 3,
      mode: "practice",
    });
    day += 1;
  }

  return blocks;
}

// Adaptive plan — the original weak-area-weighted director for intermediate /
// advanced users who already have a useful accuracy signal.
function buildAdaptivePlan(
  statuses: ComponentStatus[],
  dueCount: number,
  config: PlanConfig = DEFAULT_PLAN_CONFIG,
): StudyBlock[] {
  const days = Math.max(1, Math.min(config.daysPerWeek, 7));
  const minutes = config.minutesPerSession;

  const ranked = statuses
    .map((s) => ({ s, score: priorityScore(s, GATE_BOOST[s.component] ?? 0) }))
    .sort((a, b) => b.score - a.score);

  const blocks: StudyBlock[] = [];
  let day = 1;

  // Day 1 is a spaced-review session whenever missed items are due — spacing +
  // successive relearning is the highest-retention use of a session.
  if (dueCount > 0) {
    blocks.push({
      day,
      component: "field-ai",
      label: `Review ${dueCount} missed item${dueCount === 1 ? "" : "s"}`,
      technique: "spaced-review",
      minutes,
      reason: "Spaced retrieval of items you got wrong — the strongest driver of long-term retention.",
      inApp: true,
    });
    day += 1;
  }

  // Fill remaining days from the priority ranking, round-robin so no single
  // component dominates the week (interleaving across the plan, not just within
  // a session). Guarantee the elimination gate (abstract) appears at least once.
  const order = ranked.map((r) => r.s);
  let idx = 0;
  const usedComponents = new Set<ExamComponent>();
  while (day <= days && order.length > 0) {
    const s = order[idx % order.length];
    const technique = techniqueFor(s.component, false);
    blocks.push({
      day,
      component: s.component,
      label: s.label,
      technique,
      minutes,
      reason:
        s.attempts === 0
          ? "Untouched — a blind spot you must cover."
          : `${Math.round(s.accuracy * 100)}% accuracy, last practised ${
              s.daysSince == null ? "never" : `${s.daysSince}d ago`
            }.`,
      inApp: s.inApp,
    });
    usedComponents.add(s.component);
    idx += 1;
    day += 1;
  }

  // Safety net: if the week filled without an abstract slot, replace the last
  // block with abstract — the gate must not be skipped. It is now in-app.
  if (days >= 3 && !usedComponents.has("abstract") && blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    blocks[blocks.length - 1] = {
      ...last,
      component: "abstract",
      label: COMPONENT_LABELS.abstract,
      technique: "retrieval",
      minutes: last.minutes,
      reason: "The abstract gate eliminates candidates — it gets a weekly slot even when other areas look weaker.",
      inApp: true,
    };
  }

  return blocks;
}
