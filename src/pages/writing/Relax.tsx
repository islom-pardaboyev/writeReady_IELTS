import {
  useState,
  useEffect,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { useStopwatch } from "@/hooks/useStopwatch";
import { downloadEssayPdf } from "@/lib/essayPdf";
import { useSingleRun } from "@/hooks/useSingleRun";
import { BusyLabel } from "@/components/ui/BusyLabel";
import { NavLink, useNavigate } from "react-router";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { encodeReport } from "@/lib/reportEncoding";
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  UploadIcon,
  Bot,
  GraduationCap,
  ChevronLeftIcon,
} from "lucide-react";
import { useHumanCheck } from "@/hooks/useHumanCheck";
import { useUnsavedWork } from "@/hooks/useUnsavedWork";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TeacherPickerModal } from "@/components/ui/TeacherPickerModal";
import { ModalCard, ModalTitle, ModalDescription } from "@/components/ui/ModalCard";
import { HumanCheckConfirmModal } from "@/components/ui/HumanCheckConfirmModal";
import { FullscreenButton } from "@/components/ui/FullscreenButton";
import { isPdfSrc as isPdf } from "@/lib/loadImageForPdf";
import { hasAccess } from "@/lib/reportAccess";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function Relax() {
  const navigate = useNavigate();
  const { busy: finishing, run: runFinish } = useSingleRun();
  const [step, setStep] = useState<"select" | "configure" | "write">("select");
  const [activeTask, setActiveTask] = useState<1 | 2 | null>(null);
  const [prompt, setPrompt] = useState("");
  const [task2Prompt, setTask2Prompt] = useState("");
  const [userText, setUserText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const humanCheck = useHumanCheck("relax");
  const humanCheckEnabled = useFeatureFlag("humanCheck");

  const [splitRatio, setSplitRatio] = useState(0.46);
  const confirmLeave = useUnsavedWork(
    userText.trim().length > 0 && !checkingAccess,
  );
  const [timerRunning, setTimerRunning] = useState(false);
  const elapsed = useStopwatch(timerRunning);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  const wordCount =
    userText.trim() === "" ? 0 : userText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;
  const meetsMinWords = wordCount >= minWords;
  const currentProgress = Math.min(
    100,
    Math.round((wordCount / minWords) * 100),
  );

  // Start the timer as soon as the writing screen is shown, not on first keystroke
  useEffect(() => {
    if (step === "write") setTimerRunning(true);
  }, [step]);

  const handleSelectTask = (task: 1 | 2) => {
    setActiveTask(task);
    setPrompt("");
    setTask2Prompt("");
    setUserText("");
    setImageUrl(null);
    setStep("configure");
  };

  const handleImageUpload = async (file: File) => {
    setImageLoading(true);
    try {
      setImageUrl(await readFileAsDataUrl(file));
    } catch (err) {
      console.error("Failed to read image file:", err);
      alert("Could not load that image. Please try a different file.");
    } finally {
      setImageLoading(false);
    }
  };

  const handleReset = () => {
    setStep("select");
    setActiveTask(null);
    setPrompt("");
    setTask2Prompt("");
    setUserText("");
    setImageUrl(null);
    setShowFeedbackModal(false);
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
    if (activeTask === null) return;
    return runFinish(async () => {
      await downloadEssayPdf({
        mode: "Relax Mode",
        fileName: `WriteReady_Relax_Task${activeTask}.pdf`,
        tasks: [
          {
            taskNum: activeTask,
            question: activeTask === 1 ? prompt : task2Prompt,
            imageSrc: activeTask === 1 ? imageUrl : null,
            answer: userText,
          },
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

      const encoded =
        activeTask === 1
          ? encodeReport({
              task1: { report: prompt, image: imageUrl ?? undefined },
              task2: undefined,
              userText1: userText,
              userText2: "",
            })
          : encodeReport({
              task1: undefined,
              task2: { report: task2Prompt },
              userText1: "",
              userText2: userText,
            });
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
    setShowFeedbackModal(false);
    humanCheck.requestHumanCheck(
      activeTask === 1
        ? {
            task1: userText.trim()
              ? {
                  questionText: prompt,
                  essayText: userText,
                  imageBase64: imageUrl ?? undefined,
                }
              : undefined,
          }
        : {
            task2: userText.trim()
              ? { questionText: task2Prompt, essayText: userText }
              : undefined,
          },
    );
  };

  /* ── Step 1: select ── */
  if (step === "select") {
    return (
      <div
        className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans"
      >
        <div className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <button
              type="button"
              onClick={(e) => {
                confirmLeave(e);
                if (!e.defaultPrevented) navigate(-1);
              }}
              className="hidden sm:flex items-center gap-2 rounded text-xs font-semibold text-black/50 dark:text-neutral-400 tracking-widest uppercase hover:text-black dark:hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ChevronLeftIcon strokeWidth={3} aria-hidden="true" className="size-3 text-black dark:text-neutral-100" />
              WriteReady
            </button>
              <ChevronRightIcon className="hidden sm:block w-3 h-3 text-black/30 dark:text-neutral-500" />
              <span className="text-sm font-medium text-black dark:text-neutral-100">Relax Mode</span>
            </div>
            <nav className="flex items-center gap-1">
              <NavLink onClick={confirmLeave}
                to="/"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Home
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/mock"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Mock
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/practice"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Practice
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/quick"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Quick Write
              </NavLink>
            </nav>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 px-4">
          <div className="w-full max-w-lg space-y-10">
            <div className="space-y-2 text-center">
              <p className="text-xs font-semibold tracking-widest text-slate-400 dark:text-neutral-400 uppercase">
                No time pressure
              </p>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-neutral-100">
                Choose your task
              </h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                Write at your own pace with a custom prompt.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([1, 2] as const).map((task) => (
                <button
                  key={task}
                  onClick={() => handleSelectTask(task)}
                  className="group p-7 text-left bg-white dark:bg-neutral-900 border-2 border-slate-200 dark:border-neutral-800 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-[border-color,box-shadow]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-neutral-800 group-hover:bg-blue-600 text-slate-600 dark:text-neutral-300 group-hover:text-white text-sm font-bold transition-colors">
                      {task}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-slate-800 dark:text-neutral-200">
                    Task {task}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                    {task === 1
                      ? "Describe a visual — chart, map, or diagram"
                      : "Write an academic essay on a given topic"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Step 2: configure ── */
  if (step === "configure" && activeTask) {
    return (
      <div
        className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans"
      >
        <div className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-semibold text-black/50 dark:text-neutral-400 tracking-widest uppercase">
                WriteReady
              </span>
              <ChevronRightIcon className="hidden sm:block w-3 h-3 text-black/30 dark:text-neutral-500" />
              <span className="text-sm font-medium text-black dark:text-neutral-100">Relax Mode</span>
              <ChevronRightIcon className="w-3 h-3 text-black/30 dark:text-neutral-500" />
              <span className="text-sm text-black/60 dark:text-neutral-400">
                Task {activeTask} setup
              </span>
            </div>
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
            >
              ← Back
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 px-4 py-10">
          <div className="w-full max-w-lg space-y-8">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-widest text-slate-400 dark:text-neutral-400 uppercase">
                Task {activeTask}
              </p>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100">
                Set up your prompt
              </h1>
              <p className="text-sm text-slate-500 dark:text-neutral-400">
                {activeTask === 1
                  ? "Enter the question and optionally upload a chart or diagram."
                  : "Type the essay question you'd like to respond to."}
              </p>
            </div>

            <div className="space-y-5">
              {activeTask === 1 ? (
                <>
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-300 uppercase tracking-wide">
                      Task 1 prompt
                    </label>
                    <textarea name="task-1-prompt" autoComplete="off"
                      value={prompt}
                      aria-label="Task 1 prompt"
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="The chart below shows… Summarise the information by selecting and reporting the main features…"
                      className="w-full h-28 px-4 py-3 text-sm text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-neutral-800 outline-none resize-none rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white dark:bg-neutral-900 transition placeholder:text-slate-300 dark:placeholder:text-neutral-600"
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-300 uppercase tracking-wide">
                      Chart / diagram{" "}
                      <span className="text-slate-400 dark:text-neutral-400 normal-case font-normal">
                        (optional)
                      </span>
                    </label>
                    <label
                      className={`flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${imageLoading ? "opacity-50 pointer-events-none" : "border-slate-200 dark:border-neutral-800 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/30"}`}
                    >
                      <UploadIcon className="w-5 h-5 text-slate-400 dark:text-neutral-400" />
                      <span className="text-sm text-slate-400 dark:text-neutral-400">
                        {imageLoading ? "Loading…" : "Click to upload an image"}
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        disabled={imageLoading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f);
                        }}
                      />
                    </label>
                    {imageUrl && !imageLoading && (
                      <div className="mt-3 overflow-hidden border border-slate-200 dark:border-neutral-800 rounded-lg">
                        {isPdf(imageUrl) ? (
                          <object
                            data={imageUrl}
                            type="application/pdf"
                            className="w-full h-64"
                          >
                            <iframe
                              src={imageUrl}
                              className="w-full h-64 border-0"
                              title="Task 1 chart"
                            />
                          </object>
                        ) : (
                          <img
                            src={imageUrl}
                            alt="Preview"
                            width={1200}
                            height={800}
                            loading="lazy"
                            className="object-cover w-full max-h-64"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-300 uppercase tracking-wide">
                    Task 2 prompt
                  </label>
                  <textarea name="task-2-prompt" autoComplete="off"
                    value={task2Prompt}
                    aria-label="Task 2 prompt"
                    onChange={(e) => setTask2Prompt(e.target.value)}
                    placeholder="Some people believe that… To what extent do you agree or disagree?"
                    className="w-full h-36 px-4 py-3 text-sm text-slate-800 dark:text-neutral-200 bg-slate-50 dark:bg-neutral-950 border border-slate-200 dark:border-neutral-800 outline-none resize-none rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white dark:focus:bg-neutral-900 transition placeholder:text-slate-300 dark:placeholder:text-neutral-600"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("write")}
                disabled={
                  (activeTask === 1 && prompt.trim() === "") ||
                  (activeTask === 2 && task2Prompt.trim() === "")
                }
                className="flex-1 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Start writing
              </button>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 dark:text-neutral-300 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg hover:bg-slate-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Step 3: write ── */
  return (
    <div
      className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 font-sans"
    >
      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:block text-xs font-semibold text-black/50 dark:text-neutral-400 tracking-widest uppercase">
              WriteReady
            </span>
            <ChevronRightIcon className="hidden sm:block w-3 h-3 text-black/30 dark:text-neutral-500" />
            <span className="text-sm font-medium text-black dark:text-neutral-100 truncate">
              Relax Mode
            </span>
          </div>

          {/* Centre: timer */}
          <div className="flex items-center gap-2">
            <ClockIcon className="w-3.5 h-3.5 text-black/60 dark:text-neutral-400" />
            <span className="text-sm font-mono font-semibold tabular-nums text-black/90 dark:text-neutral-100">
              {elapsed}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <FullscreenButton className="inline-flex items-center justify-center p-1.5 text-black/70 dark:text-neutral-300 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors" />
            <button
              onClick={handleReset}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs text-black/70 dark:text-neutral-300 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
            >
              Start over
            </button>
            <nav className="hidden sm:flex items-center gap-1">
              <NavLink onClick={confirmLeave}
                to="/"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Home
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/mock"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Mock
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/practice"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Practice
              </NavLink>
              <NavLink onClick={confirmLeave}
                to="/writing/quick"
                className="px-3 py-1.5 text-xs text-black/60 dark:text-neutral-400 hover:text-black dark:hover:text-white border border-black/20 dark:border-neutral-700 hover:border-black/40 dark:hover:border-neutral-600 rounded-md transition-colors"
              >
                Quick Write
              </NavLink>
            </nav>
            <button
              onClick={handleDownloadPDF}
              disabled={finishing}
              aria-busy={finishing}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white dark:text-neutral-900 bg-slate-900 dark:bg-neutral-100 hover:bg-slate-800 dark:hover:bg-white rounded-md transition-colors disabled:opacity-60"
            >
              <BusyLabel busy={finishing} busyText="Saving PDF…">Save PDF</BusyLabel>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-black/10 dark:bg-white/10">
          <div
            className="h-full bg-black/40 dark:bg-white/40 transition-[width] duration-500"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* Task info strip */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 dark:bg-neutral-950 border-b border-slate-200 dark:border-neutral-800">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold">
          {activeTask}
        </span>
        <p className="text-xs text-slate-600 dark:text-neutral-300">
          No time limit — write at your own pace. At least{" "}
          <strong>{minWords} words</strong>.
        </p>
      </div>

      {/* Split panel */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        <div className="w-full overflow-y-auto bg-white dark:bg-neutral-900 border-b border-slate-200 dark:border-neutral-800 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {activeTask === 2 && <WritingTask2Preview task2={task2Prompt} />}
            {activeTask === 1 && imageUrl && (
              <WritingTask1Preview
                task1={{ image: imageUrl, report: prompt }}
              />
            )}
            {activeTask === 1 && !imageUrl && prompt && (
              <div className="p-5 border border-slate-200 dark:border-neutral-800 rounded-xl bg-slate-50 dark:bg-neutral-950">
                <p className="text-sm text-slate-700 dark:text-neutral-300 leading-relaxed">
                  {prompt}
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative hidden w-1.5 shrink-0 cursor-col-resize select-none touch-none bg-slate-100 dark:bg-neutral-800 hover:bg-blue-200 dark:hover:bg-blue-900 active:bg-blue-300 dark:active:bg-blue-800 transition-colors md:flex items-center justify-center group"
        >
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span className="w-1 h-1 rounded-full bg-blue-400" />
          </div>
        </div>

        <div className="flex flex-col flex-1 bg-slate-50 dark:bg-neutral-950">
          <label htmlFor="relax-answer" className="sr-only">
            Your answer for Task {activeTask}
          </label>
          <textarea name="relax-answer"
            id="relax-answer"
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
            className="flex-1 w-full p-6 text-[15px] leading-relaxed text-slate-800 dark:text-neutral-200 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset resize-none placeholder:text-slate-300 dark:placeholder:text-neutral-600 focus:bg-white dark:focus:bg-neutral-900 transition-colors duration-200 min-h-[300px] [scrollbar-gutter:stable]"
          />

          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-blue-400"}`}
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
                onClick={handleReset}
                className="text-xs text-slate-400 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-200 transition-colors"
              >
                Start over
              </button>
              <span className="text-slate-200 dark:text-neutral-700">|</span>
              <button
                onClick={handleDownloadPDF}
                disabled={finishing}
                aria-busy={finishing}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors disabled:opacity-60"
              >
                <BusyLabel busy={finishing} busyText="Saving PDF…">Save PDF</BusyLabel>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback modal */}
      <ModalCard open={showFeedbackModal} onClose={() => { if (!checkingAccess) setShowFeedbackModal(false); }}>
          <div className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-linear-to-r from-blue-500 to-indigo-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-blue-50 dark:bg-blue-950/40">
                <CheckIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <ModalTitle className="mt-4 text-base font-semibold text-center text-slate-900 dark:text-neutral-100">
                Session saved
              </ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-center text-slate-500 dark:text-neutral-400">
                Would you like in-depth AI feedback on your writing? We'll
                analyse grammar, vocabulary, coherence, and task achievement.
              </ModalDescription>
              <div className="flex flex-col gap-2.5 mt-6">
                <Button
                  onClick={handleAcceptFeedback}
                  disabled={checkingAccess}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
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
              <ModalTitle className="mt-4 text-base font-semibold text-slate-900 dark:text-neutral-100">
                Sent for human review
              </ModalTitle>
              <ModalDescription className="mt-2 text-sm leading-6 text-slate-500 dark:text-neutral-400">
                You'll get a notification once your teacher has reviewed your
                essay.
              </ModalDescription>
              <Button
                onClick={() => humanCheck.setSuccess(false)}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white"
              >
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

export default Relax;