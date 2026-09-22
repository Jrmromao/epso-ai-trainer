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
  | "numerical";

export const TOPIC_LABELS: Record<Topic, string> = {
  "ai-act": "EU AI Act",
  "ml-fundamentals": "ML Fundamentals",
  "genai-rag": "GenAI / RAG",
  mlops: "MLOps",
  "trustworthy-ai": "Trustworthy AI",
  policy: "Policy",
  verbal: "Verbal Reasoning",
  numerical: "Numerical Reasoning",
};

// Field-knowledge + verbal questions: single-best-answer MCQ.
export type ChoiceKey = "A" | "B" | "C" | "D";

export interface BaseQuestion {
  id: string;
  topic: Topic;
  stem: string; // the question / passage prompt
  choices: Record<ChoiceKey, string>;
  answer: ChoiceKey;
  explanation: string; // why the answer is correct (and pitfalls)
}

// Numerical questions MUST carry a worked solution — this is the answer-key
// guardrail (spec AC4): we never trust a bare key, the maths is shown.
export interface NumericalQuestion extends BaseQuestion {
  topic: "numerical";
  workedSolution: string;
}

export type Question = BaseQuestion | NumericalQuestion;

export function isNumerical(q: Question): q is NumericalQuestion {
  return q.topic === "numerical";
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
