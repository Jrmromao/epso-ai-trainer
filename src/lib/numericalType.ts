import { type Question, isNumerical } from "@/lib/types";

// Classifies an EPSO numerical question by the OPERATION TYPE / trap it tests,
// so learn mode can tell the user which pattern they're looking at. This is the
// core skill in EPSO numerical: recognising the operation. Deterministic
// keyword/signal heuristic — no LLM cost. Multiple types can apply; we return
// all matches, most-specific first.

export type NumericalType =
  | "percentage-change"
  | "percentage-points"
  | "share-of-total"
  | "ratio"
  | "per-capita"
  | "index"
  | "compound-growth"
  | "unit-trap";

export const NUMERICAL_TYPE_INFO: Record<
  NumericalType,
  { label: string; blurb: string; trap: string }
> = {
  "percentage-change": {
    label: "Percentage change",
    blurb: "Relative change from one value to another: (new − old) ÷ old × 100.",
    trap: "Baseline trap — divide by the OLD value, not the new one. ÷ new gives a wrong, smaller figure.",
  },
  "percentage-points": {
    label: "Percentage points vs % change",
    blurb: "The difference between two percentages is measured in percentage POINTS, not a percentage change.",
    trap: "Subtracting two percentages (e.g. 20% → 25% = 5 pp) is NOT a 5% change — the relative change is 25%.",
  },
  "share-of-total": {
    label: "Share of total",
    blurb: "One part expressed as a percentage of the whole: part ÷ total × 100.",
    trap: "Make sure the denominator is the correct total (whole column/row), not a subtotal or a single cell.",
  },
  ratio: {
    label: "Ratio",
    blurb: "One quantity relative to another, a:b (or a ÷ b).",
    trap: "Inverted ratio — keep the order the question asks (a:b, not b:a).",
  },
  "per-capita": {
    label: "Per-capita / per-unit",
    blurb: "A total divided by a population or count: total ÷ people.",
    trap: "Watch units on BOTH numbers (e.g. value in millions ÷ population in thousands) before dividing.",
  },
  index: {
    label: "Index numbers",
    blurb: "Values rebased to a reference period (base = 100); compare relative to the base.",
    trap: "An index of 120 means +20% vs the base — not 120% growth, and not comparable across different bases.",
  },
  "compound-growth": {
    label: "Compound growth",
    blurb: "Growth applied repeatedly: final = initial × (1 + r)^n, not initial × (1 + r·n).",
    trap: "Don't just multiply the rate by the number of periods — compounding is multiplicative, not additive.",
  },
  "unit-trap": {
    label: "Unit trap",
    blurb: "A column header states thousands / millions; the raw figure must be scaled accordingly.",
    trap: "Ignoring a 'thousands'/'millions' header gives an answer off by a factor of 10/100/1000.",
  },
};

// Order matters: more specific/structural signals first.
const DETECTORS: { type: NumericalType; test: (text: string, q: Question) => boolean }[] = [
  {
    type: "compound-growth",
    test: (t) => /compound|compounded|annual growth rate|cagr|year[- ]on[- ]year.*(compound|each year)|\(1\s*\+|\^|per annum.*(each|every)/i.test(t),
  },
  {
    type: "index",
    test: (t) => /\bindex\b|rebased|base\s*(year|period)?\s*=?\s*100|base\s*=\s*100/i.test(t),
  },
  {
    type: "percentage-points",
    test: (t) => /percentage[- ]point|\bp\.?p\.?\b|pts?\b|points? difference|in points/i.test(t),
  },
  {
    type: "per-capita",
    test: (t) => /per[- ]capita|per\s+(person|inhabitant|head|resident|citizen|employee|unit)|per\s+1[,.]?000/i.test(t),
  },
  {
    type: "unit-trap",
    test: (t) => /thousand|million|billion|mil milh|milhõ|milhar|\bGWh\b|\bkt\b|scaled|in '000|\(000s?\)/i.test(t),
  },
  {
    type: "percentage-change",
    test: (t) => /percentage (change|increase|decrease|growth|rise|fall|drop|reduction)|percent (change|increase|decrease)|% (change|increase|decrease)|grew by|fell by|rose by|declined by|increased? by|decreased? by|(change|increase|decrease|grow|growth|rise|rose|fall|fell|decline|drop).{0,40}from.{0,20}to\b|by what percentage|variação|aument|diminu/i.test(t),
  },
  {
    type: "share-of-total",
    test: (t) => /share of|proportion of|percentage of (the )?total|% of (the )?total|accounts? for|% of all|made up of|parte do total|proporção/i.test(t),
  },
  {
    type: "ratio",
    test: (t) => /\bratio\b|\brácio\b|times (as|more|larger|greater)|how many times|:\s*\d|relative to/i.test(t),
  },
];

// Return the operation types a question tests, most specific first. Empty if
// nothing matched (we then show a neutral "general calculation" tag).
export function classifyNumerical(q: Question): NumericalType[] {
  if (!isNumerical(q)) return [];
  const parts = [
    q.stem,
    q.workedSolution ?? "",
    q.explanation ?? "",
    q.table ? [q.table.caption ?? "", ...(q.table.headers ?? [])].join(" ") : "",
  ];
  const text = parts.join("  ").toLowerCase();

  const found: NumericalType[] = [];
  for (const d of DETECTORS) {
    if (d.test(text, q)) found.push(d.type);
  }
  return found;
}
