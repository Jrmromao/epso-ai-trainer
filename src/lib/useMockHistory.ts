"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnswerRecord, Topic } from "@/lib/types";

// Persisted history of completed mocks (localStorage — no DB, per spec).

const STORAGE_KEY = "epso.mockHistory";

export interface MockRun {
  date: string;
  topic: Topic;
  correct: number;
  total: number;
}

export function useMockHistory() {
  const [history, setHistory] = useState<MockRun[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore corrupt storage
    }
  }, []);

  const record = useCallback((topic: Topic, records: AnswerRecord[]) => {
    const run: MockRun = {
      date: new Date().toISOString(),
      topic,
      correct: records.filter((r) => r.isCorrect).length,
      total: records.length,
    };
    setHistory((prev) => {
      const next = [run, ...prev].slice(0, 100);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage full / unavailable — non-fatal
      }
      return next;
    });
  }, []);

  return { history, record };
}
