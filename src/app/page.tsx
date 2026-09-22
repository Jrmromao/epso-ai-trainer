import Link from "next/link";
import { TOPIC_LABELS, type Topic } from "@/lib/types";
import { SEED_QUESTIONS } from "@/data/questions";
import StudyExternallyPanel from "@/components/StudyExternallyPanel";
import AccessGate from "@/components/AccessGate";
import ByokPanel from "@/components/ByokPanel";
import StudyDashboard from "@/components/StudyDashboard";
import ProgressTools from "@/components/ProgressTools";

const FIELD_TOPICS: Topic[] = [
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
];

const REASONING_TOPICS: Topic[] = ["verbal", "numerical"];

function countFor(topic: Topic): number {
  return SEED_QUESTIONS.filter((q) => q.topic === topic).length;
}

function TopicCard({ topic }: { topic: Topic }) {
  const n = countFor(topic);
  return (
    <Link
      href={`/mock/${topic}`}
      className="block rounded-lg border border-neutral-300 bg-white p-4 transition hover:border-neutral-900 hover:shadow-sm"
    >
      <div className="font-semibold">{TOPIC_LABELS[topic]}</div>
      <div className="mt-1 text-sm text-neutral-500">{n} question{n === 1 ? "" : "s"} seeded</div>
    </Link>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">EPSO AI Trainer</h1>
      <p className="mt-2 text-neutral-600">
        EPSO/AD/430/26 (AD 8 &mdash; Artificial Intelligence). Pick a topic to
        run a timed mock.
      </p>

      <a
        href="/exam"
        className="mt-5 inline-block rounded-lg bg-neutral-900 px-5 py-3 text-white hover:bg-neutral-800"
      >
        Start full 30-question exam &rarr;
      </a>
      <p className="mt-1 text-xs text-neutral-500">
        40 min · pass 15/30 · live-generated (unlock below first)
      </p>

      <div className="mt-5 rounded-lg border border-neutral-300 bg-white p-4 text-sm">
        <p className="font-semibold">Key dates &amp; pass marks (EPSO/AD/430/26)</p>
        <ul className="mt-2 space-y-1 text-neutral-700">
          <li>
            <span className="font-medium">Application deadline:</span> 13 Oct
            2026 <span className="text-neutral-500">(confirmed — closed)</span>
          </li>
          <li>
            <span className="font-medium">Supporting documents:</span> 14 Jan
            2027 <span className="text-neutral-500">(confirmed)</span>
          </li>
          <li>
            <span className="font-medium">Test date:</span>{" "}
            <span className="text-amber-700">
              TBC &mdash; not published. Arrives via your EPSO candidate account.
              Check it at least every 3 days; testing is remotely proctored and
              booked within a limited window once invited.
            </span>
          </li>
        </ul>
        <p className="mt-3 font-medium">Pass marks</p>
        <ul className="mt-1 space-y-1 text-neutral-700">
          <li>Verbal reasoning: 10/20</li>
          <li>Numerical + abstract (combined): 10/20</li>
          <li>Field AI MCQ: 15/30 (and must rank among the highest)</li>
          <li>EUFTE essay: 5/10</li>
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          Dates from the official notice (C/2026/4668). The test date is not
          fixed in advance &mdash; your candidate account is the authoritative
          source.
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">How to use this app (read once)</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            This trains your <strong>AI knowledge and speed</strong> for the
            field MCQ. It is <strong>not</strong> a question bank &mdash;
            questions are AI-generated, not real EPSO items. Do not walk into the
            test hoping to recognise a question you saw here.
          </li>
          <li>
            <strong>Verify facts against primary sources</strong> (the AI Act
            text, the competition notice). AI-generated answers can be subtly
            wrong, especially on AI Act specifics.
          </li>
          <li>
            This app does <strong>not</strong> prepare you for the parts most
            likely to eliminate you: the <strong>reasoning gate</strong>{" "}
            (verbal / numerical / abstract) and the{" "}
            <strong>EUFTE essay</strong>. Practise those on the official EPSO
            mocks and a validated platform &mdash; see the guide below.
          </li>
          <li>
            The field MCQ is a <strong>ranking</strong> test (top scorers get the
            240 places), not just pass/fail. Aim high, not just for 15/30.
          </li>
        </ul>
      </div>

      <StudyDashboard />
      <ProgressTools />

      <h2 className="mt-8 text-lg font-semibold">Field knowledge (the ranking test)</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {FIELD_TOPICS.map((t) => (
          <TopicCard key={t} topic={t} />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold">Reasoning (the gate)</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {REASONING_TOPICS.map((t) => (
          <TopicCard key={t} topic={t} />
        ))}
      </div>

      <AccessGate />
      <ByokPanel />

      <StudyExternallyPanel />
    </main>
  );
}
