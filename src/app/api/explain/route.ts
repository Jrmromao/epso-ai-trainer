import { NextResponse } from "next/server";
import type { Topic } from "@/lib/types";
import { TOPIC_LABELS } from "@/lib/types";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// On-demand "Explain further" tutor. Elaborates on a SINGLE hand-written
// concept point. The hand-written note remains the source of truth; this is a
// depth-on-demand layer, clearly labelled as AI in the UI. Output is prose in a
// JSON wrapper so we can reuse the JSON-mode client.

const FIELD_TOPICS = new Set<Topic>([
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
]);

export async function POST(req: Request) {
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { topic?: string; heading?: string; point?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const topic = body.topic as Topic;
  const heading = (body.heading ?? "").toString().slice(0, 200).trim();
  const point = (body.point ?? "").toString().slice(0, 600).trim();

  if (!FIELD_TOPICS.has(topic)) {
    return NextResponse.json({ error: "unknown topic" }, { status: 400 });
  }
  if (!point) {
    return NextResponse.json({ error: "missing point" }, { status: 400 });
  }

  if (!byok && !tryConsumeLlmCall()) {
    return NextResponse.json(
      { error: "Daily AI limit reached — add your own API key to continue." },
      { status: 429 },
    );
  }

  const topicLabel = TOPIC_LABELS[topic] ?? topic;

  const system =
    "You are an expert tutor preparing a candidate for the EPSO AD8 (grade 8, " +
    "senior) Artificial Intelligence competition field-knowledge test. Elaborate " +
    "on ONE concept point at a senior, precise level. Rules: (1) Be accurate and " +
    "specific — this is a ranking exam. (2) If you state a figure, article number, " +
    "threshold or date and you are NOT certain it is exact, say so explicitly " +
    "('verify the exact figure') rather than inventing precision. (3) Give a " +
    "concrete example or a contrast with a commonly-confused concept. (4) Be " +
    "concise: 120-200 words, plain prose, no markdown headers. (5) Focus on what " +
    "distinguishes a strong AD8 candidate: nuance, edge cases, why it matters. " +
    'Respond as JSON: {"explanation": string}.';

  const user =
    `Topic: ${topicLabel}.\n` +
    (heading ? `Section: ${heading}.\n` : "") +
    `Concept point to explain further:\n"${point}"\n\n` +
    "Elaborate for an AD8 candidate.";

  try {
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      getLlmConfig(byokKey || undefined),
    );
    let explanation = "";
    try {
      const parsed = JSON.parse(raw) as { explanation?: unknown };
      if (typeof parsed.explanation === "string") explanation = parsed.explanation.trim();
    } catch {
      // Model didn't return clean JSON — use the raw text if it's plain prose.
      explanation = raw.trim();
    }
    if (!explanation) {
      return NextResponse.json({ error: "empty explanation" }, { status: 502 });
    }
    return NextResponse.json({ explanation, source: "ai" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
