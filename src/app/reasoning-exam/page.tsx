import ReasoningExamRunner from "@/components/ReasoningExamRunner";

export default function ReasoningExamPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">Reasoning Mock &mdash; Part 1</h1>
      <p className="mt-1 text-sm text-neutral-500">
        10 verbal · 10 numerical · 10 abstract, timed to the real EPSO pace.
      </p>
      <ReasoningExamRunner />
    </main>
  );
}
