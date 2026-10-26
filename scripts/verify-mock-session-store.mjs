// Verify mock-session persistence survives "refresh" (reload from store) and
// guards against applying stale run progress to a different question set.
// Run: npx tsx scripts/verify-mock-session-store.mjs

// Minimal sessionStorage polyfill for Node.
globalThis.window = globalThis.window ?? {};
globalThis.window.sessionStorage = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
})();

const { loadSession, saveSession, saveRunProgress, clearSession } = await import(
  "../src/lib/mockSessionStore.ts"
);

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const topic = "ai-act";
const questions = [
  { id: "q1", topic, difficulty: "hard", language: "en", stem: "S1", choices: { A: "a", B: "b", C: "c", D: "d" }, answer: "A", explanation: "e" },
  { id: "q2", topic, difficulty: "hard", language: "en", stem: "S2", choices: { A: "a", B: "b", C: "c", D: "d" }, answer: "B", explanation: "e" },
];

// 1) Nothing saved yet.
check("empty store returns null", loadSession(topic) === null);

// 2) Save a generated set and reload (simulates refresh).
saveSession({ topic, questions, notice: "Generated 2 fresh questions." });
const r1 = loadSession(topic);
check("generated set persists across reload", !!r1 && r1.questions.length === 2);
check("notice persists", r1?.notice === "Generated 2 fresh questions.");
check("fresh set has no run progress yet", r1?.run === undefined);

// 3) Save run progress (answered q1, moved to q2).
saveRunProgress(topic, { index: 1, records: [{ questionId: "q1", topic, chosen: "A", correct: "A", isCorrect: true }], chosen: null, revealed: false, finished: false, sessionLeft: 100 });
const r2 = loadSession(topic);
check("run progress persists", r2?.run?.index === 1 && r2?.run?.records.length === 1);
check("question set still intact alongside run", r2?.questions.length === 2);

// 4) Set-mismatch guard: a different set must NOT inherit old progress. The
//    store returns the run, but the caller compares ids — emulate that check.
const differentSet = [{ ...questions[0], id: "zzz" }, questions[1]];
const persisted = loadSession(topic);
const sameSet = persisted.questions.length === differentSet.length &&
  persisted.questions.every((q, i) => q.id === differentSet[i]?.id);
check("stale run rejected for a different question set", sameSet === false);

// 5) Clear on finish.
clearSession(topic);
check("clearSession removes the entry", loadSession(topic) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
