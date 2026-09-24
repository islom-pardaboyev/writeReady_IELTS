import { useEffect, useRef, useState } from "react";
import { ChevronDown, FlaskConical, RotateCcw, TriangleAlert, X } from "lucide-react";
import { ModalCard, ModalDescription, ModalTitle } from "@/components/ui/ModalCard";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/firebase/firebase";
import { loadTask1Chart, type ChartPrompt } from "@/lib/task1Chart";
import { requestScoreTest, type ScoreTestResult, type TestTaskType } from "@/lib/scoreTest";
import { writingBand, type Criterion } from "@shared/bandScore";

export interface ScoreTestTask {
  taskType: TestTaskType;
  question: string;
  essay: string;
  /** Task 1: the stored prompt's chart (by id), or an image the student uploaded. */
  chart?: ChartPrompt & { image?: string };
}

type TaskState =
  | { status: "loading" }
  | { status: "done"; result: ScoreTestResult }
  | { status: "error"; message: string };

function criteriaFor(taskType: TestTaskType): [Criterion, string][] {
  return [
    ["taskAchievement", taskType === "Task 1" ? "Task Achievement" : "Task Response"],
    ["coherenceCohesion", "Coherence and Cohesion"],
    ["lexicalResource", "Lexical Resource"],
    ["grammaticalRangeAccuracy", "Grammatical Range and Accuracy"],
  ];
}

/**
 * "Test scores" in a writing mode's top bar, shown only while the admin's
 * score test is on for this account. It opens ScoreTestDialog straight away,
 * with no PDF first, so checking many sample essays is quick. Amber, like the
 * test's "On" state in the admin panel, so it never passes for a student
 * control. Icon only on phones, where the bar is full.
 */
export function ScoreTestButton({
  onClick,
  disabled,
  className = "",
}: {
  onClick: () => void;
  disabled: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Test scores"
      title={disabled ? "Write your answer first" : "Test scores: band scores only, nothing saved"}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 p-1.5 text-xs font-medium text-amber-800 transition-colors hover:border-amber-400 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 sm:px-2.5 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:border-amber-700 dark:hover:bg-amber-950/70 ${className}`}
    >
      <FlaskConical size={15} aria-hidden="true" />
      <span className="hidden sm:inline">Test scores</span>
    </button>
  );
}

/**
 * The admin's score test (src/lib/scoreTest.ts): marks the essays with the
 * same score-only prompt a free report uses and shows the bands, nothing
 * else. Opens over the writing page, so the essay stays where it was.
 */
export function ScoreTestDialog({
  open,
  onClose,
  tasks,
}: {
  open: boolean;
  onClose: () => void;
  tasks: ScoreTestTask[];
}) {
  const { user } = useAuth();
  // The essays as they were when the test started, so "Test again" marks the
  // same text.
  const [snapshot, setSnapshot] = useState<ScoreTestTask[]>([]);
  const [states, setStates] = useState<TaskState[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  // Which task cards show the examiner's reasons, by position.
  const [reasonsOpen, setReasonsOpen] = useState<Set<number>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const loading = states.some((s) => s.status === "loading");

  const start = async (list: ScoreTestTask[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStates(list.map(() => ({ status: "loading" })));
    setReasonsOpen(new Set());
    setStartedAt(Date.now());
    setNow(Date.now());

    const fail = (i: number, message: string) =>
      setStates((p) => p.map((s, j) => (j === i ? { status: "error", message } : s)));

    let idToken: string;
    try {
      if (!user) throw new Error();
      idToken = await user.getIdToken();
    } catch {
      if (!controller.signal.aborted) list.forEach((_, i) => fail(i, "Please sign in again."));
      return;
    }

    await Promise.all(
      list.map(async (t, i) => {
        try {
          const chartImage =
            t.taskType === "Task 1" && t.chart ? (await loadTask1Chart(db, t.chart)) || t.chart.image || "" : "";
          const result = await requestScoreTest({
            idToken,
            taskType: t.taskType,
            essayText: t.essay,
            questionText: t.question,
            chartImage,
            signal: controller.signal,
          });
          if (!controller.signal.aborted) setStates((p) => p.map((s, j) => (j === i ? { status: "done", result } : s)));
        } catch (e) {
          if (controller.signal.aborted) return;
          fail(i, e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");
        }
      }),
    );
  };

  // Starts when the dialog opens; closing it cancels a marking still running.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      return;
    }
    setSnapshot(tasks);
    void start(tasks);
    // Only opening starts a test. `tasks` is rebuilt on every render of the
    // writing page, and `start` with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Seconds so far, while marking. A clock on the screen, not a request.
  useEffect(() => {
    if (!open || !loading) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open, loading]);

  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));
  const done = states.map((s) => (s.status === "done" ? s.result : null));
  const t1 = snapshot.findIndex((t) => t.taskType === "Task 1");
  const t2 = snapshot.findIndex((t) => t.taskType === "Task 2");
  const combined =
    t1 !== -1 && t2 !== -1 && done[t1] && done[t2] ? writingBand(done[t1]!.scores.overall, done[t2]!.scores.overall) : null;

  return (
    <ModalCard open={open} onClose={onClose}>
      {/* On a short screen the scores scroll; the title and the buttons stay in view. */}
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)]">
              <FlaskConical size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <ModalTitle className="text-base font-semibold text-[var(--text-primary)]">
                Score test
              </ModalTitle>
              <ModalDescription className="mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                Scores only. Nothing is saved and no report is used.
              </ModalDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-1" aria-busy={loading}>
          {snapshot.map((task, i) => {
            const state = states[i] ?? { status: "loading" };
            return (
              <section
                key={task.taskType}
                aria-label={task.taskType}
                className="rounded-xl border border-[var(--border-color)] px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">{task.taskType}</h3>
                  {state.status === "done" && (
                    <p className="flex items-baseline gap-2">
                      <span className="text-xs text-[var(--text-secondary)]">Overall</span>
                      <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                        {state.result.scores.overall.toFixed(1)}
                      </span>
                    </p>
                  )}
                  {state.status === "loading" && (
                    <span className="text-xs tabular-nums text-[var(--text-secondary)]">Marking… {seconds} s</span>
                  )}
                </div>

                {state.status === "loading" && (
                  <div className="mt-3 flex flex-col gap-2.5" aria-hidden="true">
                    {[0, 1, 2, 3].map((k) => (
                      <div key={k} className="flex items-center justify-between gap-4">
                        <span className="h-3 w-40 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none dark:bg-white/[0.06]" />
                        <span className="h-3 w-7 animate-pulse rounded bg-[var(--bg-subtle)] motion-reduce:animate-none dark:bg-white/[0.06]" />
                      </div>
                    ))}
                  </div>
                )}

                {state.status === "done" && (
                  <>
                    <dl className="mt-2.5 flex flex-col">
                      {criteriaFor(task.taskType).map(([key, label]) => {
                        const reason = reasonsOpen.has(i) ? state.result.reasons[key] : undefined;
                        return (
                          <div
                            key={key}
                            className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-t border-[var(--border-color)] py-1.5 first:border-t-0"
                          >
                            <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
                            <dd className="font-mono text-sm font-medium tabular-nums text-[var(--text-primary)]">
                              {state.result.scores[key].toFixed(1)}
                            </dd>
                            {reason && (
                              <dd className="col-span-2 mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{reason}</dd>
                            )}
                          </div>
                        );
                      })}
                    </dl>
                    {Object.keys(state.result.reasons).length > 0 && (
                      <button
                        type="button"
                        aria-expanded={reasonsOpen.has(i)}
                        onClick={() =>
                          setReasonsOpen((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                        className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-[var(--ink-blue)] hover:underline"
                      >
                        <ChevronDown
                          aria-hidden="true"
                          className={`size-3.5 transition-transform duration-150 motion-reduce:transition-none ${reasonsOpen.has(i) ? "rotate-180" : ""}`}
                        />
                        {reasonsOpen.has(i) ? "Hide reasons" : "Why these scores?"}
                      </button>
                    )}
                    {state.result.chart === "missing" && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                        <TriangleAlert size={14} aria-hidden="true" className="mt-px shrink-0" />
                        Marked without the chart, because it could not be loaded.
                      </p>
                    )}
                  </>
                )}

                {state.status === "error" && (
                  <p role="alert" className="mt-2 text-sm leading-relaxed text-red-600 dark:text-red-400">
                    {state.message}
                  </p>
                )}
              </section>
            );
          })}

          {combined && (
            <div className="flex items-baseline justify-between gap-4 rounded-xl bg-[var(--bg-subtle)] px-4 py-3 dark:bg-white/[0.04]">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Writing band</p>
                <p className="text-xs text-[var(--text-secondary)]">Task 2 counts twice as much as Task 1</p>
              </div>
              <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
                {combined.band.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {!loading && states.length > 0 ? "Score test finished." : ""}
        </p>

        <div className="mt-5 flex shrink-0 flex-col-reverse gap-2.5 border-t border-[var(--border-color)] px-6 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void start(snapshot)} disabled={loading || snapshot.length === 0}>
            <RotateCcw aria-hidden="true" />
            Test again
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </ModalCard>
  );
}
