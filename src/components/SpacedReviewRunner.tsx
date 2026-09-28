"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AnswerRecord,
  type ChoiceKey,
  type Question,
  isNumerical,
  TOPIC_LABELS,
} from "@/lib/types";
import { useProgress } from "@/lib/useProgress";
import { useTestReview } from "@/lib/useTestReview";
import Calculator from "@/components/Calculator";
import QuestionTableView from "@/components/QuestionTableView";

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];
const SECONDS_PER_QUESTION = 80;

// SpacedReviewRunner is intentionally similar to MockRunner but with two
// key differences:
//   1. No LLM assessment call at the end — the spaced repetition system
//      already decides what to resurface; an extra LLM summary here would
//      be redundant and wasteful.
//   2. The results screen emphasises the SR outcome (streak updated, next
//      review interval) rather than a topic score.

export default function SpacedReviewRunner({
  questions,
}: {
  questions: Question[];
}) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<ChoiceKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [finished, setFinished] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const { recordRun: recordProgress } = useProgress();
  const { saveReview } = useTestReview();

  const current = questions[index];

  const submit = useCallback(
    (pick: ChoiceKey | null) => {
      if (revealed || !current) return;
      const record: AnswerRecord = {
        questionId: current.id,
        topic: current.topic,
        chosen: pick,
        correct: current.answer,
        isCorrect: pick === current.answer,
      };
      setChosen(pick);
      setRevealed(true);
      setRecords((r) => [...r, record]);
    },
    [current, revealed],
  );

  // Per-question countdown; auto-submit on timeout.
  useEffect(() => {
    if (revealed || finished || !current) return;
    if (secondsLeft <= 0) {
      submit(chosen);
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, revealed, finished, current, chosen, submit]);

  function next() {
    if (index + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setChosen(null);
    setRevealed(false);
    setSecondsLeft(SECONDS_PER_QUESTION);
    setShowCalc(false);
  }

  // On finish: persist attempts (this is what advances the SR streak) and save
  // a test review so the user can revisit the session from history.
  useEffect(() => {
    if (!finished) return;
    recordProgress(records);
    saveReview("Spaced review", questions, records).then(setReviewId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (finished) {
    const correct = records.filter((r) => r.isCorrect).length;
    const total = records.length;
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

    return (
      <div className="mt-6">
        <h2 className="text-xl font-semibold">Review complete</h2>
        <p className="mt-1 text-neutral-600">
          {correct}/{total} correct ({pct}%)
        </p>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
          <p className="font-medium">What happens next</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Questions you got <span className="text-green-700 font-medium">right</span>{" "}
              move to a longer interval (2×). They&apos;ll resurface later.
            </li>
            <li>
              Questions you got <span className="text-red-600 font-medium">wrong</span>{" "}
              reset to the shortest interval (1 day) and will be back tomorrow.
            </li>
            <li>
              Keep clearing the queue daily and the intervals will grow until
              these topics are solid.
            </li>
          </ul>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={reviewId ? `/history?test=${reviewId}` : "/history"}
            className="inline-block rounded bg-neutral-900 px-4 py-2 text-white"
          >
            Review this session
          </a>
          <a
            href="/"
            className="inline-block rounded border border-neutral-300 px-4 py-2"
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }

  const isCorrect = chosen === current.answer;

  return (
    <div className="mt-6">
      {/* Progress header */}
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 mr-2">
            Spaced review
          </span>
          Question {index + 1} / {questions.length}
        </span>
        <span className={secondsLeft <= 10 ? "font-semibold text-red-600" : ""}>
          {secondsLeft}s
        </span>
      </div>

      {/* Topic label */}
      <p className="mt-1 text-xs text-neutral-400">
        {TOPIC_LABELS[current.topic]}
      </p>

      {current.table && <QuestionTableView table={current.table} />}

      <p className="mt-3 whitespace-pre-line font-medium">{current.stem}</p>

      {current.topic === "numerical" && (
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
      )}

      <div className="mt-4 space-y-2">
        {CHOICE_KEYS.map((k) => {
          const label = current.choices[k];
          if (!label || label === "-" || label === "(unused)") return null;
          const isAnswer = k === current.answer;
          const isPick = k === chosen;
          let cls = "border-neutral-300 bg-white hover:border-neutral-900";
          if (revealed && isAnswer) cls = "border-green-500 bg-green-50";
          else if (revealed && isPick && !isAnswer) cls = "border-red-500 bg-red-50";
          return (
            <button
              key={k}
              disabled={revealed}
              onClick={() => setChosen(k)}
              className={`block w-full rounded border p-3 text-left transition ${cls} ${
                !revealed && isPick ? "ring-2 ring-neutral-900" : ""
              }`}
            >
              <span className="font-semibold">{k}.</span> {label}
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
          <p
            className={
              isCorrect
                ? "font-semibold text-green-700"
                : "font-semibold text-red-700"
            }
          >
            {isCorrect
              ? "Correct — streak extended ✓"
              : `Incorrect — answer is ${current.answer}. Streak reset, back tomorrow.`}
          </p>
          <p className="mt-2 text-sm text-neutral-700">{current.explanation}</p>
          {isNumerical(current) && (
            <p className="mt-2 rounded bg-white p-2 text-sm text-neutral-800">
              <span className="font-semibold">Worked solution:</span>{" "}
              {current.workedSolution}
            </p>
          )}
          <button
            onClick={next}
            className="mt-4 rounded bg-neutral-900 px-4 py-2 text-white"
          >
            {index + 1 >= questions.length ? "Finish review" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
