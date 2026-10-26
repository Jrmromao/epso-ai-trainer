"use client";

import { useEffect, useState } from "react";
import type { Difficulty, Question, QuestionLanguage, Topic } from "@/lib/types";
import { LANGUAGE_LABELS } from "@/lib/types";
import MockRunner from "@/components/MockRunner";
import NumericalLearn from "@/components/NumericalLearn";
import { llmHeaders } from "@/lib/userKey";
import { clearSession, loadSession, saveSession } from "@/lib/mockSessionStore";

// Topics where Language 1 (pt-PT) is relevant — reasoning tests only.
// Field MCQ is always English (Language 2 in the real exam).
const REASONING_TOPICS = new Set<Topic>(["verbal", "verbal-rc", "numerical"]);

export default function MockSession({
  topic,
  seeded,
}: {
  topic: Topic;
  seeded: Question[];
}) {
  const [questions, setQuestions] = useState<Question[]>(seeded);
  const [runKey, setRunKey] = useState(0);
  const [restored, setRestored] = useState(false);
  const [count, setCount] = useState(5);
  const [articleText, setArticleText] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [harden, setHarden] = useState(true);
  const [learnMode, setLearnMode] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  // Reasoning topics default to pt-PT (Language 1 in the real EPSO exam).
  // Field MCQ stays English (Language 2).
  const [language, setLanguage] = useState<QuestionLanguage>(
    REASONING_TOPICS.has(topic) ? "pt-PT" : "en",
  );

  const isReasoning = REASONING_TOPICS.has(topic);

  // Restore a previously generated (or in-progress) session on mount so a
  // refresh or back-navigation doesn't wipe the generated questions/answers.
  // Done in an effect (not during render) to avoid an SSR hydration mismatch —
  // the first client render matches the server (seeded), then we swap in the
  // persisted set. `restored` gates the save-effect so we don't overwrite the
  // stored run with the seeded default before restoration has happened.
  useEffect(() => {
    const persisted = loadSession(topic);
    if (persisted) {
      setQuestions(persisted.questions);
      setNotice(persisted.notice);
      setRunKey((k) => k + 1); // remount runner so it picks up its own saved run
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

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
          harden,
          difficulty,
          language: isReasoning ? language : "en",
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
        hardened?: boolean;
      };
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
        setRunKey((k) => k + 1);
        const msg =
          data.source === "fallback"
            ? `Showing seeded questions (${data.reason ?? "LLM unavailable"}).`
            : `Generated ${data.questions.length} fresh questions${
                data.hardened ? " (hardened)" : ""
              }.`;
        setNotice(msg);
        // Persist the fresh set so a refresh / back-navigation keeps it. A new
        // set starts with no run progress (the runner saves its own as it goes).
        saveSession({ topic, questions: data.questions, notice: msg });
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
    // Drop any persisted generated set / run progress for this topic.
    clearSession(topic);
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

          {/* Difficulty selector */}
          <label className="text-sm text-neutral-600">Difficulty:</label>
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Language picker — reasoning topics only */}
          {isReasoning && (
            <>
              <label className="text-sm text-neutral-600">Language:</label>
              <select
                className="rounded border border-neutral-300 px-2 py-1"
                value={language}
                onChange={(e) => setLanguage(e.target.value as QuestionLanguage)}
              >
                {(Object.entries(LANGUAGE_LABELS) as [QuestionLanguage, string][]).map(
                  ([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </>
          )}

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

        <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={harden}
            onChange={(e) => setHarden(e.target.checked)}
          />
          Harder questions — extra self-critique pass to remove easy distractors
          (slower)
        </label>

        {(topic === "ai-act" || topic === "policy") && (
          <textarea
            className="mt-3 w-full rounded border border-neutral-300 p-2 text-sm"
            rows={3}
            placeholder="Optional: paste an EU AI Act article to generate questions from it"
            value={articleText}
            onChange={(e) => setArticleText(e.target.value)}
          />
        )}

        {topic === "numerical" && (
          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={learnMode}
              onChange={(e) => setLearnMode(e.target.checked)}
            />
            Learn mode — untimed, reveal the calculation step by step (not scored)
          </label>
        )}

        {notice && <p className="mt-2 text-sm text-neutral-600">{notice}</p>}
      </div>

      {topic === "numerical" && learnMode ? (
        <NumericalLearn key={runKey} questions={questions} />
      ) : (
        <MockRunner key={runKey} topic={topic} questions={questions} />
      )}
    </div>
  );
}
