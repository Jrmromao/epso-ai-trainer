import { NextResponse } from "next/server";
import type { Topic } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions } from "@/lib/questionSchema";
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
  "numerical",
]);

function fallback(topic: Topic, count: number) {
  return SEED_QUESTIONS.filter((q) => q.topic === topic).slice(0, count);
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

  let body: { topic?: string; count?: number; articleText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const topic = body.topic as Topic;
  const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);

  if (!VALID_TOPICS.has(topic)) {
    return NextResponse.json({ error: "unknown topic" }, { status: 400 });
  }

  // Daily cost cap applies only to the server key. BYOK spends the user's own
  // credits, so it is not capped. Over cap (server mode) -> seeded fallback.
  if (!byok && !tryConsumeLlmCall()) {
    return NextResponse.json({
      questions: fallback(topic, count),
      source: "fallback",
      reason: "daily LLM limit reached",
    });
  }

  const { system, user } = buildGenerationPrompt(topic, count, body.articleText);

  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    const questions = parseQuestions(raw, topic);

    if (questions.length === 0) {
      // LLM returned nothing valid — degrade gracefully to seeded bank.
      return NextResponse.json({
        questions: fallback(topic, count),
        source: "fallback",
        reason: "LLM output failed validation",
      });
    }

    return NextResponse.json({ questions, source: "llm" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    return NextResponse.json({
      questions: fallback(topic, count),
      source: "fallback",
      reason: message,
    });
  }
}
