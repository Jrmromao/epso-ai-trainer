import EufteRunner from "@/components/EufteRunner";

export default function EuftePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-2xl font-bold">EUFTE &mdash; Essay on EU Matters</h1>
      <EufteRunner />
    </main>
  );
}
