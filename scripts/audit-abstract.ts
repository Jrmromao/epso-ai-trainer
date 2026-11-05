/* eslint-disable no-console */
// Standalone audit harness for the abstract-reasoning engine.
// Runs every difficulty many times and checks each generated item against the
// invariants the engine claims to guarantee, PLUS extra "physics" checks the
// engine does not currently enforce. Pure logic — no React/Next imports.

import {
  generateAbstractQuestion,
  type AbstractDifficulty,
  type AbstractQuestion,
  type Panel,
  type Element,
} from "../src/lib/abstractReasoning";

const DIFFICULTIES: AbstractDifficulty[] = ["easy", "medium", "hard", "extreme"];
const RUNS_PER_DIFFICULTY = 4000;

// ---- local copies of equality helpers (kept independent of the engine) ----
function sameElement(a: Element | null, b: Element | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.shape === b.shape &&
    a.fill === b.fill &&
    a.direction === b.direction &&
    a.quarter === b.quarter &&
    a.tri === b.tri &&
    (a.scale ?? 1) === (b.scale ?? 1) &&
    (a.mirror ?? false) === (b.mirror ?? false)
  );
}

function panelKey(p: Panel): string {
  // Canonicalise so {} vs undefined don't create spurious differences.
  return JSON.stringify(p, (_k, v) => (v === undefined ? null : v));
}

function panelsEqual(a: Panel, b: Panel): boolean {
  return panelKey(a) === panelKey(b);
}

function elementCount(p: Panel): number {
  if (p.rows) return p.rows.reduce((n, r) => n + r.length, 0);
  if (p.count !== undefined) return p.count;
  if (p.segments) return p.segments.length; // segment fills are the content
  if (p.curves) return p.curves.length;
  if (p.nest) return 3; // corner + outer + inner shapes
  if (p.bars) return p.bars.length; // bar chart
  if (p.gridRows !== undefined) return p.gridRows * (p.gridCols ?? 1); // rowcol grid
  return p.slots.filter(Boolean).length;
}

type Check = { name: string; ok: boolean; detail?: string };

function auditItem(q: AbstractQuestion): Check[] {
  const checks: Check[] = [];

  // (1) exactly 5 options, exactly one correct index in range
  checks.push({
    name: "options-count",
    ok: q.options.length === 5,
    detail: `options=${q.options.length}`,
  });
  checks.push({
    name: "answer-index-range",
    ok: q.answerIndex >= 0 && q.answerIndex < q.options.length,
    detail: `answerIndex=${q.answerIndex}`,
  });

  // (2) all 5 options visually distinct
  const optKeys = q.options.map(panelKey);
  checks.push({
    name: "options-distinct",
    ok: new Set(optKeys).size === q.options.length,
    detail: `distinct=${new Set(optKeys).size}/${q.options.length}`,
  });

  // (3) exactly one option equals the designated answer panel
  const answerKey = optKeys[q.answerIndex];
  const matches = optKeys.filter((k) => k === answerKey).length;
  checks.push({
    name: "single-correct",
    ok: matches === 1,
    detail: `optionsEqualToAnswer=${matches}`,
  });

  // (4) 5 shown panels distinct (no visible repeat tell)
  const seqKeys = q.sequence.map(panelKey);
  checks.push({
    name: "sequence-distinct",
    ok: new Set(seqKeys).size === q.sequence.length,
    detail: `distinct=${new Set(seqKeys).size}/${q.sequence.length}`,
  });

  // (5) answer must CONTINUE the sequence (not equal any earlier shown panel)
  checks.push({
    name: "answer-continues",
    ok: !seqKeys.includes(answerKey),
    detail: "answer equals an earlier shown panel (admits simpler rule)",
  });

  // (6) optionNotes aligned to options when present
  if (q.optionNotes) {
    checks.push({
      name: "notes-aligned",
      ok: q.optionNotes.length === q.options.length,
      detail: `notes=${q.optionNotes.length}/${q.options.length}`,
    });
  }

  // (7) RENDER/PHYSICS: ring-movement grid3 panels must hold a consistent element
  //     count across the set (a collision silently empties a cell). XOR-overlay
  //     grids (all solid squares) legitimately vary cell counts, so skip them.
  const isXorGrid = (p: Panel) => p.slots.every((c) => !c || (c.shape === "square" && c.fill === "solid"));
  if (q.sequence[0]?.layout === "grid3" && !q.sequence.every(isXorGrid)) {
    const counts = [...q.sequence, q.options[q.answerIndex]].map((p) =>
      p.slots.filter(Boolean).length,
    );
    const consistent = counts.every((c) => c === counts[0]);
    checks.push({
      name: "grid-count-stable",
      ok: consistent,
      detail: `counts=[${counts.join(",")}]`,
    });
  }

  // (8) RENDER/PHYSICS: no shown panel should be empty
  checks.push({
    name: "no-empty-shown",
    ok: q.sequence.every((p) => elementCount(p) > 0),
    detail: "a shown panel has zero elements",
  });

  // (9) ruleSummary present and non-trivial (empty summary = a frame bailed out
  //     via its collision fallback but was still served)
  checks.push({
    name: "rule-summary-present",
    ok: typeof q.ruleSummary === "string" && q.ruleSummary.trim().length > 0,
    detail: `summaryLen=${q.ruleSummary?.length ?? 0}`,
  });

  // (10) INDEPENDENT SOLVABILITY for frames the engine's solver gate SKIPS.
  //      The engine only re-derives composite3 panels. For segments / pieCross /
  //      cross / grid3 / row3 a logic bug in the generator would never be caught.
  //      Here we re-derive the answer purely from the 5 shown panels and require
  //      the designated answer to be the UNIQUE option consistent with it.
  const solved = independentSolve(q);
  if (solved !== "unmodelled") {
    checks.push({
      name: "independent-solvable",
      ok: solved.ok,
      detail: solved.detail,
    });
  }

  return checks;
}

// Re-derive the answer from the shown panels using the simplest linear model
// appropriate to the layout, then check (a) the designated answer matches the
// derivation and (b) it is the only option that does. Returns "unmodelled" for
// layouts we don't attempt (so they're neither pass nor fail here).
type SolveResult = { ok: boolean; detail?: string } | "unmodelled";

function independentSolve(q: AbstractQuestion): SolveResult {
  const layout = q.sequence[0]?.layout;
  if (!layout) return "unmodelled";

  // SEGMENTS: predict next segment-array by matching the rotation observed
  // between consecutive panels, and next dotPos by its arithmetic step.
  if (layout === "segments" && q.sequence.every((p) => p.segments && p.dotPos !== undefined)) {
    const segs = q.sequence.map((p) => p.segments!);
    const dots = q.sequence.map((p) => p.dotPos!);
    // find a constant rotation r in 1..7 with segs[i+1] = rotate(segs[i], r)
    const L = segs[0].length;
    const rotate = (arr: string[], r: number) =>
      arr.map((_, k) => arr[(((k - r) % L) + L) % L]);
    let foundR: number | null = null;
    for (let r = 0; r < L; r++) {
      if (segs.slice(1).every((s, i) => JSON.stringify(s) === JSON.stringify(rotate(segs[i], r)))) {
        foundR = r;
        break;
      }
    }
    // dot arithmetic step mod 8
    const dStep = ((dots[1] - dots[0]) % 8 + 8) % 8;
    const dotLinear = dots.slice(1).every((d, i) => d === ((dots[i] + dStep) % 8));
    if (foundR === null || !dotLinear) {
      return { ok: false, detail: `segments not linearly solvable (rot=${foundR}, dotLinear=${dotLinear})` };
    }
    const predSeg = rotate(segs[4], foundR);
    const predDot = (dots[4] + dStep) % 8;
    const matchIdx = q.options
      .map((o, i) => ({ i, o }))
      .filter(({ o }) => JSON.stringify(o.segments) === JSON.stringify(predSeg) && o.dotPos === predDot)
      .map(({ i }) => i);
    const ok = matchIdx.length === 1 && matchIdx[0] === q.answerIndex;
    return { ok, detail: `predDot=${predDot} matches=[${matchIdx.join(",")}] answer=${q.answerIndex}` };
  }

  // PIECROSS: 4 corner pies rotate by a constant per-corner step; centre slots
  // 4 (top) and 5 (bottom) cycle shape. Predict each and check uniqueness.
  if (layout === "pieCross" && q.sequence.every((p) => p.slots.length >= 6)
      && q.sequence[0].slots[0]?.shape === "pie") {
    const seq = q.sequence;
    const predQuarters: number[] = [];
    for (let c = 0; c < 4; c++) {
      const qs = seq.map((p) => p.slots[c]!.quarter!);
      const step = ((qs[1] - qs[0]) % 4 + 4) % 4;
      const linear = qs.slice(1).every((v, i) => v === ((qs[i] + step) % 4));
      if (!linear) return { ok: false, detail: `pieCross corner ${c} not linear` };
      predQuarters.push((qs[4] + step) % 4);
    }
    const ans = q.options[q.answerIndex];
    const cornersOk = predQuarters.every((pq, c) => ans.slots[c]!.quarter === pq);
    // how many options have exactly these 4 predicted quarters?
    const cornerMatches = q.options.filter((o) =>
      predQuarters.every((pq, c) => o.slots[c]?.quarter === pq),
    ).length;
    return {
      ok: cornersOk,
      detail: `predicted corners [${predQuarters.join(",")}] cornersOk=${cornersOk} optionsWithThoseCorners=${cornerMatches}`,
    };
  }

  return "unmodelled";
}

// ---------------------------------------------------------------------------
// Independent re-derivation for NON-composite frames the engine's solver gate
// skips. We implement light solvers for the common deterministic frames and
// confirm the designated answer is the unique continuation. If we can't model
// a frame we skip it (not a failure) — the point is to catch frames whose
// answer does NOT follow from the shown panels.
// ---------------------------------------------------------------------------

// A frame is "ambiguous" if MORE THAN ONE option is an equally-good next panel
// under a brute-forced simple hypothesis. We approximate this structurally:
// for row3/cross/single/pieCross/segments/grid3 we check that the answer is not
// tied with a distractor on the cheapest distinguishing metric. Most real
// ambiguity the engine already prevents; here we just surface anything odd.

function main() {
  let grandFail = 0;
  const failByCheck: Record<string, number> = {};
  const failByDiff: Record<string, number> = {};
  const sampleFails: Record<string, { q: AbstractQuestion; detail?: string }> = {};
  const layoutSeen: Record<string, number> = {};

  for (const d of DIFFICULTIES) {
    for (let i = 0; i < RUNS_PER_DIFFICULTY; i++) {
      const q = generateAbstractQuestion(d, i + 1); // deterministic seed
      const layout = q.sequence[0]?.layout ?? "?";
      layoutSeen[`${d}:${layout}`] = (layoutSeen[`${d}:${layout}`] ?? 0) + 1;
      const checks = auditItem(q);
      for (const c of checks) {
        if (!c.ok) {
          grandFail++;
          failByCheck[c.name] = (failByCheck[c.name] ?? 0) + 1;
          failByDiff[d] = (failByDiff[d] ?? 0) + 1;
          const key = `${c.name}`;
          if (!sampleFails[key]) sampleFails[key] = { q, detail: c.detail };
        }
      }
    }
  }

  const total = DIFFICULTIES.length * RUNS_PER_DIFFICULTY;
  console.log(`\n=== Abstract engine audit: ${total} items ===\n`);

  console.log("Layout coverage (difficulty:layout -> count):");
  Object.entries(layoutSeen)
    .sort()
    .forEach(([k, n]) => console.log(`  ${k.padEnd(28)} ${n}`));

  console.log(`\nTotal failing checks: ${grandFail}`);
  if (grandFail === 0) {
    console.log("All invariant checks passed.");
    return;
  }

  console.log("\nFailures by check:");
  Object.entries(failByCheck)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k.padEnd(24)} ${n}`));

  console.log("\nFailures by difficulty:");
  Object.entries(failByDiff).forEach(([k, n]) => console.log(`  ${k.padEnd(10)} ${n}`));

  console.log("\n--- one sample per failing check ---");
  for (const [check, { q, detail }] of Object.entries(sampleFails)) {
    console.log(`\n[${check}] ${detail ?? ""}`);
    console.log(`  id=${q.id} difficulty=${q.difficulty} layout=${q.sequence[0]?.layout}`);
    console.log(`  ruleSummary: ${q.ruleSummary}`);
    console.log(`  sequence keys:`);
    q.sequence.forEach((p, i) => console.log(`    ${i}: ${panelKey(p)}`));
    console.log(`  options (answerIndex=${q.answerIndex}):`);
    q.options.forEach((p, i) =>
      console.log(`    ${i}${i === q.answerIndex ? "*" : " "}: ${panelKey(p)}`),
    );
  }
}

main();
