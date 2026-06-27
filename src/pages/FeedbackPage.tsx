import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { decodeReport } from '../lib/reportEncoding';
import type { ReportData } from '../lib/reportEncoding';
import { getFeedbackReportHistory } from '../firebase/firestore';
import type { EnhancedFeedbackResult } from '../types';

type Tab = 'overview' | 'priority' | 'detailed' | 'essay' | 'sample' | 'vocabulary' | 'grammar' | 'spelling' | 'quiz';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'priority', label: 'Priority Fixes', icon: '🎯' },
  { id: 'detailed', label: 'Detailed', icon: '📝' },
  { id: 'essay', label: 'Essay', icon: '🖊️' },
  { id: 'sample', label: 'Sample', icon: '✍️' },
  { id: 'vocabulary', label: 'Vocabulary', icon: '📚' },
  { id: 'grammar', label: 'Grammar', icon: '✏️' },
  { id: 'spelling', label: 'Spelling', icon: '🔍' },
  { id: 'quiz', label: 'Practice', icon: '🧠' },
];

// ── LanguageTool spelling checker ──────────────────────────────────────────
interface LTMatch {
  message: string;
  offset: number;
  length: number;
  replacements: { value: string }[];
  rule: { issueType: string; category: { name: string } };
}
function ltColor(issueType: string) {
  if (issueType === 'misspelling') return '#ef4444';
  if (issueType === 'grammar') return '#f59e0b';
  return '#3b82f6';
}
function buildSegments(text: string, matches: LTMatch[]) {
  const sorted = [...matches].sort((a, b) => a.offset - b.offset);
  const segs: { text: string; match?: LTMatch }[] = [];
  let cur = 0;
  for (const m of sorted) {
    if (m.offset > cur) segs.push({ text: text.slice(cur, m.offset) });
    segs.push({ text: text.slice(m.offset, m.offset + m.length), match: m });
    cur = m.offset + m.length;
  }
  if (cur < text.length) segs.push({ text: text.slice(cur) });
  return segs;
}

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

function PracticeResult({ result, accentClass }: {
  result: { score: number; correct: boolean; feedback: string; improved: string };
  accentClass?: string;
}) {
  const isSystemError = result.score === 0 && !result.correct && (
    result.feedback.includes('Tekshirib bo\'lmadi') ||
    result.feedback.includes('Tarmoq xatosi') ||
    result.feedback.includes('Evaluation failed') ||
    result.feedback.includes('not configured') ||
    result.feedback.includes('required')
  );

  if (isSystemError) {
    return (
      <div className="mt-2 rounded-lg px-3 py-2.5 border bg-amber-50 border-amber-200">
        <p className="text-xs font-bold text-amber-700 mb-1">⚠️ Tekshirib bo'lmadi</p>
        <p className="text-xs text-amber-800 m-0">{result.feedback}</p>
      </div>
    );
  }

  const improved = result.improved?.trim();
  return (
    <div className={`mt-2 rounded-lg px-3 py-2.5 border ${result.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${result.correct ? 'text-green-700' : 'text-red-700'}`}>
          {result.correct ? '✓ To\'g\'ri ishlatilgan' : '✗ Xato topildi'}
        </span>
        <span className="ml-auto text-xs font-mono font-bold text-gray-500">{result.score}/100</span>
      </div>
      {result.feedback && (
        <p className="text-sm text-gray-800 leading-relaxed m-0 mb-2">{result.feedback}</p>
      )}
      {improved && (
        <div className={`bg-white/80 rounded-lg px-3 py-2.5 border ${result.correct ? 'border-green-200' : 'border-red-200'}`}>
          <p className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${accentClass ?? 'text-[var(--ink-blue)]'}`}>
            ✨ Yaxshilangan versiya
          </p>
          <p className={`font-['Georgia'] text-sm leading-relaxed m-0 italic ${accentClass?.replace('text-', 'text-') ?? 'text-[var(--ink-blue)]'}`}>
            {improved}
          </p>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 7
      ? 'text-green-700'
      : score >= 6
      ? 'text-[var(--ink-blue)]'
      : 'text-amber-700';
  return (
    <span className={`font-mono font-bold text-4xl leading-none ${color}`}>
      {score.toFixed(1)}
    </span>
  );
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

  const [loadings, setLoadings] = useState<Record<string, boolean>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, EnhancedFeedbackResult>>({});
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const loading = loadings[selectedTask] ?? false;
  const feedback = feedbacks[selectedTask] ?? null;
  const feedbackError = feedbackErrors[selectedTask] ?? null;

  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [expandedCat, setExpandedCat] = useState<string | null>('taskAchievement');

  // Writing practice quiz
  const [practiceInputs, setPracticeInputs] = useState<Record<string, string>>({});
  const [practiceRevealed, setPracticeRevealed] = useState<Record<string, boolean>>({});
  const [practiceChecked, setPracticeChecked] = useState<Record<string, { score: number; correct: boolean; feedback: string; improved: string }>>({});
  const [practiceChecking, setPracticeChecking] = useState<Record<string, boolean>>({});

  // Essay sentence analysis
  const [activeSentence, setActiveSentence] = useState<number | null>(null);

  // Spelling checker (auto-filled from user's essay)
  const [ltMatches, setLtMatches] = useState<LTMatch[]>([]);
  const [ltCorrected, setLtCorrected] = useState('');
  const [ltChecked, setLtChecked] = useState(false);
  const [ltLoading, setLtLoading] = useState(false);
  const [ltError, setLtError] = useState<string | null>(null);
  const [ltPopover, setLtPopover] = useState<{ match: LTMatch; x: number; y: number } | null>(null);
  const [ltLang, setLtLang] = useState<'en-GB' | 'en-US'>('en-GB');
  const ltOverlayRef = useRef<HTMLDivElement>(null);

  const [recurringIssues, setRecurringIssues] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Decode report from URL
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

  // Word count check
  useEffect(() => {
    if (!reportData) return;
    const essay = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
    const count = essay.trim().split(/\s+/).filter(Boolean).length;
    const min = selectedTask === 'task1' ? 150 : 250;
    if (count > 0 && count < min) {
      setWordCountWarning(
        `Your essay is ${count} words — below the IELTS minimum of ${min} words for ${
          selectedTask === 'task1' ? 'Task 1' : 'Task 2'
        }. Short essays are penalised for Task Achievement.`
      );
    } else {
      setWordCountWarning(null);
    }
  }, [reportData, selectedTask]);

  // Redirect if not logged in
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
        const parsed = JSON.parse(cached) as EnhancedFeedbackResult;
        // Invalidate cache if it's missing the improved field (old format)
        const hasImproved = parsed.sentenceAnalysis?.some(s => 'improved' in s);
        if (hasImproved || !parsed.sentenceAnalysis?.length) {
          setFeedbacks((p) => ({ ...p, [selectedTask]: parsed }));
          return;
        }
        sessionStorage.removeItem(cacheKey);
      } catch { /* ignore */ }
    }

    const taskKey = selectedTask;
    setLoadings((p) => ({ ...p, [taskKey]: true }));
    setFeedbackErrors((p) => { const n = { ...p }; delete n[taskKey]; return n; });

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          essayText: essay,
          questionText: question,
          taskType: selectedTask === 'task1' ? 'Task 1' : 'Task 2',
        }),
      });

      const text = await res.text();
      let data: { feedback?: EnhancedFeedbackResult; error?: string } = {};
      try { data = JSON.parse(text); } catch { throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`); }
      if (!res.ok) throw new Error(data.error ?? 'Feedback generation failed');

      setFeedbacks((p) => ({ ...p, [taskKey]: data.feedback! }));
      sessionStorage.setItem(cacheKey, JSON.stringify(data.feedback));

      getFeedbackReportHistory(user.uid, 5)
        .then((history) => {
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
        })
        .catch(() => {/* non-critical */});
    } catch (err) {
      setFeedbackErrors((p) => ({ ...p, [taskKey]: err instanceof Error ? err.message : 'Something went wrong.' }));
    } finally {
      setLoadings((p) => ({ ...p, [taskKey]: false }));
    }
  }, [reportData, selectedTask, user, id]);

  // Auto-load feedback when ready (per task)
  useEffect(() => {
    if (reportData && user && isPro && !feedback && !loading && !feedbackError) {
      loadFeedback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportData, user, isPro, selectedTask]);

  const runSpellCheck = async (text: string) => {
    if (!text.trim()) return;
    setLtLoading(true);
    setLtError(null);
    setLtPopover(null);
    try {
      const params = new URLSearchParams({ text, language: ltLang, disabledRules: 'WHITESPACE_RULE' });
      const res = await fetch('https://api.languagetool.org/v2/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error('LanguageTool API error');
      const data = await res.json() as { matches: LTMatch[] };
      setLtMatches(data.matches);
      setLtCorrected(text);
      setLtChecked(true);
    } catch {
      setLtError('Could not reach spelling checker. Please try again.');
    } finally {
      setLtLoading(false);
    }
  };

  const checkPracticeSentence = async (
    key: string,
    text: string,
    targetItem: string,
    targetType: 'vocab' | 'grammar',
    example?: string,
  ) => {
    if (!text.trim() || !user) return;
    setPracticeChecking((p) => ({ ...p, [key]: true }));
    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/check-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ userSentence: text, targetItem, targetType, example }),
      });
      const data = await res.json() as { score?: number; correct?: boolean; feedback?: string; improved?: string; error?: string };
      if (!res.ok || data.error) {
        setPracticeChecked((p) => ({ ...p, [key]: {
          score: 0,
          correct: false,
          feedback: data.error ?? 'Tekshirib bo\'lmadi. Qayta urinib ko\'ring.',
          improved: '',
        }}));
        return;
      }
      setPracticeChecked((p) => ({ ...p, [key]: {
        score: Number(data.score) || 0,
        correct: Boolean(data.correct),
        feedback: data.feedback ?? '',
        improved: data.improved ?? '',
      }}));
    } catch (err) {
      setPracticeChecked((p) => ({ ...p, [key]: {
        score: 0,
        correct: false,
        feedback: `Tarmoq xatosi: ${(err as Error).message}`,
        improved: '',
      }}));
    } finally {
      setPracticeChecking((p) => ({ ...p, [key]: false }));
    }
  };

  const applyLtFix = (match: LTMatch, replacement: string) => {
    setLtCorrected((prev) => prev.slice(0, match.offset) + replacement + prev.slice(match.offset + match.length));
    setLtMatches((prev) => prev.filter((m) => m !== match));
    setLtPopover(null);
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
      margin, 18
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
    ([
      ['Task Achievement', feedback.scores.taskAchievement],
      ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
      ['Lexical Resource', feedback.scores.lexicalResource],
      ['Grammatical Range & Accuracy', feedback.scores.grammaticalRangeAccuracy],
    ] as [string, number][]).forEach(([name, score]) => addText(`${name}: ${score.toFixed(1)}`, 10));
    spacer(4);

    addText('Priority Fixes', 12, true, [30, 58, 95]);
    feedback.priorityFixes.forEach((fix, i) => addText(`${i + 1}. ${fix}`, 10));
    spacer(4);

    addText('Band Gap Analysis', 12, true, [30, 58, 95]);
    addText(feedback.bandGapAnalysis, 10);
    spacer(6);

    addText('Detailed Feedback', 12, true, [30, 58, 95]);
    ([
      ['Task Achievement', feedback.feedback.taskAchievement],
      ['Coherence & Cohesion', feedback.feedback.coherenceCohesion],
      ['Lexical Resource', feedback.feedback.lexicalResource],
      ['Grammatical Range & Accuracy', feedback.feedback.grammaticalRangeAccuracy],
    ] as [string, { strengths: string[]; issues: string[] }][]).forEach(([name, cat]) => {
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

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (decodeError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-[var(--text-muted)]">Invalid feedback link.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  if (!reportData) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
          Loading…
        </div>
      </Layout>
    );
  }

  if (profile && !isPro) {
    return (
      <Layout>
        <div className="bg-[var(--paper)] min-h-[calc(100vh-120px)] py-10">
          <div className="container mx-auto max-w-xl px-4">
            <div className="bg-[var(--ink-blue)] rounded-2xl p-10 text-center text-white">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="font-['Fraunces'] text-2xl font-bold mb-3">
                AI Feedback Requires Pro
              </h2>
              <p className="text-white/70 mb-7 leading-relaxed">
                Your essay has been saved. Upgrade to Pro to unlock AI-powered feedback with band
                scores, vocabulary flashcards, grammar analysis, and retention quizzes.
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Link to="/pricing">
                  <Button variant="gold" size="lg">Upgrade to Pro</Button>
                </Link>
                <Link to="/dashboard">
                  <Button variant="secondary">Back to Dashboard</Button>
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

      <div className="bg-[var(--paper)] min-h-[calc(100vh-120px)] py-10">
        <div className="container mx-auto max-w-4xl px-4">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <Link to="/dashboard" className="text-sm text-[var(--text-muted)] hover:underline">
                ← Dashboard
              </Link>
              <h1 className="font-['Fraunces'] text-3xl font-extrabold text-[var(--ink-blue)] mt-1">
                AI Feedback Report
              </h1>
            </div>
            {feedback && (
              <Button onClick={exportPDF} loading={exporting} variant="secondary" size="sm">
                ⬇ Download PDF
              </Button>
            )}
          </div>

          {/* ── Task selector ── */}
          {hasBothTasks && (
            <div className="flex gap-2 mb-5">
              {(['task1', 'task2'] as const).map((t) => {
                const hasFb = !!feedbacks[t];
                const isLoading = loadings[t];
                return (
                  <button
                    key={t}
                    onClick={() => { setSelectedTask(t); setActiveTab('overview'); }}
                    className={`px-5 py-1.5 rounded-full border-2 font-semibold text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                      selectedTask === t
                        ? 'border-[var(--ink-blue)] bg-[var(--ink-blue)] text-white'
                        : 'border-[var(--border)] bg-white text-gray-700 hover:border-[var(--ink-blue)]'
                    }`}
                  >
                    {t === 'task1' ? 'Task 1' : 'Task 2'}
                    {isLoading ? <span className="text-xs opacity-60">⏳</span> : hasFb ? <span className="text-xs opacity-80">✓</span> : null}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Word count warning ── */}
          {wordCountWarning && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-5 text-sm text-orange-800">
              ⚠️ {wordCountWarning}
            </div>
          )}

          {/* ── Question card ── */}
          <div className="bg-[var(--bg-card)] rounded-xl px-6 py-5 border border-[var(--border)] border-l-4 border-l-[var(--ink-blue)] mb-6">
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-muted)] mb-2">
              {selectedTask === 'task1' ? 'Task 1' : 'Task 2'} Question
            </p>
            {selectedTask === 'task1' && reportData.task1?.image && (
              (() => {
                const src = reportData.task1.image;
                const pdf = src.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(src);
                return pdf ? (
                  <object data={src} type="application/pdf" className="w-full h-[400px] rounded-lg border border-[var(--border)] mb-3">
                    <iframe src={src} className="w-full h-[400px] border-0 rounded-lg mb-3" title="Task 1 chart" />
                  </object>
                ) : (
                  <img
                    src={src}
                    alt="Task 1 chart"
                    className="w-full max-h-72 object-contain rounded-lg border border-[var(--border)] mb-3"
                  />
                );
              })()
            )}
            <p className="font-['Georgia'] leading-relaxed text-gray-800 text-[0.9375rem] m-0">
              {selectedTask === 'task1' ? reportData.task1?.report : reportData.task2?.report}
            </p>
          </div>

          {/* ── Loading ── */}
          {loading && (
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-12 text-center">
              <div className="text-5xl mb-4">🤖</div>
              <p className="font-semibold text-[var(--ink-blue)] mb-1">Analysing your essay…</p>
              <p className="text-sm text-[var(--text-muted)]">This usually takes up to 5 minutes.</p>
            </div>
          )}

          {/* ── Error ── */}
          {feedbackError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-5 mb-6">
              <p className="font-semibold text-red-700 mb-3">Error: {feedbackError}</p>
              <Button size="sm" onClick={loadFeedback}>Try again</Button>
            </div>
          )}

          {/* ── Main feedback UI ── */}
          {feedback && (
            <div>
              {/* Score banner */}
              <div className="rounded-2xl p-7 mb-5 flex items-center gap-8 flex-wrap bg-gradient-to-br from-[var(--ink-blue)] to-[#2d5a8e]">
                <div className="text-center min-w-[90px]">
                  <p className="text-[0.7rem] font-bold tracking-widest uppercase text-white/50 mb-1">
                    Band Score
                  </p>
                  <div className="font-['IBM_Plex_Mono'] text-[3.5rem] font-bold text-[var(--gold)] leading-none">
                    {feedback.scores.overall.toFixed(1)}
                  </div>
                  <p className="text-[0.7rem] text-white/40 mt-1">{feedback.wordCount} words</p>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-white/45 text-[0.7rem] font-bold tracking-widest uppercase mb-3">
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
                        <span className="text-[0.7rem] text-white/45 w-8 font-mono">{abbr}</span>
                        <div className="flex-1 h-1 bg-white/15 rounded-full">
                          <div
                            className="h-full bg-[var(--gold)] rounded-full"
                            style={{ width: `${((score - 4) / 5) * 100}%` }}
                          />
                        </div>
                        <span className="text-[0.8125rem] font-bold text-white font-mono min-w-[28px] text-right">
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
                        className="bg-amber-100 border border-amber-300 rounded-full px-3 py-0.5 text-[0.8125rem] text-amber-900"
                      >
                        {issue}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div className="flex gap-1 mb-6 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl p-1.5 overflow-x-auto">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[0.8125rem] whitespace-nowrap cursor-pointer transition-colors border-none ${
                      activeTab === tab.id
                        ? 'bg-[var(--ink-blue)] text-white font-bold'
                        : 'bg-transparent text-[var(--text-muted)] font-medium hover:text-gray-700'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {([
                      ['Task Achievement', feedback.scores.taskAchievement],
                      ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
                      ['Lexical Resource', feedback.scores.lexicalResource],
                      ['Grammatical Range', feedback.scores.grammaticalRangeAccuracy],
                    ] as [string, number][]).map(([name, score]) => (
                      <div key={name} className="bg-[var(--bg-card)] rounded-xl p-5 border border-[var(--border)] text-center">
                        <p className="text-[0.7rem] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 leading-snug">
                          {name}
                        </p>
                        <ScoreBadge score={score} />
                        <div className="h-1 bg-slate-100 rounded-full mt-3">
                          <div
                            className={`h-full rounded-full ${
                              score >= 7 ? 'bg-green-500' : score >= 6 ? 'bg-[var(--ink-blue)]' : 'bg-[var(--gold)]'
                            }`}
                            style={{ width: `${((score - 4) / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[var(--bg-card)] rounded-xl p-6 border border-[var(--border)] border-l-4 border-l-[var(--gold)]">
                    <p className="font-bold text-[var(--ink-blue)] mb-3">📈 Band Gap Analysis</p>
                    <p className="font-['Georgia'] leading-relaxed text-gray-800 text-[0.9375rem] m-0">
                      {feedback.bandGapAnalysis}
                    </p>
                  </div>
                </div>
              )}

              {/* ── PRIORITY FIXES ── */}
              {activeTab === 'priority' && (
                <div className="flex flex-col gap-4">
                  {feedback.priorityFixes.map((fix, i) => {
                    const accent = i === 0 ? '#b91c1c' : i === 1 ? '#c9900a' : '#166534';
                    const label = i === 0 ? 'High priority' : i === 1 ? 'Medium priority' : 'Also consider';
                    const labelColor = i === 0 ? 'text-red-700' : i === 1 ? 'text-amber-800' : 'text-green-700';
                    return (
                      <div
                        key={i}
                        className="bg-[var(--bg-card)] rounded-xl px-6 py-5 border border-[var(--border)] flex gap-5 items-start"
                        style={{ borderLeft: `4px solid ${accent}` }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-mono font-bold text-base shrink-0"
                          style={{ background: accent }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${labelColor}`}>
                            {label}
                          </p>
                          <p className="text-gray-800 leading-relaxed text-[0.9375rem] m-0">{fix}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── DETAILED FEEDBACK ── */}
              {activeTab === 'detailed' && (
                <div className="flex flex-col gap-3">
                  {(Object.entries(feedback.feedback) as [string, { strengths: string[]; issues: string[] }][]).map(
                    ([key, cat]) => (
                      <div key={key} className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                        <button
                          onClick={() => setExpandedCat(expandedCat === key ? null : key)}
                          className="w-full px-5 py-4 bg-transparent border-none flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold text-[var(--ink-blue)] text-[0.9375rem]">
                            {CAT_LABELS[key] ?? key}
                          </span>
                          <span className="text-[var(--text-muted)]">{expandedCat === key ? '▲' : '▼'}</span>
                        </button>
                        {expandedCat === key && (
                          <div className="px-5 pb-5 border-t border-[var(--border)]">
                            {cat.strengths.length > 0 && (
                              <div className="mt-4 mb-3">
                                <p className="text-[0.7rem] font-bold uppercase tracking-wider text-green-700 mb-2">
                                  Strengths
                                </p>
                                {cat.strengths.map((s, i) => (
                                  <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                    <span className="text-green-700 text-sm mt-0.5">✓</span>
                                    <p className="text-[0.9rem] text-gray-700 leading-relaxed m-0">{s}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {cat.issues.length > 0 && (
                              <div>
                                <p className="text-[0.7rem] font-bold uppercase tracking-wider text-red-700 mb-2">
                                  Issues to Improve
                                </p>
                                {cat.issues.map((s, i) => (
                                  <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                    <span className="text-red-700 text-sm mt-0.5">✗</span>
                                    <p className="text-[0.9rem] text-gray-700 leading-relaxed m-0">{s}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}

              {/* ── VOCABULARY ── */}
              {activeTab === 'vocabulary' && (
                <div>
                  <p className="text-sm text-[var(--text-muted)] mb-5">
                    Tap a card to flip it and see the meaning and example sentence.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {feedback.vocabulary.map((v, i) => (
                      <div
                        key={i}
                        className="fp-flip-card h-[185px]"
                        onClick={() => setFlipped((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        <div className={`fp-flip-inner h-full${flipped[i] ? ' is-flipped' : ''}`}>
                          <div
                            className="fp-flip-face bg-[var(--ink-blue)] text-white border border-[var(--ink-blue)]"
                          >
                            <p className="text-[0.65rem] font-bold tracking-widest uppercase text-white/40 mb-3">
                              Word {i + 1} of {feedback.vocabulary.length}
                            </p>
                            <p className="font-['Georgia'] text-xl font-bold text-white leading-snug">
                              {v.word}
                            </p>
                            <p className="text-[0.7rem] text-white/35 mt-auto">tap to flip ↩</p>
                          </div>
                          <div
                            className="fp-flip-face fp-flip-back bg-[var(--paper)] border border-[var(--border)]"
                          >
                            <div className="w-full">
                              <span className="bg-[var(--gold)] text-white text-[0.65rem] font-bold px-2 py-0.5 rounded-full inline-block mb-2 uppercase tracking-wide">
                                O'zbek
                              </span>
                              <p className="text-[0.9rem] font-bold text-gray-800 mb-1">{v.uzbek}</p>
                              <p className="text-[0.75rem] text-[var(--text-muted)] mb-2 leading-snug">{v.english}</p>
                              <p className="font-['Georgia'] text-[0.75rem] text-[var(--ink-blue)] italic leading-snug">
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

              {/* ── GRAMMAR ── */}
              {activeTab === 'grammar' && (
                <div className="flex flex-col gap-3">
                  {feedback.grammar.map((g, i) => (
                    <div key={i} className="bg-[var(--bg-card)] rounded-xl px-6 py-5 border border-[var(--border)]">
                      <div className="flex gap-4 items-start">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--ink-blue)]/10 text-[var(--ink-blue)] font-mono font-bold text-sm shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-[var(--ink-blue)] mb-1.5 text-[0.9375rem]">{g.point}</p>
                          <p className="text-sm text-gray-700 leading-relaxed mb-2.5">{g.explanation}</p>
                          <div className="bg-[var(--gold)]/10 border border-[var(--gold)]/30 rounded-lg px-3.5 py-2.5">
                            <p className="text-[0.8125rem] text-amber-900 italic font-['Georgia'] m-0">
                              Example: "{g.example}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ESSAY ANALYSIS ── */}
              {activeTab === 'essay' && (() => {
                const sentences = feedback.sentenceAnalysis ?? [];
                const typeColor: Record<string, { bg: string; border: string; label: string; dot: string }> = {
                  word_choice: { bg: 'bg-purple-50', border: 'border-purple-200', label: 'Word Choice', dot: 'bg-purple-500' },
                  grammar:     { bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Grammar',     dot: 'bg-amber-500'  },
                  coherence:   { bg: 'bg-blue-50',   border: 'border-blue-200',   label: 'Coherence',   dot: 'bg-blue-500'   },
                  structure:   { bg: 'bg-red-50',    border: 'border-red-200',    label: 'Structure',   dot: 'bg-red-500'    },
                  ok:          { bg: 'bg-green-50',  border: 'border-green-200',  label: 'Good',        dot: 'bg-green-500'  },
                };
                return (
                  <div>
                    <div className="flex flex-wrap gap-2 mb-5">
                      {Object.entries(typeColor).map(([type, style]) => (
                        <span key={type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.border}`}>
                          <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                          {style.label}
                        </span>
                      ))}
                    </div>
                    {sentences.length === 0 ? (
                      <p className="text-[var(--text-muted)] text-sm">No sentence analysis available.</p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {sentences.map((s, i) => {
                          const style = typeColor[s.type] ?? typeColor.ok;
                          const isOpen = activeSentence === i;
                          return (
                            <div
                              key={i}
                              className={`rounded-xl border px-5 py-3.5 cursor-pointer transition-all ${style.bg} ${style.border}`}
                              onClick={() => setActiveSentence(isOpen ? null : i)}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[0.9375rem] font-['Georgia'] text-gray-800 leading-relaxed m-0">
                                    {s.sentence}
                                  </p>
                                  {isOpen && (
                                    <div className="mt-2.5 pt-2.5 border-t border-current/10 flex flex-col gap-2">
                                      <div>
                                        <span className={`text-[0.65rem] font-bold uppercase tracking-widest mr-2 ${style.dot.replace('bg-', 'text-')}`}>
                                          {style.label}
                                        </span>
                                        <span className="text-sm text-gray-700">{s.feedback}</span>
                                      </div>
                                      {s.improved && s.type !== 'ok' && (
                                        <div className="bg-[var(--ink-blue)]/6 border border-[var(--ink-blue)]/20 rounded-lg px-3 py-2.5">
                                          <p className="text-[0.65rem] font-bold uppercase tracking-widest text-[var(--ink-blue)] mb-1">
                                            ✨ Improved version
                                          </p>
                                          <p className="font-['Georgia'] text-sm text-[var(--ink-blue)] leading-relaxed m-0 italic">
                                            {s.improved}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="text-[var(--text-muted)] text-xs shrink-0 mt-1">{isOpen ? '▲' : '▼'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── SAMPLE RESPONSE ── */}
              {activeTab === 'sample' && (
                <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] border-l-4 border-l-[var(--gold)] px-6 py-6">
                  <p className="text-xs font-bold tracking-widest uppercase text-[var(--gold)] mb-4">
                    ✍️ Band 7–8 Sample Response
                  </p>
                  <p className="font-['Georgia'] text-gray-800 leading-[1.9] text-[0.9375rem] whitespace-pre-wrap">
                    {feedback.sampleResponse ?? 'Sample response not available for this analysis.'}
                  </p>
                </div>
              )}

              {/* ── SPELLING CHECKER ── */}
              {activeTab === 'spelling' && (() => {
                const essayText = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
                return (
                <div>
                  {!ltChecked ? (
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-slate-50">
                        <div className="flex gap-1">
                          {(['en-GB', 'en-US'] as const).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => setLtLang(lang)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                                ltLang === lang
                                  ? 'bg-[var(--ink-blue)] text-white border-[var(--ink-blue)]'
                                  : 'bg-white text-gray-600 border-[var(--border)]'
                              }`}
                            >
                              {lang === 'en-GB' ? '🇬🇧 British' : '🇺🇸 American'}
                            </button>
                          ))}
                        </div>
                        <Button size="sm" onClick={() => runSpellCheck(essayText)} disabled={ltLoading || !essayText.trim()}>
                          {ltLoading ? 'Checking…' : 'Check my essay'}
                        </Button>
                      </div>
                      <div className="px-5 py-4 text-[0.9375rem] leading-relaxed text-gray-500 whitespace-pre-wrap min-h-[200px] font-['Georgia']">
                        {essayText || <span className="italic">No essay text available.</span>}
                      </div>
                      {ltError && <p className="px-5 pb-3 text-sm text-red-600">{ltError}</p>}
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] bg-slate-50">
                        <span className={`text-sm font-semibold ${ltMatches.length === 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {ltMatches.length === 0 ? '✓ No issues found' : `${ltMatches.length} issue${ltMatches.length !== 1 ? 's' : ''} found`}
                        </span>
                        <button
                          onClick={() => { setLtChecked(false); setLtMatches([]); setLtPopover(null); }}
                          className="text-sm text-[var(--text-muted)] underline cursor-pointer bg-transparent border-none"
                        >
                          Reset
                        </button>
                      </div>
                      <div
                        className="relative px-5 py-4 text-[0.9375rem] leading-relaxed text-gray-800 whitespace-pre-wrap min-h-[200px] cursor-default"
                        ref={ltOverlayRef}
                        onClick={() => setLtPopover(null)}
                      >
                        {buildSegments(ltCorrected, ltMatches).map((seg, i) =>
                          seg.match ? (
                            <mark
                              key={i}
                              style={{ background: 'transparent', borderBottom: `2px solid ${ltColor(seg.match.rule.issueType)}`, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const r = (e.target as HTMLElement).getBoundingClientRect();
                                const cr = ltOverlayRef.current!.getBoundingClientRect();
                                setLtPopover({ match: seg.match!, x: r.left - cr.left, y: r.bottom - cr.top + 6 });
                              }}
                            >{seg.text}</mark>
                          ) : <span key={i}>{seg.text}</span>
                        )}
                        {ltPopover && (
                          <div
                            className="absolute zoom-110 bg-[#0f172a] border border-[#1e3a5f] rounded-xl p-3.5 max-w-[280px] shadow-xl"
                            style={{ left: ltPopover.x, top: ltPopover.y }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-[0.8rem] text-slate-300 mb-2.5 leading-snug">{ltPopover.match.message}</p>
                            {ltPopover.match.replacements.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {ltPopover.match.replacements.slice(0, 5).map((r, i) => (
                                  <button
                                    key={i}
                                    onClick={() => applyLtFix(ltPopover.match, r.value)}
                                    className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded cursor-pointer border-none"
                                  >{r.value}</button>
                                ))}
                              </div>
                            )}
                            <p className="text-[0.65rem] text-slate-500 mt-2 uppercase tracking-wider">
                              {ltPopover.match.rule.category.name}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {ltChecked && ltMatches.length > 0 && (
                    <div className="mt-4 flex flex-col gap-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mb-1">All Issues</p>
                      {ltMatches.map((m, i) => (
                        <div key={i} className="bg-[var(--bg-card)] rounded-xl px-4 py-3 border border-[var(--border)] flex items-center gap-3">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ltColor(m.rule.issueType) }} />
                          <div className="flex-1 min-w-0">
                            <span className="font-semibold text-sm text-gray-900 block">"{ltCorrected.slice(m.offset, m.offset + m.length)}"</span>
                            <span className="text-xs text-[var(--text-muted)]">{m.message}</span>
                          </div>
                          {m.replacements.length > 0 && (
                            <button
                              onClick={() => applyLtFix(m, m.replacements[0].value)}
                              className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded cursor-pointer border-none shrink-0"
                            >{m.replacements[0].value}</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ── WRITING PRACTICE ── */}
              {activeTab === 'quiz' && (
                <div>
                  <p className="text-sm text-[var(--text-muted)] mb-5">
                    Write a sentence using each word or grammar rule. Tap <strong>Show example</strong> to check.
                  </p>
                  <div className="flex flex-col gap-4">
                    {feedback.vocabulary.map((v, i) => {
                      const key = `vocab_${i}`;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-xl px-5 py-4 border border-[var(--border)]">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="bg-[var(--ink-blue)]/10 text-[var(--ink-blue)] text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Vocab</span>
                            <span className="font-['Georgia'] font-bold text-[var(--ink-blue)] text-base">{v.word}</span>
                            <span className="text-xs text-[var(--text-muted)]">— {v.uzbek}</span>
                          </div>
                          <textarea
                            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-gray-800 resize-none outline-none focus:border-[var(--ink-blue)] transition-colors"
                            rows={2}
                            placeholder={`Write a sentence using "${v.word}"…`}
                            value={practiceInputs[key] ?? ''}
                            onChange={(e) => setPracticeInputs((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => checkPracticeSentence(key, practiceInputs[key] ?? '', v.word, 'vocab', v.exampleFromEssay)}
                              disabled={practiceChecking[key] || !(practiceInputs[key] ?? '').trim()}
                              className="text-xs bg-[var(--ink-blue)] text-white px-3 py-1 rounded cursor-pointer border-none disabled:opacity-40"
                            >
                              {practiceChecking[key] ? 'Tekshirilmoqda…' : '🤖 Gemini bilan tekshir'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-[var(--ink-blue)] underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Yashirish' : "Namuna ko'rish"}
                            </button>
                          </div>
                          {practiceChecked[key] && (
                            <PracticeResult result={practiceChecked[key]} accentClass="text-[var(--ink-blue)]" />
                          )}
                          {practiceRevealed[key] && (
                            <p className="mt-2 font-['Georgia'] text-sm text-[var(--ink-blue)] italic bg-[var(--ink-blue)]/5 rounded-lg px-3 py-2">
                              "{v.exampleFromEssay}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {feedback.grammar.map((g, i) => {
                      const key = `grammar_${i}`;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-xl px-5 py-4 border border-[var(--border)]">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="bg-[var(--gold)]/20 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Grammar</span>
                            <span className="font-bold text-gray-800 text-sm">{g.point}</span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mb-3">{g.explanation}</p>
                          <textarea
                            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-gray-800 resize-none outline-none focus:border-[var(--gold)] transition-colors"
                            rows={2}
                            placeholder={`Write an example using this rule…`}
                            value={practiceInputs[key] ?? ''}
                            onChange={(e) => setPracticeInputs((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => checkPracticeSentence(key, practiceInputs[key] ?? '', g.point, 'grammar', g.example)}
                              disabled={practiceChecking[key] || !(practiceInputs[key] ?? '').trim()}
                              className="text-xs bg-amber-700 text-white px-3 py-1 rounded cursor-pointer border-none disabled:opacity-40"
                            >
                              {practiceChecking[key] ? 'Tekshirilmoqda…' : '🤖 Gemini bilan tekshir'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-amber-700 underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Yashirish' : "Namuna ko'rish"}
                            </button>
                          </div>
                          {practiceChecked[key] && (
                            <PracticeResult result={practiceChecked[key]} accentClass="text-amber-800" />
                          )}
                          {practiceRevealed[key] && (
                            <p className="mt-2 font-['Georgia'] text-sm text-amber-900 italic bg-amber-50 rounded-lg px-3 py-2">
                              "{g.example}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
