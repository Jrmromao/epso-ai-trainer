"use client";

import { useSpacedReview } from "@/lib/useSpacedReview";
import SpacedReviewRunner from "@/components/SpacedReviewRunner";

export default function ReviewPage() {
  const status = useSpacedReview();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <a
        href="/"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← Back to home
      </a>

      <h1 className="mt-4 text-2xl font-bold">Spaced review</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Questions you previously missed, resurfaced at the right interval.
      </p>

      {status.state === "loading" && (
        <p className="mt-8 text-neutral-500">Loading your review queue…</p>
      )}

      {status.state === "error" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Could not load review items</p>
          <p className="mt-1">{status.message}</p>
          <a
            href="/"
            className="mt-3 inline-block rounded border border-red-300 px-3 py-1.5 text-sm hover:border-red-600"
          >
            Back to home
          </a>
        </div>
      )}

      {status.state === "empty" && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-6 text-center">
          <p className="text-lg font-medium">Nothing due right now 🎉</p>
          <p className="mt-2 text-sm text-neutral-600">
            All your previously missed questions are either fully mastered or
            not yet due for their next review. Come back later or run a fresh
            mock to add more items to the queue.
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded bg-neutral-900 px-4 py-2 text-sm text-white"
          >
            Back to home
          </a>
        </div>
      )}

      {status.state === "ready" && (
        <SpacedReviewRunner questions={status.questions} />
      )}
    </main>
  );
}
