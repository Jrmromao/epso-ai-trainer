// Client-side BYOK (Bring Your Own Key) store. The user's own LLM key is held
// in sessionStorage only — it is cleared when the tab closes and is NEVER sent
// anywhere except as a per-request header to our own API routes, which forward
// it to the LLM for that single call. It is never persisted server-side.

const STORAGE_KEY = "epso_byok";
const HEADER = "x-llm-key";

export function getUserKey(): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(STORAGE_KEY)?.trim() ?? "";
}

export function setUserKey(key: string): void {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (trimmed) {
    window.sessionStorage.setItem(STORAGE_KEY, trimmed);
  } else {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function clearUserKey(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function hasUserKey(): boolean {
  return getUserKey().length > 0;
}

// Build request headers, adding the BYOK header only when a user key is present.
export function llmHeaders(base: Record<string, string> = {}): Record<string, string> {
  const key = getUserKey();
  return key ? { ...base, [HEADER]: key } : base;
}

export const BYOK_HEADER = HEADER;
