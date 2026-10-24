// Verify field-MCQ scenario format: prompt contains scenario + optionNotes
// directives, and a scenario item with optionNotes validates and keeps notes.
// Run: npx tsx scripts/verify-field-scenario.mjs
import { buildGenerationPrompt, parseQuestions } from "../src/lib/questionSchema.ts";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// 1) Field topic prompt includes scenario + optionNotes instructions.
const field = buildGenerationPrompt("ai-act", 5, undefined, "hard", "en");
check("field prompt requests SCENARIO FORMAT", /SCENARIO FORMAT/.test(field.system));
check("field prompt requests optionNotes", /optionNotes/.test(field.system));
check("field prompt output shape includes optionNotes", /"optionNotes":\{/.test(field.system));

// 2) Verbal T/F prompt does NOT get the scenario block (it has a fixed format).
const verbal = buildGenerationPrompt("verbal", 5, undefined, "medium", "en");
check("verbal T/F prompt has NO scenario block", !/SCENARIO FORMAT/.test(verbal.system));
check("verbal T/F prompt has NO optionNotes", !/optionNotes/.test(verbal.system));

// 3) A scenario-format field item with optionNotes validates and keeps notes.
const item = JSON.stringify({ questions: [{
  stem: "A public-sector body in an EU Member State plans to deploy an AI system that scores citizens' eligibility for social-security benefits. Before go-live the compliance team is mapping obligations under the AI Act. How should the system be classified and what follows?",
  choices: {
    A: "High-risk under Annex III; a conformity assessment must be completed before it is placed on the market.",
    B: "A prohibited practice under Article 5; it cannot be deployed at all.",
    C: "Minimal-risk; only voluntary codes of conduct apply.",
    D: "A GPAI model; the provider must publish a training-data summary.",
  },
  answer: "A",
  difficulty: "hard",
  language: "en",
  explanation: "Eligibility scoring for essential public benefits is an Annex III high-risk use; option A is correct. B overreaches (Article 5 covers specific prohibited uses). C misclassifies the risk tier. D confuses a use-case system with a GPAI model.",
  optionNotes: {
    A: { verdict: "true", note: "In this scenario the system decides access to essential public services, placing it in Annex III high-risk — a conformity assessment is required first." },
    B: { verdict: "false", note: "Article 5 prohibitions (e.g. social scoring by public authorities) are narrower; benefit-eligibility scoring is regulated as high-risk, not banned here." },
    C: { verdict: "false", note: "Minimal-risk misreads the stakes — denying benefits materially affects individuals, so voluntary codes do not suffice." },
    D: { verdict: "false", note: "GPAI obligations target general-purpose models, not this specific deployed use-case system." },
  },
}] });

const parsed = parseQuestions(item, "ai-act", "hard", "en", { mode: "balance", prevSlot: "A" });
check("scenario item validates", parsed.length === 1, `got ${parsed.length}`);
const q = parsed[0];
check("optionNotes preserved", !!q.optionNotes && Object.keys(q.optionNotes).length === 4);
check("exactly one TRUE verdict", Object.values(q.optionNotes).filter((n) => n.verdict === "true").length === 1);
check("TRUE verdict is on the correct answer slot", q.optionNotes[q.answer]?.verdict === "true", `answer=${q.answer}`);
check("prevSlot=A respected (not A)", q.answer !== "A", `answer=${q.answer}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
