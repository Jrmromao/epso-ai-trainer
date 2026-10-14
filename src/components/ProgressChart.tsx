"use client";

import { useMemo, useState } from "react";
import { useMockHistory } from "@/lib/useMockHistory";

// Score-trend chart for the history page. Plots the percentage score of every
// completed mock/exam over a selectable time window (1 week / 2 weeks / 1 month).
// Rendered as inline SVG — no chart library, zero bundle cost. A trend line plus
// per-run dots; hovering a dot shows the exact score via <title>.

type RangeKey = "7" | "14" | "30";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7", label: "Last week", days: 7 },
  { key: "14", label: "Last 2 weeks", days: 14 },
  { key: "30", label: "Last month", days: 30 },
];

const W = 640;
const H = 260;
const PAD = { top: 20, right: 20, bottom: 40, left: 44 };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function ProgressChart() {
  const { history } = useMockHistory();
  const [range, setRange] = useState<RangeKey>("14");

  const days = RANGES.find((r) => r.key === range)!.days;

  // Filter to the window and sort oldest -> newest. One point per run.
  const points = useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history
      .filter((r) => new Date(r.date).getTime() >= cutoff && r.total > 0)
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((r) => ({
        date: r.date,
        pct: Math.round((r.correct / r.total) * 100),
        topic: r.topic,
        correct: r.correct,
        total: r.total,
      }));
  }, [history, days]);

  if (points.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
        No completed tests in this window yet. Finish a mock or exam to start
        tracking your trend.
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // X: spread points evenly (not time-scaled — keeps spacing readable for sparse data).
  const x = (i: number) =>
    points.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + (plotW * i) / (points.length - 1);
  const y = (pct: number) => PAD.top + plotH - (plotH * pct) / 100;

  const avg = Math.round(points.reduce((s, p) => s + p.pct, 0) / points.length);
  const first = points[0].pct;
  const last = points[points.length - 1].pct;
  const delta = last - first;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.pct)}`).join(" ");

  // Y gridlines at 0/25/50/75/100
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Score trend</h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-3 py-1 text-sm transition ${
                range === r.key
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-300 bg-white hover:border-neutral-900"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary line */}
      <p className="mt-2 text-sm text-neutral-600">
        {points.length} test{points.length === 1 ? "" : "s"} · average {avg}%
        {points.length > 1 && (
          <>
            {" · "}
            <span className={delta > 0 ? "text-green-700" : delta < 0 ? "text-red-600" : "text-neutral-500"}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {delta > 0 ? "+" : ""}
              {delta}% vs first
            </span>
          </>
        )}
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Score trend over time">
        {/* Gridlines + Y labels */}
        {ticks.map((t) => {
          const yy = y(t);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={yy} x2={W - PAD.right} y2={yy} stroke="#e5e5e5" strokeWidth={1} />
              <text x={PAD.left - 6} y={yy + 4} textAnchor="end" fontSize={11} fill="#737373">
                {t}%
              </text>
            </g>
          );
        })}

        {/* Average reference line */}
        <line
          x1={PAD.left}
          y1={y(avg)}
          x2={W - PAD.right}
          y2={y(avg)}
          stroke="#9ca3af"
          strokeWidth={1}
          strokeDasharray="4 3"
        />

        {/* Trend line */}
        <path d={linePath} fill="none" stroke="#0072B2" strokeWidth={2} />

        {/* Points + date labels */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.pct)} r={4} fill="#0072B2">
              <title>
                {fmtDate(p.date)} · {p.topic} · {p.correct}/{p.total} ({p.pct}%)
              </title>
            </circle>
            {/* Only label every point if few; otherwise label first/last to avoid clutter */}
            {(points.length <= 8 || i === 0 || i === points.length - 1) && (
              <text x={x(i)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10} fill="#525252">
                {fmtDate(p.date)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
