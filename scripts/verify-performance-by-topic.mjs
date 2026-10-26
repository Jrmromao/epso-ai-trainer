// Verify per-topic performance breakdown: grouping, percentages, color bands,
// weakest-first ordering, skip handling.
// Run: npx tsx scripts/verify-performance-by-topic.mjs
import { toTopicStats, performanceBand } from "../src/lib/performanceByTopic.ts";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const rec = (topic, isCorrect, chosen = "A") => ({ questionId: Math.random().toString(), topic, chosen, correct: "A", isCorrect });

// Mixed run: ai-act 3/4 (75%), numerical 1/4 (25%), verbal 2/2 (100%).
const records = [
  rec("ai-act", true), rec("ai-act", true), rec("ai-act", true), rec("ai-act", false),
  rec("numerical", true), rec("numerical", false), rec("numerical", false), rec("numerical", null, null),
  rec("verbal", true), rec("verbal", true),
];

const stats = toTopicStats(records);
check("groups into 3 topics", stats.length === 3, stats.map((s) => s.topic).join(","));

const byTopic = Object.fromEntries(stats.map((s) => [s.topic, s]));
check("ai-act is 75% (3/4)", byTopic["ai-act"].pct === 75 && byTopic["ai-act"].correct === 3);
check("numerical is 25% (1/4, skip counts as wrong)", byTopic["numerical"].pct === 25 && byTopic["numerical"].total === 4);
check("verbal is 100% (2/2)", byTopic["verbal"].pct === 100);

// Weakest-first ordering: numerical(25) < ai-act(75) < verbal(100).
check("sorted weakest-first", stats[0].topic === "numerical" && stats[2].topic === "verbal", stats.map((s) => `${s.topic}:${s.pct}`).join(" "));

// Color bands.
check("<50 is red 'Needs work'", performanceBand(25).bar === "bg-red-500" && performanceBand(49).label === "Needs work");
check("50-74 is amber 'Borderline'", performanceBand(50).bar === "bg-amber-500" && performanceBand(74).label === "Borderline");
check(">=75 is green 'Solid'", performanceBand(75).bar === "bg-green-500" && performanceBand(100).label === "Solid");

// Empty run -> no stats (component renders nothing).
check("empty records -> no stats", toTopicStats([]).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
