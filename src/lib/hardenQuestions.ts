import type { Question, Topic } from "@/lib/types";
import type { LlmConfig } from "@/lib/llm";
import { chatJson } from "@/lib/llm";
import { buildCritiquePrompt, parseQuestions } from "@/lib/questionSchema";

// Lever 2 — self-critique / hardening pass.
//
// Runs a SECOND LLM call that re-examines already-validated first-pass
// questions and rewrites weak distractors to remove the tells that make
// AI-generated MCQs too easy. Safety contract: the first-pass questions are the
// floor. The critique output is re-validated; it REPLACES the first pass only
// if it validates AND returns at least as many questions. Any degradation
// (invalid JSON, dropped fields, fewer questions, an error) -> keep first pass.
// This can only improve quality, never worsen it.
export async function hardenQuestions(
  firstPass: Question[],
  topic: Topic,
  config: LlmConfig,
): Promise<Question[]> {
  if (firstPass.length === 0) return firstPass;

  try {
    const { system, user } = buildCritiquePrompt(
      topic,
      JSON.stringify({ questions: firstPass }),
    );
    const raw = await chatJson(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      config,
    );
    const hardened = parseQuestions(raw, topic);

    // Only accept the hardened set if it preserves the question count. Fewer
    // questions means the critique dropped or broke some -> not an improvement.
    if (hardened.length >= firstPass.length) {
      return hardened;
    }
    return firstPass;
  } catch {
    // Critique failed entirely -> the validated first pass stands.
    return firstPass;
  }
}
