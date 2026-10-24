// Standalone verification of the numerical consistency gate against the
// real-world broken item the user reported, plus control cases.
// Run with: npx tsx scripts/verify-numerical-gate.mjs
import { validateQuestion } from "../src/lib/questionSchema.ts";

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} (got ${actual}, expected ${expected})`);
  ok ? pass++ : fail++;
}

// 1) The reported broken item: correct compound answer (32,1% / 1,05x) is NOT
//    in the options; key is E (32,1% / 1,6x). Must be REJECTED (null).
const broken = {
  stem: "Qual foi, entre 2018 e 2023, a variação percentual da despesa de I&D executada pelas empresas, e quantas vezes essa variação excede a variação percentual registada no setor do ensino superior no mesmo período?",
  table: {
    caption: "I&D — despesa interna bruta por setor, 2018 e 2023",
    headers: ["Setor", "2018 (M EUR)", "2023 (M EUR)"],
    rows: [["Empresas", "148 620", "196 340"], ["Ensino superior", "68 415", "89 270"]],
  },
  choices: {
    A: "A variação das empresas foi de 24,3%, ou seja, cerca de 1,2 vezes a do ensino superior.",
    B: "A variação das empresas foi de 47,7%, ou seja, cerca de 2,4 vezes a do ensino superior.",
    C: "A variação das empresas foi de 30,5%, ou seja, cerca de 1,0 vez a do ensino superior.",
    D: "A variação das empresas foi de 32,1%, ou seja, cerca de 3,2 vezes a do ensino superior.",
    E: "A variação das empresas foi de 32,1%, ou seja, cerca de 1,6 vezes a do ensino superior.",
  },
  answer: "E",
  explanation: "A variação das empresas é 32,11% e a do ensino superior 30,48%; o rácio é 1,05.",
  workedSolution:
    "196 340 − 148 620 = 47 720. 47 720 / 148 620 = 0,3211 (32,11%). (89 270 − 68 415) / 68 415 = 30,48%. Rácio = 32,11 / 30,48 = 1,05.",
  difficulty: "hard",
  language: "pt-PT",
};
check("reported broken item is rejected", validateQuestion(broken, "numerical", "hard", "pt-PT") === null ? null : "NOT-NULL", null);

// 2) Self-contradiction: worked solution says "a resposta correta é D" but key is E.
const contradiction = {
  ...broken,
  // Make the compound answer actually present so ONLY the contradiction gate fires.
  choices: { ...broken.choices, E: "A variação das empresas foi de 32,1%, ou seja, cerca de 1,05 vezes a do ensino superior." },
  workedSolution: broken.workedSolution + " A resposta correta é D.",
};
check("self-contradiction (says D, key E) rejected", validateQuestion(contradiction, "numerical", "hard", "pt-PT") === null ? null : "NOT-NULL", null);

// 3) Valid compound item: E holds the correct 32,1% / 1,05x and is keyed. Must SURVIVE.
const validCompound = {
  ...broken,
  choices: { ...broken.choices, E: "A variação das empresas foi de 32,1%, ou seja, cerca de 1,05 vezes a do ensino superior." },
  answer: "E",
};
const r3 = validateQuestion(validCompound, "numerical", "hard", "pt-PT");
check("valid compound item survives", r3 === null ? "NULL" : "KEPT", "KEPT");

// 4) Valid single-value item (sanity: gate still lets normal items through).
const single = {
  stem: "Qual foi a variação percentual da despesa das empresas entre 2018 e 2023?",
  table: { caption: "I&D", headers: ["Setor", "2018", "2023"], rows: [["Empresas", "148 620", "196 340"]] },
  choices: { A: "24,3%", B: "47,7%", C: "30,5%", D: "32,1%", E: "Impossível responder" },
  answer: "D",
  explanation: "47 720 / 148 620 = 32,1%.",
  workedSolution: "196 340 − 148 620 = 47 720. 47 720 / 148 620 = 0,321 = 32,1%.",
  difficulty: "hard",
  language: "pt-PT",
};
const r4 = validateQuestion(single, "numerical", "hard", "pt-PT");
check("valid single-value item survives", r4 === null ? "NULL" : "KEPT", "KEPT");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
