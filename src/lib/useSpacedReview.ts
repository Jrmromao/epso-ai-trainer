"use client";

import { useEffect, useState } from "react";
import type { Question, Topic } from "@/lib/types";
import type { DueItem } from "@/lib/storage/progressRepo";
import { getProgressRepo } from "@/lib/storage/indexedDbProgressRepo";
import { SEED_QUESTIONS } from "@/data/questions";
import { llmHeaders } from "@/lib/userKey";

export type SpacedReviewStatus =
  | { state: "loading" }
  | { state: "empty" }
  | { state: "ready"; questions: Question[]; dueItems: DueItem[] }
  | { state: "error"; message: string };

// Resolves a DueItem list into full Question objects.
// Strategy:
//   1. Match by questionId in the seed bank (cheap, no network).
//   2. For any items whose questionId is not in the seed bank (LLM-generated
//      ids that are no longer in memory), fall back to generating one fresh
//      question per unique topic so the session is never empty.
//   3. De-duplicate topics so we don't fire N identical generate calls.
async function resolveQuestions(due: DueItem[]): Promise<Question[]> {
  const seedById = new Map<string, Question>(SEED_QUESTIONS.map((q) => [q.id, q]));

  const resolved: Question[] = [];
  const missingByTopic = new Map<Topic, DueItem[]>();

  for (const item of due) {
    const seed = seedById.get(item.questionId);
    if (seed) {
      resolved.push(seed);
    } else if (item.topic) {
      const bucket = missingByTopic.get(item.topic) ?? [];
      bucket.push(item);
      missingByTopic.set(item.topic, bucket);
    }
    // items with no topic (abstract/essay) are skipped — not generatable in-app
  }

  // Generate one question per missing topic (keep the session short & relevant).
  const generatePromises = [...missingByTopic.entries()].map(
    async ([topic, items]) => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: llmHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ topic, count: Math.min(items.length, 5), harden: false }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.questions ?? []) as Question[];
      } catch {
        return [] as Question[];
      }
    },
  );

  const generated = await Promise.all(generatePromises);
  for (const qs of generated) resolved.push(...qs);

  return resolved;
}

export function useSpacedReview(): SpacedReviewStatus {
  const [status, setStatus] = useState<SpacedReviewStatus>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const repo = getProgressRepo();
        const due = await repo.getDueForReview();
        if (due.length === 0) {
          if (!cancelled) setStatus({ state: "empty" });
          return;
        }
        const questions = await resolveQuestions(due);
        if (questions.length === 0) {
          if (!cancelled) setStatus({ state: "empty" });
          return;
        }
        if (!cancelled) setStatus({ state: "ready", questions, dueItems: due });
      } catch (err) {
        if (!cancelled)
          setStatus({
            state: "error",
            message: err instanceof Error ? err.message : "Failed to load review items",
          });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
