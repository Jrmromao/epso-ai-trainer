import { NextResponse } from "next/server";
import type { Difficulty, Question, Topic } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions } from "@/lib/questionSchema";
import { hardenQuestions } from "@/lib/hardenQuestions";
import { SEED_QUESTIONS } from "@/data/questions";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// Full field-MCQ exam: 30 questions across the 6 AI field topics.
// Generated live in per-topic batches; topped up from the seed bank so the
// exam always has 30 even if some batches fail.

const FIELD_TOPICS: Topic[] = [
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
];

const EXAM_SIZE = 30;
const PER_TOPIC = 5; // 5 × 6 = 30

type DifficultyMode = Difficulty | "mix";

// For "mix" mode: cycle easy/medium/hard across topics so the exam has
// roughly 10 of each. Topics cycle through difficulties deterministically.
const MIX_CYCLE: Difficulty[] = ["easy", "medium", "hard", "easy", "medium", "hard"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function generateForTopic(
  topic: Topic,
  difficulty: Difficulty,
  byokKey: string,
  harden: boolean,
): Promise<Question[]> {
  const byok = byokKey.length > 0;
  if (!byok && !tryConsumeLlmCall()) return [];
  const { system, user } = buildGenerationPrompt(topic, PER_TOPIC, undefined, difficulty, "en");
  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    const questions = parseQuestions(raw, topic, difficulty, "en");
    if (questions.length === 0) return [];
    if (harden && (byok || tryConsumeLlmCall())) {
      return hardenQuestions(questions, topic, getLlmConfig(byokKey || undefined));
    }
    return questions;
  } catch {
    return [];
  }
}

function topUpFromSeed(have: Question[], need: number, difficulty?: Difficulty): Question[] {
  if (have.length >= need) return have.slice(0, need);
  const haveIds = new Set(have.map((q) => q.id));
  // Try matching difficulty first, then relax.
  const pool = shuffle(
    SEED_QUESTIONS.filter(
      (q) =>
        FIELD_TOPICS.includes(q.topic) &&
        !haveIds.has(q.id) &&
        (!difficulty || q.difficulty === difficulty),
    ),
  );
  const relaxed = pool.length > 0
    ? pool
    : shuffle(SEED_QUESTIONS.filter((q) => FIELD_TOPICS.includes(q.topic) && !haveIds.has(q.id)));
  return [...have, ...relaxed].slice(0, need);
}

export async function POST(req: Request) {
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let difficultyMode: DifficultyMode = "mix";
  let harden = true;
  try {
    const body = (await req.json()) as { harden?: boolean; difficulty?: string };
    if (body?.harden === false) harden = false;
    if (body?.difficulty === "easy" || body?.difficulty === "medium" || body?.difficulty === "hard") {
      difficultyMode = body.difficulty;
    } else if (body?.difficulty === "mix") {
      difficultyMode = "mix";
    }
  } catch {
    // no body / not JSON -> keep defaults
  }

  // Resolve per-topic difficulties.
  const topicDifficulties: Difficulty[] = FIELD_TOPICS.map((_, i) =>
    difficultyMode === "mix" ? MIX_CYCLE[i] : difficultyMode,
  );

  // Generate all topic batches in parallel.
  const batches = await Promise.all(
    FIELD_TOPICS.map((t, i) => generateForTopic(t, topicDifficulties[i], byokKey, harden)),
  );
  const generated = batches.flat();

  const liveCount = generated.length;
  const questions = shuffle(
    topUpFromSeed(generated, EXAM_SIZE, difficultyMode === "mix" ? undefined : difficultyMode),
  );

  return NextResponse.json({
    questions,
    total: questions.length,
    liveCount,
    source: liveCount >= EXAM_SIZE ? "llm" : liveCount > 0 ? "mixed" : "fallback",
    durationSeconds: 40 * 60,
    passMark: 15,
    difficultyMode,
  });
}
