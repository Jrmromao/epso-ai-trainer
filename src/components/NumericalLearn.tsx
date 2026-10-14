"use client";

import { useMemo, useState } from "react";
import { type ChoiceKey, type Question, isNumerical } from "@/lib/types";
import Calculator from "@/components/Calculator";
import QuestionTableView from "@/components/QuestionTableView";

// Untimed numerical LEARN mode. Deliberate practice: pick an answer with no
// timer, then reveal the worked solution ONE step at a time. It teaches the
// METHOD without being a crutch (no calculator, you still do the maths). It is
// intentionally NOT recorded to progress — an untimed, hint-assisted attempt is
// not a fair accuracy signal and would skew the weak-area tracker.

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];

// Fallback when a question has no `steps` array: split the workedSolution into
// sentence-ish steps. Naive but safe — only used for legacy/older questions.
function deriveSteps(q: Question): string[] {
  if (isNumerical(q) && q.steps && q.steps.length > 0) return q.steps;
  const source = isNumerical(q) ? q.workedSolution : q.explanation;
  return source
    .split(/(?<=[.;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function NumericalLearn({ questions }: { questions: Question[] }) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<ChoiceKey | null>(null);
  const [stepsShown, setStepsShown] = useState(0);
  const [showCalc, setShowCalc] = useState(false);

  const current = questions[index];
  const steps = useMemo(() => (current ? deriveSteps(current) : []), [current]);

  if (questions.length === 0) {
    return <p className="mt-6 text-neutral-600">No numerical questions available.</p>;
  }

  const allStepsShown = stepsShown >= steps.length;
  const isCorrect = chosen === current.answer;

  function reset() {
    setChosen(null);
    setStepsShown(0);
  }

  function next() {
    setIndex((i) => (i + 1) % questions.length);
    reset();
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          Question {index + 1} / {questions.length}
        </span>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600">
          Learn mode · untimed · not scored
        </span>
      </div>

      <p className="mt-3 whitespace-pre-line font-medium">{current.stem}</p>

      {current.table && <QuestionTableView table={current.table} />}

      <div className="mt-3">
        <button
          onClick={() => setShowCalc((v) => !v)}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:border-neutral-900"
        >
          {showCalc ? "Hide calculator" : "Show calculator"}
        </button>
        {showCalc && (
          <div className="mt-2">
            <Calculator />
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {CHOICE_KEYS.map((k) => {
          const label = current.choices[k];
          if (!label || label === "-" || label === "(unused)") return null;
          const isAnswer = k === current.answer;
          const isPick = k === chosen;
          let cls = "border-neutral-300 bg-white hover:border-neutral-900";
          if (chosen && isAnswer) cls = "border-green-500 bg-green-50";
          else if (chosen && isPick && !isAnswer) cls = "border-red-500 bg-red-50";
          return (
            <button
              key={k}
              disabled={chosen !== null}
              onClick={() => setChosen(k)}
              className={`block w-full rounded border p-3 text-left transition ${cls} ${
                !chosen && isPick ? "ring-2 ring-neutral-900" : ""
              }`}
            >
              <span className="font-semibold">{k}.</span> {label}
            </button>
          );
        })}
      </div>

      {chosen && (
        <p
          className={`mt-3 font-semibold ${
            isCorrect ? "text-green-700" : "text-red-700"
          }`}
        >
          {isCorrect ? "Correct" : `Not quite — answer is ${current.answer}`}
        </p>
      )}

      {/* Step-by-step reveal. Works before OR after answering — get stuck, reveal
          one step, keep going. */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-700">
            Worked solution ({stepsShown}/{steps.length} steps)
          </p>
          <div className="flex gap-2">
            {!allStepsShown && (
              <button
                onClick={() => setStepsShown((n) => Math.min(n + 1, steps.length))}
                className="rounded bg-neutral-900 px-3 py-1 text-sm text-white"
              >
                Reveal next step
              </button>
            )}
            {stepsShown > 0 && (
              <button
                onClick={() => setStepsShown(0)}
                className="rounded border border-neutral-300 px-3 py-1 text-sm"
              >
                Hide
              </button>
            )}
          </div>
        </div>

        {stepsShown === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">
            Try it yourself first. Reveal steps one at a time if you get stuck.
          </p>
        ) : (
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-neutral-800">
            {steps.slice(0, stepsShown).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        )}

        {allStepsShown && (
          <p className="mt-3 border-t border-neutral-200 pt-2 text-sm text-neutral-700">
            <span className="font-semibold">Why:</span> {current.explanation}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded border border-neutral-300 px-4 py-2 text-sm"
        >
          Retry this question
        </button>
        <button
          onClick={next}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Next question
        </button>
      </div>
    </div>
  );
}
