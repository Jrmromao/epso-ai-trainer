import type { Direction, Element, Panel, ShapeKind } from "@/lib/abstractReasoning";

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
      const pts = `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}`;
      return <polygon points={pts} fill={fillColor} stroke={stroke} strokeWidth={sw} />;
    }
    case "diamond": {
      const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      return <polygon points={pts} fill={fillColor} stroke={stroke} strokeWidth={sw} />;
    }
    case "arrow":
      return <Arrow dir={el.direction ?? "up"} cx={cx} cy={cy} size={size} />;
    default:
      return null;
  }
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
    default:
      return Array.from({ length: count }, (_, i) => ({ x: (i + 1) / (count + 1), y: 0.5 }));
  }
}

function shapeSize(layout: Panel["layout"]): number {
  if (layout === "single") return 36;
  if (layout === "cross") return 22;
  return 24;
}

export default function AbstractPanel({ panel, size = 96 }: { panel: Panel; size?: number }) {
  const positions = slotPositions(panel.layout, panel.slots.length);
  const sz = shapeSize(panel.layout);

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      width={size}
      height={size}
      className="rounded border border-neutral-300 bg-white"
      role="img"
    >
      {panel.slots.map((el, i) => {
        if (!el) return null;
        const pos = positions[i] ?? { x: 0.5, y: 0.5 };
        return <Shape key={i} el={el} cx={pos.x * BOX} cy={pos.y * BOX} size={sz} />;
      })}
    </svg>
  );
}
