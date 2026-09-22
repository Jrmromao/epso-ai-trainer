import { NextResponse } from "next/server";
import { issueSessionCookie, verifyAccessCode } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!verifyAccessCode(code)) {
    return NextResponse.json({ error: "invalid access code" }, { status: 401 });
  }

  await issueSessionCookie();
  return NextResponse.json({ ok: true });
}
