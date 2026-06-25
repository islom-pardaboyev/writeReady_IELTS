import { useState, useEffect } from "react";
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

function Practice() {
  const navigate = useNavigate();
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

  const activeText = activeTask === 1 ? userText1 : userText2;
  const wordCount =
    activeText.trim() === "" ? 0 : activeText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;

  const pickRandomItem = <T,>(items: T[]) =>
    items[Math.floor(Math.random() * items.length)];

  const handleGetAnother = () => {
    if (activeTask === 1) {
      if (task1List.length === 0) return;
      setUserText1("");
      const current = task1;
      let next = pickRandomItem(task1List);
      if (task1List.length > 1) {
        while (next === current) next = pickRandomItem(task1List);
      }
      setTask1(next);
      return;
    }

    if (task2List.length === 0) return;
    setUserText2("");
    const current = task2;
    let next = pickRandomItem(task2List);
    if (task2List.length > 1) {
      while (next === current) next = pickRandomItem(task2List);
    }
    setTask2(next);
  };

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
    pdfdoc.text("Writing Practice Report", margin, 30);
    pdfdoc.setFontSize(8);
    pdfdoc.setFont("helvetica", "normal");
    const dateStr = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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

      const answerLines = pdfdoc.splitTextToSize(
        answer || "(No answer provided)",
        contentW - 10,
      );
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

    pdfdoc.save("WriteReady_Practice.pdf");
    setShowFeedbackModal(true);
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 text-gray-900 bg-white">
        <div className="px-8 py-10 text-center bg-white border border-gray-200 shadow-sm rounded-3xl">
          <p className="text-sm tracking-widest text-blue-600 uppercase">
            Loading practice materials
          </p>
          <p className="mt-3 text-base">
            Preparing your IELTS practice session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {showHeader && (
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
          <header className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Practice Mode</h1>
              <p className="mt-1 text-sm text-gray-500">
                Task {activeTask} — {minWords} words minimum
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleGetAnother}
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                Get another test
              </Button>
              <button
                onClick={handleDownloadPDF}
                className="px-6 py-2 font-medium text-white transition bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Download &amp; Save
              </button>
            </div>
          </header>

          <div className="flex gap-4 px-6 py-2 border-t border-gray-200">
            {[1, 2].map((taskNum) => (
              <button
                key={taskNum}
                onClick={() => setActiveTask(taskNum as 1 | 2)}
                className={`pb-3 px-2 border-b-2 transition ${
                  activeTask === taskNum
                    ? "border-blue-600 text-blue-600 font-medium"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                }`}
              >
                Task {taskNum}
              </button>
            ))}
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-black">
              <NavLink to="/"><Button variant="ghost" size="sm">Home</Button></NavLink>
              <NavLink to="/writing/mock"><Button variant="ghost" size="sm">Mock Test</Button></NavLink>
              <NavLink to="/writing/relax"><Button variant="ghost" size="sm">Relax Mode</Button></NavLink>
            </div>
          </div>
        </div>
      )}

      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="w-full max-w-lg p-6 bg-white rounded-3xl shadow-2xl">
            <h2 className="text-xl font-semibold text-gray-900">Get AI Feedback?</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              Would you like in-depth AI feedback on your writing? Our AI will analyze your response
              for grammar, vocabulary, coherence, and task achievement.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                onClick={handleAcceptFeedback}
                disabled={checkingAccess}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                {checkingAccess ? "Checking..." : "Yes, get feedback"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeclineFeedback}
                disabled={checkingAccess}
                className="w-full sm:w-auto"
              >
                No, thanks
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Task {activeTask}</p>
            <p className="mt-1 text-sm text-gray-700">
              You should spend about {activeTask === 1 ? "20" : "40"} minutes on this task. Write
              at least {minWords} words.
            </p>
          </div>
          <Button
            type="button"
            variant={showHeader ? "outline" : "secondary"}
            onClick={() => setShowHeader((prev) => !prev)}
            className={showHeader ? "border-blue-200 text-blue-700 hover:bg-blue-50" : ""}
          >
            {showHeader ? "Hide header" : "Show header"}
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 p-6 overflow-y-auto bg-white border-r border-gray-200">
          <div className="space-y-6">
            {activeTask === 1 && task1 ? (
              <WritingTask1Preview task1={task1} />
            ) : activeTask === 2 && task2 ? (
              <WritingTask2Preview task2={task2.report} />
            ) : (
              <p className="text-sm text-gray-500">No question available yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col w-1/2 p-6 overflow-y-auto bg-gray-50">
          <textarea
            rows={25}
            value={activeTask === 1 ? userText1 : userText2}
            onChange={(e) =>
              activeTask === 1 ? setUserText1(e.target.value) : setUserText2(e.target.value)
            }
            placeholder="Start writing your response here..."
            className="flex-1 w-full p-4 text-sm text-gray-900 bg-white border border-gray-300 rounded outline-none resize-none placeholder:text-gray-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
          <div className="mt-4 text-right">
            <p className="text-sm text-gray-600">Words: {wordCount}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Practice;
