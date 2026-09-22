"use client";

import { useEffect, useState } from "react";

// Lightweight access gate. Submits the access code to /api/auth (server-checked),
// which sets an httpOnly session cookie. The code is never stored client-side.

export default function AccessGate() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"unknown" | "in" | "out">("unknown");
  const [error, setError] = useState("");

  // Probe session by hitting a protected route with an empty body.
  useEffect(() => {
    fetch("/api/assess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ results: [] }),
    })
      .then((r) => setStatus(r.status === 401 ? "out" : "in"))
      .catch(() => setStatus("out"));
  }, []);

  async function unlock() {
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) {
      setStatus("in");
      setCode("");
    } else {
      setError("Invalid access code");
    }
  }

  if (status === "in") {
    return (
      <p className="mt-4 rounded bg-green-50 px-3 py-2 text-sm text-green-800">
        Unlocked — question generation is enabled.
      </p>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-300 bg-white p-4">
      <p className="text-sm text-neutral-700">
        Enter your access code to enable AI question generation.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="password"
          className="rounded border border-neutral-300 px-2 py-1"
          placeholder="access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
        />
        <button
          className="rounded bg-neutral-900 px-3 py-1 text-white"
          onClick={unlock}
        >
          Unlock
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
