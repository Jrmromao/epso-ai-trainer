import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Abstract Reasoning — Technique Guide | EPSO AI Trainer",
};

// Static teaching content only. This app does NOT generate abstract-reasoning
// figures (visual, LLM-unreliable). This page teaches the techniques; practise
// actual figure questions on the official/validated sources linked below.

interface PatternType {
  name: string;
  what: string;
  spot: string;
}

const PATTERN_TYPES: PatternType[] = [
  {
    name: "Rotation",
    what: "A shape (or the whole figure) turns by a fixed angle each frame.",
    spot: "Track one element's orientation across frames. Common steps: 45°, 90°, 180°. Check direction (clockwise vs anti-clockwise).",
  },
  {
    name: "Reflection / Mirroring",
    what: "The figure flips across a horizontal, vertical, or diagonal axis.",
    spot: "Ask: is the next frame a mirror image, not a rotation? Left-right and up-down swaps are the giveaway.",
  },
  {
    name: "Translation (movement)",
    what: "An element moves position by a consistent rule (e.g. one cell per step).",
    spot: "Follow a single element's path; watch for wrap-around (leaves one edge, re-enters the opposite).",
  },
  {
    name: "Addition / Subtraction of elements",
    what: "Elements are added or removed at a steady rate across frames.",
    spot: "Count elements per frame: 1, 2, 3… or 4, 3, 2…. The count itself is the rule.",
  },
  {
    name: "Size progression",
    what: "A shape grows or shrinks step by step.",
    spot: "Compare the same shape's size across frames; combine with other rules (a shape can rotate AND grow).",
  },
  {
    name: "Shading / colour cycling",
    what: "Fill state cycles (e.g. white → grey → black → white).",
    spot: "Isolate colour from shape. A shape's fill may change on its own schedule, independent of its position.",
  },
  {
    name: "Odd-one-out",
    what: "Five/six figures share a hidden rule; one breaks it.",
    spot: "Find the rule the majority obey (symmetry, element count, shape type), then find the violator.",
  },
  {
    name: "Multiple simultaneous rules",
    what: "Several independent rules run at once (e.g. one shape rotates, another moves, a third changes colour).",
    spot: "This is the hardest and most common at AD level. Isolate EACH element and find its rule separately, then pick the option satisfying ALL rules at once.",
  },
];

export default function AbstractReasoningTutorial() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-3xl font-bold">Abstract Reasoning — Technique Guide</h1>

      <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        This app does not generate abstract-reasoning figures (they are visual
        and cannot be reliably auto-generated). This page teaches the techniques.
        Practise actual figure questions on the official sources at the bottom.
      </p>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">What the test measures</h2>
        <p className="mt-2 text-neutral-700">
          Abstract reasoning assesses your ability to identify logical patterns
          and relationships between figures &mdash; without relying on language,
          numbers, or spatial orientation. You are shown a sequence or set of
          figures and must pick the one that comes next or completes the pattern.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">The core method</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-700">
          <li>Isolate each element (shape, line, dot, shading) separately.</li>
          <li>Find the rule for each element independently across frames.</li>
          <li>Predict the next state of every element.</li>
          <li>Pick the option that satisfies <strong>all</strong> rules at once.</li>
          <li>Eliminate options that break any single rule &mdash; often faster than confirming the right one.</li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Pattern types to recognise</h2>
        <div className="mt-3 space-y-4">
          {PATTERN_TYPES.map((p) => (
            <div
              key={p.name}
              className="rounded-lg border border-neutral-200 bg-white p-4"
            >
              <h3 className="font-semibold">{p.name}</h3>
              <p className="mt-1 text-sm text-neutral-700">{p.what}</p>
              <p className="mt-1 text-sm text-neutral-600">
                <span className="font-medium">How to spot it:</span> {p.spot}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Timing strategy</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-neutral-700">
          <li>Budget roughly 40&ndash;60 seconds per figure question.</li>
          <li>If no rule is obvious in ~20s, use elimination on the options.</li>
          <li>Don&rsquo;t over-invest in one item &mdash; flag it, move on, return if time allows.</li>
          <li>Practise timed, not untimed &mdash; the clock is the real difficulty.</li>
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-neutral-300 bg-neutral-50 p-4">
        <h2 className="text-lg font-semibold">Practise the actual figures here</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>
            <a
              className="underline"
              href="https://eu-careers.europa.eu/en/selection-procedure/epso-tests"
              target="_blank"
              rel="noreferrer"
            >
              Official EPSO sample tests
            </a>
          </li>
          <li>
            <a
              className="underline"
              href="https://eu-careers.europa.eu/system/files/2023-10/Sample%20mock-tests%20EPSO%20-%20Part%201%20-%20Reasoning.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Official reasoning mock (PDF, includes abstract figures)
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
