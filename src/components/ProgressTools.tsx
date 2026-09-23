"use client";

import { useRef, useState } from "react";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";

// Backup + portability for the local progress store (Task 18). Export writes a
// JSON file the user can drop in Google Drive / anywhere; import merges it back
// (idempotent by attempt id). No server, no OAuth — the user owns the file.

export default function ProgressTools() {
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportProgress() {
    setNotice(null);
    try {
      const snapshot = await getProgressRepo().exportAll();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `epso-progress-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice(`Exported ${snapshot.attempts.length} attempts.`);
    } catch {
      setNotice("Export failed.");
    }
  }

  async function importProgress(file: File) {
    setNotice(null);
    try {
      const text = await file.text();
      const snapshot = JSON.parse(text);
      const { imported } = await getProgressRepo().importAll(snapshot);
      setNotice(
        `Imported ${imported} new attempt${imported === 1 ? "" : "s"}. Reload to refresh the dashboard.`,
      );
    } catch {
      setNotice("Import failed — is this a valid epso-progress JSON file?");
    }
  }

  async function resetProgress() {
    if (
      !window.confirm(
        "Delete ALL recorded attempts from this browser? This clears the weak-area tracker and cannot be undone (saved test reviews are kept). Export first if unsure.",
      )
    ) {
      return;
    }
    setNotice(null);
    try {
      await getProgressRepo().clear();
      setNotice("Progress cleared. Reload to refresh the dashboard.");
    } catch {
      setNotice("Reset failed.");
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-300 bg-white p-4 text-sm">
      <p className="font-semibold text-neutral-800">Backup your progress</p>
      <p className="mt-1 text-xs text-neutral-500">
        Progress is stored in this browser only. Export a JSON file to back it up
        (e.g. in Google Drive) or move to another machine, then import it back.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={exportProgress}
          className="rounded bg-neutral-900 px-3 py-1 text-white"
        >
          Export
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded border border-neutral-300 px-3 py-1"
        >
          Import
        </button>
        <button
          onClick={resetProgress}
          className="rounded border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50"
        >
          Reset progress
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importProgress(f);
            e.target.value = "";
          }}
        />
      </div>
      {notice && <p className="mt-2 text-neutral-600">{notice}</p>}
    </div>
  );
}
