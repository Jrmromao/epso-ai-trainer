import AbstractRunner from "@/components/AbstractRunner";

export default function AbstractPracticePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">Abstract Reasoning &mdash; Practice</h1>
      <AbstractRunner />
    </main>
  );
}
