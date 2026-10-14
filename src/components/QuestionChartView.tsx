import type { QuestionChart } from "@/lib/types";

// Renders a numerical-reasoning chart (bar or line) as inline SVG — no chart
// library, so it is deterministic and adds nothing to the bundle. Shared by the
// timed runners and learn mode so chart styling never drifts.

// Colour-blind-safe categorical palette (Okabe-Ito subset).
const SERIES_COLORS = ["#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7"];

const W = 560; // viewBox width
const H = 300; // viewBox height
const PAD = { top: 20, right: 20, bottom: 48, left: 56 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export default function QuestionChartView({ chart }: { chart: QuestionChart }) {
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const allValues = chart.series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...allValues);
  const yMax = niceMax(rawMax);

  const n = chart.categories.length;
  const x = (i: number) => PAD.left + (plotW * (i + 0.5)) / Math.max(1, n);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / yMax;

  // Y-axis gridlines (5 segments)
  const ticks = Array.from({ length: 6 }, (_, i) => (yMax * i) / 5);

  return (
    <figure className="mt-3 overflow-x-auto">
      {chart.caption && (
        <figcaption className="mb-1 text-left font-semibold text-neutral-800">
          {chart.caption}
        </figcaption>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-xl"
        role="img"
        aria-label={chart.caption ?? "Data chart"}
      >
        {/* Y gridlines + labels */}
        {ticks.map((t, i) => {
          const yy = y(t);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={yy} x2={W - PAD.right} y2={yy} stroke="#e5e5e5" strokeWidth={1} />
              <text x={PAD.left - 6} y={yy + 4} textAnchor="end" fontSize={11} fill="#737373">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        {chart.yAxisLabel && (
          <text
            x={14}
            y={PAD.top + plotH / 2}
            textAnchor="middle"
            fontSize={11}
            fill="#525252"
            transform={`rotate(-90 14 ${PAD.top + plotH / 2})`}
          >
            {chart.yAxisLabel}
          </text>
        )}

        {/* X-axis labels */}
        {chart.categories.map((c, i) => (
          <text key={i} x={x(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={11} fill="#525252">
            {c}
          </text>
        ))}

        {/* Bars or lines */}
        {chart.type === "bar"
          ? chart.series.map((s, si) => {
              const groupW = plotW / Math.max(1, n);
              const barW = (groupW * 0.7) / chart.series.length;
              return s.values.map((v, i) => {
                const bx = x(i) - (barW * chart.series.length) / 2 + si * barW;
                const by = y(v);
                return (
                  <rect
                    key={`${si}-${i}`}
                    x={bx}
                    y={by}
                    width={barW}
                    height={PAD.top + plotH - by}
                    fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                  />
                );
              });
            })
          : chart.series.map((s, si) => {
              const d = s.values
                .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`)
                .join(" ");
              return (
                <g key={si}>
                  <path d={d} fill="none" stroke={SERIES_COLORS[si % SERIES_COLORS.length]} strokeWidth={2} />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={SERIES_COLORS[si % SERIES_COLORS.length]} />
                  ))}
                </g>
              );
            })}
      </svg>

      {/* Legend — only when more than one series */}
      {chart.series.length > 1 && (
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-neutral-700">
          {chart.series.map((s, si) => (
            <span key={si} className="inline-flex items-center gap-1">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
