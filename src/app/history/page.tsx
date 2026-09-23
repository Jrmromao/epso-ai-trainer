"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TestReviewPanel from "@/components/TestReviewPanel";

// Dedicated test-history page. Lists every completed mock/exam; opening one
// shows wrong answers + the correct answer + explanation. A ?test=<id> query
// param (used by the "Review this test" link on the results screen) deep-links
// straight into that test's review.
function HistoryContent() {
  const params = useSearchParams();
  const testId = params.get("test") ?? undefined;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">Test history &amp; review</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Every completed mock and exam is saved here. Open one to review your
        wrong answers, the correct answer, and the explanation — no note-taking
        during the test.
      </p>
      <TestReviewPanel initialId={testId} />
    </main>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-3xl px-6 py-10 text-neutral-500">Loading…</p>}>
      <HistoryContent />
    </Suspense>
  );
}
