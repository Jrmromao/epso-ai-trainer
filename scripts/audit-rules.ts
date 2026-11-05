/* eslint-disable no-console */
// Rule-vs-reality audit: checks whether the ruleSummary's concrete claims match
// the transformation actually drawn across the 5 shown panels + the answer.
// This catches the "broken physics" class: a correct, unambiguous item whose
// stated rule does not describe what the figures do.

import {
  generateAbstractQuestion,
  type AbstractDifficulty,
  type AbstractQuestion,
  type Panel,
} from "../src/lib/abstractReasoning";

const DIFFICULTIES: AbstractDifficulty[] = ["easy", "medium", "hard", "extreme"];
const RUNS = 4000;

type Viol = { rule: string; detail: string; q: AbstractQuestion };
const viols: Viol[] = [];
const violCount: Record<string, number> = {};

function record(rule: string, detail: string, q: AbstractQuestion) {
  violCount[rule] = (violCount[rule] ?? 0) + 1;
  if (viols.filter((v) => v.rule === rule).length < 2) viols.push({ rule, detail, q });
}

// ---- SEGMENTS: "rotate one segment per step" + dot "travels" (moves) --------
function checkSegments(q: AbstractQuestion) {
  const panels = [...q.sequence, q.options[q.answerIndex]];
  if (!panels.every((p) => p.segments && p.dotPos !== undefined)) return;
  const L = panels[0].segments!.length;
  const rotate = (arr: string[], r: number) => arr.map((_, k) => arr[(((k - r) % L) + L) % L]);
  for (let i = 0; i + 1 < panels.length; i++) {
    const a = panels[i].segments!;
    const b = panels[i + 1].segments!;
    // find rotation taking a->b
    let r: number | null = null;
    for (let cand = 0; cand < L; cand++) {
      if (JSON.stringify(rotate(a, cand)) === JSON.stringify(b)) { r = cand; break; }
    }
    if (r === null) { record("segments:not-a-rotation", `step ${i}->${i + 1}`, q); return; }
    // rule claims ONE segment per step -> r must be 1 or L-1 (i.e. +/-1)
    if (!(r === 1 || r === L - 1)) {
      record("segments:rotation-not-one", `step ${i}->${i + 1} rot=${r} (rule says one segment)`, q);
    }
    const da = panels[i].dotPos!, db = panels[i + 1].dotPos!;
    const dd = ((db - da) % 8 + 8) % 8;
    if (!(dd === 1 || dd === 7)) {
      record("segments:dot-not-one", `step ${i}->${i + 1} dotStep=${dd} (rule: dot travels/moves)`, q);
    }
  }
}

// ---- GRID frames: "each shape moves one cell per step" ----------------------
const GRID_RING = [0, 1, 2, 5, 8, 7, 6, 3];
const cellToRing: Record<number, number> = {};
GRID_RING.forEach((cell, ringIdx) => (cellToRing[cell] = ringIdx));

function multisetMoves(a: Panel, b: Panel): number[] | null {
  // For each occupied ring cell in a, find nearest ring cell in b with same
  // shape+fill, return the signed ring-distances. Border cells only.
  const occ = (p: Panel) =>
    p.slots
      .map((el, cell) => ({ el, cell }))
      .filter((x) => x.el && cell_isBorder(x.cell));
  const A = occ(a), B = occ(b);
  if (A.length !== B.length) return null;
  const used = new Set<number>();
  const moves: number[] = [];
  for (const x of A) {
    const ra = cellToRing[x.cell];
    let best: { d: number; j: number } | null = null;
    B.forEach((y, j) => {
      if (used.has(j)) return;
      if (y.el!.shape !== x.el!.shape || y.el!.fill !== x.el!.fill) return;
      const rb = cellToRing[y.cell];
      let d = rb - ra;
      // normalise to [-4,4]
      while (d > 4) d -= 8;
      while (d < -4) d += 8;
      if (best === null || Math.abs(d) < Math.abs(best.d)) best = { d, j };
    });
    if (best === null) return null;
    const chosen = best as { d: number; j: number };
    used.add(chosen.j);
    moves.push(chosen.d);
  }
  return moves;
}
function cell_isBorder(cell: number): boolean {
  return cell !== 4; // centre is index 4
}

function checkGrid(q: AbstractQuestion) {
  if (q.sequence[0]?.layout !== "grid3") return;
  // Mirror-flip items move figures by reflection, not "one cell around the ring".
  if (/flipped|mirrored/i.test(q.ruleSummary)) return;
  // XOR-overlay grids (all solid squares) are not ring-movement items; they have
  // their own dedicated check in hardcheck.ts.
  if (q.sequence.every((p) => p.slots.every((c) => !c || (c.shape === "square" && c.fill === "solid")))) return;
  const panels = [...q.sequence, q.options[q.answerIndex]];
  for (let i = 0; i + 1 < panels.length; i++) {
    const moves = multisetMoves(panels[i], panels[i + 1]);
    if (!moves) { record("grid:untrackable", `step ${i}->${i + 1} shape set changed`, q); return; }
    // rule says one cell per step (each shape moves exactly +/-1 ring position)
    const bad = moves.filter((m) => Math.abs(m) !== 1);
    if (bad.length > 0) {
      record("grid:move-not-one", `step ${i}->${i + 1} moves=[${moves.join(",")}]`, q);
    }
  }
}

// ---- PIECROSS / CROSS centre-cycle sanity: centre shape cycles period<=3 ----
function checkPieCross(q: AbstractQuestion) {
  if (q.sequence[0]?.layout !== "pieCross") return;
  const panels = [...q.sequence, q.options[q.answerIndex]];
  // corners must each rotate by a fixed per-corner quarter step
  for (let c = 0; c < 4; c++) {
    const qs = panels.map((p) => p.slots[c]?.quarter ?? 0);
    const step = ((qs[1] - qs[0]) % 4 + 4) % 4;
    const ok = qs.slice(1).every((v, i) => v === ((qs[i] + step) % 4));
    if (!ok) record("piecross:corner-not-linear", `corner ${c} quarters=[${qs.join(",")}]`, q);
  }
}

function main() {
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < RUNS; i++) {
      const q = generateAbstractQuestion(d, i + 1);
      checkSegments(q);
      checkGrid(q);
      checkPieCross(q);
    }
  }
  console.log(`\n=== Rule-vs-reality audit: ${DIFFICULTIES.length * RUNS} items ===\n`);
  if (Object.keys(violCount).length === 0) {
    console.log("No rule/reality mismatches found.");
    return;
  }
  console.log("Mismatches by rule:");
  Object.entries(violCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k.padEnd(30)} ${n}`));

  console.log("\n--- samples ---");
  for (const v of viols) {
    console.log(`\n[${v.rule}] ${v.detail}`);
    console.log(`  id=${v.q.id}  ruleSummary: ${v.q.ruleSummary}`);
    const panels = [...v.q.sequence, v.q.options[v.q.answerIndex]];
    panels.forEach((p, i) =>
      console.log(`    ${i === panels.length - 1 ? "ANS" : "  " + i}: ${JSON.stringify(p)}`),
    );
  }
}

main();
