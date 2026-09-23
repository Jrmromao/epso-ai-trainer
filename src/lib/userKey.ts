// Client-side BYOK (Bring Your Own Key) store. The user's own LLM key is held
// in the browser only and is NEVER sent anywhere except as a per-request header
// to our own API routes, which forward it to the LLM for that single call. It
// is never persisted server-side.
//
// Two storage tiers, user's choice:
//   - sessionStorage (default): cleared when the tab closes. Safest.
//   - localStorage (opt-in "remember on this device"): survives restarts so the
//     key need not be re-entered each session. Plaintext, same-origin only —
//     no more/less secure than sessionStorage, just persistent. Opt-in by design.
// Neither tier encrypts the key: browser storage has no secret at rest, and any
// self-encryption would need its own key stored in the same browser (theatre on
// a single private device). The honest control is opt-in + easy forget.

const STORAGE_KEY = "epso_byok";
const HEADER = "x-llm-key";

function session(): Storage | null {
  return typeof window === "undefined" ? null : window.sessionStorage;
}

function local(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

// Read precedence: a remembered (localStorage) key wins, else the session key.
export function getUserKey(): string {
  return (
    local()?.getItem(STORAGE_KEY)?.trim() ||
    session()?.getItem(STORAGE_KEY)?.trim() ||
    ""
  );
}

// Store the key. remember=true persists across sessions (localStorage);
// remember=false keeps it to the current tab (sessionStorage). Either way the
// other tier is cleared first so there is exactly one copy in exactly one tier.
export function setUserKey(key: string, remember = false): void {
  const trimmed = key.trim();
  // Clear both tiers first — prevents a stale copy lingering in the other tier.
  session()?.removeItem(STORAGE_KEY);
  local()?.removeItem(STORAGE_KEY);
  if (!trimmed) return;
  const store = remember ? local() : session();
  store?.setItem(STORAGE_KEY, trimmed);
}

// Remove the key from BOTH tiers.
export function clearUserKey(): void {
  session()?.removeItem(STORAGE_KEY);
  local()?.removeItem(STORAGE_KEY);
}

export function hasUserKey(): boolean {
  return getUserKey().length > 0;
}

// True when the current key is the persisted (remembered) one.
export function isKeyRemembered(): boolean {
  return (local()?.getItem(STORAGE_KEY)?.trim().length ?? 0) > 0;
}

// Build request headers, adding the BYOK header only when a user key is present.
export function llmHeaders(base: Record<string, string> = {}): Record<string, string> {
  const key = getUserKey();
  return key ? { ...base, [HEADER]: key } : base;
}

export const BYOK_HEADER = HEADER;
