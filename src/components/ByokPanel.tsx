"use client";

import { useEffect, useState } from "react";
import { clearUserKey, getUserKey, setUserKey } from "@/lib/userKey";

// BYOK panel. Lets the user supply their own DeepSeek key so generation runs
// on their credits — bypassing the access code entirely. The key is held in
// sessionStorage (cleared when the tab closes) and sent only as a per-request
// header to our own API routes. It is never persisted server-side.
export default function ByokPanel() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(getUserKey().length > 0);
  }, []);

  function save() {
    setUserKey(key);
    setSaved(true);
    setKey("");
  }

  function forget() {
    clearUserKey();
    setSaved(false);
    setKey("");
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-300 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-800">
        Use your own DeepSeek key (BYOK)
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        Provide your own key to generate questions on your own credits — no
        access code needed. The key is kept in this browser tab only (cleared
        when you close it) and is sent solely to power your generation requests.
      </p>

      {saved ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded bg-green-50 px-3 py-1 text-sm text-green-800">
            Your key is set for this session.
          </span>
          <button
            className="rounded border border-neutral-300 px-3 py-1 text-sm"
            onClick={forget}
          >
            Forget key
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="password"
            className="min-w-[16rem] flex-1 rounded border border-neutral-300 px-2 py-1"
            placeholder="sk-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && key.trim() && save()}
          />
          <button
            className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-40"
            onClick={save}
            disabled={!key.trim()}
          >
            Save key
          </button>
        </div>
      )}
    </div>
  );
}
