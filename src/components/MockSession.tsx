"use client";

import { useState } from "react";
import type { Question, Topic } from "@/lib/types";
import MockRunner from "@/components/MockRunner";
import { llmHeaders } from "@/lib/userKey";

// Client wrapper around MockRunner. Lets the user run the seeded bank OR
// generate fresh questions via /api/generate (spec AC5). Keyed remount
// restarts the runner cleanly when the question set changes.

export default function MockSession({
  topic,
  seeded,
}: {
  topic: Topic;
  seeded: Question[];
}) {
  const [questions, setQuestions] = useState<Question[]>(seeded);
  const [runKey, setRunKey] = useState(0);
  const [count, setCount] = useState(5);
  const [articleText, setArticleText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          topic,
          count,
          articleText: articleText.trim() || undefined,
        }),
      });
      if (res.status === 401) {
        setNotice(
          "Locked — enter your access code, or set your own key (BYOK), on the home page.",
        );
        return;
      }
      const data = (await res.json()) as {
        questions?: Question[];
        source?: string;
        reason?: string;
      };
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setRunKey((k) => k + 1);
        setNotice(
          data.source === "fallback"
            ? `Showing seeded questions (${data.reason ?? "LLM unavailable"}).`
            : `Generated ${data.questions.length} fresh questions.`,
        );
      } else {
        setNotice("No questions returned.");
      }
    } catch {
      setNotice("Generation failed — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  function resetToSeed() {
    setQuestions(seeded);
    setRunKey((k) => k + 1);
    setNotice(null);
  }

  return (
    <div>
      <div className="mt-4 rounded-lg border border-neutral-300 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-neutral-600">Questions:</label>
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={loading}
            className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40"
          >
            {loading ? "Generating…" : "Generate fresh questions"}
          </button>
          <button
            onClick={resetToSeed}
            className="rounded border border-neutral-300 px-3 py-1"
          >
            Use seeded bank
          </button>
        </div>

        {(topic === "ai-act" || topic === "policy") && (
          <textarea
            className="mt-3 w-full rounded border border-neutral-300 p-2 text-sm"
            rows={3}
            placeholder="Optional: paste an EU AI Act article to generate questions from it"
            value={articleText}
            onChange={(e) => setArticleText(e.target.value)}
          />
        )}

        {notice && <p className="mt-2 text-sm text-neutral-600">{notice}</p>}
      </div>

      <MockRunner key={runKey} topic={topic} questions={questions} />
    </div>
  );
}
