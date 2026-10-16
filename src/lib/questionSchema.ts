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
// Returns [] if no number present (e.g. "Cannot be determined").
function parseNumericCandidates(s: string): number[] {
  if (typeof s !== "string") return [];
  // Normalise Unicode minus (U+2212) and other dash variants to ASCII '-' so
  // signs are preserved (critical for distinguishing +1,6 from −1,6).
  const cleaned = s
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[€$£%]/g, " ")
    .trim();
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
  const matches = norm.match(/[-+]?\d[\d.,\s]*\d|[-+]?\d/g);
  if (!matches || matches.length === 0) return [];
  return parseNumericCandidates(matches[matches.length - 1]);
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

// Returns a corrected ChoiceKey, or null if the question should be rejected.
function reconcileNumericalAnswer(
  choices: Choices,
  declared: ChoiceKey,
  workedSolution: string,
): ChoiceKey | null {
  const target = finalCandidatesFromWorkedSolution(workedSolution);
  if (target.length === 0) return declared; // can't extract -> trust declared

  const keys = (["A", "B", "C", "D", "E"] as ChoiceKey[]).filter(
    (k) => typeof choices[k] === "string" && (choices[k] as string).trim(),
  );

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

function shuffleAnswer(q: Question): Question {
  // Skip verbal T/F (fixed semantic order).
  const aLabel = (q.choices.A ?? "").toLowerCase();
  const bLabel = (q.choices.B ?? "").toLowerCase();
  if (FIXED_ORDER_SNIPPETS.some((s) => aLabel.includes(s) || bLabel.includes(s))) {
    return q;
  }

  const present: ChoiceKey[] = (["A", "B", "C", "D", "E"] as ChoiceKey[]).filter((k) => {
    const l = q.choices[k];
    return typeof l === "string" && l.trim() && l !== "-" && l !== "(unused)";
  });
  if (present.length < 2) return q;

  // Keep a terminal "E" (none/cannot) pinned last; shuffle the rest.
  const lastKey = present[present.length - 1];
  const lastLabel = (q.choices[lastKey] ?? "").toLowerCase();
  const pinLast = TERMINAL_E_SNIPPETS.some((s) => lastLabel.includes(s));
  const shufflable = pinLast ? present.slice(0, -1) : present.slice();

  // Collect (originalKey, label, wasCorrect) for the shufflable set so we can
  // build an old->new letter remap to also fix letter references in the
  // explanation/worked solution.
  const items = shufflable.map((k) => ({ from: k, label: q.choices[k]!, correct: k === q.answer }));
  // Fisher-Yates.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  // Rebuild choices in order: shuffled items, then the pinned E (if any).
  const orderKeys = present; // same slots A,B,C,(D),(E)
  const newChoices: Record<string, string> = {};
  let newAnswer: ChoiceKey = q.answer;
  const remap: Partial<Record<ChoiceKey, ChoiceKey>> = {};
  items.forEach((it, idx) => {
    const slot = orderKeys[idx];
    newChoices[slot] = it.label;
    remap[it.from] = slot; // old letter -> new letter
    if (it.correct) newAnswer = slot;
  });
  if (pinLast) {
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
export function parseQuestions(rawJson: string, topic: Topic, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return [];
  }
  const container = parsed as { questions?: unknown };
  const arr = Array.isArray(container.questions) ? container.questions : [];
  return arr
    .map((item) => validateQuestion(item, topic, difficulty, language))
    .filter((q): q is Question => q !== null)
    .map(shuffleAnswer);
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

  // Numerical reasoning is a distinct EPSO format: a DATA TABLE + a question
  // that requires calculation + FIVE options (A-E) where E is "None of the
  // above". It does not use the AI-specialist persona.
  if (topic === "numerical") {
    return buildNumericalPrompt(count, difficulty, language);
  }

  const verbalNote =
    topic === "verbal"
      ? ' Provide a short passage in the "stem", then a statement to judge; choices must be "True", "False", "Cannot say", and set D to "-".'
      : "";

  const difficultyNote = DIFFICULTY_INSTRUCTIONS[difficulty] ?? DIFFICULTY_INSTRUCTIONS.medium;

  // Language note: field MCQ is always English (Language 2 in the real EPSO exam).
  // Verbal (T/F) in other languages is supported but field topics stay English.
  const languageNote =
    language !== "en" && topic === "verbal"
      ? ` IMPORTANT: Write the passage, statement, all answer choices, and the explanation entirely in ${language === "pt-PT" ? "European Portuguese (Portugal variant, not Brazilian Portuguese)" : language}.`
      : "";

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
    "Output ONLY a JSON object of the form " +
    '{"questions":[{"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string},' +
    '"answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string' +
    "}]}. No prose outside the JSON." +
    difficultyNote +
    ANTI_TELL_RULES +
    verbalNote +
    languageNote;

  const focus = TOPIC_FOCUS[topic] ? ` ${TOPIC_FOCUS[topic]}` : "";
  const source = articleText
    ? `Base the questions strictly on this source text:\n\n${articleText.slice(0, 6000)}`
    : `Topic: ${TOPIC_LABELS[topic]} (EPSO AD8 Artificial Intelligence competition).${focus}`;

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

// EPSO Numerical Reasoning format.
// Modelled on real EPSO items (e.g. EN4769PN): a DATA TABLE of figures, a
// question that requires a calculation off that table, and FIVE options (A-E)
// where E is always "None of the above". A calculator is provided in the real
// test, so the numbers can be non-trivial. Each item also carries a worked
// solution and an ordered step breakdown for the untimed learn-mode.
function buildNumericalPrompt(count: number, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): { system: string; user: string } {
  // Difficulty modulates calculation complexity and how close the distractors
  // are to the correct numeric answer.
  const difficultyNote =
    difficulty === "easy"
      ? " DIFFICULTY: EASY. Use simple tables (2-3 columns, 2-3 rows). The required" +
        " calculation should be a single step (direct percentage, simple ratio, or" +
        " straightforward difference). Distractors should be plausible but clearly" +
        " wrong (wrong column, off by a factor of 10)."
      : difficulty === "hard"
        ? " DIFFICULTY: HARD. Use denser tables (3-5 columns, 3-5 rows) with multiple" +
          " related figures. The calculation must require at least 3 steps (e.g." +
          " compound growth + per-capita adjustment, or multi-year change in a" +
          " share). Distractors must be the results of plausible multi-step errors" +
          " (applying the wrong base, forgetting to convert units, rounding at the" +
          " wrong step) and should be numerically close to the correct answer."
        : " DIFFICULTY: MEDIUM. Use tables with 3-4 columns and 3-4 rows. The" +
          " calculation should require 2-3 steps. Distractors should be the results" +
          " of common single-step mistakes (wrong base year, forgetting population" +
          " adjustment).";

  const languageNote =
    language !== "en"
      ? ` IMPORTANT: Write the table caption, column headers, stem, all answer options, explanation, workedSolution, and steps entirely in ${language === "pt-PT" ? "European Portuguese (Portugal variant — not Brazilian Portuguese). Use European Portuguese vocabulary, spelling (post-2009 Acordo Ortográfico), and phrasing. Keep numeric values as numbers." : language}.`
      : "";

  // Option E label depends on language — matches the real TAO interface.
  const optionE = language === "pt-PT" ? "Impossível responder" : "Cannot be determined";

  const tableNote =
    "TABLE DESIGN (critical — match real EPSO format): Use a realistic multi-column " +
    "table modelled on EU statistical publications (Eurostat, OECD) with 4-7 columns " +
    "and 3-6 rows. Mix column types: a year-pair (e.g. 2000 / 2003), a percentage " +
    "column, an absolute-value column (millions EUR, thousands of people, GWh), " +
    "optionally a per-capita column. Row labels are countries/regions/sectors. " +
    "Not every value needs to be used (include decoys), and the question should " +
    "require DERIVING a value (ratio, compound growth, share of total, per-capita) " +
    "rather than reading a single cell directly. At least one question per batch " +
    "should have E as the correct answer.";

  // Realistic figures: real EPSO tables use large real-world numbers with
  // explicit units, and exploit unit confusion. Toy round numbers feel fake.
  const figuresNote =
    "REALISTIC FIGURES (critical): Use large, real-world-scale numbers, not toy " +
    "round values. Populations in millions (e.g. 10.4, 83.2), monetary values in " +
    "millions or billions of EUR, counts in thousands. Put the unit in the column " +
    "header or caption (e.g. 'População (milhares)', 'PIB (milhões EUR)', 'Despesa " +
    "(mil milhões EUR)'). Use decimals and non-round numbers (e.g. 19 330, 2.47, " +
    "148.6) so the calculation requires a calculator — a calculator is provided in " +
    "the real exam. At least one table should use a 'thousands' or 'millions' unit " +
    "where a candidate who ignores the unit header would get a wrong answer.";

  // The four distractors A-D should each encode a NAMED, predictable mistake
  // that real candidates make — this is what separates a realistic item from a
  // random-numbers item.
  const distractorNote =
    "DISTRACTOR DESIGN (critical — each wrong option must encode a NAMED mistake): " +
    "The three incorrect numeric options (and E when E is wrong) must each be the " +
    "result of ONE specific, predictable error, NOT a random number. Use a mix of:\n" +
    "- WRONG BASELINE: percentage change divided by the NEW value instead of the " +
    "original (e.g. change ÷ new instead of change ÷ old).\n" +
    "- PERCENTAGE-POINTS vs PERCENT CHANGE: subtracting two percentages directly " +
    "(giving percentage points) when a relative percentage change was asked, or " +
    "vice versa.\n" +
    "- INCREASE BY vs INCREASE TO: an option that gives the final value when the " +
    "change was asked, or the change when the final value was asked.\n" +
    "- INVERTED RATIO: the correct ratio flipped (b:a instead of a:b).\n" +
    "- UNIT ERROR: an answer off by a factor of 10/100/1000 from ignoring a " +
    "'thousands'/'millions' column header.\n" +
    "SEPARATION RULE (critical — avoids ambiguous items): every option must be " +
    "clearly distinguishable from the correct answer and from every other option. " +
    "Do NOT create a distractor that differs from the correct answer only by a " +
    "rounding choice (e.g. 10,6% vs 10,63%) or that rounds to within 0,3 " +
    "percentage points / 1% relative of the correct value. Each distractor must " +
    "come from a DIFFERENT structural error that yields a numerically DISTINCT " +
    "result — not a near-miss of the same calculation. If a percentage-points " +
    "distractor and the correct percentage-change answer would round to values " +
    "closer than ~0,5 apart, pick different base figures so they separate cleanly.\n" +
    "In the \"explanation\", name which trap each wrong option corresponds to. " +
    "The correct answer must come from using the ORIGINAL value as the baseline, " +
    "keeping full precision until the final step, and respecting the stated units.";

  // Multi-step requirement — real EPSO rarely tests a single operation.
  const multiStepNote =
    "MULTI-STEP REQUIREMENT: For medium and hard items the candidate must combine " +
    "AT LEAST TWO data items and TWO operations — for example, compute a percentage " +
    "change for one row, then express it as a ratio against another row; or derive " +
    "a total from a per-unit value and a count, then take a share of it. A single " +
    "read-and-divide is only acceptable for easy items.";

  const system =
    "You are a senior EPSO test author writing NUMERICAL REASONING items for an " +
    "EU competition. Each item MUST have:\n" +
    "1) A \"table\" object: {\"caption\":string,\"headers\":string[]," +
    "\"rows\":string[][]} — see TABLE DESIGN below. Every row must have the same " +
    "number of cells as there are headers.\n" +
    "2) A \"stem\": a question requiring a multi-step calculation FROM the table " +
    "(ratio, compound growth %, per-capita, share of total, derived index). " +
    "Do not restate the whole table in the stem. Ask one precise question.\n" +
    "3) FIVE options A-E. Options A-D are numeric or ratio candidates; option E " +
    `MUST be exactly "${optionE}". Exactly one option is correct — E is correct ` +
    "when the exact answer does not match any of A-D.\n" +
    "4) \"answer\": the correct letter A-E.\n" +
    "5) \"explanation\": why the answer is correct, with the key calculation shown.\n" +
    "6) \"workedSolution\": the full step-by-step calculation as one string.\n" +
    "7) \"steps\": an ordered array of short discrete calculation steps for " +
    "step-by-step reveal in learn mode.\n" +
    '8) "difficulty": set to "' + difficulty + '".\n' +
    '9) "language": set to "' + language + '".\n\n' +
    tableNote + "\n\n" +
    figuresNote + "\n\n" +
    distractorNote + "\n\n" +
    multiStepNote + "\n\n" +
    "Output ONLY a JSON object of the form " +
    '{"questions":[{"table":{"caption":string,"headers":string[],"rows":string[][]},' +
    '"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string,"E":string},' +
    '"answer":"A"|"B"|"C"|"D"|"E","difficulty":"easy"|"medium"|"hard","language":string,' +
    '"explanation":string,"workedSolution":string,"steps":string[]}]}. ' +
    "No prose outside the JSON." +
    difficultyNote +
    ANTI_TELL_RULES +
    languageNote;

  const user =
    `Generate ${count} ${difficulty}-difficulty EPSO numerical reasoning questions, each based on its own ` +
    "multi-column data table. Vary the scenarios (R&D expenditure, demographics, " +
    "energy production, trade statistics, public health, transport). " +
    `Make E ("${optionE}") the correct answer for at least one question. ` +
    "Randomise which option letter is correct across the set.";

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
  const preserve =
    topic === "numerical"
      ? " Preserve every field exactly (table, workedSolution, steps, the five" +
        " options A-E including E, and the difficulty field). Keep the same JSON schema the input uses." +
        " Distractors must be results of plausible calculation mistakes, close" +
        " enough to the correct value to be tempting."
      : topic === "verbal-rc"
        ? " Preserve the passage + question line in the stem and the four options." +
          " Keep the difficulty field unchanged." +
          " Keep each distractor a genuine trap (overreach, scope swap," +
          " belief-as-fact, unstated causal, negation) that closely mirrors the" +
          " passage wording — not an obvious mismatch."
        : " Keep the same JSON schema the input uses, including the difficulty field.";

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
