import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { decodeReport } from '../lib/reportEncoding';
import type { ReportData } from '../lib/reportEncoding';
import { saveSpacedRepResult, getFeedbackReportHistory } from '../firebase/firestore';
import type { EnhancedFeedbackResult, QuizQuestion } from '../types';

type Tab = 'overview' | 'priority' | 'detailed' | 'vocabulary' | 'grammar' | 'quiz';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'priority', label: 'Priority Fixes', icon: '🎯' },
  { id: 'detailed', label: 'Detailed', icon: '📝' },
  { id: 'vocabulary', label: 'Vocabulary', icon: '📚' },
  { id: 'grammar', label: 'Grammar', icon: '✏️' },
  { id: 'quiz', label: 'Quiz', icon: '🧠' },
];

const CAT_LABELS: Record<string, string> = {
  taskAchievement: 'Task Achievement',
  coherenceCohesion: 'Coherence & Cohesion',
  lexicalResource: 'Lexical Resource',
  grammaticalRangeAccuracy: 'Grammatical Range & Accuracy',
};

function categorizeIssue(issue: string): string | null {
  const lower = issue.toLowerCase();
  if (/article|a\/an|\bthe\b/.test(lower)) return 'Article usage';
  if (/subject.verb|agreement/.test(lower)) return 'Subject-verb agreement';
  if (/tense|past|present|future/.test(lower)) return 'Verb tense';
  if (/coher|cohes|connect|transition|discourse/.test(lower)) return 'Coherence & transitions';
  if (/vocab|word choice|lexical|synonym/.test(lower)) return 'Vocabulary range';
  if (/structur|organ|paragraph/.test(lower)) return 'Essay structure';
  if (/complex|clause|sentence variet/.test(lower)) return 'Sentence variety';
  if (/punctuat|comma|period/.test(lower)) return 'Punctuation';
  return null;
}

function scoreColor(score: number) {
  if (score >= 7) return 'text-green-700';
  if (score >= 6) return 'text-[#1e3a5f]';
  return 'text-amber-700';
}

function scoreBarColor(score: number) {
  if (score >= 7) return 'bg-green-500';
  if (score >= 6) return 'bg-[#1e3a5f]';
  return 'bg-amber-500';
}

export function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [selectedTask, setSelectedTask] = useState<'task1' | 'task2'>('task2');
  const [wordCountWarning, setWordCountWarning] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);
  const [hasBothTasks, setHasBothTasks] = useState(false);

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<EnhancedFeedbackResult | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [expandedCat, setExpandedCat] = useState<string | null>('taskAchievement');

  const [quizLoading, setQuizLoading] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState<Record<string, { correct: boolean; nextReviewDate: Date }>>({});
  const [quizError, setQuizError] = useState<string | null>(null);

  const [recurringIssues, setRecurringIssues] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const autoLoadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    try {
      const data = decodeReport(id);
      setReportData(data);
      const hasT1 = !!(data.task1?.report && data.userText1);
      const hasT2 = !!(data.task2?.report && data.userText2);
      setHasBothTasks(hasT1 && hasT2);
      if (hasT2) setSelectedTask('task2');
      else if (hasT1) setSelectedTask('task1');
    } catch {
      setDecodeError(true);
    }
  }, [id]);

  useEffect(() => {
    if (!reportData) return;
    const essay = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
    const count = essay.trim().split(/\s+/).filter(Boolean).length;
    const min = selectedTask === 'task1' ? 150 : 250;
    if (count > 0 && count < min) {
      setWordCountWarning(
        `Your essay is ${count} words — below the IELTS minimum of ${min} words for ${selectedTask === 'task1' ? 'Task 1' : 'Task 2'}. Short essays are penalised for Task Achievement.`
      );
    } else {
      setWordCountWarning(null);
    }
  }, [reportData, selectedTask]);

  useEffect(() => {
    if (user === null) navigate('/auth');
  }, [user, navigate]);

  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';

  const loadFeedback = useCallback(async () => {
    if (!reportData || !user) return;

    const essay = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
    const question =
      selectedTask === 'task1' ? (reportData.task1?.report ?? '') : (reportData.task2?.report ?? '');
    const cacheKey = `feedback_${id}_${selectedTask}`;

    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        setFeedback(JSON.parse(cached) as EnhancedFeedbackResult);
        return;
      } catch { /* ignore */ }
    }

    setLoading(true);
    setFeedbackError(null);
    setFeedback(null);

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: essay,
          questionText: question,
          taskType: selectedTask === 'task1' ? 'Task 1' : 'Task 2',
          idToken,
        }),
      });

      const data = (await res.json()) as { feedback?: EnhancedFeedbackResult; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Feedback generation failed');

      setFeedback(data.feedback!);
      sessionStorage.setItem(cacheKey, JSON.stringify(data.feedback));

      getFeedbackReportHistory(user.uid, 5).then((history) => {
        const counts: Record<string, number> = {};
        history.flat().forEach((issue) => {
          const key = categorizeIssue(issue);
          if (key) counts[key] = (counts[key] ?? 0) + 1;
        });
        const recurring = Object.entries(counts)
          .filter(([, c]) => c >= 2)
          .sort(([, a], [, b]) => b - a)
          .map(([k]) => k);
        setRecurringIssues(recurring);
      }).catch(() => { /* non-critical */ });
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [reportData, selectedTask, user, id]);

  // Auto-load feedback once data + user + pro status are ready
  useEffect(() => {
    if (reportData && user && isPro && !autoLoadedRef.current) {
      autoLoadedRef.current = true;
      loadFeedback();
    }
  }, [reportData, user, isPro, loadFeedback]);

  const generateQuiz = async () => {
    if (!feedback || !user) return;
    setQuizLoading(true);
    setQuizError(null);
    setQuizQuestions(null);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizResults({});

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/retention-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vocabulary: feedback.vocabulary,
          grammar: feedback.grammar,
          topic: feedback.topic,
          idToken,
        }),
      });
      const data = (await res.json()) as { questions?: QuizQuestion[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Quiz generation failed');
      setQuizQuestions(data.questions ?? []);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Failed to generate quiz.');
    } finally {
      setQuizLoading(false);
    }
  };

  const submitQuiz = async () => {
    if (!quizQuestions || !user) return;
    const results: Record<string, { correct: boolean; nextReviewDate: Date }> = {};
    for (const q of quizQuestions) {
      const correct = quizAnswers[q.id] === q.correctAnswer;
      const { nextReviewDate } = await saveSpacedRepResult(user.uid, q.itemRef, q.itemRef, correct);
      results[q.id] = { correct, nextReviewDate };
    }
    setQuizResults(results);
    setQuizSubmitted(true);
  };

  const exportPDF = async () => {
    if (!feedback) return;
    setExporting(true);

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 18;
    const lineW = pageW - margin * 2;
    let y = 28;

    const newPage = () => { pdf.addPage(); y = 20; };
    const addText = (
      text: string,
      fontSize: number,
      bold = false,
      color: [number, number, number] = [44, 44, 44]
    ) => {
      pdf.setFontSize(fontSize);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(text, lineW) as string[];
      if (y + lines.length * (fontSize * 0.45) > 275) newPage();
      pdf.text(lines, margin, y);
      y += lines.length * (fontSize * 0.45) + 3;
    };
    const spacer = (h = 5) => { y += h; };

    pdf.setFillColor(30, 58, 95);
    pdf.rect(0, 0, pageW, 20, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text('WriteReady IELTS — AI Feedback Report', margin, 13);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(
      `Generated ${new Date().toLocaleDateString()} · ${feedback.taskType} · ${feedback.wordCount} words`,
      margin,
      18
    );

    pdf.setFillColor(249, 247, 242);
    pdf.rect(0, 20, pageW, 22, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 58, 95);
    pdf.text('Overall Band Score:', margin, 30);
    pdf.setFontSize(20);
    pdf.setTextColor(201, 144, 10);
    pdf.text(feedback.scores.overall.toFixed(1), margin + 45, 36);
    y = 50;

    addText('Category Scores', 12, true, [30, 58, 95]);
    (
      [
        ['Task Achievement', feedback.scores.taskAchievement],
        ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
        ['Lexical Resource', feedback.scores.lexicalResource],
        ['Grammatical Range & Accuracy', feedback.scores.grammaticalRangeAccuracy],
      ] as [string, number][]
    ).forEach(([name, score]) => addText(`${name}: ${score.toFixed(1)}`, 10));
    spacer(4);

    addText('Priority Fixes', 12, true, [30, 58, 95]);
    feedback.priorityFixes.forEach((fix, i) => addText(`${i + 1}. ${fix}`, 10));
    spacer(4);

    addText('Band Gap Analysis', 12, true, [30, 58, 95]);
    addText(feedback.bandGapAnalysis, 10);
    spacer(6);

    addText('Detailed Feedback', 12, true, [30, 58, 95]);
    (
      [
        ['Task Achievement', feedback.feedback.taskAchievement],
        ['Coherence & Cohesion', feedback.feedback.coherenceCohesion],
        ['Lexical Resource', feedback.feedback.lexicalResource],
        ['Grammatical Range & Accuracy', feedback.feedback.grammaticalRangeAccuracy],
      ] as [string, { strengths: string[]; issues: string[] }][]
    ).forEach(([name, cat]) => {
      addText(name, 11, true);
      cat.strengths.forEach((s) => addText(`  ✓ ${s}`, 9, false, [22, 101, 52]));
      cat.issues.forEach((s) => addText(`  ✗ ${s}`, 9, false, [185, 28, 28]));
      spacer(3);
    });

    newPage();
    addText('Vocabulary', 12, true, [30, 58, 95]);
    feedback.vocabulary.forEach((v) => {
      addText(v.word, 10, true, [201, 144, 10]);
      addText(`  O'zbek: ${v.uzbek} · English: ${v.english}`, 9, false, [107, 114, 128]);
      addText(`  "${v.exampleFromEssay}"`, 9, false, [75, 85, 99]);
      spacer(2);
    });

    newPage();
    addText('Grammar Points', 12, true, [30, 58, 95]);
    feedback.grammar.forEach((g, i) => {
      addText(`${i + 1}. ${g.point}`, 10, true);
      addText(`  ${g.explanation}`, 9);
      addText(`  Example: "${g.example}"`, 9, false, [75, 85, 99]);
      spacer(2);
    });

    pdf.save(`WriteReady_Feedback_${new Date().toISOString().slice(0, 10)}.pdf`);
    setExporting(false);
  };

  // ── Early returns ──────────────────────────────────────────────────────────

  if (decodeError) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <p className="text-gray-500 mb-4">Invalid feedback link.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  if (!reportData) {
    return (
      <Layout>
        <div className="py-16 text-center text-gray-500">Loading…</div>
      </Layout>
    );
  }

  if (profile && !isPro) {
    return (
      <Layout>
        <div className="bg-[#f9f7f2] min-h-[calc(100vh-120px)] py-10">
          <div className="container mx-auto max-w-xl px-4">
            <div className="bg-[#1e3a5f] rounded-2xl p-10 text-center text-white">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="font-[Fraunces,serif] text-2xl font-bold mb-3">
                AI Feedback Requires Pro
              </h2>
              <p className="text-white/70 mb-7 leading-relaxed">
                Your essay has been saved. Upgrade to Pro to unlock AI-powered feedback with band scores,
                vocabulary flashcards, grammar analysis, and retention quizzes.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link to="/pricing">
                  <Button size="lg" style={{ background: '#c9900a' }}>Upgrade to Pro</Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="secondary" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
                    Back to Dashboard
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <Layout>
      <style>{`
        .fp-flip-card { perspective: 1000px; cursor: pointer; }
        .fp-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
        .fp-flip-inner.is-flipped { transform: rotateY(180deg); }
        .fp-flip-face { position: absolute; top: 0; left: 0; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.25rem; box-sizing: border-box; text-align: center; }
        .fp-flip-back { transform: rotateY(180deg); }
      `}</style>

      <div className="bg-[#f9f7f2] min-h-[calc(100vh-120px)] py-10">
        <div className="container mx-auto max-w-[880px] px-4">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <Link to="/dashboard" className="text-sm text-gray-500 hover:text-[#1e3a5f] transition-colors">
                ← Dashboard
              </Link>
              <h1 className="font-[Fraunces,serif] text-3xl font-extrabold text-[#1e3a5f] mt-1">
                AI Feedback Report
              </h1>
            </div>
            {feedback && (
              <Button onClick={exportPDF} loading={exporting} variant="secondary" size="sm">
                ⬇ Download PDF
              </Button>
            )}
          </div>

          {/* Task selector */}
          {hasBothTasks && (
            <div className="flex gap-2 mb-5">
              {(['task1', 'task2'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTask(t);
                    setFeedback(null);
                    setFeedbackError(null);
                    setActiveTab('overview');
                    autoLoadedRef.current = false;
                  }}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold border-[1.5px] transition-colors cursor-pointer ${
                    selectedTask === t
                      ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white'
                      : 'bg-white border-[#d4cfc7] text-[#2c2c2c] hover:border-[#1e3a5f]'
                  }`}
                >
                  {t === 'task1' ? 'Task 1' : 'Task 2'}
                </button>
              ))}
            </div>
          )}

          {/* Word count warning */}
          {wordCountWarning && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5 text-sm text-orange-800">
              ⚠️ {wordCountWarning}
            </div>
          )}

          {/* Question card */}
          <div className="bg-white rounded-xl px-6 py-5 border border-[#d4cfc7] border-l-4 border-l-[#1e3a5f] mb-6">
            <p className="text-[0.7rem] font-bold tracking-widest uppercase text-gray-500 mb-2">
              {selectedTask === 'task1' ? 'Task 1' : 'Task 2'} Question
            </p>
            <p className="font-[Georgia,serif] leading-[1.75] text-[#2c2c2c] text-[0.9375rem]">
              {selectedTask === 'task1' ? reportData.task1?.report : reportData.task2?.report}
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="bg-white rounded-xl p-12 text-center border border-[#d4cfc7]">
              <div className="text-5xl mb-4 animate-pulse">🤖</div>
              <p className="text-[#1e3a5f] font-semibold mb-1">Analysing your essay…</p>
              <p className="text-gray-500 text-sm">This usually takes 15–30 seconds.</p>
            </div>
          )}

          {/* Error */}
          {feedbackError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-5 mb-6">
              <p className="text-red-700 font-semibold mb-2">Error: {feedbackError}</p>
              <Button size="sm" onClick={loadFeedback}>Try again</Button>
            </div>
          )}

          {/* CTA — only shown if not pro (should rarely appear given auto-load) */}
          {!feedback && !loading && !feedbackError && (
            <div className="bg-white rounded-xl p-10 text-center border border-[#d4cfc7]">
              <div className="text-5xl mb-4">📋</div>
              <h3 className="font-[Fraunces,serif] text-[#1e3a5f] text-xl font-bold mb-2">
                Ready to analyse your essay?
              </h3>
              <p className="text-gray-500 mb-6 leading-relaxed max-w-sm mx-auto">
                Click below to get your band score, priority fixes, vocabulary flashcards, and grammar analysis.
              </p>
              <Button onClick={loadFeedback}>Generate AI Feedback</Button>
            </div>
          )}

          {/* ── Main feedback UI ─────────────────────────────────── */}
          {feedback && (
            <div>
              {/* Score banner */}
              <div className="bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] rounded-2xl px-8 py-7 mb-5 flex items-center gap-8 flex-wrap">
                <div className="text-center min-w-[90px]">
                  <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-white/50 mb-1">
                    Band Score
                  </p>
                  <div className="font-[IBM_Plex_Mono,monospace] text-[3.5rem] font-bold text-[#c9900a] leading-none">
                    {feedback.scores.overall.toFixed(1)}
                  </div>
                  <p className="text-[0.65rem] text-white/40 mt-1">{feedback.wordCount} words</p>
                </div>

                <div className="flex-1 min-w-[200px]">
                  <p className="text-white/45 text-[0.65rem] font-bold tracking-[0.08em] uppercase mb-3">
                    Category Scores
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {([
                      ['TA', feedback.scores.taskAchievement],
                      ['CC', feedback.scores.coherenceCohesion],
                      ['LR', feedback.scores.lexicalResource],
                      ['GRA', feedback.scores.grammaticalRangeAccuracy],
                    ] as [string, number][]).map(([abbr, score]) => (
                      <div key={abbr} className="flex items-center gap-2">
                        <span className="text-[0.65rem] text-white/45 w-8 font-[IBM_Plex_Mono,monospace]">{abbr}</span>
                        <div className="flex-1 h-1 bg-white/15 rounded-full">
                          <div
                            className="h-full bg-[#c9900a] rounded-full"
                            style={{ width: `${((score - 4) / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-[0.8rem] font-bold text-white font-[IBM_Plex_Mono,monospace] min-w-[28px] text-right">
                          {score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recurring issues */}
              {recurringIssues.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-5">
                  <p className="font-bold text-amber-800 text-sm mb-2">
                    🔁 Recurring patterns in your recent essays:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recurringIssues.map((issue) => (
                      <span
                        key={issue}
                        className="bg-amber-100 border border-amber-300 rounded-full px-3 py-0.5 text-[0.8rem] text-amber-900"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex gap-1 mb-6 bg-white border border-[#d4cfc7] rounded-xl p-1.5 overflow-x-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[0.8rem] font-medium whitespace-nowrap transition-all cursor-pointer ${
                      activeTab === tab.id
                        ? 'bg-[#1e3a5f] text-white font-bold'
                        : 'text-gray-500 hover:text-[#1e3a5f] hover:bg-gray-50'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW ──────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {([
                      ['Task Achievement', feedback.scores.taskAchievement],
                      ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
                      ['Lexical Resource', feedback.scores.lexicalResource],
                      ['Grammatical Range', feedback.scores.grammaticalRangeAccuracy],
                    ] as [string, number][]).map(([name, score]) => (
                      <div key={name} className="bg-white rounded-xl p-5 border border-[#d4cfc7] text-center">
                        <p className="text-[0.65rem] font-bold text-gray-500 uppercase tracking-wider mb-2 leading-snug">
                          {name}
                        </p>
                        <div className={`font-[IBM_Plex_Mono,monospace] text-[2.25rem] font-bold leading-none ${scoreColor(score)}`}>
                          {score.toFixed(1)}
                        </div>
                        <div className="h-[3px] bg-slate-100 rounded-full mt-3">
                          <div
                            className={`h-full rounded-full ${scoreBarColor(score)}`}
                            style={{ width: `${((score - 4) / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-[#d4cfc7] border-l-4 border-l-[#c9900a]">
                    <p className="font-bold text-[#1e3a5f] mb-3">📈 Band Gap Analysis</p>
                    <p className="text-[#2c2c2c] leading-[1.8] font-[Georgia,serif] text-[0.9375rem]">
                      {feedback.bandGapAnalysis}
                    </p>
                  </div>
                </div>
              )}

              {/* ── PRIORITY FIXES ────────────────────────────────── */}
              {activeTab === 'priority' && (
                <div className="flex flex-col gap-4">
                  {feedback.priorityFixes.map((fix, i) => (
                    <div
                      key={i}
                      className={`bg-white rounded-xl px-6 py-5 border border-[#d4cfc7] flex gap-5 items-start border-l-4 ${
                        i === 0 ? 'border-l-red-700' : i === 1 ? 'border-l-[#c9900a]' : 'border-l-green-700'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold font-[IBM_Plex_Mono,monospace] shrink-0 ${
                          i === 0 ? 'bg-red-700' : i === 1 ? 'bg-[#c9900a]' : 'bg-green-700'
                        }`}
                      >
                        {i + 1}
                      </div>
                      <div>
                        <p className={`text-[0.7rem] font-bold uppercase tracking-wider mb-1 ${
                          i === 0 ? 'text-red-700' : i === 1 ? 'text-amber-800' : 'text-green-700'
                        }`}>
                          {i === 0 ? 'High priority' : i === 1 ? 'Medium priority' : 'Also consider'}
                        </p>
                        <p className="text-[0.9375rem] text-[#2c2c2c] leading-[1.65]">{fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── DETAILED FEEDBACK ─────────────────────────────── */}
              {activeTab === 'detailed' && (
                <div className="flex flex-col gap-3">
                  {(Object.entries(feedback.feedback) as [string, { strengths: string[]; issues: string[] }][]).map(([key, cat]) => (
                    <div key={key} className="bg-white rounded-xl border border-[#d4cfc7] overflow-hidden">
                      <button
                        onClick={() => setExpandedCat(expandedCat === key ? null : key)}
                        className="w-full px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                      >
                        <span className="font-bold text-[#1e3a5f] text-[0.9375rem]">
                          {CAT_LABELS[key] ?? key}
                        </span>
                        <span className="text-gray-400 text-sm">{expandedCat === key ? '▲' : '▼'}</span>
                      </button>
                      {expandedCat === key && (
                        <div className="px-5 pb-5 border-t border-[#d4cfc7]">
                          {cat.strengths.length > 0 && (
                            <div className="mt-4 mb-3">
                              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-green-700 mb-2">
                                Strengths
                              </p>
                              {cat.strengths.map((s, i) => (
                                <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                  <span className="text-green-700 text-sm mt-0.5">✓</span>
                                  <p className="text-[0.9rem] text-[#2c2c2c] leading-[1.65]">{s}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {cat.issues.length > 0 && (
                            <div>
                              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-red-700 mb-2">
                                Issues to Improve
                              </p>
                              {cat.issues.map((s, i) => (
                                <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                  <span className="text-red-700 text-sm mt-0.5">✗</span>
                                  <p className="text-[0.9rem] text-[#2c2c2c] leading-[1.65]">{s}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── VOCABULARY ────────────────────────────────────── */}
              {activeTab === 'vocabulary' && (
                <div>
                  <p className="text-gray-500 text-sm mb-5">
                    Tap a card to flip it and see the meaning and example sentence.
                  </p>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(185px,1fr))] gap-4">
                    {feedback.vocabulary.map((v, i) => (
                      <div
                        key={i}
                        className="fp-flip-card h-[185px]"
                        onClick={() => setFlipped((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        <div className={`fp-flip-inner h-full${flipped[i] ? ' is-flipped' : ''}`}>
                          {/* Front */}
                          <div className="fp-flip-face bg-[#1e3a5f] border border-[#1e3a5f]">
                            <p className="text-[0.6rem] font-bold tracking-[0.1em] uppercase text-white/40 mb-3">
                              Word {i + 1} of {feedback.vocabulary.length}
                            </p>
                            <p className="font-[Georgia,serif] text-[1.2rem] font-bold text-white leading-snug">
                              {v.word}
                            </p>
                            <p className="text-[0.65rem] text-white/35 mt-auto">tap to flip ↩</p>
                          </div>
                          {/* Back */}
                          <div className="fp-flip-face fp-flip-back bg-[#f9f7f2] border border-[#d4cfc7]">
                            <div className="w-full">
                              <span className="bg-[#c9900a] text-white text-[0.6rem] font-bold px-2 py-0.5 rounded-full inline-block mb-2 uppercase tracking-wider">
                                O'zbek
                              </span>
                              <p className="text-[0.9rem] font-bold text-[#2c2c2c] mb-1">{v.uzbek}</p>
                              <p className="text-[0.75rem] text-gray-500 mb-2 leading-snug">{v.english}</p>
                              <p className="font-[Georgia,serif] text-[0.75rem] text-[#1e3a5f] italic leading-snug">
                                "{v.exampleFromEssay}"
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── GRAMMAR ───────────────────────────────────────── */}
              {activeTab === 'grammar' && (
                <div className="flex flex-col gap-3">
                  {feedback.grammar.map((g, i) => (
                    <div key={i} className="bg-white rounded-xl px-6 py-5 border border-[#d4cfc7]">
                      <div className="flex gap-4 items-start">
                        <div className="bg-[#1e3a5f]/10 text-[#1e3a5f] font-[IBM_Plex_Mono,monospace] font-bold text-[0.8rem] w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-[#1e3a5f] mb-1 text-[0.9375rem]">{g.point}</p>
                          <p className="text-sm text-[#2c2c2c] leading-[1.65] mb-2.5">{g.explanation}</p>
                          <div className="bg-[#c9900a]/10 border border-[#c9900a]/30 rounded-lg px-3.5 py-2.5">
                            <p className="text-[0.8rem] text-amber-900 italic font-[Georgia,serif]">
                              Example: "{g.example}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── RETENTION QUIZ ────────────────────────────────── */}
              {activeTab === 'quiz' && (
                <div>
                  {!quizQuestions && !quizLoading && (
                    <div className="bg-white rounded-xl p-10 text-center border border-[#d4cfc7]">
                      <div className="text-5xl mb-4">🧠</div>
                      <h3 className="font-[Fraunces,serif] text-[#1e3a5f] text-xl font-bold mb-2">
                        Test Your Retention
                      </h3>
                      <p className="text-gray-500 mb-6 leading-relaxed max-w-sm mx-auto">
                        Generate a 10-question quiz to reinforce vocabulary and grammar from this session.
                        Your results are tracked for spaced repetition review.
                      </p>
                      {quizError && (
                        <p className="text-red-700 text-sm mb-4">{quizError}</p>
                      )}
                      <Button onClick={generateQuiz}>Generate Quiz</Button>
                    </div>
                  )}

                  {quizLoading && (
                    <div className="bg-white rounded-xl p-12 text-center border border-[#d4cfc7]">
                      <div className="text-4xl mb-4 animate-pulse">✨</div>
                      <p className="text-[#1e3a5f] font-semibold">Generating your quiz…</p>
                    </div>
                  )}

                  {quizQuestions && !quizSubmitted && (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <p className="font-bold text-[#1e3a5f]">{quizQuestions.length} questions</p>
                        <p className="text-sm text-gray-500">
                          {Object.keys(quizAnswers).length} / {quizQuestions.length} answered
                        </p>
                      </div>
                      <div className="flex flex-col gap-4">
                        {quizQuestions.map((q, qi) => (
                          <div key={q.id} className="bg-white rounded-xl px-6 py-5 border border-[#d4cfc7]">
                            <p className="font-semibold text-[#1e3a5f] mb-4 leading-snug">
                              <span className="font-[IBM_Plex_Mono,monospace] text-gray-400 text-[0.8rem] mr-2">
                                Q{qi + 1}
                              </span>
                              {q.question}
                            </p>
                            <div className="flex flex-col gap-2">
                              {q.options.map((opt) => (
                                <label
                                  key={opt}
                                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg border-[1.5px] cursor-pointer text-[0.9rem] text-[#2c2c2c] transition-colors ${
                                    quizAnswers[q.id] === opt
                                      ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                                      : 'border-[#d4cfc7] hover:border-[#1e3a5f]/40'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={q.id}
                                    value={opt}
                                    checked={quizAnswers[q.id] === opt}
                                    onChange={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                    className="accent-[#1e3a5f] shrink-0"
                                  />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 text-center">
                        <Button
                          onClick={submitQuiz}
                          disabled={Object.keys(quizAnswers).length < quizQuestions.length}
                        >
                          Submit Answers
                        </Button>
                      </div>
                    </div>
                  )}

                  {quizSubmitted && quizQuestions && (
                    <div>
                      <div className="bg-[#1e3a5f] rounded-xl px-8 py-6 text-center mb-6 text-white">
                        <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-white/45 mb-1">
                          Quiz Score
                        </p>
                        <div className="font-[IBM_Plex_Mono,monospace] text-[2.75rem] font-bold text-[#c9900a]">
                          {Object.values(quizResults).filter((r) => r.correct).length} / {quizQuestions.length}
                        </div>
                        <p className="text-white/50 text-sm mt-1">
                          Review dates saved for spaced repetition
                        </p>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {quizQuestions.map((q, qi) => {
                          const result = quizResults[q.id];
                          return (
                            <div
                              key={q.id}
                              className={`rounded-xl p-4 border ${
                                result?.correct
                                  ? 'bg-green-50 border-green-200'
                                  : 'bg-red-50 border-red-200'
                              }`}
                            >
                              <div className="flex gap-2 items-start mb-1">
                                <span className="text-[0.9rem]">{result?.correct ? '✅' : '❌'}</span>
                                <p className="font-semibold text-[#2c2c2c] text-sm leading-snug">
                                  Q{qi + 1}: {q.question}
                                </p>
                              </div>
                              {!result?.correct && (
                                <p className="text-[0.8rem] text-red-700 ml-6 mb-1">
                                  Your answer: {quizAnswers[q.id] ?? 'No answer'}
                                </p>
                              )}
                              <p className="text-[0.8rem] text-green-700 ml-6 mb-1">
                                ✓ Correct: {q.correctAnswer}
                              </p>
                              {result?.nextReviewDate && (
                                <p className="text-[0.75rem] text-gray-500 ml-6">
                                  Next review: {result.nextReviewDate.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-5 text-center">
                        <Button variant="secondary" size="sm" onClick={generateQuiz}>
                          Retake Quiz
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="text-center mt-10">
            <Link to="/dashboard">
              <Button variant="secondary">← Try another question</Button>
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
}
