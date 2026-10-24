// Verify level-aware study plans: beginner = foundations-first phased ramp;
// intermediate/advanced = existing adaptive weak-area plan.
// Run: npx tsx scripts/verify-study-plan.mjs
import { buildWeeklyPlan, toComponentStatuses } from "../src/lib/studyPlan.ts";

let pass = 0, fail = 0;
const check = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

// A fresh beginner: no practice history at all.
const emptyStatuses = toComponentStatuses([]);

// 1) Beginner plan is phased and learn-first.
const beginner = buildWeeklyPlan(emptyStatuses, 0, { daysPerWeek: 5, minutesPerSession: 30, level: "beginner" });
check("beginner plan produced blocks", beginner.length > 0, `${beginner.length} blocks`);
check("beginner day 1 is a LEARN (study) block", beginner[0].phase === 1 && beginner[0].mode === "study", JSON.stringify({ phase: beginner[0].phase, mode: beginner[0].mode }));
check("beginner day 1 starts with field-ai concepts", beginner[0].component === "field-ai");
const phases = beginner.map((b) => b.phase);
check("beginner plan ramps through phases in order", phases.every((p, i) => i === 0 || p >= phases[i - 1]), phases.join(","));
check("beginner plan ends with a timed exam-conditions block (phase 3)", beginner.some((b) => b.phase === 3 && b.technique === "interleaving"));
check("no timed interleaved mock before phase 3", !beginner.some((b) => b.technique === "interleaving" && b.phase !== 3));

// 2) Beginner with FEWER days still yields a valid (shorter) ramp.
const beginner3 = buildWeeklyPlan(emptyStatuses, 0, { daysPerWeek: 3, minutesPerSession: 20, level: "beginner" });
check("3-day beginner plan fits within 3 days", beginner3.length <= 3 && beginner3.every((b) => b.day <= 3), `${beginner3.length} blocks`);
check("3-day beginner plan still begins with a learn block", beginner3[0].phase === 1);

// 3) Intermediate uses the adaptive path (no phase tags, weak-area driven).
const intermediate = buildWeeklyPlan(emptyStatuses, 0, { daysPerWeek: 5, minutesPerSession: 30, level: "intermediate" });
check("intermediate plan produced blocks", intermediate.length > 0);
check("intermediate blocks have NO phase tags", intermediate.every((b) => b.phase === undefined));

// 4) Advanced also adaptive.
const advanced = buildWeeklyPlan(emptyStatuses, 0, { daysPerWeek: 5, minutesPerSession: 30, level: "advanced" });
check("advanced plan has no phase tags (adaptive)", advanced.every((b) => b.phase === undefined));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
