import { redirect } from "next/navigation";
import { TOPIC_LABELS, type Topic } from "@/lib/types";
import { SEED_QUESTIONS } from "@/data/questions";
import { STUDY_CONTENT } from "@/data/studyContent";
import StudyMode from "@/components/StudyMode";

// Study mode is for the field-knowledge topics (the ranking test).
const STUDY_TOPICS = new Set<Topic>([
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
]);

export default async function StudyPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;
  const t = topic as Topic;
  if (!STUDY_TOPICS.has(t) || !STUDY_CONTENT[t]) {
    redirect("/");
  }

  const content = STUDY_CONTENT[t]!;
  const seeded = SEED_QUESTIONS.filter((q) => q.topic === t);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">{TOPIC_LABELS[t]} &mdash; Study</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Learn the concepts, then test yourself. Field knowledge is the ranking
        test &mdash; understanding beats memorising.
      </p>
      <StudyMode content={content} seedQuestions={seeded} topicLabel={TOPIC_LABELS[t]} />
      <div className="mt-6">
        <a
          href={`/mock/${t}`}
          className="inline-block rounded bg-neutral-900 px-4 py-2 text-sm text-white"
        >
          Ready? Take a timed mock on {TOPIC_LABELS[t]} &rarr;
        </a>
      </div>
    </main>
  );
}
