"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AnswerRecord,
  type AssessmentResult,
  type ChoiceKey,
  type Question,
  isNumerical,
} from "@/lib/types";
import { useMockHistory } from "@/lib/useMockHistory";
import { useProgress } from "@/lib/useProgress";
import { llmHeaders } from "@/lib/userKey";

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];
const PASS_MARK = 15;
const PER_Q_TARGET = 80; // soft pace target in seconds

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Overall timer colour: green > 10min, amber <= 10min, red <= 2min.
function overallColor(sec: number): string {
  if (sec <= 120) return "text-red-600";
  if (sec <= 600) return "text-amber-600";
  return "text-green-700";
}

// Per-question soft colour: green < target, amber target..1.5x, red beyond.
function perQColor(sec: number): string {
  if (sec > PER_Q_TARGET * 1.5) return "text-red-600";
  if (sec >= PER_Q_TARGET) return "text-amber-600";
  return "text-green-700";
}

export default function ExamRunner({
  questions,
  durationSeconds,
}: {
  questions: Question[];
  durationSeconds: number;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, ChoiceKey>>({});
  const [overallLeft, setOverallLeft] = useState(durationSeconds);
  const [qElapsed, setQElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [records, setRecords] = useState<AnswerRecord[]>([]);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);

  const { record: recordRun } = useMockHistory();
  const { recordRun: recordProgress } = useProgress();
  const current = questions[index];

  const finish = useCallback(() => {
    const recs: AnswerRecord[] = questions.map((q, i) => {
      const chosen = answers[i] ?? "A";
      return {
        questionId: q.id,
        topic: q.topic,
        chosen,
        correct: q.answer,
        isCorrect: chosen === q.answer && answers[i] !== undefined,
      };
    });
    setRecords(recs);
    setFinished(true);
  }, [answers, questions]);

  // Overall authoritative countdown — hitting zero ends the exam.
  useEffect(() => {
    if (finished) return;
    if (overallLeft <= 0) {
      finish();
      return;
    }
    const t = setTimeout(() => setOverallLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [overallLeft, finished, finish]);

  // Per-question elapsed timer (soft — pace nudge only).
  useEffect(() => {
    if (finished) return;
    const t = setTimeout(() => setQElapsed((s) => s + 1), 1000);
    return () => clearTimeout(t);
  }, [qElapsed, finished]);

  // Persist + assess on finish.
  useEffect(() => {
    if (!finished || records.length === 0) return;
    recordRun("ai-act", records); // exam is AI-field; logged under the competition
    recordProgress(records, "field-ai"); // force field-ai component for the whole exam
    fetch("/api/assess", {
      method: "POST",
      headers: llmHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ results: records }),
    })
      .then((r) => r.json())
      .then((d) => setAssessment(d as AssessmentResult))
      .catch(() => setAssessment(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, records]);

  function pick(k: ChoiceKey) {
    setAnswers((a) => ({ ...a, [index]: k }));
  }

  function goto(i: number) {
    setIndex(i);
    setQElapsed(0);
  }

  if (finished) {
    const correct = records.filter((r) => r.isCorrect).length;
    const passed = correct >= PASS_MARK;
    return (
      <div className="mt-6">
        <h2 className="text-2xl font-bold">
          {correct}/{questions.length}{" "}
          <span className={passed ? "text-green-700" : "text-red-600"}>
            ({passed ? "PASS" : "BELOW PASS"} — pass mark {PASS_MARK})
          </span>
        </h2>
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

        {/* Per-question review: correct answer + explanation for every item,
            whether the candidate got it right or wrong. */}
        <h3 className="mt-6 text-lg font-semibold">Review all questions</h3>
        <div className="mt-3 space-y-4">
          {questions.map((q, i) => {
            const chosen = answers[i];
            const gotIt = chosen === q.answer;
            return (
              <div
                key={q.id}
                className={`rounded-lg border p-4 ${
                  gotIt ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-line text-sm font-medium">
                    {i + 1}. {q.stem}
                  </p>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                      gotIt ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    }`}
                  >
                    {gotIt ? "Correct" : chosen ? "Wrong" : "Skipped"}
                  </span>
                </div>

                <ul className="mt-2 space-y-1 text-sm">
                  {CHOICE_KEYS.map((k) => {
                    const label = q.choices[k];
                    if (!label || label === "-" || label === "(unused)") return null;
                    const isAnswer = k === q.answer;
                    const isPick = k === chosen;
                    return (
                      <li
                        key={k}
                        className={`rounded px-2 py-1 ${
                          isAnswer
                            ? "bg-green-100 font-medium text-green-900"
                            : isPick
                              ? "bg-red-100 text-red-900 line-through"
                              : "text-neutral-700"
                        }`}
                      >
                        <span className="font-semibold">{k}.</span> {label}
                        {isAnswer && " ✓ correct answer"}
                        {isPick && !isAnswer && " ← your answer"}
                      </li>
                    );
                  })}
                </ul>

                <p className="mt-2 text-sm text-neutral-700">
                  <span className="font-semibold">Why:</span> {q.explanation}
                </p>
                {isNumerical(q) && (
                  <p className="mt-1 rounded bg-white p-2 text-sm text-neutral-800">
                    <span className="font-semibold">Worked solution:</span>{" "}
                    {q.workedSolution}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <a href="/" className="mt-6 inline-block rounded bg-neutral-900 px-4 py-2 text-white">
          Back to topics
        </a>
      </div>
    );
  }

  const answered = Object.keys(answers).length;

  return (
    <div className="mt-6">
      {/* Timers */}
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
        <div>
          <div className="text-xs text-neutral-500">Overall</div>
          <div className={`text-xl font-bold tabular-nums ${overallColor(overallLeft)}`}>
            {fmt(overallLeft)}
          </div>
        </div>
        <div className="text-center text-sm text-neutral-500">
          Q {index + 1}/{questions.length} · {answered} answered
        </div>
        <div className="text-right">
          <div className="text-xs text-neutral-500">This question</div>
          <div className={`text-xl font-bold tabular-nums ${perQColor(qElapsed)}`}>
            {fmt(qElapsed)}
          </div>
        </div>
      </div>

      {/* Question */}
      <p className="mt-5 whitespace-pre-line font-medium">{current.stem}</p>
      <div className="mt-4 space-y-2">
        {CHOICE_KEYS.map((k) => {
          const label = current.choices[k];
          if (!label || label === "-" || label === "(unused)") return null;
          const isPick = answers[index] === k;
          return (
            <button
              key={k}
              onClick={() => pick(k)}
              className={`block w-full rounded border p-3 text-left transition ${
                isPick
                  ? "border-neutral-900 ring-2 ring-neutral-900"
                  : "border-neutral-300 bg-white hover:border-neutral-900"
              }`}
            >
              <span className="font-semibold">{k}.</span> {label}
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="mt-5 flex items-center justify-between">
        <button
          onClick={() => goto(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded border border-neutral-300 px-4 py-2 disabled:opacity-40"
        >
          Previous
        </button>
        {index + 1 < questions.length ? (
          <button
            onClick={() => goto(index + 1)}
            className="rounded bg-neutral-900 px-4 py-2 text-white"
          >
            Next
          </button>
        ) : (
          <button
            onClick={finish}
            className="rounded bg-red-600 px-4 py-2 text-white"
          >
            Finish exam
          </button>
        )}
      </div>

      {/* Question jump grid */}
      <div className="mt-5 grid grid-cols-10 gap-1">
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => goto(i)}
            className={`h-8 rounded text-xs ${
              i === index
                ? "bg-neutral-900 text-white"
                : answers[i] !== undefined
                  ? "bg-green-100 text-green-800"
                  : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
