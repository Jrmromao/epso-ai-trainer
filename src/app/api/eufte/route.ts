import { NextResponse } from "next/server";
import { chatJson, getLlmConfig } from "@/lib/llm";
import { hasValidSession } from "@/lib/auth";
import { tryConsumeLlmCall } from "@/lib/rateLimit";
import { BYOK_HEADER } from "@/lib/userKey";

// EUFTE (Free-Text Essay on EU matters) — the AD8 written test.
// Assesses WRITTEN COMMUNICATION ONLY (not field knowledge, not language).
// 40 minutes, Language 2, pass mark 5/10. Evaluated against five official
// "anchors": structure, conciseness, clarity, audience/purpose fit, and use of
// the provided information.
//
// This route does two things depending on `mode`:
//  - mode "prompt": generate a background document + an assignment
//  - mode "grade":  grade a candidate's essay against the five anchors

const ANCHORS = [
  "structure", // logical organisation, intro/body/conclusion, signposting
  "conciseness", // economical, no padding, within an appropriate length
  "clarity", // clear sentences, unambiguous, easy to follow
  "audience", // adapts register and content to the stated reader and purpose
  "useOfSource", // draws on the background document rather than inventing facts
] as const;

type Anchor = (typeof ANCHORS)[number];

interface EufteGrade {
  overall: number; // 0..10
  anchors: Record<Anchor, { score: number; comment: string }>; // each 0..2
  summary: string;
  rewriteFocus: string;
}

const ASSIGNMENT_TYPES = ["briefing note", "policy summary", "analytical report"];

function buildPromptGen(): { system: string; user: string } {
  const system =
    "You are an EPSO EUFTE test author. Produce a realistic EU-matters writing " +
    "assignment for a Free-Text Essay test (AD level). Output ONLY JSON of the " +
    'form {"title":string,"background":string,"assignment":string,"audience":string,"type":string}. ' +
    "The \"background\" is a factual briefing document of 150-250 words on a " +
    "neutral EU policy topic (e.g. digital policy, environment, single market, " +
    "mobility, research funding) containing concrete facts, figures and " +
    "positions the candidate must USE. The \"assignment\" asks the candidate to " +
    "write a specific document type (briefing note, policy summary, or " +
    "analytical report) for a named \"audience\" (e.g. a Director-General, a " +
    "committee, a Commissioner) with a clear purpose. The test assesses WRITTEN " +
    "COMMUNICATION only — do not require outside knowledge beyond the background. " +
    "FACTUAL CARE (important): the briefing must be INTERNALLY CONSISTENT and " +
    "self-contained — the candidate is graded only on using what you write. To " +
    "avoid teaching wrong facts, AVOID precise, externally-falsifiable claims " +
    "you cannot be certain are correct: do NOT give exact named lists of " +
    "specific real companies/people designated under a law, exact counts of " +
    "such entities, or exact real-world dates of specific decisions. PREFER " +
    "illustrative/rounded figures and generic actors (e.g. 'several major " +
    "platforms', 'around €7 billion', 'a leading manufacturer') over precise " +
    "real-world rosters. Concrete numbers the candidate must manipulate are " +
    "fine; it is specific real-world rosters/dates that must be avoided. " +
    "No prose outside the JSON.";
  const type = ASSIGNMENT_TYPES[Math.floor(Math.random() * ASSIGNMENT_TYPES.length)];
  const user = `Generate one EUFTE assignment. Make it a ${type}. Vary the EU policy topic.`;
  return { system, user };
}

function buildGradePrompt(
  background: string,
  assignment: string,
  essay: string,
): { system: string; user: string } {
  const system =
    "You are a strict but fair EPSO EUFTE examiner. You assess WRITTEN " +
    "COMMUNICATION SKILLS ONLY — never factual knowledge and never language " +
    "proficiency/grammar as such. Grade the candidate's response against the " +
    "five official EPSO anchors, each scored 0-2 (0 = not met, 1 = partially, " +
    "2 = fully):\n" +
    "- structure: logical organisation with a clear opening, development and " +
    "conclusion; signposting.\n" +
    "- conciseness: economical and to the point; no padding; appropriate length.\n" +
    "- clarity: clear, unambiguous sentences that are easy to follow.\n" +
    "- audience: register and content adapted to the stated reader and purpose.\n" +
    "- useOfSource: draws accurately on the background document rather than " +
    "inventing facts or ignoring it.\n" +
    "The overall score is the sum of the five anchors (0-10). Pass mark is 5. " +
    "Be concrete: quote or paraphrase the candidate's text in each comment. " +
    "Output ONLY JSON of the form " +
    '{"overall":number,"anchors":{"structure":{"score":number,"comment":string},' +
    '"conciseness":{"score":number,"comment":string},"clarity":{"score":number,"comment":string},' +
    '"audience":{"score":number,"comment":string},"useOfSource":{"score":number,"comment":string}},' +
    '"summary":string,"rewriteFocus":string}. ' +
    "\"rewriteFocus\" is the single most important thing to fix next time. " +
    "No prose outside the JSON.";
  const user =
    `BACKGROUND DOCUMENT:\n${background}\n\nASSIGNMENT:\n${assignment}\n\n` +
    `CANDIDATE RESPONSE:\n${essay}\n\nGrade it against the five anchors.`;
  return { system, user };
}

function clampAnchor(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(2, Math.round(n)));
}

export async function POST(req: Request) {
  const byokKey = req.headers.get(BYOK_HEADER)?.trim() || "";
  const byok = byokKey.length > 0;

  if (!byok && !(await hasValidSession())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { mode?: string; background?: string; assignment?: string; essay?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode;

  // ---- Generate an assignment ----
  if (mode === "prompt") {
    if (!byok && !tryConsumeLlmCall()) {
      return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
    }
    const { system, user } = buildPromptGen();
    try {
      const raw = await chatJson(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        getLlmConfig(byokKey || undefined),
      );
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof parsed.background === "string" &&
        typeof parsed.assignment === "string"
      ) {
        return NextResponse.json({
          title: typeof parsed.title === "string" ? parsed.title : "EU matters essay",
          background: parsed.background,
          assignment: parsed.assignment,
          audience: typeof parsed.audience === "string" ? parsed.audience : "",
          type: typeof parsed.type === "string" ? parsed.type : "briefing note",
          source: "llm",
        });
      }
      return NextResponse.json({ error: "generation failed" }, { status: 502 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "generation failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // ---- Grade an essay ----
  if (mode === "grade") {
    const essay = (body.essay ?? "").trim();
    const background = (body.background ?? "").trim();
    const assignment = (body.assignment ?? "").trim();
    if (essay.length < 40) {
      return NextResponse.json({ error: "essay too short to grade" }, { status: 400 });
    }
    if (!byok && !tryConsumeLlmCall()) {
      return NextResponse.json({ error: "daily limit reached" }, { status: 429 });
    }
    const { system, user } = buildGradePrompt(background, assignment, essay);
    try {
      const raw = await chatJson(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        getLlmConfig(byokKey || undefined),
      );
      const parsed = JSON.parse(raw) as Partial<EufteGrade>;
      const a = parsed.anchors ?? ({} as EufteGrade["anchors"]);
      // Rebuild defensively so a malformed anchor can't crash the UI.
      const anchors = ANCHORS.reduce((acc, key) => {
        const item = (a as Record<string, { score?: unknown; comment?: unknown }>)[key] ?? {};
        acc[key] = {
          score: clampAnchor(item.score),
          comment: typeof item.comment === "string" ? item.comment : "",
        };
        return acc;
      }, {} as EufteGrade["anchors"]);
      const overall = ANCHORS.reduce((s, k) => s + anchors[k].score, 0);
      return NextResponse.json({
        overall,
        anchors,
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
        rewriteFocus: typeof parsed.rewriteFocus === "string" ? parsed.rewriteFocus : "",
        source: "llm",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "grading failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  return NextResponse.json({ error: "unknown mode" }, { status: 400 });
}
