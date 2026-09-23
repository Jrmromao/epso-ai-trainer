"use client";

import { useEffect, useState } from "react";
import { type ChoiceKey, type Question, isNumerical } from "@/lib/types";
import type { ReviewItem, TestReview } from "@/lib/storage/progressRepo";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";
import QuestionTableView from "@/components/QuestionTableView";

// Reviews past tests. Lists saved runs (newest first); opening one shows every
// question with the user's answer, the correct answer, and the explanation.
// Defaults to showing WRONG answers only — the point is to study mistakes —
// with a toggle to see all.

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ReviewQuestion({ item }: { item: ReviewItem }) {
  const q: Question = item.question;
  const skipped = item.chosen === null;
  // Three states: skipped (blue, never answered), correct (green), wrong (red).
  const container = skipped
    ? "border-blue-200 bg-blue-50"
    : item.correct
      ? "border-green-200 bg-green-50"
      : "border-red-200 bg-red-50";
  return (
    <div className={`rounded-lg border p-4 ${container}`}>
      {q.table && <QuestionTableView table={q.table} />}
      <p className="mt-1 whitespace-pre-line text-sm font-medium">{q.stem}</p>

      <ul className="mt-2 space-y-1 text-sm">
        {CHOICE_KEYS.map((k) => {
          const label = q.choices[k];
          if (!label || label === "-" || label === "(unused)") return null;
          const isAnswer = k === q.answer;
          const isPick = k === item.chosen;
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

      {skipped && (
        <p className="mt-1 text-xs font-semibold text-blue-700">
          Skipped — you did not answer this question
        </p>
      )}

      <p className="mt-2 text-sm text-neutral-700">
        <span className="font-semibold">Why:</span> {q.explanation}
      </p>
      {isNumerical(q) && (
        <p className="mt-1 rounded bg-white p-2 text-sm text-neutral-800">
          <span className="font-semibold">Worked solution:</span> {q.workedSolution}
        </p>
      )}
    </div>
  );
}

export default function TestReviewPanel({ initialId }: { initialId?: string }) {
  const [list, setList] = useState<TestReview[]>([]);
  const [open, setOpen] = useState<TestReview | null>(null);
  const [wrongOnly, setWrongOnly] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const repo = getProgressRepo();
    repo
      .listTestReviews()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
    // Deep-link: if an id was passed (e.g. from the results screen), open it.
    if (initialId) {
      repo
        .getTestReview(initialId)
        .then((full) => {
          if (full) {
            setOpen(full);
            setWrongOnly(true);
          }
        })
        .catch(() => {
          // ignore — falls back to the list view
        });
    }
  }, [initialId]);

  async function openReview(id: string) {
    const full = await getProgressRepo().getTestReview(id);
    setOpen(full);
    setWrongOnly(true);
  }

  async function remove(id: string) {
    await getProgressRepo().deleteTestReview(id);
    setList((prev) => prev.filter((r) => r.id !== id));
    if (open?.id === id) setOpen(null);
  }

  if (loading) {
    return <p className="mt-4 text-sm text-neutral-500">Loading test history…</p>;
  }

  if (list.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
        No saved tests yet. Finish a mock or the full exam and it will appear here
        for review.
      </div>
    );
  }

  // Detail view.
  if (open) {
    const items = wrongOnly ? open.items.filter((i) => !i.correct) : open.items;
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(null)}
          className="text-sm text-neutral-500 hover:underline"
        >
          &larr; Back to test history
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">
            {open.label} — {open.correct}/{open.total}{" "}
            <span className="text-sm font-normal text-neutral-500">
              ({fmtDate(open.dateMs)})
            </span>
          </h3>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={wrongOnly}
              onChange={(e) => setWrongOnly(e.target.checked)}
            />
            Wrong answers only
          </label>
        </div>

        {items.length === 0 ? (
          <p className="mt-3 text-sm text-green-700">
            No wrong answers in this test. Untick to see all questions.
          </p>
        ) : (
          <div className="mt-3 space-y-4">
            {items.map((item, i) => (
              <ReviewQuestion key={i} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // List view.
  return (
    <div className="mt-4 space-y-2">
      {list.map((r) => {
        const wrong = r.total - r.correct;
        return (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3"
          >
            <button
              onClick={() => openReview(r.id)}
              className="flex-1 text-left"
            >
              <span className="font-medium">{r.label}</span>{" "}
              <span className="text-sm text-neutral-500">
                — {r.correct}/{r.total}
                {wrong > 0 ? ` · ${wrong} to review` : " · all correct"}
              </span>
              <div className="text-xs text-neutral-400">{fmtDate(r.dateMs)}</div>
            </button>
            <button
              onClick={() => remove(r.id)}
              className="ml-3 rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:border-red-400 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
}
