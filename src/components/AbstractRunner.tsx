"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AbstractDifficulty,
  type AbstractQuestion,
  generateAbstractQuestion,
} from "@/lib/abstractReasoning";
import AbstractPanel from "@/components/AbstractPanel";
import QuestionTimer from "@/components/QuestionTimer";
import { SECONDS_PER_QUESTION } from "@/lib/timing";

// Abstract reasoning practice runner. Fully deterministic — no LLM, no network.
// Real EPSO abstract timing is 60s per question (10 questions / 10 minutes).

const SECONDS_PER_Q = SECONDS_PER_QUESTION.abstract;
const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

const DIFFICULTY_BADGE: Record<AbstractDifficulty, { label: string; cls: string }> = {
  easy:    { label: "Easy",    cls: "bg-green-100 text-green-800 border border-green-200" },
  medium:  { label: "Medium",  cls: "bg-amber-100 text-amber-800 border border-amber-200" },
  hard:    { label: "Hard",    cls: "bg-red-100 text-red-800 border border-red-200" },
  extreme: { label: "Extreme", cls: "bg-purple-100 text-purple-800 border border-purple-200" },
};

export default function AbstractRunner() {
  const [difficulty, setDifficulty] = useState<AbstractDifficulty>("medium");
  const [count] = useState(10);
  const [questions, setQuestions] = useState<AbstractQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, answered: 0 });
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_Q);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  // Strict (exam) mode: when the 60s runs out, the question is auto-locked and
  // after a brief reveal it auto-advances — you cannot linger past the limit.
  const [strict, setStrict] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  const current = questions[index];

  function start(d: AbstractDifficulty) {
    const qs = Array.from({ length: count }, () => generateAbstractQuestion(d));
    setQuestions(qs);
    setDifficulty(d);
    setIndex(0);
    setChosen(null);
    setRevealed(false);
    setTimedOut(false);
    setScore({ correct: 0, answered: 0 });
    setSecondsLeft(SECONDS_PER_Q);
    setStarted(true);
    setFinished(false);
  }

  const next = useCallback(() => {
    setChosen(null);
    setRevealed(false);
    setTimedOut(false);
    setSecondsLeft(SECONDS_PER_Q);
    setIndex((i) => {
      if (i + 1 >= questions.length) {
        setFinished(true);
        return i;
      }
      return i + 1;
    });
  }, [questions.length]);

  const submit = useCallback(
    (pick: number | null, viaTimeout = false) => {
      if (revealed || !current) return;
      setChosen(pick);
      setRevealed(true);
      if (viaTimeout) setTimedOut(true);
      setScore((s) => ({
        correct: s.correct + (pick === current.answerIndex ? 1 : 0),
        answered: s.answered + 1,
      }));
    },
    [revealed, current],
  );

  // Per-question countdown. Hitting 0 auto-submits whatever is selected (or a
  // skip) and flags it as a timeout.
  useEffect(() => {
    if (!started || finished || revealed || !current) return;
    if (secondsLeft <= 0) { submit(chosen, true); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, started, finished, revealed, current, chosen, submit]);

  // Strict (exam) mode: once revealed by a TIMEOUT, auto-advance after a short
  // pause so you cannot sit on the explanation beyond the time limit.
  useEffect(() => {
    if (!strict || !revealed || !timedOut || finished) return;
    const t = setTimeout(() => next(), 6000);
    return () => clearTimeout(t);
  }, [strict, revealed, timedOut, finished, next]);

  // ---- Start screen ----
  if (!started) {
    return (
      <div className="mt-6">
        <p className="text-neutral-600">
          Pattern-sequence practice. Each question shows five panels; choose
          which comes next. Generated locally with a validated rule engine — not
          AI, so there are no faulty questions.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          10 questions · 60s each (real EPSO pace) · pattern types: rotation,
          counting, reflection, cross layouts, curves, 8-segment squares and
          multi-rule composites.
        </p>

        {/* Strict (exam) mode toggle */}
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={strict}
            onChange={(e) => setStrict(e.target.checked)}
          />
          <span>
            <strong>Strict exam timing</strong> — when 60s runs out the question
            locks and auto-advances. Off = you may study the explanation before
            moving on.
          </span>
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-neutral-700">Difficulty</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["easy", "medium", "hard", "extreme"] as AbstractDifficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => start(d)}
                className={`rounded-lg border px-4 py-2 capitalize transition hover:border-neutral-900 ${
                  d === "extreme"
                    ? "border-purple-300 bg-purple-50 text-purple-900"
                    : "border-neutral-300 bg-white"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Extreme = 3-4 simultaneous rules on dense layouts, modelled on the
            hardest official EPSO samples.
          </p>
        </div>
      </div>
    );
  }

  // ---- Finished screen ----
  if (finished) {
    const pct = Math.round((score.correct / Math.max(1, questions.length)) * 100);
    return (
      <div className="mt-6">
        <h2 className="text-xl font-semibold">
          Score: {score.correct}/{questions.length} ({pct}%)
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Abstract reasoning rewards method over speed-reading: count, position,
          then transformation — decide only after all three line up.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => start(difficulty)}
            className="rounded bg-neutral-900 px-4 py-2 text-white"
          >
            New set ({difficulty})
          </button>
          <button
            onClick={() => setStarted(false)}
            className="rounded border border-neutral-300 px-4 py-2"
          >
            Change difficulty
          </button>
        </div>
      </div>
    );
  }

  if (!current) return null;
  const badge = DIFFICULTY_BADGE[difficulty];

  return (
    <div className="mt-6">
      {/* Header */}
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>Question {index + 1} / {questions.length}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Shared per-question timer bar */}
      <QuestionTimer
        secondsLeft={secondsLeft}
        budget={SECONDS_PER_Q}
        label={strict ? "Exam timing — auto-advances at 0" : "Time for this question"}
      />

      {/* Sequence */}
      <p className="mt-4 font-medium">Which figure completes the pattern?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {current.sequence.map((p, i) => (
          <AbstractPanel key={i} panel={p} size={116} />
        ))}
        <div className="flex h-[116px] w-[116px] items-center justify-center rounded border-2 border-dashed border-neutral-400 text-3xl text-neutral-400">
          ?
        </div>
      </div>

      {/* Options */}
      <div className="mt-5 grid grid-cols-5 gap-2">
        {current.options.map((p, i) => {
          const isAnswer = i === current.answerIndex;
          const isPick = i === chosen;
          let ring = "border-neutral-300";
          if (revealed && isAnswer) ring = "border-green-500 ring-2 ring-green-500";
          else if (revealed && isPick && !isAnswer) ring = "border-red-500 ring-2 ring-red-500";
          else if (!revealed && isPick) ring = "border-neutral-900 ring-2 ring-neutral-900";
          return (
            <button
              key={i}
              disabled={revealed}
              onClick={() => setChosen(i)}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${ring}`}
            >
              <span className="text-xs font-semibold text-neutral-600">{OPTION_LETTERS[i]}</span>
              <AbstractPanel panel={p} size={100} />
            </button>
          );
        })}
      </div>

      {!revealed && (
        <button
          onClick={() => submit(chosen)}
          disabled={chosen === null}
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
        >
          Submit
        </button>
      )}

      {revealed && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          {timedOut && chosen === null && (
            <p className="mb-1 text-sm font-semibold text-red-600">⏱ Time up — no answer selected (counts as wrong)</p>
          )}
          {timedOut && chosen !== null && (
            <p className="mb-1 text-sm font-semibold text-amber-600">⏱ Time up — locked your current selection</p>
          )}
          <p className={chosen === current.answerIndex ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
            {chosen === current.answerIndex
              ? `Correct — ${OPTION_LETTERS[current.answerIndex]}`
              : `Incorrect — the answer is ${OPTION_LETTERS[current.answerIndex]}`}
          </p>

          {/* The rule(s) in the sequence */}
          <p className="mt-2 text-sm text-neutral-700">
            <span className="font-medium">The pattern:</span> {current.ruleSummary}
          </p>

          {/* Full per-option breakdown */}
          <div className="mt-3 space-y-1.5">
            {current.options.map((_, i) => {
              const isAnswer = i === current.answerIndex;
              const isYours = i === chosen;
              return (
                <div
                  key={i}
                  className={`rounded px-2 py-1.5 text-sm ${
                    isAnswer
                      ? "bg-green-100 text-green-900"
                      : isYours
                        ? "bg-red-100 text-red-900"
                        : "text-neutral-600"
                  }`}
                >
                  <span className="font-semibold">{OPTION_LETTERS[i]}.</span>{" "}
                  {isAnswer && <span className="font-semibold">✓ correct answer — </span>}
                  {isYours && !isAnswer && <span className="font-semibold">your answer — </span>}
                  {current.optionNotes?.[i] ?? ""}
                </div>
              );
            })}
          </div>

          {strict && timedOut ? (
            <p className="mt-4 text-xs text-neutral-500">Auto-advancing…</p>
          ) : (
            <button onClick={next} className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white">
              {index + 1 >= questions.length ? "Finish" : "Next question"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
