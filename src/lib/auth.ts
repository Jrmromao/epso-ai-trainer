import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Server-side access gate. A single access code (APP_ACCESS_CODE) is verified
// here; on success we set an httpOnly, signed session cookie. The access code
// is NEVER shipped to the client — only the signed token is.

const COOKIE_NAME = "epso_session";
const SESSION_VALUE = "ok";

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function token(secret: string): string {
  return `${SESSION_VALUE}.${sign(SESSION_VALUE, secret)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Verify a submitted access code against APP_ACCESS_CODE (constant-time).
export function verifyAccessCode(code: string): boolean {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) return false;
  return safeEqual(code, expected);
}

export async function issueSessionCookie(): Promise<void> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET not configured");
  const store = await cookies();
  store.set(COOKIE_NAME, token(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

// True if the request carries a valid signed session cookie.
export async function hasValidSession(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const store = await cookies();
  const c = store.get(COOKIE_NAME)?.value;
  if (!c) return false;
  return safeEqual(c, token(secret));
}
