import {
  type ChoiceKey,
  type Choices,
  type Difficulty,
  type Question,
  type QuestionLanguage,
  type QuestionTable,
  type Topic,
  TOPIC_LABELS,
  isNumerical,
} from "@/lib/types";

// Runtime validation for LLM-generated questions. The LLM is untrusted output:
// anything that doesn't match the exact MCQ shape is rejected (caller falls
// back to the seeded bank).

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];

function isChoiceKey(v: unknown): v is ChoiceKey {
  return typeof v === "string" && (CHOICE_KEYS as string[]).includes(v);
}

// Parse an optional data table. Defensive: any malformed shape returns
// undefined (the question survives without a table) rather than failing it.
function parseTable(raw: unknown): QuestionTable | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const t = raw as Record<string, unknown>;
  if (!Array.isArray(t.headers) || !Array.isArray(t.rows)) return undefined;
  const headers = t.headers.filter((h): h is string => typeof h === "string");
  if (headers.length === 0) return undefined;
  const rows: string[][] = [];
  for (const r of t.rows) {
    if (!Array.isArray(r)) return undefined;
    rows.push(r.map((c) => (typeof c === "string" ? c : String(c))));
  }
  if (rows.length === 0) return undefined;
  const caption = typeof t.caption === "string" && t.caption.trim() ? t.caption.trim() : undefined;
  return { headers, rows, ...(caption ? { caption } : {}) };
}

// Parse optional per-option feedback (learn mode). Only keeps notes for option
// letters that actually exist, with a valid verdict and a non-empty note.
// Returns undefined if nothing usable (so the field is omitted entirely).
function parseOptionNotes(
  raw: unknown,
  choices: Choices,
): Partial<Record<ChoiceKey, { verdict: "true" | "false"; note: string }>> | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const src = raw as Record<string, unknown>;
  const out: Partial<Record<ChoiceKey, { verdict: "true" | "false"; note: string }>> = {};
  let any = false;
  for (const k of ["A", "B", "C", "D", "E"] as ChoiceKey[]) {
    const label = choices[k];
    if (typeof label !== "string" || !label.trim() || label === "-" || label === "(unused)") continue;
    const entry = src[k];
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const verdict = e.verdict === "true" ? "true" : e.verdict === "false" ? "false" : null;
    const note = typeof e.note === "string" ? e.note.trim() : "";
    if (!verdict || !note) continue;
    out[k] = { verdict, note };
    any = true;
  }
  return any ? out : undefined;
}

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const VALID_LANGUAGES: QuestionLanguage[] = ["en", "pt-PT"];

function parseDifficulty(raw: unknown, requested: Difficulty): Difficulty {
  // If the LLM echoes back a valid difficulty, use it; otherwise fall back to
  // whatever the caller requested.
  if (typeof raw === "string" && (VALID_DIFFICULTIES as string[]).includes(raw)) {
    return raw as Difficulty;
  }
  return requested;
}

function parseLanguage(raw: unknown, requested: QuestionLanguage): QuestionLanguage {
  if (typeof raw === "string" && (VALID_LANGUAGES as string[]).includes(raw)) {
    return raw as QuestionLanguage;
  }
  return requested;
}

// --- Numerical answer-key consistency gate -------------------------------
// The LLM sometimes declares an answer letter that does NOT match the value
// its own workedSolution computes (it rounds an intermediate step, or picks
// the wrong option). That silently mis-trains the user. This gate extracts the
// final numeric value from the worked solution, matches it against the numeric
// value of each option, and (a) remaps the answer to the matching option, or
// (b) rejects the question when nothing matches within tolerance.

// Parse candidate numeric interpretations from a string. Returns ALL plausible
// values because EU vs Anglo separators are ambiguous (e.g. "19.330" could be
// 19.33 or 19330; "3,466" could be 3.466 or 3466). Matching then succeeds if
// ANY interpretation of the option matches ANY interpretation of the target —
// this is deliberately lenient so we don't wrongly reject a correct item.
// A bare EPSO ratio option ("3/2", "1/3") is one value, the quotient.
// Limited to 1-2 digit parts so a worked division of real figures
// ("148620/160") is not treated as a simplified fraction.
function pureFractionValue(s: string): number | null {
  const m = s.trim().match(/^([+-]?\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!m) return null;
  const den = Number(m[2]);
  if (!den) return null;
  return Number(m[1]) / den;
}

// Returns [] if no number present (e.g. "Cannot be determined").
function parseNumericCandidates(s: string): number[] {
  if (typeof s !== "string") return [];
  // Normalise Unicode minus (U+2212) and other dash variants to ASCII '-' so
  // signs are preserved (critical for distinguishing +1,6 from −1,6).
  const cleaned = s
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[€$£%]/g, " ")
    .trim();
  const asFraction = pureFractionValue(cleaned);
  if (asFraction !== null) return [asFraction];
  const m = cleaned.match(/[-+]?\d[\d.,\s]*\d|[-+]?\d/);
  if (!m) return [];
  const raw = m[0].replace(/\s/g, "");
  const sign = raw.startsWith("-") ? -1 : 1;
  const tok = raw.replace(/^[-+]/, "");
  const out = new Set<number>();
  const push = (v: number) => { if (Number.isFinite(v)) out.add(sign * v); };

  const lastDot = tok.lastIndexOf(".");
  const lastComma = tok.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the LAST separator is the decimal point (unambiguous).
    if (lastComma > lastDot) push(Number(tok.replace(/\./g, "").replace(",", ".")));
    else push(Number(tok.replace(/,/g, "")));
  } else if (lastComma !== -1) {
    // Only commas: ambiguous -> try comma-as-decimal AND comma-as-thousands.
    push(Number(tok.replace(/,/g, ""))); // thousands
    if ((tok.match(/,/g) || []).length === 1) push(Number(tok.replace(",", "."))); // decimal
  } else if (lastDot !== -1) {
    // Only dots: ambiguous -> try dot-as-decimal AND dot-as-thousands.
    push(Number(tok)); // decimal (JS default)
    if ((tok.match(/\./g) || []).length === 1) push(Number(tok.replace(/\./g, ""))); // thousands
  } else {
    push(Number(tok));
  }
  return [...out];
}

// The final numeric result of a worked solution is (almost always) the LAST
// number that appears in it.
function finalCandidatesFromWorkedSolution(ws: string): number[] {
  if (typeof ws !== "string") return [];
  const norm = ws.replace(/[\u2212\u2013\u2014]/g, "-");
  // Type 1 items end on the simplified fraction ("... = 3/2"). Read that
  // quotient so it matches an option whose text is "3/2".
  const trailingFraction = norm.match(/([+-]?\d{1,2})\s*\/\s*(\d{1,2})\s*\.?\s*$/);
  if (trailingFraction) {
    const den = Number(trailingFraction[2]);
    if (den) return [Number(trailingFraction[1]) / den];
  }
  const matches = norm.match(/[-+]?\d[\d.,\s]*\d|[-+]?\d/g);
  if (!matches || matches.length === 0) return [];
  return parseNumericCandidates(matches[matches.length - 1]);
}

// Stricter single-value parse for COMPOUND-answer validation. The lenient
// `parseNumericCandidates` returns BOTH a decimal and a thousands reading for
// an ambiguous separator (so "3,2" -> [32, 3.2]). That ambiguity is dangerous
// when validating a multi-number option: the spurious thousands reading (32)
// can cross-match an unrelated solution value (32.11), making a WRONG option
// look consistent. For compound validation we disambiguate by shape:
//   - a single comma/dot followed by 1-2 digits is a DECIMAL (e.g. 3,2 / 1,05)
//   - grouped thousands (e.g. 148 620, 196.340) collapse to the integer
// so each token yields exactly ONE value and cannot cross-match spuriously.
function parseStrictNumber(token: string): number | null {
  const cleaned = token
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[€$£%]/g, " ")
    .replace(/\s/g, "")
    .trim();
  const m = cleaned.match(/^[-+]?\d[\d.,]*\d$|^[-+]?\d$/);
  if (!m) return null;
  const sign = cleaned.startsWith("-") ? -1 : 1;
  const tok = cleaned.replace(/^[-+]/, "");
  const lastDot = tok.lastIndexOf(".");
  const lastComma = tok.lastIndexOf(",");
  let v: number;
  if (lastDot !== -1 && lastComma !== -1) {
    // Last separator is the decimal point.
    v = lastComma > lastDot
      ? Number(tok.replace(/\./g, "").replace(",", "."))
      : Number(tok.replace(/,/g, ""));
  } else if (lastComma !== -1) {
    const after = tok.length - lastComma - 1;
    const single = (tok.match(/,/g) || []).length === 1;
    // Single comma with 1-2 trailing digits => decimal (3,2 / 1,05 / 24,3).
    // Otherwise (multiple commas, or exactly 3 trailing digits) => thousands.
    v = single && after > 0 && after <= 2
      ? Number(tok.replace(",", "."))
      : Number(tok.replace(/,/g, ""));
  } else if (lastDot !== -1) {
    const after = tok.length - lastDot - 1;
    const single = (tok.match(/\./g) || []).length === 1;
    v = single && after > 0 && after <= 2
      ? Number(tok)
      : Number(tok.replace(/\./g, ""));
  } else {
    v = Number(tok);
  }
  return Number.isFinite(v) ? sign * v : null;
}

// Like `allNumericTokens` but each token resolves to a SINGLE disambiguated
// value (see parseStrictNumber). Used only for compound-answer validation.
function strictNumericTokens(s: string): number[] {
  if (typeof s !== "string") return [];
  const asFraction = pureFractionValue(s);
  if (asFraction !== null) return [asFraction];
  const norm = s.replace(/[\u2212\u2013\u2014]/g, "-");
  const matches = norm.match(/[-+]?\d[\d.,\s]*\d|[-+]?\d/g);
  if (!matches) return [];
  return matches
    .map((m) => parseStrictNumber(m))
    .filter((v): v is number => v !== null);
}

// How many numeric components does each answer OPTION carry? EPSO items are
// usually single-value, but some phrase a compound answer ("X%, i.e. N times").
// We take the maximum token count across the A-D options (ignoring a terminal
// "none/cannot" E) as the item's expected component count.
function optionComponentCount(choices: Choices): number {
  let max = 0;
  for (const k of ["A", "B", "C", "D", "E"] as ChoiceKey[]) {
    const label = choices[k];
    if (typeof label !== "string" || !label.trim()) continue;
    const n = strictNumericTokens(label).length;
    if (n > max) max = n;
  }
  return max;
}

// Multi-component consistency gate. When options carry two or more numbers, the
// single-value `reconcileNumericalAnswer` is not enough: it can lock onto one
// matching number (e.g. the percentage) while the second (e.g. the ratio) is
// wrong in EVERY option — meaning the correct answer isn't present at all.
//
// This builds the set of target values the worked solution actually computes,
// then requires the chosen option's EVERY numeric component to match one of
// those targets. Returns:
//   true  -> the option is fully consistent (all its numbers are supported)
//   false -> at least one component is unsupported -> caller should reject.
function optionFullyConsistent(optionLabel: string, workedSolution: string): boolean {
  const optionTokens = strictNumericTokens(optionLabel);
  if (optionTokens.length <= 1) return true; // single-value: handled elsewhere

  // All numbers the worked solution mentions (not just the last one), since a
  // compound answer's components appear at different points in the working.
  const solutionValues = strictNumericTokens(workedSolution);
  if (solutionValues.length === 0) return true; // can't verify -> don't reject here

  // Every component of the option must be backed by SOME value the solution
  // computed. A component with no support (e.g. a ratio of 1,6 when the maths
  // yields 1,05) fails the gate.
  return optionTokens.every((v) => solutionValues.some((t) => numbersClose(v, t)));
}

// Two numbers "match" if within a small relative tolerance (handles rounding).
function numbersClose(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return Math.abs(a - b) / scale <= 0.01; // 1% tolerance
}

// True if any interpretation of the option matches any interpretation of target.
function candidatesMatch(optVals: number[], targetVals: number[]): boolean {
  return optVals.some((o) => targetVals.some((t) => numbersClose(o, t)));
}

// Detect an explicit "the correct answer is X" statement inside the worked
// solution / explanation and return the letter it names, if any. The LLM
// sometimes writes a coherent-looking rationale that names a DIFFERENT letter
// than the answer key (then rationalises the mismatch). That self-contradiction
// is a reliable signal the item is broken. Matches EN and PT phrasings.
function statedCorrectLetter(text: string): ChoiceKey | null {
  if (typeof text !== "string" || !text) return null;
  const patterns = [
    /correct answer is\s*\(?([A-E])\)?/i,
    /answer is\s*\(?([A-E])\)?/i,
    /resposta\s+correta\s+é\s*\(?([A-E])\)?/i,
    /a\s+op(?:ção|cao)\s+correta\s+é\s*\(?([A-E])\)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1].toUpperCase() as ChoiceKey;
  }
  return null;
}

// Returns a corrected ChoiceKey, or null if the question should be rejected.
function reconcileNumericalAnswer(
  choices: Choices,
  declared: ChoiceKey,
  workedSolution: string,
): ChoiceKey | null {
  const keys = (["A", "B", "C", "D", "E"] as ChoiceKey[]).filter(
    (k) => typeof choices[k] === "string" && (choices[k] as string).trim(),
  );

  // MULTI-COMPONENT answers ("X%, i.e. N times"): the single-value gate below
  // only checks ONE number and can wrongly accept an option whose first number
  // matches while its second is unsupported by the maths. Here we require the
  // chosen option's EVERY numeric component to be backed by the worked
  // solution, and that exactly one option qualifies. If none qualifies, the
  // correct compound answer isn't in the option set -> reject the item.
  if (optionComponentCount(choices) >= 2) {
    const consistent = keys.filter((k) =>
      optionFullyConsistent(choices[k] as string, workedSolution),
    );
    if (consistent.length === 1) return consistent[0];
    if (consistent.length === 0) return null; // correct answer absent -> drop
    // Several options are fully consistent (shouldn't happen for a well-formed
    // item, but be safe): prefer the declared one if it qualifies, else reject
    // rather than guess — a wrong key here actively mis-trains.
    return consistent.includes(declared) ? declared : null;
  }

  const target = finalCandidatesFromWorkedSolution(workedSolution);
  if (target.length === 0) return declared; // can't extract -> trust declared

  const matches = keys.filter((k) => candidatesMatch(parseNumericCandidates(choices[k] as string), target));

  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    // Result isn't among the options -> inconsistent. Keep only if the declared
    // option has no parseable number (e.g. "Cannot be determined"); else reject.
    return parseNumericCandidates((choices[declared] as string) ?? "").length === 0 ? declared : null;
  }
  // Ambiguous (several options share a value) -> prefer the declared one.
  return matches.includes(declared) ? declared : matches[0];
}

// Backstop for the prompt's SEPARATION RULE: reject a numerical item whose
// CORRECT option sits too close to another numeric option, where "too close"
// makes the choice a rounding coin-flip (e.g. −1,6% vs −1,7%). We compare
// signed values, so a legitimate sign-flipped distractor (−1,6 vs +1,6) is NOT
// treated as too close. Returns true when the item is ambiguous -> drop it.
function hasAmbiguousNumericOptions(choices: Choices, correct: ChoiceKey): boolean {
  const correctVals = parseNumericCandidates((choices[correct] as string) ?? "");
  if (correctVals.length === 0) return false; // non-numeric correct (e.g. "Cannot be determined")

  for (const k of ["A", "B", "C", "D", "E"] as ChoiceKey[]) {
    if (k === correct) continue;
    const label = choices[k];
    if (typeof label !== "string" || !label.trim()) continue;
    const vals = parseNumericCandidates(label);
    if (vals.length === 0) continue;

    // Compare the CLOSEST interpretation pair (parser returns both decimal and
    // thousands readings for ambiguous separators; use the nearest to avoid a
    // false negative from picking the wrong interpretation).
    for (const cv of correctVals) {
      for (const v of vals) {
        if (v === cv) continue; // exact duplicate handled elsewhere
        const diff = Math.abs(v - cv);
        const scale = Math.max(Math.abs(cv), Math.abs(v), 1e-9);
        // Too close if within 0.3 absolute AND within 8% relative — a near-miss
        // of the same calculation rather than a structurally different answer.
        if (diff <= 0.3 && diff / scale <= 0.08) return true;
      }
    }
  }
  return false;
}

export function validateQuestion(raw: unknown, topic: Topic, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): Question | null {
  if (typeof raw !== "object" || raw === null) return null;
  const q = raw as Record<string, unknown>;

  if (typeof q.stem !== "string" || q.stem.trim().length < 5) return null;

  // Reading-comprehension items MUST carry a real passage in the stem, not a
  // bare one-line question. A short stem here means the model ignored the
  // format -> reject so the caller falls back to the seeded bank.
  if (topic === "verbal-rc" && q.stem.trim().length < 120) return null;

  const choices = q.choices as Record<string, unknown> | undefined;
  if (typeof choices !== "object" || choices === null) return null;
  const A = choices.A;
  const B = choices.B;
  const C = choices.C;
  const D = choices.D;
  if ([A, B, C, D].some((c) => typeof c !== "string" || !c.trim())) return null;

  // E is optional (5-option numerical questions). Present only if a non-empty
  // string.
  const hasE = typeof choices.E === "string" && (choices.E as string).trim().length > 0;

  if (!isChoiceKey(q.answer)) return null;
  // The answer must point to a choice that actually exists: E is only valid
  // when a fifth option was supplied.
  if (q.answer === "E" && !hasE) return null;
  if (typeof q.explanation !== "string" || !q.explanation.trim()) return null;

  const builtChoices: Choices = {
    A: (A as string).trim(),
    B: (B as string).trim(),
    C: (C as string).trim(),
    D: (D as string).trim(),
    ...(hasE ? { E: (choices.E as string).trim() } : {}),
  };

  const base = {
    id: `${topic}-gen-${Math.random().toString(36).slice(2, 9)}`,
    topic,
    difficulty: parseDifficulty(q.difficulty, difficulty),
    language: parseLanguage(q.language, language),
    stem: q.stem.trim(),
    ...(parseTable(q.table) ? { table: parseTable(q.table) } : {}),
    choices: builtChoices,
    answer: q.answer,
    explanation: q.explanation.trim(),
    ...(parseOptionNotes(q.optionNotes, builtChoices) ? { optionNotes: parseOptionNotes(q.optionNotes, builtChoices)! } : {}),
  };

  // Numerical questions MUST carry a worked solution (spec AC4 guardrail).
  if (topic === "numerical") {
    if (typeof q.workedSolution !== "string" || !q.workedSolution.trim()) {
      return null;
    }
    // Optional step breakdown for learn-mode. Accept only a clean array of
    // non-empty strings; anything malformed is dropped (learn-mode then falls
    // back to splitting workedSolution). Never fail the whole question over it.
    let steps: string[] | undefined;
    if (Array.isArray(q.steps)) {
      const clean = q.steps
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim());
      if (clean.length > 0) steps = clean;
    }

    // Self-contradiction gate: if the worked solution / explanation explicitly
    // names a correct letter that DISAGREES with the answer key, the item is
    // internally inconsistent (the model wrote a rationale for one letter but
    // keyed another, then rationalised the mismatch). Drop it.
    const stated = statedCorrectLetter(
      `${q.workedSolution} ${base.explanation}`,
    );
    if (stated && stated !== base.answer && typeof builtChoices[stated] === "string") {
      return null;
    }

    // Answer-key consistency gate: make the labelled answer agree with the
    // value the worked solution actually computes (fixes LLM rounding / wrong
    // letter). Returns null when the item is internally inconsistent -> drop it
    // so the caller falls back to the seeded bank rather than mis-train.
    const reconciledAnswer = reconcileNumericalAnswer(
      builtChoices,
      base.answer,
      q.workedSolution.trim(),
    );
    if (reconciledAnswer === null) return null;

    // SEPARATION backstop: drop items where the correct option is a rounding
    // coin-flip against another option (ambiguous — not a fair test item).
    if (hasAmbiguousNumericOptions(builtChoices, reconciledAnswer)) return null;

    return {
      ...base,
      topic: "numerical",
      answer: reconciledAnswer,
      workedSolution: q.workedSolution.trim(),
      ...(steps ? { steps } : {}),
    };
  }

  return base;
}

// Deterministic-free shuffle of a question's options so the correct answer is
// NOT biased toward a fixed position. LLMs strongly favour putting the correct
// option first (A), so without this the answer is almost always A. We relabel
// choices after shuffling and remap `answer`.
//
// Exceptions that must NOT be reordered:
//  - verbal T/F: options are fixed (True / False / Cannot say / -)
//  - any question with an "E" that is a terminal "none/cannot" option: E stays
//    last; A-D (or A-D minus) are shuffled among themselves.
const FIXED_ORDER_SNIPPETS = [
  "true", "false", "cannot say", "verdadeiro", "falso", "não é possível",
];
const TERMINAL_E_SNIPPETS = [
  "none of the above", "cannot be determined", "nenhuma das anteriores", "impossível responder",
];

// Returns the set of present (non-placeholder) option slots for a question,
// in order. A terminal "none/cannot" E is reported separately so callers can
// keep it pinned last.
function presentSlots(q: Question): { present: ChoiceKey[]; pinLast: boolean } {
  const present: ChoiceKey[] = (["A", "B", "C", "D", "E"] as ChoiceKey[]).filter((k) => {
    const l = q.choices[k];
    return typeof l === "string" && l.trim() && l !== "-" && l !== "(unused)";
  });
  if (present.length < 2) return { present, pinLast: false };
  const lastKey = present[present.length - 1];
  const lastLabel = (q.choices[lastKey] ?? "").toLowerCase();
  const pinLast = TERMINAL_E_SNIPPETS.some((s) => lastLabel.includes(s));
  return { present, pinLast };
}

// True when a question's options may be reordered. Verbal T/F has a fixed
// semantic order and must never be shuffled.
function isReorderable(q: Question): boolean {
  const aLabel = (q.choices.A ?? "").toLowerCase();
  const bLabel = (q.choices.B ?? "").toLowerCase();
  if (FIXED_ORDER_SNIPPETS.some((s) => aLabel.includes(s) || bLabel.includes(s))) return false;
  const { present } = presentSlots(q);
  return present.length >= 2;
}

// The slots the correct answer is ALLOWED to occupy for this question (i.e. the
// shufflable positions — excludes a pinned terminal E). Empty if not
// reorderable. Used by the batch balancer to pick a legal target slot.
function allowedCorrectSlots(q: Question): ChoiceKey[] {
  if (!isReorderable(q)) return [];
  const { present, pinLast } = presentSlots(q);
  return pinLast ? present.slice(0, -1) : present.slice();
}

// Place a question's options so the CORRECT option lands in `targetSlot`, and
// the remaining distractors fill the other shufflable slots (randomly). If
// `targetSlot` is undefined, the shufflable options are fully randomised
// (legacy behaviour). A pinned terminal E always stays last. All letter
// references in explanation / workedSolution / steps / optionNotes are remapped
// to the new positions.
function placeAnswer(q: Question, targetSlot?: ChoiceKey): Question {
  if (!isReorderable(q)) return q;

  const { present, pinLast } = presentSlots(q);
  const shufflable = pinLast ? present.slice(0, -1) : present.slice();

  // Separate the correct item (if it's in the shufflable set) from distractors.
  const correctItem = shufflable
    .filter((k) => k === q.answer)
    .map((k) => ({ from: k, label: q.choices[k]! }))[0];
  const distractors = shufflable
    .filter((k) => k !== q.answer)
    .map((k) => ({ from: k, label: q.choices[k]! }));

  // Randomise distractor order (Fisher-Yates).
  for (let i = distractors.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [distractors[i], distractors[j]] = [distractors[j], distractors[i]];
  }

  // Build the final ordered list of items for the shufflable slots.
  let ordered: { from: ChoiceKey; label: string }[];
  if (correctItem && targetSlot && shufflable.includes(targetSlot)) {
    // Insert the correct item at the index of the target slot; distractors fill
    // the rest in order.
    const targetIdx = shufflable.indexOf(targetSlot);
    ordered = [];
    let di = 0;
    for (let i = 0; i < shufflable.length; i++) {
      if (i === targetIdx) ordered.push(correctItem);
      else ordered.push(distractors[di++]);
    }
  } else {
    // No valid target (or correct is the pinned E): just randomise everything.
    const all = correctItem ? [correctItem, ...distractors] : distractors;
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    ordered = all;
  }

  const orderKeys = present; // same slots A,B,C,(D),(E)
  const newChoices: Record<string, string> = {};
  let newAnswer: ChoiceKey = q.answer;
  const remap: Partial<Record<ChoiceKey, ChoiceKey>> = {};
  ordered.forEach((it, idx) => {
    const slot = orderKeys[idx];
    newChoices[slot] = it.label;
    remap[it.from] = slot; // old letter -> new letter
    if (it.from === q.answer) newAnswer = slot;
  });
  if (pinLast) {
    const lastKey = present[present.length - 1];
    newChoices[lastKey] = q.choices[lastKey]!;
    remap[lastKey] = lastKey; // unchanged
    if (lastKey === q.answer) newAnswer = lastKey;
  }

  // Rewrite letter references in the explanation (and worked solution/steps)
  // using the remap, so "option B"/"a opção B"/"(C)" etc. point to the new
  // positions. Without this the shuffle silently scrambles the rationale.
  const next = {
    ...q,
    choices: { ...q.choices, ...newChoices } as typeof q.choices,
    answer: newAnswer,
    explanation: remapLetters(q.explanation, remap),
  };
  // Per-option notes are keyed by letter and tied to option CONTENT, so remap
  // their keys to follow the shuffled positions.
  if (q.optionNotes) {
    const movedNotes: Partial<Record<ChoiceKey, { verdict: "true" | "false"; note: string }>> = {};
    for (const [from, note] of Object.entries(q.optionNotes) as [ChoiceKey, { verdict: "true" | "false"; note: string }][]) {
      const to = remap[from] ?? from;
      movedNotes[to] = { ...note, note: remapLetters(note.note, remap) };
    }
    next.optionNotes = movedNotes;
  }
  if (isNumerical(next) && isNumerical(q)) {
    next.workedSolution = remapLetters(q.workedSolution, remap);
    if (q.steps) next.steps = q.steps.map((s) => remapLetters(s, remap));
  }
  return next;
}

// Legacy single-question shuffle: fully random placement. Retained for callers
// that shuffle one question without set-level balancing.
function shuffleAnswer(q: Question): Question {
  return placeAnswer(q, undefined);
}

// Choose a correct-answer slot for each reorderable question in a batch so that
// (a) positions are spread as evenly as possible across the available slots,
// (b) no two CONSECUTIVE questions share the same correct slot, and (c) the
// first question avoids repeating `prevSlot` (the last correct position from a
// previous generation, for cross-request continuity).
//
// Non-reorderable questions (verbal T/F) and questions whose correct option is
// a pinned terminal E keep their natural position and still count toward the
// "previous slot" chain so the no-repeat rule spans them.
function balanceAnswerPositions(questions: Question[], prevSlot: ChoiceKey | null): Question[] {
  const counts: Partial<Record<ChoiceKey, number>> = {};
  let previous: ChoiceKey | null = prevSlot;

  return questions.map((q) => {
    const allowed = allowedCorrectSlots(q);
    if (allowed.length === 0) {
      // Not reorderable: leave as-is, but update the chain using its current
      // correct position so the next question still avoids repeating it.
      previous = q.answer;
      return q;
    }

    // Rank allowed slots by: least-used so far, then "not equal to previous",
    // then a random tiebreak. This yields an even spread without a fixed
    // pattern.
    const ranked = [...allowed].sort((a, b) => {
      const ca = counts[a] ?? 0;
      const cb = counts[b] ?? 0;
      if (ca !== cb) return ca - cb;
      const pa = a === previous ? 1 : 0;
      const pb = b === previous ? 1 : 0;
      if (pa !== pb) return pa - pb;
      return Math.random() - 0.5;
    });

    // Prefer the top-ranked slot that isn't the previous one; fall back to the
    // top-ranked if every allowed slot equals previous (only possible when a
    // single slot is allowed).
    const target = ranked.find((s) => s !== previous) ?? ranked[0];

    counts[target] = (counts[target] ?? 0) + 1;
    previous = target;
    return placeAnswer(q, target);
  });
}

// Extract the final correct-answer positions of a built set, in order — for
// recording into the cross-generation history.
export function correctPositionsOf(questions: Question[]): ChoiceKey[] {
  return questions.map((q) => q.answer);
}

// Rewrite standalone option-letter references (A-E) in prose according to the
// remap. Applied simultaneously (via a single pass with a placeholder) so a
// chain like A->C, C->A doesn't double-apply. Only matches letters used as
// option references: a capital A-E that is a standalone token or immediately
// followed by ')' / '.' / ':' / ',' / whitespace — NOT letters inside words.
function remapLetters(text: string, remap: Partial<Record<ChoiceKey, ChoiceKey>>): string {
  if (typeof text !== "string" || !text) return text;
  // Match a boundary, capture a single A-E, then require a non-word boundary
  // that is typical of an option reference (so we don't touch "A política").
  // We DO allow a following space because Portuguese "a opção A é..." and
  // English "option A is" are common — but to avoid rewriting ordinary words
  // we only remap when the letter is preceded by an option cue (option/opção/
  // afirmação/resposta/alínea/letter/choice/parenthesis) OR wrapped in parens.
  const cue = /(\b(?:op(?:tion|ção|ções)|afirma(?:ção|ções)|resposta|alínea|letter|choice|answer)\s+)([A-E])\b/gi;
  const paren = /\(([A-E])\)/g;

  const apply = (letter: string): string => {
    const up = letter.toUpperCase() as ChoiceKey;
    const to = remap[up];
    return to ? to : letter;
  };

  let out = text.replace(cue, (_m, pre: string, letter: string) => `${pre}${apply(letter)}`);
  out = out.replace(paren, (_m, letter: string) => `(${apply(letter)})`);
  return out;
}

// Parse an LLM JSON payload expected to be { questions: [...] }.
// Parse an LLM JSON payload expected to be { questions: [...] }.
//
// Options:
//  - mode: "balance" (default) distributes correct-answer positions evenly
//    across the batch and avoids consecutive repeats; "shuffle" applies the
//    legacy per-question random shuffle; "preserve" keeps the LLM's original
//    option order untouched (used by multi-stage pipelines that balance once at
//    the end, e.g. generate-then-harden).
//  - prevSlot: the last correct position from a previous generation, so the
//    first question in this batch avoids repeating it (cross-request continuity).
export function parseQuestions(
  rawJson: string,
  topic: Topic,
  difficulty: Difficulty = "medium",
  language: QuestionLanguage = "en",
  opts: { mode?: "balance" | "shuffle" | "preserve"; prevSlot?: ChoiceKey | null } = {},
): Question[] {
  const { mode = "balance", prevSlot = null } = opts;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  const container = parsed as { questions?: unknown };
  const arr = Array.isArray(container.questions) ? container.questions : [];
  const validated = arr
    .map((item) => validateQuestion(item, topic, difficulty, language))
    .filter((q): q is Question => q !== null);

  if (mode === "preserve") return validated;
  if (mode === "shuffle") return validated.map(shuffleAnswer);
  return balanceAnswerPositions(validated, prevSlot);
}

// Re-export for the generate route so it can balance ONCE after the optional
// harden pass (balancing earlier would be undone by harden's re-parse).
export function balanceQuestionPositions(questions: Question[], prevSlot: ChoiceKey | null): Question[] {
  return balanceAnswerPositions(questions, prevSlot);
}

// Per-topic focus hints steer the model toward what the real exam tests.
const TOPIC_FOCUS: Partial<Record<Topic, string>> = {
  "ai-act":
    "Focus on Article 5 prohibited practices, Annex III high-risk categories, GPAI/systemic-risk obligations (FLOPs threshold), the AI Office, penalty tiers, and the phased application timeline. Cite specific Articles/Annexes in explanations.",
  "ml-fundamentals":
    "Focus on supervised/unsupervised/reinforcement learning, over/underfitting, bias-variance, regularisation, evaluation metrics, and train/validation/test methodology.",
  "genai-rag":
    "Focus on LLMs, tokens/embeddings, transformers/self-attention, hallucination, Retrieval-Augmented Generation, vector databases, fine-tuning vs prompting, and agentic AI / tool use.",
  mlops:
    "Focus on model lifecycle, CI/CD for models, model registry, monitoring, data/concept drift, retraining, and data pipelines/governance.",
  "trustworthy-ai":
    "Focus on the 7 Trustworthy-AI principles, explainability (XAI), fairness/bias, robustness, human oversight, and the GDPR Article 22 link.",
  policy:
    "Focus on EU AI governance, the GPAI ecosystem, societal impact, the AI Office's role, and AI policy/enforcement in an EU-institutional context.",
};

// Per-topic NAMED distractor traps — the specific, high-yield confusions the
// real AD8 field test exploits. Steering the model to encode THESE as wrong
// options (rather than generic "plausible but wrong" text) is what pushes items
// to genuine exam difficulty. One distractor per item should come from this set.
const TOPIC_TRAPS: Partial<Record<Topic, string>> = {
  "ai-act":
    " NAMED TRAPS (use at least one per item as a distractor): (a) PENALTY-TIER" +
    " CONFUSION — Article 99(3) prohibited-practice fines (up to €35M / 7% of" +
    " worldwide annual turnover) vs Article 99(4) high-risk / general" +
    " non-compliance fines (up to €15M / 3%); (b) SCOPE SWAP of roles — PROVIDER" +
    " conformity-assessment duties vs DEPLOYER operational duties (logging, human" +
    " oversight, input-data relevance); (c) ENFORCEMENT SWAP — the European AI" +
    " Office (centralised, GPAI/systemic-risk) vs national Market Surveillance" +
    " Authorities (downstream high-risk systems); (d) RISK-TIER UNDERSTATEMENT —" +
    " labelling an Annex III high-risk use as mere limited/transparency risk; (e)" +
    " CONSENT FALLACY — asserting that user consent makes an Article 5 prohibited" +
    " practice lawful.",
  mlops:
    " NAMED TRAPS (use at least one per item as a distractor): (a) DRIFT" +
    " CONFUSION — data/covariate drift (a shift in P(X), the input distribution)" +
    " vs concept drift (a shift in P(Y|X), the input→label relationship); (b)" +
    " BLIND RETRAINING — recommending scheduled retraining without a trigger" +
    " signal; (c) THRESHOLD MASKING — adjusting the decision/confidence threshold" +
    " to hide degradation rather than detect it; (d) DELAYED-LABEL TRAP — waiting" +
    " for delayed ground-truth instead of monitoring proxy signals (feature PSI," +
    " output-probability distribution) to catch drift early.",
  "trustworthy-ai":
    " NAMED TRAPS (use at least one per item as a distractor): (a) ACCURACY" +
    " ILLUSION under class imbalance — claiming high overall accuracy or ROC-AUC" +
    " proves performance/fairness, when PR-AUC, positive-class F1 or disaggregated" +
    " group error rates are needed; (b) FAIRNESS-BY-BLINDNESS — dropping protected" +
    " attributes to 'guarantee' non-discrimination while ignoring proxy variables;" +
    " (c) METRIC CONFUSION — Demographic Parity vs Equalized Odds (equal positive" +
    " rates vs equal error rates across groups).",
  "ml-fundamentals":
    " NAMED TRAPS (use at least one per item as a distractor): (a) class-imbalance" +
    " ACCURACY ILLUSION (accuracy/ROC-AUC vs PR-AUC/F1); (b) data vs concept drift;" +
    " (c) overfitting-vs-underfitting direction errors; (d) leakage disguised as" +
    " strong validation performance.",
};


// Per-difficulty instruction blocks injected into every generation prompt.
// These define what "easy / medium / hard" means in concrete distractor terms
// so the model calibrates distractor quality, not just stem complexity.
const DIFFICULTY_INSTRUCTIONS: Record<string, string> = {
  easy:
    " DIFFICULTY: EASY. The correct answer should be clearly the best option to a" +
    " candidate with basic familiarity. Distractors may use slightly implausible" +
    " details or overly absolute language ('always', 'never') that an attentive" +
    " reader can reject without deep knowledge. The stem should test recall of a" +
    " core concept, not a subtle edge case.",
  medium:
    " DIFFICULTY: MEDIUM. Distractors must use genuine EPSO traps (scope swap," +
    " overreach/absolute, belief-as-fact, unstated causal link) and be plausible" +
    " to a well-prepared candidate. The correct answer requires careful reading" +
    " and domain knowledge but should be reachable without memorising obscure" +
    " thresholds or article numbers.",
  hard:
    " DIFFICULTY: HARD. All four options must look defensible at first glance." +
    " The correct answer should hinge on a specific detail — an exact article" +
    " number, a precise threshold (e.g. FLOPs value, percentage, date), a subtle" +
    " scope distinction, or the direction of a relationship. At least one" +
    " distractor must be true-but-incomplete or correct-in-a-different-context." +
    " A candidate who knows the topic broadly but not precisely should get this" +
    " wrong.",
};

// Shared "distractor discipline" block injected into every generation prompt.
// AI-written MCQs skew easy because the model makes the correct answer easy to
// find. These rules attack the specific tells that let a test-wise candidate
// eliminate options without knowing the material.
const ANTI_TELL_RULES =
  " HARD-DISTRACTOR RULES (critical — the questions must be genuinely difficult):" +
  " (1) All options must be roughly the same LENGTH and specificity — never make" +
  " the correct answer the longest or most-qualified. (2) No option may be" +
  " eliminable by absolute language — avoid 'always', 'never', 'all', 'none'," +
  " 'only' unless every option uses similar wording. (3) Every distractor must be" +
  " PLAUSIBLE to a knowledgeable candidate: use true-but-irrelevant statements," +
  " correct-but-incomplete answers, or answers that are subtly wrong on ONE detail" +
  " (a date, threshold, scope, article number, or direction). (4) No throwaway or" +
  " absurd options, no joke answers, no 'all of the above'. (5) Distinguishing the" +
  " correct answer should require real reasoning or precise knowledge, not surface" +
  " cues. Aim for the difficulty of the actual EPSO test, where all four options" +
  " look defensible at first glance.";

// Prompt builders — tuned for AD8-level EPSO field-MCQ realism.
export function buildGenerationPrompt(
  topic: Topic,
  count: number,
  articleText?: string,
  difficulty: Difficulty = "medium",
  language: QuestionLanguage = "en",
): { system: string; user: string } {
  // Reading-comprehension verbal reasoning is a distinct EPSO format: a factual
  // passage on a NEUTRAL topic + "Which of the following statements is correct?"
  // + 4 full-sentence options, exactly one correct. The correct answer is an
  // understated, literal paraphrase supported by the passage ALONE; the three
  // distractors each use a named EPSO trap. It does NOT use the AI-specialist
  // author persona — the whole point is comprehension, not domain knowledge.
  if (topic === "verbal-rc") {
    return buildReadingComprehensionPrompt(count, difficulty, language);
  }

  // Numerical reasoning is a distinct EPSO format: one shared statistical
  // table and five options (A-E), with E fixed as "Cannot be determined".
  // It does not use the AI-specialist persona or the four-option anti-tell rules.
  if (topic === "numerical") {
    return buildNumericalPrompt(count, difficulty, language);
  }

  const verbalNote =
    topic === "verbal"
      ? ' Provide a short passage in the "stem", then a statement to judge; choices must be "True", "False", "Cannot say", and set D to "-".'
      : "";

  const difficultyNote = DIFFICULTY_INSTRUCTIONS[difficulty] ?? DIFFICULTY_INSTRUCTIONS.medium;

  // Field AI topics (not verbal T/F) use the scenario-based applied format the
  // real EPSO field test and prep platforms use: a short professional vignette
  // then an applied question, plus per-option learn-mode notes.
  const isFieldTopic = topic !== "verbal";

  // SCENARIO FORMAT: most field items should be a short applied situation, not
  // a bare definition. This tests whether the candidate can APPLY the knowledge
  // in an EU-institutional context — the discriminating skill at AD8.
  const scenarioNote = isFieldTopic
    ? " SCENARIO FORMAT (critical for realism): Roughly THREE IN FOUR questions" +
      " must be SCENARIO-BASED — open the stem with a short (2-4 sentence)" +
      " professional vignette set in a realistic EU-institutional context (an EU" +
      " agency or Commission DG deploying, procuring, auditing or governing an AI" +
      " system; a provider preparing a system for the EU market; a policy unit" +
      " assessing obligations), then ask an APPLIED question such as 'Which" +
      " obligation applies first?', 'What is the most appropriate next step?'," +
      " 'How should the team classify this system?', or 'Which action best" +
      " ensures compliance?'. The remaining ~one in four may be direct" +
      " conceptual questions for variety. In scenario items the correct answer" +
      " and every distractor must be a plausible action/classification/" +
      " conclusion FOR THAT SPECIFIC SITUATION — not a generic definition. Do" +
      " not pad trivial recall questions with a fake scenario; the scenario must" +
      " genuinely drive the reasoning." +
      " TWO-CONCEPT FUSION (critical for AD8 difficulty): the scenario must force" +
      " the candidate to combine TWO related concepts, not recall one in" +
      " isolation. For example: a high-risk Annex III recruitment tool that also" +
      " performs workplace emotion recognition (Annex III classification ×" +
      " Article 5 prohibition); a model showing input-distribution shift while" +
      " ground-truth labels arrive weeks late (drift detection × delayed labels);" +
      " a 98%-accuracy classifier on a 1%-positive problem (headline metric ×" +
      " class imbalance). State both concepts in the vignette so the correct" +
      " answer depends on resolving their interaction."
    : "";

  // Per-option learn-mode notes for field items: after answering, the app shows
  // why each option is right/wrong AS APPLIED TO THE SCENARIO. Reuses the same
  // optionNotes field the verbal-RC format already validates and renders.
  const optionNotesNote = isFieldTopic
    ? " PER-OPTION NOTES (required): also output \"optionNotes\", an object keyed" +
      " by option letter A-D. For each option give {\"verdict\":\"true\"|\"false\"," +
      " \"note\":string}. Exactly one verdict is \"true\" (the correct answer);" +
      " the rest \"false\". Each note is ONE sentence that explains the underlying" +
      " CONCEPT as it applies to THIS scenario — for the correct option why it is" +
      " the right call here, and for each wrong option which specific concept it" +
      " misapplies or which obligation/threshold/scope it gets wrong in this" +
      " situation. These power a per-option learn-mode breakdown."
    : "";

  // Language note: field MCQ is always English (Language 2 in the real EPSO exam).
  // Verbal (T/F) in other languages is supported but field topics stay English.
  const languageNote =
    language !== "en" && topic === "verbal"
      ? ` IMPORTANT: Write the passage, statement, all answer choices, and the explanation entirely in ${language === "pt-PT" ? "European Portuguese (Portugal variant, not Brazilian Portuguese)" : language}.`
      : "";

  // JSON shape differs for field items (they also emit optionNotes).
  const outputShape = isFieldTopic
    ? "Output ONLY a JSON object of the form " +
      '{"questions":[{"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string},' +
      '"answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string,' +
      '"optionNotes":{"A":{"verdict":"true"|"false","note":string},"B":{...},"C":{...},"D":{...}}' +
      "}]}. No prose outside the JSON."
    : "Output ONLY a JSON object of the form " +
      '{"questions":[{"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string},' +
      '"answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string' +
      "}]}. No prose outside the JSON.";

  const system =
    "You are a senior EPSO competition question author writing for EPSO/AD/430/26 " +
    "(grade AD 8, Artificial Intelligence field-related MCQ test). Produce " +
    "single-best-answer multiple-choice questions at the level of an EXPERIENCED " +
    "AI specialist (not entry-level). Rules: exactly one unambiguous correct " +
    "answer per question; all distractors must be plausible and require real " +
    "domain knowledge to reject (no obvious throwaways, no 'all of the above'); " +
    "the explanation must state why the correct answer is right AND why each " +
    'distractor is wrong. Each question object MUST include a "difficulty" field ' +
    `set to "${difficulty}" and a "language" field set to "${language}". ` +
    outputShape +
    difficultyNote +
    scenarioNote +
    optionNotesNote +
    ANTI_TELL_RULES +
    verbalNote +
    languageNote;

  const focus = TOPIC_FOCUS[topic] ? ` ${TOPIC_FOCUS[topic]}` : "";
  const traps = isFieldTopic && TOPIC_TRAPS[topic] ? TOPIC_TRAPS[topic] : "";
  const source = articleText
    ? `Base the questions strictly on this source text:\n\n${articleText.slice(0, 6000)}`
    : `Topic: ${TOPIC_LABELS[topic]} (EPSO AD8 Artificial Intelligence competition).${focus}${traps}`;

  const user = `Generate ${count} ${difficulty}-difficulty exam-realistic questions. ${source}`;

  return { system, user };
}

// EPSO Verbal Reasoning — Reading Comprehension format.
// Modelled on real EPSO items (e.g. PT2309rV, EN2360V): a dense, formally
// written factual passage in EU bureaucratic register, followed by
// "Which of the following statements is correct?" with four full-sentence
// options. Answerable from the passage ALONE.
function buildReadingComprehensionPrompt(count: number, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): {
  system: string;
  user: string;
} {
  const difficultyNote =
    difficulty === "easy"
      ? " DIFFICULTY: EASY. Use a passage of 5-6 sentences. Sentence structure" +
        " should be clear but formal. Distractors use obvious traps (clear overreach" +
        " or simple negation flip) that a careful reader can reject quickly."
      : difficulty === "hard"
        ? " DIFFICULTY: HARD. Use a dense passage of 8-10 sentences with multiple" +
          " subordinate clauses, qualifiers ('in most cases', 'under certain" +
          " conditions', 'it is estimated that') and several related facts that" +
          " are easy to confuse. Distractors must closely mirror passage wording," +
          " swapping a single subtle detail (a quantity, a qualifier, a scope word," +
          " a frequency). The correct answer should require re-reading at least one" +
          " sentence carefully."
        : " DIFFICULTY: MEDIUM. Use a passage of 6-8 sentences with formal register" +
          " and some subordinate clauses. Distractors use standard EPSO traps" +
          " (scope swap, overreach, belief-as-fact) but are distinguishable with" +
          " careful reading.";

  const languageNote =
    language !== "en"
      ? ` IMPORTANT: Write the entire question — passage, question line, all four answer options, and the explanation — in ${language === "pt-PT" ? "European Portuguese (Portugal variant — not Brazilian Portuguese). Use European Portuguese vocabulary, spelling (post-2009 Acordo Ortográfico), and formal administrative register matching official EU documents translated into Portuguese." : language}.`
      : "";

  const registerNote =
    "REGISTER AND STYLE (critical): The passage must read like an extract from " +
    "an official EU publication, scientific report, or encyclopaedia entry — NOT " +
    "like a school textbook or a news article. Use formal, impersonal prose with " +
    "subordinate clauses, passive constructions, hedging language ('it is estimated " +
    "that', 'in most cases', 'under certain conditions', 'studies suggest'), and " +
    "precise qualifiers. Sentences should be 25-40 words on average. The passage " +
    "must contain multiple facts that are easy to confuse under time pressure — " +
    "numbers, proportions, geographic scope, conditions, and direction of effects. " +
    "Topics: science, public health, environmental policy, economic statistics, " +
    "geography, history, EU administration, technology policy — NOT AI or the " +
    "candidate's field of expertise.";

  const system =
    "You are a senior EPSO test author writing VERBAL REASONING " +
    "(reading-comprehension) items for an EU competition. Each item has:\n" +
    "1) A self-contained factual passage on a NEUTRAL topic in formal EU register " +
    "(see REGISTER AND STYLE below). The passage must contain all facts needed " +
    "and require no outside knowledge.\n" +
    "2) The passage goes in the \"stem\", followed by a blank line and the exact " +
    (language === "pt-PT"
      ? "question: \"Qual das seguintes afirmações está correta?\"\n"
      : "question: \"Which of the following statements is correct?\"\n") +
    "3) Exactly four full-sentence options A-D. EXACTLY ONE is correct.\n\n" +
    "THE CORRECT OPTION must be an understated, LITERAL paraphrase of something " +
    "the passage explicitly states — never stronger, wider or more absolute than " +
    "the text. It should sound plausible but not stand out as obviously correct.\n\n" +
    "THE THREE DISTRACTORS must each be plausible and each use ONE of these named " +
    "EPSO traps (use a mix; do not reuse the same trap for all three):\n" +
    "- OVERREACH/ABSOLUTE: turns a qualified statement into an absolute the text " +
    "never makes (e.g. 'limited' -> 'no other', 'resilient' -> 'cannot be killed').\n" +
    "- SCOPE/QUANTITY SWAP: distorts a number, frequency or geographic/logical " +
    "scope (e.g. a region -> 'the whole country', 'currently in use' -> 'carried " +
    "out each year', '50%' -> 'the majority').\n" +
    "- BELIEF-AS-FACT: presents an opinion, doubt or reported belief in the passage " +
    "as if it were an established fact.\n" +
    "- UNSTATED CAUSAL LINK: asserts a cause-effect relationship the passage does " +
    "not make.\n" +
    "- NEGATION FLIP: reverses or negates what the passage actually says.\n\n" +
    "Distractors must be WRONG strictly against the passage — never true-but-" +
    "unstated trivia. Each distractor should look correct at a glance. " +
    "Do NOT use 'all of the above' or throwaway options.\n\n" +
    "ALMOST-TRUE DISCIPLINE (critical — this is what makes the item exam-hard): " +
    "Each distractor must be wrong by only ONE small degree — a single qualifier, " +
    "quantifier, scope word, or causal link away from being a faithful paraphrase. " +
    "A knowledgeable candidate reading quickly should find THREE options that all " +
    "feel defensible. The wrongness must hinge on one word, not on being off-topic. " +
    "Study these REAL EPSO patterns and reproduce their subtlety:\n" +
    "- Text: 'leg muscles make up a significant % of body mass, roughly equal to " +
    "wing muscles of flying birds.' CORRECT: 'leg muscles are a significant % of " +
    "body mass.' TRAP (overreach): 'leg muscles are the MOST IMPORTANT factor' — " +
    "the text never ranks factors, it only lists two.\n" +
    "- Text: 'even if badly burned, it recovers quickly from its roots.' CORRECT: " +
    "'does better where there is less competition.' TRAP (absolute): 'CANNOT be " +
    "destroyed by fire or drought' — 'recovers quickly' is not 'cannot be destroyed'.\n" +
    "- Text: 'they vanished AFTER the arrival of man.' CORRECT: 'lemurs lived there " +
    "before man.' TRAP (unstated causal): 'extinction is a DIRECT CONSEQUENCE of " +
    "man's arrival' — the text states sequence, not cause.\n" +
    "- Text: 'a part of the Alaska road used log foundations.' CORRECT: a different " +
    "literal fact. TRAP (scope): 'a LARGE part of the Alaska road' — 'a part' is " +
    "not 'a large part'.\n" +
    "Your distractors must bite exactly like these: true-sounding, one qualifier " +
    "too strong/wide/causal.\n\n" +
    "The \"explanation\" must: (a) identify the sentence(s) in the passage that " +
    "support the correct answer and explain why it is the faithful paraphrase; " +
    "(b) for EACH distractor, name its trap type in CAPITALS and quote the exact " +
    "passage wording it distorts, showing the ONE word/degree that makes it wrong.\n\n" +
    "QUESTION-TYPE VARIETY: most items ask \"which statement is correct?\", but " +
    "roughly ONE IN FOUR must instead be an AUTHOR'S-TONE / ATTITUDE question — " +
    "ask " +
    (language === "pt-PT"
      ? "\"Qual é o tom predominante adotado nesta passagem?\" "
      : "\"Which is the predominant tone of this passage?\" ") +
    "with four options describing the tone. For tone items: the passage must " +
    "carry evaluative/hedging language revealing a MEASURED stance (e.g. " +
    "'promising but narrow', 'necessary yet costly'). The correct option names " +
    "that measured stance (e.g. 'cautiously favourable ... without minimising " +
    "the drawbacks'). The distractors must be: (i) TOO STRONG (e.g. 'vehemently " +
    "warning', 'alarmed') — overstates the intensity; (ii) WRONG POLARITY — " +
    "claims the opposite lean (e.g. 'more enthusiastic than attentive to limits'); " +
    "(iii) TOO WEAK / FALSE-NEUTRAL (e.g. 'a neutral, purely factual account') — " +
    "this must be a TRAP, because the passage is NOT neutral; it has a perceptible " +
    "evaluative lean. The false-neutral option is the key distractor and must " +
    "appear in every tone item.\n\n" +
    "PER-OPTION NOTES (required): also output \"optionNotes\", an object keyed by " +
    "option letter A-D. For each option give {\"verdict\":\"true\"|\"false\", " +
    "\"note\":string}. Exactly one verdict is \"true\" (the correct answer); the " +
    "rest \"false\". Each note is ONE sentence, in the question's language, that " +
    "quotes or paraphrases the passage to justify the verdict and (for false " +
    "options) names why it fails — too strong, wrong polarity, too weak/neutral, " +
    "scope swap, etc. These power a per-option breakdown in learn mode.\n\n" +
    registerNote + "\n\n" +
    'Each question object MUST include a "difficulty" field set to "' + difficulty + '" and a "language" field set to "' + language + '".\n\n' +
    "Output ONLY a JSON object of the form " +
    '{"questions":[{"stem":string,"choices":{"A":string,"B":string,"C":string,' +
    '"D":string},"answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string,' +
    '"optionNotes":{"A":{"verdict":"true"|"false","note":string},"B":{...},"C":{...},"D":{...}}}]}. ' +
    "The stem MUST contain the passage AND the question line. No prose outside the JSON." +
    difficultyNote +
    ANTI_TELL_RULES +
    languageNote;

  const user =
    `Generate ${count} ${difficulty}-difficulty EPSO verbal reasoning reading-comprehension questions. ` +
    "Vary the passage topics. Randomise which option letter is correct across " +
    "the set (do not always make the same letter correct).";

  return { system, user };
}

// EPSO Numerical Reasoning format (AD administrator exam).
// One Eurostat-style table is shared by a set of questions. Every item has
// five options. E is always the fixed label "Cannot be determined"
// (pt-PT: "Impossível responder") and is the correct answer ONLY when a
// required base figure is missing (Type 3) — not when the computed value was
// merely left off the list. A calculator is allowed, so figures are real-scale.
function buildNumericalPrompt(count: number, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): { system: string; user: string } {
  const optionE = language === "pt-PT" ? "Impossível responder" : "Cannot be determined";

  const difficultyNote =
    difficulty === "easy"
      ? " DIFFICULTY: EASY. Keep the same table shape. Use one-decimal figures " +
        "that divide cleanly. Distractors are the classic mistakes (inverted ratio, " +
        "wrong year, stopping one step early) and should sit well clear of the " +
        "correct value."
      : difficulty === "hard"
        ? " DIFFICULTY: HARD. Use non-round figures that need a calculator. Type 2 " +
          "must apply every factor in the three-step chain, including the public " +
          "share. At least one table must carry a thousands-vs-millions header so " +
          "ignoring the unit is a real distractor. Wrong options are the exact " +
          "result of one missed step, near enough to tempt, but still separated " +
          "from the correct value (see SEPARATION)."
        : " DIFFICULTY: MEDIUM. Use non-round real-scale figures. Type 2 uses the " +
          "full three-step chain. Distractors are one structural mistake each.";

  const languageNote =
    language === "pt-PT"
      ? " Write the caption, headers, stem, explanation, workedSolution, and steps " +
        "entirely in European Portuguese (Portugal, post-2009 Acordo Ortográfico — " +
        "not Brazilian Portuguese). Decimal comma, thousands separated by a space " +
        "(19 330 and 1,97). Fraction options stay as 3/2."
      : " Decimal point, thousands separated by a space (19 330 and 1.97).";

  // Full sets are Type 1-4 on one table. A short tail keeps that order so a
  // one-question drill is a real calculation, not only the missing-data trap.
  const fullSets = Math.floor(count / 4);
  const remainder = count % 4;
  const typeNames = ["Type 1", "Type 2", "Type 3", "Type 4"];
  const setsWord = fullSets === 1 ? "set" : "sets";
  let batchPlan: string;
  if (fullSets === 0) {
    batchPlan =
      `This batch is ${count} ${count === 1 ? "question" : "questions"} on ONE shared table, in this order: ` +
      `${typeNames.slice(0, count).join(", ")}.`;
  } else if (remainder === 0) {
    batchPlan =
      `This batch is ${fullSets} ${setsWord} of 4 questions. Each set has its own table. ` +
      "Within a set the order is Type 1, Type 2, Type 3, Type 4.";
  } else {
    batchPlan =
      `This batch is ${fullSets} full ${setsWord} of 4, then a final short set of ` +
      `${remainder} (${typeNames.slice(0, remainder).join(", ")}). Each set has its own table. ` +
      "Within a full set the order is Type 1, Type 2, Type 3, Type 4.";
  }

  const system =
    "You are an official EPSO test developer writing NUMERICAL REASONING items " +
    "for the Administrator (AD) exam. Candidates have a calculator and about " +
    "two minutes per question. Output ONLY JSON, no prose.\n\n" +
    "TABLE (one per set, copied identically onto every question in that set):\n" +
    "- Exactly 5 rows, one country or region each.\n" +
    "- headers[0] is the country label. Then 4 to 6 DATA columns, so " +
    "headers.length is 5, 6, or 7. Every row has that same length.\n" +
    "- Mix units. Include all of: at least two percentage columns " +
    "(R&D as % of GDP, % of R&D publicly funded, or % urban population); " +
    "at least one absolute column in millions of EUR; at least one per-capita " +
    "or per-million column (GDP per capita in EUR, or patents per million inhabitants).\n" +
    "- Two time points on at least two indicators (for example 2000 and 2003, " +
    "or 2015 and 2020).\n" +
    "- Model the table on a Eurostat or OECD extract. Include a decoy column " +
    "the questions do not need. Do not use toy round numbers.\n" +
    "- Different sets use different themes: R&D expenditure, demographics, " +
    "energy, trade, public health, transport.\n\n" +
    "THE FOUR QUESTION TYPES. Follow them exactly. The stem asks one precise " +
    "question and does not restate the table. A growth rate that the table does " +
    "not contain is given in the stem only for Type 2.\n" +
    "Type 1 — Reverse percentage, then a ratio of two countries. " +
    "Total base = absolute expenditure ÷ (% of base). " +
    "Ratio = total base of country A ÷ total base of country B. " +
    "Options A-D are ONLY simplified fractions such as 1/3, 2/3, 3/2, 3/1. " +
    "No words, no decimals in A-D.\n" +
    "Type 2 — A growth rate supplied in the stem, then a 3-step compound value. " +
    "Example stem: \"Given that country X's GDP grew by 4% between 2000 and 2003...\". " +
    "Steps: (1) base in the first year = expenditure ÷ % of base; " +
    "(2) base in the later year = base × (1 + growth); " +
    "(3) target = later base × later % of base × later public share " +
    "(drop the public-share factor only if that column does not exist). " +
    "Ask for the new absolute expenditure or the public share in the target year. " +
    "Options A-D are four plain numbers (millions of EUR, or a percentage) from " +
    "structural mistakes, close enough that a skipped step looks plausible.\n" +
    "Type 3 — Missing-variable trap. Ask for an absolute change in EUR or in " +
    "number of people between the two years. The table has only percentages for " +
    "both years, and the stem does NOT give the growth of the base (GDP or " +
    "population). The absolute change cannot be computed. " +
    `The correct answer MUST be E, "${optionE}".\n` +
    "Type 4 — Speed check. One step only: add, subtract, or multiply two values " +
    "that are both printed in the table. Options A-D are plain numbers.\n\n" +
    "CHOICES.\n" +
    `- Always five options. E is exactly "${optionE}" on every question, with no ` +
    "extra words. A-D are the numeric or fraction candidates.\n" +
    "- E is correct only for Type 3, because a required input is missing. " +
    "For Types 1, 2, and 4 the data is sufficient, the correct value is one of " +
    "A-D, and E is a wrong option. Do not hide the true number and call it " +
    `"${optionE}".\n` +
    "- Randomise which of A-D is correct on Types 1, 2, and 4.\n" +
    "- Each wrong numeric option is the result of ONE named mistake, not a " +
    "random figure: inverted ratio (2/3 when the answer is 3/2); the other " +
    "year's percentage; stopping before the last percentage step (reporting " +
    "total GDP instead of public R&D, or the base instead of the expenditure).\n" +
    "- SEPARATION: options must not be a rounding coin-flip. Keep them more " +
    "than 0.5 percentage points apart, and more than about 2% apart relative " +
    "to each other for large euro amounts. If two mistakes would land too " +
    "close, change the table figures.\n\n" +
    "WORKED SOLUTION (the answer key is checked against it):\n" +
    "- Types 1, 2, and 4: show the arithmetic. The last token of workedSolution " +
    "must be the correct option's value. For Type 1 that token is the fraction " +
    "itself (example: the string ends with 3/2). For Types 2 and 4 it is the " +
    "same number printed in the correct option.\n" +
    "- Type 3: do not compute a result and do not write any digit. Name the " +
    "missing input (the base growth rate, or the population). The figures in " +
    "A-D must not appear in the worked solution.\n" +
    "- Do not write \"the answer is\" followed by a letter anywhere except to " +
    "name the one correct letter. Never name a different letter.\n" +
    "- explanation: the correct calculation, and the trap name for each wrong option.\n" +
    "- steps: an ordered array of short calculation steps for learn mode. " +
    "For Type 3, steps state only which input is missing.\n\n" +
    `Every object has "difficulty" "${difficulty}" and "language" "${language}".\n` +
    "Output ONLY " +
    '{"questions":[{"table":{"caption":string,"headers":string[],"rows":string[][]},' +
    '"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string,"E":string},' +
    '"answer":"A"|"B"|"C"|"D"|"E","difficulty":"easy"|"medium"|"hard","language":string,' +
    '"explanation":string,"workedSolution":string,"steps":string[]}]}. ' +
    "No prose outside the JSON." +
    difficultyNote +
    languageNote;

  const user =
    `Generate exactly ${count} ${difficulty}-difficulty EPSO numerical reasoning ` +
    `${count === 1 ? "question" : "questions"}. ${batchPlan} Copy the identical table object onto every question ` +
    `that shares it. Option E is "${optionE}" on every question. Only Type 3 is ` +
    "keyed to E.";

  return { system, user };
}

// Lever 2 — self-critique / hardening pass. Takes the first-pass questions and
// asks the model to re-examine each one against the hard-distractor rules and
// rewrite weak options. The caller re-validates the output and falls back to
// the first pass if the critique degrades it, so this can only improve quality.
export function buildCritiquePrompt(
  topic: Topic,
  questionsJson: string,
): { system: string; user: string } {
  if (topic === "numerical") {
    const system =
      "You are a strict EPSO numerical-reasoning reviewer. You receive draft " +
      "items and you may only tighten weak numeric distractors. Do not change " +
      "the table, the stem's question, the correct letter, the difficulty, or " +
      "the language. Option E must stay exactly \"Cannot be determined\" or " +
      "\"Impossível responder\" — never rewrite it into a sentence or a number. " +
      "If the keyed answer is that E option, the item is a missing-data trap: " +
      "do not invent the missing growth rate or population, and do not move the " +
      "key onto a numeric option. A numeric distractor that is a random figure " +
      "may be replaced with the result of one mistake: an inverted ratio, the " +
      "other year's percentage, or stopping before the final percentage step. " +
      "Keep each distractor more than 0.5 percentage points away from the " +
      "correct value, and more than about 2% away for large euro amounts. " +
      "The last token of workedSolution must still equal the keyed option " +
      "(a fraction such as 3/2 for a ratio item). Return the same number of " +
      "questions. Output ONLY the revised JSON ({\"questions\":[...]}), no prose.";
    const user =
      "Review these numerical items. Return the same number of questions in " +
      "the same JSON schema:\n\n" +
      questionsJson;
    return { system, user };
  }

  const preserve =
    topic === "verbal-rc"
      ? " Preserve the passage + question line in the stem and the four options." +
        " Keep the difficulty field unchanged." +
        " Keep each distractor a genuine trap (overreach, scope swap," +
        " belief-as-fact, unstated causal, negation) that closely mirrors the" +
        " passage wording — not an obvious mismatch."
      : " Keep the same JSON schema the input uses, including the difficulty" +
        " field. If an item has a scenario vignette in the stem, preserve it." +
        " If an item includes \"optionNotes\", preserve that field: keep one" +
        " \"true\" verdict (the correct answer) and update each note so it still" +
        " explains the concept as applied to the scenario.";

  const system =
    "You are a strict EPSO exam reviewer. You receive draft multiple-choice " +
    "questions and make them HARDER and fairer without changing which answer is " +
    "correct. For each question: identify any option a test-wise candidate could " +
    "eliminate WITHOUT knowing the material (too short/long, absolute language " +
    "like always/never/all, obviously absurd, or plainly off-topic) and REWRITE " +
    "that option to be genuinely plausible — true-but-irrelevant, " +
    "correct-but-incomplete, or subtly wrong on one detail. Equalise option " +
    "length and specificity. Do NOT change the correct answer key. Keep exactly " +
    "one correct option. Improve the explanation to justify the answer and name " +
    "why each distractor is wrong." +
    preserve +
    " Output ONLY the revised JSON in the same shape as the input " +
    '({"questions":[...]}), no prose.' +
    ANTI_TELL_RULES;

  const user =
    "Harden these draft questions. Return the same number of questions in the " +
    "same JSON schema:\n\n" +
    questionsJson;

  return { system, user };
}
