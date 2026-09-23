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

// Dot positions on a 100x100 square, for the hand-drawn worked-example figures.
// These are STATIC teaching illustrations (not generated questions) — a textbook
// figure, not the LLM-generated content the app deliberately avoids for abstract.
const POS: Record<string, [number, number]> = {
  "top-left": [20, 20],
  top: [50, 16],
  "top-right": [80, 20],
  left: [16, 50],
  center: [50, 50],
  right: [84, 50],
  "bottom-left": [20, 80],
  bottom: [50, 84],
  "bottom-right": [80, 80],
};

// One square frame with zero or more dots at named positions.
function Frame({ dots, label }: { dots: string[]; label?: string }) {
  return (
    <figure className="flex flex-col items-center">
      {label && <figcaption className="mb-1 text-xs font-semibold text-neutral-600">{label}</figcaption>}
      <svg viewBox="0 0 100 100" className="h-16 w-16" role="img" aria-label={`Square with dots at ${dots.join(", ") || "no positions"}`}>
        <rect x="4" y="4" width="92" height="92" fill="white" stroke="#404040" strokeWidth="2" />
        {dots.map((d) => {
          const [cx, cy] = POS[d] ?? POS.center;
          return <circle key={d} cx={cx} cy={cy} r="7" fill="#171717" />;
        })}
      </svg>
    </figure>
  );
}

function FrameRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-wrap items-end gap-3">{children}</div>;
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
        <h2 className="text-xl font-semibold">Worked examples</h2>
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          These are hand-drawn teaching illustrations to show the reasoning
          process, not real EPSO items. The real test figures are more complex
          and you are under time pressure — always practise the actual figures on
          the official mocks linked below.
        </p>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="font-semibold">Example 1 — a moving dot (Translation)</h3>
          <p className="mt-1 text-sm text-neutral-700">
            The sequence: which figure comes next?
          </p>
          <FrameRow>
            <Frame dots={["top-left"]} label="1" />
            <Frame dots={["top-right"]} label="2" />
            <Frame dots={["bottom-right"]} label="3" />
            <Frame dots={["bottom-left"]} label="4" />
            <Frame dots={[]} label="?" />
          </FrameRow>
          <p className="mt-3 text-sm font-medium text-neutral-700">Options:</p>
          <FrameRow>
            <Frame dots={["center"]} label="A" />
            <Frame dots={["top-left"]} label="B" />
            <Frame dots={["bottom-right"]} label="C" />
            <Frame dots={["top"]} label="D" />
            <Frame dots={["bottom"]} label="E" />
          </FrameRow>
          <div className="mt-3 text-sm text-neutral-700">
            <p className="font-medium">Reasoning:</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Isolate the single element: one dot.</li>
              <li>
                Track its path: top-left &rarr; top-right &rarr; bottom-right
                &rarr; bottom-left. It moves <strong>clockwise around the four
                corners</strong>, one corner per frame.
              </li>
              <li>Predict the next state: after bottom-left, the cycle returns to top-left.</li>
              <li>
                Eliminate: A (centre), C (bottom-right), D (top edge), E (bottom
                edge) all break the corner-clockwise rule.
              </li>
              <li>
                Answer: <strong>B</strong> (dot at top-left).
              </li>
            </ol>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="font-semibold">Example 2 — a growing count (Addition)</h3>
          <p className="mt-1 text-sm text-neutral-700">
            The sequence: which figure comes next?
          </p>
          <FrameRow>
            <Frame dots={["top-left"]} label="1" />
            <Frame dots={["top-left", "top-right"]} label="2" />
            <Frame dots={["top-left", "top-right", "bottom-right"]} label="3" />
            <Frame dots={[]} label="?" />
          </FrameRow>
          <p className="mt-3 text-sm font-medium text-neutral-700">Options:</p>
          <FrameRow>
            <Frame dots={["top-left", "top-right", "bottom-right"]} label="A" />
            <Frame dots={["top-left", "top-right", "bottom-right", "bottom-left"]} label="B" />
            <Frame dots={["center"]} label="C" />
            <Frame dots={["top-left", "bottom-right"]} label="D" />
            <Frame dots={["top-left", "top-right", "bottom-right", "bottom-left", "center"]} label="E" />
          </FrameRow>
          <div className="mt-3 text-sm text-neutral-700">
            <p className="font-medium">Reasoning:</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Count the dots per frame: 1, 2, 3&hellip; the count rises by one each time.</li>
              <li>
                Track WHERE each new dot appears: they fill the corners clockwise
                from top-left (TL, then TR, then BR&hellip;), so the fourth is
                bottom-left.
              </li>
              <li>Predict: frame 4 has four dots, all four corners filled.</li>
              <li>
                Eliminate: A (still 3), C (1, wrong), D (2, wrong), E (5 — adds a
                centre dot the rule never introduces).
              </li>
              <li>
                Answer: <strong>B</strong> (all four corners).
              </li>
            </ol>
          </div>
        </div>

        <p className="mt-3 text-sm text-neutral-600">
          Notice the method is identical each time: isolate the element(s), find
          the rule per element, predict, then eliminate options that break any
          rule. On a hard AD-level item several rules run at once &mdash; do this
          for each independently.
        </p>
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
