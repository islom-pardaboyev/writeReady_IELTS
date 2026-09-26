import {
  useState,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { useStopwatch } from "@/hooks/useStopwatch";
import { auth, db } from "@/firebase/firebase";
import { doc, getDoc } from "firebase/firestore";
import { loadPrompts } from "@/lib/promptCache";
import { downloadEssayPdf } from "@/lib/essayPdf";
import { useSingleRun } from "@/hooks/useSingleRun";
import { BusyLabel } from "@/components/ui/BusyLabel";
import { LogoLoader } from "@/components/ui/LogoLoader";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { NavLink, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useUnsavedWork } from "@/hooks/useUnsavedWork";
import { useDraft } from "@/hooks/useDraft";
import { DraftRestoredNotice } from "@/components/ui/DraftRestoredNotice";
import { effectivePlan } from "@/lib/plans";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import { encodeReport } from "@/lib/reportEncoding";
import { CheckIcon, ClockIcon, Bot, GraduationCap, FlaskConical } from "lucide-react";
import { ModeBrand } from "@/components/writing/ModeBrand";
import { useHumanCheck } from "@/hooks/useHumanCheck";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TeacherPickerModal } from "@/components/ui/TeacherPickerModal";
import { ModalCard, ModalTitle, ModalDescription } from "@/components/ui/ModalCard";
import { HumanCheckConfirmModal } from "@/components/ui/HumanCheckConfirmModal";
import { FullscreenButton } from "@/components/ui/FullscreenButton";
import { WritingSettingsButton } from "@/components/appearance/WritingSettingsButton";
import { ScoreTestButton, ScoreTestDialog, type ScoreTestTask } from "@/components/writing/ScoreTestDialog";
import { useScoreTest } from "@/lib/scoreTest";
import { answerTextStyle, useWritingSettings } from "@/lib/writingSettings";
import { ShuffleBag } from "@/lib/shuffleBag";
import { useTask1Chart } from "@/lib/task1Chart";

interface Task1 {
  id: string;
  report: string;
}
interface Task2 {
  report: string;
}

function hasAccess(data: Record<string, unknown>): boolean {
  // AI feedback for exercises requires an active paid plan — no free weekly
  // report or bonus credits here (those still work in the other modes). A
  // learning-center student holds their center's plan until its contract ends.
  return effectivePlan(data) !== "free";
}

function Practice() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  const { busy: finishing, run: runFinish } = useSingleRun();
  const [activeTask, setActiveTask] = useState<1 | 2>(1);
  const [userText1, setUserText1] = useState("");
  const [userText2, setUserText2] = useState("");
  const [task1List, setTask1List] = useState<Task1[]>([]);
  const [task2List, setTask2List] = useState<Task2[]>([]);
  const [task1, setTask1] = useState<Task1 | null>(null);
  const [task2, setTask2] = useState<Task2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const humanCheck = useHumanCheck("practice");
  const humanCheckEnabled = useFeatureFlag("humanCheck");
  const writing = useWritingSettings();
  // Admin -> Settings -> Score test: a scores-only check for the chosen account.
  const scoreTest = useScoreTest();
  const [scoreTestOpen, setScoreTestOpen] = useState(false);
  const scoreTestTasks: ScoreTestTask[] = [
    ...(task1 && userText1.trim() ? [{ taskType: "Task 1" as const, question: task1.report, essay: userText1, chart: task1 }] : []),
    ...(task2 && userText2.trim() ? [{ taskType: "Task 2" as const, question: task2.report, essay: userText2 }] : []),
  ];

  const [splitRatio, setSplitRatio] = useState(0.46);
  const confirmLeave = useUnsavedWork(
    (userText1.trim().length > 0 || userText2.trim().length > 0) && !checkingAccess,
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const elapsed = useStopwatch(timerRunning);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);
  const task1BagRef = useRef(new ShuffleBag<Task1>());
  const task2BagRef = useRef(new ShuffleBag<Task2>());
  // Charts live in their own Firestore documents, so only the one on screen is
  // fetched — the shuffle bag holds prompts, not pictures.
  const task1Chart = useTask1Chart(db, task1);

  useEffect(() => {
    if (!user) return;
    const fetchTasks = async () => {
      setLoading(true);
      try {
        // Saved in the browser between visits; see src/lib/promptCache.ts.
        const { task1: t1Docs, task2: t2Docs } = await loadPrompts(db);
        setTask1List(t1Docs);
        task1BagRef.current.setItems(t1Docs);
        setTask1(task1BagRef.current.next());

        setTask2List(t2Docs);
        task2BagRef.current.setItems(t2Docs);
        setTask2(task2BagRef.current.next());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [user]);

  // Start the timer as soon as the writing screen is shown, not on first keystroke
  useEffect(() => {
    if (!loading) setTimerRunning(true);
  }, [loading]);

  // The essays as they stand, kept in this browser, so a page the browser
  // reloads (a laptop waking from sleep) opens with them (src/hooks/useDraft.ts).
  const draftValue = useMemo(
    () => ({ task1, task2, userText1, userText2, activeTask }),
    [task1, task2, userText1, userText2, activeTask],
  );
  const draft = useDraft({
    page: "practice",
    uid: user?.uid,
    value: draftValue,
    ready: Boolean(user) && !loading,
    isEmpty: (d) => !d.userText1?.trim() && !d.userText2?.trim(),
    restore: (d) => {
      if (typeof d.task1?.report === "string") setTask1(d.task1);
      if (typeof d.task2?.report === "string") setTask2(d.task2);
      setUserText1(typeof d.userText1 === "string" ? d.userText1 : "");
      setUserText2(typeof d.userText2 === "string" ? d.userText2 : "");
      setActiveTask(d.activeTask === 2 ? 2 : 1);
    },
  });

  const startOver = () => {
    draft.clear();
    setUserText1("");
    setUserText2("");
    setActiveTask(1);
    if (task1List.length) setTask1(task1BagRef.current.next());
    if (task2List.length) setTask2(task2BagRef.current.next());
  };

  const activeText = activeTask === 1 ? userText1 : userText2;

  // Practice has two tasks, and one report marks one essay. If only one was
  // written, say so before the report is spent: an empty task cannot be
  // marked, and there is no timer here, so writing it is still an option.
  // Null when both are written, or when neither is.
  const emptyTask: 1 | 2 | null =
    userText1.trim() && !userText2.trim() ? 2 : !userText1.trim() && userText2.trim() ? 1 : null;
  const writtenTask: 1 | 2 = emptyTask === 1 ? 2 : 1;
  const wordCount =
    activeText.trim() === "" ? 0 : activeText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;

  const meetsMinWords =
    (activeTask === 1 &&
      userText1.trim().split(/\s+/).filter(Boolean).length >= 150) ||
    (activeTask === 2 &&
      userText2.trim().split(/\s+/).filter(Boolean).length >= 250);

  const taskProgress1 = Math.min(
    100,
    Math.round(
      (userText1.trim().split(/\s+/).filter(Boolean).length / 150) * 100,
    ),
  );
  const taskProgress2 = Math.min(
    100,
    Math.round(
      (userText2.trim().split(/\s+/).filter(Boolean).length / 250) * 100,
    ),
  );
  const currentProgress = activeTask === 1 ? taskProgress1 : taskProgress2;

  const handleGetAnother = () => {
    if (activeTask === 1) {
      if (task1List.length === 0) return;
      setUserText1("");
      setTask1(task1BagRef.current.next());
      return;
    }
    if (task2List.length === 0) return;
    setUserText2("");
    setTask2(task2BagRef.current.next());
  };

  const handleSplitPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleSplitPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    setSplitRatio(
      Math.min(0.72, Math.max(0.28, (e.clientX - rect.left) / rect.width)),
    );
  };
  const handleSplitPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleDownloadPDF = () => {
    return runFinish(async () => {
      await downloadEssayPdf({
        mode: "Practice Mode",
        fileName: "WriteReady_Practice.pdf",
        tasks: [
          { taskNum: 1, question: task1?.report, imageSrc: task1Chart, answer: userText1 },
          { taskNum: 2, question: task2?.report, answer: userText2 },
        ],
      });
      setShowFeedbackModal(true);
    });
  };

  const handleAcceptFeedback = async () => {
    setCheckingAccess(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        navigate("/auth");
        return;
      }
      const snap = await getDoc(doc(db, "users", user.uid));
      if (
        !snap.exists() ||
        !hasAccess(snap.data() as Record<string, unknown>)
      ) {
        navigate("/pricing");
        return;
      }
      // The essay goes with the report from here, and is saved there.
      draft.clear();
      navigate(
        `/feedback/${encodeReport({ task1, task2, userText1, userText2 })}`,
      );
    } catch (err) {
      console.error(err);
      navigate("/auth");
    } finally {
      setCheckingAccess(false);
      setShowFeedbackModal(false);
    }
  };

  const handleHumanCheck = () => {
    setShowFeedbackModal(false);
    humanCheck.requestHumanCheck({
      task1: task1 && userText1.trim() ? { questionText: task1.report, essayText: userText1, imagePromptId: task1.id } : undefined,
      task2: task2 && userText2.trim() ? { questionText: task2.report, essayText: userText2 } : undefined,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <LogoLoader label="Preparing your practice session" />
          <p className="text-sm text-slate-500 dark:text-neutral-400 tracking-wide">
            Preparing your practice session…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans"
    >
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white text-slate-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
        <div className="flex items-center justify-between gap-2 px-5 py-2.5 sm:gap-4">
          <ModeBrand label="Practice Mode" confirmLeave={confirmLeave} />

          {/* Centre: timer */}
          <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-300">
            <ClockIcon aria-hidden="true" className="hidden w-3.5 h-3.5 sm:block" />
            <span className="text-sm font-mono font-semibold tabular-nums">
              {elapsed}
            </span>
          </div>

          <div id="right-actions" className="flex items-center gap-2">
            {scoreTest && (
              <ScoreTestButton onClick={() => setScoreTestOpen(true)} disabled={scoreTestTasks.length === 0} />
            )}
            <WritingSettingsButton className="inline-flex items-center justify-center p-1.5 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-md transition-colors" />
            <FullscreenButton className="inline-flex items-center justify-center p-1.5 text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-md transition-colors" />
            <button
              onClick={() => setShowHeader((p) => !p)}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-md transition-colors"
            >
              {showHeader ? "Hide panel" : "Show panel"}
            </button>
            <button
              onClick={handleGetAnother}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-md transition-colors"
            >
              New question
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={finishing}
              aria-busy={finishing}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-4 py-1.5 text-xs font-semibold text-white bg-brand-blue-600 hover:bg-brand-blue-500 rounded-md transition-colors disabled:opacity-60"
            >
              <BusyLabel busy={finishing} busyText="Saving PDF…">Save PDF</BusyLabel>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-slate-100 dark:bg-neutral-800">
          <div
            className="h-full bg-brand-blue-600 transition-[width] duration-500"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* ── Collapsible secondary header ── */}
      {showHeader && (
        <div className="sticky top-[45px] z-20 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-1">
              {([1, 2] as const).map((t) => {
                const done =
                  t === 1 ? taskProgress1 >= 100 : taskProgress2 >= 100;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTask(t)}
                    className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-[color,background-color,box-shadow] ${
                      activeTask === t
                        ? "bg-brand-blue-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800"
                    }`}
                  >
                    Task {t}
                    {done && (
                      <span
                        className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${activeTask === t ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"}`}
                      >
                        <CheckIcon aria-hidden="true" className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <nav className="hidden md:flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400">
              <NavLink onClick={confirmLeave}
                to="/"
                className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                Home
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/mock"
                className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                Mock Test
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/quick"
                className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                Quick Write
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/relax"
                className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors"
              >
                Relax
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 dark:bg-neutral-950 border-t border-slate-100 dark:border-neutral-800">
            <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-blue-600 text-white text-[10px] font-bold">
              {activeTask}
            </span>
            <p className="text-xs text-slate-600 dark:text-neutral-300">
              Spend about{" "}
              <strong>{activeTask === 1 ? "20" : "40"} minutes</strong> on this
              task. Write at least <strong>{minWords} words</strong>.
            </p>
          </div>
        </div>
      )}

      {!showHeader && (
        <div className="flex items-center gap-3 px-5 py-2 bg-slate-50 dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex gap-1">
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTask(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTask === t ? "bg-brand-blue-600 text-white" : "text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-800"}`}
              >
                Task {t}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400 dark:text-neutral-400">
            {minWords} words minimum
          </span>
        </div>
      )}

      {/* ── Split panel ── */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        <div className="w-full overflow-y-auto bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {activeTask === 1 && task1 ? (
              <WritingTask1Preview task1={{ image: task1Chart, report: task1.report }} />
            ) : activeTask === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-slate-400 dark:text-neutral-400">
                No question available yet.
              </p>
            )}
          </div>
        </div>

        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize question and answer panels"
          aria-valuenow={Math.round(splitRatio * 100)}
          aria-valuemin={28}
          aria-valuemax={72}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              setSplitRatio((r) => Math.max(0.28, r - 0.02));
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              setSplitRatio((r) => Math.min(0.72, r + 0.02));
            }
          }}
          className="relative hidden w-1.5 shrink-0 cursor-col-resize select-none touch-none bg-slate-100 dark:bg-neutral-800 hover:bg-brand-blue-200 dark:hover:bg-brand-blue-900 active:bg-brand-blue-300 dark:active:bg-brand-blue-800 transition-colors md:flex items-center justify-center group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500"
        >
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-1 h-1 rounded-full bg-brand-blue-400" />
            <span className="w-1 h-1 rounded-full bg-brand-blue-400" />
            <span className="w-1 h-1 rounded-full bg-brand-blue-400" />
          </div>
        </div>

        <div className="flex flex-col flex-1 bg-slate-50 dark:bg-neutral-950">
          <label htmlFor={`answer-task-${activeTask}`} className="sr-only">
            Your answer for Task {activeTask}
          </label>
          <textarea
            id={`answer-task-${activeTask}`}
            name="essay"
            value={activeTask === 1 ? userText1 : userText2}
            onChange={(e) => {
              if (activeTask === 1) {
                setUserText1(e.target.value);
              } else {
                setUserText2(e.target.value);
              }
            }}
            placeholder="Start writing your response here…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            style={answerTextStyle(writing)}
            className="flex-1 w-full p-6 text-slate-800 dark:text-neutral-200 caret-[var(--ink-blue)] bg-white dark:bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500 focus-visible:ring-inset resize-none placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-neutral-900 transition-colors duration-200 min-h-[300px] [scrollbar-gutter:stable]"
          />

          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-brand-blue-400"}`}
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <span
                className={`text-xs font-medium ${meetsMinWords ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-neutral-400"}`}
              >
                {wordCount} / {minWords} words
                {meetsMinWords && <span className="ml-1.5">✓</span>}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGetAnother}
                className="text-xs text-slate-400 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
              >
                New question
              </button>
              <span className="text-slate-200 dark:text-neutral-700">|</span>
              <button
                onClick={handleDownloadPDF}
                disabled={finishing}
                aria-busy={finishing}
                className="text-xs font-medium text-brand-blue-600 dark:text-brand-blue-400 hover:text-brand-blue-800 dark:hover:text-brand-blue-300 transition-colors disabled:opacity-60"
              >
                <BusyLabel busy={finishing} busyText="Saving PDF…">Save PDF</BusyLabel>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback modal ── */}
      <ModalCard open={showFeedbackModal} onClose={() => { if (!checkingAccess) setShowFeedbackModal(false); }}>
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-linear-to-r from-brand-blue-500 to-brand-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-brand-blue-50 dark:bg-brand-blue-950/40">
                <CheckIcon aria-hidden="true" className="w-5 h-5 text-brand-blue-600 dark:text-brand-blue-400" />
              </div>
              <ModalTitle className="mt-4 text-base font-semibold text-center text-slate-900 dark:text-neutral-100">
                Session saved
              </ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-center text-slate-500 dark:text-neutral-400">
                {emptyTask ? (
                  <>
                    You left <strong className="text-slate-700 dark:text-neutral-200">Task {emptyTask}</strong> empty,
                    so the report can only mark Task {writtenTask}. It costs one report either way, and there is no
                    timer here.
                  </>
                ) : (
                  <>
                    AI feedback marks your writing for grammar, vocabulary, coherence and task
                    achievement.
                  </>
                )}
              </ModalDescription>
              <div className="flex flex-col gap-2.5 mt-6">
                {emptyTask && (
                  <Button
                    onClick={() => { setShowFeedbackModal(false); setActiveTask(emptyTask); }}
                    disabled={checkingAccess}
                    className="w-full bg-brand-blue-600 hover:bg-brand-blue-700 text-white"
                  >
                    Write Task {emptyTask} first
                  </Button>
                )}
                <Button
                  onClick={handleAcceptFeedback}
                  disabled={checkingAccess}
                  variant={emptyTask ? "outline" : undefined}
                  className={emptyTask ? "w-full" : "w-full bg-brand-blue-600 hover:bg-brand-blue-700 text-white"}
                >
                  <Bot aria-hidden="true" className="w-4 h-4 mr-1.5" />
                  {checkingAccess
                    ? "Checking…"
                    : emptyTask
                      ? `Get feedback for Task ${writtenTask} only`
                      : "Get AI feedback"}
                </Button>
                {scoreTest && scoreTestTasks.length > 0 && (
                  <Button
                    onClick={() => { setShowFeedbackModal(false); setScoreTestOpen(true); }}
                    disabled={checkingAccess}
                    variant="outline"
                    className="w-full"
                  >
                    <FlaskConical aria-hidden="true" className="w-4 h-4 mr-1.5" />
                    Scores only (test)
                  </Button>
                )}
                {humanCheckEnabled && (
                  <Button
                    onClick={handleHumanCheck}
                    variant="outline"
                    className="w-full"
                  >
                    <GraduationCap aria-hidden="true" className="w-4 h-4 mr-1.5" />
                    Human Check
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setShowFeedbackModal(false)}
                  disabled={checkingAccess}
                  className="w-full"
                >
                  No thanks
                </Button>
              </div>
            </div>
          </div>
        </ModalCard>

      <ScoreTestDialog open={scoreTestOpen} onClose={() => setScoreTestOpen(false)} tasks={scoreTestTasks} />

      <HumanCheckConfirmModal
        open={humanCheck.showCostConfirm}
        priceLoading={humanCheck.priceLoading}
        price={humanCheck.price}
        balance={humanCheck.balance}
        canAfford={humanCheck.canAfford}
        onCancel={humanCheck.cancelCostConfirm}
        onConfirm={humanCheck.confirmCost}
      />

      <TeacherPickerModal
        open={humanCheck.showPicker}
        onClose={humanCheck.closePicker}
        onSelect={humanCheck.handleSelectTeacher}
        submitting={humanCheck.submitting}
      />

      <ModalCard open={humanCheck.success} onClose={() => humanCheck.setSuccess(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-linear-to-r from-emerald-500 to-teal-500" />
            <div className="p-7 text-center">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/40">
                <CheckIcon aria-hidden="true" className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <ModalTitle className="mt-4 text-base font-semibold text-slate-900 dark:text-neutral-100">Sent for human review</ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-slate-500 dark:text-neutral-400">
                You'll get a notification once your teacher has reviewed your essay.
              </ModalDescription>
              <Button onClick={() => humanCheck.setSuccess(false)} className="w-full mt-6 bg-brand-blue-600 hover:bg-brand-blue-700 text-white">
                Done
              </Button>
            </div>
          </div>
        </ModalCard>

      {humanCheck.error && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg"
        >
          {humanCheck.error}
        </div>
      )}
      <DraftRestoredNotice savedAt={draft.restoredAt} onStartOver={startOver} onDismiss={draft.dismiss} />
    </div>
  );
}

export default Practice;
