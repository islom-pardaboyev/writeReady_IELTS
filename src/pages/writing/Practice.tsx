import {
  useState,
  useEffect,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { useStopwatch } from "@/hooks/useStopwatch";
import { auth, db } from "@/firebase/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import { encodeReport } from "@/lib/reportEncoding";
import { CheckIcon, ChevronRightIcon, ClockIcon, Bot, GraduationCap } from "lucide-react";
import { useHumanCheck } from "@/hooks/useHumanCheck";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { TeacherPickerModal } from "@/components/ui/TeacherPickerModal";
import { HumanCheckConfirmModal } from "@/components/ui/HumanCheckConfirmModal";
import { FullscreenButton } from "@/components/ui/FullscreenButton";

interface Task1 {
  image: string;
  report: string;
}
interface Task2 {
  report: string;
}

function hasAccess(data: Record<string, unknown>): boolean {
  // Learning-center students always have access (free premium).
  if (typeof data.centerId === "string" && data.centerId.length > 0) return true;
  const plan = data.plan as string | undefined;
  if (
    plan === "forever" ||
    plan === "premium" ||
    plan === "standard" ||
    plan === "basic"
  )
    return true;
  const bonus = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
  return bonus > 0;
}

function Practice() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

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

  const [splitRatio, setSplitRatio] = useState(0.46);
  const [timerRunning, setTimerRunning] = useState(false);
  const elapsed = useStopwatch(timerRunning);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  useEffect(() => {
    if (!user) return;
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
  }, [user]);

  // Start the timer as soon as the writing screen is shown, not on first keystroke
  useEffect(() => {
    if (!loading) setTimerRunning(true);
  }, [loading]);

  const activeText = activeTask === 1 ? userText1 : userText2;
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

  const pickRandomItem = <T,>(items: T[]) =>
    items[Math.floor(Math.random() * items.length)];

  const handleGetAnother = () => {
    if (activeTask === 1) {
      if (task1List.length === 0) return;
      setUserText1("");
      const current = task1;
      let next = pickRandomItem(task1List);
      if (task1List.length > 1)
        while (next === current) next = pickRandomItem(task1List);
      setTask1(next);
      return;
    }
    if (task2List.length === 0) return;
    setUserText2("");
    const current = task2;
    let next = pickRandomItem(task2List);
    if (task2List.length > 1)
      while (next === current) next = pickRandomItem(task2List);
    setTask2(next);
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

  async function loadImgBase64(
    src: string,
  ): Promise<{ b64: string; w: number; h: number } | null> {
    if (!src) return null;
    if (src.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(src))
      return null;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        resolve({
          b64: canvas.toDataURL("image/jpeg", 0.85),
          w: img.naturalWidth,
          h: img.naturalHeight,
        });
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  const handleDownloadPDF = async () => {
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
    pdfdoc.text("Writing Practice Report", margin, 30);
    pdfdoc.setFontSize(8);
    pdfdoc.setFont("helvetica", "normal");
    pdfdoc.text(
      new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      pageW - margin,
      15,
      { align: "right" },
    );

    let y = 52;
    const tasks = [
      {
        taskNum: 1 as const,
        question: task1?.report,
        answer: userText1,
        minW: 150,
        imgSrc: task1?.image,
      },
      {
        taskNum: 2 as const,
        question: task2?.report,
        answer: userText2,
        minW: 250,
        imgSrc: undefined as string | undefined,
      },
    ];

    for (let i = 0; i < tasks.length; i++) {
      const { taskNum, question, answer, minW, imgSrc } = tasks[i];
      if (i > 0) {
        pdfdoc.addPage();
        y = 20;
      }
      pdfdoc.setFillColor(240, 244, 255);
      pdfdoc.roundedRect(margin, y - 5, contentW, 12, 2, 2, "F");
      pdfdoc.setFontSize(11);
      pdfdoc.setTextColor(15, 23, 42);
      pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text(`TASK ${taskNum} — ${minW} words minimum`, margin + 3, y + 2);
      y += 16;
      if (question) {
        const qLines = pdfdoc.splitTextToSize(question, contentW - 10);
        const qH = qLines.length * 5.6 + 10;
        pdfdoc.setFillColor(248, 250, 252);
        pdfdoc.roundedRect(margin, y, contentW, qH, 2, 2, "FD");
        pdfdoc.setFontSize(10);
        pdfdoc.setFont("helvetica", "normal");
        pdfdoc.text(qLines, margin + 5, y + 7);
        y += qH + 12;
      }
      if (imgSrc) {
        const imgData = await loadImgBase64(imgSrc);
        if (imgData) {
          const imgH = Math.min(contentW * (imgData.h / imgData.w), 100);
          if (y + imgH > pageH - margin) {
            pdfdoc.addPage();
            y = 20;
          }
          pdfdoc.addImage(imgData.b64, "JPEG", margin, y, contentW, imgH);
          y += imgH + 8;
        }
      }
      pdfdoc.setFillColor(233, 245, 255);
      pdfdoc.roundedRect(margin, y - 5, contentW, 8, 2, 2, "F");
      pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text("YOUR ANSWER", margin + 3, y + 1);
      y += 12;
      const aLines = pdfdoc.splitTextToSize(
        answer || "(No answer provided)",
        contentW - 10,
      );
      const aH = aLines.length * 5.6 + 10;
      if (y + aH > pageH - margin) {
        pdfdoc.addPage();
        y = 20;
      }
      pdfdoc.setFillColor(245, 252, 245);
      pdfdoc.roundedRect(margin, y, contentW, aH, 2, 2, "FD");
      pdfdoc.setFont("helvetica", "normal");
      pdfdoc.text(aLines, margin + 5, y + 7);
      y += aH + 12;
    }

    const pages = (pdfdoc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdfdoc.setPage(i);
      pdfdoc.setFillColor(15, 23, 42);
      pdfdoc.rect(0, pageH - 14, pageW, 14, "F");
      pdfdoc.setFontSize(7);
      pdfdoc.setTextColor(255, 255, 255);
      pdfdoc.text("WriteReady — IELTS Writing Practice", margin, pageH - 5);
      pdfdoc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 5, {
        align: "right",
      });
    }
    pdfdoc.save("WriteReady_Practice.pdf");
    setShowFeedbackModal(true);
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
      task1: task1 && userText1.trim() ? { questionText: task1.report, essayText: userText1, imageBase64: task1.image } : undefined,
      task2: task2 && userText2.trim() ? { questionText: task2.report, essayText: userText2 } : undefined,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 tracking-wide">
            Preparing your practice session…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-theme="light"
      className="flex flex-col min-h-screen bg-slate-50 font-sans"
    >
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:block text-xs font-semibold text-white/50 tracking-widest uppercase">
              WriteReady
            </span>
            <ChevronRightIcon className="hidden sm:block w-3 h-3 text-white/30" />
            <span className="text-sm font-medium text-white truncate">
              Practice Mode
            </span>
          </div>

          {/* Centre: timer */}
          <div className="flex items-center gap-2">
            <ClockIcon className="w-3.5 h-3.5 text-white/60" />
            <span className="text-sm font-mono font-semibold tabular-nums text-white/90">
              {elapsed}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <FullscreenButton className="inline-flex items-center justify-center p-1.5 text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors" />
            <button
              onClick={() => setShowHeader((p) => !p)}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors"
            >
              {showHeader ? "Hide panel" : "Show panel"}
            </button>
            <button
              onClick={handleGetAnother}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors"
            >
              New question
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-md transition-colors"
            >
              Save PDF
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/10">
          <div
            className="h-full bg-white/60 transition-all duration-500"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      </div>

      {/* ── Collapsible secondary header ── */}
      {showHeader && (
        <div className="sticky top-[45px] z-20 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-1">
              {([1, 2] as const).map((t) => {
                const done =
                  t === 1 ? taskProgress1 >= 100 : taskProgress2 >= 100;
                return (
                  <button
                    key={t}
                    onClick={() => setActiveTask(t)}
                    className={`relative flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      activeTask === t
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Task {t}
                    {done && (
                      <span
                        className={`flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${activeTask === t ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}
                      >
                        <CheckIcon className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <nav className="hidden md:flex items-center gap-1 text-xs text-slate-500">
              <NavLink
                to="/"
                className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                Home
              </NavLink>
              <NavLink
                to="/writing/mock"
                className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                Mock Test
              </NavLink>
              <NavLink
                to="/writing/quick"
                className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                Quick Write
              </NavLink>
              <NavLink
                to="/writing/relax"
                className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
              >
                Relax
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-t border-slate-100">
            <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold">
              {activeTask}
            </span>
            <p className="text-xs text-slate-600">
              Spend about{" "}
              <strong>{activeTask === 1 ? "20" : "40"} minutes</strong> on this
              task. Write at least <strong>{minWords} words</strong>.
            </p>
          </div>
        </div>
      )}

      {!showHeader && (
        <div className="flex items-center gap-3 px-5 py-2 bg-slate-50 border-b border-slate-200">
          <div className="flex gap-1">
            {([1, 2] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTask(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeTask === t ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}
              >
                Task {t}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-400">
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
        <div className="w-full overflow-y-auto bg-white border-b border-slate-200 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {activeTask === 1 && task1 ? (
              <WritingTask1Preview task1={task1} />
            ) : activeTask === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-slate-400">
                No question available yet.
              </p>
            )}
          </div>
        </div>

        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative hidden w-1.5 shrink-0 cursor-col-resize select-none touch-none bg-slate-100 hover:bg-blue-200 active:bg-blue-300 transition-colors md:flex items-center justify-center group"
        >
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span className="w-1 h-1 rounded-full bg-blue-400" />
            <span className="w-1 h-1 rounded-full bg-blue-400" />
          </div>
        </div>

        <div className="flex flex-col flex-1 bg-slate-50">
          <label htmlFor={`answer-task-${activeTask}`} className="sr-only">
            Your answer for Task {activeTask}
          </label>
          <textarea
            id={`answer-task-${activeTask}`}
            value={activeTask === 1 ? userText1 : userText2}
            onChange={(e) => {
              activeTask === 1
                ? setUserText1(e.target.value)
                : setUserText2(e.target.value);
            }}
            placeholder="Start writing your response here…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            className="flex-1 w-full p-6 text-[15px] leading-relaxed text-slate-800 bg-white outline-none resize-none placeholder:text-slate-300 focus:bg-white transition-colors duration-200 min-h-[300px] [scrollbar-gutter:stable]"
          />

          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-blue-400"}`}
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <span
                className={`text-xs font-medium ${meetsMinWords ? "text-emerald-600" : "text-slate-400"}`}
              >
                {wordCount} / {minWords} words
                {meetsMinWords && <span className="ml-1.5">✓</span>}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleGetAnother}
                className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
              >
                New question
              </button>
              <span className="text-slate-200">|</span>
              <button
                onClick={handleDownloadPDF}
                className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                Save PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback modal ── */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-blue-50">
                <CheckIcon className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-center text-slate-900">
                Session saved
              </h2>
              <p className="mt-2 text-sm leading-6 text-center text-slate-500">
                Would you like in-depth AI feedback on your writing? We'll
                analyse grammar, vocabulary, coherence, and task achievement.
              </p>
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
        </div>
      )}

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

      {humanCheck.success && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="p-7 text-center">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-emerald-50">
                <CheckIcon className="w-5 h-5 text-emerald-600" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-slate-900">Sent for human review</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                You'll get a notification once your teacher has reviewed your essay.
              </p>
              <Button onClick={() => humanCheck.setSuccess(false)} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {humanCheck.error && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {humanCheck.error}
        </div>
      )}
    </div>
  );
}

export default Practice;
