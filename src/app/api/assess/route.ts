import { NextResponse } from "next/server";
import {
  type AnswerRecord,
  type AssessmentResult,
  type Topic,
  TOPIC_LABELS,
} from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// Deterministic fallback: derive weak topics straight from the score data.
// Used when the LLM is unavailable — never leaves the user without a report.
function deterministicAssessment(records: AnswerRecord[]): AssessmentResult {
  const byTopic = new Map<Topic, { correct: number; total: number }>();
  for (const r of records) {
    const agg = byTopic.get(r.topic) ?? { correct: 0, total: 0 };
    agg.total += 1;
    if (r.isCorrect) agg.correct += 1;
    byTopic.set(r.topic, agg);
  }

  const weakTopics: Topic[] = [];
  for (const [topic, agg] of byTopic) {
    if (agg.correct / agg.total < 0.7) weakTopics.push(topic);
  }

  const total = records.length;
  const correct = records.filter((r) => r.isCorrect).length;
  const summary = `You scored ${correct}/${total}. ${
    weakTopics.length
      ? "Focus on: " + weakTopics.map((t) => TOPIC_LABELS[t]).join(", ") + "."
      : "Solid across the topics attempted."
  }`;

  return {
    weakTopics,
    summary,
    studyNext: weakTopics.map(
      (t) => `Revise ${TOPIC_LABELS[t]} and re-run a mock on it.`,
    ),
  };
}

function buildAssessPrompt(records: AnswerRecord[]): { system: string; user: string } {
  const system =
    "You are an EPSO study coach. Given a candidate's MCQ results, identify weak " +
    "topics and give concise, actionable study guidance. Output ONLY JSON of the form " +
    '{"weakTopics":string[],"summary":string,"studyNext":string[]}. ' +
    "weakTopics must be drawn from the topic ids provided. No prose outside JSON.";
  const rows = records
    .map(
      (r) =>
        `topic=${r.topic} correct=${r.isCorrect ? "yes" : "no"} (picked ${r.chosen}, answer ${r.correct})`,
    )
    .join("\n");
  const user = `Results:\n${rows}\n\nGive the weak-topic report.`;
  return { system, user };
}

export async function POST(req: Request) {
  // BYOK bypasses the access gate and daily cap, consistent with generate/exam.
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { results?: AnswerRecord[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const records = Array.isArray(body.results) ? body.results : [];
  if (records.length === 0) {
    return NextResponse.json({ error: "no results provided" }, { status: 400 });
  }

  // Over the daily cap (server mode only) -> deterministic (no-LLM) report.
  if (!byok && !tryConsumeLlmCall()) {
    return NextResponse.json({
      ...deterministicAssessment(records),
      source: "fallback",
    });
  }

  const { system, user } = buildAssessPrompt(records);

  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    const parsed = JSON.parse(raw) as Partial<AssessmentResult>;

    // Validate the LLM shape; fall back if malformed.
    if (
      Array.isArray(parsed.weakTopics) &&
      typeof parsed.summary === "string" &&
      Array.isArray(parsed.studyNext)
    ) {
      return NextResponse.json({ ...parsed, source: "llm" });
    }
    return NextResponse.json({
      ...deterministicAssessment(records),
      source: "fallback",
    });
  } catch {
    return NextResponse.json({
      ...deterministicAssessment(records),
      source: "fallback",
    });
  }
}
