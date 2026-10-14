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

export type AbstractDifficulty = "easy" | "medium" | "hard";

// A primitive element drawn in a slot.
export type ShapeKind =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "arrow";

export type Fill = "solid" | "outline";

export type Direction = "up" | "down" | "left" | "right";

// One drawable element with its attributes. Not all attributes apply to every
// shape (arrows use `direction`; others use `fill`).
export interface Element {
  shape: ShapeKind;
  fill: Fill;
  direction?: Direction; // only for arrows
}

// A panel is a fixed layout of positioned slots, each holding one element
// (or null for an empty slot). `layout` tells the renderer how to place them.
export type PanelLayout = "single" | "row3" | "cross" | "stack2";

export interface Panel {
  layout: PanelLayout;
  slots: (Element | null)[];
}

export interface AbstractQuestion {
  id: string;
  difficulty: AbstractDifficulty;
  sequence: Panel[]; // the 5 shown panels
  options: Panel[]; // 5 answer options A-E
  answerIndex: number; // 0..4 -> A..E
  ruleSummary: string; // human-readable explanation of the rules
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
  return a.shape === b.shape && a.fill === b.fill && a.direction === b.direction;
}

function clonePanel(p: Panel): Panel {
  return { layout: p.layout, slots: p.slots.map((s) => (s ? { ...s } : null)) };
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
// Tries, in order: flip a fill, rotate an arrow, change a shape.
const NUDGE_SHAPES: ShapeKind[] = ["circle", "square", "triangle", "diamond"];
function nudgePanel(p: Panel, salt: number): Panel {
  const out = clonePanel(p);
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
  if (a.layout !== b.layout || a.slots.length !== b.slots.length) return false;
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

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------
type Generator = (rng: () => number, id: string) => AbstractQuestion;

const TEMPLATES: Record<AbstractDifficulty, Generator[]> = {
  easy: [genEasy, genEasyFillCycle, genEasyMove],
  medium: [genMedium, genMediumStack, genMediumTwoArrows],
  hard: [genHard, genHardFlipTravel],
};

export function generateAbstractQuestion(
  difficulty: AbstractDifficulty,
  seed?: number,
): AbstractQuestion {
  const s = seed ?? Math.floor(Math.random() * 1_000_000);
  const rng = makeRng(s);
  const id = `abstract-${difficulty}-${s}`;
  const templates = TEMPLATES[difficulty];
  const gen = templates[Math.floor(rng() * templates.length)];
  return gen(rng, id);
}
