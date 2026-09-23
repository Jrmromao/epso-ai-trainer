import { redirect } from "next/navigation";
import { TOPIC_LABELS, type Topic } from "@/lib/types";
import { SEED_QUESTIONS } from "@/data/questions";
import MockSession from "@/components/MockSession";

const VALID_TOPICS = new Set<Topic>([
  "ai-act",
  "ml-fundamentals",
  "genai-rag",
  "mlops",
  "trustworthy-ai",
  "policy",
  "verbal",
  "verbal-rc",
  "numerical",
]);

export default async function MockPage({
  params,
}: {
  params: Promise<{ topic: string }>;
}) {
  const { topic } = await params;

  if (!VALID_TOPICS.has(topic as Topic)) {
    redirect("/");
  }

  const t = topic as Topic;
  const questions = SEED_QUESTIONS.filter((q) => q.topic === t);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">{TOPIC_LABELS[t]} &mdash; Mock</h1>
      <MockSession topic={t} seeded={questions} />
    </main>
  );
}
