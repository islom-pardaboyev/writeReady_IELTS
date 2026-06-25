import { useState } from "react";
import jsPDF from "jspdf";
import { NavLink, useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebase/firebase";
import { Button } from "@/components/ui/Button";
import WritingTask2Preview from "@/components/writingTask2Preview/WritingTask2Preview";
import WritingTask1Preview from "@/components/writingTask1Preview/WritingTask1Preview";
import { encodeReport } from "@/lib/reportEncoding";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
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

  const wordCount =
    userText.trim() === "" ? 0 : userText.trim().split(/\s+/).length;
  const minWords = activeTask === 1 ? 150 : 250;

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
      const dataUrl = await readFileAsDataUrl(file);
      setImageUrl(dataUrl);
    } catch (err) {
      console.error("Failed to read image file:", err);
      alert("Could not load that image. Please try a different file.");
    } finally {
      setImageLoading(false);
    }
  };

  const handleStartWriting = () => setStep("write");

  const handleReset = () => {
    setStep("select");
    setActiveTask(null);
    setPrompt("");
    setTask2Prompt("");
    setUserText("");
    setImageUrl(null);
    setShowFeedbackModal(false);
  };

  const handleDownloadPDF = () => {
    const pdfdoc = new jsPDF();
    const pageW = pdfdoc.internal.pageSize.getWidth();
    const pageH = pdfdoc.internal.pageSize.getHeight();
    const margin = 20;
    const contentW = pageW - margin * 2;

    pdfdoc.setFillColor(79, 70, 229);
    pdfdoc.rect(0, 0, pageW, 40, "F");
    pdfdoc.setFontSize(12);
    pdfdoc.setTextColor(255, 255, 255);
    pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text("WriteReady Relax", margin, 15);
    pdfdoc.setFontSize(16);
    pdfdoc.text(`Task ${activeTask} Notes`, margin, 30);
    pdfdoc.setFontSize(8);
    pdfdoc.setFont("helvetica", "normal");
    const dateStr = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    pdfdoc.text(dateStr, pageW - margin, 15, { align: "right" });

    let y = 52;
    const question = activeTask === 1 ? prompt : task2Prompt;
    if (question) {
      pdfdoc.setFontSize(10);
      pdfdoc.setTextColor(20, 20, 20);
      pdfdoc.setFont("helvetica", "bold");
      pdfdoc.text("Question prompt", margin, y);
      y += 8;
      const promptLines = pdfdoc.splitTextToSize(question, contentW);
      pdfdoc.setFont("helvetica", "normal");
      pdfdoc.text(promptLines, margin, y + 5);
      y += promptLines.length * 5.5 + 12;
    }

    pdfdoc.setFontSize(10);
    pdfdoc.setTextColor(20, 20, 20);
    pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text("Answer", margin, y);
    y += 8;
    const answerLines = pdfdoc.splitTextToSize(userText || "(No answer provided)", contentW);
    pdfdoc.setFont("helvetica", "normal");
    pdfdoc.text(answerLines, margin, y + 5);

    const pages = (pdfdoc.internal as any).getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdfdoc.setPage(i);
      pdfdoc.setFillColor(79, 70, 229);
      pdfdoc.rect(0, pageH - 12, pageW, 12, "F");
      pdfdoc.setFontSize(7);
      pdfdoc.setTextColor(255, 255, 255);
      pdfdoc.text("WriteReady Relax", margin, pageH - 4.5);
      pdfdoc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 4.5, { align: "right" });
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
      const subscription = snap.exists()
        ? ((snap.data().subscription as string | null) ?? null)
        : null;

      if (!isPro(subscription)) { navigate("/pricing"); return; }

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
      console.error("Failed to verify subscription:", err);
      navigate("/auth");
    } finally {
      setCheckingAccess(false);
      setShowFeedbackModal(false);
    }
  };

  const handleDeclineFeedback = () => setShowFeedbackModal(false);

  if (showFeedbackModal) {
    return (
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
    );
  }

  return (
    <section className="min-h-screen bg-white">
      <div className="px-8 py-3 border-b border-purple-200 bg-purple-50">
        <p className="text-sm text-gray-700">
          Create custom prompts and practice at your own pace with no time pressure.
        </p>
      </div>

      <main className="flex-1 bg-white">
        {/* Step 1: select task */}
        {step === "select" && (
          <div className="flex items-center justify-center min-h-[calc(100vh-49px)] px-4">
            <div className="w-full max-w-2xl space-y-8">
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-widest text-purple-600 uppercase">
                  Get Started
                </p>
                <h1 className="text-3xl font-bold text-gray-900">Choose your task</h1>
                <p className="text-base text-gray-600">
                  Pick a relaxed Task 1 or Task 2 prompt and continue when you are ready.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2].map((task) => (
                  <button
                    key={task}
                    onClick={() => handleSelectTask(task as 1 | 2)}
                    className="p-6 text-center transition bg-white border-2 border-gray-200 rounded-xl hover:border-blue-600 hover:bg-blue-50"
                  >
                    <div className="text-3xl font-bold text-gray-900">Task {task}</div>
                    <p className="mt-2 text-sm text-gray-600">
                      {task === 1
                        ? "Describe a visual (chart, map, diagram)"
                        : "Write an academic essay"}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: configure prompt */}
        {step === "configure" && activeTask && (
          <div className="flex items-center justify-center min-h-[calc(100vh-49px)] px-4 py-8">
            <div className="w-full max-w-2xl space-y-8">
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-widest text-purple-600 uppercase">
                  Create your prompt
                </p>
                <h1 className="text-3xl font-bold text-gray-900">Task {activeTask} setup</h1>
                <p className="text-base text-gray-600">
                  Enter the question text for Task {activeTask}
                  {activeTask === 1 ? " and upload a chart if needed" : ""}.
                </p>
              </div>

              <div className="space-y-6">
                {activeTask === 1 ? (
                  <>
                    <div>
                      <label className="block mb-2 text-sm font-medium text-gray-900">
                        Task 1 prompt
                      </label>
                      <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe the chart or map..."
                        className="w-full h-24 px-4 py-3 text-sm text-gray-900 transition bg-white border border-gray-200 outline-none resize-none rounded-xl ring-1 ring-gray-200 focus:border-blue-600 focus:ring-blue-600 placeholder:text-gray-400"
                      />
                    </div>

                    <div>
                      <label className="block mb-2 text-sm font-medium text-gray-900">
                        Upload image (optional)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleImageUpload(file);
                        }}
                        disabled={imageLoading}
                        className="block w-full p-3 text-sm text-gray-900 border border-gray-200 cursor-pointer rounded-xl focus:outline-none disabled:opacity-50"
                      />
                      {imageLoading && (
                        <p className="mt-2 text-xs text-gray-500">Loading image…</p>
                      )}
                    </div>

                    {imageUrl && !imageLoading && (
                      <div className="p-4 overflow-hidden border border-gray-200 rounded-xl bg-gray-50">
                        <img
                          src={imageUrl}
                          alt="Preview"
                          className="object-cover w-full rounded-lg max-h-96"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="block mb-2 text-sm font-medium text-gray-900">
                      Task 2 prompt
                    </label>
                    <textarea
                      value={task2Prompt}
                      onChange={(e) => setTask2Prompt(e.target.value)}
                      placeholder="Type your essay question prompt..."
                      className="w-full h-32 px-4 py-3 text-sm text-gray-900 transition bg-white border border-gray-200 outline-none resize-none rounded-xl ring-1 ring-gray-200 focus:border-blue-600 focus:ring-blue-600 placeholder:text-gray-400"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleStartWriting}
                  disabled={
                    (activeTask === 1 && prompt.trim() === "") ||
                    (activeTask === 2 && task2Prompt.trim() === "")
                  }
                  className="flex-1 px-6 py-3 font-medium text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Writing
                </button>
                <button
                  onClick={handleReset}
                  className="flex-1 px-6 py-3 font-medium text-gray-900 transition bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: write */}
        {step === "write" && activeTask && (
          <div className="flex flex-col" style={{ height: "calc(100vh - 49px)" }}>
            <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
              <div className="flex items-center justify-between px-6 py-4">
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Relax Mode</h1>
                  <p className="text-sm text-gray-500">
                    Task {activeTask} — Take your time and write naturally
                  </p>
                </div>
                <button
                  onClick={handleDownloadPDF}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  Download & Save
                </button>
              </div>

              <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">No time limit</span> — Write at your own pace
                  &nbsp;·&nbsp; {minWords} words minimum
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={handleReset}
                    className="px-4 py-1.5 text-sm border border-gray-300 bg-white text-gray-600 rounded-lg hover:bg-gray-50 transition"
                  >
                    Start Over
                  </button>
                  <NavLink to="/"><Button variant="ghost" size="sm">Home</Button></NavLink>
                  <NavLink to="/writing/mock"><Button variant="outline" size="sm">Mock</Button></NavLink>
                  <NavLink to="/writing/practice"><Button variant="outline" size="sm">Practice</Button></NavLink>
                </div>
              </div>
            </div>

            {/* Two-column layout */}
            <div className="flex flex-1 overflow-hidden">
              <div className="w-1/2 overflow-y-auto border-r border-gray-200 bg-white p-6">
                <div className="space-y-6">
                  {activeTask === 2 && <WritingTask2Preview task2={task2Prompt} />}
                  {activeTask === 1 && imageUrl && (
                    <WritingTask1Preview task1={{ image: imageUrl, report: prompt }} />
                  )}
                  {activeTask === 1 && !imageUrl && prompt && (
                    <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                      <p className="text-sm text-gray-700">{prompt}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex w-1/2 flex-col overflow-y-auto bg-gray-50 p-6">
                <textarea
                  value={userText}
                  rows={25}
                  onChange={(e) => setUserText(e.target.value)}
                  placeholder="Start writing your response here..."
                  className="flex-1 w-full resize-none rounded border border-gray-300 bg-white p-4 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
                <div className="mt-4 text-right">
                  <p className="text-sm text-gray-600">Words: {wordCount}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

export default Relax;
