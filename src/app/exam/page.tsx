"use client";

import { useState } from "react";
import type { Difficulty, Question } from "@/lib/types";
import ExamRunner from "@/components/ExamRunner";
import { llmHeaders } from "@/lib/userKey";

interface ExamData {
  questions: Question[];
  durationSeconds: number;
  liveCount: number;
  total: number;
  source: string;
}

type DifficultyMode = Difficulty | "mix";

const DIFFICULTY_OPTIONS: { value: DifficultyMode; label: string; description: string }[] = [
  { value: "easy",   label: "Easy",   description: "Core concepts, clear distractors" },
  { value: "medium", label: "Medium", description: "EPSO-style traps, requires domain knowledge" },
  { value: "hard",   label: "Hard",   description: "All options defensible, precise recall needed" },
  { value: "mix",    label: "Mix",    description: "10 easy · 10 medium · 10 hard" },
];

export default function ExamPage() {
  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [difficultyMode, setDifficultyMode] = useState<DifficultyMode>("mix");

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/exam", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ difficulty: difficultyMode }),
      });
      if (res.status === 401) {
        setError(
          "Locked — enter your access code, or set your own key (BYOK), on the home page.",
        );
        return;
      }
      const data = (await res.json()) as ExamData;
      if (!data.questions || data.questions.length === 0) {
        setError("Could not build the exam. Try again.");
        return;
      }
      setExam(data);
    } catch {
      setError("Failed to start the exam — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  if (exam) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-bold">Field MCQ Exam</h1>
        <p className="text-sm text-neutral-500">
          {exam.total} questions · 40 minutes · pass 15/30
          {exam.source !== "llm" &&
            ` · ${exam.liveCount} live-generated, rest from seed`}
        </p>
        <ExamRunner
          questions={exam.questions}
          durationSeconds={exam.durationSeconds}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:underline">
        &larr; Back to topics
      </a>
      <h1 className="mt-2 text-3xl font-bold">Field MCQ Exam</h1>
      <p className="mt-3 text-neutral-600">
        Full simulation of the EPSO/AD/430/26 field-related MCQ test:
      </p>
      <ul className="mt-2 list-disc pl-5 text-neutral-700">
        <li>30 questions across all AI field topics</li>
        <li>40-minute overall timer (authoritative)</li>
        <li>Per-question pace indicator (~80s target)</li>
        <li>Pass mark: 15/30</li>
      </ul>

      {/* Difficulty selector */}
      <div className="mt-5">
        <p className="text-sm font-medium text-neutral-700">Difficulty</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DIFFICULTY_OPTIONS.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => setDifficultyMode(value)}
              className={`rounded-lg border p-3 text-left transition ${
                difficultyMode === value
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white hover:border-neutral-900"
              }`}
            >
              <div className="font-semibold text-sm">{label}</div>
              <div className={`mt-0.5 text-xs ${difficultyMode === value ? "text-neutral-300" : "text-neutral-500"}`}>
                {description}
              </div>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Questions are generated live &mdash; this takes ~30&ndash;60 seconds and
        requires an unlocked session (enter your access code on the home page).
      </p>

      <button
        onClick={start}
        disabled={loading}
        className="mt-5 rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
      >
        {loading ? "Generating 30 questions…" : "Start exam"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}
