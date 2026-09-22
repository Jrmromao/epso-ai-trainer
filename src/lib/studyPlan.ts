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

// Components the app can drill in-house. Abstract (visual) + essay are external.
export const IN_APP_COMPONENTS: ReadonlySet<ExamComponent> = new Set<ExamComponent>([
  "field-ai",
  "verbal",
  "numerical",
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
