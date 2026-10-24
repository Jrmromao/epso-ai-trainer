import { NextResponse } from "next/server";
import type { Difficulty, QuestionLanguage, Topic } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions, balanceQuestionPositions, correctPositionsOf } from "@/lib/questionSchema";
import { hardenQuestions } from "@/lib/hardenQuestions";
import { lastCorrectPosition, recordCorrectPositions } from "@/lib/answerPositionHistory";
import { SEED_QUESTIONS } from "@/data/questions";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

const VALID_TOPICS = new Set<Topic>([
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
  "verbal",
  "verbal-rc",
  "numerical",
]);

const VALID_DIFFICULTIES = new Set<Difficulty>(["easy", "medium", "hard"]);
const VALID_LANGUAGES = new Set<QuestionLanguage>(["en", "pt-PT"]);

// Field MCQ topics are always English (Language 2 in the real exam).
const FIELD_TOPICS = new Set<Topic>(["ai-act", "ml-fundamentals", "genai-rag", "mlops", "trustworthy-ai", "policy"]);

function fallback(topic: Topic, count: number, difficulty?: Difficulty, language?: QuestionLanguage) {
  // Try to match topic + difficulty + language.
  const filtered = SEED_QUESTIONS.filter(
    (q) =>
      q.topic === topic &&
      (!difficulty || q.difficulty === difficulty) &&
      (!language || q.language === language),
  );
  // Relax difficulty if no match.
  const byTopicAndLang = filtered.length > 0
    ? filtered
    : SEED_QUESTIONS.filter((q) => q.topic === topic && (!language || q.language === language));
  // Relax language if still no match (better to show English than nothing).
  const byTopic = byTopicAndLang.length > 0
    ? byTopicAndLang
    : SEED_QUESTIONS.filter((q) => q.topic === topic);
  return byTopic.slice(0, count);
}

export async function POST(req: Request) {
  // BYOK: a user-provided key bypasses the access gate and the daily cap —
  // both exist only to protect the server's own key/credits. The user's key
  // is used for this call only and never stored or logged.
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { topic?: string; count?: number; articleText?: string; harden?: boolean; difficulty?: string; language?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const topic = body.topic as Topic;
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);
  const harden = body.harden !== false;
  const difficulty: Difficulty = VALID_DIFFICULTIES.has(body.difficulty as Difficulty)
    ? (body.difficulty as Difficulty)
    : "medium";
  // Field MCQ is always English regardless of what the caller requests.
  const requestedLanguage: QuestionLanguage = VALID_LANGUAGES.has(body.language as QuestionLanguage)
    ? (body.language as QuestionLanguage)
    : "en";
  const language: QuestionLanguage = FIELD_TOPICS.has(topic) ? "en" : requestedLanguage;

  if (!VALID_TOPICS.has(topic)) {
    return NextResponse.json({ error: "unknown topic" }, { status: 400 });
  }

  if (!byok && !tryConsumeLlmCall()) {
    return NextResponse.json({
      questions: fallback(topic, count, difficulty, language),
      source: "fallback",
      reason: "daily LLM limit reached",
    });
  }

  const { system, user } = buildGenerationPrompt(topic, count, body.articleText, difficulty, language);

  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    // Parse WITHOUT reordering yet: we balance once at the very end so the
    // optional harden pass (which rewrites option text) can't undo the balance.
    const questions = parseQuestions(raw, topic, difficulty, language, { mode: "preserve" });

    if (questions.length === 0) {
      return NextResponse.json({
        questions: fallback(topic, count, difficulty, language),
        source: "fallback",
        reason: "LLM output failed validation",
      });
    }

    let finalQuestions = questions;
    let hardened = false;
    if (harden && (byok || tryConsumeLlmCall())) {
      finalQuestions = await hardenQuestions(
        questions,
        topic,
        getLlmConfig(byokKey || undefined),
      );
      hardened = finalQuestions !== questions;
    }

    // Balance correct-answer positions across the final set, seeded by the last
    // correct position from a previous generation (so single-question requests
    // don't repeat the same letter run-to-run). Then record for next time.
    finalQuestions = balanceQuestionPositions(
      finalQuestions,
      lastCorrectPosition(topic, language),
    );
    recordCorrectPositions(topic, language, correctPositionsOf(finalQuestions));

    return NextResponse.json({ questions: finalQuestions, source: "llm", hardened, difficulty, language });
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({
      questions: fallback(topic, count, difficulty, language),
      source: "fallback",
      reason: message,
    });
  }
}
