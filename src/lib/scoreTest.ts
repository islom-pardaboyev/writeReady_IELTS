import { useEffect, useState } from "react";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";
import { db } from "@/firebase/firebase";
import { useAuth } from "@/hooks/useAuth";
import { CRITERIA, normalizeScores, type BandScores, type Criterion } from "@shared/bandScore";

// Admin -> Settings -> Score test: a "Scores only (test)" button in the
// writing modes, for one chosen account, to see how the site grades an essay
// without spending a report or saving anything. Two fields on
// config/featureFlags hold it: `scoreTestMode` (on or off) and `scoreTestUid`
// (the account's user id; an id says nothing about who it is, unlike an
// email, and every signed-in student can read that document).
// api/feedback.ts (runScoreTest) checks both again on every request.

export interface ScoreTestSettings {
  enabled: boolean;
  uid: string | null;
}

export async function getScoreTestSettings(dbInstance: Firestore): Promise<ScoreTestSettings> {
  const snap = await getDoc(doc(dbInstance, "config", "featureFlags"));
  const data = snap.exists() ? snap.data() : {};
  return {
    enabled: data.scoreTestMode === true,
    uid: typeof data.scoreTestUid === "string" && data.scoreTestUid ? data.scoreTestUid : null,
  };
}

export async function saveScoreTestSettings(dbInstance: Firestore, patch: Partial<ScoreTestSettings>): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (patch.enabled !== undefined) fields.scoreTestMode = patch.enabled;
  if (patch.uid !== undefined) fields.scoreTestUid = patch.uid ?? "";
  await setDoc(doc(dbInstance, "config", "featureFlags"), fields, { merge: true });
}

/**
 * Whether this visitor gets the "Scores only (test)" button: the test is on
 * and they are the chosen account. Read once when the page opens.
 */
export function useScoreTest(): boolean {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!uid) {
      setAllowed(false);
      return;
    }
    let cancelled = false;
    getScoreTestSettings(db)
      .then((s) => {
        if (!cancelled) setAllowed(s.enabled && s.uid === uid);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return allowed;
}

export type TestTaskType = "Task 1" | "Task 2";

export interface ScoreTestResult {
  scores: BandScores;
  /** Task 1 only: whether the AI saw the chart. Null for Task 2. */
  chart: "attached" | "missing" | null;
  /** The examiner's short reason for each band, as the AI wrote it. */
  reasons: Partial<Record<Criterion, string>>;
}

/** Marks one essay with the score-only prompt. Throws with a message the page can show. */
export async function requestScoreTest(opts: {
  idToken: string;
  taskType: TestTaskType;
  essayText: string;
  questionText: string;
  chartImage?: string;
  signal?: AbortSignal;
}): Promise<ScoreTestResult> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.idToken}` },
    body: JSON.stringify({
      scoreTest: true,
      taskType: opts.taskType,
      essayText: opts.essayText,
      questionText: opts.questionText,
      chartImage: opts.chartImage || undefined,
    }),
    signal: opts.signal,
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    scores?: unknown;
    chart?: unknown;
    reasons?: Record<string, unknown>;
  } | null;
  if (!res.ok) throw new Error(body?.error ?? `The server answered ${res.status}. Please try again.`);
  // The overall band is worked out here again with the official rounding, as
  // everywhere else on the site, rather than trusted from the reply.
  const scores = normalizeScores(body?.scores);
  if (!scores) throw new Error("The reply had no complete scores. Please try again.");
  const chart = body?.chart === "attached" || body?.chart === "missing" ? body.chart : null;
  const reasons: Partial<Record<Criterion, string>> = {};
  for (const k of CRITERIA) {
    const v = body?.reasons?.[k];
    if (typeof v === "string" && v.trim()) reasons[k] = v.trim();
  }
  return { scores, chart, reasons };
}
