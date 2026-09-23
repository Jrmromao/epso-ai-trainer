"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AnswerRecord,
  type AssessmentResult,
  type ChoiceKey,
  type Question,
  type Topic,
  isNumerical,
  TOPIC_LABELS,
} from "@/lib/types";
import { useMockHistory } from "@/lib/useMockHistory";
import { useProgress } from "@/lib/useProgress";
import { useTestReview } from "@/lib/useTestReview";
import { llmHeaders } from "@/lib/userKey";
import Calculator from "@/components/Calculator";
import QuestionTableView from "@/components/QuestionTableView";

const SECONDS_PER_QUESTION = 80; // mirrors the real ~40min / 30Q pace

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];

export default function MockRunner({
  topic,
  questions,
}: {
  topic: Topic;
  questions: Question[];
}) {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<ChoiceKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION);
  const [finished, setFinished] = useState(false);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);

  const { record: recordRun } = useMockHistory();
  const { recordRun: recordProgress } = useProgress();
  const { saveReview } = useTestReview();

  const current = questions[index];

  const submit = useCallback(
    (pick: ChoiceKey | null) => {
      if (revealed || !current) return;
      // pick === null means the timer ran out with nothing selected — a SKIP.
      // Record it as null (excluded from the accuracy signal, shown as skipped),
      // not a fake "A".
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
  }

  // On finish: persist the run and request a weak-topic assessment.
  useEffect(() => {
    if (!finished) return;
    recordRun(topic, records);
    recordProgress(records);
    saveReview(TOPIC_LABELS[topic], questions, records).then(setReviewId);
    setAssessing(true);
    fetch("/api/assess", {
      method: "POST",
      headers: llmHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ results: records }),
    })
      .then((r) => r.json())
      .then((data) => setAssessment(data as AssessmentResult))
      .catch(() => setAssessment(null))
      .finally(() => setAssessing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  if (questions.length === 0) {
    return (
      <p className="mt-6 text-neutral-600">
        No questions seeded for this topic yet. (Generation comes next.)
      </p>
    );
  }

  if (finished) {
    const correct = records.filter((r) => r.isCorrect).length;
    return (
      <div className="mt-6">
        <h2 className="text-xl font-semibold">
          Score: {correct}/{records.length}
        </h2>

        {assessing && (
          <p className="mt-3 text-sm text-neutral-500">Analysing your answers…</p>
        )}

        {assessment && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <p className="font-medium">{assessment.summary}</p>
            {assessment.studyNext.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
                {assessment.studyNext.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={reviewId ? `/history?test=${reviewId}` : "/history"}
            className="inline-block rounded bg-neutral-900 px-4 py-2 text-white"
          >
            Review this test
          </a>
          <a
            href="/"
            className="inline-block rounded border border-neutral-300 px-4 py-2"
          >
            Back to topics
          </a>
        </div>
      </div>
    );
  }

  const isCorrect = chosen === current.answer;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          Question {index + 1} / {questions.length}
        </span>
        <span className={secondsLeft <= 10 ? "font-semibold text-red-600" : ""}>
          {secondsLeft}s
        </span>
      </div>

      {current.table && <QuestionTableView table={current.table} />}

      <p className="mt-3 whitespace-pre-line font-medium">{current.stem}</p>

      {topic === "numerical" && (
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
          else if (revealed && isPick && !isAnswer)
            cls = "border-red-500 bg-red-50";
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
          <p className={isCorrect ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
            {isCorrect ? "Correct" : `Incorrect — answer is ${current.answer}`}
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
            {index + 1 >= questions.length ? "Finish" : "Next question"}
          </button>
        </div>
      )}
    </div>
  );
}
