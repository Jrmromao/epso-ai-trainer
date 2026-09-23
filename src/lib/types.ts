// Core domain types for the EPSO AI Trainer.

// Topics the app can train (field MCQ + text-based reasoning).
// Abstract reasoning is intentionally NOT a generatable topic (visual, LLM-unreliable).
export type Topic =
  | "ai-act"
  | "ml-fundamentals"
  | "genai-rag"
  | "mlops"
  | "trustworthy-ai"
  | "policy"
  | "verbal"
  | "verbal-rc"
  | "numerical";

export const TOPIC_LABELS: Record<Topic, string> = {
  "ai-act": "EU AI Act",
  "ml-fundamentals": "ML Fundamentals",
  "genai-rag": "GenAI / RAG",
  mlops: "MLOps",
  "trustworthy-ai": "Trustworthy AI",
  policy: "Policy",
  verbal: "Verbal Reasoning (True/False/Cannot say)",
  "verbal-rc": "Verbal Reasoning (Reading Comprehension)",
  numerical: "Numerical Reasoning",
};

// Field-knowledge + verbal questions: single-best-answer MCQ.
// EPSO numerical reasoning uses FIVE options (A-E) with "None of the above" as
// E; other formats use four (A-D). E is therefore OPTIONAL: A-D are always
// present, E only when the question has a fifth option.
export type ChoiceKey = "A" | "B" | "C" | "D" | "E";

export interface Choices {
  A: string;
  B: string;
  C: string;
  D: string;
  E?: string;
}

// A data table shown above the stem. EPSO numerical questions are typically
// read off a table; this holds it in structured form so it renders as a table
// rather than being crammed into the stem text.
export interface QuestionTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface BaseQuestion {
  id: string;
  topic: Topic;
  stem: string; // the question / passage prompt
  table?: QuestionTable; // optional data table (numerical reasoning)
  choices: Choices;
  answer: ChoiceKey;
  explanation: string; // why the answer is correct (and pitfalls)
}

// Numerical questions MUST carry a worked solution — this is the answer-key
// guardrail (spec AC4): we never trust a bare key, the maths is shown.
// `steps` is an optional ordered breakdown for the untimed learn-mode's
// step-by-step reveal; when absent, learn-mode splits workedSolution instead.
export interface NumericalQuestion extends BaseQuestion {
  topic: "numerical";
  workedSolution: string;
  steps?: string[];
}

export type Question = BaseQuestion | NumericalQuestion;

export function isNumerical(q: Question): q is NumericalQuestion {
  return q.topic === "numerical";
}

// The five exam components of EPSO/AD/430/26. This is the tracking taxonomy —
// broader than Topic, because abstract reasoning and the EUFTE essay are
// tracked/coached but NOT generated in-app.
export type ExamComponent =
  | "field-ai"
  | "verbal"
  | "numerical"
  | "abstract"
  | "essay";

export const COMPONENT_LABELS: Record<ExamComponent, string> = {
  "field-ai": "Field AI (MCQ)",
  verbal: "Verbal Reasoning",
  numerical: "Numerical Reasoning",
  abstract: "Abstract Reasoning",
  essay: "EUFTE Essay",
};

// Map a generatable Topic to its exam component. The 6 AI field topics all roll
// up to "field-ai"; verbal/numerical map 1:1.
export function componentForTopic(topic: Topic): ExamComponent {
  if (topic === "verbal" || topic === "verbal-rc") return "verbal";
  if (topic === "numerical") return "numerical";
  return "field-ai";
}

// One answered item in a mock run.
export interface AnswerRecord {
  questionId: string;
  topic: Topic;
  chosen: ChoiceKey;
  correct: ChoiceKey;
  isCorrect: boolean;
}

// Result set passed to /api/assess for the per-test weak-topic report.
export interface AssessmentResult {
  weakTopics: Topic[];
  summary: string;
  studyNext: string[];
}
