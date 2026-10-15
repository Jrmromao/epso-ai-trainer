// Shared per-question timer bar. Shows the seconds remaining and a progress
// bar that changes colour as the budget runs down (green > amber > red).
// The budget (total seconds) is passed in by the caller so each test type uses
// its own EPSO-accurate pace.

export default function QuestionTimer({
  secondsLeft,
  budget,
  label,
}: {
  secondsLeft: number;
  budget: number;
  label?: string; // optional badge, e.g. "Exam timing"
}) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / budget) * 100));
  // Colour thresholds are proportional to the budget, not absolute, so they
  // feel right whether the budget is 60s or 120s.
  const barColor =
    pct <= 15 ? "bg-red-500" : pct <= 33 ? "bg-amber-500" : "bg-green-600";
  const textColor =
    pct <= 15 ? "text-red-600" : pct <= 33 ? "text-amber-600" : "text-neutral-700";

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{label ?? "Time for this question"}</span>
        <span className={`font-semibold tabular-nums ${textColor}`}>{secondsLeft}s</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
        <div
          className={`h-full transition-[width] duration-1000 ease-linear ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
