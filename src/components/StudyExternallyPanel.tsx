"use client";

import { useEffect, useState } from "react";

// Persistent reminder of what the app does NOT train (spec AC7).
// Abstract reasoning is visual + LLM-unreliable, so it is tracking-only:
// links to validated sources + self-reported score logging (localStorage).

const STORAGE_KEY = "epso.externalScores";

interface ExternalScore {
  date: string;
  source: string;
  score: string;
}

export default function StudyExternallyPanel() {
  const [scores, setScores] = useState<ExternalScore[]>([]);
  const [source, setSource] = useState("Official EPSO mock");
  const [score, setScore] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setScores(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, []);

  function persist(next: ExternalScore[]) {
    setScores(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function logScore() {
    if (!score.trim()) return;
    const entry: ExternalScore = {
      date: new Date().toISOString().slice(0, 10),
      source,
      score: score.trim(),
    };
    persist([entry, ...scores].slice(0, 20));
    setScore("");
  }

  return (
    <section className="mt-10 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <h2 className="font-semibold text-amber-900">
        Study externally &mdash; not covered by this app
      </h2>
      <p className="mt-1 text-amber-800">
        This trainer cannot generate <strong>abstract reasoning</strong> (visual
        figure questions). Learn the techniques in the{" "}
        <a href="/tutorials/abstract-reasoning" className="font-medium underline">
          abstract reasoning guide
        </a>
        , then practise the actual figures on validated sources and log your
        scores here.
      </p>
      <ul className="mt-2 list-disc pl-5 text-amber-800">
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
            Official reasoning mock (PDF)
          </a>
        </li>
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="rounded border border-amber-300 bg-white px-2 py-1"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option>Official EPSO mock</option>
          <option>Practice platform</option>
        </select>
        <input
          className="w-28 rounded border border-amber-300 bg-white px-2 py-1"
          placeholder="e.g. 8/10"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <button
          className="rounded bg-amber-600 px-3 py-1 text-white hover:bg-amber-700"
          onClick={logScore}
        >
          Log score
        </button>
      </div>

      {scores.length > 0 && (
        <ul className="mt-3 space-y-1 text-amber-800">
          {scores.map((s, i) => (
            <li key={i}>
              {s.date} &mdash; {s.source}: <strong>{s.score}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
