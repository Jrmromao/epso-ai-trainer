import {
  type ChoiceKey,
  type Choices,
  type Difficulty,
  type Question,
  type QuestionLanguage,
  type QuestionTable,
  type Topic,
  TOPIC_LABELS,
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
    return {
      ...base,
      topic: "numerical",
      workedSolution: q.workedSolution.trim(),
      ...(steps ? { steps } : {}),
    };
  }

  return base;
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
    .filter((q): q is Question => q !== null);
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
// Modelled on real EPSO items (e.g. EN2360V): a self-contained factual passage
// followed by the fixed stem "Which of the following statements is correct?"
// with four full-sentence options. Exactly one is a faithful, understated
// paraphrase of the passage; the other three each apply a named distractor
// trap. Answerable from the passage ALONE — no outside knowledge.
function buildReadingComprehensionPrompt(count: number, difficulty: Difficulty = "medium", language: QuestionLanguage = "en"): {
  system: string;
  user: string;
} {
  // Difficulty modulates passage complexity and how close the distractors are
  // to the correct answer.
  const difficultyNote =
    difficulty === "easy"
      ? " DIFFICULTY: EASY. Use a short, clear passage (4-5 sentences). Distractors" +
        " should use obvious traps (clear overreach or simple negation flip) that a" +
        " careful reader can reject quickly. The correct answer is clearly the most" +
        " faithful paraphrase."
      : difficulty === "hard"
        ? " DIFFICULTY: HARD. Use a denser passage (6-8 sentences) with multiple" +
          " related facts and qualifiers. Distractors must closely mirror passage" +
          " wording, swapping subtle details (a small quantity, a qualifier like" +
          " 'some' vs 'most', a specific condition). The correct answer should be" +
          " genuinely hard to separate from the best distractor without re-reading" +
          " the passage carefully."
        : " DIFFICULTY: MEDIUM. Use a passage of 5-7 sentences. Distractors use" +
          " standard EPSO traps (scope swap, overreach, belief-as-fact) but are" +
          " distinguishable with careful reading.";

  const languageNote =
    language !== "en"
      ? ` IMPORTANT: Write the entire question — passage, question line, all four answer options, and the explanation — in ${language === "pt-PT" ? "European Portuguese (Portugal variant — not Brazilian Portuguese). Use European Portuguese vocabulary, spelling (post-2009 Acordo Ortográfico), and phrasing." : language}.`
      : "";

  const system =
    "You are a senior EPSO test author writing VERBAL REASONING " +
    "(reading-comprehension) items for an EU competition. Each item has:\n" +
    "1) A self-contained factual passage of 4-8 sentences on a NEUTRAL topic " +
    "(science, geography, history, administration, nature, technology) — NOT " +
    "about AI or the candidate's field. The passage must contain all facts " +
    "needed and require no outside knowledge.\n" +
    "2) The passage goes in the \"stem\", followed by a blank line and the exact " +
    "question: \"Which of the following statements is correct?\"\n" +
    "3) Exactly four full-sentence options A-D. EXACTLY ONE is correct.\n\n" +
    "THE CORRECT OPTION must be an understated, LITERAL paraphrase of something " +
    "the passage explicitly states — never stronger, wider or more absolute than " +
    "the text.\n\n" +
    "THE THREE DISTRACTORS must each be plausible and each use ONE of these named " +
    "EPSO traps (use a mix; do not reuse the same trap for all three):\n" +
    "- OVERREACH/ABSOLUTE: turns a qualified statement into an absolute the text " +
    "never makes (e.g. 'limited' -> 'no other', 'resilient' -> 'cannot be killed').\n" +
    "- SCOPE/QUANTITY SWAP: distorts a number, frequency or geographic/logical " +
    "scope (e.g. a region -> 'the whole country', 'currently in use' -> 'carried " +
    "out each year').\n" +
    "- BELIEF-AS-FACT: presents an opinion/doubt reported in the passage as if it " +
    "were an established fact.\n" +
    "- UNSTATED CAUSAL LINK: asserts a cause-effect relationship the passage does " +
    "not make.\n" +
    "- NEGATION FLIP: reverses or negates what the passage actually says.\n\n" +
    "Distractors must be WRONG strictly against the passage — never true-but-" +
    "unstated trivia. Do NOT use 'all of the above' or throwaway options.\n\n" +
    "The \"explanation\" must: state why the correct option is the faithful " +
    "paraphrase, then for EACH distractor name its trap type and quote the passage " +
    "wording it distorts.\n\n" +
    'Each question object MUST include a "difficulty" field set to "' + difficulty + '" and a "language" field set to "' + language + '".\n\n' +
    "Output ONLY a JSON object of the form " +
    '{"questions":[{"stem":string,"choices":{"A":string,"B":string,"C":string,' +
    '"D":string},"answer":"A"|"B"|"C"|"D","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string}]}. ' +
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

  const system =
    "You are a senior EPSO test author writing NUMERICAL REASONING items for an " +
    "EU competition. Each item MUST have:\n" +
    "1) A \"table\" object: {\"caption\":string,\"headers\":string[]," +
    "\"rows\":string[][]} holding realistic figures (percentages, currency, " +
    "counts) across a few categories/years. Every row must have the same number " +
    "of cells as there are headers.\n" +
    "2) A \"stem\": a question requiring a calculation FROM the table (growth %, " +
    "ratio, per-capita, share, difference, etc.). Do not restate the whole table " +
    "in the stem.\n" +
    "3) FIVE options A-E. Options A-D are numeric/textual candidates; option E " +
    "MUST be exactly \"None of the above\". Exactly one option is correct — and " +
    "it may legitimately be E when none of A-D match.\n" +
    "4) \"answer\": the correct letter A-E.\n" +
    "5) \"explanation\": why the answer is correct.\n" +
    "6) \"workedSolution\": the full calculation as one string.\n" +
    "7) \"steps\": an ordered array of short, discrete calculation steps (one " +
    "operation each) that build to the answer, for revealing one at a time.\n" +
    '8) "difficulty": set to "' + difficulty + '".\n' +
    '9) "language": set to "' + language + '".\n\n' +
    "Distractors must be the results of PLAUSIBLE mistakes (wrong base year, " +
    "forgetting to subtract, off-by-a-factor), not random numbers.\n\n" +
    "Output ONLY a JSON object of the form " +
    '{"questions":[{"table":{"caption":string,"headers":string[],"rows":string[][]},' +
    '"stem":string,"choices":{"A":string,"B":string,"C":string,"D":string,"E":string},' +
    '"answer":"A"|"B"|"C"|"D"|"E","difficulty":"easy"|"medium"|"hard","language":string,"explanation":string,"workedSolution":string,' +
    '"steps":string[]}]}. No prose outside the JSON.' +
    difficultyNote +
    ANTI_TELL_RULES +
    languageNote;

  const user =
    `Generate ${count} ${difficulty}-difficulty EPSO numerical reasoning questions, each based on its own ` +
    "data table. Vary the scenarios (economics, demographics, R&D, energy, " +
    "transport). Randomise which option letter is correct, and make E (\"None of " +
    "the above\") the correct answer for at least one question when appropriate.";

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
