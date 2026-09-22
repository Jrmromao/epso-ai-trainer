// Server-side daily LLM-call cap (spec AC11). Bounds cost even if the access
// gate is bypassed. v1 uses an in-memory counter — resets on serverless cold
// start; acceptable for a personal app. Upstash/KV is the v2 upgrade.

let day = "";
let count = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function limit(): number {
  const n = Number(process.env.LLM_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

// Reserve one LLM call. Returns false if today's cap is already reached.
export function tryConsumeLlmCall(): boolean {
  const d = today();
  if (d !== day) {
    day = d;
    count = 0;
  }
  if (count >= limit()) return false;
  count += 1;
  return true;
}

export function remainingCalls(): number {
  if (today() !== day) return limit();
  return Math.max(0, limit() - count);
}
