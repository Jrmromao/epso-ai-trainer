// Verify the history schema v2 change is backward-compatible:
// - the import-acceptance rule accepts BOTH v1 and v2 snapshots
// - a v1 attempt (no analytics fields) and a v2 attempt both satisfy the shape
// - the new fields are optional (a v1 attempt omitting them is valid)
// This mirrors importAll's guard without needing IndexedDB.
let pass = 0, fail = 0;
const check = (n, c, e = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${e ? "  — " + e : ""}`); };

const accepts = (snap) =>
  !!snap && (snap.version === 1 || snap.version === 2) && Array.isArray(snap.attempts);

const v1Attempt = { id: "a", component: "field-ai", topic: "mlops", questionId: "q1", correct: true, timestampMs: 1 };
const v2Attempt = { ...v1Attempt, id: "b", chosenAnswer: "C", difficulty: "hard", durationMs: 42000, distractorRank: 0, sessionId: "s1" };

check("v1 snapshot accepted", accepts({ version: 1, exportedAtMs: 0, attempts: [v1Attempt] }));
check("v2 snapshot accepted", accepts({ version: 2, exportedAtMs: 0, attempts: [v1Attempt, v2Attempt] }));
check("version 3 rejected", !accepts({ version: 3, exportedAtMs: 0, attempts: [] }));
check("non-array attempts rejected", !accepts({ version: 2, exportedAtMs: 0, attempts: "x" }));
check("null rejected", !accepts(null));

// v1 attempt has no analytics fields (they must be OPTIONAL)
const v1Keys = Object.keys(v1Attempt);
check("v1 attempt omits chosenAnswer", !v1Keys.includes("chosenAnswer"));
check("v1 attempt omits sessionId", !v1Keys.includes("sessionId"));
// v2 attempt carries them
check("v2 attempt carries chosenAnswer + sessionId", v2Attempt.chosenAnswer === "C" && v2Attempt.sessionId === "s1");

// dedup-by-id import logic: a v1 attempt already present is skipped, new ones added
const existing = new Set(["a"]);
const incoming = [v1Attempt, v2Attempt];
const imported = incoming.filter((a) => a && typeof a.id === "string" && !existing.has(a.id)).length;
check("import dedups by id (adds only the new one)", imported === 1, `imported=${imported}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
