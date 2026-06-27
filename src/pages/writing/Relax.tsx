import { useState, useRef, type PointerEvent, type CSSProperties } from "react";
import jsPDF from "jspdf";
import { NavLink, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { encodeReport } from "@/lib/reportEncoding";
import { CheckIcon, ChevronRightIcon, UploadIcon } from "lucide-react";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function isPdf(src: string) {
  return src.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(src);
}

function isPro(subscription: string | null): boolean {
  if (!subscription) return false;
  if (subscription === "forever") return true;
  return new Date(subscription) > new Date();
}

function Relax() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"select" | "configure" | "write">("select");
  const [activeTask, setActiveTask] = useState<1 | 2 | null>(null);
  const [prompt, setPrompt] = useState("");
  const [task2Prompt, setTask2Prompt] = useState("");
  const [userText, setUserText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);

  const [splitRatio, setSplitRatio] = useState(0.46);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  const wordCount = userText.trim() === "" ? 0 : userText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;
  const meetsMinWords = wordCount >= minWords;
  const currentProgress = Math.min(100, Math.round((wordCount / minWords) * 100));

  const handleSelectTask = (task: 1 | 2) => {
    setActiveTask(task);
    setPrompt(""); setTask2Prompt(""); setUserText(""); setImageUrl(null);
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
    setStep("select"); setActiveTask(null);
    setPrompt(""); setTask2Prompt(""); setUserText(""); setImageUrl(null); setShowFeedbackModal(false);
  };

  const handleSplitPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleSplitPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplit.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    setSplitRatio(Math.min(0.72, Math.max(0.28, (e.clientX - rect.left) / rect.width)));
  };
  const handleSplitPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    isDraggingSplit.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleDownloadPDF = () => {
    const pdfdoc = new jsPDF();
    const pageW = pdfdoc.internal.pageSize.getWidth();
    const pageH = pdfdoc.internal.pageSize.getHeight();
    const margin = 20;
    const contentW = pageW - margin * 2;

    pdfdoc.setFillColor(15, 23, 42);
    pdfdoc.rect(0, 0, pageW, 40, "F");
    pdfdoc.setFontSize(12); pdfdoc.setTextColor(255, 255, 255); pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text("WriteReady Relax", margin, 15);
    pdfdoc.setFontSize(16); pdfdoc.text(`Task ${activeTask} Notes`, margin, 30);
    pdfdoc.setFontSize(8); pdfdoc.setFont("helvetica", "normal");
    pdfdoc.text(new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), pageW - margin, 15, { align: "right" });

    let y = 52;
    const question = activeTask === 1 ? prompt : task2Prompt;
    if (question) {
      pdfdoc.setFontSize(10); pdfdoc.setTextColor(20, 20, 20); pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text("Question prompt", margin, y); y += 8;
      const pLines = pdfdoc.splitTextToSize(question, contentW);
      pdfdoc.setFont("helvetica", "normal"); pdfdoc.text(pLines, margin, y + 5); y += pLines.length * 5.5 + 12;
    }

    pdfdoc.setFont("helvetica", "bold"); pdfdoc.text("Answer", margin, y); y += 8;
    const aLines = pdfdoc.splitTextToSize(userText || "(No answer provided)", contentW);
    pdfdoc.setFont("helvetica", "normal"); pdfdoc.text(aLines, margin, y + 5);

    const pages = (pdfdoc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdfdoc.setPage(i);
      pdfdoc.setFillColor(15, 23, 42); pdfdoc.rect(0, pageH - 14, pageW, 14, "F");
      pdfdoc.setFontSize(7); pdfdoc.setTextColor(255, 255, 255);
      pdfdoc.text("WriteReady Relax", margin, pageH - 5);
      pdfdoc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 5, { align: "right" });
    }
    pdfdoc.save(`WriteReady_Relax_Task${activeTask}.pdf`);
    setShowFeedbackModal(true);
  };

  const handleAcceptFeedback = async () => {
    setCheckingAccess(true);
    try {
      const user = auth.currentUser;
      if (!user) { navigate("/auth"); return; }
      const snap = await getDoc(doc(db, "users", user.uid));
      const subscription = snap.exists() ? ((snap.data().subscription as string | null) ?? null) : null;
      if (!isPro(subscription)) { navigate("/pricing"); return; }

      const encoded = activeTask === 1
        ? encodeReport({ task1: { report: prompt, image: imageUrl ?? undefined }, task2: undefined, userText1: userText, userText2: "" })
        : encodeReport({ task1: undefined, task2: { report: task2Prompt }, userText1: "", userText2: userText });
      navigate(`/feedback/${encoded}`);
    } catch (err) {
      console.error(err); navigate("/auth");
    } finally {
      setCheckingAccess(false); setShowFeedbackModal(false);
    }
  };

  /* ── Step 1: select ── */
  if (step === "select") {
    return (
      <div className="flex flex-col min-h-screen bg-white font-sans">
        <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-semibold text-white/50 tracking-widest uppercase">WriteReady</span>
              <ChevronRightIcon className="hidden sm:block w-3 h-3 text-white/30" />
              <span className="text-sm font-medium text-white">Relax Mode</span>
            </div>
            <nav className="flex items-center gap-1">
              <NavLink to="/" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Home</NavLink>
              <NavLink to="/writing/mock" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Mock</NavLink>
              <NavLink to="/writing/practice" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Practice</NavLink>
            </nav>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 px-4">
          <div className="w-full max-w-lg space-y-10">
            <div className="space-y-2 text-center">
              <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">No time pressure</p>
              <h1 className="text-3xl font-bold text-slate-900">Choose your task</h1>
              <p className="text-sm text-slate-500">Write at your own pace with a custom prompt.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {([1, 2] as const).map((task) => (
                <button
                  key={task}
                  onClick={() => handleSelectTask(task)}
                  className="group p-7 text-left bg-white border-2 border-slate-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 group-hover:bg-blue-600 text-slate-600 group-hover:text-white text-sm font-bold transition-colors">
                      {task}
                    </span>
                  </div>
                  <p className="text-base font-semibold text-slate-800">Task {task}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {task === 1 ? "Describe a visual — chart, map, or diagram" : "Write an academic essay on a given topic"}
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
      <div className="flex flex-col min-h-screen bg-white font-sans">
        <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center justify-between gap-4 px-5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs font-semibold text-white/50 tracking-widest uppercase">WriteReady</span>
              <ChevronRightIcon className="hidden sm:block w-3 h-3 text-white/30" />
              <span className="text-sm font-medium text-white">Relax Mode</span>
              <ChevronRightIcon className="w-3 h-3 text-white/30" />
              <span className="text-sm text-white/60">Task {activeTask} setup</span>
            </div>
            <button onClick={handleReset} className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">
              ← Back
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center flex-1 px-4 py-10">
          <div className="w-full max-w-lg space-y-8">
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase">Task {activeTask}</p>
              <h1 className="text-2xl font-bold text-slate-900">Set up your prompt</h1>
              <p className="text-sm text-slate-500">
                {activeTask === 1
                  ? "Enter the question and optionally upload a chart or diagram."
                  : "Type the essay question you'd like to respond to."}
              </p>
            </div>

            <div className="space-y-5">
              {activeTask === 1 ? (
                <>
                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Task 1 prompt
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="The chart below shows… Summarise the information by selecting and reporting the main features…"
                      className="w-full h-28 px-4 py-3 text-sm text-slate-800 border border-slate-200 outline-none resize-none rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white transition placeholder:text-slate-300"
                    />
                  </div>

                  <div>
                    <label className="block mb-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      Chart / diagram <span className="text-slate-400 normal-case font-normal">(optional)</span>
                    </label>
                    <label className={`flex flex-col items-center justify-center gap-2 h-28 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${imageLoading ? "opacity-50 pointer-events-none" : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/40"}`}>
                      <UploadIcon className="w-5 h-5 text-slate-400" />
                      <span className="text-sm text-slate-400">{imageLoading ? "Loading…" : "Click to upload an image"}</span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="sr-only"
                        disabled={imageLoading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }}
                      />
                    </label>
                    {imageUrl && !imageLoading && (
                      <div className="mt-3 overflow-hidden border border-slate-200 rounded-lg">
                        {isPdf(imageUrl) ? (
                          <object data={imageUrl} type="application/pdf" className="w-full h-64">
                            <iframe src={imageUrl} className="w-full h-64 border-0" title="Task 1 chart" />
                          </object>
                        ) : (
                          <img src={imageUrl} alt="Preview" className="object-cover w-full max-h-64" />
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <label className="block mb-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wide">
                    Task 2 prompt
                  </label>
                  <textarea
                    value={task2Prompt}
                    onChange={(e) => setTask2Prompt(e.target.value)}
                    placeholder="Some people believe that… To what extent do you agree or disagree?"
                    className="w-full h-36 px-4 py-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 outline-none resize-none rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:bg-white transition placeholder:text-slate-300"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("write")}
                disabled={(activeTask === 1 && prompt.trim() === "") || (activeTask === 2 && task2Prompt.trim() === "")}
                className="flex-1 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Start writing
              </button>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
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
    <div className="flex flex-col min-h-screen bg-white font-sans">

      {/* Top bar */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="hidden sm:block text-xs font-semibold text-white/50 tracking-widest uppercase">WriteReady</span>
            <ChevronRightIcon className="hidden sm:block w-3 h-3 text-white/30" />
            <span className="text-sm font-medium text-white truncate">Relax Mode</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="hidden sm:inline-flex px-3 py-1.5 text-xs text-white/70 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors"
            >
              Start over
            </button>
            <nav className="hidden sm:flex items-center gap-1">
              <NavLink to="/" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Home</NavLink>
              <NavLink to="/writing/mock" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Mock</NavLink>
              <NavLink to="/writing/practice" className="px-3 py-1.5 text-xs text-white/60 hover:text-white border border-white/20 hover:border-white/40 rounded-md transition-colors">Practice</NavLink>
            </nav>
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
          <div className="h-full bg-white/60 transition-all duration-500" style={{ width: `${currentProgress}%` }} />
        </div>
      </div>

      {/* Task info strip */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-slate-50 border-b border-slate-200">
        <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-[10px] font-bold">
          {activeTask}
        </span>
        <p className="text-xs text-slate-600">
          No time limit — write at your own pace. At least <strong>{minWords} words</strong>.
        </p>
      </div>

      {/* Split panel */}
      <div
        ref={splitContainerRef}
        className="flex flex-col flex-1 overflow-hidden md:flex-row"
        style={{ "--split": splitRatio } as unknown as CSSProperties}
      >
        <div className="w-full overflow-y-auto bg-white border-b border-slate-200 md:w-[calc(var(--split)*100%)] md:border-b-0 md:border-r max-h-[42vh] md:max-h-none">
          <div className="p-6 w-full">
            {activeTask === 2 && <WritingTask2Preview task2={task2Prompt} />}
            {activeTask === 1 && imageUrl && <WritingTask1Preview task1={{ image: imageUrl, report: prompt }} />}
            {activeTask === 1 && !imageUrl && prompt && (
              <div className="p-5 border border-slate-200 rounded-xl bg-slate-50">
                <p className="text-sm text-slate-700 leading-relaxed">{prompt}</p>
              </div>
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
          <textarea
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
            className="flex-1 w-full p-6 text-[15px] leading-relaxed text-slate-800 bg-transparent outline-none resize-none placeholder:text-slate-300 focus:bg-white transition-colors duration-200 min-h-[300px] [scrollbar-gutter:stable]"
          />

          <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-slate-200 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${meetsMinWords ? "bg-emerald-500" : "bg-blue-400"}`}
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${meetsMinWords ? "text-emerald-600" : "text-slate-400"}`}>
                {wordCount} / {minWords} words{meetsMinWords && <span className="ml-1.5">✓</span>}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={handleReset} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
                Start over
              </button>
              <span className="text-slate-200">|</span>
              <button onClick={handleDownloadPDF} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors">
                Save PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-500" />
            <div className="p-7">
              <div className="flex items-center justify-center w-11 h-11 mx-auto rounded-full bg-blue-50">
                <CheckIcon className="w-5 h-5 text-blue-600" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-center text-slate-900">Session saved</h2>
              <p className="mt-2 text-sm leading-6 text-center text-slate-500">
                Would you like in-depth AI feedback on your writing? We'll analyse grammar, vocabulary, coherence, and task achievement.
              </p>
              <div className="flex flex-col gap-2.5 mt-6">
                <Button onClick={handleAcceptFeedback} disabled={checkingAccess} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  {checkingAccess ? "Checking…" : "Get AI feedback"}
                </Button>
                <Button variant="secondary" onClick={() => setShowFeedbackModal(false)} disabled={checkingAccess} className="w-full">
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

export default Relax;