// Abstract reasoning — deterministic generator and types.
//
// This is NOT LLM-generated. A rule engine builds a sequence of panels by
// applying transformations step by step, so it ALWAYS knows the correct next
// panel and can build distractors that each break exactly one rule. That
// guarantees validity — exactly one correct answer, no false positives.
//
// Live EPSO abstract is a series of five squares; you pick which figure comes
// next from five options. A set mixes figure types: a 3×3 cell grid, a single
// rotating shape, a row of shapes, a cross, a pie grid, an 8-segment square,
// and (on the harder tiers) several rules stacked in one figure.

export type AbstractDifficulty = "easy" | "medium" | "hard" | "extreme";

// A primitive element drawn in a slot.
export type ShapeKind =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "arrow"
  | "pie" // quarter-filled circle; the filled quarter is set by `quarter`
  // Extended vocabulary. The first four are static figures; the next four have
  // NO rotational symmetry, so their orientation (`rot`) is always readable.
  | "cross"
  | "star"
  | "hexagon"
  | "lshape" // asymmetric: orientation readable at every 45°
  | "chevron" // asymmetric
  | "semicircle" // asymmetric
  | "crescent" // asymmetric
  | "ngon" // regular polygon with `sides` (3..8) and a marker dot on vertex 0
  | "pacman" // circle with a wedge removed: gap width `open`, gap direction `rot`
  | "dirCircle" // a circle with a filled arrowhead pointing one of 8 directions (`rot`)
  | "face"; // a face whose mouth is a smile or a frown (set by `smile`)

// solid/outline are the classic fills. `half` fills one half of the shape (which
// half rotates with `rot`), `hatch` fills it with diagonal stripes.
// `white` is an OPAQUE white fill (unlike `outline`, which is transparent), used for
// figures that sit on top of others or on a grey background.
export type Fill = "solid" | "outline" | "half" | "hatch" | "white";

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
  rot?: number; // rotation in degrees, a multiple of 45 (any shape except arrow/pie)
  sides?: number; // 3..8 — only for shape "ngon"
  rings?: number; // 0..2 — concentric containers drawn around the element
  open?: number; // 45..270 — gap width of a "pacman", in degrees
  smile?: boolean; // face mouth: true = smile, false = frown
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
  | "grid3" // 3×3 cells; slots[r*3+c] is the shape in that cell, or null
  | "pieCross" // 4 corner pie-circles + up to 2 centre shapes (EPSO Q9 extreme)
  | "nested" // outer shape + inner shape + corner shape on a grey/white background
  | "bars" // a bar chart: N bars of integer height; a marker + a dot-count (EPSO donor-bar)
  | "rowcol" // a grid with one full row + one full column highlighted (EPSO row/column)
  | "pluscross"; // plus of 5 tiles: top/left/right shapes, centre flow-arrow, bottom face + dots

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
  // bars layout (EPSO donor-bar): integer height of each bar, index of the bar
  // the triangle marker sits over, and the number of dots shown beneath.
  bars?: number[];
  markerBar?: number; // which bar the triangle points at
  dots?: number; // dot-count under the chart (units transferred this step)
  // rowcol layout (EPSO row/column): a grid of `gridRows`×`gridCols`. One whole
  // row and one whole column are highlighted; their single intersection cell is
  // coloured differently and that colour alternates.
  // nested layout: three shapes in three ROLES (corner / outer / inner) on an
  // alternating grey/white background.
  nest?: { corner: ShapeKind; outer: ShapeKind; inner: ShapeKind; outerFill: Fill };
  bg?: "grey" | "white";
  gridRows?: number;
  gridCols?: number;
  hiRow?: number; // highlighted row index (0-based, top→bottom)
  hiCol?: number; // highlighted column index (0-based, left→right)
  intersectColor?: "grey" | "navy"; // colour of the single intersection cell
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
  // Per-option plausibility (aligned to `options`): -1 for the correct answer,
  // otherwise 0 = most tempting distractor … larger = easier to eliminate.
  optionRanks?: number[];
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
    a.tri === b.tri &&
    a.rot === b.rot &&
    a.sides === b.sides &&
    a.rings === b.rings
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
    // bars layout
    ...(p.bars ? { bars: p.bars.slice() } : {}),
    ...(p.markerBar !== undefined ? { markerBar: p.markerBar } : {}),
    ...(p.dots !== undefined ? { dots: p.dots } : {}),
    // rowcol layout
    ...(p.gridRows !== undefined ? { gridRows: p.gridRows } : {}),
    ...(p.gridCols !== undefined ? { gridCols: p.gridCols } : {}),
    ...(p.hiRow !== undefined ? { hiRow: p.hiRow } : {}),
    ...(p.hiCol !== undefined ? { hiCol: p.hiCol } : {}),
    ...(p.intersectColor ? { intersectColor: p.intersectColor } : {}),
    // nested layout
    ...(p.nest ? { nest: { ...p.nest } } : {}),
    ...(p.bg ? { bg: p.bg } : {}),
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

// Static figures: only IDENTITY matters (no rotation). Widened beyond the four
// classic shapes so figures look varied; BASIC_SHAPES is kept for dense layouts
// where a tiny star or hexagon would be illegible (large counts, shrunken sizes).
const NON_ARROW: ShapeKind[] = [
  "circle", "square", "triangle", "diamond", "cross", "star", "hexagon", "crescent", "semicircle",
];
const BASIC_SHAPES: ShapeKind[] = ["circle", "square", "triangle", "diamond"];
// Glyphs with NO rotational symmetry: every 45° orientation looks different, so a
// rotation rule applied to them is always readable (unlike a square turned 90°).
const ASYMMETRIC: ShapeKind[] = ["lshape", "chevron", "semicircle", "crescent", "pacman"];

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

// ---------------------------------------------------------------------------
// SOLVER REGISTRY. One entry per layout. Each solver independently re-derives
// panel 6 purely from the five shown panels, using the SIMPLEST rule consistent
// with them. validateItem rejects any item whose layout has no solver, or whose
// solver cannot reproduce the designated answer. This makes the gate universal
// instead of composite-only.
// ---------------------------------------------------------------------------

// Helper: extrapolate an integer sequence a0..a4 by a constant difference and
// return the next value, or null if not arithmetic.
function nextArithmetic(xs: number[]): number | null {
  const d = xs[1] - xs[0];
  return xs.slice(1).every((v, i) => v - xs[i] === d) ? xs[xs.length - 1] + d : null;
}

// Helper: extrapolate a modular sequence (e.g. direction/quarter/position) by a
// constant step mod m; returns next value or null.
function nextModular(xs: number[], m: number): number | null {
  const step = ((xs[1] - xs[0]) % m + m) % m;
  const ok = xs.slice(1).every((v, i) => ((xs[i] + step) % m) === ((v % m) + m) % m);
  return ok ? ((xs[4] + step) % m + m) % m : null;
}

// Re-derive a single Element slot across 5 observations. Handles the attribute
// families the engine actually uses: shape-cycle, fill-alternation, arrow
// direction rotation, pie quarter rotation, triangle orientation, mirror,
// position (null vs present handled by caller). Returns the predicted element
// or null if the slot's behaviour isn't a simple extrapolation.
const DIR_ORDER: Direction[] = ["up", "right", "down", "left"];
function solveElementSlot(obs: (Element | null)[]): Element | null | undefined {
  // all null -> stays null
  if (obs.every((e) => e === null)) return null;
  // mixed null/present -> caller handles movement; bail here
  if (obs.some((e) => e === null)) return undefined;
  const els = obs as Element[];
  // shape: either constant or a detected cycle of length 2..5
  const shapeSeq = els.map((e) => e.shape);
  const shape = solveCycleValue(shapeSeq);
  if (shape === undefined) return undefined;
  // fill: constant or alternating
  const fillSeq = els.map((e) => e.fill);
  const fill = solveCycleValue(fillSeq);
  if (fill === undefined) return undefined;
  const out: Element = { shape, fill };
  // arrow direction
  if (els[0].direction !== undefined) {
    const idx = els.map((e) => DIR_ORDER.indexOf(e.direction!));
    const n = nextModular(idx, 4);
    if (n === null) return undefined;
    out.direction = DIR_ORDER[n];
  }
  // pie quarter
  if (els[0].quarter !== undefined) {
    const n = nextModular(els.map((e) => e.quarter!), 4);
    if (n === null) return undefined;
    out.quarter = n;
  }
  // triangle orientation
  if (els[0].tri !== undefined) {
    const triSeq = els.map((e) => e.tri!);
    const t = solveCycleValue(triSeq);
    if (t === undefined) return undefined;
    out.tri = t;
  }
  // mirror
  if (els[0].mirror !== undefined) {
    const mSeq = els.map((e) => !!e.mirror);
    const m = solveCycleValue(mSeq);
    if (m === undefined) return undefined;
    out.mirror = m;
  }
  // rotation in 45° units, linear step mod 8
  if (els[0].rot !== undefined) {
    const n = nextModular(els.map((e) => Math.round((e.rot ?? 0) / 45)), 8);
    if (n === null) return undefined;
    out.rot = n * 45;
  }
  // face expression: constant or alternating
  if (els[0].smile !== undefined) {
    const sm = solveCycleValue(els.map((e) => !!e.smile));
    if (sm === undefined) return undefined;
    out.smile = sm;
  }
  // gap width of a pacman: steady growth/shrink per step
  if (els[0].open !== undefined) {
    const n = nextArithmetic(els.map((e) => e.open ?? 0));
    if (n === null || n < 45 || n > 270) return undefined;
    out.open = n;
  }
  // sides / rings are coupled attributes: only a dedicated solver may predict them
  if (els.some((e) => e.sides !== undefined || e.rings !== undefined)) return undefined;
  return out;
}

// Generic value-cycle solver: returns the predicted 6th value if the sequence
// is constant or a clean period-2..5 cycle; undefined otherwise.
function solveCycleValue<T>(xs: T[]): T | undefined {
  const key = (v: T) => JSON.stringify(v);
  if (new Set(xs.map(key)).size === 1) return xs[0];
  for (let p = 2; p <= 5; p++) {
    let ok = true;
    for (let i = 0; i + p < xs.length; i++) if (key(xs[i]) !== key(xs[i + p])) { ok = false; break; }
    if (ok) return xs[5 % p];
  }
  return undefined;
}

// Solve a slot-based panel (row3/cross/pieCross/single/stack2) by re-deriving
// each slot independently. For slots where a single element MOVES between
// positions (null<->present), we extrapolate the occupied index linearly.
function solveSlots(shown: Panel[], layout: PanelLayout): Panel | null {
  const n = shown[0].slots.length;
  if (!shown.every((p) => p.slots.length === n)) return null;

  // Detect the "single moving element" case: exactly one occupied slot per
  // panel, same element, position advancing linearly.
  const occPer = shown.map((p) => p.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0));
  if (occPer.every((o) => o.length === 1)) {
    const positions = occPer.map((o) => o[0]);
    const np = nextModular(positions, n);
    const elemSeq = shown.map((p) => p.slots[p.slots.findIndex((s) => s)]!);
    const el = solveElementSlot(elemSeq);
    if (np !== null && el && el !== undefined) {
      const slots: (Element | null)[] = Array.from({ length: n }, () => null);
      slots[np] = el;
      return { layout, slots };
    }
  }

  // Otherwise each slot is independent.
  const slots: (Element | null)[] = [];
  for (let i = 0; i < n; i++) {
    const pred = solveElementSlot(shown.map((p) => p.slots[i]));
    if (pred === undefined) return null; // unsolvable slot
    slots.push(pred);
  }
  return { layout, slots };
}

// Solve segments: fills rotate by a constant step; dot moves by a constant step.
function solveSegments(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.segments && p.dotPos !== undefined)) return null;
  const L = shown[0].segments!.length;
  const rotate = (arr: SegPattern[], r: number) => arr.map((_, k) => arr[(((k - r) % L) + L) % L]);
  // find constant rotation
  const s0 = shown[0].segments!;
  let foundR: number | null = null;
  for (let r = 0; r < L; r++) {
    if (shown.every((p, i) => JSON.stringify(p.segments) === JSON.stringify(rotate(s0, i * r)))) {
      foundR = r;
      break;
    }
  }
  if (foundR === null) return null;
  const dots = shown.map((p) => p.dotPos!);
  const nd = nextModular(dots, 8);
  if (nd === null) return null;
  return {
    layout: "segments",
    slots: [],
    segments: rotate(s0, 5 * foundR),
    dotPos: nd,
  };
}

// Solve grid3: every occupied cell is a token that steps around the 8-cell ring
// by a constant signed amount; centre (cell 4) is independent. Match tokens by
// (shape,fill) across steps and extrapolate each by its ring step.
function solveGrid3(shown: Panel[]): Panel | null {
  const ringIdxOf: Record<number, number> = {};
  GRID_RING.forEach((cell, idx) => (ringIdxOf[cell] = idx));
  // Build per-(shape,fill) ring-position sequences for border cells.
  const styleKey = (e: Element) => `${e.shape}:${e.fill}`;
  // collect the styles present in panel 0 border
  const border0 = shown[0].slots
    .map((e, cell) => ({ e, cell }))
    .filter((x) => x.e && x.cell !== 4) as { e: Element; cell: number }[];
  const slots: (Element | null)[] = Array.from({ length: 9 }, () => null);
  const usedStyles = new Set<string>();
  for (const { e } of border0) {
    const sk = styleKey(e);
    if (usedStyles.has(sk)) {
      // duplicate styles make matching ambiguous -> refuse to solve
      return null;
    }
    usedStyles.add(sk);
    const ringSeq: number[] = [];
    for (const p of shown) {
      const found = p.slots
        .map((el, cell) => ({ el, cell }))
        .find((x) => x.el && cell_isCentreSafe(x.cell) && styleKey(x.el!) === sk);
      if (!found) return null;
      ringSeq.push(ringIdxOf[found.cell]);
    }
    const nr = nextModular(ringSeq, 8);
    if (nr === null) return null;
    slots[GRID_RING[nr]] = { ...e };
  }
  // centre independent
  const centreSeq = shown.map((p) => p.slots[4]);
  if (centreSeq.some((c) => c)) {
    const pred = solveElementSlot(centreSeq);
    if (pred === undefined) return null;
    slots[4] = pred;
  }
  return { layout: "grid3", slots };
}
function cell_isCentreSafe(cell: number): boolean {
  return cell !== 4;
}

// Solve the coupled cross (frameCoupledCross): 4 arm shapes rotate position by
// a constant step; the solid-highlighted arm travels by a constant step; the
// centre (slot 4) shape cycles. Re-derive all three from the 5 shown panels.
function solveCross(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.slots.length >= 5)) return null;
  // Arm rotation: track each distinct shape's arm index 0..3 over time.
  const shapesP0 = shown[0].slots.slice(0, 4).map((s) => s?.shape);
  if (shapesP0.some((s) => s === undefined)) return null;
  // Each shape must appear exactly once per panel in the 4 arms, at a position
  // that advances by a constant step.
  const predArmShape: (ShapeKind | null)[] = [null, null, null, null];
  for (const shp of new Set(shapesP0 as ShapeKind[])) {
    const posSeq: number[] = [];
    for (const p of shown) {
      const idx = p.slots.slice(0, 4).findIndex((s) => s?.shape === shp);
      if (idx < 0) return null;
      posSeq.push(idx);
    }
    const nx = nextModular(posSeq, 4);
    if (nx === null) return null;
    predArmShape[nx] = shp;
  }
  if (predArmShape.some((s) => s === null)) return null;
  // Active (solid) arm travels linearly.
  const activeSeq = shown.map((p) => p.slots.slice(0, 4).findIndex((s) => s?.fill === "solid"));
  if (activeSeq.some((a) => a < 0)) return null;
  const predActive = nextModular(activeSeq, 4);
  if (predActive === null) return null;
  // Centre cycles.
  const centrePred = solveElementSlot(shown.map((p) => p.slots[4]));
  if (centrePred === undefined) return null;
  const slots: (Element | null)[] = [0, 1, 2, 3].map((arm) => ({
    shape: predArmShape[arm]!,
    fill: arm === predActive ? "solid" : "outline",
  }));
  slots.push(centrePred);
  return { layout: "cross", slots };
}

const SOLVERS: Partial<Record<PanelLayout, (shown: Panel[]) => Panel | null>> = {
  composite3: solveComposite,
  row3: (s) => solveSlots(s, "row3"),
  cross: solveCross,
  single: (s) => solveSlots(s, "single"),
  stack2: (s) => solveSlots(s, "stack2"),
  pieCross: (s) => solveSlots(s, "pieCross"),
  segments: solveSegments,
  grid3: solveGrid3,
  // bars + rowcol solvers are defined with their frames below and registered there.
};

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
  // Optional plausibility rank per near-miss (aligned to `nearMisses`): lower =
  // MORE tempting (the answer a strong candidate might wrongly arrive at). When
  // omitted, assemble() derives a rank from how visually close each near-miss is
  // to the correct answer. Used to (a) prefer tempting distractors and (b) feed
  // per-option difficulty into the UI/analytics.
  nearMissRanks?: number[];
  // Optional frame-specific solver. When set, the universal gate uses THIS to
  // independently re-derive the answer instead of the layout-keyed default.
  // Needed when several frames share a layout but encode different rules (e.g.
  // grid3 is used by both the ring-movement frames and the XOR-overlay frame).
  solver?: (shown: Panel[]) => Panel | null;
}

// ---------------------------------------------------------------------------
// VISUAL IDENTITY. Two panels can differ in DATA yet draw the SAME picture: a
// square turned 90° is the same square, an 8-gon turned 135° vs 225° coincides.
// A plain data comparison therefore cannot prove that two options are visibly
// different. visualKey() normalises each element by the rotational symmetry of
// what is actually drawn, so equal keys <=> indistinguishable on screen.
// ---------------------------------------------------------------------------
function symmetryDeg(e: Element): number {
  // A half/hatch fill or a marker breaks the shape's own symmetry.
  if (e.fill === "half" || e.shape === "ngon") return 360;
  switch (e.shape) {
    case "circle": return 1; // any angle looks identical
    case "square": case "diamond": case "cross": return 90;
    case "hexagon": return 60;
    case "star": return 72;
    case "triangle": return 120;
    default: return 360; // asymmetric glyphs, arrow, pie
  }
}
function visualElement(e: Element | null): unknown {
  if (!e) return null;
  const { rot, ...rest } = e;
  if (rot === undefined) return rest;
  const sym = symmetryDeg(e);
  const norm = sym === 1 ? 0 : ((rot % sym) + sym) % sym;
  return { ...rest, rot: norm };
}
function visualKey(p: Panel): string {
  return JSON.stringify({
    ...p,
    slots: p.slots.map(visualElement),
    ...(p.rows ? { rows: p.rows.map((r) => r.map(visualElement)) } : {}),
  });
}

// How many visible atoms differ between two panels of the same layout. Used to
// auto-rank distractors: a smaller distance = a more tempting near-miss. Covers
// every layout the engine emits; falls back to a whole-panel 0/1 compare.
function visualDistance(a: Panel, b: Panel): number {
  if (a.layout !== b.layout) return 99;
  const ve = (e: Element | null) => JSON.stringify(visualElement(e));
  let d = 0;
  // slot-based layouts
  const n = Math.max(a.slots.length, b.slots.length);
  for (let i = 0; i < n; i++) if (ve(a.slots[i] ?? null) !== ve(b.slots[i] ?? null)) d++;
  // composite rows
  if (a.rows || b.rows) {
    const ar = a.rows ?? [], br = b.rows ?? [];
    const R = Math.max(ar.length, br.length);
    for (let r = 0; r < R; r++) {
      const x = ar[r] ?? [], y = br[r] ?? [];
      if (x.length !== y.length) d += Math.abs(x.length - y.length);
      const m = Math.min(x.length, y.length);
      for (let i = 0; i < m; i++) if (ve(x[i]) !== ve(y[i])) d++;
    }
  }
  // structured scalars
  const scal: (keyof Panel)[] = ["dotPos", "dots", "markerBar", "hiRow", "hiCol", "intersectColor", "bg", "count"];
  for (const k of scal) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) d++;
  if (JSON.stringify(a.segments) !== JSON.stringify(b.segments)) d++;
  if (JSON.stringify(a.bars) !== JSON.stringify(b.bars)) d++;
  if (JSON.stringify(a.nest) !== JSON.stringify(b.nest)) d++;
  return d === 0 ? 1 : d; // never 0 (options are guaranteed distinct)
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
  // (3b) ...and VISIBLY distinct: no two options may draw the same picture, and
  // no shown panel may look identical to a neighbour (a hidden repeat).
  const optVisual = [item.panels[5], ...item.nearMisses].map(visualKey);
  if (new Set(optVisual).size !== 5) return false;
  if (new Set(item.panels.slice(0, 5).map(visualKey)).size !== 5) return false;
  if (item.panels.slice(0, 5).map(visualKey).includes(optVisual[0])) return false;

  // (5) UNIVERSAL SOLVER GATE. An independent solver — the frame's own if it
  // provides one, else the layout-keyed default — must re-derive the SAME answer
  // purely from the five shown panels, and no near-miss may also satisfy that
  // derivation. If no solver is available the item is REJECTED: every served
  // frame must be independently checkable (this is what prevents shipping a
  // figure whose stated rule does not actually determine the answer).
  const layout = item.panels[0].layout;
  const solver = item.solver ?? SOLVERS[layout];
  if (!solver) return false;
  const predicted = solver(item.panels.slice(0, 5));
  if (!predicted) return false;
  if (panelKey(predicted) !== answerKey) return false;
  if (nmKeys.includes(panelKey(predicted))) return false;

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
  // Plausibility ranks: use the frame's own if given, else derive from how
  // visually CLOSE each distractor is to the correct answer — a distractor that
  // differs in only one small way is the most tempting (rank 0).
  const answer = item.panels[5];
  const ranks =
    item.nearMissRanks ??
    (() => {
      const dists = item.nearMisses.map((nm) => visualDistance(answer, nm));
      // rank by ascending distance (ties keep input order): 0 = closest/tempting
      const order = dists.map((d, i) => ({ d, i })).sort((a, b) => a.d - b.d || a.i - b.i);
      const r = new Array(item.nearMisses.length).fill(0);
      order.forEach((o, rank) => (r[o.i] = rank));
      return r;
    })();
  // Build (panel, note, rank, isCorrect) tuples, shuffle, then read back aligned.
  const tuples = [
    { panel: item.panels[5], note: answerNote, rank: -1, correct: true },
    ...item.nearMisses.map((p, i) => ({ panel: p, note: nmNotes[i] ?? "Breaks a rule.", rank: ranks[i] ?? i, correct: false })),
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
    optionRanks: shuffled.map((t) => t.rank),
  };
}

// Retry wrapper. Returns null when nothing in this frame validates, so the
// caller can try another frame. A failed item is never shown.
function buildValid(
  rng: () => number,
  id: string,
  difficulty: AbstractDifficulty,
  build: () => BuiltItem,
): AbstractQuestion | null {
  const spec = TIER[difficulty];
  for (let attempt = 0; attempt < 40; attempt++) {
    const item = build();
    if (validateItem(item, spec)) return assemble(rng, id, difficulty, item);
  }
  return null;
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
  // The 8 segment fills must be APERIODIC around the ring. If they repeat with a
  // shorter period (e.g. a 4-value pattern tiled twice, as the old code did)
  // then a +1 rotation is visually identical to a +5 rotation — so "rotate one
  // segment per step" is not actually readable from the fills, and direction
  // and magnitude are ambiguous. We pick a base whose eight rotations are all
  // distinct, which makes the rotation unambiguous and the rule true-to-figure.
  const fullPeriod = (arr: SegPattern[]): boolean => {
    const seen = new Set<string>();
    for (let r = 0; r < 8; r++) {
      seen.add(JSON.stringify(arr.map((_, k) => arr[(((k - r) % 8) + 8) % 8])));
    }
    return seen.size === 8;
  };
  const POOL: SegPattern[] = ["blank", "solid", "dots", "lines", "checker"];
  // Known-good aperiodic fallback if the random draws don't produce one.
  let base: SegPattern[] = ["solid", "dots", "lines", "checker", "blank", "lines", "dots", "checker"];
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = Array.from({ length: 8 }, () => pick(rng, POOL));
    if (fullPeriod(candidate)) { base = candidate; break; }
  }
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
  const nm1 = { ...clonePanel(answer), dotPos: ((answer.dotPos ?? 0) + 1) % 8 }; // dot one off
  const nm2 = { ...clonePanel(answer), dotPos: ((answer.dotPos ?? 0) + 4) % 8 }; // dot opposite
  const nm3 = clonePanel(panelAt(4)); // rotation one step behind (fills + dot)
  // rotation one step the WRONG way: the answer's fills rotated back one step,
  // so the net motion relative to the correct panel is a single reversed step.
  const nm4 = {
    ...clonePanel(answer),
    segments: answer.segments!.map((_, k) => answer.segments![(((k + rot) % 8) + 8) % 8]),
  };
  return {
    panels,
    periods: [8, 8], // aperiodic fills -> full rotation period 8; dot period 8
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
  const makeCount3 = (): RowRule => ({ kind: "count", vals: pick(rng, [[1, 2, 3], [2, 3, 4], [1, 2, 3, 4]]), shape: pick(rng, BASIC_SHAPES) });
  const makeShapeCycle3 = (): RowRule => ({ kind: "shapeCycle", cycle: makeShapeCycle(rng, 3), cols: pick(rng, [2, 3]) });
  const makeSize3 = (): RowRule => ({ kind: "size", shape: pick(rng, BASIC_SHAPES), cols: pick(rng, [2, 3]), scales: pick(rng, [[0.6, 1.0, 1.4], [1.4, 1.0, 0.6]]) });
  const makeFill2 = (): RowRule => ({ kind: "fill", shape: pick(rng, shapesPool), cols: pick(rng, [2, 3]), start: pick(rng, ["solid", "outline"] as Fill[]) });
  const makeOrient2 = (): RowRule => ({ kind: "orientation", cols: 3, startUp: rng() < 0.5 });
  const makeReflect2 = (): RowRule => ({ kind: "reflect", shape: "triangle", cols: pick(rng, [2, 3]), startMirror: rng() < 0.5 });
  const period3Factories = [makeCount3, makeShapeCycle3, makeSize3];
  const period2Factories = [makeFill2, makeOrient2, makeReflect2];

  // Build the active rule set. To GUARANTEE five distinct shown panels, one
  // active row is a "count" rule whose six values are all distinct within the
  // window (a strictly varying count), which alone makes every panel differ.
  // Remaining active rows add independent rules on top.
  // Strictly monotonic so the independent solver reads one arithmetic rule
  // and the sixth panel is exactly that next count. A repeating value here
  // makes the row unsolvable and the whole item is thrown away.
  const distinctCountVals = pick(rng, [
    [1, 2, 3, 4, 5, 6],
    [6, 5, 4, 3, 2, 1],
    [2, 3, 4, 5, 6, 7],
  ]);
  const activeRuleSet: RowRule[] = [
    { kind: "count", vals: distinctCountVals, shape: pick(rng, BASIC_SHAPES) },
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
// FRAME: fixed 3×3 grid. Shapes occupy cells and step around the border.
// A cell is either empty or holds one shape of constant size.
// Ring order is clockwise from the top-left, skipping the centre:
//   0 1 2
//   7 · 3
//   6 5 4
// ----------------------------------------------------------------------------
const GRID_RING = [0, 1, 2, 5, 8, 7, 6, 3];

function ringMod(n: number): number {
  return ((n % 8) + 8) % 8;
}

function gridFromRing(tokens: { at: number; el: Element }[]): Panel {
  const slots: (Element | null)[] = Array.from({ length: 9 }, () => null);
  for (const t of tokens) {
    const cell = GRID_RING[ringMod(t.at)];
    // A collision empties the cell. The frame then has fewer than three shapes
    // and is rejected below, instead of drawing one shape on top of another.
    slots[cell] = slots[cell] ? null : { ...t.el };
  }
  return { layout: "grid3", slots };
}

function gridCount(panels: Panel[], n: number): boolean {
  return panels.every((p) => p.slots.filter(Boolean).length === n);
}

function ringGap(a: number, b: number): number {
  const d = Math.abs(ringMod(a) - ringMod(b));
  return Math.min(d, 8 - d);
}

// n positions on the 8-cell ring, each at least minGap cells from the others.
function pickSpread(rng: () => number, n: number, minGap: number): number[] {
  for (let attempt = 0; attempt < 40; attempt++) {
    const chosen: number[] = [];
    for (const p of shuffleArr(rng, [0, 1, 2, 3, 4, 5, 6, 7])) {
      if (chosen.every((c) => ringGap(p, c) >= minGap)) chosen.push(p);
      if (chosen.length === n) return chosen;
    }
  }
  return [0, 3, 6].slice(0, n);
}

// Three shapes travel together, one cell clockwise or anticlockwise per step.
function frameGridConvoy(rng: () => number): BuiltItem {
  const shapes = shuffleArr(rng, NON_ARROW).slice(0, 3);
  const fills: Fill[] = ["outline", "solid", "solid"];
  const starts = pickSpread(rng, 3, 2);
  const step = pick(rng, [1, -1]);
  const panelAt = (t: number): Panel =>
    gridFromRing(
      starts.map((s, i) => ({
        at: s + t * step,
        el: { shape: shapes[i], fill: fills[i] },
      })),
    );
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const nmFill = clonePanel(answer);
  const flipAt = nmFill.slots.findIndex((s) => s);
  nmFill.slots[flipAt] = {
    ...nmFill.slots[flipAt]!,
    fill: nmFill.slots[flipAt]!.fill === "solid" ? "outline" : "solid",
  };
  const nmSwap = clonePanel(answer);
  const occupied = nmSwap.slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const held = nmSwap.slots[occupied[0]]!;
  nmSwap.slots[occupied[0]] = { ...nmSwap.slots[occupied[1]]! };
  nmSwap.slots[occupied[1]] = { ...held };
  const dir = step === 1 ? "clockwise" : "anticlockwise";
  if (!gridCount(panels, 3)) {
    return { panels, periods: [1], ruleSummary: "", nearMisses: [panelAt(4), panelAt(6), nmFill, nmSwap] };
  }
  return {
    panels,
    periods: [8],
    ruleSummary: `Three shapes sit in the cells of a 3×3 grid and each moves one cell ${dir} around the border. Size and fill stay the same. Continue every shape by one cell.`,
    nearMisses: [panelAt(4), panelAt(6), nmFill, nmSwap],
    answerNote: `Each shape has moved one cell ${dir}. Nothing changed size or fill.`,
    nearMissNotes: [
      "Every shape is one cell behind.",
      "Every shape has moved one cell too far.",
      "The cells are right, but one shape has the wrong fill.",
      "Two shapes have swapped cells.",
    ],
  };
}

// A pair steps anticlockwise. The triangle steps clockwise. Opposite parities
// on the ring keep them out of the same cell for every step.
function frameGridOpposed(rng: () => number): BuiltItem {
  const others = shuffleArr(rng, ["circle", "square", "diamond"] as ShapeKind[]);
  const pair: Element[] = [
    { shape: others[0], fill: "outline" },
    { shape: others[1], fill: "solid" },
  ];
  const tri: Element = { shape: "triangle", fill: "outline" };
  const evens = shuffleArr(rng, [0, 2, 4, 6]);
  const pairAt = [evens[0], evens[1]];
  const triAt = pick(rng, [1, 3, 5, 7]);
  const panelAt = (t: number): Panel =>
    gridFromRing([
      { at: pairAt[0] - t, el: pair[0] },
      { at: pairAt[1] - t, el: pair[1] },
      { at: triAt + t, el: tri },
    ]);
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const withPair = gridFromRing([
    { at: pairAt[0] - 5, el: pair[0] },
    { at: pairAt[1] - 5, el: pair[1] },
    { at: triAt - 5, el: tri },
  ]);
  const withTriangle = gridFromRing([
    { at: pairAt[0] + 5, el: pair[0] },
    { at: pairAt[1] + 5, el: pair[1] },
    { at: triAt + 5, el: tri },
  ]);
  const nmFill = clonePanel(answer);
  const ti = nmFill.slots.findIndex((s) => s?.shape === "triangle");
  if (ti >= 0) nmFill.slots[ti] = { ...nmFill.slots[ti]!, fill: "solid" };
  const misses = [withPair, withTriangle, panelAt(4), nmFill];
  if (!gridCount([...panels, ...misses], 3) || ti < 0) {
    return { panels, periods: [1], ruleSummary: "", nearMisses: misses };
  }
  return {
    panels,
    periods: [8, 8],
    ruleSummary:
      "On a fixed 3×3 grid, the pair of shapes moves one cell anticlockwise each step, and the triangle moves one cell clockwise. Continue both directions.",
    nearMisses: [withPair, withTriangle, panelAt(4), nmFill],
    answerNote: "The pair has moved one cell anticlockwise and the triangle one cell clockwise.",
    nearMissNotes: [
      "The triangle followed the pair anticlockwise.",
      "The pair followed the triangle clockwise.",
      "Every shape is one step behind.",
      "The cells are right, but the triangle is filled in.",
    ],
  };
}

// Border convoy plus a centre shape that cycles through three forms.
// lcm(8, 3) = 24, so this clears the extreme tier.
function frameGridCentre(rng: () => number): BuiltItem {
  const shapes = shuffleArr(rng, NON_ARROW).slice(0, 3);
  const fills: Fill[] = ["outline", "solid", "solid"];
  const starts = pickSpread(rng, 3, 2);
  const step = pick(rng, [1, -1]);
  const centreCycle = makeShapeCycle(rng, 3);
  const panelAt = (t: number): Panel => {
    const panel = gridFromRing(
      starts.map((s, i) => ({
        at: s + t * step,
        el: { shape: shapes[i], fill: fills[i] },
      })),
    );
    panel.slots[4] = { shape: cycleAt(centreCycle, t), fill: "solid" };
    return panel;
  };
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const centreAhead = clonePanel(answer);
  centreAhead.slots[4] = { shape: cycleAt(centreCycle, 6), fill: "solid" };
  const centreFill = clonePanel(answer);
  centreFill.slots[4] = { ...centreFill.slots[4]!, fill: "outline" };
  const dir = step === 1 ? "clockwise" : "anticlockwise";
  const misses = [panelAt(4), panelAt(6), centreAhead, centreFill];
  if (!gridCount([...panels, ...misses], 4)) {
    return { panels, periods: [1], ruleSummary: "", nearMisses: misses };
  }
  return {
    panels,
    periods: [8, 3],
    ruleSummary: `Three shapes move one cell ${dir} around the border of a 3×3 grid. The centre shape cycles through three forms and stays in the middle cell. Continue both.`,
    nearMisses: misses,
    answerNote: `The border shapes each moved one cell ${dir}, and the centre shape advanced one step in its cycle.`,
    nearMissNotes: [
      "The whole figure is one step behind.",
      "The whole figure has moved one step too far.",
      "The border is right, but the centre shape is one step ahead.",
      "The cells are right, but the centre shape is an outline.",
    ],
  };
}

// ============================================================================
// EPSO AD8-GRADE FRAMES. These model the harder official item families: coupled,
// quantitative rules where one attribute drives another and a quantity is
// conserved or emergent. Each ships with a dedicated solver (registered in
// SOLVERS) so the universal gate can independently re-derive the answer.
// ============================================================================

// FRAME: DONOR BARS (EPSO height-transfer). K bars hold integer heights whose
// TOTAL is conserved. A triangle marker sits over one bar (the donor) and
// advances one bar right each step. A dot-count below gives how many height
// units move from the marked bar to its RIGHT neighbour (wrapping K-1 -> 0)
// this step. Three coupled rules: marker position, transfer amount, and the
// resulting (conserved) height vector.
function frameDonorBars(rng: () => number): BuiltItem {
  const K = 4;
  // Start heights: distinct-ish, each 3..7, so transfers never drive below 0.
  const heights = Array.from({ length: K }, () => 3 + Math.floor(rng() * 4));
  const markerStart = Math.floor(rng() * K);
  // Dot-count cycle, e.g. [2,1,2] — small units so bars stay in 0..9.
  const dotCycle = pick(rng, [[2, 1, 2], [1, 2, 1], [2, 2, 1], [1, 1, 2]]);

  // Simulate. marker at step t is (markerStart + t) mod K; transfer dotCycle[t].
  const states: { heights: number[]; marker: number; dots: number }[] = [];
  const h = heights.slice();
  for (let t = 0; t < 6; t++) {
    const marker = (markerStart + t) % K;
    const dots = dotCycle[t % dotCycle.length];
    states.push({ heights: h.slice(), marker, dots });
    // apply transfer AFTER recording this panel's state: donor = marker, to right
    const to = (marker + 1) % K;
    h[marker] -= dots;
    h[to] += dots;
    // guard: if a transfer would go negative, abort (caller retries)
    if (h[marker] < 0 || h[to] > 9 || h[marker] > 9) {
      return { panels: [], periods: [1], ruleSummary: "", nearMisses: [] };
    }
  }
  const toPanel = (s: { heights: number[]; marker: number; dots: number }): Panel => ({
    layout: "bars",
    slots: [],
    bars: s.heights.slice(),
    markerBar: s.marker,
    dots: s.dots,
  });
  const panels = states.map(toPanel);
  const answer = panels[5];

  // Near-misses: each breaks exactly one of the three coupled rules.
  // 1) correct heights + marker but WRONG dot-count (one unit off)
  const nm1 = clonePanel(answer); nm1.dots = (answer.dots ?? 1) + 1;
  // 2) heights correct but marker on the wrong bar (one past)
  const nm2 = clonePanel(answer); nm2.markerBar = ((answer.markerBar ?? 0) + 1) % K;
  // 3) transfer applied to the WRONG neighbour (took from left instead of right):
  //    rebuild heights from panel 5's state transferring marker -> left.
  const s5 = states[5];
  const wrongDirH = s5.heights.slice();
  { const from = s5.marker; const toLeft = (from - 1 + K) % K; wrongDirH[from] -= s5.dots; wrongDirH[toLeft] += s5.dots; }
  const nm3: Panel = { layout: "bars", slots: [], bars: wrongDirH, markerBar: (s5.marker + 1) % K, dots: dotCycle[6 % dotCycle.length] };
  // 4) no transfer at all (heights unchanged from panel 5's pre-transfer state)
  const nm4: Panel = { layout: "bars", slots: [], bars: s5.heights.slice(), markerBar: (s5.marker + 1) % K, dots: dotCycle[6 % dotCycle.length] };

  const total = heights.reduce((a, b) => a + b, 0);
  return {
    panels,
    periods: [K, dotCycle.length], // marker period K, dot-count period
    ruleSummary:
      `Each panel is a bar chart whose total height is conserved (${total} units). ` +
      "The triangle marks the DONOR bar; each step it moves one bar to the right. " +
      "The dots below give how many units move from the marked bar to its right " +
      "neighbour (wrapping from the last bar to the first). Apply the transfer, " +
      "advance the marker, and read the next dot-count from its repeating cycle.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote:
      "Correct: the marked bar donates exactly the dotted number of units to its right " +
      "neighbour, the marker has advanced one bar, and the total is unchanged.",
    nearMissNotes: [
      "The height transfer is the wrong size — the dot-count was misread.",
      "The marker is on the wrong bar.",
      "Units were moved to the wrong neighbour (left instead of right).",
      "No transfer was applied — the heights did not change.",
    ],
  };
}

// SOLVER for donor bars: independently verify total conservation, derive the
// marker's constant step and the dot-count cycle, and re-derive panel 6.
function solveBars(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.bars && p.markerBar !== undefined && p.dots !== undefined)) return null;
  const K = shown[0].bars!.length;
  if (!shown.every((p) => p.bars!.length === K)) return null;
  // (a) total conserved across all shown panels
  const total = shown[0].bars!.reduce((a, b) => a + b, 0);
  if (!shown.every((p) => p.bars!.reduce((a, b) => a + b, 0) === total)) return null;
  // (b) each observed transition must be exactly: marked bar -> right neighbour,
  //     amount = that panel's dot-count. Verify the drawn heights obey it.
  for (let i = 0; i + 1 < shown.length; i++) {
    const a = shown[i].bars!, b = shown[i + 1].bars!;
    const m = shown[i].markerBar!, d = shown[i].dots!;
    const to = (m + 1) % K;
    const expect = a.slice();
    expect[m] -= d; expect[to] += d;
    if (JSON.stringify(expect) !== JSON.stringify(b)) return null; // figure doesn't match its own rule
  }
  // (c) marker advances by a constant step
  const nextMarker = nextModular(shown.map((p) => p.markerBar!), K);
  if (nextMarker === null) return null;
  // (d) dot-count is a clean cycle (period 2..5)
  const nextDots = solveCycleValue(shown.map((p) => p.dots!));
  if (nextDots === undefined) return null;
  // (e) apply panel-5's transfer to get panel-6 heights
  const last = shown[4].bars!;
  const m5 = shown[4].markerBar!, d5 = shown[4].dots!;
  const to5 = (m5 + 1) % K;
  const h6 = last.slice(); h6[m5] -= d5; h6[to5] += d5;
  if (h6.some((v) => v < 0 || v > 9)) return null;
  return { layout: "bars", slots: [], bars: h6, markerBar: nextMarker, dots: nextDots };
}

// FRAME: ROW/COLUMN + INTERSECTION (EPSO). A rows×cols grid. One whole row and
// one whole column are highlighted; the row shifts DOWN one each step (wrapping
// bottom->top), the column shifts LEFT one each step (wrapping left->right).
// Their single intersection cell is coloured specially and that colour
// ALTERNATES grey/navy. Two cyclic shifts + an emergent alternating colour.
function frameRowCol(rng: () => number): BuiltItem {
  const R = 3, C = 4;
  const rowStart = Math.floor(rng() * R);
  const colStart = Math.floor(rng() * C);
  const colorStart: "grey" | "navy" = pick(rng, ["grey", "navy"] as const);
  const rowStep = 1; // down, wrapping
  const colStep = -1; // left, wrapping
  const panelAt = (t: number): Panel => ({
    layout: "rowcol",
    slots: [],
    gridRows: R,
    gridCols: C,
    hiRow: ((rowStart + t * rowStep) % R + R) % R,
    hiCol: ((colStart + t * colStep) % C + C) % C,
    intersectColor: t % 2 === 0 ? colorStart : colorStart === "grey" ? "navy" : "grey",
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  // Near-misses: each breaks exactly one rule.
  const nm1 = clonePanel(answer); nm1.hiRow = ((answer.hiRow! + 1) % R); // row off by one
  const nm2 = clonePanel(answer); nm2.hiCol = ((answer.hiCol! + 1) % C); // column off by one
  const nm3 = clonePanel(answer); nm3.intersectColor = answer.intersectColor === "grey" ? "navy" : "grey"; // colour wrong
  const nm4 = clonePanel(panelAt(4)); // whole thing one step behind
  return {
    panels,
    periods: [R, C, 2], // row period R, column period C, colour period 2
    ruleSummary:
      "A grid with one whole row and one whole column highlighted. The row moves one " +
      "position DOWN each step (wrapping from the bottom to the top); the column moves " +
      "one position LEFT each step (wrapping from the left edge to the right). Their " +
      "single intersection cell alternates colour (grey / navy). Find the next row, " +
      "column and intersection colour.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote:
      "Correct: the row has moved down one, the column left one, and the intersection " +
      "colour has flipped.",
    nearMissNotes: [
      "The highlighted row is in the wrong position.",
      "The highlighted column is in the wrong position.",
      "The intersection colour is wrong.",
      "The whole figure is one step behind.",
    ],
  };
}

// SOLVER for row/column: derive the row shift, column shift and colour cycle.
function solveRowCol(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.gridRows !== undefined && p.gridCols !== undefined &&
    p.hiRow !== undefined && p.hiCol !== undefined && p.intersectColor)) return null;
  const R = shown[0].gridRows!, C = shown[0].gridCols!;
  if (!shown.every((p) => p.gridRows === R && p.gridCols === C)) return null;
  const nr = nextModular(shown.map((p) => p.hiRow!), R);
  const nc = nextModular(shown.map((p) => p.hiCol!), C);
  if (nr === null || nc === null) return null;
  const nColor = solveCycleValue(shown.map((p) => p.intersectColor!));
  if (nColor === undefined) return null;
  return { layout: "rowcol", slots: [], gridRows: R, gridCols: C, hiRow: nr, hiCol: nc, intersectColor: nColor };
}

// ============================================================================
// HARD, NON-NUMERIC FRAMES. Official EPSO abstract reasoning assesses pattern
// logic "without relying on language, numbers, or spatial orientation." These
// frames deliberately avoid counting and numeric coordinates; difficulty comes
// from LOGICAL combination, COUPLING (one attribute governs another), and
// SECOND-ORDER change (the rate of a transformation itself changes). Each ships
// a dedicated solver so the universal gate can re-derive the answer.
// ============================================================================

// Helper: a 3x3 boolean grid as a 9-bit array. True = filled cell.
type Bool9 = boolean[];
function bool9ToPanel(bits: Bool9): Panel {
  return {
    layout: "grid3",
    slots: bits.map((b) => (b ? ({ shape: "square", fill: "solid" } as Element) : null)),
  };
}
function panelToBool9(p: Panel): Bool9 {
  return p.slots.map((s) => !!s);
}
function xor9(a: Bool9, b: Bool9): Bool9 {
  return a.map((v, i) => v !== b[i]);
}
// Cyclically shift a 9-cell grid forward by s cells (reading order).
function shift9(a: Bool9, s: number): Bool9 {
  return a.map((_, i) => a[(((i - s) % 9) + 9) % 9]);
}

// FRAME: XOR OVERLAY (logical construction). Each panel is the exclusive-OR of
// the two panels before it: a cell is filled iff it was filled in EXACTLY ONE
// of the two preceding panels. Pure visual logic — no counting. The first two
// panels are seeded so the sequence does not collapse to empty or repeat.
function frameXorOverlay(rng: () => number): BuiltItem {
  const randGrid = (density: number): Bool9 =>
    Array.from({ length: 9 }, () => rng() < density);
  // Seed two non-empty, non-equal grids with moderate density.
  // NOTE: a plain x(t)=x(t-1) XOR x(t-2) has period 3 per cell, so panel 3 would
  // always equal panel 0 and no item could show five distinct panels. Shifting
  // the previous panel by s cells before the XOR breaks that short period.
  const g0 = randGrid(0.45);
  const g1 = randGrid(0.45);
  const s = pick(rng, [1, 2, 3, 4]);
  const bits: Bool9[] = [g0, g1];
  for (let t = 2; t < 6; t++) bits.push(xor9(shift9(bits[t - 1], s), bits[t - 2]));
  // Reject degenerate sequences (any empty panel, or a visible repeat).
  const keys = bits.map((b) => b.join(""));
  const anyEmpty = bits.some((b) => b.every((x) => !x) || b.every((x) => x));
  if (anyEmpty || new Set(keys.slice(0, 5)).size !== 5) {
    return { panels: [], periods: [1], ruleSummary: "", nearMisses: [] };
  }
  const panels = bits.map(bool9ToPanel);
  const answer = panels[5];
  const ansBits = bits[5];

  // Declare the TRUE period of this recurrence (first return to the starting
  // pair of panels), not a made-up number, so the tier's period floor is honest.
  const pk = (a: Bool9, b: Bool9) => a.map((x) => (x ? 1 : 0)).join("") + "|" + b.map((x) => (x ? 1 : 0)).join("");
  const startKey = pk(bits[0], bits[1]);
  let pa = bits[0], pb = bits[1], period = 0;
  for (let step = 1; step <= 200; step++) {
    const nx = xor9(shift9(pb, s), pa);
    pa = pb; pb = nx;
    if (pk(pa, pb) === startKey) { period = step; break; }
  }
  if (period === 0) period = 200;

  // Near-misses: each a controlled logical error.
  // 1) used OR instead of XOR (cells filled in BOTH stay on)
  const orBits = shift9(bits[4], s).map((v, i) => v || bits[3][i]);
  // 2) forgot the shift (plain XOR of the last two panels)
  const andBits = xor9(bits[4], bits[3]);
  // 3) shifted by the wrong amount
  const wrongPair = xor9(shift9(bits[4], (s % 4) + 1), bits[3]);
  // 4) correct XOR but with one cell flipped (a single-cell slip)
  const flip = ansBits.slice();
  { const idx = Math.floor(rng() * 9); flip[idx] = !flip[idx]; }
  const nmBits = [orBits, andBits, wrongPair, flip];
  const nearMisses = nmBits.map(bool9ToPanel);
  return {
    panels,
    periods: [period],
    ruleSummary:
      `Logical overlay: take the previous panel and slide its pattern ${s} cell${s === 1 ? "" : "s"} ` +
      "forward in reading order (wrapping from the last cell to the first). Then " +
      "overlay it with the panel before that using EXCLUSIVE-OR: a cell is filled " +
      "when it is filled in exactly one of the two, and empty when it is filled in " +
      "both or in neither.",
    nearMisses,
    answerNote:
      "Correct: the previous panel was slid forward and XOR-ed with the one before it.",
    nearMissNotes: [
      "This uses OR instead of XOR, so cells filled in both panels stay on by mistake.",
      "This forgets to slide the previous panel before overlaying.",
      "This slides the previous panel by the wrong amount.",
      "Almost right, but one cell is wrong.",
    ],
    solver: solveXor,
  };
}

// SOLVER for XOR overlay: confirm the XOR relation holds across the shown
// panels, then apply it to the last two to predict panel 6.
function solveXor(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "grid3" && p.slots.length === 9)) return null;
  const bits = shown.map(panelToBool9);
  // Find every shift s (0..8) for which x(t) = shift(x(t-1), s) XOR x(t-2) holds
  // for ALL observed t = 2..4. The item is only solvable if the surviving shifts
  // all agree on the next panel; otherwise the rule is ambiguous and is rejected.
  const preds = new Set<string>();
  const k01 = (b: Bool9) => b.map((x) => (x ? "1" : "0")).join("");
  for (let s = 0; s < 9; s++) {
    let ok = true;
    for (let t = 2; t < bits.length; t++) {
      if (k01(xor9(shift9(bits[t - 1], s), bits[t - 2])) !== k01(bits[t])) { ok = false; break; }
    }
    if (ok) preds.add(k01(xor9(shift9(bits[4], s), bits[3])));
  }
  if (preds.size !== 1) return null;
  const only = [...preds][0];
  return bool9ToPanel(only.split("").map((c) => c === "1"));
}

// FRAME: CONTROLLER / FOLLOWER (coupled rotation). The left cell holds a
// "controller" shape that cycles through three shapes; the shape SELECTS how
// far the right-hand arrow turns clockwise this step: triangle = 1 quarter,
// square = 2 quarters, diamond = 3 quarters. You must read the controller to
// know the arrow's heading — the arrow alone is not a simple cycle. No numbers.
function frameController(rng: () => number): BuiltItem {
  const ctrl: ShapeKind[] = shuffleArr(rng, ["triangle", "square", "diamond"]);
  const turnFor = (s: ShapeKind): number => (s === "triangle" ? 1 : s === "square" ? 2 : 3);
  const ctrlAt = (t: number) => ctrl[t % 3];
  let dir: Direction = pick(rng, CW);
  const dirs: Direction[] = [];
  for (let t = 0; t < 6; t++) {
    dirs.push(dir);
    dir = rotateDir(dir, turnFor(ctrlAt(t)));
  }
  const panelAt = (t: number): Panel => ({
    layout: "row3",
    slots: [
      { shape: ctrlAt(t), fill: "outline" },
      null,
      { shape: "arrow", fill: "solid", direction: dirs[t] },
    ],
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];
  const c5 = ctrlAt(5);
  // Near-misses, each breaking exactly one part of the coupled rule.
  const mk = (ctrlShape: ShapeKind, d: Direction): Panel => ({
    layout: "row3",
    slots: [{ shape: ctrlShape, fill: "outline" }, null, { shape: "arrow", fill: "solid", direction: d }],
  });
  const nm1 = mk(c5, rotateDir(dirs[4], 1)); // treated every controller as a 1-quarter turn
  const nm2 = mk(c5, rotateDir(dirs[5], 1)); // arrow one quarter past correct
  const nm3 = mk(c5, rotateDir(dirs[5], -1)); // arrow one quarter short
  const nm4 = mk(ctrlAt(6), dirs[5]); // controller advanced wrong (shape-cycle off) but arrow right
  return {
    panels,
    periods: [3, 4], // controller cycle 3, arrow heading space 4
    ruleSummary:
      "Coupled rule: the left shape selects how far the arrow turns CLOCKWISE this " +
      "step — triangle turns it one quarter, square two quarters, diamond three " +
      "quarters. The left shape cycles through the three forms, so the arrow's " +
      "heading is not a simple rotation: read the shape, then turn the arrow by its " +
      "amount.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote:
      "Correct: the controlling shape has advanced in its cycle and the arrow has " +
      "turned by exactly the amount that shape dictates.",
    nearMissNotes: [
      "The arrow was turned one quarter regardless of the controlling shape.",
      "The arrow has turned one quarter too far.",
      "The arrow has turned one quarter too little.",
      "The controlling shape is the wrong one for this step.",
    ],
    solver: solveController,
  };
}

// SOLVER for controller/follower: infer each shape's turn amount from the shown
// transitions, confirm it is consistent, then apply it to predict panel 6.
function solveController(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "row3" && p.slots.length === 3)) return null;
  const ctrlSeq = shown.map((p) => p.slots[0]?.shape);
  const arrowSeq = shown.map((p) => p.slots[2]?.direction);
  if (ctrlSeq.some((c) => !c) || arrowSeq.some((a) => !a)) return null;
  const idxOf = (d: Direction) => CW.indexOf(d);
  // Learn turn(shape) from consecutive transitions; must be consistent, in 1..3.
  const turn: Partial<Record<ShapeKind, number>> = {};
  for (let t = 0; t + 1 < shown.length; t++) {
    const s = ctrlSeq[t]!;
    const delta = ((idxOf(arrowSeq[t + 1]!) - idxOf(arrowSeq[t]!)) % 4 + 4) % 4;
    if (delta < 1 || delta > 3) return null;
    if (turn[s] === undefined) turn[s] = delta;
    else if (turn[s] !== delta) return null; // inconsistent coupling
  }
  // Panel 5 (the answer) heading = panel-4 heading turned by turn(panel-4 controller).
  const lastHeading = arrowSeq[4]!;
  const lastCtrl = ctrlSeq[4]!;
  if (turn[lastCtrl] === undefined) return null;
  const predHeading = CW[(idxOf(lastHeading) + turn[lastCtrl]!) % 4];
  // Controller shape ON the answer panel is the next value of the controller cycle.
  const ctrlForAnswer = solveCycleValueNext(ctrlSeq as ShapeKind[]);
  if (ctrlForAnswer === undefined) return null;
  return {
    layout: "row3",
    slots: [
      { shape: ctrlForAnswer, fill: "outline" },
      null,
      { shape: "arrow", fill: "solid", direction: predHeading },
    ],
  };
}

// Predict the value at index 5 (the 6th) of a cycle given indices 0..4.
function solveCycleValueNext<T>(xs: T[]): T | undefined {
  const key = (v: T) => JSON.stringify(v);
  for (let p = 2; p <= 5; p++) {
    let ok = true;
    for (let i = 0; i + p < xs.length; i++) if (key(xs[i]) !== key(xs[i + p])) { ok = false; break; }
    if (ok) return xs[5 % p];
  }
  // constant
  if (new Set(xs.map(key)).size === 1) return xs[0];
  return undefined;
}

// ============================================================================
// RICH-VOCABULARY FRAMES. These use the extended figure set (asymmetric glyphs,
// half/hatch fills, n-sided polygons, nested containers) so items stop looking
// like recombinations of four basic shapes. Rotation is only ever applied to
// figures whose orientation is genuinely readable (asymmetric glyphs, or a
// polygon carrying a vertex marker), and the validator's visualKey() rejects
// any option that merely LOOKS identical to another.
// ============================================================================

const rotDeg = (units: number) => ((((units % 8) + 8) % 8)) * 45;

// FRAME: GLYPH TURN. Two asymmetric glyphs turn in OPPOSITE directions at
// different speeds while the left glyph's fill cycles through three treatments
// (the half/hatch fill rotates with the glyph). With `withCentre`, a centre
// figure adds two more independent rules (shape cycle + fill alternation).
function frameGlyphTurn(rng: () => number, withCentre: boolean): BuiltItem {
  const [gA, gB] = shuffleArr(rng, ASYMMETRIC).slice(0, 2);
  const unitsA = pick(rng, [1, 2, 3]) * pick(rng, [1, -1]);
  const speedsB = [1, 2, 3].filter((u) => u !== Math.abs(unitsA));
  const unitsB = -Math.sign(unitsA) * pick(rng, speedsB); // opposite way, different speed
  const startA = Math.floor(rng() * 8);
  const startB = Math.floor(rng() * 8);
  const fillCycle: Fill[] = shuffleArr(rng, ["solid", "half", "outline", "hatch"] as Fill[]).slice(0, 3);
  const centreCycle = makeShapeCycle(rng, 3);
  const centreFill = (t: number): Fill => (t % 2 === 0 ? "solid" : "outline");

  const panelAt = (t: number): Panel => ({
    layout: "row3",
    slots: [
      { shape: gA, fill: cycleAt(fillCycle, t), rot: rotDeg(startA + t * unitsA) },
      withCentre ? { shape: cycleAt(centreCycle, t), fill: centreFill(t) } : null,
      { shape: gB, fill: "solid", rot: rotDeg(startB + t * unitsB) },
    ],
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];

  const nm1 = clonePanel(answer); // left glyph overshoots by one step
  nm1.slots[0] = { ...answer.slots[0]!, rot: rotDeg(startA + 6 * unitsA) };
  const nm2 = clonePanel(answer); // right glyph turned the wrong way
  nm2.slots[2] = { ...answer.slots[2]!, rot: rotDeg(startB - 5 * unitsB) };
  const nm3 = clonePanel(answer); // left fill one step ahead in its cycle
  nm3.slots[0] = { ...answer.slots[0]!, fill: cycleAt(fillCycle, 6) };
  const nm4 = clonePanel(answer);
  if (withCentre) nm4.slots[1] = { ...answer.slots[1]!, shape: cycleAt(centreCycle, 6) }; // centre shape ahead
  else nm4.slots[2] = { ...answer.slots[2]!, rot: rotDeg(startB + 4 * unitsB) }; // right glyph one step short

  const per = (u: number) => 8 / gcd(8, Math.abs(u));
  const stepWord = (u: number) => `${Math.abs(u) * 45}° ${u > 0 ? "clockwise" : "anticlockwise"}`;
  return {
    panels,
    periods: [per(unitsA), per(unitsB), 3, ...(withCentre ? [3, 2] : [])],
    ruleSummary:
      `The left glyph turns ${stepWord(unitsA)} each step while its fill cycles through three treatments ` +
      `(the shaded half turns with the glyph). The right glyph turns the opposite way, ${stepWord(unitsB)} per step.` +
      (withCentre
        ? " The centre figure cycles through three shapes and alternates solid/outline. Track every figure separately."
        : " Track each glyph separately."),
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote: "Correct: each glyph has turned by its own step in its own direction, and every fill/shape cycle has advanced once.",
    nearMissNotes: [
      "The left glyph has turned one step too far.",
      "The right glyph has turned the wrong way.",
      "The left fill is one step ahead in its cycle.",
      withCentre ? "The centre shape is one step ahead in its cycle." : "The right glyph is one step short of where it should be.",
    ],
  };
}

// FRAME: POLYGON + RINGS. A regular polygon whose SIDE COUNT follows a
// non-linear pattern (steady rise, steady fall, or alternating +2/-1), turning
// by a fixed angle with fill alternating, and wrapped in 0-2 concentric rings.
// The ring count is COUPLED to the side count (by parity or by a threshold):
// you must decode the side count first. A marker dot on vertex 0 makes the
// turn readable even though the polygon's own symmetry changes every step.
function mkNgon(sides: number, rot: number, fill: Fill, rings: number): Element {
  return { shape: "ngon", fill, rot, sides, rings };
}

function frameNgonRings(rng: () => number): BuiltItem {
  const pattern = pick(rng, ["up", "down", "dual", "dual"] as const);
  let sidesSeq: number[];
  if (pattern === "up") sidesSeq = [3, 4, 5, 6, 7, 8];
  else if (pattern === "down") sidesSeq = [8, 7, 6, 5, 4, 3];
  else { const b = pick(rng, [3, 4]); sidesSeq = [b, b + 2, b + 1, b + 3, b + 2, b + 4]; }

  const pair = pick(rng, [[1, 2], [2, 1], [0, 1], [1, 0], [0, 2], [2, 0]]);
  const byParity = rng() < 0.5;
  const T = pick(rng, [5, 6, 7]);
  const ringsOf = (s: number): number => (byParity ? (s % 2 === 0 ? pair[0] : pair[1]) : s >= T ? pair[0] : pair[1]);

  const step = pick(rng, [45, -45, 90, -90, 135, -135]);
  const start = 45 * Math.floor(rng() * 8);
  const f0: Fill = pick(rng, ["solid", "outline"] as Fill[]);
  const rotAt = (t: number) => (((start + t * step) % 360) + 360) % 360;
  const fillAt = (t: number): Fill => (t % 2 === 0 ? f0 : f0 === "solid" ? "outline" : "solid");
  const panelFor = (s: number, rot: number, fill: Fill, rings: number): Panel => ({
    layout: "single",
    slots: [mkNgon(s, rot, fill, rings)],
  });
  const panelAt = (t: number) => panelFor(sidesSeq[t], rotAt(t), fillAt(t), ringsOf(sidesSeq[t]));
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);

  const s5 = sidesSeq[5];
  const wrongSides = s5 >= 8 ? s5 - 1 : s5 + 1;
  const nm1 = panelFor(wrongSides, rotAt(5), fillAt(5), ringsOf(wrongSides)); // side count off by one
  const nm2 = panelFor(s5, rotAt(6), fillAt(5), ringsOf(s5)); // turned one step too far
  const nm3 = panelFor(s5, rotAt(5), fillAt(4), ringsOf(s5)); // fill not alternated
  const nm4 = panelFor(s5, rotAt(5), fillAt(5), (ringsOf(s5) + 1) % 3); // rings break the coupling

  const rotPeriod = 360 / gcd(360, Math.abs(step));
  const ruleText = byParity
    ? `the ring count depends on the side count's parity (${pair[0]} ring${pair[0] === 1 ? "" : "s"} when even, ${pair[1]} when odd)`
    : `the ring count depends on the side count (${pair[0]} ring${pair[0] === 1 ? "" : "s"} from ${T} sides up, ${pair[1]} below)`;
  return {
    panels,
    periods: [6, rotPeriod, 2],
    ruleSummary:
      `The polygon's number of sides follows a pattern (${pattern === "dual" ? "alternately +2 then −1" : pattern === "up" ? "one more each step" : "one fewer each step"}), ` +
      `it turns ${Math.abs(step)}° ${step > 0 ? "clockwise" : "anticlockwise"} each step (follow the marker dot), its fill alternates, and ${ruleText}. ` +
      "Work out the side count first — it also sets the rings.",
    nearMisses: [nm1, nm2, nm3, nm4],
    solver: solveNgon,
    answerNote: "Correct: the side count continues its pattern, the polygon has turned one more step, the fill has alternated, and the rings match the side count.",
    nearMissNotes: [
      "The side count is off by one (the rings follow it, so they look consistent).",
      "The polygon has turned one step too far — compare the marker dot.",
      "The fill did not alternate.",
      "The rings do not match what the side count requires.",
    ],
  };
}

// SOLVER for polygon + rings: predict sides (steady or alternating step), rotation
// (constant turn), fill (cycle), and rings by INFERRING the coupling from the
// shown panels. If the observed data fits two coupling rules that disagree about
// the next panel, the item is ambiguous and is rejected.
function solveNgon(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "single" && p.slots[0]?.shape === "ngon")) return null;
  const els = shown.map((p) => p.slots[0]!);
  if (els.some((e) => e.sides === undefined || e.rot === undefined || e.rings === undefined)) return null;
  const sides = els.map((e) => e.sides!);
  const rots = els.map((e) => e.rot!);
  const rings = els.map((e) => e.rings!);

  const d = sides.slice(1).map((s, i) => s - sides[i]);
  const steady = d.every((x) => x === d[0]);
  const alternating = d.every((x, i) => x === d[i % 2]);
  if (!steady && !alternating) return null;
  const nextSides = sides[4] + d[0]; // steady: +d0; alternating: diff #4 repeats diff #0
  if (nextSides < 3 || nextSides > 8) return null;

  const rd = rots.slice(1).map((r, i) => (((r - rots[i]) % 360) + 360) % 360);
  if (!rd.every((x) => x === rd[0])) return null;
  const nextRot = (rots[4] + rd[0]) % 360;

  const nextFill = solveCycleValue(els.map((e) => e.fill));
  if (nextFill === undefined) return null;

  // Infer the coupling: every rule of the form class(sides) -> rings that fits.
  const classifiers: ((s: number) => string)[] = [(s) => (s % 2 === 0 ? "even" : "odd")];
  for (let T = 4; T <= 8; T++) classifiers.push((s) => (s >= T ? "hi" : "lo"));
  const predictions = new Set<number>();
  for (const cls of classifiers) {
    const map = new Map<string, number>();
    let fits = true;
    sides.forEach((s, i) => {
      const k = cls(s);
      if (map.has(k) && map.get(k) !== rings[i]) fits = false;
      map.set(k, rings[i]);
    });
    const next = map.get(cls(nextSides));
    if (fits && next !== undefined) predictions.add(next);
  }
  if (predictions.size !== 1) return null;
  return { layout: "single", slots: [mkNgon(nextSides, nextRot, nextFill, [...predictions][0])] };
}

// ============================================================================
// FRAMES MODELLED ON OFFICIAL-STYLE SAMPLES (shape handoff, apertures, flips).
// ============================================================================

// ---------------------------------------------------------------------------
// FRAME: NEST HANDOFF. Three shapes occupy three ROLES in every frame: a small
// one in the top-left CORNER, a large OUTER shape, and a smaller INNER shape.
// Each step the corner shape becomes the outer shape, the outer becomes the
// inner, and a new shape enters the corner (the stream of shapes repeats with a
// fixed length). The background alternates grey/white. On the hardest tier the
// outer shape's fill also cycles. The rule moves IDENTITY between roles — no
// single attribute simply "changes".
// ---------------------------------------------------------------------------
const NEST_SHAPES: ShapeKind[] = ["circle", "square", "triangle", "diamond", "hexagon"];

function mkNest(corner: ShapeKind, outer: ShapeKind, inner: ShapeKind, outerFill: Fill, bg: "grey" | "white"): Panel {
  return { layout: "nested", slots: [], nest: { corner, outer, inner, outerFill }, bg };
}
const otherBg = (b: "grey" | "white"): "grey" | "white" => (b === "grey" ? "white" : "grey");

function frameNestHandoff(rng: () => number, extreme: boolean): BuiltItem {
  const len = extreme ? pick(rng, [4, 5]) : 5; // stream length (hard needs 5 for a long enough period)
  const stream = shuffleArr(rng, NEST_SHAPES).slice(0, len);
  const s = (i: number): ShapeKind => stream[((i % len) + len) % len];
  const bg0: "grey" | "white" = pick(rng, ["grey", "white"] as ("grey" | "white")[]);
  const bgAt = (t: number): "grey" | "white" => (t % 2 === 0 ? bg0 : otherBg(bg0));
  const fillCycle: Fill[] = extreme
    ? shuffleArr(rng, ["outline", "hatch", "half"] as Fill[])
    : ["outline"];
  const fillAt = (t: number): Fill => cycleAt(fillCycle, t);

  const panelAt = (t: number): Panel => mkNest(s(t), s(t - 1), s(t - 2), fillAt(t), bgAt(t));
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);

  const nmSwap = mkNest(s(5), s(3), s(4), fillAt(5), bgAt(5)); // outer/inner swapped
  const nmCorner = mkNest(s(6), s(4), s(3), fillAt(5), bgAt(5)); // wrong shape enters the corner
  const nmBg = mkNest(s(5), s(4), s(3), fillAt(5), otherBg(bgAt(5))); // background not alternated
  const nmLast = extreme
    ? mkNest(s(5), s(4), s(3), fillAt(6), bgAt(5)) // outer fill one step ahead
    : mkNest(s(4), s(3), s(2), fillAt(5), bgAt(5)); // nothing moved: one step behind
  return {
    panels,
    periods: [len, 2, ...(extreme ? [3] : [])],
    ruleSummary:
      "Each frame has a small shape in the top-left corner, a large outer shape and a smaller inner shape. " +
      "From one frame to the next, the corner shape becomes the outer shape and the outer shape becomes the inner shape, " +
      "while a new shape enters the corner (the supply of shapes repeats). The background alternates between grey and white." +
      (extreme ? " The outer shape's fill also cycles through three treatments." : ""),
    nearMisses: [nmSwap, nmCorner, nmBg, nmLast],
    solver: solveNest,
    answerNote: "Correct: the corner shape has moved to the outside, the old outer shape has moved inside, the next shape has entered the corner, and the background has alternated.",
    nearMissNotes: [
      "The outer and inner shapes are the wrong way round.",
      "The wrong shape has entered the corner.",
      "The background did not alternate.",
      extreme ? "The outer shape's fill is one step ahead in its cycle." : "Nothing has moved — this is the previous frame's arrangement.",
    ],
  };
}

// SOLVER for nest handoff: check every shown transition obeys the handoff, read the
// repeating shape stream (including the outer/inner shapes visible in frame 0),
// and predict the next corner shape. Several stream lengths that disagree on the
// next shape make the item ambiguous, so it is rejected.
function solveNest(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "nested" && p.nest && p.bg)) return null;
  const n = shown.map((p) => p.nest!);
  for (let t = 0; t + 1 < n.length; t++) {
    if (n[t + 1].outer !== n[t].corner || n[t + 1].inner !== n[t].outer) return null;
  }
  // stream[i] is the shape that enters the corner at time i - 2
  const arr: ShapeKind[] = [n[0].inner, n[0].outer, ...n.map((x) => x.corner)]; // length 7
  const predictions = new Set<ShapeKind>();
  for (let p = 2; p <= 6; p++) {
    let ok = true;
    for (let i = 0; i + p < arr.length; i++) if (arr[i] !== arr[i + p]) { ok = false; break; }
    if (ok) predictions.add(arr[arr.length - p]); // next corner = arr[7 - p]
  }
  if (predictions.size !== 1) return null;
  const nextCorner = [...predictions][0];
  const bg = solveCycleValue(shown.map((p) => p.bg!));
  const fill = solveCycleValue(n.map((x) => x.outerFill));
  if (bg === undefined || fill === undefined) return null;
  return mkNest(nextCorner, n[4].corner, n[4].outer, fill, bg);
}

// ---------------------------------------------------------------------------
// FRAME: APERTURE. "Pacman" figures whose mouth (gap) changes: the centre one
// OPENS wider by 45° every frame, the left one keeps its gap but TURNS, and (on
// harder tiers) the right one CLOSES by 45° every frame while its shading
// alternates. Gap width and gap direction are separate, independent rules.
// ---------------------------------------------------------------------------
function mkPac(fill: Fill, rot: number, open: number): Element {
  return { shape: "pacman", fill, rot, open };
}

function frameAperture(rng: () => number, full: boolean): BuiltItem {
  const rotM = 45 * Math.floor(rng() * 8);
  const unitsL = pick(rng, [1, 2, 3]) * pick(rng, [1, -1]);
  const startL = Math.floor(rng() * 8);
  const openL = pick(rng, [90, 135, 180]);
  const fillL: Fill = pick(rng, ["solid", "hatch", "outline"] as Fill[]);
  const rotR = 45 * Math.floor(rng() * 8);
  const fillR0: Fill = pick(rng, ["solid", "hatch"] as Fill[]);
  const fillRAt = (t: number): Fill => (t % 2 === 0 ? fillR0 : fillR0 === "solid" ? "hatch" : "solid");

  const panelAt = (t: number): Panel => ({
    layout: "row3",
    slots: [
      mkPac(fillL, rotDeg(startL + t * unitsL), openL),
      mkPac("solid", rotM, 45 * (t + 1)),
      full ? mkPac(fillRAt(t), rotR, 270 - 45 * t) : null,
    ],
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];

  const nm1 = clonePanel(answer); // centre gap one step behind
  nm1.slots[1] = mkPac("solid", rotM, 45 * 5);
  const nm2 = clonePanel(answer); // left figure turns one step too far
  nm2.slots[0] = mkPac(fillL, rotDeg(startL + 6 * unitsL), openL);
  const nm3 = clonePanel(answer);
  const nm4 = clonePanel(answer);
  if (full) {
    nm3.slots[2] = mkPac(fillRAt(5), rotR, 45 * 6); // right gap opens instead of closing
    nm4.slots[2] = mkPac(fillRAt(4), rotR, 270 - 45 * 5); // right shading not alternated
  } else {
    nm3.slots[0] = mkPac(fillL, rotDeg(startL + 5 * unitsL), openL + 45); // left gap changed
    nm4.slots[1] = mkPac("solid", rotM + 90, 45 * 6); // centre gap turned
  }
  const per = (u: number) => 8 / gcd(8, Math.abs(u));
  const stepWord = (u: number) => `${Math.abs(u) * 45}° ${u > 0 ? "clockwise" : "anticlockwise"}`;
  return {
    panels,
    periods: [6, per(unitsL), ...(full ? [6, 2] : [])],
    ruleSummary:
      `The centre figure's gap opens 45° wider every frame. The left figure keeps the same gap but turns ${stepWord(unitsL)} each frame.` +
      (full ? " The right figure's gap closes by 45° every frame while its shading alternates between solid and hatched." : "") +
      " Gap width and gap direction are independent: track each figure separately.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote: "Correct: every gap has changed by exactly its own rule — widening, turning and (where present) closing.",
    nearMissNotes: [
      "The centre gap is one step too narrow.",
      "The left figure has turned one step too far.",
      full ? "The right gap has opened instead of closing." : "The left figure's gap width has changed, but it should stay the same.",
      full ? "The right figure's shading did not alternate." : "The centre gap has been turned, but its direction should stay fixed.",
    ],
  };
}

// ---------------------------------------------------------------------------
// FRAME: FLIP GRID. A set of different figures sits in the border cells of a 3×3
// grid. Every step the WHOLE arrangement is mirrored, alternately left-right
// then top-bottom (a triangle turns over when mirrored top-bottom). One figure
// also cycles its shading, and the centre cell cycles its shape. Mirroring on
// its own repeats after four steps, so the extra cycles keep the five panels
// distinct.
// ---------------------------------------------------------------------------
const FLIP_SHAPES: ShapeKind[] = ["circle", "square", "diamond", "cross", "hexagon", "triangle"];
const FLIP_CENTRE: ShapeKind[] = ["circle", "square", "diamond", "cross", "hexagon"];
const flipCellV = (c: number) => Math.floor(c / 3) * 3 + (2 - (c % 3)); // left-right
const flipCellH = (c: number) => (2 - Math.floor(c / 3)) * 3 + (c % 3); // top-bottom
const flipTri = (t?: "up" | "down"): "up" | "down" | undefined => (t === undefined ? undefined : t === "up" ? "down" : "up");

function mkFlipEl(shape: ShapeKind, fill: Fill, tri?: "up" | "down"): Element {
  return tri === undefined ? { shape, fill } : { shape, fill, tri };
}

function frameFlipGrid(rng: () => number, K: number): BuiltItem {
  const border = [0, 1, 2, 3, 5, 6, 7, 8];
  // The arrangement must change under BOTH mirrors (some figure off the middle
  // column, some off the middle row), otherwise two mirrors would look the same.
  let cells0: number[] = [];
  for (let a = 0; a < 60; a++) {
    const c = shuffleArr(rng, border).slice(0, K);
    if (c.some((x) => x % 3 !== 1) && c.some((x) => Math.floor(x / 3) !== 1)) { cells0 = c; break; }
  }
  if (cells0.length !== K) return { panels: [], periods: [1], ruleSummary: "", nearMisses: [] };
  // Make sure a triangle (if drawn) is among the shapes, so top-bottom flips are visible.
  const figShapes = shuffleArr(rng, FLIP_SHAPES).slice(0, K);
  const tri0 = figShapes.map((sh) => (sh === "triangle" ? "up" : undefined)) as ("up" | "down" | undefined)[];
  const fixedFill = figShapes.map(() => pick(rng, ["solid", "outline"] as Fill[]));
  const markCycle: Fill[] = shuffleArr(rng, ["solid", "outline", "hatch"] as Fill[]);
  // The centre never moves under a mirror, so it may use a star as well. Prefer
  // shapes that do not already appear on the border, so the centre cell is never
  // confused with one of the mirrored figures.
  const centreAll: ShapeKind[] = [...FLIP_CENTRE, "star"];
  const centreFree = centreAll.filter((x) => !figShapes.includes(x));
  const centreCycle = shuffleArr(rng, centreFree.length >= 3 ? centreFree : centreAll).slice(0, 3);
  const f0 = pick(rng, [0, 1]); // 0: first flip is left-right, 1: top-bottom
  const flipAt = (i: number): "V" | "H" => (i % 2 === f0 ? "V" : "H");

  const applyFlip = (cells: number[], tris: typeof tri0, type: "V" | "H") => ({
    cells: cells.map(type === "V" ? flipCellV : flipCellH),
    tris: tris.map((t) => (type === "H" ? flipTri(t) : t)),
  });
  const stateAt = (t: number) => {
    let st = { cells: cells0, tris: tri0 };
    for (let i = 0; i < t; i++) st = applyFlip(st.cells, st.tris, flipAt(i));
    return st;
  };
  const build = (st: { cells: number[]; tris: typeof tri0 }, tFill: number, tCentre: number): Panel => {
    const slots: (Element | null)[] = Array.from({ length: 9 }, () => null);
    st.cells.forEach((cell, k) => {
      slots[cell] = mkFlipEl(figShapes[k], k === 0 ? cycleAt(markCycle, tFill) : fixedFill[k], st.tris[k]);
    });
    slots[4] = { shape: cycleAt(centreCycle, tCentre), fill: tCentre % 2 === 0 ? "solid" : "outline" };
    return { layout: "grid3", slots };
  };
  const panels = [0, 1, 2, 3, 4, 5].map((t) => build(stateAt(t), t, t));
  const st4 = stateAt(4);
  const st5 = stateAt(5);
  const wrongAxis = applyFlip(st4.cells, st4.tris, flipAt(4) === "V" ? "H" : "V");

  const nm1 = build(wrongAxis, 5, 5); // mirrored about the wrong axis
  const nm2 = build(st4, 5, 5); // not mirrored at all
  const nm3 = build(st5, 6, 5); // marked figure's shading one step ahead
  const nm4 = build(st5, 5, 6); // centre shape one step ahead
  const markName = figShapes[0];
  return {
    panels,
    periods: [4, 3, 3, ...(K >= 5 ? [2] : [])],
    solver: solveFlipGrid,
    ruleSummary:
      "The figures in the border cells are mirrored as a whole each step, alternately left-right and top-bottom " +
      "(a triangle turns over when mirrored top-bottom). The " + markName + " also cycles through three shadings, " +
      "and the centre cell cycles through three shapes. Work out which mirror comes next, then apply the cycles.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote: "Correct: the arrangement was mirrored about the next axis in the alternation, and both cycles advanced once.",
    nearMissNotes: [
      "The arrangement was mirrored about the wrong axis.",
      "The arrangement was not mirrored at all.",
      "The shading cycle is one step ahead.",
      "The centre shape is one step ahead in its cycle.",
    ],
  };
}

// SOLVER for flip grid: for every shown transition find which mirror maps one
// arrangement onto the next (ignoring shading); they must alternate and be
// unambiguous. Then mirror the last arrangement about the next axis, and predict
// every figure's shading and the centre figure from their own cycles.
function solveFlipGrid(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "grid3" && p.slots.length === 9)) return null;
  type Fig = { shape: ShapeKind; cell: number; tri?: "up" | "down"; fill: Fill };
  const figs: Fig[][] = shown.map((p) =>
    p.slots
      .map((e, cell) => (e && cell !== 4 ? ({ shape: e.shape, cell, tri: e.tri, fill: e.fill } as Fig) : null))
      .filter((f): f is Fig => f !== null),
  );
  const K = figs[0].length;
  if (K < 2 || new Set(figs[0].map((f) => f.shape)).size !== K) return null;
  if (!figs.every((arr) => arr.length === K && arr.every((f) => figs[0].some((g) => g.shape === f.shape)))) return null;

  const maps = (a: Fig[], b: Fig[], type: "V" | "H"): boolean =>
    a.every((f) => {
      const g = b.find((x) => x.shape === f.shape)!;
      return g.cell === (type === "V" ? flipCellV(f.cell) : flipCellH(f.cell)) && g.tri === (type === "H" ? flipTri(f.tri) : f.tri);
    });
  const types: ("V" | "H")[] = [];
  for (let t = 0; t < 4; t++) {
    const v = maps(figs[t], figs[t + 1], "V");
    const h = maps(figs[t], figs[t + 1], "H");
    if (v === h) return null; // neither fits, or both fit (ambiguous)
    types.push(v ? "V" : "H");
  }
  if (!types.every((x, i) => i === 0 || x !== types[i - 1])) return null;
  const next: "V" | "H" = types[3] === "V" ? "H" : "V";

  const slots: (Element | null)[] = Array.from({ length: 9 }, () => null);
  for (const f of figs[4]) {
    const seq = figs.map((arr) => arr.find((x) => x.shape === f.shape)!.fill);
    const fill = solveCycleValue(seq);
    if (fill === undefined) return null;
    slots[next === "V" ? flipCellV(f.cell) : flipCellH(f.cell)] = mkFlipEl(f.shape, fill, next === "H" ? flipTri(f.tri) : f.tri);
  }
  const centre = solveElementSlot(shown.map((p) => p.slots[4]));
  if (centre === undefined) return null;
  slots[4] = centre;
  return { layout: "grid3", slots };
}

// ---------------------------------------------------------------------------
// FRAME: SCAFFOLD (plus / corners layout, EPSO Q9-style). Four corner cells each
// hold a DIRECTIONAL CIRCLE (a circle with an arrowhead) that rotates on its own
// per-corner step; a central column of two shapes cycles through a shape set,
// and (full version) a FACE at the bottom toggles smile/frown while a small dot
// marker appears or not. Every position runs an independent rule — the essence
// of the hardest official matrix items.
// ---------------------------------------------------------------------------
function frameScaffold(rng: () => number, full: boolean): BuiltItem {
  const cornerStart = [0, 1, 2, 3].map(() => Math.floor(rng() * 8));
  // per-corner rotation steps, each 1 or 2 units of 45°, mixed directions, and
  // NOT all equal, so the four corners genuinely differ.
  let cornerStep: number[] = [];
  for (let a = 0; a < 40; a++) {
    cornerStep = [0, 1, 2, 3].map(() => pick(rng, [1, -1, 2, -2]));
    if (new Set(cornerStep).size >= 2) break;
  }
  const centreCycle = makeShapeCycle(rng, 3);
  const centreCycle2 = shuffleArr(rng, NON_ARROW.filter((x) => !centreCycle.includes(x))).slice(0, 3);
  const faceStart = rng() < 0.5;

  const panelAt = (t: number): Panel => {
    const slots: (Element | null)[] = [
      { shape: "dirCircle", fill: "outline", rot: rotDeg(cornerStart[0] + t * cornerStep[0]) },
      { shape: "dirCircle", fill: "outline", rot: rotDeg(cornerStart[1] + t * cornerStep[1]) },
      { shape: "dirCircle", fill: "outline", rot: rotDeg(cornerStart[2] + t * cornerStep[2]) },
      { shape: "dirCircle", fill: "outline", rot: rotDeg(cornerStart[3] + t * cornerStep[3]) },
      { shape: cycleAt(centreCycle, t), fill: "solid" },
      full
        ? { shape: "face", fill: "outline", smile: t % 2 === 0 ? faceStart : !faceStart }
        : { shape: cycleAt(centreCycle2, t), fill: "outline" },
    ];
    return { layout: "pieCross", slots };
  };
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];

  const nm1 = clonePanel(answer); // one corner rotated wrong
  nm1.slots[0] = { ...answer.slots[0]!, rot: rotDeg(cornerStart[0] + 6 * cornerStep[0]) };
  const nm2 = clonePanel(answer); // centre-top shape one step ahead
  nm2.slots[4] = { ...answer.slots[4]!, shape: cycleAt(centreCycle, 6) };
  const nm3 = clonePanel(answer); // a different corner mistracked
  nm3.slots[3] = { ...answer.slots[3]!, rot: rotDeg(cornerStart[3] - 5 * cornerStep[3]) };
  const nm4 = clonePanel(answer); // bottom element wrong (face not toggled / shape ahead)
  nm4.slots[5] = full
    ? { ...answer.slots[5]!, smile: !(answer.slots[5] as Element).smile }
    : { ...answer.slots[5]!, shape: cycleAt(centreCycle2, 6) };

  const per = (u: number) => 8 / gcd(8, Math.abs(u));
  return {
    panels,
    periods: [per(cornerStep[0]), per(cornerStep[1]), 3, ...(full ? [2] : [3])],
    solver: solveScaffold,
    ruleSummary:
      "Four corner circles each carry an arrow that turns at its OWN speed and direction. " +
      "The top centre shape cycles through three forms. " +
      (full
        ? "The face at the bottom alternates between a smile and a frown."
        : "The bottom centre shape cycles through its own three forms.") +
      " Track every position independently.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote: "Correct: each corner arrow has turned by its own amount and every centre element has advanced in its own cycle.",
    nearMissNotes: [
      "One corner arrow has turned the wrong amount.",
      "The top centre shape is one step ahead in its cycle.",
      "Another corner arrow is mistracked.",
      full ? "The face shows the wrong expression." : "The bottom centre shape is one step ahead.",
    ],
  };
}

// SOLVER for the scaffold: each corner is a directional circle rotating by a
// constant step; the two centre slots each run their own cycle (shape or face).
function solveScaffold(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "pieCross" && p.slots.length >= 6)) return null;
  const slots: (Element | null)[] = [];
  for (let c = 0; c < 4; c++) {
    const el = shown[0].slots[c];
    if (!el || el.shape !== "dirCircle") return null;
    const n = nextModular(shown.map((p) => Math.round((p.slots[c]!.rot ?? 0) / 45)), 8);
    if (n === null) return null;
    slots.push({ shape: "dirCircle", fill: "outline", rot: n * 45 });
  }
  for (const i of [4, 5]) {
    const pred = solveElementSlot(shown.map((p) => p.slots[i]));
    if (pred === undefined) return null;
    slots.push(pred);
  }
  return { layout: "pieCross", slots };
}

// ---------------------------------------------------------------------------
// FRAME: PLUS-CROSS (EPSO Q10-style). A plus of five framed tiles: a TOP, LEFT
// and RIGHT tile each hold a shape that cycles through its own set; the CENTRE
// tile holds a flow-arrow that rotates 90° each step; the BOTTOM tile holds a
// FACE that alternates smile/frown with a dot-count beneath that follows a short
// repeating cycle. Five independent rules across five positions.
// ---------------------------------------------------------------------------
function framePlusCross(rng: () => number): BuiltItem {
  const topCycle = makeShapeCycle(rng, pick(rng, [2, 3]));
  const leftCycle = makeShapeCycle(rng, pick(rng, [2, 3]));
  const rightCycle = makeShapeCycle(rng, pick(rng, [2, 3]));
  const arrowStart = pick(rng, CW);
  const arrowStep = pick(rng, [1, -1]);
  const faceStart = rng() < 0.5;
  const dotCycle = pick(rng, [[1, 2], [2, 1], [1, 2, 3], [2, 1, 2], [1, 1, 2]]);

  const panelAt = (t: number): Panel => ({
    layout: "pluscross",
    slots: [
      { shape: cycleAt(topCycle, t), fill: "outline" },
      { shape: cycleAt(leftCycle, t), fill: "outline" },
      { shape: cycleAt(rightCycle, t), fill: "outline" },
      { shape: "arrow", fill: "solid", direction: rotateDir(arrowStart, t * arrowStep) },
      { shape: "face", fill: "outline", smile: t % 2 === 0 ? faceStart : !faceStart },
    ],
    dots: cycleAt(dotCycle, t),
  });
  const panels = [0, 1, 2, 3, 4, 5].map(panelAt);
  const answer = panels[5];

  const nm1 = clonePanel(answer); // top shape one step ahead
  nm1.slots[0] = { ...answer.slots[0]!, shape: cycleAt(topCycle, 6) };
  const nm2 = clonePanel(answer); // arrow turned wrong way
  nm2.slots[3] = { ...answer.slots[3]!, direction: rotateDir(answer.slots[3]!.direction!, 2) };
  const nm3 = clonePanel(answer); // face not toggled
  nm3.slots[4] = { ...answer.slots[4]!, smile: !(answer.slots[4] as Element).smile };
  const nm4 = clonePanel(answer); // dot-count wrong (previous step's)
  nm4.dots = cycleAt(dotCycle, 4);

  return {
    panels,
    periods: [topCycle.length, leftCycle.length, rightCycle.length, 4, 2, dotCycle.length],
    solver: solvePlusCross,
    ruleSummary:
      "A plus of five tiles. The top, left and right tiles each cycle through their own shapes; " +
      "the centre arrow turns 90° each step; the face at the bottom alternates between a smile and a frown; " +
      "and the number of dots beneath the face follows a repeating cycle. Track every tile independently.",
    nearMisses: [nm1, nm2, nm3, nm4],
    answerNote: "Correct: every arm shape has advanced in its cycle, the arrow has turned one step, the face has flipped, and the dot-count has advanced.",
    nearMissNotes: [
      "The top shape is one step ahead in its cycle.",
      "The centre arrow has turned the wrong way.",
      "The face shows the wrong expression.",
      "The number of dots is wrong for this step.",
    ],
  };
}

// SOLVER for plus-cross: top/left/right shapes each follow a cycle, the centre
// arrow rotates by a constant 90° step, the face toggles, the dot-count cycles.
function solvePlusCross(shown: Panel[]): Panel | null {
  if (!shown.every((p) => p.layout === "pluscross" && p.slots.length >= 5 && p.dots !== undefined)) return null;
  const slots: (Element | null)[] = [];
  for (const i of [0, 1, 2]) {
    const pred = solveElementSlot(shown.map((p) => p.slots[i]));
    if (pred === undefined) return null;
    slots.push(pred);
  }
  // centre arrow
  const dirIdx = shown.map((p) => CW.indexOf(p.slots[3]!.direction!));
  const nd = nextModular(dirIdx, 4);
  if (nd === null) return null;
  slots.push({ shape: "arrow", fill: "solid", direction: CW[nd] });
  // face toggle
  const face = solveElementSlot(shown.map((p) => p.slots[4]));
  if (face === undefined) return null;
  slots.push(face);
  // dots cycle
  const nDots = solveCycleValue(shown.map((p) => p.dots!));
  if (nDots === undefined) return null;
  return { layout: "pluscross", slots, dots: nDots };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------
type Generator = (rng: () => number, id: string) => AbstractQuestion;

// Register the AD8-grade solvers now that their functions are defined.
SOLVERS.bars = solveBars;
SOLVERS.rowcol = solveRowCol;

// Each difficulty draws from several figure types. A 3×3 grid is one of them.
// Listed once each so a set does not collapse onto the grid.
const TEMPLATES: Record<AbstractDifficulty, ((rng: () => number) => BuiltItem)[]> = {
  easy: [
    frameEasy, // arrow rotates and moves, or one shape cycles with fill
    frameMediumRow, // three shapes in one square, each one step ahead
    frameGridConvoy, // three shapes step around a fixed 3×3
  ],
  medium: [
    frameEasy,
    frameMediumRow,
    frameGridConvoy,
    frameGridOpposed, // pair one way, triangle the other
    frameCoupledCross,
    framePieGrid,
    frameSegments,
    frameController, // coupled: controller shape sets the arrow's turn
    (rng) => frameGlyphTurn(rng, false), // asymmetric glyphs turning opposite ways
    (rng) => frameAperture(rng, false), // gaps that widen / turn
  ],
  hard: [
    frameGridOpposed,
    frameGridCentre,
    frameCoupledCross,
    framePieGrid,
    frameSegments,
    frameThreeRow,
    (rng) => frameNRow(rng, 4, 3),
    (rng) => frameNRow(rng, 5, 3), // 2 decoy rows: more "which rows settle nothing?" load
    frameController,
    frameXorOverlay, // logical overlay (XOR of the last two panels)
    (rng) => frameGlyphTurn(rng, true),
    frameNgonRings, // n-gon side pattern + coupled rings
    (rng) => frameAperture(rng, true),
    (rng) => frameNestHandoff(rng, false), // shape identity moves between roles
    (rng) => frameFlipGrid(rng, 4), // alternating mirrors
    (rng) => frameScaffold(rng, false), // Q9-style: corners rotate, centres cycle
    framePlusCross, // Q10-style: plus of 5 tiles, each its own rule
  ],
  extreme: [
    frameGridCentre,
    frameCoupledCross,
    framePieGrid,
    (rng) => frameThreeRow(rng, "extreme"),
    (rng) => frameNRow(rng, 5, 4),
    (rng) => frameNRow(rng, 6, 4), // 2 decoys at extreme
    frameController,
    frameXorOverlay,
    (rng) => frameGlyphTurn(rng, true),
    frameNgonRings,
    frameNgonRings,
    (rng) => frameAperture(rng, true),
    (rng) => frameNestHandoff(rng, true),
    (rng) => frameFlipGrid(rng, 5),
    (rng) => frameScaffold(rng, true), // corners + centre + toggling face
    framePlusCross,
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
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[Math.floor(rng() * frames.length)];
    const built = buildValid(rng, id, difficulty, () => frame(rng));
    if (built) return built;
  }
  // A single rotating series always clears the validator. Use it rather than
  // show an item whose options are ambiguous.
  const fallback = buildValid(rng, id, difficulty, () => frameEasy(rng));
  if (fallback) return fallback;
  return buildValid(rng, id, "easy", () => frameEasy(rng))!;
}
