"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type AnswerRecord,
  type AssessmentResult,
  type ChoiceKey,
  type Difficulty,
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
import QuestionTimer from "@/components/QuestionTimer";
import { budgetForTopic } from "@/lib/timing";
import { clearSession, loadSession, saveRunProgress } from "@/lib/mockSessionStore";

function sessionSecondsForTopic(topic: Topic, count: number): number {
  return budgetForTopic(topic) * count;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function overallColor(sec: number, total: number): string {
  const pct = sec / total;
  if (pct <= 0.1) return "text-red-600";
  if (pct <= 0.25) return "text-amber-600";
  return "text-green-700";
}

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];

// Difficulty badge — full static class strings so Tailwind doesn't purge them.
const DIFFICULTY_BADGE: Record<Difficulty, { label: string; cls: string }> = {
  easy:   { label: "Easy",   cls: "bg-green-100 text-green-800 border border-green-200" },
  medium: { label: "Medium", cls: "bg-amber-100 text-amber-800 border border-amber-200" },
  hard:   { label: "Hard",   cls: "bg-red-100 text-red-800 border border-red-200" },
};

// Flag reasons — stored in localStorage under "flagged_questions"
type FlagReason = "wrong-answer-key" | "ambiguous" | "other";
const FLAG_REASONS: { value: FlagReason; label: string }[] = [
  { value: "wrong-answer-key", label: "Answer key is wrong" },
  { value: "ambiguous",        label: "Multiple options defensible" },
  { value: "other",            label: "Other issue" },
];

function getFlagged(): Record<string, FlagReason> {
  try {
    return JSON.parse(localStorage.getItem("flagged_questions") ?? "{}");
  } catch { return {}; }
}

function saveFlag(id: string, reason: FlagReason) {
  const current = getFlagged();
  current[id] = reason;
  localStorage.setItem("flagged_questions", JSON.stringify(current));
}

function removeFlag(id: string) {
  const current = getFlagged();
  delete current[id];
  localStorage.setItem("flagged_questions", JSON.stringify(current));
}

export default function MockRunner({
  topic,
  questions,
}: {
  topic: Topic;
  questions: Question[];
}) {
  const totalSessionSeconds = sessionSecondsForTopic(topic, questions.length);
  const perQSeconds = budgetForTopic(topic);

  // Restore any saved run progress for this topic so a refresh / back-navigation
  // mid-test keeps the user's answers and position. We only trust the saved run
  // if it matches the current question set (same ids, same order) — otherwise a
  // freshly generated set would inherit stale progress. Read once at mount.
  const savedRun = (() => {
    const persisted = loadSession(topic);
    if (!persisted?.run) return null;
    const sameSet =
      persisted.questions.length === questions.length &&
      persisted.questions.every((q, i) => q.id === questions[i]?.id);
    return sameSet ? persisted.run : null;
  })();

  const [index, setIndex] = useState(savedRun?.index ?? 0);
  const [chosen, setChosen] = useState<ChoiceKey | null>(savedRun?.chosen ?? null);
  const [revealed, setRevealed] = useState(savedRun?.revealed ?? false);
  const [records, setRecords] = useState<AnswerRecord[]>(savedRun?.records ?? []);
  const [sessionLeft, setSessionLeft] = useState(savedRun?.sessionLeft ?? totalSessionSeconds);
  const [secondsLeft, setSecondsLeft] = useState(perQSeconds);
  const [finished, setFinished] = useState(savedRun?.finished ?? false);
  const [assessment, setAssessment] = useState<AssessmentResult | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<FlagReason | null>(null);
  const [showFlagMenu, setShowFlagMenu] = useState(false);

  const { record: recordRun } = useMockHistory();
  const { recordRun: recordProgress } = useProgress();
  const { saveReview } = useTestReview();

  const current = questions[index];

  // Persist run progress on every meaningful state change so a refresh / back
  // keeps the user's place and answers. Skipped once finished — the finish
  // effect clears the session after recording it to history.
  useEffect(() => {
    if (finished) return;
    saveRunProgress(topic, { index, records, chosen, revealed, finished, sessionLeft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, records, chosen, revealed, sessionLeft, finished, topic]);

  // Load flag state when question changes
  useEffect(() => {
    if (!current) return;
    const flags = getFlagged();
    setFlagged(flags[current.id] ?? null);
    setShowFlagMenu(false);
  }, [current?.id]);

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

  // Overall session countdown — hitting zero ends the session.
  useEffect(() => {
    if (finished) return;
    if (sessionLeft <= 0) {
      submit(chosen);
      setFinished(true);
      return;
    }
    const t = setTimeout(() => setSessionLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sessionLeft, finished, submit, chosen]);

  // Per-question countdown; auto-submit on timeout.
  useEffect(() => {
    if (revealed || finished || !current) return;
    if (secondsLeft <= 0) { submit(chosen); return; }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, revealed, finished, current, chosen, submit]);

  function next() {
    if (index + 1 >= questions.length) { setFinished(true); return; }
    setIndex((i) => i + 1);
    setChosen(null);
    setRevealed(false);
    setSecondsLeft(perQSeconds);
  }

  // On finish: persist the run and request a weak-topic assessment.
  useEffect(() => {
    if (!finished) return;
    recordRun(topic, records);
    recordProgress(records);
    saveReview(TOPIC_LABELS[topic], questions, records).then(setReviewId);
    // The run is now recorded to history/review — drop the in-progress
    // sessionStorage copy so a later refresh starts clean rather than
    // reopening a completed test.
    clearSession(topic);
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
                {assessment.studyNext.map((s, i) => <li key={i}>{s}</li>)}
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
          <a href="/" className="inline-block rounded border border-neutral-300 px-4 py-2">
            Back to topics
          </a>
        </div>
      </div>
    );
  }

  const isCorrect = chosen === current.answer;
  const badge = DIFFICULTY_BADGE[current.difficulty];

  return (
    <div className="mt-6">
      {/* Session timer bar */}
      <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3 text-sm">
        <div>
          <div className="text-xs text-neutral-500">Session total</div>
          <div className={`text-lg font-bold tabular-nums ${overallColor(sessionLeft, totalSessionSeconds)}`}>
            {fmt(sessionLeft)}
          </div>
        </div>
        <div className="text-center text-neutral-500">
          Q {index + 1} / {questions.length}
        </div>
      </div>

      {/* Shared per-question timer bar (budget = this topic's EPSO pace) */}
      <QuestionTimer secondsLeft={secondsLeft} budget={perQSeconds} />

      {current.table && <QuestionTableView table={current.table} />}
      <div className="mt-3 flex items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-line font-medium">{current.stem}</p>

      {topic === "numerical" && (
        <div className="mt-3">
          <button
            onClick={() => setShowCalc((v) => !v)}
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:border-neutral-900"
          >
            {showCalc ? "Hide calculator" : "Show calculator"}
          </button>
          {showCalc && <div className="mt-2"><Calculator /></div>}
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
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => submit(chosen)}
            disabled={chosen === null}
            className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40"
          >
            Submit
          </button>
          <p className="text-xs text-neutral-500">
            No negative marking — always pick an answer, even a guess. Leaving it
            blank can only lose you marks.
          </p>
        </div>
      )}

      {revealed && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <p className={isCorrect ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
            {isCorrect ? "Correct" : `Incorrect — answer is ${current.answer}`}
          </p>
          <p className="mt-2 text-sm text-neutral-700">{current.explanation}</p>
          {current.optionNotes && (
            <ul className="mt-2 space-y-1 text-sm">
              {(["A", "B", "C", "D", "E"] as const).map((k) => {
                const n = current.optionNotes?.[k];
                if (!n) return null;
                const isTrue = n.verdict === "true";
                return (
                  <li key={k} className="text-neutral-800">
                    <span className={`font-semibold ${isTrue ? "text-green-700" : "text-red-700"}`}>
                      {k} — {isTrue ? "TRUE" : "FALSE"}
                    </span>{" "}
                    <span className="text-neutral-700">{n.note}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {isNumerical(current) && (
            <p className="mt-2 rounded bg-white p-2 text-sm text-neutral-800">
              <span className="font-semibold">Worked solution:</span>{" "}
              {current.workedSolution}
            </p>
          )}

          {/* Flag / question validation mechanism */}
          <div className="mt-4 border-t border-neutral-200 pt-3">
            {flagged ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-amber-700">
                  ⚑ Flagged: {FLAG_REASONS.find((r) => r.value === flagged)?.label}
                </span>
                <button
                  onClick={() => { removeFlag(current.id); setFlagged(null); }}
                  className="text-xs text-neutral-500 underline hover:text-neutral-900"
                >
                  Remove flag
                </button>
              </div>
            ) : (
              <div className="relative inline-block">
                <button
                  onClick={() => setShowFlagMenu((v) => !v)}
                  className="text-xs text-neutral-500 hover:text-amber-700 hover:underline"
                >
                  ⚑ Flag this question
                </button>
                {showFlagMenu && (
                  <div className="absolute left-0 top-6 z-10 w-56 rounded-lg border border-neutral-200 bg-white shadow-md">
                    <p className="border-b border-neutral-100 px-3 py-2 text-xs font-medium text-neutral-600">
                      Why are you flagging this?
                    </p>
                    {FLAG_REASONS.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => {
                          saveFlag(current.id, value);
                          setFlagged(value);
                          setShowFlagMenu(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

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
