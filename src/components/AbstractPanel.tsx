import { useId, type ReactNode } from "react";
import type { Direction, Element, Panel, SegPattern, ShapeKind } from "@/lib/abstractReasoning";

// Renders a single abstract-reasoning panel as inline SVG. Deterministic, no
// dependencies. Used both for the sequence row and the answer options.

const BOX = 100; // viewBox size

// Regular polygon vertices as an SVG points string. startDeg -90 = vertex at top.
function polyPts(n: number, cx: number, cy: number, r: number, startDeg = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function starPts(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function Shape({ el, cx, cy, size }: { el: Element; cx: number; cy: number; size: number }) {
  // Unique per instance, so clipPaths/patterns never collide between the many
  // panels rendered on one page. Colons are not valid inside url(#...).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "_");
  const INK = "#111827";
  const sw = 2;
  const r = (size / 2) * (el.scale ?? 1);

  // Draw the geometry once per paint: `f` is the fill attribute to use.
  const draw = (f: string): ReactNode => {
    switch (el.shape) {
      case "circle":
        return <circle cx={cx} cy={cy} r={r} fill={f} stroke={INK} strokeWidth={sw} />;
      case "square":
        return <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill={f} stroke={INK} strokeWidth={sw} />;
      case "triangle": {
        // A clear point up or down. The apex sits off-centre only when mirrored.
        const down = el.tri === "down";
        const apexX = el.mirror ? cx + r * 0.45 : cx;
        const pts = down
          ? `${cx - r},${cy - r * 0.85} ${cx + r},${cy - r * 0.85} ${apexX},${cy + r}`
          : `${cx - r},${cy + r * 0.85} ${cx + r},${cy + r * 0.85} ${apexX},${cy - r}`;
        return <polygon points={pts} fill={f} stroke={INK} strokeWidth={sw} />;
      }
      case "diamond":
        return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={f} stroke={INK} strokeWidth={sw} />;
      case "cross": {
        const a = r * 0.36;
        const pts = [
          [-a, -r], [a, -r], [a, -a], [r, -a], [r, a], [a, a],
          [a, r], [-a, r], [-a, a], [-r, a], [-r, -a], [-a, -a],
        ].map(([x, y]) => `${cx + x},${cy + y}`).join(" ");
        return <polygon points={pts} fill={f} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
      }
      case "star":
        return <polygon points={starPts(cx, cy, r * 1.08)} fill={f} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
      case "hexagon":
        return <polygon points={polyPts(6, cx, cy, r, 0)} fill={f} stroke={INK} strokeWidth={sw} />;
      case "ngon":
        return <polygon points={polyPts(Math.max(3, el.sides ?? 5), cx, cy, r, -90)} fill={f} stroke={INK} strokeWidth={sw} />;
      case "lshape": {
        const pts = [
          [-r, -r], [-0.2 * r, -r], [-0.2 * r, 0.2 * r], [r, 0.2 * r], [r, r], [-r, r],
        ].map(([x, y]) => `${cx + x},${cy + y}`).join(" ");
        return <polygon points={pts} fill={f} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
      }
      case "chevron": {
        const pts = [
          [-r, -r], [0, -r], [r, 0], [0, r], [-r, r], [0, 0],
        ].map(([x, y]) => `${cx + x},${cy + y}`).join(" ");
        return <polygon points={pts} fill={f} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
      }
      case "semicircle": {
        // flat edge at the bottom; vertically centred in its cell
        const y = cy + r * 0.5;
        return <path d={`M ${cx - r} ${y} A ${r} ${r} 0 0 1 ${cx + r} ${y} Z`} fill={f} stroke={INK} strokeWidth={sw} strokeLinejoin="round" />;
      }
      case "crescent": {
        // outer circle r minus an offset circle 0.78r; opens to the right
        const ox = cx - r * 0.17;
        const a = r * 0.66, h = r * 0.7512, r2 = r * 0.78;
        return (
          <path
            d={`M ${ox + a} ${cy - h} A ${r} ${r} 0 1 0 ${ox + a} ${cy + h} A ${r2} ${r2} 0 1 1 ${ox + a} ${cy - h} Z`}
            fill={f}
            stroke={INK}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        );
      }
      case "pacman": {
        // A disc with a wedge removed. The gap is centred on +x (pointing right)
        // and `rot` turns it; `open` is the gap width in degrees.
        const open = Math.max(10, Math.min(300, el.open ?? 90));
        const a = ((open / 2) * Math.PI) / 180;
        const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a);
        const x2 = cx + r * Math.cos(-a), y2 = cy + r * Math.sin(-a);
        const large = 360 - open > 180 ? 1 : 0;
        return (
          <path
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
            fill={f}
            stroke={INK}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        );
      }
      case "dirCircle": {
        // A ringed circle with a solid arrowhead pointing UP (then turned by rot).
        const tip = cy - r * 0.72, baseY = cy - r * 0.12, w = r * 0.42;
        return (
          <>
            <circle cx={cx} cy={cy} r={r} fill={f === INK ? "none" : f} stroke={INK} strokeWidth={sw} />
            <polygon points={`${cx},${tip} ${cx - w},${baseY} ${cx + w},${baseY}`} fill={INK} />
          </>
        );
      }
      case "face": {
        const eyeY = cy - r * 0.28, eyeDX = r * 0.38, eyeR = Math.max(1.4, r * 0.1);
        const my = cy + r * 0.3, mw = r * 0.5;
        const smile = el.smile !== false;
        const mouth = smile
          ? `M ${cx - mw} ${my} Q ${cx} ${my + r * 0.4} ${cx + mw} ${my}`
          : `M ${cx - mw} ${my + r * 0.28} Q ${cx} ${my - r * 0.14} ${cx + mw} ${my + r * 0.28}`;
        return (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={INK} strokeWidth={sw} />
            <circle cx={cx - eyeDX} cy={eyeY} r={eyeR} fill={INK} />
            <circle cx={cx + eyeDX} cy={eyeY} r={eyeR} fill={INK} />
            <path d={mouth} fill="none" stroke={INK} strokeWidth={Math.max(1.6, sw)} strokeLinecap="round" />
          </>
        );
      }
      case "arrow":
        return <Arrow dir={el.direction ?? "up"} cx={cx} cy={cy} size={size} />;
      case "pie":
        return <Pie quarter={el.quarter ?? 0} cx={cx} cy={cy} r={r} />;
      default:
        return null;
    }
  };

  const hatchId = `${uid}h`;
  const clipId = `${uid}c`;
  let body: ReactNode;
  if (el.fill === "half") {
    // outline of the whole shape + the LEFT half filled (turns with `rot`)
    body = (
      <>
        {draw("none")}
        <clipPath id={clipId}>
          <rect x={cx - r * 1.6} y={cy - r * 1.6} width={r * 1.6} height={r * 3.2} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>{draw(INK)}</g>
      </>
    );
  } else if (el.fill === "hatch") {
    body = (
      <>
        <defs>
          <pattern id={hatchId} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={4} stroke={INK} strokeWidth={1.6} />
          </pattern>
        </defs>
        {draw(`url(#${hatchId})`)}
      </>
    );
  } else {
    body = draw(el.fill === "solid" ? INK : el.fill === "white" ? "#ffffff" : "none");
  }

  // Polygon marker: a small ringed dot just inside vertex 0, so a turn stays
  // readable however symmetric the polygon happens to be.
  const marker =
    el.shape === "ngon" ? (
      <circle cx={cx} cy={cy - r * 0.64} r={Math.max(3.4, r * 0.2)} fill="#ffffff" stroke={INK} strokeWidth={2} />
    ) : null;

  const turned =
    el.rot && el.shape !== "arrow" && el.shape !== "pie" && el.shape !== "face" ? (
      <g transform={`rotate(${el.rot} ${cx} ${cy})`}>
        {body}
        {marker}
      </g>
    ) : (
      <>
        {body}
        {marker}
      </>
    );

  // Concentric containers around the element (not rotated: they are circles).
  const rings = Array.from({ length: Math.max(0, Math.min(3, el.rings ?? 0)) }, (_, i) => (
    <circle key={i} cx={cx} cy={cy} r={r * 1.28 + i * 5} fill="none" stroke={INK} strokeWidth={1.5} />
  ));

  const inner = (
    <>
      {rings}
      {turned}
    </>
  );
  // A reflected element is mirrored horizontally about its own centre.
  if (el.mirror) {
    return <g transform={`translate(${2 * cx} 0) scale(-1 1)`}>{inner}</g>;
  }
  return inner;
}

// A quarter-filled circle. `quarter` 0..3 selects which 90° wedge is filled,
// clockwise starting from the top-right (12 o'clock to 3 o'clock = 0).
function Pie({ quarter, cx, cy, r }: { quarter: number; cx: number; cy: number; r: number }) {
  const stroke = "#111827";
  // wedge from angle a0 to a1 (degrees, 0 = up, clockwise)
  const a0 = quarter * 90;
  const a1 = a0 + 90;
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180; // -90 so 0deg points up
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x0, y0] = toXY(a0);
  const [x1, y1] = toXY(a1);
  const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} Z`;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={2} />
      <path d={d} fill="#111827" />
    </g>
  );
}

function Arrow({ dir, cx, cy, size }: { dir: Direction; cx: number; cy: number; size: number }) {
  const half = size / 2;
  const angle = { up: -90, right: 0, down: 90, left: 180 }[dir];
  // Base arrow points right; rotate via transform.
  const shaftX1 = cx - half;
  const shaftX2 = cx + half * 0.5;
  const headX = cx + half;
  return (
    <g transform={`rotate(${angle} ${cx} ${cy})`}>
      <line x1={shaftX1} y1={cy} x2={headX} y2={cy} stroke="#111827" strokeWidth={2.5} />
      <polygon
        points={`${headX},${cy} ${shaftX2},${cy - half * 0.4} ${shaftX2},${cy + half * 0.4}`}
        fill="#111827"
      />
    </g>
  );
}

// Slot positions per layout, as fractions of the box.
function slotPositions(layout: Panel["layout"], count: number): { x: number; y: number }[] {
  switch (layout) {
    case "single":
      return [{ x: 0.5, y: 0.5 }];
    case "row3":
      return [
        { x: 0.17, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.83, y: 0.5 },
      ];
    case "stack2":
      return [
        { x: 0.5, y: 0.3 },
        { x: 0.5, y: 0.7 },
      ];
    case "cross":
      // N, E, S, W, centre
      return [
        { x: 0.5, y: 0.2 },
        { x: 0.8, y: 0.5 },
        { x: 0.5, y: 0.8 },
        { x: 0.2, y: 0.5 },
        { x: 0.5, y: 0.5 },
      ];
    case "pieCross":
      // 4 corners (NE, SE, SW, NW) + centre top + centre bottom
      return [
        { x: 0.78, y: 0.22 },
        { x: 0.78, y: 0.78 },
        { x: 0.22, y: 0.78 },
        { x: 0.22, y: 0.22 },
        { x: 0.5, y: 0.4 },
        { x: 0.5, y: 0.62 },
      ];
    default:
      return Array.from({ length: count }, (_, i) => ({ x: (i + 1) / (count + 1), y: 0.5 }));
  }
}

function shapeSize(layout: Panel["layout"]): number {
  if (layout === "single") return 36;
  if (layout === "cross") return 22;
  if (layout === "pieCross") return 22;
  if (layout === "row3") return 26;
  return 24;
}

// ---- Specialised renderers ----

// COUNT: draw N identical small shapes in a tidy grid.
function CountPanel({ count, shape }: { count: number; shape: ShapeKind }) {
  const n = Math.max(0, Math.min(9, count));
  const cols = n <= 3 ? n : n <= 6 ? 3 : 3;
  const rows = Math.ceil(n / cols);
  const sz = 18;
  const items = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = ((c + 1) / (cols + 1)) * BOX;
    const cy = ((r + 1) / (rows + 1)) * BOX;
    items.push(<Shape key={i} el={{ shape, fill: "solid" }} cx={cx} cy={cy} size={sz} />);
  }
  return <>{items}</>;
}

// SEGMENTS: 8-segment square (two diagonals + vertical/horizontal medians),
// each segment with a fill pattern, plus an optional travelling dot.
function pattern(id: string, kind: SegPattern) {
  // returns an SVG <pattern> def and the fill reference
  switch (kind) {
    case "dots":
      return (
        <pattern id={id} width={5} height={5} patternUnits="userSpaceOnUse">
          <circle cx={2.5} cy={2.5} r={1} fill="#111827" />
        </pattern>
      );
    case "lines":
      return (
        <pattern id={id} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={5} stroke="#111827" strokeWidth={1} />
        </pattern>
      );
    case "checker":
      return (
        <pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse">
          <rect width={3} height={3} fill="#111827" />
          <rect x={3} y={3} width={3} height={3} fill="#111827" />
        </pattern>
      );
    default:
      return null;
  }
}

function SegmentsPanel({ segments, dotPos, uid }: { segments: SegPattern[]; dotPos?: number; uid: string }) {
  const c = BOX / 2;
  // 8 segment polygons (triangles) around the centre, clockwise from top-left.
  const pts: Record<string, [number, number]> = {
    TL: [0, 0], TM: [c, 0], TR: [BOX, 0],
    ML: [0, c], MR: [BOX, c],
    BL: [0, BOX], BM: [c, BOX], BR: [BOX, BOX],
  };
  const C: [number, number] = [c, c];
  // 8 triangles sharing the centre.
  const tris: [[number, number], [number, number]][] = [
    [pts.TL, pts.TM], [pts.TM, pts.TR], [pts.TR, pts.MR], [pts.MR, pts.BR],
    [pts.BR, pts.BM], [pts.BM, pts.BL], [pts.BL, pts.ML], [pts.ML, pts.TL],
  ];
  // dot positions = centroid of each triangle
  const centroid = (a: [number, number], b: [number, number]): [number, number] => [
    (a[0] + b[0] + C[0]) / 3,
    (a[1] + b[1] + C[1]) / 3,
  ];

  return (
    <>
      <defs>
        {segments.map((s, i) => pattern(`${uid}-p${i}`, s))}
      </defs>
      {tris.map(([a, b], i) => {
        const kind = segments[i];
        const fill =
          kind === "solid" ? "#111827" : kind === "blank" ? "white" : `url(#${uid}-p${i})`;
        return (
          <polygon
            key={i}
            points={`${a[0]},${a[1]} ${b[0]},${b[1]} ${C[0]},${C[1]}`}
            fill={fill}
            stroke="#111827"
            strokeWidth={1}
          />
        );
      })}
      {dotPos !== undefined && (() => {
        const [a, b] = tris[dotPos % 8];
        const [dx, dy] = centroid(a, b);
        // White halo behind the dot so it reads as a solid black marker on ANY
        // segment pattern (prevents the dot looking filled/hollow by accident).
        return (
          <g>
            <circle cx={dx} cy={dy} r={6} fill="white" />
            <circle cx={dx} cy={dy} r={4} fill="#111827" />
          </g>
        );
      })()}
    </>
  );
}

// CURVES: 2-3 wavy horizontal lines; each may be flipped vertically.
function CurvesPanel({ curves }: { curves: { y: number; flip: boolean }[] }) {
  return (
    <>
      {curves.map((cv, i) => {
        const y = cv.y * BOX;
        const amp = cv.flip ? -10 : 10;
        // simple sine-ish wave across the box
        const d = `M 12 ${y} C 33 ${y + amp}, 45 ${y - amp}, 55 ${y} S 78 ${y + amp}, 88 ${y}`;
        return <path key={i} d={d} fill="none" stroke="#111827" strokeWidth={2} />;
      })}
    </>
  );
}

// GRID3: nine equal cells. A shape is centred in its cell at one fixed size,
// so a move is a move into the next cell and never a resize.
function Grid3Panel({ slots }: { slots: (Element | null)[] }) {
  const pad = 5;
  const gap = 3;
  const cell = (BOX - pad * 2 - gap * 2) / 3;
  const shape = 18;
  const cells = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = pad + c * (cell + gap);
      const y = pad + r * (cell + gap);
      const el = slots[r * 3 + c] ?? null;
      cells.push(
        <g key={`${r}-${c}`}>
          <rect
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={2}
            fill="#ffffff"
            stroke="#c5d0de"
            strokeWidth={1.25}
          />
          {el && <Shape el={el} cx={x + cell / 2} cy={y + cell / 2} size={shape} />}
        </g>,
      );
    }
  }
  return <>{cells}</>;
}

// COMPOSITE: N independent rows of elements stacked vertically (2-6 rows).
// Element size adapts to the row count so dense panels stay legible.
function Composite3Panel({ rows }: { rows: Element[][] }) {
  const R = Math.max(1, rows.length);
  return (
    <>
      {rows.map((row, r) => {
        const n = Math.max(1, row.length);
        const bandH = BOX / R;
        // Stay inside the row and leave a gap between neighbours, so a count
        // of six is still countable instead of a single blob.
        const sz = Math.min(22, bandH * 0.7, ((BOX - 10) / n) * 0.72);
        const cy = bandH * (r + 0.5);
        return row.map((el, c) => {
          const cx = (BOX * (c + 0.5)) / n;
          return <Shape key={`${r}-${c}`} el={el} cx={cx} cy={cy} size={sz} />;
        });
      })}
    </>
  );
}

// BARS: a bar chart of integer heights with a triangle marker above one bar and
// a dot-count beneath. Models the EPSO conserved-quantity height-transfer item.
function BarsPanel({ bars, markerBar, dots }: { bars: number[]; markerBar?: number; dots?: number }) {
  const n = bars.length;
  const maxH = 9; // heights live in 0..9
  const chartTop = 16; // leave room for the marker triangle
  const chartBottom = 82; // leave room for the dot row
  const chartH = chartBottom - chartTop;
  const slotW = BOX / n;
  const barW = slotW * 0.55;
  const items: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const h = Math.max(0, Math.min(maxH, bars[i]));
    const px = (h / maxH) * chartH;
    const cx = slotW * (i + 0.5);
    const x = cx - barW / 2;
    const y = chartBottom - px;
    items.push(
      <rect key={`b${i}`} x={x} y={y} width={barW} height={px} fill="#9fb0c3" stroke="#334155" strokeWidth={1} />,
    );
    // marker triangle above this bar
    if (markerBar === i) {
      items.push(
        <polygon
          key={`m${i}`}
          points={`${cx - 5},${chartTop - 10} ${cx + 5},${chartTop - 10} ${cx},${chartTop - 2}`}
          fill="#111827"
        />,
      );
    }
  }
  // dot-count row beneath the chart
  const d = Math.max(0, Math.min(6, dots ?? 0));
  for (let i = 0; i < d; i++) {
    const dx = BOX / 2 + (i - (d - 1) / 2) * 10;
    items.push(<circle key={`d${i}`} cx={dx} cy={92} r={3} fill="#111827" />);
  }
  return <>{items}</>;
}

// ROWCOL: a grid with one whole row and one whole column highlighted (light
// blue), their single intersection cell coloured grey or navy. Models the EPSO
// row-down / column-left / alternating-intersection item.
function RowColPanel({
  rows,
  cols,
  hiRow,
  hiCol,
  intersectColor,
}: {
  rows: number;
  cols: number;
  hiRow: number;
  hiCol: number;
  intersectColor: "grey" | "navy";
}) {
  const pad = 6;
  const gap = 3;
  const cw = (BOX - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (BOX - pad * 2 - gap * (rows - 1)) / rows;
  const cells: ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = pad + c * (cw + gap);
      const y = pad + r * (ch + gap);
      const onRow = r === hiRow;
      const onCol = c === hiCol;
      let fill = "#ffffff";
      if (onRow && onCol) fill = intersectColor === "navy" ? "#1e2a52" : "#8a94a6";
      else if (onRow || onCol) fill = "#c9dbf0";
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={x}
          y={y}
          width={cw}
          height={ch}
          rx={2}
          fill={fill}
          stroke="#c5d0de"
          strokeWidth={1.25}
        />,
      );
    }
  }
  return <>{cells}</>;
}

// NESTED: a grey or white background, a large OUTER shape, a smaller INNER shape
// (opaque white so it reads on top of any outer fill) and a small CORNER shape.
function NestedPanel({ nest, bg }: { nest: NonNullable<Panel["nest"]>; bg?: "grey" | "white" }) {
  return (
    <>
      <rect x={0} y={0} width={BOX} height={BOX} fill={bg === "grey" ? "#d3d8df" : "#ffffff"} />
      <Shape el={{ shape: nest.outer, fill: nest.outerFill }} cx={57} cy={57} size={62} />
      <Shape el={{ shape: nest.inner, fill: "white" }} cx={57} cy={57} size={28} />
      <Shape el={{ shape: nest.corner, fill: "white" }} cx={14} cy={14} size={17} />
    </>
  );
}

// PLUSCROSS: five framed tiles in a plus. slots = [top, left, right, centreArrow,
// face]; `dots` draws under the face. Each tile is a bordered rounded square.
function PlusCrossPanel({ slots, dots }: { slots: (Element | null)[]; dots?: number }) {
  const t = 30, c = BOX / 2; // tile half-size and centre
  const cells: { cx: number; cy: number; el: Element | null }[] = [
    { cx: c, cy: 18, el: slots[0] },        // top
    { cx: 18, cy: c, el: slots[1] },        // left
    { cx: BOX - 18, cy: c, el: slots[2] },  // right
    { cx: c, cy: c, el: slots[3] },         // centre (arrow)
    { cx: c, cy: BOX - 18, el: slots[4] },  // bottom (face)
  ];
  return (
    <>
      {cells.map((cell, i) => (
        <g key={i}>
          <rect x={cell.cx - t / 2} y={cell.cy - t / 2} width={t} height={t} rx={3} fill="#ffffff" stroke="#c5d0de" strokeWidth={1.25} />
          {cell.el && <Shape el={cell.el} cx={cell.cx} cy={cell.cy} size={17} />}
        </g>
      ))}
      {dots !== undefined &&
        Array.from({ length: Math.max(0, Math.min(5, dots)) }, (_, i) => {
          const n = Math.min(5, dots);
          return <circle key={i} cx={c + (i - (n - 1) / 2) * 7} cy={BOX - 2} r={2} fill="#111827" />;
        })}
    </>
  );
}

export default function AbstractPanel({ panel, size = 96 }: { panel: Panel; size?: number }) {
  const uid = `seg-${Math.abs(hashPanel(panel))}`;

  let body: ReactNode;
  if (panel.layout === "count") {
    body = <CountPanel count={panel.count ?? 0} shape={panel.countShape ?? "circle"} />;
  } else if (panel.layout === "segments") {
    body = <SegmentsPanel segments={panel.segments ?? []} dotPos={panel.dotPos} uid={uid} />;
  } else if (panel.layout === "curves") {
    body = <CurvesPanel curves={panel.curves ?? []} />;
  } else if (panel.layout === "composite3") {
    body = <Composite3Panel rows={panel.rows ?? []} />;
  } else if (panel.layout === "grid3") {
    body = <Grid3Panel slots={panel.slots} />;
  } else if (panel.layout === "nested" && panel.nest) {
    body = <NestedPanel nest={panel.nest} bg={panel.bg} />;
  } else if (panel.layout === "pluscross") {
    body = <PlusCrossPanel slots={panel.slots} dots={panel.dots} />;
  } else if (panel.layout === "bars") {
    body = <BarsPanel bars={panel.bars ?? []} markerBar={panel.markerBar} dots={panel.dots} />;
  } else if (panel.layout === "rowcol") {
    body = (
      <RowColPanel
        rows={panel.gridRows ?? 3}
        cols={panel.gridCols ?? 4}
        hiRow={panel.hiRow ?? 0}
        hiCol={panel.hiCol ?? 0}
        intersectColor={panel.intersectColor ?? "grey"}
      />
    );
  } else {
    const positions = slotPositions(panel.layout, panel.slots.length);
    const sz = shapeSize(panel.layout);
    body = panel.slots.map((el, i) => {
      if (!el) return null;
      const pos = positions[i] ?? { x: 0.5, y: 0.5 };
      return <Shape key={i} el={el} cx={pos.x * BOX} cy={pos.y * BOX} size={el.shape === "ngon" ? 54 : sz} />;
    });
  }

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      className="shrink-0 rounded border border-neutral-300 bg-white"
      role="img"
    >
      {body}
    </svg>
  );
}

// Stable-ish id so each segments panel gets unique <pattern> ids within the SVG.
function hashPanel(p: Panel): number {
  const str = JSON.stringify(p);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h;
}
