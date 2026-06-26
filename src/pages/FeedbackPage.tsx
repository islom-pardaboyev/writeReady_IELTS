import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { decodeReport } from '../lib/reportEncoding';
import type { ReportData } from '../lib/reportEncoding';
import { saveSpacedRepResult, getFeedbackReportHistory } from '../firebase/firestore';
import type { EnhancedFeedbackResult, QuizQuestion } from '../types';

const CREAM = '#f9f7f2';
const INK = '#1e3a5f';
const GOLD = '#c9900a';
const BORDER = '#d4cfc7';
const TEXT = '#2c2c2c';
const MUTED = '#6b7280';
const GREEN = '#166534';
const RED = '#b91c1c';
const GREEN_BG = '#f0fdf4';
const RED_BG = '#fef2f2';

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
      }).catch(() => {/* non-critical */});
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [reportData, selectedTask, user, id]);

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

  if (decodeError) {
    return (
      <Layout>
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <p style={{ color: MUTED, marginBottom: '1rem' }}>Invalid feedback link.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  if (!reportData) {
    return (
      <Layout>
        <div style={{ padding: '4rem', textAlign: 'center', color: MUTED }}>Loading…</div>
      </Layout>
    );
  }

  if (profile && !isPro) {
    return (
      <Layout>
        <div style={{ padding: '2.5rem 0', background: CREAM, minHeight: 'calc(100vh - 120px)' }}>
          <div className="container" style={{ maxWidth: 640 }}>
            <div style={{ background: INK, borderRadius: 16, padding: '2.5rem', textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
              <h2 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.75rem', fontSize: '1.5rem' }}>
                AI Feedback Requires Pro
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.75rem', lineHeight: 1.7 }}>
                Your essay has been saved. Upgrade to Pro to unlock AI-powered feedback with band scores, vocabulary flashcards, grammar analysis, and retention quizzes.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/pricing">
                  <Button style={{ background: GOLD } as React.CSSProperties} size="lg">Upgrade to Pro</Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="secondary" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' } as React.CSSProperties}>
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

  return (
    <Layout>
      <style>{`
        .fp-flip-card { perspective: 1000px; cursor: pointer; }
        .fp-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
        .fp-flip-inner.is-flipped { transform: rotateY(180deg); }
        .fp-flip-face { position: absolute; top: 0; left: 0; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.25rem; box-sizing: border-box; text-align: center; }
        .fp-flip-back { transform: rotateY(180deg); }
      `}</style>

      <div style={{ background: CREAM, minHeight: 'calc(100vh - 120px)', padding: '2.5rem 0' }}>
        <div className="container" style={{ maxWidth: 880 }}>

          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <Link to="/dashboard" style={{ fontSize: '0.875rem', color: MUTED }}>← Dashboard</Link>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.75rem', fontWeight: 800, color: INK, marginTop: '0.375rem', marginBottom: 0 }}>
                AI Feedback Report
              </h1>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {feedback && (
                <Button onClick={exportPDF} loading={exporting} variant="secondary" size="sm">
                  ⬇ Download PDF
                </Button>
              )}
            </div>
          </div>

          {/* Task selector */}
          {hasBothTasks && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {(['task1', 'task2'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setSelectedTask(t);
                    setFeedback(null);
                    setFeedbackError(null);
                    setActiveTab('overview');
                  }}
                  style={{
                    padding: '0.375rem 1rem',
                    borderRadius: 20,
                    border: `1.5px solid ${selectedTask === t ? INK : BORDER}`,
                    background: selectedTask === t ? INK : 'white',
                    color: selectedTask === t ? 'white' : TEXT,
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                  }}
                >
                  {t === 'task1' ? 'Task 1' : 'Task 2'}
                </button>
              ))}
            </div>
          )}

          {/* Word count warning */}
          {wordCountWarning && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem', color: '#9a3412' }}>
              ⚠️ {wordCountWarning}
            </div>
          )}

          {/* Question card */}
          <div style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem', border: `1px solid ${BORDER}`, marginBottom: '1.5rem', borderLeft: `4px solid ${INK}` }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.5rem' }}>
              {selectedTask === 'task1' ? 'Task 1' : 'Task 2'} Question
            </p>
            <p style={{ fontFamily: 'Georgia, serif', lineHeight: 1.75, color: TEXT, fontSize: '0.9375rem', margin: 0 }}>
              {selectedTask === 'task1' ? reportData.task1?.report : reportData.task2?.report}
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🤖</div>
              <p style={{ color: INK, fontWeight: 600, marginBottom: '0.5rem' }}>Analysing your essay…</p>
              <p style={{ color: MUTED, fontSize: '0.875rem' }}>This usually takes 15–30 seconds.</p>
            </div>
          )}

          {/* Error */}
          {feedbackError && (
            <div style={{ background: RED_BG, border: '1px solid #fecaca', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <p style={{ color: RED, fontWeight: 600, marginBottom: '0.625rem' }}>Error: {feedbackError}</p>
              <Button size="sm" onClick={loadFeedback}>Try again</Button>
            </div>
          )}

          {/* CTA when no feedback yet */}
          {!feedback && !loading && !feedbackError && (
            <div style={{ background: 'white', borderRadius: 12, padding: '2.5rem', textAlign: 'center', border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📋</div>
              <h3 style={{ fontFamily: 'Fraunces, serif', color: INK, marginBottom: '0.5rem' }}>Ready to analyse your essay?</h3>
              <p style={{ color: MUTED, marginBottom: '1.5rem', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                Click below to get your band score, priority fixes, vocabulary flashcards, and grammar analysis.
              </p>
              <Button onClick={loadFeedback}>Generate AI Feedback</Button>
            </div>
          )}

          {/* Main feedback UI */}
          {feedback && (
            <div>
              {/* Score banner */}
              <div style={{
                background: `linear-gradient(135deg, ${INK} 0%, #2d5a8e 100%)`,
                borderRadius: 16,
                padding: '1.75rem 2rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                flexWrap: 'wrap',
              }}>
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '0.25rem' }}>
                    Band Score
                  </p>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '3.5rem', fontWeight: 700, color: GOLD, lineHeight: 1 }}>
                    {feedback.scores.overall.toFixed(1)}
                  </div>
                  <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.375rem' }}>
                    {feedback.wordCount} words
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
                    Category Scores
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                    {([
                      ['TA', feedback.scores.taskAchievement],
                      ['CC', feedback.scores.coherenceCohesion],
                      ['LR', feedback.scores.lexicalResource],
                      ['GRA', feedback.scores.grammaticalRangeAccuracy],
                    ] as [string, number][]).map(([abbr, score]) => (
                      <div key={abbr} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', width: 30, fontFamily: 'IBM Plex Mono, monospace' }}>{abbr}</span>
                        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${((score - 4) / 5) * 100}%`, background: GOLD, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'white', fontFamily: 'IBM Plex Mono, monospace', minWidth: 28, textAlign: 'right' }}>
                          {score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recurring issues */}
              {recurringIssues.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                  <p style={{ fontWeight: 700, color: '#92400e', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    🔁 Recurring patterns in your recent essays:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {recurringIssues.map((issue) => (
                      <span key={issue} style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 20, padding: '0.125rem 0.625rem', fontSize: '0.8125rem', color: '#78350f' }}>
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', background: 'white', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '0.375rem', overflowX: 'auto' }}>
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '0.5rem 0.875rem',
                      borderRadius: 8,
                      border: 'none',
                      background: activeTab === tab.id ? INK : 'transparent',
                      color: activeTab === tab.id ? 'white' : MUTED,
                      fontWeight: activeTab === tab.id ? 700 : 500,
                      fontSize: '0.8125rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'background 0.15s, color 0.15s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                    }}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW ─────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                    {([
                      ['Task Achievement', feedback.scores.taskAchievement],
                      ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
                      ['Lexical Resource', feedback.scores.lexicalResource],
                      ['Grammatical Range', feedback.scores.grammaticalRangeAccuracy],
                    ] as [string, number][]).map(([name, score]) => (
                      <div key={name} style={{ background: 'white', borderRadius: 12, padding: '1.25rem', border: `1px solid ${BORDER}`, textAlign: 'center' }}>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', lineHeight: 1.4 }}>
                          {name}
                        </p>
                        <div style={{
                          fontFamily: 'IBM Plex Mono, monospace',
                          fontSize: '2.25rem',
                          fontWeight: 700,
                          color: score >= 7 ? GREEN : score >= 6 ? INK : '#b45309',
                          lineHeight: 1,
                        }}>
                          {score.toFixed(1)}
                        </div>
                        <div style={{ height: 3, background: '#f1f5f9', borderRadius: 2, marginTop: '0.75rem' }}>
                          <div style={{ height: '100%', width: `${((score - 4) / 5) * 100}%`, background: score >= 7 ? '#22c55e' : score >= 6 ? INK : GOLD, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: 'white', borderRadius: 12, padding: '1.5rem', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${GOLD}` }}>
                    <p style={{ fontWeight: 700, color: INK, marginBottom: '0.75rem', fontSize: '0.9375rem' }}>
                      📈 Band Gap Analysis
                    </p>
                    <p style={{ color: TEXT, lineHeight: 1.8, fontFamily: 'Georgia, serif', fontSize: '0.9375rem', margin: 0 }}>
                      {feedback.bandGapAnalysis}
                    </p>
                  </div>
                </div>
              )}

              {/* ── PRIORITY FIXES ───────────────────────────────── */}
              {activeTab === 'priority' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {feedback.priorityFixes.map((fix, i) => (
                    <div key={i} style={{
                      background: 'white',
                      borderRadius: 12,
                      padding: '1.25rem 1.5rem',
                      border: `1px solid ${BORDER}`,
                      borderLeft: `4px solid ${i === 0 ? RED : i === 1 ? GOLD : GREEN}`,
                      display: 'flex',
                      gap: '1.25rem',
                      alignItems: 'flex-start',
                    }}>
                      <div style={{
                        background: i === 0 ? RED : i === 1 ? GOLD : GREEN,
                        color: 'white',
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontWeight: 700,
                        fontSize: '1rem',
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: i === 0 ? RED : i === 1 ? '#92400e' : GREEN, marginBottom: '0.375rem' }}>
                          {i === 0 ? 'High priority' : i === 1 ? 'Medium priority' : 'Also consider'}
                        </p>
                        <p style={{ fontSize: '0.9375rem', color: TEXT, lineHeight: 1.65, margin: 0 }}>{fix}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── DETAILED FEEDBACK ────────────────────────────── */}
              {activeTab === 'detailed' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(Object.entries(feedback.feedback) as [string, { strengths: string[]; issues: string[] }][]).map(([key, cat]) => (
                    <div key={key} style={{ background: 'white', borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedCat(expandedCat === key ? null : key)}
                        style={{ width: '100%', padding: '1rem 1.25rem', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                      >
                        <span style={{ fontWeight: 700, color: INK, fontSize: '0.9375rem' }}>
                          {CAT_LABELS[key] ?? key}
                        </span>
                        <span style={{ color: MUTED }}>{expandedCat === key ? '▲' : '▼'}</span>
                      </button>
                      {expandedCat === key && (
                        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: `1px solid ${BORDER}` }}>
                          {cat.strengths.length > 0 && (
                            <div style={{ marginTop: '1rem', marginBottom: '0.875rem' }}>
                              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: GREEN, marginBottom: '0.5rem' }}>
                                Strengths
                              </p>
                              {cat.strengths.map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.375rem', alignItems: 'flex-start' }}>
                                  <span style={{ color: GREEN, fontSize: '0.875rem', marginTop: 2 }}>✓</span>
                                  <p style={{ fontSize: '0.9rem', color: TEXT, lineHeight: 1.65, margin: 0 }}>{s}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {cat.issues.length > 0 && (
                            <div>
                              <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: RED, marginBottom: '0.5rem' }}>
                                Issues to Improve
                              </p>
                              {cat.issues.map((s, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.375rem', alignItems: 'flex-start' }}>
                                  <span style={{ color: RED, fontSize: '0.875rem', marginTop: 2 }}>✗</span>
                                  <p style={{ fontSize: '0.9rem', color: TEXT, lineHeight: 1.65, margin: 0 }}>{s}</p>
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

              {/* ── VOCABULARY ───────────────────────────────────── */}
              {activeTab === 'vocabulary' && (
                <div>
                  <p style={{ color: MUTED, fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                    Tap a card to flip it and see the meaning and example sentence.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '1rem' }}>
                    {feedback.vocabulary.map((v, i) => (
                      <div
                        key={i}
                        className="fp-flip-card"
                        style={{ height: 185 }}
                        onClick={() => setFlipped((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        <div className={`fp-flip-inner${flipped[i] ? ' is-flipped' : ''}`} style={{ height: '100%' }}>
                          <div className="fp-flip-face" style={{ background: INK, color: 'white', border: `1px solid ${INK}` }}>
                            <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '0.875rem' }}>
                              Word {i + 1} of {feedback.vocabulary.length}
                            </p>
                            <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
                              {v.word}
                            </p>
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: 'auto' }}>tap to flip ↩</p>
                          </div>
                          <div className="fp-flip-face fp-flip-back" style={{ background: CREAM, border: `1px solid ${BORDER}` }}>
                            <div style={{ width: '100%' }}>
                              <span style={{ background: GOLD, color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '0.125rem 0.5rem', borderRadius: 20, display: 'inline-block', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                O'zbek
                              </span>
                              <p style={{ fontSize: '0.9rem', fontWeight: 700, color: TEXT, marginBottom: '0.375rem' }}>{v.uzbek}</p>
                              <p style={{ fontSize: '0.75rem', color: MUTED, marginBottom: '0.5rem', lineHeight: 1.4 }}>{v.english}</p>
                              <p style={{ fontFamily: 'Georgia, serif', fontSize: '0.75rem', color: INK, fontStyle: 'italic', lineHeight: 1.5 }}>
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

              {/* ── GRAMMAR ──────────────────────────────────────── */}
              {activeTab === 'grammar' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {feedback.grammar.map((g, i) => (
                    <div key={i} style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem', border: `1px solid ${BORDER}` }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                        <div style={{ background: `${INK}18`, color: INK, fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, fontSize: '0.8125rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontWeight: 700, color: INK, marginBottom: '0.375rem', fontSize: '0.9375rem' }}>{g.point}</p>
                          <p style={{ fontSize: '0.875rem', color: TEXT, lineHeight: 1.65, marginBottom: '0.625rem' }}>{g.explanation}</p>
                          <div style={{ background: `${GOLD}15`, border: `1px solid ${GOLD}40`, borderRadius: 8, padding: '0.625rem 0.875rem' }}>
                            <p style={{ fontSize: '0.8125rem', color: '#78350f', fontStyle: 'italic', fontFamily: 'Georgia, serif', margin: 0 }}>
                              Example: "{g.example}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── RETENTION QUIZ ───────────────────────────────── */}
              {activeTab === 'quiz' && (
                <div>
                  {!quizQuestions && !quizLoading && (
                    <div style={{ background: 'white', borderRadius: 12, padding: '2.5rem', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🧠</div>
                      <h3 style={{ fontFamily: 'Fraunces, serif', color: INK, marginBottom: '0.5rem' }}>Test Your Retention</h3>
                      <p style={{ color: MUTED, marginBottom: '1.5rem', lineHeight: 1.65, maxWidth: 420, margin: '0 auto 1.5rem' }}>
                        Generate a 10-question quiz to reinforce vocabulary and grammar from this session. Your results are tracked for spaced repetition review.
                      </p>
                      {quizError && (
                        <p style={{ color: RED, fontSize: '0.875rem', marginBottom: '1rem' }}>{quizError}</p>
                      )}
                      <Button onClick={generateQuiz}>Generate Quiz</Button>
                    </div>
                  )}

                  {quizLoading && (
                    <div style={{ background: 'white', borderRadius: 12, padding: '3rem', textAlign: 'center', border: `1px solid ${BORDER}` }}>
                      <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✨</div>
                      <p style={{ color: INK, fontWeight: 600 }}>Generating your quiz…</p>
                    </div>
                  )}

                  {quizQuestions && !quizSubmitted && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                        <p style={{ fontWeight: 700, color: INK }}>{quizQuestions.length} questions</p>
                        <p style={{ fontSize: '0.875rem', color: MUTED }}>
                          {Object.keys(quizAnswers).length} / {quizQuestions.length} answered
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {quizQuestions.map((q, qi) => (
                          <div key={q.id} style={{ background: 'white', borderRadius: 12, padding: '1.25rem 1.5rem', border: `1px solid ${BORDER}` }}>
                            <p style={{ fontWeight: 600, color: INK, marginBottom: '1rem', lineHeight: 1.5 }}>
                              <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: MUTED, fontSize: '0.8rem', marginRight: '0.5rem' }}>Q{qi + 1}</span>
                              {q.question}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                              {q.options.map((opt) => (
                                <label
                                  key={opt}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.625rem 0.875rem',
                                    borderRadius: 8,
                                    border: `1.5px solid ${quizAnswers[q.id] === opt ? INK : BORDER}`,
                                    background: quizAnswers[q.id] === opt ? `${INK}0d` : 'transparent',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    color: TEXT,
                                    transition: 'border-color 0.1s',
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={q.id}
                                    value={opt}
                                    checked={quizAnswers[q.id] === opt}
                                    onChange={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                                    style={{ accentColor: INK, flexShrink: 0 }}
                                  />
                                  {opt}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
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
                      <div style={{ background: INK, borderRadius: 12, padding: '1.5rem 2rem', textAlign: 'center', marginBottom: '1.5rem', color: 'white' }}>
                        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '0.375rem' }}>
                          Quiz Score
                        </p>
                        <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '2.75rem', fontWeight: 700, color: GOLD }}>
                          {Object.values(quizResults).filter((r) => r.correct).length} / {quizQuestions.length}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', marginTop: '0.375rem' }}>
                          Review dates saved for spaced repetition
                        </p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {quizQuestions.map((q, qi) => {
                          const result = quizResults[q.id];
                          return (
                            <div
                              key={q.id}
                              style={{
                                background: result?.correct ? GREEN_BG : RED_BG,
                                borderRadius: 10,
                                padding: '1rem 1.25rem',
                                border: `1px solid ${result?.correct ? '#bbf7d0' : '#fecaca'}`,
                              }}
                            >
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.375rem' }}>
                                <span style={{ fontSize: '0.9rem' }}>{result?.correct ? '✅' : '❌'}</span>
                                <p style={{ fontWeight: 600, color: TEXT, fontSize: '0.875rem', lineHeight: 1.5, margin: 0 }}>
                                  Q{qi + 1}: {q.question}
                                </p>
                              </div>
                              {!result?.correct && (
                                <p style={{ fontSize: '0.8125rem', color: RED, marginLeft: '1.5rem', marginBottom: '0.25rem' }}>
                                  Your answer: {quizAnswers[q.id] ?? 'No answer'}
                                </p>
                              )}
                              <p style={{ fontSize: '0.8125rem', color: GREEN, marginLeft: '1.5rem', marginBottom: '0.25rem' }}>
                                ✓ Correct: {q.correctAnswer}
                              </p>
                              {result?.nextReviewDate && (
                                <p style={{ fontSize: '0.75rem', color: MUTED, marginLeft: '1.5rem' }}>
                                  Next review: {result.nextReviewDate.toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
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

          <div style={{ textAlign: 'center', marginTop: '2.5rem' }}>
            <Link to="/dashboard">
              <Button variant="secondary">← Try another question</Button>
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
}
