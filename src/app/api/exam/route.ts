import { NextResponse } from "next/server";
import type { Question, Topic } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions } from "@/lib/questionSchema";
import { hardenQuestions } from "@/lib/hardenQuestions";
import { SEED_QUESTIONS } from "@/data/questions";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// Full field-MCQ exam: 30 questions across the 6 AI field topics.
// Generated live in per-topic batches; topped up from the seed bank so the
// exam always has 30 even if some batches fail (spec AC12, sourcing = live+fallback).

const FIELD_TOPICS: Topic[] = [
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
];

const PER_TOPIC = 5; // 5 x 6 = 30
const EXAM_SIZE = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Generate one topic batch. In BYOK mode the user's key funds the call and the
// server daily cap is not consumed; in server mode the cap gates every call.
// When harden is set, a second (critique) pass hardens the batch's distractors;
// it consumes another cap slot in server mode and safely no-ops on failure.
async function generateForTopic(
  topic: Topic,
  byokKey: string,
  harden: boolean,
): Promise<Question[]> {
  const byok = byokKey.length > 0;
  if (!byok && !tryConsumeLlmCall()) return [];
  const { system, user } = buildGenerationPrompt(topic, PER_TOPIC);
  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    const questions = parseQuestions(raw, topic);
    if (questions.length === 0) return [];
    if (harden && (byok || tryConsumeLlmCall())) {
      return hardenQuestions(questions, topic, getLlmConfig(byokKey || undefined));
    }
    return questions;
  } catch {
    return [];
  }
}

function topUpFromSeed(have: Question[], need: number): Question[] {
  if (have.length >= need) return have.slice(0, need);
  const haveIds = new Set(have.map((q) => q.id));
  const pool = shuffle(
    SEED_QUESTIONS.filter(
      (q) => FIELD_TOPICS.includes(q.topic) && !haveIds.has(q.id),
    ),
  );
  return [...have, ...pool].slice(0, need);
}

export async function POST(req: Request) {
  // BYOK bypasses the access gate and daily cap (user funds their own calls).
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Lever 2 hardening pass is on by default; callers may opt out for speed.
  let harden = true;
  try {
    const body = (await req.json()) as { harden?: boolean };
    harden = body?.harden !== false;
  } catch {
    // no body / not JSON -> keep default (harden on)
  }

  // Generate all topic batches in parallel.
  const batches = await Promise.all(
    FIELD_TOPICS.map((t) => generateForTopic(t, byokKey, harden)),
  );
  const generated = batches.flat();

  const liveCount = generated.length;
  const questions = shuffle(topUpFromSeed(generated, EXAM_SIZE));

  return NextResponse.json({
    questions,
    total: questions.length,
    liveCount,
    source: liveCount >= EXAM_SIZE ? "llm" : liveCount > 0 ? "mixed" : "fallback",
    durationSeconds: 40 * 60, // real exam: 40 minutes
    passMark: 15,
  });
}
