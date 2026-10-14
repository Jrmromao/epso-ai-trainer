"use client";

import { useMemo, useState } from "react";
import { componentForTopic, COMPONENT_LABELS, type ExamComponent } from "@/lib/types";
import { useMockHistory } from "@/lib/useMockHistory";

// Score-trend chart for the history page. Plots the percentage score of every
// completed mock/exam over a selectable time window, drawing ONE LINE PER TEST
// TYPE (field-ai / verbal / numerical) so trends aren't mixed. Rendered as
// inline SVG — no chart library, zero bundle cost.

type RangeKey = "7" | "14" | "30";
const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7", label: "Last week", days: 7 },
  { key: "14", label: "Last 2 weeks", days: 14 },
  { key: "30", label: "Last month", days: 30 },
];

// Only the three components the app actually drills. Colour-blind-safe palette.
const SERIES: { component: ExamComponent; color: string }[] = [
  { component: "field-ai", color: "#0072B2" },
  { component: "verbal", color: "#E69F00" },
  { component: "numerical", color: "#009E73" },
];

const W = 640;
const H = 280;
const PAD = { top: 20, right: 20, bottom: 44, left: 44 };

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

interface Point {
  date: string;
  t: number; // epoch ms
  pct: number;
  component: ExamComponent;
  correct: number;
  total: number;
}

export default function ProgressChart() {
  const { history } = useMockHistory();
  const [range, setRange] = useState<RangeKey>("14");
  // Which component lines are visible (toggle via legend).
  const [hidden, setHidden] = useState<Set<ExamComponent>>(new Set());

  const days = RANGES.find((r) => r.key === range)!.days;

  // All in-window points, tagged with their component.
  const allPoints = useMemo<Point[]>(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history
      .filter((r) => new Date(r.date).getTime() >= cutoff && r.total > 0)
      .map((r) => ({
        date: r.date,
        t: new Date(r.date).getTime(),
        pct: Math.round((r.correct / r.total) * 100),
        component: componentForTopic(r.topic),
        correct: r.correct,
        total: r.total,
      }))
      .sort((a, b) => a.t - b.t);
  }, [history, days]);

  if (allPoints.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
        No completed tests in this window yet. Finish a mock or exam to start
        tracking your trend.
      </div>
    );
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Shared time axis across all series so lines align on the same dates.
  const tMin = allPoints[0].t;
  const tMax = allPoints[allPoints.length - 1].t;
  const x = (t: number) =>
    tMax === tMin ? PAD.left + plotW / 2 : PAD.left + (plotW * (t - tMin)) / (tMax - tMin);
  const y = (pct: number) => PAD.top + plotH - (plotH * pct) / 100;

  const ticks = [0, 25, 50, 75, 100];

  // Group points by component, respecting the hidden toggle.
  const seriesData = SERIES.map((s) => ({
    ...s,
    label: COMPONENT_LABELS[s.component],
    points: allPoints.filter((p) => p.component === s.component),
    visible: !hidden.has(s.component),
  })).filter((s) => s.points.length > 0);

  function toggle(c: ExamComponent) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  // Distinct date labels along the x-axis (first + last, plus a couple between).
  const dateLabels = (() => {
    if (allPoints.length <= 1) return allPoints;
    const first = allPoints[0];
    const last = allPoints[allPoints.length - 1];
    const mid = allPoints[Math.floor(allPoints.length / 2)];
    return [first, mid, last];
  })();

  return (
    <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Score trend by test type</h2>
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

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Score trend by test type over time">
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

        {/* X date labels */}
        {dateLabels.map((p, i) => (
          <text key={i} x={x(p.t)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize={10} fill="#525252">
            {fmtDate(p.date)}
          </text>
        ))}

        {/* One line per visible component */}
        {seriesData.map((s) =>
          s.visible ? (
            <g key={s.component}>
              {s.points.length > 1 && (
                <path
                  d={s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t)} ${y(p.pct)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                />
              )}
              {s.points.map((p, i) => (
                <circle key={i} cx={x(p.t)} cy={y(p.pct)} r={4} fill={s.color}>
                  <title>
                    {fmtDate(p.date)} · {s.label} · {p.correct}/{p.total} ({p.pct}%)
                  </title>
                </circle>
              ))}
            </g>
          ) : null,
        )}
      </svg>

      {/* Legend — click to toggle a line */}
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {seriesData.map((s) => {
          const avg = Math.round(s.points.reduce((a, p) => a + p.pct, 0) / s.points.length);
          return (
            <button
              key={s.component}
              onClick={() => toggle(s.component)}
              className={`inline-flex items-center gap-1.5 rounded px-2 py-1 transition ${
                s.visible ? "" : "opacity-40"
              } hover:bg-neutral-100`}
            >
              <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="font-medium">{s.label}</span>
              <span className="text-neutral-500">
                ({s.points.length}, avg {avg}%)
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
