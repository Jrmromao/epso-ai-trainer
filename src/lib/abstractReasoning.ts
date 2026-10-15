// Abstract reasoning — deterministic generator and types.
//
// This is NOT LLM-generated. A rule engine builds a sequence of panels by
// applying transformations step by step, so it ALWAYS knows the correct next
// panel and can build distractors that each break exactly one rule. That
// guarantees validity — exactly one correct answer, no false positives.
//
// Scope (phase 1): single-arrow rotation, multi-slot shape cycling, and
// positional rotation. The 8-segment fill-pattern format (hardest EPSO tier)
// is intentionally out of scope for now.

export type AbstractDifficulty = "easy" | "medium" | "hard" | "extreme";

// A primitive element drawn in a slot.
export type ShapeKind =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "arrow"
  | "pie"; // quarter-filled circle; the filled quarter is set by `quarter`

export type Fill = "solid" | "outline";

export type Direction = "up" | "down" | "left" | "right";

// One drawable element with its attributes. Not all attributes apply to every
// shape (arrows use `direction`; pies use `quarter`; others use `fill`).
export interface Element {
  shape: ShapeKind;
  fill: Fill;
  direction?: Direction; // only for arrows
  quarter?: number; // 0..3 — which quarter of a pie-circle is filled (clockwise from top-right)
  tri?: "up" | "down"; // triangle orientation (for composite rows)
  scale?: number; // 0.5..1.5 relative size multiplier (size-progression rule)
  mirror?: boolean; // horizontal mirror flag (reflection rule)
}

// A panel is a fixed layout of positioned slots, each holding one element
// (or null for an empty slot). `layout` tells the renderer how to place them.
//
// Specialised layouts carry extra structured data instead of generic slots:
// - "count": draw `count` identical dots (element-progression pattern)
// - "segments": an 8-segment square, each segment with a fill pattern
// - "curves": 2-3 curved lines positioned in the box
// - "composite3": three independent rows of elements (EPSO Q8 format)
export type PanelLayout =
  | "single"
  | "row3"
  | "cross"
  | "stack2"
  | "count"
  | "segments"
  | "curves"
  | "composite3"
  | "pieCross"; // 4 corner pie-circles + up to 2 centre shapes (EPSO Q9 extreme)

// Segment fill patterns for the 8-segment square (EPSO Q4 format).
export type SegPattern = "blank" | "solid" | "dots" | "lines" | "checker";

export interface Panel {
  layout: PanelLayout;
  slots: (Element | null)[];
  // count layout:
  count?: number;
  countShape?: ShapeKind;
  // composite3 layout: three rows, each an array of elements
  rows?: Element[][];
  // segments layout: 8 patterns (clockwise from top-left triangle) + optional dot position 0..7
  segments?: SegPattern[];
  dotPos?: number;
  // curves layout: list of curves, each a vertical position (0..1) and a flip flag
  curves?: { y: number; flip: boolean }[];
}

export interface AbstractQuestion {
  id: string;
  difficulty: AbstractDifficulty;
  sequence: Panel[]; // the 5 shown panels
  options: Panel[]; // 5 answer options A-E
  answerIndex: number; // 0..4 -> A..E
  ruleSummary: string; // human-readable explanation of the rules
  // Per-option description aligned to `options` (after shuffle). For the correct
  // option it says why it fits; for each distractor it says which rule it breaks.
  optionNotes?: string[];
}

// ----------------------------------------------------------------------------
// Deterministic RNG so a question can be reproduced from a seed if needed.
// ----------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ----------------------------------------------------------------------------
// Rotation helpers
// ----------------------------------------------------------------------------
const CW: Direction[] = ["up", "right", "down", "left"];

function rotateDir(dir: Direction, steps: number): Direction {
  const i = CW.indexOf(dir);
  return CW[(i + ((steps % 4) + 4)) % 4];
}

// ----------------------------------------------------------------------------
// Generators per difficulty
// ----------------------------------------------------------------------------

// EASY: a single arrow rotating a fixed number of 90° steps each panel.
function genEasy(rng: () => number, id: string): AbstractQuestion {
  const start = pick(rng, CW);
  const step = pick(rng, [1, -1]); // clockwise or anticlockwise
  const dirs: Direction[] = [];
  let d = start;
  for (let i = 0; i < 6; i++) {
    dirs.push(d);
    d = rotateDir(d, step);
  }
  const panelFor = (dir: Direction): Panel => ({
    layout: "single",
    slots: [{ shape: "arrow", fill: "solid", direction: dir }],
  });

  const sequence = dirs.slice(0, 5).map(panelFor);
  const correct = panelFor(dirs[5]);

  // Distractors: the other three directions + one repeat of panel 5.
  const wrongDirs = CW.filter((x) => x !== dirs[5]);
  const options = [correct, ...wrongDirs.map(panelFor)];
  const shuffled = shuffleWithAnswer(rng, options, 0);

  return {
    id,
    difficulty: "easy",
    sequence,
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
    ruleSummary: `The arrow rotates 90° ${step === 1 ? "clockwise" : "anticlockwise"} each step. After ${dirName(dirs[4])} comes ${dirName(dirs[5])}.`,
  };
}

// MEDIUM: three row-slots, each cycling through its own shape list independently.
function genMedium(rng: () => number, id: string): AbstractQuestion {
  const shapePool: ShapeKind[] = ["circle", "square", "triangle", "diamond"];
  // Each slot gets an independent 2- or 3-length cycle of (shape, fill).
  const slotCycles = [0, 1, 2].map(() => {
    const len = pick(rng, [2, 3]);
    const cycle: Element[] = [];
    for (let i = 0; i < len; i++) {
      cycle.push({ shape: pick(rng, shapePool), fill: pick(rng, ["solid", "outline"] as Fill[]) });
    }
    return cycle;
  });

  const panelAt = (step: number): Panel => ({
    layout: "row3",
    slots: slotCycles.map((cyc) => cyc[step % cyc.length]),
  });

  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);

  // Distractors: each breaks ONE slot (wrong element in one position).
  const distractors: Panel[] = [];
  for (let slot = 0; slot < 3 && distractors.length < 4; slot++) {
    const broken: Panel = { layout: "row3", slots: correct.slots.slice() };
    const cyc = slotCycles[slot];
    // pick a different element from the cycle for that slot
    const wrong = cyc.find((e) => !sameElement(e, correct.slots[slot]));
    broken.slots[slot] = wrong ?? { shape: "circle", fill: "solid" };
    distractors.push(broken);
  }
  // Top up with a repeat-of-previous-panel distractor if needed.
  while (distractors.length < 4) distractors.push(panelAt(4));

  const options = [correct, ...distractors.slice(0, 4)];
  const shuffled = shuffleWithAnswer(rng, options, 0);

  return {
    id,
    difficulty: "medium",
    sequence,
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
    ruleSummary:
      "Each of the three positions cycles through its own sequence of shapes independently. Track each position separately and advance all three by one step.",
  };
}

// HARD: cross layout — four shapes rotate position around the centre each step,
// AND an arrow in the centre rotates. Two simultaneous rules.
function genHard(rng: () => number, id: string): AbstractQuestion {
  const shapePool: ShapeKind[] = ["circle", "square", "triangle", "diamond"];
  // 4 distinct shapes placed at N, E, S, W; they rotate position each step.
  const base: Element[] = shuffleArr(rng, shapePool).map((shape) => ({
    shape,
    fill: pick(rng, ["solid", "outline"] as Fill[]),
  }));
  const centreStart = pick(rng, CW);
  const centreStep = pick(rng, [1, -1]);
  const posStep = pick(rng, [1, -1]);

  const panelAt = (step: number): Panel => {
    // rotate the 4 outer positions
    const rotated = base.map((_, i) => base[(i - step * posStep + 400) % 4]);
    const centre: Element = { shape: "arrow", fill: "solid", direction: rotateDir(centreStart, step * centreStep) };
    // cross layout slots: [N, E, S, W, centre]
    return { layout: "cross", slots: [rotated[0], rotated[1], rotated[2], rotated[3], centre] };
  };

  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);

  const distractors: Panel[] = [];
  // 1) centre arrow wrong direction
  {
    const p = clonePanel(correct);
    const c = p.slots[4]!;
    p.slots[4] = { ...c, direction: rotateDir(c.direction!, 1) };
    distractors.push(p);
  }
  // 2) outer rotation off by one
  distractors.push(panelAt(4));
  // 3) two outer shapes swapped
  {
    const p = clonePanel(correct);
    [p.slots[0], p.slots[2]] = [p.slots[2], p.slots[0]];
    distractors.push(p);
  }
  // 4) one outer fill flipped
  {
    const p = clonePanel(correct);
    const s = p.slots[1]!;
    p.slots[1] = { ...s, fill: s.fill === "solid" ? "outline" : "solid" };
    distractors.push(p);
  }

  const options = [correct, ...distractors];
  const shuffled = shuffleWithAnswer(rng, options, 0);

  return {
    id,
    difficulty: "hard",
    sequence,
    options: shuffled.options,
    answerIndex: shuffled.answerIndex,
    ruleSummary:
      "Two rules at once: the four outer shapes rotate position around the cross each step, and the central arrow rotates 90° each step. Both must be correct.",
  };
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function dirName(d: Direction): string {
  return { up: "up", down: "down", left: "left", right: "right" }[d];
}

function sameElement(a: Element | null, b: Element | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.shape === b.shape &&
    a.fill === b.fill &&
    a.direction === b.direction &&
    a.quarter === b.quarter &&
    a.tri === b.tri
  );
}

function clonePanel(p: Panel): Panel {
  return {
    layout: p.layout,
    slots: p.slots.map((s) => (s ? { ...s } : null)),
    ...(p.count !== undefined ? { count: p.count } : {}),
    ...(p.countShape ? { countShape: p.countShape } : {}),
    ...(p.rows ? { rows: p.rows.map((r) => r.map((e) => ({ ...e }))) } : {}),
    ...(p.segments ? { segments: p.segments.slice() } : {}),
    ...(p.dotPos !== undefined ? { dotPos: p.dotPos } : {}),
    ...(p.curves ? { curves: p.curves.map((c) => ({ ...c })) } : {}),
  };
}

function shuffleArr<T>(rng: () => number, arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Shuffle options but track where the correct one lands. Guarantees all five
// options are visually distinct — if any collide, a distractor is nudged
// (flip a fill, else rotate an arrow, else swap a shape) until unique. This is
// what prevents an ambiguous item (two identical options, or a distractor that
// equals the correct answer -> two correct answers).
function shuffleWithAnswer(
  rng: () => number,
  options: Panel[],
  correctIndex: number,
): { options: Panel[]; answerIndex: number } {
  const correct = options[correctIndex];
  const result: Panel[] = [correct];

  for (let i = 0; i < options.length; i++) {
    if (i === correctIndex) continue;
    let candidate = clonePanel(options[i]);
    let guard = 0;
    // Nudge until the candidate differs from every panel already accepted.
    while (result.some((p) => panelsEqual(p, candidate)) && guard < 12) {
      candidate = nudgePanel(candidate, guard);
      guard++;
    }
    result.push(candidate);
  }

  // If we still somehow have fewer than 5 distinct (extreme edge), pad by
  // nudging the last one further.
  while (result.length < 5) {
    let candidate = nudgePanel(clonePanel(result[result.length - 1]), result.length);
    let guard = 0;
    while (result.some((p) => panelsEqual(p, candidate)) && guard < 12) {
      candidate = nudgePanel(candidate, guard + 5);
      guard++;
    }
    result.push(candidate);
  }

  const indexed = result.slice(0, 5).map((o, i) => ({ o, correct: i === 0 }));
  const shuffled = shuffleArr(rng, indexed);
  return {
    options: shuffled.map((x) => x.o),
    answerIndex: shuffled.findIndex((x) => x.correct),
  };
}

// Deterministically alter a panel a little so it becomes distinct from others.
const NUDGE_SHAPES: ShapeKind[] = ["circle", "square", "triangle", "diamond"];
function nudgePanel(p: Panel, salt: number): Panel {
  const out = clonePanel(p);

  // Specialised layouts nudge their own data.
  if (out.layout === "count") {
    out.count = Math.max(1, (out.count ?? 1) + (salt % 2 === 0 ? 1 : -1));
    return out;
  }
  if (out.layout === "segments") {
    out.dotPos = ((out.dotPos ?? 0) + 1 + salt) % 8;
    return out;
  }
  if (out.layout === "curves" && out.curves && out.curves.length > 0) {
    const i = salt % out.curves.length;
    out.curves[i] = { ...out.curves[i], flip: !out.curves[i].flip };
    return out;
  }
  if (out.layout === "composite3" && out.rows) {
    // flip the fill of the first element in a row chosen by salt
    const r = salt % out.rows.length;
    if (out.rows[r].length > 0) {
      const e = out.rows[r][0];
      out.rows[r][0] = { ...e, fill: e.fill === "solid" ? "outline" : "solid" };
    }
    return out;
  }

  const slotIdx = out.slots.findIndex((s) => s);
  if (slotIdx === -1) return out;
  const slot = out.slots[slotIdx]!;
  const mode = salt % 3;
  if (mode === 0) {
    slot.fill = slot.fill === "solid" ? "outline" : "solid";
  } else if (mode === 1 && slot.direction) {
    slot.direction = rotateDir(slot.direction, 1);
  } else {
    // change the shape to the next one that isn't the current shape
    const cur = NUDGE_SHAPES.indexOf(slot.shape as ShapeKind);
    slot.shape = NUDGE_SHAPES[(cur + 1 + salt) % NUDGE_SHAPES.length];
  }
  return out;
}

function panelsEqual(a: Panel, b: Panel): boolean {
  if (a.layout !== b.layout) return false;
  // Specialised layouts compare their structured data.
  if (a.layout === "count") return a.count === b.count && a.countShape === b.countShape;
  if (a.layout === "composite3") {
    const ar = a.rows ?? [], br = b.rows ?? [];
    if (ar.length !== br.length) return false;
    return ar.every((row, r) => row.length === br[r].length && row.every((e, i) => sameElement(e, br[r][i])));
  }
  if (a.layout === "segments") {
    if (a.dotPos !== b.dotPos) return false;
    const as = a.segments ?? [], bs = b.segments ?? [];
    return as.length === bs.length && as.every((s, i) => s === bs[i]);
  }
  if (a.layout === "curves") {
    const ac = a.curves ?? [], bc = b.curves ?? [];
    return ac.length === bc.length && ac.every((c, i) => c.y === bc[i].y && c.flip === bc[i].flip);
  }
  if (a.slots.length !== b.slots.length) return false;
  return a.slots.every((s, i) => sameElement(s, b.slots[i]));
}

// ----------------------------------------------------------------------------
// Additional rule templates — give each difficulty several distinct patterns
// so consecutive questions don't all look the same.
// ----------------------------------------------------------------------------

const ALL_SHAPES: ShapeKind[] = ["circle", "square", "triangle", "diamond"];

// EASY template 2: a single shape whose FILL alternates (solid/outline) while
// the shape itself cycles through a fixed 2-shape pair.
function genEasyFillCycle(rng: () => number, id: string): AbstractQuestion {
  const twoShapes = shuffleArr(rng, ALL_SHAPES).slice(0, 2);
  const startFill: Fill = pick(rng, ["solid", "outline"] as Fill[]);
  const elemAt = (i: number): Element => ({
    shape: twoShapes[i % 2],
    fill: i % 2 === 0 ? startFill : startFill === "solid" ? "outline" : "solid",
  });
  const panelAt = (i: number): Panel => ({ layout: "single", slots: [elemAt(i)] });
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors = [
    { layout: "single", slots: [elemAt(4)] } as Panel, // repeat prev
    { layout: "single", slots: [{ ...elemAt(5), fill: elemAt(5).fill === "solid" ? "outline" : "solid" }] } as Panel,
    { layout: "single", slots: [{ ...elemAt(5), shape: pick(rng, ALL_SHAPES.filter((s) => !twoShapes.includes(s))) }] } as Panel,
    { layout: "single", slots: [elemAt(3)] } as Panel,
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "easy", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "The shape alternates between two shapes, and the fill alternates solid/outline each step. Continue both alternations.",
  };
}

// EASY template 3: a shape that grows the count? Not with this model — instead,
// a single shape that MOVES position within a row-of-3 (left->mid->right->...).
function genEasyMove(rng: () => number, id: string): AbstractQuestion {
  const shape = pick(rng, ALL_SHAPES);
  const fill: Fill = pick(rng, ["solid", "outline"] as Fill[]);
  const dir = pick(rng, [1, -1]);
  const posAt = (i: number) => ((i * dir) % 3 + 3) % 3;
  const panelAt = (i: number): Panel => {
    const slots: (Element | null)[] = [null, null, null];
    slots[posAt(i)] = { shape, fill };
    return { layout: "row3", slots };
  };
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [panelAt(4), panelAt(3)];
  // wrong-position variants
  for (let pos = 0; pos < 3 && distractors.length < 4; pos++) {
    if (pos === posAt(5)) continue;
    const slots: (Element | null)[] = [null, null, null];
    slots[pos] = { shape, fill };
    distractors.push({ layout: "row3", slots });
  }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors.slice(0, 4)], 0);
  return {
    id, difficulty: "easy", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: `The shape moves one position ${dir === 1 ? "rightwards" : "leftwards"} each step, wrapping around. Continue the movement.`,
  };
}

// MEDIUM template 2: a stack of two shapes; top rotates through shapes one way,
// bottom cycles fill the other way.
function genMediumStack(rng: () => number, id: string): AbstractQuestion {
  const topCycle = shuffleArr(rng, ALL_SHAPES).slice(0, 3);
  const bottomShape = pick(rng, ALL_SHAPES);
  const panelAt = (i: number): Panel => ({
    layout: "stack2",
    slots: [
      { shape: topCycle[i % 3], fill: "outline" },
      { shape: bottomShape, fill: i % 2 === 0 ? "solid" : "outline" },
    ],
  });
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [];
  // break top
  { const p = clonePanel(correct); p.slots[0] = { ...p.slots[0]!, shape: topCycle[(5 + 1) % 3] }; distractors.push(p); }
  // break bottom fill
  { const p = clonePanel(correct); const b = p.slots[1]!; p.slots[1] = { ...b, fill: b.fill === "solid" ? "outline" : "solid" }; distractors.push(p); }
  // repeat prev
  distractors.push(panelAt(4));
  // top filled solid (wrong attribute)
  { const p = clonePanel(correct); p.slots[0] = { ...p.slots[0]!, fill: "solid" }; distractors.push(p); }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "medium", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "Two independent rules stacked: the top shape cycles through a 3-shape sequence; the bottom shape keeps its shape but alternates fill. Advance both.",
  };
}

// MEDIUM template 3: two arrows in a row, each rotating by a different step.
function genMediumTwoArrows(rng: () => number, id: string): AbstractQuestion {
  const startA = pick(rng, CW);
  const startB = pick(rng, CW);
  const stepA = pick(rng, [1, -1]);
  const stepB = pick(rng, [1, -1]);
  const panelAt = (i: number): Panel => ({
    layout: "row3",
    slots: [
      { shape: "arrow", fill: "solid", direction: rotateDir(startA, i * stepA) },
      null,
      { shape: "arrow", fill: "solid", direction: rotateDir(startB, i * stepB) },
    ],
  });
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [];
  { const p = clonePanel(correct); p.slots[0] = { ...p.slots[0]!, direction: rotateDir(p.slots[0]!.direction!, 1) }; distractors.push(p); }
  { const p = clonePanel(correct); p.slots[2] = { ...p.slots[2]!, direction: rotateDir(p.slots[2]!.direction!, 1) }; distractors.push(p); }
  distractors.push(panelAt(4));
  { const p = clonePanel(correct); p.slots[0] = { ...p.slots[0]!, direction: rotateDir(p.slots[0]!.direction!, 2) }; distractors.push(p); }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "medium", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: `Two arrows rotate independently: the left one ${stepA === 1 ? "clockwise" : "anticlockwise"}, the right one ${stepB === 1 ? "clockwise" : "anticlockwise"}, 90° per step.`,
  };
}

// HARD template 2: cross layout where outer shapes rotate position AND each
// step one outer shape flips its fill (travelling flip).
function genHardFlipTravel(rng: () => number, id: string): AbstractQuestion {
  const base: Element[] = shuffleArr(rng, ALL_SHAPES).map((shape) => ({ shape, fill: "outline" as Fill }));
  const posStep = pick(rng, [1, -1]);
  const panelAt = (i: number): Panel => {
    const rotated = base.map((_, k) => ({ ...base[(k - i * posStep + 400) % 4] }));
    // the shape at position (i % 4) is solid-filled (flip travels round)
    rotated[i % 4] = { ...rotated[i % 4], fill: "solid" };
    return { layout: "cross", slots: [rotated[0], rotated[1], rotated[2], rotated[3], null] };
  };
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [];
  distractors.push(panelAt(4)); // rotation off by one
  { const p = clonePanel(correct); // wrong one filled
    const idx = p.slots.findIndex((s) => s && s.fill === "solid");
    if (idx >= 0) { p.slots[idx] = { ...p.slots[idx]!, fill: "outline" }; p.slots[(idx + 1) % 4] = { ...p.slots[(idx + 1) % 4]!, fill: "solid" }; }
    distractors.push(p); }
  { const p = clonePanel(correct); [p.slots[0], p.slots[2]] = [p.slots[2], p.slots[0]]; distractors.push(p); }
  { const p = clonePanel(correct); const s = p.slots[3]!; p.slots[3] = { ...s, shape: pick(rng, ALL_SHAPES) }; distractors.push(p); }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "hard", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "Two rules: the four outer shapes rotate position around the cross each step, and a solid-fill 'travels' one position round the cross each step (only one shape is filled at a time).",
  };
}

// EASY/MEDIUM template: ELEMENT-COUNT PROGRESSION. A panel shows N identical
// shapes; N increases or decreases by a fixed step. One of the most common
// EPSO patterns (per official guidance).
function genProgression(rng: () => number, id: string, difficulty: AbstractDifficulty): AbstractQuestion {
  const shape = pick(rng, ALL_SHAPES);
  const step = pick(rng, [1, -1]);
  // Choose a start so all six counts (0..5 steps) stay within 1..6.
  // increasing: start 1 -> ends 6. decreasing: start 6 -> ends 1.
  const start = step === 1 ? 1 : 6;
  const countAt = (i: number) => start + i * step;
  const correctCount = countAt(5);
  const panelFor = (c: number): Panel => ({ layout: "count", slots: [], count: c, countShape: shape });
  const sequence = [0, 1, 2, 3, 4].map((i) => panelFor(countAt(i)));
  const correct = panelFor(correctCount);

  // Distractors: distinct counts within 1..9, none equal to correctCount.
  const used = new Set<number>([correctCount]);
  const distractors: Panel[] = [];
  const candidates = [
    correctCount + 1,
    correctCount - 1,
    correctCount + 2,
    correctCount - 2,
    countAt(4), // repeat previous
    correctCount + 3,
  ];
  for (const c of candidates) {
    if (distractors.length >= 4) break;
    if (c >= 1 && c <= 9 && !used.has(c)) {
      used.add(c);
      distractors.push(panelFor(c));
    }
  }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty, sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: `The number of shapes ${step === 1 ? "increases" : "decreases"} by one each step. After ${countAt(4)} comes ${correctCount}.`,
  };
}

// MEDIUM/HARD template: REFLECTION. An asymmetric arrangement in a 3-slot row
// flips left-right each step (A B _ -> _ B A). Modelled with a triangle whose
// direction alternates and position mirrors.
function genReflection(rng: () => number, id: string, difficulty: AbstractDifficulty): AbstractQuestion {
  // Two different shapes at the two ends; they swap ends each step (mirror).
  const left = { shape: pick(rng, ALL_SHAPES), fill: "solid" as Fill };
  const right = { shape: pick(rng, ALL_SHAPES.filter((s) => s !== left.shape)), fill: "outline" as Fill };
  const panelAt = (i: number): Panel =>
    i % 2 === 0
      ? { layout: "row3", slots: [{ ...left }, null, { ...right }] }
      : { layout: "row3", slots: [{ ...right }, null, { ...left }] };
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [
    panelAt(4), // not reflected (repeat)
    { layout: "row3", slots: [{ ...left }, { ...right }, null] }, // both on one side
    { layout: "row3", slots: [null, { ...left }, { ...right }] }, // shifted
    { layout: "row3", slots: [{ ...right, fill: "solid" }, null, { ...left, fill: "outline" }] }, // fills wrong
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty, sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "The two shapes swap ends each step (left-right reflection). Mirror the previous panel.",
  };
}

// HARD template: 8-SEGMENT SQUARE (EPSO Q4 format). The square is split into 8
// triangular segments by both diagonals and the vertical/horizontal medians.
// The set of fill patterns rotates one segment-step each panel, and a small
// black dot travels around the segments.
const SEG_PATTERNS: SegPattern[] = ["dots", "lines", "checker", "solid"];
function genSegments(rng: () => number, id: string): AbstractQuestion {
  // Base: assign a repeating pattern to the 8 segments.
  const base: SegPattern[] = Array.from({ length: 8 }, (_, i) => SEG_PATTERNS[i % SEG_PATTERNS.length]);
  const rot = pick(rng, [1, -1]);
  const dotStep = pick(rng, [1, -1]);
  const dotStart = Math.floor(rng() * 8);
  const panelAt = (i: number): Panel => ({
    layout: "segments",
    slots: [],
    segments: base.map((_, k) => base[(k - i * rot + 800) % 8]),
    dotPos: ((dotStart + i * dotStep) % 8 + 8) % 8,
  });
  const sequence = [0, 1, 2, 3, 4].map(panelAt);
  const correct = panelAt(5);
  const distractors: Panel[] = [
    panelAt(4), // rotation off by one
    { ...clonePanel(correct), dotPos: ((correct.dotPos ?? 0) + 1) % 8 }, // dot one off
    { ...clonePanel(correct), segments: base.map((_, k) => base[(k - 6 * rot * -1 + 800) % 8]) }, // wrong rotation dir
    { ...clonePanel(correct), dotPos: ((correct.dotPos ?? 0) + 4) % 8 }, // dot opposite
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "hard", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "The square has 8 segments. The fill patterns rotate one segment per step, and the small dot moves around the segments each step. Track both.",
  };
}

// MEDIUM template: CURVED LINES (EPSO Q5 format). 2-3 wavy lines sit at vertical
// positions; each line flips on its own alternating cycle AND the whole stack
// shifts vertical position each step. More state => options stay distinct.
function genCurves(rng: () => number, id: string): AbstractQuestion {
  const n = 3; // fixed 3 lines gives 2^3 = 8 flip states, enough for distinct options
  const baseY = [0.3, 0.5, 0.7];
  const flipAt = (i: number, k: number) => ((i + k) % 2 + 2) % 2 === 1;
  const panelFor = (i: number): Panel => ({
    layout: "curves",
    slots: [],
    curves: baseY.map((y, k) => ({ y, flip: flipAt(i, k) })),
  });
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);

  // Distractors: each flips a DIFFERENT distinct subset of lines from correct.
  const mk = (flips: boolean[]): Panel => ({
    layout: "curves",
    slots: [],
    curves: baseY.map((y, k) => ({ y, flip: flips[k] })),
  });
  const correctFlips = correct.curves!.map((c) => c.flip);
  const variants: boolean[][] = [
    correctFlips.map((f, k) => (k === 0 ? !f : f)),
    correctFlips.map((f, k) => (k === 1 ? !f : f)),
    correctFlips.map((f, k) => (k === 2 ? !f : f)),
    correctFlips.map((f) => !f),
  ];
  const distractors = variants.map(mk);
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "medium", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: "Each curved line flips its orientation on its own alternating cycle. Work out each line's phase and continue all three.",
  };
}

// ----------------------------------------------------------------------------
// Public API
// MEDIUM template: PIE-CIRCLE ROTATION (EPSO Q9 corner element). A row of three
// quarter-filled circles; the filled quarter rotates by one position each step.
function genPieRotation(rng: () => number, id: string): AbstractQuestion {
  const step = pick(rng, [1, -1]);
  // three pies with different starting quarters, all rotating together
  const starts = [0, 1, 2].map(() => Math.floor(rng() * 4));
  const panelFor = (i: number): Panel => ({
    layout: "row3",
    slots: starts.map((q) => ({ shape: "pie", fill: "solid", quarter: ((q + i * step) % 4 + 4) % 4 } as Element)),
  });
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const distractors: Panel[] = [];
  // one pie rotated wrong
  { const p = clonePanel(correct); const e = p.slots[0]!; p.slots[0] = { ...e, quarter: ((e.quarter! + 1) % 4) }; distractors.push(p); }
  // all rotated one extra (whole panel = next step)
  distractors.push(panelFor(6));
  // repeat previous
  distractors.push(panelFor(4));
  // middle pie rotated opposite
  { const p = clonePanel(correct); const e = p.slots[1]!; p.slots[1] = { ...e, quarter: ((e.quarter! + 2) % 4) }; distractors.push(p); }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "medium", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary: `Each quarter-filled circle rotates its filled quarter 90° ${step === 1 ? "clockwise" : "anticlockwise"} per step. All three rotate together.`,
  };
}

// HARD template: 3-ROW COMPOSITE (EPSO Q8 format). Three independent rows:
// top = a row of circles whose COUNT increases/decreases; middle = triangles
// whose ORIENTATION alternates up/down; bottom = circles whose FILL alternates.
// Three rules run at once.
function genComposite3(rng: () => number, id: string): AbstractQuestion {
  const topStep = pick(rng, [1, -1]);
  const topStart = topStep === 1 ? 1 : 4; // keep 1..4 circles
  const triStartUp = rng() < 0.5;
  const botFillStart: Fill = pick(rng, ["solid", "outline"] as Fill[]);

  const rowCircles = (n: number, fill: Fill): Element[] =>
    Array.from({ length: Math.max(1, n) }, () => ({ shape: "circle", fill }));
  const rowTriangles = (up: boolean): Element[] =>
    Array.from({ length: 3 }, () => ({ shape: "triangle", fill: "solid", tri: up ? "up" : "down" }));

  const panelFor = (i: number): Panel => ({
    layout: "composite3",
    slots: [],
    rows: [
      rowCircles(topStart + i * topStep, "outline"),
      rowTriangles(triStartUp ? i % 2 === 0 : i % 2 === 1),
      rowCircles(3, i % 2 === 0 ? botFillStart : botFillStart === "solid" ? "outline" : "solid"),
    ],
  });

  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);

  const distractors: Panel[] = [];
  // 1) top-row count wrong
  { const p = clonePanel(correct); p.rows![0] = rowCircles((p.rows![0].length) + 1, "outline"); distractors.push(p); }
  // 2) middle-row triangles flipped
  { const p = clonePanel(correct); p.rows![1] = p.rows![1].map((e) => ({ ...e, tri: e.tri === "up" ? "down" : "up" })); distractors.push(p); }
  // 3) bottom-row fill wrong
  { const p = clonePanel(correct); p.rows![2] = p.rows![2].map((e) => ({ ...e, fill: e.fill === "solid" ? "outline" : "solid" })); distractors.push(p); }
  // 4) repeat previous panel
  distractors.push(panelFor(4));
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "hard", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Three independent rows run at once: the top row of circles changes in COUNT, the middle row of triangles alternates ORIENTATION (up/down), and the bottom row of circles alternates FILL. All three must be right.",
  };
}

// ----------------------------------------------------------------------------
// EXTREME templates — 3+ simultaneous rules on dense layouts, modelled on the
// hardest EPSO samples (image-2 Q8/Q9/Q10). These are deliberately brutal.
// ----------------------------------------------------------------------------

// EXTREME template: FOUR-RULE COMPOSITE. Like composite3 but every row carries
// its own changing attribute AND the top row count changes AND fills alternate
// on two rows out of phase — four things to track at once.
function genExtremeComposite(rng: () => number, id: string): AbstractQuestion {
  const topStep = pick(rng, [1, -1]);
  const topStart = topStep === 1 ? 1 : 4;
  const midUpStart = rng() < 0.5;
  const topFill: Fill = pick(rng, ["solid", "outline"] as Fill[]);
  const botShape = pick(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie"));
  const botStep = pick(rng, [1, -1]);
  const botStart = botStep === 1 ? 1 : 4;

  const row = (shape: ShapeKind, n: number, fill: Fill, tri?: "up" | "down"): Element[] =>
    Array.from({ length: Math.max(1, n) }, () => ({ shape, fill, ...(tri ? { tri } : {}) }));

  const panelFor = (i: number): Panel => ({
    layout: "composite3",
    slots: [],
    rows: [
      // top: circles, count changes, fill alternates
      row("circle", topStart + i * topStep, i % 2 === 0 ? topFill : topFill === "solid" ? "outline" : "solid"),
      // middle: 3 triangles, orientation alternates
      row("triangle", 3, "solid", (midUpStart ? i % 2 === 0 : i % 2 === 1) ? "up" : "down"),
      // bottom: a chosen shape, count changes opposite direction, solid
      row(botShape, botStart + i * botStep, "solid"),
    ],
  });

  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const distractors: Panel[] = [];
  { const p = clonePanel(correct); p.rows![0] = row("circle", p.rows![0].length + 1, p.rows![0][0].fill); distractors.push(p); }
  { const p = clonePanel(correct); p.rows![1] = p.rows![1].map((e) => ({ ...e, tri: e.tri === "up" ? "down" : "up" })); distractors.push(p); }
  { const p = clonePanel(correct); p.rows![2] = row(botShape, p.rows![2].length - 1 >= 1 ? p.rows![2].length - 1 : p.rows![2].length + 1, "solid"); distractors.push(p); }
  { const p = clonePanel(correct); p.rows![0] = p.rows![0].map((e) => ({ ...e, fill: e.fill === "solid" ? "outline" : "solid" })); distractors.push(p); }
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "extreme", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Four rules at once: top circles change COUNT and alternate FILL; middle triangles alternate ORIENTATION; bottom shapes change COUNT in the opposite direction. Every rule must line up.",
  };
}

// EXTREME template: CORNER PIES + CENTRE STACK (EPSO Q9). Four quarter-filled
// circles sit at the corners, each rotating; two shapes stacked in the centre
// cycle shape and fill. Rotation + stack-cycle + fill = three simultaneous rules.
// EXTREME template: CORNER PIES + CENTRE STACK (EPSO Q9), HARD variant. The
// four corner quarter-circles rotate at DIFFERENT speeds (two clockwise by 1,
// two by 2 steps), the top centre shape cycles, and the bottom centre fill
// alternates. Four interacting rules; distractors are near-misses on exactly
// one rule so they can't be eliminated by surface features.
function genExtremePieCross(rng: () => number, id: string): AbstractQuestion {
  const cornerStarts = [0, 1, 2, 3].map(() => Math.floor(rng() * 4));
  // per-corner rotation speeds — mix of 1 and 2 steps, some reversed
  const cornerSpeeds = [1, 2, -1, 2];
  const centreCycle = shuffleArr(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie")).slice(0, 3);
  const bottomCentre = pick(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie"));
  const q = (c: number, i: number) => ((cornerStarts[c] + i * cornerSpeeds[c]) % 4 + 400) % 4;

  const panelFor = (i: number): Panel => ({
    layout: "pieCross",
    slots: [
      { shape: "pie", fill: "solid", quarter: q(0, i) },
      { shape: "pie", fill: "solid", quarter: q(1, i) },
      { shape: "pie", fill: "solid", quarter: q(2, i) },
      { shape: "pie", fill: "solid", quarter: q(3, i) },
      { shape: centreCycle[i % 3], fill: "outline" },
      { shape: bottomCentre, fill: i % 2 === 0 ? "solid" : "outline" },
    ],
  });

  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  // Near-miss distractors: each is correct on every rule but ONE.
  const distractors: Panel[] = [];
  { const p = clonePanel(correct); const e = p.slots[1]!; p.slots[1] = { ...e, quarter: (e.quarter! + 1) % 4 }; distractors.push(p); } // one corner off by one
  { const p = clonePanel(correct); p.slots[4] = { ...p.slots[4]!, shape: centreCycle[(5 + 1) % 3] }; distractors.push(p); } // centre-top one step ahead
  { const p = clonePanel(correct); const e = p.slots[5]!; p.slots[5] = { ...e, fill: e.fill === "solid" ? "outline" : "solid" }; distractors.push(p); } // bottom fill wrong
  { const p = clonePanel(correct); const e = p.slots[3]!; p.slots[3] = { ...e, quarter: (e.quarter! + 2) % 4 }; distractors.push(p); } // a fast corner mis-tracked
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "extreme", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Four interacting rules: the four corner quarter-circles rotate at DIFFERENT speeds (some one step, some two, one reversed); the top centre shape cycles through three shapes; the bottom centre shape alternates fill. Every rule must be exact.",
  };
}

// EXTREME template: OVERLAY XOR. Two shape-rows where a shape appears in the
// answer only if it was present in an ODD number of the two source rows this
// step (classic EPSO overlay/add-remove logic), while a counter also advances.
function genExtremeOverlay(rng: () => number, id: string): AbstractQuestion {
  const shapes: ShapeKind[] = shuffleArr(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie")).slice(0, 3);
  // each step toggles presence of each shape on a different phase
  const present = (shape: number, i: number) => ((i + shape) % 2 + 2) % 2 === 0;
  const topStep = pick(rng, [1, -1]);
  const topStart = topStep === 1 ? 1 : 4;
  const panelFor = (i: number): Panel => {
    const row1: Element[] = shapes.filter((_, k) => present(k, i)).map((shape) => ({ shape, fill: "solid" }));
    const row2: Element[] = shapes.filter((_, k) => present(k, i + 1)).map((shape) => ({ shape, fill: "outline" }));
    const row3: Element[] = Array.from({ length: Math.max(1, topStart + i * topStep) }, () => ({ shape: "circle", fill: "solid" as Fill } as Element));
    return { layout: "composite3", slots: [], rows: [row1.length ? row1 : [{ shape: shapes[0], fill: "solid" }], row2.length ? row2 : [{ shape: shapes[1], fill: "outline" }], row3] };
  };
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const distractors: Panel[] = [];
  { const p = clonePanel(correct); p.rows![0] = p.rows![0].map((e) => ({ ...e, fill: e.fill === "solid" ? "outline" : "solid" })); distractors.push(p); }
  { const p = clonePanel(correct); p.rows![2] = Array.from({ length: p.rows![2].length + 1 }, () => ({ shape: "circle", fill: "solid" as Fill } as Element)); distractors.push(p); }
  { const p = clonePanel(correct); p.rows![1] = [...p.rows![1], { shape: shapes[2], fill: "outline" }]; distractors.push(p); }
  distractors.push(panelFor(4));
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "extreme", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Add/remove logic: each shape appears or disappears on its own alternating phase across the top two rows, while the bottom counter changes count. Track each shape's presence AND the count.",
  };
}

// ----------------------------------------------------------------------------
// COMPOUND templates — the real difficulty lever. Multiple rule FAMILIES are
// layered onto the SAME element at once, so no single feature gives the pattern
// away. You must track rotation AND fill AND shape (etc.) simultaneously on one
// figure. Available at hard and extreme.
// ----------------------------------------------------------------------------

// COMPOUND 1: one arrow that (a) rotates, (b) alternates fill, and (c) its
// shaft cycles solid/arrow? Keep to attributes we render: rotation + fill +
// a small satellite dot that moves. Three families on one figure.
function genCompoundArrow(rng: () => number, id: string, difficulty: AbstractDifficulty): AbstractQuestion {
  const start = pick(rng, CW);
  const rotStep = pick(rng, [1, -1]);
  // a shape that cycles through 3 shapes
  const satCycle = shuffleArr(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie")).slice(0, 3);

  const panelFor = (i: number): Panel => ({
    layout: "row3",
    slots: [
      // left: shape cycles through 3 forms AND alternates fill (period 2) — the
      // two sub-rules are out of phase (period 3 vs 2) so it only repeats every 6.
      { shape: satCycle[i % 3], fill: i % 2 === 0 ? "solid" : "outline" },
      null,
      // right: arrow rotates a FULL quarter each step (all four headings appear),
      // so it is a genuine rotation, not a two-state toggle.
      { shape: "arrow", fill: "solid", direction: rotateDir(start, i * rotStep) },
    ],
  });
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const distractors: Panel[] = [];
  // each near-miss breaks exactly ONE sub-rule
  { const p = clonePanel(correct); const e = p.slots[2]!; p.slots[2] = { ...e, direction: rotateDir(e.direction!, 1) }; distractors.push(p); } // arrow rotation off by one
  { const p = clonePanel(correct); const e = p.slots[2]!; p.slots[2] = { ...e, direction: rotateDir(e.direction!, -1) }; distractors.push(p); } // arrow rotation off other way
  { const p = clonePanel(correct); const e = p.slots[0]!; p.slots[0] = { ...e, shape: satCycle[(5 + 1) % 3] }; distractors.push(p); } // left shape-cycle off
  { const p = clonePanel(correct); const e = p.slots[0]!; p.slots[0] = { ...e, fill: e.fill === "solid" ? "outline" : "solid" }; distractors.push(p); } // left fill off
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty, sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Compound rules on the SAME figures: the left shape cycles through three shapes AND alternates fill; the right arrow rotates 90° per step AND alternates fill. Four rule-threads, two per figure — track them together.",
  };
}

// COMPOUND 2: a single shape that simultaneously (a) ROTATES position around a
// cross, (b) changes SHAPE on a cycle, and (c) alternates FILL. One element,
// three transformation families — the hardest kind to read.
function genCompoundOrbit(rng: () => number, id: string, difficulty: AbstractDifficulty): AbstractQuestion {
  const shapeCycle = shuffleArr(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie")).slice(0, 3);
  const posStep = pick(rng, [1, -1]);
  const fillStart: Fill = pick(rng, ["solid", "outline"] as Fill[]);
  // the single travelling element occupies one of the 4 cross arms (N,E,S,W)
  const panelFor = (i: number): Panel => {
    const pos = ((i * posStep) % 4 + 4) % 4; // which arm
    const el: Element = {
      shape: shapeCycle[i % 3],
      fill: i % 2 === 0 ? fillStart : fillStart === "solid" ? "outline" : "solid",
    };
    const slots: (Element | null)[] = [null, null, null, null, null];
    slots[pos] = el;
    return { layout: "cross", slots };
  };
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const correctPos = ((5 * posStep) % 4 + 4) % 4;
  const correctEl = correct.slots[correctPos]!;
  const mk = (pos: number, el: Element): Panel => {
    const slots: (Element | null)[] = [null, null, null, null, null];
    slots[pos] = el;
    return { layout: "cross", slots };
  };
  const distractors: Panel[] = [
    mk(((correctPos + 1) % 4), correctEl), // position wrong
    mk(correctPos, { ...correctEl, shape: shapeCycle[(5 + 1) % 3] }), // shape-cycle wrong
    mk(correctPos, { ...correctEl, fill: correctEl.fill === "solid" ? "outline" : "solid" }), // fill wrong
    mk(((correctPos + 3) % 4), { ...correctEl, shape: shapeCycle[(5 + 2) % 3] }), // two families wrong
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty, sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "One figure, three transformations at once: it ORBITS one position around the cross each step, its SHAPE cycles through three forms, and its FILL alternates. All three must be right.",
  };
}

// ----------------------------------------------------------------------------
// INTERACTING-RULE templates — the hardest tier. Here one attribute CONTROLS
// another, so you cannot decode the rules independently: you must work out the
// controlling attribute first, then apply its effect. This is what makes real
// EPSO extreme items resist feature-by-feature elimination.
// ----------------------------------------------------------------------------

// INTERACTING 1: CONDITIONAL ROTATION. A row of [controller shape][arrow]. The
// controller's FILL decides HOW FAR the arrow turns this step: solid => turn 2
// quarters (180°), outline => turn 1 quarter (90°), always clockwise. The
// controller's fill follows a non-obvious 3-step pattern (solid, outline,
// outline) so the arrow's cumulative heading is NOT a simple cycle — you must
// read each controller and add up the turns.
function genInteractConditional(rng: () => number, id: string): AbstractQuestion {
  const ctrlShape = pick(rng, ALL_SHAPES.filter((s) => s !== "arrow" && s !== "pie"));
  // non-trivial fill pattern, period 3: solid, outline, outline, ...
  const fillPattern: Fill[] = ["solid", "outline", "outline"];
  const fillAt = (i: number) => fillPattern[i % 3];
  let dir = pick(rng, CW);
  const dirs: Direction[] = [];
  for (let i = 0; i < 6; i++) {
    dirs.push(dir);
    // turn depends on THIS panel's controller fill
    dir = rotateDir(dir, fillAt(i) === "solid" ? 2 : 1);
  }
  const panelFor = (i: number): Panel => ({
    layout: "row3",
    slots: [{ shape: ctrlShape, fill: fillAt(i) }, null, { shape: "arrow", fill: "solid", direction: dirs[i] }],
  });
  const sequence = [0, 1, 2, 3, 4].map(panelFor);
  const correct = panelFor(5);
  const distractors: Panel[] = [
    // treated solid as 90° instead of 180° (ignored the controller's effect)
    { layout: "row3", slots: [{ shape: ctrlShape, fill: fillAt(5) }, null, { shape: "arrow", fill: "solid", direction: rotateDir(dirs[4], 1) }] },
    // controller fill wrong
    { layout: "row3", slots: [{ shape: ctrlShape, fill: fillAt(5) === "solid" ? "outline" : "solid" }, null, { shape: "arrow", fill: "solid", direction: dirs[5] }] },
    // arrow off by one quarter
    { layout: "row3", slots: [{ shape: ctrlShape, fill: fillAt(5) }, null, { shape: "arrow", fill: "solid", direction: rotateDir(dirs[5], 1) }] },
    // arrow off the other way
    { layout: "row3", slots: [{ shape: ctrlShape, fill: fillAt(5) }, null, { shape: "arrow", fill: "solid", direction: rotateDir(dirs[5], -1) }] },
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "extreme", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "Interacting rules: the left shape's FILL sets how far the arrow turns clockwise that step — solid = 180° (two quarters), outline = 90° (one quarter). The fill runs solid, outline, outline, repeating, so the arrow's heading is NOT a simple cycle: add up the turns step by step.",
  };
}

// INTERACTING 2: COUNT-DRIVEN SHAPE. A bottom row of N dots where N follows a
// non-linear sequence (1, 2, 4, 7, 11 — differences grow by 1), and the top
// shape is driven by N: odd => triangle, even => square; filled only when N is
// prime. One number drives three features, and the count itself isn't a trivial
// +1 each time.
function genInteractCountDriven(rng: () => number, id: string): AbstractQuestion {
  // triangular-ish growth: differences 1,2,3,4,5 -> counts 1,2,4,7,11,16
  const counts = [1, 2, 4, 7, 11, 16];
  const shapeFor = (c: number): ShapeKind => (c % 2 === 1 ? "triangle" : "square");
  const isPrime = (n: number) => {
    if (n < 2) return false;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
    return true;
  };
  const fillFor = (c: number): Fill => (isPrime(c) ? "solid" : "outline");
  // cap the drawn dots so the panel stays legible — show count as a numeral-free
  // grid but limit to 9; above that we still vary shape/fill from the true count.
  const dotsFor = (c: number) => Math.min(9, c);
  const build = (i: number): Panel => {
    const c = counts[i];
    return {
      layout: "composite3",
      slots: [],
      rows: [
        [{ shape: shapeFor(c), fill: fillFor(c) }],
        Array.from({ length: dotsFor(c) }, () => ({ shape: "circle", fill: "solid" as Fill } as Element)),
      ],
    };
  };
  const sequence = [0, 1, 2, 3, 4].map(build);
  const cc = counts[5]; // 16 -> even/square, not prime/outline
  const correct = build(5);
  const distractors: Panel[] = [
    // shape derived from wrong parity
    { layout: "composite3", slots: [], rows: [[{ shape: shapeFor(cc) === "triangle" ? "square" : "triangle", fill: fillFor(cc) }], correct.rows![1].map((e) => ({ ...e }))] },
    // fill wrong (treated as prime)
    { layout: "composite3", slots: [], rows: [[{ shape: shapeFor(cc), fill: fillFor(cc) === "solid" ? "outline" : "solid" }], correct.rows![1].map((e) => ({ ...e }))] },
    // used a linear +1 count (11+1=12 dots capped to 9) with its shape
    { layout: "composite3", slots: [], rows: [[{ shape: shapeFor(12), fill: fillFor(12) }], Array.from({ length: Math.min(9, 12) }, () => ({ shape: "circle", fill: "solid" as Fill } as Element))] },
    // correct count dots but shape+fill from previous step
    { layout: "composite3", slots: [], rows: [[{ shape: shapeFor(counts[4]), fill: fillFor(counts[4]) }], correct.rows![1].map((e) => ({ ...e }))] },
  ];
  const sh = shuffleWithAnswer(rng, [correct, ...distractors], 0);
  return {
    id, difficulty: "extreme", sequence, options: sh.options, answerIndex: sh.answerIndex,
    ruleSummary:
      "The dot count grows by an increasing step (1, 2, 4, 7, 11, …, differences +1 each time), and the count DRIVES the top shape: odd => triangle, even => square, filled only when the count is prime. Find the next count, then derive the shape and fill.",
  };
}

// ============================================================================
// RIGOROUS FRAME-BASED ENGINE
// ----------------------------------------------------------------------------
// Every item is a function P(t) over t in {0..5}. The correct answer is P(5).
// A panel is a fixed spatial FRAME of K cells; each varying ATTRIBUTE evolves
// by a generator with a chosen PERIOD. Difficulty is governed by:
//   D  = number of independently varying attributes
//   L  = combined (lcm) period — must exceed the shown length so nothing
//        visibly repeats within the 5 panels
//   C  = coupling: whether one attribute is a function of another
// A shared validator enforces four invariants on EVERY item at EVERY level:
//   (1) no visible repeat within the 5 shown panels (period discipline)
//   (2) exactly one option satisfies all rules
//   (3) each distractor violates exactly one rule (controlled near-miss)
//   (4) uniqueness: the shown panels are not consistent with a *simpler* rule
// ============================================================================

// Per-tier design budget. These numbers encode the doctrine applied uniformly.
interface TierSpec {
  minCombinedPeriod: number; // nothing may repeat inside this many steps
}
const TIER: Record<AbstractDifficulty, TierSpec> = {
  easy: { minCombinedPeriod: 3 },
  medium: { minCombinedPeriod: 6 },
  hard: { minCombinedPeriod: 6 },
  extreme: { minCombinedPeriod: 12 },
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}
function combinedPeriod(periods: number[]): number {
  return periods.reduce((acc, p) => lcm(acc, p), 1);
}

// Attribute cycles with controlled period. Each returns the value at step t.
// Shapes and fills use explicit cycles; periods are chosen coprime by the
// caller so the combined period is long.
type ShapeCycle = ShapeKind[];
function cycleAt<T>(cycle: T[], t: number): T {
  return cycle[((t % cycle.length) + cycle.length) % cycle.length];
}

const NON_ARROW: ShapeKind[] = ["circle", "square", "triangle", "diamond"];

// Build a shape cycle of a given length from distinct shapes.
function makeShapeCycle(rng: () => number, len: number): ShapeCycle {
  return shuffleArr(rng, NON_ARROW).slice(0, len);
}

// Serialise a panel to a canonical string for equality / uniqueness checks.
function panelKey(p: Panel): string {
  return JSON.stringify(p);
}

// ---------------------------------------------------------------------------
// SOLVER GATE. An INDEPENDENT re-derivation of the answer, run before a
// question is ever shown. For composite (N-row) panels it detects each row's
// rule purely from the five shown panels and predicts panel 6; the item is only
// served if the solver's prediction matches the generator's answer AND is
// unique. This guarantees every presented question is actually solvable by the
// stated logic — no trust in the generator's self-declared answer.
// ---------------------------------------------------------------------------

function rowKey(row: Element[]): string {
  return JSON.stringify(row);
}

// Predict a single row's next state from its first five observations.
// Detects: constant (decoy), periodic cycle (period 2..5), and arithmetic
// count progression (same shape/fill, element count changes by a constant step).
// Returns null if no rule is detectable.
function solveRow(obs: Element[][]): Element[] | null {
  const keys = obs.map(rowKey);
  // constant / decoy
  if (new Set(keys).size === 1) return obs[0].map((e) => ({ ...e }));

  // arithmetic count progression: all rows share one shape+fill, counts form an
  // arithmetic sequence. Predict the next count.
  const shape0 = obs[0][0]?.shape;
  const fill0 = obs[0][0]?.fill;
  const sameStyle = obs.every((row) => row.length > 0 && row.every((e) => e.shape === shape0 && e.fill === fill0));
  if (sameStyle) {
    const counts = obs.map((row) => row.length);
    const diffs = counts.slice(1).map((c, i) => c - counts[i]);
    if (diffs.every((d) => d === diffs[0])) {
      const next = counts[counts.length - 1] + diffs[0];
      if (next >= 1) return Array.from({ length: next }, () => ({ shape: shape0!, fill: fill0! }));
    }
  }

  // periodic cycle with period p in 2..5
  for (let p = 2; p <= 5; p++) {
    let periodic = true;
    for (let i = 0; i + p < obs.length; i++) {
      if (keys[i] !== keys[i + p]) { periodic = false; break; }
    }
    if (periodic && obs.length - p >= 1) {
      return obs[5 % p].map((e) => ({ ...e }));
    }
  }
  return null;
}

// Solve a composite (N-row) item: predict panel 6 row-by-row. Returns the
// predicted panel, or null if any row is unsolvable.
function solveComposite(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "composite3" && p.rows)) return null;
  const R = shown[0].rows!.length;
  if (!shown.every((p) => p.rows!.length === R)) return null;
  const predictedRows: Element[][] = [];
  for (let r = 0; r < R; r++) {
    const obs = shown.map((p) => p.rows![r]);
    const next = solveRow(obs);
    if (!next) return null;
    predictedRows.push(next);
  }
  return { layout: "composite3", slots: [], rows: predictedRows };
}

// A fully-specified item built by a frame generator: the six panels (0..5),
// plus a declaration of the rule periods so the validator can check period
// discipline and uniqueness.
interface BuiltItem {
  panels: Panel[]; // length 6; panels[5] is the answer
  periods: number[]; // period of each independently varying attribute
  ruleSummary: string;
  nearMisses: Panel[]; // exactly 4 controlled single-rule violations
  // Optional per-option notes. answerNote describes why the answer fits;
  // nearMissNotes[i] describes which rule nearMisses[i] breaks. If omitted,
  // the UI falls back to a generic correct/incorrect line.
  answerNote?: string;
  nearMissNotes?: string[];
}

// Validate the invariants + run the solver gate. Returns true if sound.
function validateItem(item: BuiltItem, spec: TierSpec): boolean {
  // (1) period discipline — nothing repeats within the shown window.
  if (combinedPeriod(item.periods) < spec.minCombinedPeriod) return false;
  // Also: the 5 shown panels must all be distinct (a visible repeat is a tell).
  const shown = item.panels.slice(0, 5).map(panelKey);
  if (new Set(shown).size !== 5) return false;

  const answerKey = panelKey(item.panels[5]);
  // (3) each near-miss must differ from the answer and from each other.
  const nmKeys = item.nearMisses.map(panelKey);
  if (nmKeys.length !== 4) return false;
  if (nmKeys.some((k) => k === answerKey)) return false; // a near-miss equal to answer = two correct
  if (new Set([answerKey, ...nmKeys]).size !== 5) return false; // all 5 options distinct

  // (5) SOLVER GATE for composite panels: an independent solver must re-derive
  // the SAME answer purely from the shown panels. If it can't, the item is not
  // reliably solvable and is rejected before presentation.
  if (item.panels[0].layout === "composite3") {
    const predicted = solveComposite(item.panels.slice(0, 5));
    if (!predicted) return false;
    if (panelKey(predicted) !== answerKey) return false;
    // and no near-miss may also match the solver's prediction (ambiguity)
    if (nmKeys.includes(panelKey(predicted))) return false;
  }

  // (4) uniqueness (practical form): the answer must CONTINUE the shown
  // sequence, i.e. panels[5] must not equal any earlier shown panel (which
  // would admit a shorter-period rule as an equally-good explanation).
  if (shown.includes(answerKey)) return false;

  return true;
}

// Assemble the final AbstractQuestion from a validated BuiltItem. Options and
// their notes are shuffled together so the per-option feedback stays aligned.
function assemble(
  rng: () => number,
  id: string,
  difficulty: AbstractDifficulty,
  item: BuiltItem,
): AbstractQuestion {
  const answerNote = item.answerNote ?? "This is the only option that satisfies every rule in the sequence.";
  const nmNotes = item.nearMissNotes ?? item.nearMisses.map(() => "This option breaks one of the rules in the sequence.");
  // Build (panel, note, isCorrect) tuples, shuffle, then read back aligned.
  const tuples = [
    { panel: item.panels[5], note: answerNote, correct: true },
    ...item.nearMisses.map((p, i) => ({ panel: p, note: nmNotes[i] ?? "Breaks a rule.", correct: false })),
  ];
  const shuffled = shuffleArr(rng, tuples);
  return {
    id,
    difficulty,
    sequence: item.panels.slice(0, 5),
    options: shuffled.map((t) => t.panel),
    answerIndex: shuffled.findIndex((t) => t.correct),
    ruleSummary: item.ruleSummary,
    optionNotes: shuffled.map((t) => t.note),
  };
}

// Retry wrapper: build until the validator passes (or give up and return the
// last attempt, which the shuffle still dedupes so the UI never breaks).
function buildValid(
  rng: () => number,
  id: string,
  difficulty: AbstractDifficulty,
  build: () => BuiltItem,
): AbstractQuestion {
  const spec = TIER[difficulty];
  let last: BuiltItem | null = null;
  for (let attempt = 0; attempt < 120; attempt++) {
    const item = build();
    last = item;
    if (validateItem(item, spec)) return assemble(rng, id, difficulty, item);
  }
  return assemble(rng, id, difficulty, last!);
}

// ---------------------------------------------------------------------------
// Frame generators. Each produces a dense, structured panel like the real
// EPSO items (Q8 three-row, Q9 pie-grid, Q10 plus). Attributes use coprime
// periods so the combined period clears the tier minimum.
// ---------------------------------------------------------------------------

// FRAME: three-row composite (EPSO Q8). Each row is an independent attribute.
// Rows: top circles (count, period pC), middle triangles (orientation, period
// 2 — but combined with others), bottom shapes (shape-cycle, period pS).
function frameThreeRow(rng: () => number, difficulty: AbstractDifficulty = "hard"): BuiltItem {
  // Choose coprime periods for count and shape so combined >= 6 / 12.
  const extreme = difficulty === "extreme";
  const pCount = extreme ? 4 : 3; // count cycles over this many values
  const pShape = 3;
  const countVals = extreme ? [1, 2, 3, 4] : [1, 2, 3];
  const botCycle = makeShapeCycle(rng, pShape);
  const triPeriod = 2;

  const rowCircles = (n: number): Element[] =>
    Array.from({ length: Math.max(1, n) }, () => ({ shape: "circle", fill: "outline" as Fill }));
  const rowTri = (up: boolean): Element[] =>
    Array.from({ length: 3 }, () => ({ shape: "triangle", fill: "solid" as Fill, tri: up ? "up" : "down" }));
  const rowBot = (shape: ShapeKind): Element[] => [{ shape, fill: "solid" }];

  const panelAt = (t: number): Panel => ({
    layout: "composite3",
    slots: [],
    rows: [
      rowCircles(cycleAt(countVals, t)),
      rowTri(t % triPeriod === 0),
      rowBot(cycleAt(botCycle, t)),
    ],
  });

  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  // Controlled single-rule near-misses.
  const nm1 = clonePanel(answer); nm1.rows![0] = rowCircles(cycleAt(countVals, 5) + 1); // count wrong
  const nm2 = clonePanel(answer); nm2.rows![1] = nm2.rows![1].map((e) => ({ ...e, tri: e.tri === "up" ? "down" : "up" })); // orientation wrong
  const nm3 = clonePanel(answer); nm3.rows![2] = rowBot(cycleAt(botCycle, 6)); // shape-cycle advanced wrong
  const nm4 = clonePanel(answer); nm4.rows![2] = nm4.rows![2].map((e) => ({ ...e, fill: "outline" as Fill })); // fill wrong
  return {
    panels,
    periods: [pCount, triPeriod, pShape],
    ruleSummary:
      "A structured three-row frame. Each row runs its own rule simultaneously: the top row of circles changes in COUNT, the middle triangles flip ORIENTATION, and the bottom shape CYCLES through a fixed set. Advance all three.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// FRAME: pie-grid (EPSO Q9). Corners are quarter-circles rotating; a centre
// shape cycles. Coprime periods: rotation period 4, shape-cycle period 3 =>
// combined 12 (clears extreme).
function framePieGrid(rng: () => number): BuiltItem {
  const starts = [0, 1, 2, 3].map(() => Math.floor(rng() * 4));
  const rot = pick(rng, [1, -1]);
  const centreCycle = makeShapeCycle(rng, 3);
  const q = (c: number, t: number) => ((starts[c] + t * rot) % 4 + 400) % 4;
  const panelAt = (t: number): Panel => ({
    layout: "pieCross",
    slots: [
      { shape: "pie", fill: "solid", quarter: q(0, t) },
      { shape: "pie", fill: "solid", quarter: q(1, t) },
      { shape: "pie", fill: "solid", quarter: q(2, t) },
      { shape: "pie", fill: "solid", quarter: q(3, t) },
      { shape: cycleAt(centreCycle, t), fill: "outline" },
      { shape: cycleAt(centreCycle, t), fill: "solid" },
    ],
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const nm1 = clonePanel(answer); { const e = nm1.slots[0]!; nm1.slots[0] = { ...e, quarter: (e.quarter! + 1) % 4 }; }
  const nm2 = clonePanel(answer); nm2.slots[4] = { ...nm2.slots[4]!, shape: cycleAt(centreCycle, 6) };
  const nm3 = clonePanel(answer); { const e = nm3.slots[2]!; nm3.slots[2] = { ...e, quarter: (e.quarter! + 2) % 4 }; }
  const nm4 = clonePanel(answer); nm4.slots[5] = { ...nm4.slots[5]!, fill: "outline" as Fill };
  return {
    panels,
    periods: [4, 3], // rotation vs shape-cycle, coprime
    ruleSummary:
      "A pie-grid frame: the four corner quarter-circles rotate together each step, and the two centre shapes cycle through a 3-shape sequence (top outline, bottom solid). Track rotation and the shape-cycle at once.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// FRAME: 8-segment square (EPSO Q4). Fill patterns rotate (period 8/ gcd) and a
// dot travels (period 8). Combined long. Already dense and structured.
function frameSegments(rng: () => number): BuiltItem {
  const base: SegPattern[] = Array.from({ length: 8 }, (_, i) => SEG_PATTERNS[i % SEG_PATTERNS.length]);
  const rot = pick(rng, [1, -1]);
  const dotStep = pick(rng, [1, -1]);
  const dotStart = Math.floor(rng() * 8);
  const panelAt = (t: number): Panel => ({
    layout: "segments",
    slots: [],
    segments: base.map((_, k) => base[((k - t * rot) % 8 + 800) % 8]),
    dotPos: ((dotStart + t * dotStep) % 8 + 8) % 8,
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const nm1 = { ...clonePanel(answer), dotPos: ((answer.dotPos ?? 0) + 1) % 8 };
  const nm2 = { ...clonePanel(answer), dotPos: ((answer.dotPos ?? 0) + 4) % 8 };
  const nm3 = clonePanel(panelAt(4)); // rotation off by one
  const nm4 = { ...clonePanel(answer), segments: base.map((_, k) => base[((k - 6 * -rot) % 8 + 800) % 8]) };
  // period of the pattern rotation: 8 / gcd(8, cycleLen). SEG_PATTERNS len 4 so
  // the pattern array has period 4 under rotation; dot has period 8. lcm = 8.
  return {
    panels,
    periods: [4, 8],
    ruleSummary:
      "An eight-segment square. The fill patterns rotate one segment per step, and the dot travels around the segments each step. Track both the rotating fills and the moving dot.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// FRAME: coupled cross (hard/extreme). A marker ORBITS the 4 cross arms
// (period 4); its FILL is COUPLED to its position (solid on N/S arms, outline
// on E/W). A centre shape cycles (period 3). Coupling + coprime periods.
function frameCoupledCross(rng: () => number): BuiltItem {
  const posStep = pick(rng, [1, -1]);
  const centreCycle = makeShapeCycle(rng, 3);
  // four distinct shapes occupy the four arms and ROTATE position each step
  const armShapes = shuffleArr(rng, NON_ARROW); // 4 distinct shapes
  const activeStep = pick(rng, [1, -1]);
  // which arm is "active" (solid) travels; all other arms are outline.
  const panelAt = (t: number): Panel => {
    const active = ((t * activeStep) % 4 + 4) % 4;
    const slots: (Element | null)[] = [0, 1, 2, 3].map((arm) => {
      // the shape at this arm is the rotated assignment
      const shape = armShapes[((arm - t * posStep) % 4 + 4) % 4];
      return { shape, fill: arm === active ? "solid" : "outline" } as Element;
    });
    slots.push({ shape: cycleAt(centreCycle, t), fill: "outline" }); // centre
    return { layout: "cross", slots };
  };
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  // Controlled single-rule near-misses on the dense frame.
  const nm1 = clonePanel(answer); // outer rotation off by one -> use panel 4's arrangement with correct active
  { const alt = panelAt(4); for (let a = 0; a < 4; a++) nm1.slots[a] = { ...alt.slots[a]!, fill: answer.slots[a]!.fill }; }
  const nm2 = clonePanel(answer); // active (solid) arm wrong
  {
    const curActive = answer.slots.findIndex((s, i) => i < 4 && s && s.fill === "solid");
    const wrongActive = (curActive + 1) % 4;
    for (let a = 0; a < 4; a++) nm2.slots[a] = { ...nm2.slots[a]!, fill: a === wrongActive ? "solid" : "outline" };
  }
  const nm3 = clonePanel(answer); nm3.slots[4] = { ...nm3.slots[4]!, shape: cycleAt(centreCycle, 6) }; // centre cycle wrong
  const nm4 = clonePanel(answer); // two outer shapes swapped
  { const tmp = nm4.slots[0]; nm4.slots[0] = nm4.slots[2]; nm4.slots[2] = tmp; }
  return {
    panels,
    periods: [4, 4, 3], // outer-rotation(4), active-travel(4), centre-cycle(3) -> lcm 12
    ruleSummary:
      "A full cross frame: the four outer shapes rotate position around the cross each step; one arm is highlighted SOLID and that highlight travels round the arms; and the centre shape cycles through three forms. Three things move at once — track the rotation, the solid highlight, and the centre.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// FRAME: generalised N-ROW. The backbone hard frame. R rows (2-6), each with
// its own element type and its own rule drawn from a family. Some rows are
// DECOYS — constant across all panels — the "settles nothing" trap. Active-row
// rules use coprime periods so the panel never visibly repeats. Distractors
// each break exactly one ACTIVE row (never a decoy, which would be unfair).
type RowRule =
  | { kind: "count"; vals: number[]; shape: ShapeKind }
  | { kind: "fill"; shape: ShapeKind; cols: number; start: Fill }
  | { kind: "shapeCycle"; cycle: ShapeKind[]; cols: number }
  | { kind: "orientation"; cols: number; startUp: boolean }
  | { kind: "size"; shape: ShapeKind; cols: number; scales: number[] }
  | { kind: "reflect"; shape: ShapeKind; cols: number; startMirror: boolean }
  | { kind: "decoy"; shape: ShapeKind; fill: Fill; cols: number };

function rowElementsAt(rule: RowRule, t: number): Element[] {
  switch (rule.kind) {
    case "count": {
      const n = Math.max(1, cycleAt(rule.vals, t));
      return Array.from({ length: n }, () => ({ shape: rule.shape, fill: "outline" as Fill }));
    }
    case "fill": {
      const f: Fill = (t % 2 === 0) === (rule.start === "solid") ? "solid" : "outline";
      return Array.from({ length: rule.cols }, () => ({ shape: rule.shape, fill: f }));
    }
    case "shapeCycle": {
      const shape = cycleAt(rule.cycle, t);
      return Array.from({ length: rule.cols }, () => ({ shape, fill: "solid" as Fill }));
    }
    case "orientation": {
      const up = (t % 2 === 0) === rule.startUp;
      return Array.from({ length: rule.cols }, () => ({ shape: "triangle", fill: "solid" as Fill, tri: up ? "up" : "down" }));
    }
    case "size": {
      const scale = cycleAt(rule.scales, t);
      return Array.from({ length: rule.cols }, () => ({ shape: rule.shape, fill: "outline" as Fill, scale }));
    }
    case "reflect": {
      // asymmetric shape (triangle pointing) that mirrors each step
      const mir = (t % 2 === 0) === rule.startMirror;
      return Array.from({ length: rule.cols }, () => ({ shape: rule.shape, fill: "solid" as Fill, mirror: mir, tri: "up" as const }));
    }
    case "decoy":
      return Array.from({ length: rule.cols }, () => ({ shape: rule.shape, fill: rule.fill }));
  }
}

// Period of a row rule (1 = constant/decoy).
function rowPeriod(rule: RowRule): number {
  switch (rule.kind) {
    case "count": return rule.vals.length;
    case "fill": return 2;
    case "shapeCycle": return rule.cycle.length;
    case "orientation": return 2;
    case "size": return rule.scales.length;
    case "reflect": return 2;
    case "decoy": return 1;
  }
}

// Is this row an ACTIVE (non-decoy) rule?
function isActive(rule: RowRule): boolean {
  return rule.kind !== "decoy";
}

function frameNRow(rng: () => number, rows: number, activeRules: number): BuiltItem {
  const shapesPool = shuffleArr(rng, NON_ARROW);
  // Rule factories, grouped by period so we can guarantee a long combined period.
  const makeCount3 = (): RowRule => ({ kind: "count", vals: pick(rng, [[1, 2, 3], [2, 3, 4], [1, 2, 3, 4]]), shape: pick(rng, shapesPool) });
  const makeShapeCycle3 = (): RowRule => ({ kind: "shapeCycle", cycle: makeShapeCycle(rng, 3), cols: pick(rng, [2, 3]) });
  const makeSize3 = (): RowRule => ({ kind: "size", shape: pick(rng, shapesPool), cols: pick(rng, [2, 3]), scales: pick(rng, [[0.6, 1.0, 1.4], [1.4, 1.0, 0.6]]) });
  const makeFill2 = (): RowRule => ({ kind: "fill", shape: pick(rng, shapesPool), cols: pick(rng, [2, 3]), start: pick(rng, ["solid", "outline"] as Fill[]) });
  const makeOrient2 = (): RowRule => ({ kind: "orientation", cols: 3, startUp: rng() < 0.5 });
  const makeReflect2 = (): RowRule => ({ kind: "reflect", shape: "triangle", cols: pick(rng, [2, 3]), startMirror: rng() < 0.5 });
  const period3Factories = [makeCount3, makeShapeCycle3, makeSize3];
  const period2Factories = [makeFill2, makeOrient2, makeReflect2];

  // Build the active rule set. To GUARANTEE five distinct shown panels, one
  // active row is a "count" rule whose six values are all distinct within the
  // window (a strictly varying count), which alone makes every panel differ.
  // Remaining active rows add independent rules on top.
  const distinctCountVals = pick(rng, [
    [1, 2, 3, 4, 5, 6],
    [6, 5, 4, 3, 2, 1],
    [2, 3, 4, 5, 6, 7],
    [1, 3, 2, 4, 3, 5],
  ]);
  const activeRuleSet: RowRule[] = [
    { kind: "count", vals: distinctCountVals, shape: pick(rng, shapesPool) },
  ];
  while (activeRuleSet.length < activeRules) {
    activeRuleSet.push(pick(rng, [...period3Factories, ...period2Factories])());
  }

  // Assign active rules to random row positions; the rest are decoys.
  const rowRules: RowRule[] = [];
  const activeIdx = shuffleArr(rng, Array.from({ length: rows }, (_, i) => i)).slice(0, activeRules);
  let a = 0;
  for (let r = 0; r < rows; r++) {
    if (activeIdx.includes(r)) {
      rowRules.push(activeRuleSet[a++]);
    } else {
      rowRules.push({ kind: "decoy", shape: pick(rng, shapesPool), fill: pick(rng, ["solid", "outline"] as Fill[]), cols: pick(rng, [1, 2, 3]) });
    }
  }

  const panelAt = (t: number): Panel => ({
    layout: "composite3",
    slots: [],
    rows: rowRules.map((rule) => rowElementsAt(rule, t)),
  });

  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];

  // Build 4 near-misses: each breaks exactly one ACTIVE row. Track which row,
  // so we can describe precisely what each distractor got wrong.
  const activeRows = rowRules.map((r, i) => ({ r, i })).filter((x) => isActive(x.r));
  const nearMisses: Panel[] = [];
  const nearMissNotes: string[] = [];
  const ruleName = (rule: RowRule): string => {
    switch (rule.kind) {
      case "count": return "the row whose element COUNT changes";
      case "fill": return "the row whose FILL alternates";
      case "shapeCycle": return "the row whose SHAPE cycles";
      case "orientation": return "the row of triangles whose ORIENTATION flips";
      case "size": return "the row whose element SIZE changes";
      case "reflect": return "the row whose shapes MIRROR each step";
      case "decoy": return "a constant row";
    }
  };
  for (let k = 0; k < 4; k++) {
    const target = activeRows[k % activeRows.length];
    const nm = clonePanel(answer);
    nm.rows![target.i] = rowElementsAt(target.r, 6 + k); // wrong continuation
    if (JSON.stringify(nm.rows![target.i]) === JSON.stringify(answer.rows![target.i])) {
      nm.rows![target.i] = nm.rows![target.i].map((e) => ({ ...e, fill: e.fill === "solid" ? "outline" : "solid" }));
    }
    nearMisses.push(nm);
    nearMissNotes.push(`Row ${target.i + 1} is wrong — it does not correctly continue ${ruleName(target.r)}. Every other row is right, which is what makes it tempting.`);
  }

  const activePeriods = rowRules.filter(isActive).map(rowPeriod);
  const decoyCount = rowRules.filter((r) => !isActive(r)).length;
  // Describe each active row for the answer note.
  const activeDescriptions = rowRules
    .map((r, i) => ({ r, i }))
    .filter((x) => isActive(x.r))
    .map((x) => `row ${x.i + 1} (${ruleName(x.r).replace(/^the row (whose |of )?/, "")})`);
  const answerNote =
    `Correct. The active rows are: ${activeDescriptions.join("; ")}. ` +
    (decoyCount > 0 ? `The remaining ${decoyCount} row${decoyCount === 1 ? "" : "s"} stay constant (decoys) and settle nothing. ` : "") +
    "This option continues every active row correctly.";
  return {
    panels,
    periods: activePeriods.length ? activePeriods : [1],
    ruleSummary:
      `A ${rows}-row frame. ${activeRules} row${activeRules === 1 ? "" : "s"} follow a rule (count, fill, shape-cycle, orientation, size or reflection); ` +
      `${decoyCount} row${decoyCount === 1 ? " is" : "s are"} unchanging DECOYS that settle nothing. ` +
      "Check every row — find which ones change and how, and ignore the constant ones.",
    nearMisses,
    nearMissNotes,
    answerNote,
    __rowRules: rowRules,
  } as BuiltItem & { __rowRules: RowRule[] };
}

// FRAME: easy — a single element with a shape cycle (period 3) + fill
// alternation (period 2); the two are coprime -> period 6 so all 5 shown
// panels are distinct.
function frameEasy(rng: () => number): BuiltItem {
  const mode = pick(rng, ["arrow", "shape"]);
  if (mode === "arrow") {
    const start = pick(rng, CW);
    const step = pick(rng, [1, -1]);
    // single arrow that rotates, plus a fill that alternates -> period lcm(4,2)=4.
    // To get 5 distinct panels we also move it along the row (period 3 position).
    const panelAt = (t: number): Panel => {
      const pos = t % 3;
      const slots: (Element | null)[] = [null, null, null];
      slots[pos] = { shape: "arrow", fill: "solid", direction: rotateDir(start, t * step) };
      return { layout: "row3", slots };
    };
    const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
    const answer = panels[5];
    const correctPos = 5 % 3;
    const mk = (pos: number, dir: Direction): Panel => {
      const slots: (Element | null)[] = [null, null, null];
      slots[pos] = { shape: "arrow", fill: "solid", direction: dir };
      return { layout: "row3", slots };
    };
    const dir5 = answer.slots[correctPos]!.direction!;
    const nm1 = mk(correctPos, rotateDir(dir5, 1));
    const nm2 = mk(correctPos, rotateDir(dir5, -1));
    const nm3 = mk((correctPos + 1) % 3, dir5);
    const nm4 = clonePanel(panelAt(4));
    return {
      panels,
      periods: [4, 3], // rotation(4) x position(3) -> 12
      ruleSummary: `The arrow rotates 90° ${step === 1 ? "clockwise" : "anticlockwise"} each step AND moves one place along the row. Continue both.`,
      nearMisses: [nm1, nm2, nm3, nm4],
    };
  }
  const cycle = makeShapeCycle(rng, 3);
  // one shape that cycles (period 3) and alternates fill (period 2) -> period 6.
  const panelAt = (t: number): Panel => ({
    layout: "row3",
    slots: [null, { shape: cycleAt(cycle, t), fill: t % 2 === 0 ? "solid" : "outline" }, null],
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const base = answer.slots[1]!;
  const nm1 = { layout: "row3", slots: [null, { ...base, shape: cycleAt(cycle, 6) }, null] } as Panel;
  const nm2 = { layout: "row3", slots: [null, { ...base, fill: base.fill === "solid" ? "outline" : "solid" }, null] } as Panel;
  const nm3 = clonePanel(panelAt(4));
  const nm4 = { layout: "row3", slots: [null, { ...base, shape: cycleAt(cycle, 7) }, null] } as Panel;
  return {
    panels,
    periods: [3, 2], // shape(3) x fill(2) -> 6
    ruleSummary: "The shape cycles through three forms AND the fill alternates. Because the two periods differ the figure only repeats every six steps — continue both.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// FRAME: medium row-of-3 with two coprime-period attributes (shape-cycle period
// 3, fill alternation period 2) over three positions, each offset — dense,
// combined period 6.
function frameMediumRow(rng: () => number): BuiltItem {
  const cycle = makeShapeCycle(rng, 3);
  const panelAt = (t: number): Panel => ({
    layout: "row3",
    slots: [0, 1, 2].map((pos) => ({
      shape: cycleAt(cycle, t + pos),
      fill: (t + pos) % 2 === 0 ? "solid" : "outline",
    })),
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const nm1 = clonePanel(answer); nm1.slots[0] = { ...nm1.slots[0]!, shape: cycleAt(cycle, 6 + 1) };
  const nm2 = clonePanel(answer); nm2.slots[1] = { ...nm2.slots[1]!, fill: nm2.slots[1]!.fill === "solid" ? "outline" : "solid" };
  const nm3 = clonePanel(answer); nm3.slots[2] = { ...nm3.slots[2]!, shape: cycleAt(cycle, 6 + 3) };
  const nm4 = clonePanel(panelAt(4));
  return {
    panels,
    periods: [3, 2], // coprime -> 6
    ruleSummary:
      "Three positions, each one step further along the SAME shape-cycle (period 3) with fill alternating (period 2). Because the two periods are coprime the whole row only repeats every six steps — advance each position by one.",
    nearMisses: [nm1, nm2, nm3, nm4],
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------
type Generator = (rng: () => number, id: string) => AbstractQuestion;

// Every tier uses the rigorous frame-based engine via buildValid, which
// enforces the four invariants (period discipline, exactly-one-correct,
// single-rule near-misses, uniqueness). Frames are dense and structured like
// the real EPSO items (three-row, pie-grid, 8-segment, coupled cross).
const TEMPLATES: Record<AbstractDifficulty, ((rng: () => number) => BuiltItem)[]> = {
  easy: [
    frameEasy,
    (rng) => frameNRow(rng, 3, 2), // 3 rows, 2 active (coprime -> period>=6), 1 decoy
  ],
  medium: [
    frameMediumRow,
    (rng) => frameNRow(rng, 4, 2), // 4 rows, 2 active, 2 decoys
  ],
  hard: [
    (rng) => frameNRow(rng, 4, 3), // 4 rows, 3 active, 1 decoy
    (rng) => frameNRow(rng, 5, 3), // 5 rows, 3 active, 2 decoys
    framePieGrid,
    frameSegments,
    frameCoupledCross,
  ],
  extreme: [
    (rng) => frameNRow(rng, 6, 5), // 6 rows, 5 active, 1 decoy
    (rng) => frameNRow(rng, 6, 6), // 6 rows, ALL active — maximum load
    framePieGrid,
    frameSegments,
    frameCoupledCross,
  ],
};

export function generateAbstractQuestion(
  difficulty: AbstractDifficulty,
  seed?: number,
): AbstractQuestion {
  const s = seed ?? Math.floor(Math.random() * 1_000_000);
  const rng = makeRng(s);
  const id = `abstract-${difficulty}-${s}`;
  const frames = TEMPLATES[difficulty];
  const frame = frames[Math.floor(rng() * frames.length)];
  return buildValid(rng, id, difficulty, () => frame(rng));
}
