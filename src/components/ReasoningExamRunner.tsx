"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChoiceKey, Difficulty, Question, QuestionLanguage } from "@/lib/types";
import { type AbstractDifficulty, type AbstractQuestion, generateAbstractQuestion } from "@/lib/abstractReasoning";
import AbstractPanel from "@/components/AbstractPanel";
import QuestionTableView from "@/components/QuestionTableView";
import { SECONDS_PER_QUESTION } from "@/lib/timing";
import { llmHeaders } from "@/lib/userKey";

// Full EPSO Part 1 reasoning mock: 10 verbal + 10 numerical + 10 abstract,
// each section with its own EPSO-accurate per-question budget. Difficulty
// selectable. Verbal/numerical come from the LLM; abstract is generated
// locally (no LLM). A combined per-section report at the end.

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];
const OPTION_LETTERS = ["A", "B", "C", "D", "E"];
// Official notice (Quadro 3): verbal 20Q/35min, numerical 10Q/20min, abstract 10Q/10min.
const SECTION_COUNT: Record<Section, number> = { verbal: 20, numerical: 10, abstract: 10 };

type Section = "verbal" | "numerical" | "abstract";
const SECTION_ORDER: Section[] = ["verbal", "numerical", "abstract"];
const SECTION_LABEL: Record<Section, string> = {
  verbal: "Verbal Reasoning",
  numerical: "Numerical Reasoning",
  abstract: "Abstract Reasoning",
};
const SECTION_BUDGET: Record<Section, number> = {
  verbal: SECONDS_PER_QUESTION.verbal,
  numerical: SECONDS_PER_QUESTION.numerical,
  abstract: SECONDS_PER_QUESTION.abstract,
};
// Official notice (Quadro 3): each section has its OWN time limit — you cannot
// borrow time between sections. Verbal 35 min, numerical 20 min, abstract 10 min.
const SECTION_DURATION: Record<Section, number> = {
  verbal: 35 * 60,
  numerical: 20 * 60,
  abstract: 10 * 60,
};

function fmt(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ReasoningExamRunner() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState<QuestionLanguage>("pt-PT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // generated content
  const [verbal, setVerbal] = useState<Question[]>([]);
  const [numerical, setNumerical] = useState<Question[]>([]);
  const [abstract, setAbstract] = useState<AbstractQuestion[]>([]);

  // run state
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [practice, setPractice] = useState(false); // live feedback when true
  const [sectionIdx, setSectionIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  // Answers stored per question: key `${sectionIdx}:${qIdx}` -> option index.
  const [answers, setAnswers] = useState<Record<string, number>>({});
  // Per-section countdown (each section has its own time limit; one-way) +
  // per-question elapsed timer (counts up, a soft pace indicator).
  const [sectionLeft, setSectionLeft] = useState(0);
  const [qElapsed, setQElapsed] = useState(0);

  const section = SECTION_ORDER[sectionIdx];
  const perQBudget = SECTION_BUDGET[section];
  const sectionQuestions = section === "verbal" ? verbal : section === "numerical" ? numerical : abstract;
  const totalInSection = sectionQuestions.length;
  const key = `${sectionIdx}:${qIdx}`;
  const chosen = answers[key] ?? null;

  function pick(i: number) {
    setAnswers((a) => ({ ...a, [`${sectionIdx}:${qIdx}`]: i }));
  }

  // Correct option index for an arbitrary question in a section.
  function correctIndexFor(sec: Section, idx: number): number {
    if (sec === "abstract") return abstract[idx]?.answerIndex ?? -1;
    const q = (sec === "verbal" ? verbal : numerical)[idx];
    if (!q) return -1;
    const keys = CHOICE_KEYS.filter((k) => {
      const label = q.choices[k];
      return label && label !== "-" && label !== "(unused)";
    });
    return keys.indexOf(q.answer);
  }

  // Move to the next section (or finish). Resets the new section's clock.
  const nextSection = useCallback(() => {
    if (sectionIdx + 1 < SECTION_ORDER.length) {
      const ns = sectionIdx + 1;
      setSectionIdx(ns);
      setQIdx(0);
      setQElapsed(0);
      setSectionLeft(SECTION_DURATION[SECTION_ORDER[ns]]);
    } else {
      setFinished(true);
    }
  }, [sectionIdx]);

  // Section countdown; hitting zero advances to the next section (one-way).
  useEffect(() => {
    if (!started || finished) return;
    if (sectionLeft <= 0) {
      nextSection();
      return;
    }
    const t = setTimeout(() => setSectionLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sectionLeft, started, finished, nextSection]);

  // Per-question elapsed timer (counts up; soft pace indicator). Resets when
  // the question changes.
  useEffect(() => {
    if (!started || finished) return;
    const t = setTimeout(() => setQElapsed((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [qElapsed, started, finished]);

  // Reset the per-question elapsed timer whenever the question changes.
  useEffect(() => {
    setQElapsed(0);
  }, [sectionIdx, qIdx]);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      // abstract locally (10 questions per the notice)
      const abs = Array.from({ length: SECTION_COUNT.abstract }, () =>
        generateAbstractQuestion(difficulty as AbstractDifficulty),
      );
      // verbal + numerical from the API
      const res = await fetch("/api/reasoning-exam", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ difficulty, language, harden: true }),
      });
      if (res.status === 401) {
        setError("Locked — enter your access code or key on the home page first.");
        return;
      }
      const data = (await res.json()) as { verbal?: Question[]; numerical?: Question[] };
      const v = data.verbal ?? [];
      setVerbal(v);
      setNumerical(data.numerical ?? []);
      setAbstract(abs);
      setAnswers({});
      setSectionIdx(0);
      setQIdx(0);
      setQElapsed(0);
      setSectionLeft(SECTION_DURATION.verbal);
      setStarted(true);
      setFinished(false);
    } catch {
      setError("Failed to build the exam — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Start screen ----
  if (!started) {
    return (
      <div className="mt-6">
        <p className="text-neutral-600">
          A full EPSO Part 1 mock: <strong>20 verbal · 10 numerical · 10 abstract</strong>{" "}
          (40 questions), timed to the official notice. Verbal &amp; numerical are
          generated; abstract is generated locally. A per-section report at the end.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Verbal 20Q/35min · Numerical 10Q/20min · Abstract 10Q/10min.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Difficulty:
            <select
              className="rounded border border-neutral-300 px-2 py-1"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Language (verbal/numerical):
            <select
              className="rounded border border-neutral-300 px-2 py-1"
              value={language}
              onChange={(e) => setLanguage(e.target.value as QuestionLanguage)}
            >
              <option value="pt-PT">Português (PT)</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
          <span>
            <strong>Practice mode</strong> — tells you immediately whether each answer
            is right or wrong, with the explanation. Off = exam mode (no feedback
            until the end).
          </span>
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={loading}
          className="mt-5 rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
        >
          {loading ? "Building 40-question mock…" : "Start reasoning mock"}
        </button>
      </div>
    );
  }

  // ---- Result screen ----
  if (finished) {
    const scoreOf = (sIdx: number): number => {
      const sec = SECTION_ORDER[sIdx];
      const qs = sec === "verbal" ? verbal : sec === "numerical" ? numerical : abstract;
      let n = 0;
      for (let i = 0; i < qs.length; i++) {
        if ((answers[`${sIdx}:${i}`] ?? -1) === correctIndexFor(sec, i)) n++;
      }
      return n;
    };
    const vScore = scoreOf(0), nScore = scoreOf(1), aScore = scoreOf(2);
    const totalCorrect = vScore + nScore + aScore;
    const verbalPass = vScore >= 10; // 10/20
    const combinedPass = nScore + aScore >= 10; // combined 10/20
    const maxOf = [20, 10, 10];
    return (
      <div className="mt-6">
        <h2 className="text-2xl font-bold">Reasoning mock complete</h2>
        <p className="mt-1 text-neutral-600">Overall: {totalCorrect}/40</p>
        <div className="mt-4 space-y-2">
          {SECTION_ORDER.map((s, i) => (
            <div key={s} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
              <span className="font-medium">{SECTION_LABEL[s]}</span>
              <span className="font-semibold tabular-nums">{[vScore, nScore, aScore][i]}/{maxOf[i]}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          <div className={`rounded-lg border p-3 text-sm ${verbalPass ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
            <span className="font-semibold">Verbal gate (needs 10/20):</span> {vScore}/20 — {verbalPass ? "PASS" : "BELOW PASS"}
          </div>
          <div className={`rounded-lg border p-3 text-sm ${combinedPass ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
            <span className="font-semibold">Numerical + Abstract gate (combined, needs 10/20):</span> {nScore + aScore}/20 — {combinedPass ? "PASS" : "BELOW PASS"}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setStarted(false)} className="rounded bg-neutral-900 px-4 py-2 text-white">
            New mock
          </button>
          <a href="/" className="rounded border border-neutral-300 px-4 py-2">Back to topics</a>
        </div>
      </div>
    );
  }

  // ---- Running: current question with free navigation within the section ----
  const answeredInSection = Array.from({ length: totalInSection }, (_, i) => answers[`${sectionIdx}:${i}`] !== undefined);
  const answeredCount = answeredInSection.filter(Boolean).length;
  const isLastSection = sectionIdx + 1 >= SECTION_ORDER.length;
  // Live feedback (practice mode only): once an answer is picked, is it correct?
  const correctIdx = correctIndexFor(section, qIdx);
  const showFeedback = practice && chosen !== null;
  const sectionTotal = SECTION_DURATION[section];

  return (
    <div className="mt-6">
      {/* Header: section + per-question timer */}
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          <span className="font-semibold text-neutral-800">{SECTION_LABEL[section]}</span>{" "}
          · Q {qIdx + 1}/{totalInSection} · {answeredCount} answered
        </span>
        <div className="flex items-center gap-3">
          {practice && (
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">Practice</span>
          )}
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">Section {sectionIdx + 1}/3</span>
        </div>
      </div>

      {/* Two timers: THIS SECTION countdown (its own limit) + per-question elapsed */}
      <div className="mt-2 flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 text-sm">
        <div>
          <div className="text-xs text-neutral-500">{SECTION_LABEL[section]} time left</div>
          <div className={`text-lg font-bold tabular-nums ${sectionLeft <= 30 ? "text-red-600" : sectionLeft <= 90 ? "text-amber-600" : "text-green-700"}`}>
            {fmt(sectionLeft)} <span className="text-xs font-normal text-neutral-400">/ {fmt(sectionTotal)}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">This question (target {perQBudget}s)</div>
          <div className={`text-lg font-bold tabular-nums ${qElapsed > perQBudget * 1.5 ? "text-red-600" : qElapsed >= perQBudget ? "text-amber-600" : "text-green-700"}`}>
            {qElapsed}s
          </div>
        </div>
      </div>

      {/* Question body */}
      <div className="mt-4">
        {section === "abstract" ? (
          <AbstractQ q={abstract[qIdx]} chosen={chosen} onPick={pick} revealIdx={showFeedback ? correctIdx : null} />
        ) : (
          <McqQ q={(section === "verbal" ? verbal : numerical)[qIdx]} chosen={chosen} onPick={pick} revealIdx={showFeedback ? correctIdx : null} />
        )}
      </div>

      {/* Live feedback in practice mode */}
      {showFeedback && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${chosen === correctIdx ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
          <span className="font-semibold">
            {chosen === correctIdx ? "✓ Correct" : `✗ Incorrect — answer is ${OPTION_LETTERS[correctIdx]}`}
          </span>
          {section !== "abstract" && (() => {
            const q = (section === "verbal" ? verbal : numerical)[qIdx];
            return q?.explanation ? <p className="mt-1 text-neutral-700">{q.explanation}</p> : null;
          })()}
          {section === "abstract" && abstract[qIdx]?.ruleSummary && (
            <p className="mt-1 text-neutral-700">{abstract[qIdx].ruleSummary}</p>
          )}
        </div>
      )}

      {/* Prev / Next navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={() => setQIdx((i) => Math.max(0, i - 1))}
          disabled={qIdx === 0}
          className="rounded border border-neutral-300 px-4 py-2 disabled:opacity-40"
        >
          ← Previous
        </button>
        {qIdx + 1 < totalInSection ? (
          <button onClick={() => setQIdx((i) => i + 1)} className="rounded bg-neutral-900 px-4 py-2 text-white">
            Next →
          </button>
        ) : (
          <button onClick={nextSection} className="rounded bg-red-600 px-4 py-2 text-white">
            {isLastSection ? "Finish exam" : "Finish section →"}
          </button>
        )}
      </div>

      {/* Question jump grid (within the current section) */}
      <div className="mt-5 grid grid-cols-10 gap-1">
        {Array.from({ length: totalInSection }, (_, i) => (
          <button
            key={i}
            onClick={() => setQIdx(i)}
            className={`h-8 rounded text-xs ${
              i === qIdx
                ? "bg-neutral-900 text-white"
                : answeredInSection[i]
                  ? "bg-green-100 text-green-800"
                  : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Navigate freely within this section. Finishing the section (or the timer
        reaching zero) locks it and moves on — you cannot return, as in the real exam.
      </p>
    </div>
  );
}

// MCQ question (verbal / numerical). revealIdx!=null shows correct/wrong colours.
function McqQ({ q, chosen, onPick, revealIdx }: { q: Question; chosen: number | null; onPick: (i: number) => void; revealIdx: number | null }) {
  if (!q) return null;
  const keys = CHOICE_KEYS.filter((k) => {
    const label = q.choices[k];
    return label && label !== "-" && label !== "(unused)";
  });
  const revealed = revealIdx !== null;
  return (
    <div>
      {q.table && <QuestionTableView table={q.table} />}
      <p className="mt-2 whitespace-pre-line font-medium">{q.stem}</p>
      <div className="mt-3 space-y-2">
        {keys.map((k, i) => {
          let cls = "border-neutral-300 bg-white hover:border-neutral-900";
          if (revealed && i === revealIdx) cls = "border-green-500 bg-green-50";
          else if (revealed && i === chosen) cls = "border-red-500 bg-red-50";
          else if (!revealed && chosen === i) cls = "border-neutral-900 ring-2 ring-neutral-900";
          return (
            <button
              key={k}
              disabled={revealed}
              onClick={() => onPick(i)}
              className={`block w-full rounded border p-3 text-left transition ${cls}`}
            >
              <span className="font-semibold">{OPTION_LETTERS[i]}.</span> {q.choices[k]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Abstract question. revealIdx!=null shows correct/wrong colours.
function AbstractQ({ q, chosen, onPick, revealIdx }: { q: AbstractQuestion; chosen: number | null; onPick: (i: number) => void; revealIdx: number | null }) {
  if (!q) return null;
  const revealed = revealIdx !== null;
  return (
    <div>
      <p className="font-medium">Which figure completes the pattern?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {q.sequence.map((p, i) => (
          <AbstractPanel key={i} panel={p} size={96} />
        ))}
        <div className="flex h-[96px] w-[96px] items-center justify-center rounded border-2 border-dashed border-neutral-400 text-2xl text-neutral-400">
          ?
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {q.options.map((p, i) => {
          let cls = "border-neutral-300";
          if (revealed && i === revealIdx) cls = "border-green-500 ring-2 ring-green-500";
          else if (revealed && i === chosen) cls = "border-red-500 ring-2 ring-red-500";
          else if (!revealed && chosen === i) cls = "border-neutral-900 ring-2 ring-neutral-900";
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => onPick(i)}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${cls}`}
            >
              <span className="text-xs font-semibold text-neutral-600">{OPTION_LETTERS[i]}</span>
              <AbstractPanel panel={p} size={82} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
