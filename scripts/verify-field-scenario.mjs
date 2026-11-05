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
check("field prompt requires TWO-CONCEPT FUSION", /TWO-CONCEPT FUSION/.test(field.system));
check("ai-act prompt carries penalty-tier trap (99(3)/99(4))", /99\(3\)/.test(field.user) && /99\(4\)/.test(field.user));
check("ai-act prompt carries provider/deployer scope-swap trap", /PROVIDER/.test(field.user) && /DEPLOYER/.test(field.user));

// 1b) Topic-specific named traps appear for mlops and trustworthy-ai.
const mlops = buildGenerationPrompt("mlops", 5, undefined, "hard", "en");
check("mlops prompt carries P(X) vs P(Y|X) drift trap", /P\(X\)/.test(mlops.user) && /P\(Y\|X\)/.test(mlops.user));
const trust = buildGenerationPrompt("trustworthy-ai", 5, undefined, "hard", "en");
check("trustworthy-ai prompt carries PR-AUC vs accuracy trap", /PR-AUC/.test(trust.user));
check("trustworthy-ai prompt carries parity vs equalized-odds trap", /Equalized Odds/i.test(trust.user));

// 1c) New genai-rag + policy named traps.
const rag = buildGenerationPrompt("genai-rag", 5, undefined, "hard", "en");
check("genai-rag prompt carries prompt-injection/tool-authority trap", /PROMPT-INJECTION/.test(rag.user) && /TOOL-AUTHORITY/.test(rag.user));
check("genai-rag prompt references OWASP", /OWASP/.test(rag.user));
check("genai-rag prompt carries fine-tune vs RAG vs prompt trap", /FINE-TUNE vs RAG vs PROMPT/.test(rag.user));
const policy = buildGenerationPrompt("policy", 5, undefined, "hard", "en");
check("policy prompt carries model-vs-system legal-distinction trap", /MODEL vs SYSTEM/.test(policy.user));

// 1d) Exhibit (table) + paired-definition field formats.
check("field prompt requests EXHIBIT FORMAT", /EXHIBIT FORMAT/.test(field.system));
check("field prompt output shape allows a table", /"table":\{"caption"/.test(field.system));
check("field prompt requests PAIRED-DEFINITION variant", /PAIRED-DEFINITION/.test(field.system));

// 1e) An exhibit (table) field item validates and keeps its table.
const exhibit = JSON.stringify({ questions: [{
  stem: "A team selects feedback for retraining an assistant. Its protocol requires independently verified labels and an evaluation set containing neither training cases nor paraphrases of them. Which preparation plan best supports a valid release decision?",
  table: {
    caption: "Available evidence",
    headers: ["Source", "Volume", "Quality or overlap finding"],
    rows: [
      ["Public positive ratings", "1,200", "No independent verification; 720 from 12 accounts"],
      ["Staff corrected answers", "180", "Independently checked; 40 paraphrase locked benchmark"],
      ["Locked benchmark", "300", "Questions were visible to staff preparing corrections"],
      ["Fresh production sample", "240", "Covers both channels; labels not yet collected"],
    ],
  },
  choices: {
    A: "Train on all ratings and corrections; evaluate on the locked benchmark.",
    B: "Verify and deduplicate feedback, exclude benchmark-related cases from training, and independently label a fresh sample covering both channels.",
    C: "Train only on checked corrections; evaluate on the full locked benchmark.",
    D: "Train on deduplicated public ratings; evaluate on staff corrections.",
  },
  answer: "B",
  difficulty: "hard",
  language: "en",
  explanation: "B is correct: verify + deduplicate + exclude benchmark paraphrases + freshly label a held-out sample. A/C contaminate evaluation via the 40 benchmark paraphrases; D assumes channel difference guarantees independence.",
  optionNotes: {
    A: { verdict: "false", note: "Positive ratings lack verified labels and the benchmark is contaminated by staff-visible questions." },
    B: { verdict: "true", note: "Only B satisfies both constraints: verified labels and an evaluation set free of training cases and their paraphrases." },
    C: { verdict: "false", note: "The 40 benchmark paraphrases in the corrections invalidate evaluating on the full benchmark." },
    D: { verdict: "false", note: "Different channels do not guarantee independent ground truth or non-overlap." },
  },
}] });
const parsedExhibit = parseQuestions(exhibit, "mlops", "hard", "en", { mode: "preserve" });
check("exhibit item validates", parsedExhibit.length === 1, `got ${parsedExhibit.length}`);
check("exhibit table preserved", !!parsedExhibit[0]?.table && parsedExhibit[0].table.rows.length === 4);

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

// 1f) optionNotes RANK: prompt asks for it, and a parsed item keeps ranks
// aligned to options after position-balancing (the correct slot keeps rank -1).
check("field prompt requests a temptingness rank", /"rank":number/.test(field.system) && /most plausible trap/.test(field.system));
const ranked = JSON.stringify({ questions: [{
  stem: "A deployer of a high-risk AI system notices its logging has silently failed for a week. What should they do first?",
  choices: {
    A: "Restore logging and preserve/record the gap, then assess impact — logging is a deployer duty under the AI Act.",
    B: "Do nothing; logging is solely the provider's responsibility.",
    C: "Switch the system off permanently to be safe.",
    D: "Delete the incomplete logs so the record looks consistent.",
  },
  answer: "A", difficulty: "hard", language: "en",
  explanation: "A is correct: deployers must keep logs; restore and record the gap. B wrong (deployer duty). C overreaction. D is tampering.",
  optionNotes: {
    A: { verdict: "true", note: "Deployers must ensure logging and address gaps.", rank: -1 },
    B: { verdict: "false", note: "Confuses provider and deployer duties — the most tempting trap here.", rank: 0 },
    C: { verdict: "false", note: "Disproportionate; not required.", rank: 1 },
    D: { verdict: "false", note: "Tampering with records is clearly wrong.", rank: 2 },
  },
}] });
const rq = parseQuestions(ranked, "ai-act", "hard", "en", { mode: "balance", prevSlot: "C" })[0];
check("rank preserved on correct option = -1", rq.optionNotes[rq.answer]?.rank === -1, `rank=${rq.optionNotes[rq.answer]?.rank}`);
const wrongRanks = Object.entries(rq.optionNotes).filter(([k]) => k !== rq.answer).map(([, n]) => n.rank).sort();
check("wrong options keep ranks 0,1,2 after balancing", JSON.stringify(wrongRanks) === "[0,1,2]", JSON.stringify(wrongRanks));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
