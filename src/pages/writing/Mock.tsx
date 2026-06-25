import { useState, useEffect, useRef, type PointerEvent, type CSSProperties } from "react";
import { auth, db } from "@/firebase/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import { encodeReport } from "@/lib/reportEncoding";

interface Task1 {
  image: string;
  report: string;
}
interface Task2 {
  report: string;
}

function isPro(subscription: string | null): boolean {
  if (!subscription) return false;
  if (subscription === "forever") return true;
  return new Date(subscription) > new Date();
}

const TIMER_SECONDS = 3600;
const CRITICAL_SECONDS = 300;

/* ── Inline icons ─────────────────────────────────────────────────────── */
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ClockIcon = ({ className = "" }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" />
  </svg>
);

const EyeOffIcon = ({ className = "" }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.53 13.53 0 0 0 1 11s4 7 11 7a10.94 10.94 0 0 0 5.39-1.39" />
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
);

const EyeIcon = ({ className = "" }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CheckIcon = ({ className = "" }: { className?: string }) => (
  <svg {...iconProps} strokeWidth={2.5} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const SparkleIcon = ({ className = "" }: { className?: string }) => (
  <svg {...iconProps} className={className}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
  </svg>
);

/* ── Component ────────────────────────────────────────────────────────── */

function Mock() {
  const navigate = useNavigate();
  const [activeTask, setActiveTask] = useState<1 | 2>(1);
  const [userText1, setUserText1] = useState("");
  const [userText2, setUserText2] = useState("");
  const [task1List, setTask1List] = useState<Task1[]>([]);
  const [task2List, setTask2List] = useState<Task2[]>([]);
  const [task1, setTask1] = useState<Task1 | null>(null);
  const [task2, setTask2] = useState<Task2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [showHeader, setShowHeader] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [autoSubmittedByTimer, setAutoSubmittedByTimer] = useState(false);
  const autoSubmitRef = useRef(false);

  // Resizable split panel
  const [splitRatio, setSplitRatio] = useState(0.46);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true);
      try {
        const t1Snap = await getDocs(collection(db, "task1_reports"));
        const t1Docs = t1Snap.docs.map((d) => d.data() as Task1);
        setTask1List(t1Docs);
        if (t1Docs.length > 0)
          setTask1(t1Docs[Math.floor(Math.random() * t1Docs.length)]);

        const t2Snap = await getDocs(collection(db, "task2_reports"));
        const t2Docs = t2Snap.docs.map((d) => d.data() as Task2);
        setTask2List(t2Docs);
        if (t2Docs.length > 0)
          setTask2(t2Docs[Math.floor(Math.random() * t2Docs.length)]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) {
      setTimeLeft(0);
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true;
        setAutoSubmittedByTimer(true);
        handleDownloadPDF();
      }
      return;
    }
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timeLeft]);

  const activeText = activeTask === 1 ? userText1 : userText2;
  const wordCount = activeText.trim() === "" ? 0 : activeText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;
  const meetsMinWords = wordCount >= minWords;

  const isTimeUp = timeLeft <= 0;
  const isTimeCritical = !isTimeUp && timeLeft <= CRITICAL_SECONDS;
  const elapsedPct = ((TIMER_SECONDS - timeLeft) / TIMER_SECONDS) * 100;

  const timerHours = Math.floor(timeLeft / 3600);
  const timerMinutes = Math.floor((timeLeft % 3600) / 60);
  const timerSeconds = timeLeft % 60;
  const timerLabel =
    timerHours > 0
      ? `${timerHours}:${timerMinutes.toString().padStart(2, "0")}:${timerSeconds.toString().padStart(2, "0")}`
      : `${timerMinutes.toString().padStart(2, "0")}:${timerSeconds.toString().padStart(2, "0")}`;

  const pickRandomItem = <T,>(items: T[]) =>
    items[Math.floor(Math.random() * items.length)];

  const handleGetAnother = () => {
    if (activeTask === 1) {
      if (task1List.length === 0) return;
      setUserText1("");
      const current = task1;
      let next = pickRandomItem(task1List);
      if (task1List.length > 1) while (next === current) next = pickRandomItem(task1List);
      setTask1(next);
      return;
    }
    if (task2List.length === 0) return;
    setUserText2("");
    const current = task2;
    let next = pickRandomItem(task2List);
    if (task2List.length > 1) while (next === current) next = pickRandomItem(task2List);
    setTask2(next);
  };

  /* ── Resizable divider ── */
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
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  /* ── PDF export ── */
  const handleDownloadPDF = () => {
    const pdfdoc = new jsPDF();
    const pageW = pdfdoc.internal.pageSize.getWidth();
    const pageH = pdfdoc.internal.pageSize.getHeight();
    const margin = 20;
    const contentW = pageW - margin * 2;

    pdfdoc.setFillColor(15, 23, 42);
    pdfdoc.rect(0, 0, pageW, 40, "F");
    pdfdoc.setFontSize(12);
    pdfdoc.setTextColor(255, 255, 255);
    pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text("WriteReady IELTS", margin, 15);
    pdfdoc.setFontSize(16);
    pdfdoc.text("Mock Exam Report", margin, 30);
    pdfdoc.setFontSize(8);
    pdfdoc.setFont("helvetica", "normal");
    const dateStr = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    pdfdoc.text(dateStr, pageW - margin, 15, { align: "right" });

    let y = 52;
    const tasks = [
      { taskNum: 1 as const, question: task1?.report, answer: userText1, minW: 150 },
      { taskNum: 2 as const, question: task2?.report, answer: userText2, minW: 250 },
    ];

    tasks.forEach(({ taskNum, question, answer, minW }, index) => {
      if (index > 0) { pdfdoc.addPage(); y = 20; }
      pdfdoc.setFillColor(240, 244, 255);
      pdfdoc.roundedRect(margin, y - 5, contentW, 12, 2, 2, "F");
      pdfdoc.setFontSize(11);
      pdfdoc.setTextColor(15, 23, 42);
      pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text(`TASK ${taskNum} — ${minW} words minimum`, margin + 3, y + 2);
      y += 16;

      if (question) {
        pdfdoc.setFontSize(10);
        pdfdoc.setFont("helvetica", "normal");
        const qLines = pdfdoc.splitTextToSize(question, contentW - 10);
        const qHeight = qLines.length * 5.6 + 10;
        pdfdoc.setFillColor(248, 250, 252);
        pdfdoc.roundedRect(margin, y, contentW, qHeight, 2, 2, "FD");
        pdfdoc.setTextColor(15, 23, 42);
        pdfdoc.text(qLines, margin + 5, y + 7);
        y += qHeight + 12;
      }

      pdfdoc.setFontSize(10);
      pdfdoc.setFillColor(233, 245, 255);
      pdfdoc.roundedRect(margin, y - 5, contentW, 8, 2, 2, "F");
      pdfdoc.setTextColor(15, 23, 42);
      pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text("YOUR ANSWER", margin + 3, y + 1);
      y += 12;

      const answerLines = pdfdoc.splitTextToSize(answer || "(No answer provided)", contentW - 10);
      const totalHeight = answerLines.length * 5.6 + 10;
      if (y + totalHeight > pageH - margin) { pdfdoc.addPage(); y = 20; }
      pdfdoc.setFillColor(245, 252, 245);
      pdfdoc.roundedRect(margin, y, contentW, totalHeight, 2, 2, "FD");
      pdfdoc.setTextColor(15, 23, 42);
      pdfdoc.setFont("helvetica", "normal");
      pdfdoc.text(answerLines, margin + 5, y + 7);
      y += totalHeight + 12;
    });

    const pages = (pdfdoc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdfdoc.setPage(i);
      pdfdoc.setFillColor(15, 23, 42);
      pdfdoc.rect(0, pageH - 14, pageW, 14, "F");
      pdfdoc.setFontSize(7);
      pdfdoc.setTextColor(255, 255, 255);
      pdfdoc.text("WriteReady — IELTS Writing Practice", margin, pageH - 5);
      pdfdoc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 5, { align: "right" });
    }

    pdfdoc.save("WriteReady_Mock.pdf");
    setShowFeedbackModal(true);
  };

  /* ── Feedback gate ── */
  const handleAcceptFeedback = async () => {
    setCheckingAccess(true);
    try {
      const user = auth.currentUser;
      if (!user) { navigate("/auth"); return; }

      const snap = await getDoc(doc(db, "users", user.uid));
      const subscription = snap.exists()
        ? ((snap.data().subscription as string | null) ?? null)
        : null;

      if (!isPro(subscription)) { navigate("/pricing"); return; }

      const encoded = encodeReport({ task1, task2, userText1, userText2 });
      navigate(`/feedback/${encoded}`);
    } catch (err) {
      console.error("Failed to verify account/subscription status:", err);
      navigate("/auth");
    } finally {
      setCheckingAccess(false);
      setShowFeedbackModal(false);
    }
  };

  const handleDeclineFeedback = () => setShowFeedbackModal(false);

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <section className="relative flex flex-col h-screen overflow-hidden bg-[#f2f3f5]">
        <div className="h-11 bg-[#1f1f1f] flex items-center justify-between px-5 shrink-0">
          <div className="h-2.5 w-28 rounded-full bg-white/15 animate-pulse" />
          <div className="h-2.5 w-16 rounded-full bg-white/15 animate-pulse" />
          <div className="h-2.5 w-6 rounded-full bg-white/15 animate-pulse" />
        </div>
        <div className="flex items-center justify-between h-14 px-5 bg-white border-b border-gray-200 shrink-0">
          <div className="flex gap-3">
            <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
            <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-8 w-40 rounded-md bg-gray-200 animate-pulse" />
          </div>
        </div>
        <div className="h-10 bg-[#f8f9fa] border-b border-gray-200 shrink-0 flex items-center px-5">
          <div className="h-2.5 w-72 rounded-full bg-gray-200 animate-pulse" />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="hidden w-[46%] px-8 py-6 space-y-3 border-r border-gray-200 md:block">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-3 rounded bg-gray-200 animate-pulse"
                style={{ width: `${88 - (i % 4) * 14}%` }} />
            ))}
          </div>
          <div className="flex-1 p-6">
            <div className="w-full h-full rounded-lg bg-white border border-gray-200" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-[#f2f3f5]/60 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-4 px-10 py-8 bg-white border border-gray-200 shadow-xl rounded-2xl">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.3s]" />
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce [animation-delay:-0.15s]" />
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" />
            </div>
            <p className="text-sm font-medium tracking-wide text-gray-700">
              Preparing your mock test…
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* ── Main render ── */
  return (
    <div className="flex flex-col h-screen bg-[#f2f3f5]">

      {/* ── Top exam bar ── */}
      <div className="relative grid items-center h-11 px-5 text-white bg-[#1f1f1f] shrink-0 z-30 grid-cols-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-white/60 uppercase">
          <SparkleIcon className="hidden w-3.5 h-3.5 sm:inline" />
          WriteReady IELTS
        </div>

        <div className="flex justify-center">
          <span className={`flex items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-semibold tabular-nums transition-colors ${
            isTimeUp
              ? "bg-red-500/20 text-red-300"
              : isTimeCritical
              ? "bg-red-500/20 text-red-300 animate-pulse"
              : "bg-white/10 text-white"
          }`}>
            <ClockIcon className="w-4 h-4" />
            {isTimeUp ? "Time is up" : timerLabel}
          </span>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowHeader((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            {showHeader ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            <span className="hidden sm:inline">{showHeader ? "Hide" : "Show"}</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/10">
          <div
            className={`h-full transition-all duration-1000 ${isTimeCritical || isTimeUp ? "bg-red-400" : "bg-blue-500"}`}
            style={{ width: `${elapsedPct}%` }}
          />
        </div>
      </div>

      {/* ── Collapsible controls bar ── */}
      {showHeader && (
        <header className="bg-white border-b border-gray-200 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            {/* Task tabs */}
            <div className="flex gap-1">
              {[1, 2].map((taskNum) => (
                <button
                  key={taskNum}
                  onClick={() => setActiveTask(taskNum as 1 | 2)}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                    activeTask === taskNum
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  Task {taskNum}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="hidden items-center gap-2 pr-3 mr-1 border-r border-gray-200 text-xs text-gray-400 sm:flex">
                <NavLink to="/" className="hover:text-gray-700 transition">Home</NavLink>
                <span>·</span>
                <NavLink to="/writing/practice" className="hover:text-gray-700 transition">Practice</NavLink>
                <span>·</span>
                <NavLink to="/writing/relax" className="hover:text-gray-700 transition">Relax</NavLink>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGetAnother}
                className="border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
              >
                Get another test
              </Button>
              <button
                onClick={handleDownloadPDF}
                className="px-4 py-2 text-sm font-medium text-white transition bg-blue-600 rounded-md hover:bg-blue-700"
              >
                Finish test &amp; download PDF
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ── Instructions strip ── */}
      <div className="flex items-center gap-2.5 px-5 py-2.5 text-xs text-gray-500 border-b border-gray-200 bg-[#f8f9fa] shrink-0">
        <span className="font-semibold text-gray-800">Task {activeTask}</span>
        <span className="text-gray-300">|</span>
        <span>
          You should spend about {activeTask === 1 ? "20" : "40"} minutes on this task and write at
          least <span className="font-medium text-gray-700">{minWords} words</span>.
        </span>
      </div>

      {/* ── Split panels ── */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        {/* Question panel */}
        <div className="w-full overflow-y-auto bg-white border-b border-gray-200 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="px-8 py-7">
            {activeTask === 1 && task1 ? (
              <WritingTask1Preview task1={task1} />
            ) : activeTask === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-gray-400">No question available yet.</p>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative hidden w-2 shrink-0 cursor-col-resize select-none bg-gray-100 hover:bg-blue-100 active:bg-blue-200 transition-colors md:flex items-center justify-center"
          style={{ touchAction: "none" }}
        >
          <div className="flex flex-col gap-[5px]">
            <span className="w-1 h-1 rounded-full bg-gray-400" />
            <span className="w-1 h-1 rounded-full bg-gray-400" />
            <span className="w-1 h-1 rounded-full bg-gray-400" />
          </div>
        </div>

        {/* Answer panel */}
        <div className="flex flex-col flex-1 bg-[#f2f3f5]">
          {/* Word count bar */}
          <div className="flex items-center justify-end gap-2 px-5 py-2.5 text-xs border-b border-gray-200 bg-white shrink-0">
            {meetsMinWords && <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
            <span className={meetsMinWords ? "font-semibold text-emerald-700" : "text-gray-500"}>
              Words: {wordCount}
              {!meetsMinWords && (
                <span className="ml-1 text-gray-400">/ {minWords} minimum</span>
              )}
            </span>
          </div>
          <textarea
            value={activeTask === 1 ? userText1 : userText2}
            onChange={(e) =>
              activeTask === 1 ? setUserText1(e.target.value) : setUserText2(e.target.value)
            }
            placeholder="Start writing your response here…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="flex-1 w-full px-8 py-6 text-[15px] leading-8 text-gray-900 bg-white outline-none resize-none placeholder:text-gray-300"
          />
        </div>
      </div>

      {/* ── Feedback modal ── */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md px-8 py-8 bg-white shadow-2xl rounded-2xl">
            <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-blue-50 text-blue-600">
              {autoSubmittedByTimer
                ? <ClockIcon className="w-6 h-6" />
                : <SparkleIcon className="w-6 h-6" />}
            </div>
            <h2 className="mt-5 text-lg font-semibold text-center text-gray-900">
              {autoSubmittedByTimer ? "Time's up!" : "Get AI feedback?"}
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-center text-gray-500">
              {autoSubmittedByTimer && "Your answers have been saved as a PDF. "}
              Would you like in-depth AI feedback on your writing? Our AI will analyze your response
              for grammar, vocabulary, coherence, and task achievement.
            </p>
            <div className="flex flex-col gap-3 mt-7 sm:flex-row-reverse">
              <Button
                onClick={handleAcceptFeedback}
                disabled={checkingAccess}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                {checkingAccess ? "Checking…" : "Yes, get feedback"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeclineFeedback}
                disabled={checkingAccess}
                className="flex-1"
              >
                No, thanks
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Mock;
