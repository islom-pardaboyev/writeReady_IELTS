import {
  useState,
  useEffect,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { auth, db } from "@/firebase/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { downloadEssayPdf } from "@/lib/essayPdf";
import { useSingleRun } from "@/hooks/useSingleRun";
import { BusyLabel } from "@/components/ui/BusyLabel";
import { LogoLoader } from "@/components/ui/LogoLoader";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { NavLink, useNavigate } from "react-router";
import { useAuth } from "@/hooks/useAuth";
import { useUnsavedWork } from "@/hooks/useUnsavedWork";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import { encodeReport } from "@/lib/reportEncoding";
import { CheckIcon, ChevronRightIcon, ClockIcon, ZapIcon, Bot, GraduationCap } from "lucide-react";
import { ModeBrand } from "@/components/writing/ModeBrand";
import { useStopwatch } from "@/hooks/useStopwatch";
import { useHumanCheck } from "@/hooks/useHumanCheck";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TeacherPickerModal } from "@/components/ui/TeacherPickerModal";
import { ModalCard, ModalTitle, ModalDescription } from "@/components/ui/ModalCard";
import { HumanCheckConfirmModal } from "@/components/ui/HumanCheckConfirmModal";
import { FullscreenButton } from "@/components/ui/FullscreenButton";
import { ShuffleBag } from "@/lib/shuffleBag";
import { useTask1Chart } from "@/lib/task1Chart";
import { hasAccess } from "@/lib/reportAccess";

interface Task1 {
  id: string;
  report: string;
}
interface Task2 {
  report: string;
}

function Quick() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  const { busy: finishing, run: runFinish } = useSingleRun();

  // Task selection (null = not chosen yet)
  const [selectedTaskType, setSelectedTaskType] = useState<1 | 2 | null>(null);
  const [userText, setUserText] = useState("");
  const [task1, setTask1] = useState<Task1 | null>(null);
  const [task2, setTask2] = useState<Task2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const humanCheck = useHumanCheck("quick");
  const humanCheckEnabled = useFeatureFlag("humanCheck");

  const [splitRatio, setSplitRatio] = useState(0.46);
  const confirmLeave = useUnsavedWork(
    userText.trim().length > 0 && !checkingAccess,
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

  const minWords = selectedTaskType === 1 ? 150 : 250;
  const wordCount = userText.trim() === "" ? 0 : userText.trim().split(/\s+/).length;
  const meetsMinWords = wordCount >= minWords;
  const progress = Math.min(100, Math.round((wordCount / minWords) * 100));

  // Load both task lists on mount
  useEffect(() => {
    if (!user) return;
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const [t1Snap, t2Snap] = await Promise.all([
          getDocs(collection(db, "task1_reports")),
          getDocs(collection(db, "task2_reports")),
        ]);
        const t1Docs = t1Snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task1, "id">) }));
        const t2Docs = t2Snap.docs.map((d) => d.data() as Task2);
        task1BagRef.current.setItems(t1Docs);
        task2BagRef.current.setItems(t2Docs);
        setTask1(task1BagRef.current.next());
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
    if (selectedTaskType !== null) setTimerRunning(true);
  }, [selectedTaskType]);

  const handleGetAnother = () => {
    setUserText("");
    if (selectedTaskType === 1) setTask1(task1BagRef.current.next());
    else if (selectedTaskType === 2) setTask2(task2BagRef.current.next());
  };

  const handleSplitPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleSplitPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setSplitRatio(Math.min(0.72, Math.max(0.28, ratio)));
  };
  const handleSplitPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleFinish = () => {
    if (selectedTaskType === null) return;
    return runFinish(async () => {
      await downloadEssayPdf({
        mode: "Quick Write",
        fileName: `WriteReady_Quick_Task${selectedTaskType}.pdf`,
        tasks: [
          {
            taskNum: selectedTaskType,
            question: selectedTaskType === 1 ? task1?.report : task2?.report,
            imageSrc: selectedTaskType === 1 ? task1Chart : null,
            answer: userText,
          },
        ],
      });
      setShowFeedbackModal(true);
    });
  };

  const handleAcceptFeedback = async () => {
    if (!selectedTaskType) return;
    setCheckingAccess(true);
    try {
      const user = auth.currentUser;
      if (!user) { navigate("/auth"); return; }

      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists() || !hasAccess(snap.data() as Record<string, unknown>)) {
        navigate("/pricing"); return;
      }

      const encoded = encodeReport(
        selectedTaskType === 1
          ? { task1, task2: null, userText1: userText, userText2: "" }
          : { task1: null, task2, userText1: "", userText2: userText }
      );
      navigate(`/feedback/${encoded}`);
    } catch (err) {
      console.error(err);
      navigate("/auth");
    } finally {
      setCheckingAccess(false);
      setShowFeedbackModal(false);
    }
  };

  const handleHumanCheck = () => {
    if (!selectedTaskType) return;
    setShowFeedbackModal(false);
    humanCheck.requestHumanCheck(
      selectedTaskType === 1
        ? { task1: task1 && userText.trim() ? { questionText: task1.report, essayText: userText, imagePromptId: task1.id } : undefined }
        : { task2: task2 && userText.trim() ? { questionText: task2.report, essayText: userText } : undefined },
    );
  };

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          <LogoLoader label="Loading questions" />
          <p className="text-sm text-slate-500 dark:text-neutral-400 tracking-wide">Loading questions…</p>
        </div>
      </div>
    );
  }

  /* ── Task picker screen ── */
  if (selectedTaskType === null) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600 mb-4">
              <ZapIcon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100 mb-2">Quick Write</h1>
            <p className="text-slate-500 dark:text-neutral-400 text-base">
              Choose a task, write your response, then get AI feedback.
            </p>
          </div>

          {/* Task cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Task 1 */}
            <button
              onClick={() => setSelectedTaskType(1)}
              className="group relative rounded-2xl border-2 border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-left hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
            >
              <div className="text-3xl mb-3">🖼️</div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100 mb-1">Task 1</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
                Describe a graph, chart, diagram or map. Minimum <strong>150 words</strong>.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                Start Task 1 <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Task 2 */}
            <button
              onClick={() => setSelectedTaskType(2)}
              className="group relative rounded-2xl border-2 border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-left hover:border-violet-400 dark:hover:border-violet-500 hover:shadow-lg transition-[border-color,box-shadow] duration-200 cursor-pointer"
            >
              <div className="text-3xl mb-3">✍️</div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-neutral-100 mb-1">Task 2</h2>
              <p className="text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
                Respond to an argument or opinion question. Minimum <strong>250 words</strong>.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                Start Task 2 <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>

          {/* Nav links */}
          <div className="flex justify-center gap-4 text-sm text-slate-500 dark:text-neutral-400">
            <NavLink onClick={confirmLeave} to="/writing/mock" className="hover:text-slate-900 dark:hover:text-neutral-100 transition-colors">Mock Exam</NavLink>
            <span>·</span>
            <NavLink onClick={confirmLeave} to="/writing/practice" className="hover:text-slate-900 dark:hover:text-neutral-100 transition-colors">Practice</NavLink>
            <span>·</span>
            <NavLink onClick={confirmLeave} to="/writing/relax" className="hover:text-slate-900 dark:hover:text-neutral-100 transition-colors">Relax</NavLink>
            <span>·</span>
            <NavLink onClick={confirmLeave} to="/dashboard" className="hover:text-slate-900 dark:hover:text-neutral-100 transition-colors">Dashboard</NavLink>
          </div>
        </div>
      </div>
    );
  }

  /* ── Writing screen ── */
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white text-slate-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          {/* Left */}
          <ModeBrand
            label="Quick Write"
            sub={`Task ${selectedTaskType}`}
            confirmLeave={confirmLeave}
          />

          {/* Centre: timer */}
          <div className="flex items-center gap-2 text-slate-600 dark:text-neutral-300">
            <ClockIcon aria-hidden="true" className="w-3.5 h-3.5" />
            <span className="text-sm font-mono font-semibold tabular-nums">
              {elapsed}
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
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
              onClick={() => setSelectedTaskType(null)}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-neutral-700 hover:border-slate-300 dark:hover:border-neutral-600 rounded-md transition-colors"
            >
              Change task
            </button>
            <button
              onClick={handleFinish}
              disabled={finishing}
              aria-busy={finishing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 rounded-md transition-colors disabled:opacity-60"
            >
              <BusyLabel busy={finishing} busyText="Saving PDF…">Finish & save PDF</BusyLabel>
            </button>
          </div>
        </div>

        {/* Word count progress stripe */}
        <div className="h-0.5 bg-slate-100 dark:bg-neutral-800">
          <div
            className="h-full bg-violet-600 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Secondary header ── */}
      {showHeader && (
        <div className="sticky top-[45px] z-20 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {selectedTaskType}
              </span>
              <span className="text-sm font-medium text-slate-900 dark:text-neutral-100">Task {selectedTaskType}</span>
              <span className="text-xs text-slate-500 dark:text-neutral-400">— minimum {minWords} words</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 text-xs text-slate-500 dark:text-neutral-400">
              <NavLink onClick={confirmLeave} to="/" className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors">Home</NavLink>
              <NavLink onClick={confirmLeave} to="/writing/mock" className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors">Mock</NavLink>
              <NavLink onClick={confirmLeave} to="/writing/practice" className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors">Practice</NavLink>
              <NavLink onClick={confirmLeave} to="/writing/relax" className="px-2 py-1 hover:text-slate-900 dark:hover:text-neutral-100 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded transition-colors">Relax</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 px-5 py-2 bg-slate-100 dark:bg-neutral-950 border-t border-slate-200 dark:border-neutral-800">
            <p className="text-xs text-slate-500 dark:text-neutral-400">
              {selectedTaskType === 1
                ? "Describe the information in the chart or diagram. Organise, summarise and compare where relevant."
                : "Present your argument clearly. Give your opinion and support it with examples and explanations."}
            </p>
          </div>
        </div>
      )}

      {/* Minimal task bar when header hidden */}
      {!showHeader && (
        <div className="flex items-center gap-3 px-5 py-2 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold">{selectedTaskType}</span>
          <span className="text-xs text-slate-500 dark:text-neutral-400">Task {selectedTaskType} · {minWords} words minimum</span>
        </div>
      )}

      {/* ── Split panel ── */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        {/* Question panel */}
        <div className="w-full overflow-y-auto bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {selectedTaskType === 1 && task1 ? (
              <WritingTask1Preview task1={{ image: task1Chart, report: task1.report }} />
            ) : selectedTaskType === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-neutral-400">No question available.</p>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative hidden w-1.5 shrink-0 cursor-col-resize select-none touch-none bg-slate-100 dark:bg-neutral-800 hover:bg-violet-200 dark:hover:bg-violet-900 active:bg-violet-300 dark:active:bg-violet-800 transition-colors md:flex items-center justify-center group"
        >
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            <span className="w-1 h-1 rounded-full bg-violet-400" />
          </div>
        </div>

        {/* Answer panel */}
        <div className="flex flex-col flex-1 bg-slate-50 dark:bg-neutral-950">
          <label htmlFor="quick-answer" className="sr-only">
            Your answer for Task {selectedTaskType}
          </label>
          <textarea name="quick-answer"
            id="quick-answer"
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            placeholder="Start writing your response here…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            className="flex-1 w-full p-6 text-sm text-slate-900 dark:text-neutral-100 bg-white dark:bg-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-inset resize-none placeholder:text-slate-500/40 dark:placeholder:text-neutral-500 focus:bg-white dark:focus:bg-neutral-900 transition-colors min-h-[300px] [scrollbar-gutter:stable]"
          />

          {/* Status bar */}
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-violet-500"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${meetsMinWords ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-neutral-400"}`}>
                {wordCount} / {minWords} words
                {meetsMinWords && <span className="ml-1.5">✓</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGetAnother}
                className="text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-neutral-100 transition-colors"
              >
                New question
              </button>
              <span className="text-slate-200 dark:text-neutral-700">|</span>
              <button
                onClick={handleFinish}
                disabled={finishing}
                aria-busy={finishing}
                className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-800 dark:hover:text-violet-300 transition-colors disabled:opacity-60"
              >
                <BusyLabel busy={finishing} busyText="Saving PDF…">Finish & save PDF</BusyLabel>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback modal ── */}
      <ModalCard open={showFeedbackModal} onClose={() => { if (!checkingAccess) setShowFeedbackModal(false); }}>
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-linear-to-r from-violet-500 to-purple-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-violet-50">
                <CheckIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              </div>
              <ModalTitle className="mt-4 text-base font-semibold text-center text-slate-900 dark:text-neutral-100">
                Essay saved!
              </ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-center text-slate-500 dark:text-neutral-400">
                Would you like in-depth AI feedback on your writing? We'll analyse grammar, vocabulary, coherence, and task achievement.
              </ModalDescription>
              <div className="flex flex-col gap-2.5 mt-6">
                <Button
                  onClick={handleAcceptFeedback}
                  disabled={checkingAccess}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Bot className="w-4 h-4 mr-1.5" />
                  {checkingAccess ? "Checking…" : "Get AI feedback"}
                </Button>
                {humanCheckEnabled && (
                  <Button
                    onClick={handleHumanCheck}
                    variant="outline"
                    className="w-full"
                  >
                    <GraduationCap className="w-4 h-4 mr-1.5" />
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
                <CheckIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <ModalTitle className="mt-4 text-base font-semibold text-slate-900 dark:text-neutral-100">Sent for human review</ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-slate-500 dark:text-neutral-400">
                You'll get a notification once your teacher has reviewed your essay.
              </ModalDescription>
              <Button onClick={() => humanCheck.setSuccess(false)} className="w-full mt-6 bg-violet-600 hover:bg-violet-700 text-white">
                Done
              </Button>
            </div>
          </div>
        </ModalCard>

      {humanCheck.error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {humanCheck.error}
        </div>
      )}
    </div>
  );
}

export default Quick;
