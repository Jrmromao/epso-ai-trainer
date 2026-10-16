"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { llmHeaders } from "@/lib/userKey";

// EUFTE essay runner. Mirrors the real AD8 written test:
// - a background document + an assignment (briefing note / policy summary / report)
// - a 40-minute timer
// - a free-text area with a live word count
// - AI grading against the five official EPSO anchors (0-10, pass 5)

const DURATION = 40 * 60; // 40 minutes

const ANCHOR_LABELS: Record<string, string> = {
  structure: "Structure",
  conciseness: "Conciseness",
  clarity: "Clarity",
  audience: "Audience & purpose",
  useOfSource: "Use of the source",
};

interface Prompt {
  title: string;
  background: string;
  assignment: string;
  audience: string;
  type: string;
}

interface Grade {
  overall: number;
  anchors: Record<string, { score: number; comment: string }>;
  summary: string;
  rewriteFocus: string;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function EufteRunner() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [essay, setEssay] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(DURATION);
  const [running, setRunning] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [grading, setGrading] = useState(false);
  const [learnMode, setLearnMode] = useState(false);
  const submittedRef = useRef(false);

  const words = essay.trim() ? essay.trim().split(/\s+/).length : 0;

  const grateEssay = useCallback(async () => {
    if (submittedRef.current || !prompt) return;
    submittedRef.current = true;
    setRunning(false);
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/eufte", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          mode: "grade",
          background: prompt.background,
          assignment: prompt.assignment,
          essay,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error === "essay too short to grade" ? "Write at least a few sentences before submitting." : "Grading unavailable — check your access/key and try again.");
        submittedRef.current = false;
        return;
      }
      setGrade((await res.json()) as Grade);
    } catch {
      setError("Grading failed — check your connection.");
      submittedRef.current = false;
    } finally {
      setGrading(false);
    }
  }, [prompt, essay]);

  // Countdown; auto-submit when it hits zero. Learn mode is untimed.
  useEffect(() => {
    if (!running || learnMode) return;
    if (secondsLeft <= 0) { grateEssay(); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, secondsLeft, grateEssay, learnMode]);

  async function newPrompt(learn = false) {
    setLoading(true);
    setError(null);
    setGrade(null);
    setEssay("");
    setLearnMode(learn);
    setSecondsLeft(DURATION);
    submittedRef.current = false;
    try {
      const res = await fetch("/api/eufte", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ mode: "prompt" }),
      });
      if (!res.ok) {
        setError("Could not generate an assignment — enter your access code or key first.");
        return;
      }
      setPrompt((await res.json()) as Prompt);
      setRunning(true);
    } catch {
      setError("Failed to load — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Start screen ----
  if (!prompt) {
    return (
      <div className="mt-6">
        <p className="text-neutral-600">
          The EUFTE (Free-Text Essay on EU matters) assesses{" "}
          <strong>written communication only</strong> &mdash; not field
          knowledge, not language. You get a background document and must write a
          structured response (briefing note, policy summary or analytical
          report) in <strong>40 minutes</strong>. Pass mark 5/10.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Graded against the five official EPSO anchors: structure,
          conciseness, clarity, audience &amp; purpose fit, and use of the
          source document.
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => newPrompt(false)}
            disabled={loading}
            className="rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
          >
            {loading ? "Preparing…" : "Start a timed EUFTE (40 min)"}
          </button>
          <button
            onClick={() => newPrompt(true)}
            disabled={loading}
            className="rounded border border-neutral-900 px-5 py-2 font-medium text-neutral-900 hover:bg-neutral-100 disabled:opacity-40"
          >
            {loading ? "Preparing…" : "Learn mode (untimed + guidance)"}
          </button>
        </div>
        <p className="mt-3 text-sm text-neutral-500">
          Learn mode removes the timer and shows the marking anchors and a memo
          template while you write — build the technique first, then test it
          under time.
        </p>
      </div>
    );
  }

  // ---- Grade screen ----
  if (grade) {
    const passed = grade.overall >= 5;
    return (
      <div className="mt-6">
        <h2 className="text-2xl font-bold">
          {grade.overall}/10{" "}
          <span className={passed ? "text-green-700" : "text-red-600"}>
            ({passed ? "PASS" : "BELOW PASS"} — pass mark 5)
          </span>
        </h2>
        {grade.summary && <p className="mt-2 text-neutral-700">{grade.summary}</p>}

        <div className="mt-4 space-y-2">
          {Object.entries(grade.anchors).map(([key, a]) => (
            <div key={key} className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{ANCHOR_LABELS[key] ?? key}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    a.score === 2
                      ? "bg-green-100 text-green-800"
                      : a.score === 1
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                  }`}
                >
                  {a.score}/2
                </span>
              </div>
              {a.comment && <p className="mt-1 text-sm text-neutral-600">{a.comment}</p>}
            </div>
          ))}
        </div>

        {grade.rewriteFocus && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">Fix this next time:</span> {grade.rewriteFocus}
          </div>
        )}

        <details className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Your response</summary>
          <p className="mt-2 whitespace-pre-wrap text-neutral-700">{essay}</p>
        </details>

        <div className="mt-4 flex gap-2">
          <button onClick={() => newPrompt(learnMode)} className="rounded bg-neutral-900 px-4 py-2 text-white">
            New EUFTE
          </button>
          <a href="/" className="rounded border border-neutral-300 px-4 py-2">
            Back to topics
          </a>
        </div>
      </div>
    );
  }

  // ---- Writing screen ----
  const timePct = (secondsLeft / DURATION) * 100;
  const barColor = timePct <= 15 ? "bg-red-500" : timePct <= 33 ? "bg-amber-500" : "bg-green-600";

  return (
    <div className="mt-6">
      {/* Timer (hidden in learn mode — untimed) */}
      {learnMode ? (
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span className="font-medium text-neutral-800">{prompt.title}</span>
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
            Learn mode · untimed
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-neutral-500">
            <span className="font-medium text-neutral-800">{prompt.title}</span>
            <span className={`font-semibold tabular-nums ${timePct <= 15 ? "text-red-600" : "text-neutral-700"}`}>
              {fmt(secondsLeft)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${barColor}`}
              style={{ width: `${timePct}%` }}
            />
          </div>
        </>
      )}

      {/* Learn-mode guidance: the anchors + a memo template, shown while writing */}
      {learnMode && (
        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm">
          <p className="font-semibold text-indigo-900">How this is marked — hit all five anchors (2 pts each):</p>
          <ul className="mt-2 space-y-1 text-neutral-700">
            <li><span className="font-medium">Structure:</span> clear opening → development → close; signpost with headings/numbering.</li>
            <li><span className="font-medium">Conciseness:</span> cut padding; compress the source into short analytical points, don&apos;t restate it verbatim.</li>
            <li><span className="font-medium">Clarity:</span> short, unambiguous sentences; one idea each.</li>
            <li><span className="font-medium">Audience &amp; purpose:</span> formal register for the named reader; give decisions/recommendations, not background.</li>
            <li><span className="font-medium">Use of source:</span> draw ONLY on the background — don&apos;t invent facts or add points it doesn&apos;t contain.</li>
          </ul>
          <p className="mt-3 font-semibold text-indigo-900">Memo template you can follow:</p>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-white/70 p-2 text-xs text-neutral-700">{`TO: [named audience]
FROM: [your role]
SUBJECT: [specific, under ~10 words]

1. [First task — e.g. key provisions] — 2-4 tight points
2. [Second task — e.g. analysis] — benefits / challenges
3. [Third task — recommendations] — 3+ DISTINCT, actionable measures

[One-line close if the task implies a decision]`}</pre>
          <p className="mt-2 text-xs text-indigo-900">
            Tip: vary your recommendations (don&apos;t give two of the same kind), and
            show judgement by noting a trade-off or risk. That&apos;s the gap between 8 and 10.
          </p>
        </div>
      )}

      {/* Background + assignment */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Background document
        </p>
        <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          AI-generated briefing for writing practice — treat its facts as given
          for this task only; do NOT rely on them as exam-accurate.
        </p>
        <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{prompt.background}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Assignment {prompt.type ? `· ${prompt.type}` : ""}
          {prompt.audience ? ` · for ${prompt.audience}` : ""}
        </p>
        <p className="mt-1 text-sm font-medium text-neutral-800">{prompt.assignment}</p>
      </div>

      {/* Writing area */}
      <textarea
        className="mt-4 h-80 w-full rounded-lg border border-neutral-300 p-3 text-sm leading-relaxed"
        placeholder="Write your response here…"
        value={essay}
        onChange={(e) => setEssay(e.target.value)}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
        <span>{words} word{words === 1 ? "" : "s"}</span>
        <span>Written communication only — structure, clarity, concision, audience, use of source.</span>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={grateEssay}
        disabled={grading}
        className="mt-3 rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
      >
        {grading ? "Grading…" : "Submit for grading"}
      </button>
    </div>
  );
}
