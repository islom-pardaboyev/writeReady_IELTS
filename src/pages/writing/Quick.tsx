import {
  useState,
  useEffect,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { auth, db } from "@/firebase/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import jsPDF from "jspdf";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import { encodeReport } from "@/lib/reportEncoding";
import { CheckIcon, ChevronRightIcon, ZapIcon } from "lucide-react";
import { useStopwatch } from "@/hooks/useStopwatch";

async function loadImgBase64(src: string): Promise<{ b64: string; w: number; h: number } | null> {
  if (src.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(src)) return null;
  try {
    let dataUrl = src;
    if (!src.startsWith('data:')) {
      const res = await fetch(src);
      const blob = await res.blob();
      dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
    const { w, h } = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = dataUrl;
    });
    return { b64: dataUrl, w, h };
  } catch { return null; }
}

interface Task1 {
  image: string;
  report: string;
}
interface Task2 {
  report: string;
}

function hasAccess(data: Record<string, unknown>): boolean {
  const plan = data.plan as string | undefined;
  if (plan === 'forever' || plan === 'premium' || plan === 'standard' || plan === 'basic') return true;
  const bonus = typeof data.bonusAnalyses === 'number' ? data.bonusAnalyses : 0;
  return bonus > 0;
}

function Quick() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  // Task selection (null = not chosen yet)
  const [selectedTaskType, setSelectedTaskType] = useState<1 | 2 | null>(null);
  const [userText, setUserText] = useState("");
  const [task1, setTask1] = useState<Task1 | null>(null);
  const [task1List, setTask1List] = useState<Task1[]>([]);
  const [task2, setTask2] = useState<Task2 | null>(null);
  const [task2List, setTask2List] = useState<Task2[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHeader, setShowHeader] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  const [splitRatio, setSplitRatio] = useState(0.46);
  const [timerRunning, setTimerRunning] = useState(false);
  const elapsed = useStopwatch(timerRunning);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

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
        const t1Docs = t1Snap.docs.map((d) => d.data() as Task1);
        const t2Docs = t2Snap.docs.map((d) => d.data() as Task2);
        setTask1List(t1Docs);
        setTask2List(t2Docs);
        if (t1Docs.length > 0) setTask1(t1Docs[Math.floor(Math.random() * t1Docs.length)]);
        if (t2Docs.length > 0) setTask2(t2Docs[Math.floor(Math.random() * t2Docs.length)]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [user]);

  const pickRandom = <T,>(items: T[], current: T | null): T => {
    if (items.length <= 1) return items[0];
    let next = items[Math.floor(Math.random() * items.length)];
    while (next === current) next = items[Math.floor(Math.random() * items.length)];
    return next;
  };

  const handleGetAnother = () => {
    setUserText("");
    if (selectedTaskType === 1) setTask1(pickRandom(task1List, task1));
    else if (selectedTaskType === 2) setTask2(pickRandom(task2List, task2));
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

  const handleFinish = async () => {
    const pdf = new jsPDF();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentW = pageW - margin * 2;

    // Header
    pdf.setFillColor(88, 28, 135);
    pdf.rect(0, 0, pageW, 40, "F");
    pdf.setFontSize(12);
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.text("WriteReady IELTS", margin, 15);
    pdf.setFontSize(16);
    pdf.text(`Quick Write — Task ${selectedTaskType}`, margin, 30);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      pageW - margin,
      15,
      { align: "right" }
    );

    let y = 52;
    const question = selectedTaskType === 1 ? task1?.report : task2?.report;

    // Task label
    pdf.setFillColor(240, 232, 255);
    pdf.roundedRect(margin, y - 5, contentW, 12, 2, 2, "F");
    pdf.setFontSize(11);
    pdf.setTextColor(88, 28, 135);
    pdf.setFont("helvetica", "bold");
    pdf.text(
      `TASK ${selectedTaskType} — ${minWords} words minimum`,
      margin + 3,
      y + 2
    );
    y += 16;

    // Question box
    if (question) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const qLines = pdf.splitTextToSize(question, contentW - 10);
      const qH = qLines.length * 5.6 + 10;
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(margin, y, contentW, qH, 2, 2, "FD");
      pdf.setTextColor(15, 23, 42);
      pdf.text(qLines, margin + 5, y + 7);
      y += qH + 12;
    }

    // Task 1 chart image
    if (selectedTaskType === 1 && task1?.image) {
      const imgData = await loadImgBase64(task1.image);
      if (imgData) {
        const imgH = Math.min(contentW * (imgData.h / imgData.w), 100);
        if (y + imgH > pageH - margin) { pdf.addPage(); y = 20; }
        pdf.addImage(imgData.b64, 'JPEG', margin, y, contentW, imgH);
        y += imgH + 8;
      }
    }

    // Answer label
    pdf.setFontSize(10);
    pdf.setFillColor(233, 225, 255);
    pdf.roundedRect(margin, y - 5, contentW, 8, 2, 2, "F");
    pdf.setTextColor(88, 28, 135);
    pdf.setFont("helvetica", "bold");
    pdf.text("YOUR ANSWER", margin + 3, y + 1);
    y += 12;

    // Answer text
    const answerLines = pdf.splitTextToSize(userText || "(No answer provided)", contentW - 10);
    const totalH = answerLines.length * 5.6 + 10;
    if (y + totalH > pageH - margin) { pdf.addPage(); y = 20; }
    pdf.setFillColor(250, 245, 255);
    pdf.roundedRect(margin, y, contentW, totalH, 2, 2, "FD");
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "normal");
    pdf.text(answerLines, margin + 5, y + 7);

    // Footer on all pages
    const pages = (pdf.internal as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      pdf.setFillColor(88, 28, 135);
      pdf.rect(0, pageH - 14, pageW, 14, "F");
      pdf.setFontSize(7);
      pdf.setTextColor(255, 255, 255);
      pdf.text("WriteReady — IELTS Writing Practice", margin, pageH - 5);
      pdf.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 5, { align: "right" });
    }

    pdf.save(`WriteReady_Quick_Task${selectedTaskType}.pdf`);
    setShowFeedbackModal(true);
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

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 tracking-wide">Loading questions…</p>
        </div>
      </div>
    );
  }

  /* ── Task picker screen ── */
  if (selectedTaskType === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-violet-600 mb-4">
              <ZapIcon className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Quick Write</h1>
            <p className="text-slate-500 text-base">
              Choose a task, write your response, then get AI feedback.
            </p>
          </div>

          {/* Task cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* Task 1 */}
            <button
              onClick={() => setSelectedTaskType(1)}
              className="group relative rounded-2xl border-2 border-slate-200 bg-white p-6 text-left hover:border-violet-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="text-3xl mb-3">🖼️</div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Task 1</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Describe a graph, chart, diagram or map. Minimum <strong>150 words</strong>.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-600">
                Start Task 1 <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>

            {/* Task 2 */}
            <button
              onClick={() => setSelectedTaskType(2)}
              className="group relative rounded-2xl border-2 border-slate-200 bg-white p-6 text-left hover:border-violet-400 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="text-3xl mb-3">✍️</div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">Task 2</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Respond to an argument or opinion question. Minimum <strong>250 words</strong>.
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-600">
                Start Task 2 <ChevronRightIcon className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>

          {/* Nav links */}
          <div className="flex justify-center gap-4 text-sm text-slate-500">
            <NavLink to="/writing/mock" className="hover:text-slate-900 transition-colors">Mock Exam</NavLink>
            <span>·</span>
            <NavLink to="/writing/practice" className="hover:text-slate-900 transition-colors">Practice</NavLink>
            <span>·</span>
            <NavLink to="/writing/relax" className="hover:text-slate-900 transition-colors">Relax</NavLink>
            <span>·</span>
            <NavLink to="/dashboard" className="hover:text-slate-900 transition-colors">Dashboard</NavLink>
          </div>
        </div>
      </div>
    );
  }

  /* ── Writing screen ── */
  return (
    <div data-theme="light" className="flex flex-col min-h-screen bg-slate-50 font-sans">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-30 border-b bg-violet-700 border-violet-800">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          {/* Left */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:block text-xs font-semibold text-white/50 tracking-widest uppercase">WriteReady</span>
            <ChevronRightIcon className="hidden sm:block w-3 h-3 text-white/30" />
            <span className="text-sm font-medium text-white">Quick Write — Task {selectedTaskType}</span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-white/70 border border-white/20 rounded-md">
              ⏱ {elapsed}
            </span>
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
              onClick={() => setSelectedTaskType(null)}
              className="hidden sm:inline-flex items-center gap-1 px-3 py-1.5 text-xs text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors"
            >
              Change task
            </button>
            <button
              onClick={handleFinish}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-violet-900 bg-white hover:bg-violet-50 rounded-md transition-colors"
            >
              Finish & save PDF
            </button>
          </div>
        </div>

        {/* Word count progress stripe */}
        <div className="h-0.5 bg-white/10">
          <div
            className="h-full bg-white/60 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Secondary header ── */}
      {showHeader && (
        <div className="sticky top-[45px] z-20 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {selectedTaskType}
              </span>
              <span className="text-sm font-medium text-slate-900">Task {selectedTaskType}</span>
              <span className="text-xs text-slate-500">— minimum {minWords} words</span>
            </div>
            <nav className="hidden md:flex items-center gap-1 text-xs text-slate-500">
              <NavLink to="/" className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">Home</NavLink>
              <NavLink to="/writing/mock" className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">Mock</NavLink>
              <NavLink to="/writing/practice" className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">Practice</NavLink>
              <NavLink to="/writing/relax" className="px-2 py-1 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors">Relax</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3 px-5 py-2 bg-slate-100 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              {selectedTaskType === 1
                ? "Describe the information in the chart or diagram. Organise, summarise and compare where relevant."
                : "Present your argument clearly. Give your opinion and support it with examples and explanations."}
            </p>
          </div>
        </div>
      )}

      {/* Minimal task bar when header hidden */}
      {!showHeader && (
        <div className="flex items-center gap-3 px-5 py-2 bg-white border-b border-slate-200">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold">{selectedTaskType}</span>
          <span className="text-xs text-slate-500">Task {selectedTaskType} · {minWords} words minimum</span>
        </div>
      )}

      {/* ── Split panel ── */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        {/* Question panel */}
        <div className="w-full overflow-y-auto bg-white border-b border-slate-200 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {selectedTaskType === 1 && task1 ? (
              <WritingTask1Preview task1={task1} />
            ) : selectedTaskType === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-slate-500">No question available.</p>
            )}
          </div>
        </div>

        {/* Drag handle */}
        <div
          onPointerDown={handleSplitPointerDown}
          onPointerMove={handleSplitPointerMove}
          onPointerUp={handleSplitPointerUp}
          className="relative hidden w-1.5 shrink-0 cursor-col-resize select-none touch-none bg-slate-100 hover:bg-violet-200 active:bg-violet-300 transition-colors md:flex items-center justify-center group"
        >
          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            <span className="w-1 h-1 rounded-full bg-violet-400" />
            <span className="w-1 h-1 rounded-full bg-violet-400" />
          </div>
        </div>

        {/* Answer panel */}
        <div className="flex flex-col flex-1 bg-slate-50">
          <textarea
            value={userText}
            onChange={(e) => { setUserText(e.target.value); if (!timerRunning && e.target.value.length > 0) setTimerRunning(true); }}
            placeholder="Start writing your response here…"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            className="flex-1 w-full p-6 text-sm text-slate-900 bg-white outline-none resize-none placeholder:text-slate-500/40 focus:bg-white transition-colors min-h-[300px] [scrollbar-gutter:stable]"
          />

          {/* Status bar */}
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-violet-500"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${meetsMinWords ? "text-emerald-600" : "text-slate-500"}`}>
                {wordCount} / {minWords} words
                {meetsMinWords && <span className="ml-1.5">✓</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGetAnother}
                className="text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                New question
              </button>
              <span className="text-slate-200">|</span>
              <button
                onClick={handleFinish}
                className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
              >
                Finish & save PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Feedback modal ── */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-violet-500 to-purple-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-violet-50">
                <CheckIcon className="w-5 h-5 text-violet-600" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-center text-slate-900">
                Essay saved!
              </h2>
              <p className="mt-2 text-sm leading-6 text-center text-slate-500">
                Would you like in-depth AI feedback on your writing? We'll analyse grammar, vocabulary, coherence, and task achievement.
              </p>
              <div className="flex flex-col gap-2.5 mt-6">
                <Button
                  onClick={handleAcceptFeedback}
                  disabled={checkingAccess}
                  className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {checkingAccess ? "Checking…" : "Get AI feedback"}
                </Button>
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
    </div>
  );
}

export default Quick;
