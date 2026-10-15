import { NextResponse } from "next/server";
import type { Difficulty, QuestionLanguage, Topic } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions } from "@/lib/questionSchema";
import { hardenQuestions } from "@/lib/hardenQuestions";
import { SEED_QUESTIONS } from "@/data/questions";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// Full reasoning-exam generator: the LLM-backed sections only (verbal +
// numerical). Abstract is generated locally on the client (no LLM). Mirrors
// EPSO Part 1: 10 verbal + 10 numerical here, 10 abstract on the client.

const VERBAL_COUNT = 10;
const NUMERICAL_COUNT = 10;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seedFallback(topic: Topic, count: number, language: QuestionLanguage, difficulty: Difficulty) {
  const pool = SEED_QUESTIONS.filter((q) => q.topic === topic);
  const byLang = pool.filter((q) => q.language === language);
  const base = byLang.length > 0 ? byLang : pool;
  // repeat-pad if the seed bank is smaller than requested
  const out = [];
  for (let i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}

// Generate one topic's section in batches of up to 10 (the generator caps at 10).
async function generateSection(
  topic: Topic,
  count: number,
  difficulty: Difficulty,
  language: QuestionLanguage,
  byokKey: string,
  harden: boolean,
) {
  const byok = byokKey.length > 0;
  if (!byok && !tryConsumeLlmCall()) {
    return seedFallback(topic, count, language, difficulty);
  }
  const { system, user } = buildGenerationPrompt(topic, count, undefined, difficulty, language);
  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    let questions = parseQuestions(raw, topic, difficulty, language);
    if (questions.length === 0) return seedFallback(topic, count, language, difficulty);
    if (harden && (byok || tryConsumeLlmCall())) {
      questions = await hardenQuestions(questions, topic, getLlmConfig(byokKey || undefined));
    }
    // top up from seed if the model returned fewer than asked
    if (questions.length < count) {
      const pad = seedFallback(topic, count - questions.length, language, difficulty);
      questions = [...questions, ...pad];
    }
    return questions.slice(0, count);
  } catch {
    return seedFallback(topic, count, language, difficulty);
  }
}

export async function POST(req: Request) {
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { difficulty?: string; language?: string; harden?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const difficulty: Difficulty =
    body.difficulty === "easy" || body.difficulty === "medium" || body.difficulty === "hard"
      ? body.difficulty
      : "medium";
  const language: QuestionLanguage = body.language === "pt-PT" ? "pt-PT" : "en";
  const harden = body.harden !== false;

  // Verbal is a 50/50 mix of T/F and reading-comprehension to match EPSO.
  const [verbalRc, numerical] = await Promise.all([
    generateSection("verbal-rc", VERBAL_COUNT, difficulty, language, byokKey, harden),
    generateSection("numerical", NUMERICAL_COUNT, difficulty, language, byokKey, harden),
  ]);

  return NextResponse.json({
    verbal: shuffle(verbalRc),
    numerical: shuffle(numerical),
    difficulty,
    language,
  });
}
