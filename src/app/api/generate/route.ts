import { NextResponse } from "next/server";
import type { Topic } from "@/lib/types";
import { chatJson } from "@/lib/llm";
import { buildGenerationPrompt, parseQuestions } from "@/lib/questionSchema";
import { SEED_QUESTIONS } from "@/data/questions";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";

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
  if (!(await hasValidSession())) {
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

  // Daily cost cap — checked BEFORE the LLM call. Over cap -> seeded fallback.
  if (!tryConsumeLlmCall()) {
    return NextResponse.json({
      questions: fallback(topic, count),
      source: "fallback",
      reason: "daily LLM limit reached",
    });
  }

  const { system, user } = buildGenerationPrompt(topic, count, body.articleText);

  try {
    const raw = await chatJson([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);
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
