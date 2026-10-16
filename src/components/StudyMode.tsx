"use client";

import { useMemo, useState } from "react";
import type { Question, Topic } from "@/lib/types";
import { isNumerical } from "@/lib/types";
import { llmHeaders } from "@/lib/userKey";
import type { StudyContent } from "@/data/studyContent";

// Study mode for a field-knowledge topic. Three tabs:
//  - Concepts: hand-authored, accurate structured notes
//  - Flashcards: term -> definition, self-test with reveal
//  - Learn: the seed questions shown with the answer + explanation revealed
//    (untimed, for understanding — not a test)

const CHOICE_KEYS = ["A", "B", "C", "D", "E"] as const;
type Tab = "concepts" | "flashcards" | "learn";

export default function StudyMode({
  content,
  seedQuestions,
  topicLabel,
}: {
  content: StudyContent;
  seedQuestions: Question[];
  topicLabel: string;
}) {
  const [tab, setTab] = useState<Tab>("concepts");

  return (
    <div className="mt-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200">
        {([
          ["concepts", "Concepts"],
          ["flashcards", "Flashcards"],
          ["learn", "Learn questions"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px rounded-t px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border-x border-t border-neutral-200 bg-white text-neutral-900"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "concepts" && <Concepts content={content} />}
      {tab === "flashcards" && <Flashcards content={content} />}
      {tab === "learn" && <Learn questions={seedQuestions} topicLabel={topicLabel} />}
    </div>
  );
}

function Concepts({ content }: { content: StudyContent }) {
  return (
    <div className="mt-4">
      <p className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
        {content.summary}
      </p>
      <div className="mt-4 space-y-4">
        {content.concepts.map((sec, i) => {
          const advanced = sec.heading.includes("AD8-level");
          return (
            <div
              key={i}
              className={`rounded-lg border p-4 ${advanced ? "border-indigo-300 bg-indigo-50" : "border-neutral-200 bg-white"}`}
            >
              <h3 className="flex items-center gap-2 font-semibold text-neutral-900">
                {sec.heading}
                {advanced && (
                  <span className="rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    AD8
                  </span>
                )}
              </h3>
              <ul className="mt-2 space-y-2 text-sm text-neutral-700">
                {sec.points.map((p, j) => (
                  <li key={j} className="border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 text-neutral-400">•</span>
                      <span className="flex-1">{p}</span>
                    </div>
                    <ExplainButton topic={content.topic} heading={sec.heading} point={p} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <span className="font-semibold">Verify exact figures against the primary source:</span>{" "}
        {content.verifyAgainst} The exam tests precise detail (article numbers,
        thresholds, dates) — confirm these against the real text.
      </p>
    </div>
  );
}

// Per-point on-demand LLM elaboration. The hand-written point is the anchor;
// this fetches a deeper explanation, caches it (memory + localStorage so it is
// stable across visits and doesn't re-call), and labels it clearly as AI.
function ExplainButton({ topic, heading, point }: { topic: Topic; heading: string; point: string }) {
  const cacheKey = `explain:${topic}:${hashString(heading + "|" + point)}`;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(cacheKey);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function explain() {
    // Toggle visibility if we already have it.
    if (text) {
      setOpen((o) => !o);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ topic, heading, point }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not fetch explanation.");
      } else {
        setText(data.explanation);
        setOpen(true);
        try {
          window.localStorage.setItem(cacheKey, data.explanation);
        } catch {
          /* storage full / unavailable — non-fatal */
        }
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ml-5 mt-1">
      <button
        onClick={explain}
        disabled={loading}
        className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-50"
      >
        {loading ? "Thinking…" : text ? (open ? "Hide explanation" : "Show explanation") : "Explain further ↓"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && text && (
        <div className="mt-1 rounded border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-neutral-800">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              AI
            </span>
            <span className="text-[11px] text-blue-900">AI-generated elaboration — verify specifics against the primary source.</span>
          </div>
          <p className="whitespace-pre-line">{text}</p>
        </div>
      )}
    </div>
  );
}

// Small stable hash for cache keys (djb2).
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function Flashcards({ content }: { content: StudyContent }) {
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Shuffle once per mount for varied order.
  const cards = useMemo(() => {
    const a = [...content.flashcards];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, [content.flashcards]);

  const card = cards[idx];
  function next() {
    setRevealed(false);
    setIdx((i) => (i + 1) % cards.length);
  }
  function prev() {
    setRevealed(false);
    setIdx((i) => (i - 1 + cards.length) % cards.length);
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>Card {idx + 1} / {cards.length}</span>
        <span>Active recall — answer before revealing</span>
      </div>
      <button
        onClick={() => setRevealed((r) => !r)}
        className="mt-3 flex min-h-[180px] w-full flex-col items-center justify-center rounded-xl border border-neutral-300 bg-white p-6 text-center transition hover:border-neutral-900"
      >
        <span className="text-lg font-medium text-neutral-900">{card.front}</span>
        {revealed ? (
          <span className="mt-4 border-t border-neutral-200 pt-4 text-neutral-700">{card.back}</span>
        ) : (
          <span className="mt-4 text-xs text-neutral-400">(click to reveal)</span>
        )}
      </button>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={prev} className="rounded border border-neutral-300 px-4 py-2 text-sm">← Previous</button>
        <button onClick={() => setRevealed((r) => !r)} className="rounded border border-neutral-300 px-4 py-2 text-sm">
          {revealed ? "Hide" : "Reveal"}
        </button>
        <button onClick={next} className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">Next →</button>
      </div>
    </div>
  );
}

function Learn({ questions, topicLabel }: { questions: Question[]; topicLabel: string }) {
  if (questions.length === 0) {
    return <p className="mt-4 text-sm text-neutral-500">No seeded questions for {topicLabel} yet.</p>;
  }
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-neutral-500">
        Worked examples — the answer and full explanation are shown so you learn
        the reasoning. (Untimed; this is study, not a test.)
      </p>
      {questions.map((q, i) => {
        const keys = CHOICE_KEYS.filter((k) => {
          const label = q.choices[k];
          return label && label !== "-" && label !== "(unused)";
        });
        return (
          <div key={q.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <p className="whitespace-pre-line text-sm font-medium">{i + 1}. {q.stem}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {keys.map((k) => {
                const isAnswer = k === q.answer;
                return (
                  <li
                    key={k}
                    className={`rounded px-2 py-1 ${isAnswer ? "bg-green-100 font-medium text-green-900" : "text-neutral-700"}`}
                  >
                    <span className="font-semibold">{k}.</span> {q.choices[k]}
                    {isAnswer && " ✓"}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-sm text-neutral-700">
              <span className="font-semibold">Why:</span> {q.explanation}
            </p>
            {isNumerical(q) && (
              <p className="mt-1 rounded bg-neutral-50 p-2 text-sm text-neutral-800">
                <span className="font-semibold">Worked solution:</span> {q.workedSolution}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
