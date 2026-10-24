// Verification of answer-position balancing + cross-generation history.
// Run: npx tsx scripts/verify-answer-balance.mjs
import { parseQuestions, balanceQuestionPositions, correctPositionsOf } from "../src/lib/questionSchema.ts";
import { lastCorrectPosition, recordCorrectPositions, __resetAnswerPositionHistory } from "../src/lib/answerPositionHistory.ts";

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
}

// Build a batch of simple field-MCQ items, all with correct answer at A, as the
// LLM tends to produce. The balancer must spread these across A-D.
function mkBatch(n) {
  const questions = Array.from({ length: n }, (_, i) => ({
    stem: `Question ${i} about an AI governance concept that is long enough to pass validation and be realistic.`,
    choices: {
      A: `Correct answer ${i} — the right concept applies here in this situation.`,
      B: `Distractor one ${i} — plausible but wrong on one scope detail entirely.`,
      C: `Distractor two ${i} — true but incomplete for this particular context.`,
      D: `Distractor three ${i} — correct in a different context, not this one.`,
    },
    answer: "A",
    difficulty: "medium",
    language: "en",
    explanation: `Option A is correct because it applies. Option B fails on scope. Option C is incomplete. Option D is off-context.`,
  }));
  return JSON.stringify({ questions });
}

// 1) Even distribution across A-D for a batch of 12 all-A items.
const batch = parseQuestions(mkBatch(12), "ai-act", "medium", "en", { mode: "balance", prevSlot: null });
check("batch size preserved", batch.length === 12, `got ${batch.length}`);
const positions = correctPositionsOf(batch);
const dist = positions.reduce((m, p) => ((m[p] = (m[p] || 0) + 1), m), {});
console.log("   distribution:", JSON.stringify(dist));
const used = Object.keys(dist).length;
check("correct answers spread across >=3 positions", used >= 3, `used ${used} positions`);
const maxCount = Math.max(...Object.values(dist));
check("no single position dominates (<=5/12)", maxCount <= 5, `max ${maxCount}`);

// 2) No two CONSECUTIVE questions share the same correct position.
let adjacentRepeat = false;
for (let i = 1; i < positions.length; i++) if (positions[i] === positions[i - 1]) adjacentRepeat = true;
check("no consecutive same-position correct answers", !adjacentRepeat, positions.join(","));

// 3) The correct option still points at the real correct content after placement.
const first = batch[0];
check("correct content preserved after move", first.choices[first.answer].startsWith("Correct answer 0"), `answer=${first.answer}`);

// 4) optionNotes / letter refs remap: build an item with a letter reference and
//    per-option notes, ensure the explanation letter matches the new answer slot.
const withNotes = JSON.stringify({ questions: [{
  stem: "A scenario long enough to pass validation describing an AI deployment in an EU agency context here.",
  choices: { A: "Right one here.", B: "Wrong one here.", C: "Another wrong one.", D: "Yet another wrong." },
  answer: "A",
  difficulty: "medium", language: "en",
  explanation: "option A is correct; option B is wrong.",
  optionNotes: { A: { verdict: "true", note: "A is right." }, B: { verdict: "false", note: "B is wrong." },
    C: { verdict: "false", note: "C wrong." }, D: { verdict: "false", note: "D wrong." } },
}] });
const r = parseQuestions(withNotes, "ai-act", "medium", "en", { mode: "balance", prevSlot: "A" })[0];
check("single item with prevSlot=A does not stay at A", r.answer !== "A", `answer=${r.answer}`);
check("correct optionNote follows the moved correct answer", r.optionNotes[r.answer]?.verdict === "true", JSON.stringify(r.optionNotes));

// 5) Cross-generation history: record then read back; next batch's first item
//    should avoid repeating the recorded last position.
__resetAnswerPositionHistory();
recordCorrectPositions("ai-act", "en", ["A", "B", "C"]);
check("lastCorrectPosition returns most recent", lastCorrectPosition("ai-act", "en") === "C");
const next = parseQuestions(mkBatch(1), "ai-act", "medium", "en", { mode: "balance", prevSlot: lastCorrectPosition("ai-act", "en") })[0];
check("single new question avoids previous position (C)", next.answer !== "C", `answer=${next.answer}`);

// 6) "preserve" mode leaves positions untouched (for the harden pipeline).
const preserved = parseQuestions(mkBatch(4), "ai-act", "medium", "en", { mode: "preserve" });
check("preserve mode keeps all answers at A", preserved.every((q) => q.answer === "A"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
