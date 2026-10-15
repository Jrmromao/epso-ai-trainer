import type { ReactNode } from "react";
import type { Direction, Element, Panel, SegPattern, ShapeKind } from "@/lib/abstractReasoning";

// Renders a single abstract-reasoning panel as inline SVG. Deterministic, no
// dependencies. Used both for the sequence row and the answer options.

const BOX = 100; // viewBox size

function Shape({ el, cx, cy, size }: { el: Element; cx: number; cy: number; size: number }) {
  const fillColor = el.fill === "solid" ? "#111827" : "none";
  const stroke = "#111827";
  const sw = 2;
  const r = size / 2;

  switch (el.shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={r} fill={fillColor} stroke={stroke} strokeWidth={sw} />;
    case "square":
      return (
        <rect x={cx - r} y={cy - r} width={size} height={size} fill={fillColor} stroke={stroke} strokeWidth={sw} />
      );
    case "triangle": {
      // honour `tri` orientation (up default, down if set)
      const down = el.tri === "down";
      const pts = down
        ? `${cx},${cy + r} ${cx + r},${cy - r} ${cx - r},${cy - r}`
        : `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`;
      return <polygon points={pts} fill={fillColor} stroke={stroke} strokeWidth={sw} />;
    }
    case "diamond": {
      const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      return <polygon points={pts} fill={fillColor} stroke={stroke} strokeWidth={sw} />;
    }
    case "arrow":
      return <Arrow dir={el.direction ?? "up"} cx={cx} cy={cy} size={size} />;
    case "pie":
      return <Pie quarter={el.quarter ?? 0} cx={cx} cy={cy} r={r} />;
    default:
      return null;
  }
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
        { x: 0.22, y: 0.5 },
        { x: 0.5, y: 0.5 },
        { x: 0.78, y: 0.5 },
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
  if (layout === "pieCross") return 20;
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
        return <circle cx={dx} cy={dy} r={4} fill="#111827" stroke="white" strokeWidth={1} />;
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

// COMPOSITE3: three independent rows of elements stacked vertically.
function Composite3Panel({ rows }: { rows: Element[][] }) {
  const sz = 15;
  return (
    <>
      {rows.map((row, r) => {
        const cy = ((r + 1) / (rows.length + 1)) * BOX;
        const n = row.length;
        return row.map((el, c) => {
          const cx = ((c + 1) / (n + 1)) * BOX;
          return <Shape key={`${r}-${c}`} el={el} cx={cx} cy={cy} size={sz} />;
        });
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
  } else {
    const positions = slotPositions(panel.layout, panel.slots.length);
    const sz = shapeSize(panel.layout);
    body = panel.slots.map((el, i) => {
      if (!el) return null;
      const pos = positions[i] ?? { x: 0.5, y: 0.5 };
      return <Shape key={i} el={el} cx={pos.x * BOX} cy={pos.y * BOX} size={sz} />;
    });
  }

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      className="rounded border border-neutral-300 bg-white"
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
