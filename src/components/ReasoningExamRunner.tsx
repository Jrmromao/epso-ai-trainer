"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChoiceKey, Difficulty, Question, QuestionLanguage } from "@/lib/types";
import { isNumerical } from "@/lib/types";
import { type AbstractDifficulty, type AbstractQuestion, generateAbstractQuestion } from "@/lib/abstractReasoning";
import AbstractPanel from "@/components/AbstractPanel";
import QuestionTableView from "@/components/QuestionTableView";
import QuestionTimer from "@/components/QuestionTimer";
import { SECONDS_PER_QUESTION } from "@/lib/timing";
import { llmHeaders } from "@/lib/userKey";

// Full EPSO Part 1 reasoning mock: 10 verbal + 10 numerical + 10 abstract,
// each section with its own EPSO-accurate per-question budget. Difficulty
// selectable. Verbal/numerical come from the LLM; abstract is generated
// locally (no LLM). A combined per-section report at the end.

const CHOICE_KEYS: ChoiceKey[] = ["A", "B", "C", "D", "E"];
const OPTION_LETTERS = ["A", "B", "C", "D", "E"];
const COUNT = 10;

type Section = "verbal" | "numerical" | "abstract";
const SECTION_ORDER: Section[] = ["verbal", "numerical", "abstract"];
const SECTION_LABEL: Record<Section, string> = {
  verbal: "Verbal Reasoning",
  numerical: "Numerical Reasoning",
  abstract: "Abstract Reasoning",
};
const SECTION_BUDGET: Record<Section, number> = {
  verbal: SECONDS_PER_QUESTION.verbal,
  numerical: SECONDS_PER_QUESTION.numerical,
  abstract: SECONDS_PER_QUESTION.abstract,
};

// A unified answer record across all three sections.
interface Rec {
  section: Section;
  correctIndex: number; // 0-based correct option
  chosenIndex: number | null;
  isCorrect: boolean;
}

export default function ReasoningExamRunner() {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [language, setLanguage] = useState<QuestionLanguage>("pt-PT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // generated content
  const [verbal, setVerbal] = useState<Question[]>([]);
  const [numerical, setNumerical] = useState<Question[]>([]);
  const [abstract, setAbstract] = useState<AbstractQuestion[]>([]);

  // run state
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(SECONDS_PER_QUESTION.verbal);
  const [records, setRecords] = useState<Rec[]>([]);

  const section = SECTION_ORDER[sectionIdx];
  const budget = SECTION_BUDGET[section];

  // Current question's option count + correct index, abstracted over the 3 types.
  function currentMeta(): { optionCount: number; correctIndex: number } | null {
    if (section === "abstract") {
      const q = abstract[qIdx];
      if (!q) return null;
      return { optionCount: 5, correctIndex: q.answerIndex };
    }
    const q = (section === "verbal" ? verbal : numerical)[qIdx];
    if (!q) return null;
    const keys = CHOICE_KEYS.filter((k) => {
      const label = q.choices[k];
      return label && label !== "-" && label !== "(unused)";
    });
    const correctIndex = keys.indexOf(q.answer);
    return { optionCount: keys.length, correctIndex };
  }

  const commit = useCallback(
    (pick: number | null) => {
      const meta = currentMeta();
      if (!meta) return;
      setRecords((r) => [
        ...r,
        {
          section,
          correctIndex: meta.correctIndex,
          chosenIndex: pick,
          isCorrect: pick === meta.correctIndex,
        },
      ]);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section, qIdx, verbal, numerical, abstract],
  );

  const advance = useCallback(() => {
    // move within section, or to next section, or finish
    const total = section === "verbal" ? verbal.length : section === "numerical" ? numerical.length : abstract.length;
    if (qIdx + 1 < total) {
      setQIdx((i) => i + 1);
    } else if (sectionIdx + 1 < SECTION_ORDER.length) {
      const next = SECTION_ORDER[sectionIdx + 1];
      setSectionIdx((s) => s + 1);
      setQIdx(0);
      setSecondsLeft(SECTION_BUDGET[next]);
    } else {
      setFinished(true);
      return;
    }
    setChosen(null);
    setSecondsLeft((prev) => prev); // set below by effect reset
  }, [section, qIdx, sectionIdx, verbal.length, numerical.length, abstract.length]);

  // Reset per-question timer whenever the question changes.
  useEffect(() => {
    if (!started || finished) return;
    setSecondsLeft(SECTION_BUDGET[SECTION_ORDER[sectionIdx]]);
  }, [sectionIdx, qIdx, started, finished]);

  // Countdown — auto-submit current (as a skip if unanswered) at 0.
  useEffect(() => {
    if (!started || finished) return;
    if (secondsLeft <= 0) {
      commit(chosen);
      advance();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, started, finished, chosen, commit, advance]);

  function submit() {
    commit(chosen);
    advance();
  }

  async function start() {
    setLoading(true);
    setError(null);
    try {
      // abstract locally
      const abs = Array.from({ length: COUNT }, () =>
        generateAbstractQuestion(difficulty as AbstractDifficulty),
      );
      // verbal + numerical from the API
      const res = await fetch("/api/reasoning-exam", {
        method: "POST",
        headers: llmHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ difficulty, language, harden: true }),
      });
      if (res.status === 401) {
        setError("Locked — enter your access code or key on the home page first.");
        return;
      }
      const data = (await res.json()) as { verbal?: Question[]; numerical?: Question[] };
      setVerbal(data.verbal ?? []);
      setNumerical(data.numerical ?? []);
      setAbstract(abs);
      setRecords([]);
      setSectionIdx(0);
      setQIdx(0);
      setChosen(null);
      setSecondsLeft(SECTION_BUDGET.verbal);
      setStarted(true);
      setFinished(false);
    } catch {
      setError("Failed to build the exam — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // ---- Start screen ----
  if (!started) {
    return (
      <div className="mt-6">
        <p className="text-neutral-600">
          A full EPSO Part 1 mock: <strong>10 verbal · 10 numerical · 10 abstract</strong>,
          each timed at the real EPSO pace. Verbal &amp; numerical are generated;
          abstract is generated locally. A per-section report at the end.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Verbal 105s/Q · Numerical 120s/Q · Abstract 60s/Q.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            Difficulty:
            <select
              className="rounded border border-neutral-300 px-2 py-1"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Language (verbal/numerical):
            <select
              className="rounded border border-neutral-300 px-2 py-1"
              value={language}
              onChange={(e) => setLanguage(e.target.value as QuestionLanguage)}
            >
              <option value="pt-PT">Português (PT)</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button
          onClick={start}
          disabled={loading}
          className="mt-5 rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
        >
          {loading ? "Building 30-question mock…" : "Start reasoning mock"}
        </button>
      </div>
    );
  }

  // ---- Result screen ----
  if (finished) {
    const bySection = (s: Section) => records.filter((r) => r.section === s);
    const scoreOf = (s: Section) => bySection(s).filter((r) => r.isCorrect).length;
    const totalCorrect = records.filter((r) => r.isCorrect).length;
    // EPSO-style pass marks: verbal 10/20 scaled => here 5/10; numerical+abstract combined 10/20 => here 10/20.
    return (
      <div className="mt-6">
        <h2 className="text-2xl font-bold">Reasoning mock complete</h2>
        <p className="mt-1 text-neutral-600">Overall: {totalCorrect}/30</p>
        <div className="mt-4 space-y-2">
          {SECTION_ORDER.map((s) => {
            const score = scoreOf(s);
            return (
              <div key={s} className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
                <span className="font-medium">{SECTION_LABEL[s]}</span>
                <span className="font-semibold tabular-nums">{score}/10</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Real EPSO gates: verbal needs 10/20 on its own; numerical + abstract are
          combined and need 10/20 together. Here numerical+abstract ={" "}
          <strong>{scoreOf("numerical") + scoreOf("abstract")}/20</strong>, verbal ={" "}
          <strong>{scoreOf("verbal") * 2}/20</strong> (scaled).
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setStarted(false)} className="rounded bg-neutral-900 px-4 py-2 text-white">
            New mock
          </button>
          <a href="/" className="rounded border border-neutral-300 px-4 py-2">Back to topics</a>
        </div>
      </div>
    );
  }

  // ---- Running: current question ----
  const totalInSection = section === "verbal" ? verbal.length : section === "numerical" ? numerical.length : abstract.length;
  const globalDone = records.length;

  return (
    <div className="mt-6">
      {/* Section header */}
      <div className="flex items-center justify-between text-sm text-neutral-500">
        <span>
          <span className="font-semibold text-neutral-800">{SECTION_LABEL[section]}</span>{" "}
          · Q {qIdx + 1}/{totalInSection} · overall {globalDone}/30
        </span>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs">
          Section {sectionIdx + 1}/3
        </span>
      </div>
      <QuestionTimer secondsLeft={secondsLeft} budget={budget} label="Time for this question" />

      {/* Question body */}
      <div className="mt-4">
        {section === "abstract" ? (
          <AbstractQ q={abstract[qIdx]} chosen={chosen} onPick={setChosen} />
        ) : (
          <McqQ q={(section === "verbal" ? verbal : numerical)[qIdx]} chosen={chosen} onPick={setChosen} />
        )}
      </div>

      <button
        onClick={submit}
        disabled={chosen === null}
        className="mt-4 rounded bg-neutral-900 px-5 py-2 text-white disabled:opacity-40"
      >
        {globalDone + 1 >= 30 ? "Finish" : "Submit & next"}
      </button>
    </div>
  );
}

// MCQ question (verbal / numerical) — chosen is an option index.
function McqQ({ q, chosen, onPick }: { q: Question; chosen: number | null; onPick: (i: number) => void }) {
  if (!q) return null;
  const keys = CHOICE_KEYS.filter((k) => {
    const label = q.choices[k];
    return label && label !== "-" && label !== "(unused)";
  });
  return (
    <div>
      {q.table && <QuestionTableView table={q.table} />}
      <p className="mt-2 whitespace-pre-line font-medium">{q.stem}</p>
      <div className="mt-3 space-y-2">
        {keys.map((k, i) => (
          <button
            key={k}
            onClick={() => onPick(i)}
            className={`block w-full rounded border p-3 text-left transition ${
              chosen === i ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-300 bg-white hover:border-neutral-900"
            }`}
          >
            <span className="font-semibold">{OPTION_LETTERS[i]}.</span> {q.choices[k]}
          </button>
        ))}
      </div>
    </div>
  );
}

// Abstract question — chosen is the option index.
function AbstractQ({ q, chosen, onPick }: { q: AbstractQuestion; chosen: number | null; onPick: (i: number) => void }) {
  if (!q) return null;
  return (
    <div>
      <p className="font-medium">Which figure completes the pattern?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {q.sequence.map((p, i) => (
          <AbstractPanel key={i} panel={p} size={96} />
        ))}
        <div className="flex h-[96px] w-[96px] items-center justify-center rounded border-2 border-dashed border-neutral-400 text-2xl text-neutral-400">
          ?
        </div>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {q.options.map((p, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
              chosen === i ? "border-neutral-900 ring-2 ring-neutral-900" : "border-neutral-300"
            }`}
          >
            <span className="text-xs font-semibold text-neutral-600">{OPTION_LETTERS[i]}</span>
            <AbstractPanel panel={p} size={82} />
          </button>
        ))}
      </div>
    </div>
  );
}
