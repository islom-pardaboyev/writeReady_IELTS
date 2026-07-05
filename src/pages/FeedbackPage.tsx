import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import { useAuth } from '../hooks/useAuth';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { decodeReport } from '../lib/reportEncoding';
import type { ReportData } from '../lib/reportEncoding';
import { getFeedbackReportHistory } from '../firebase/firestore';
import type { EnhancedFeedbackResult } from '../types';

type Tab = 'overview' | 'priority' | 'detailed' | 'essay' | 'sample' | 'vocabulary' | 'grammar' | 'spelling' | 'quiz';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'priority', label: 'Priority', icon: '🎯' },
  { id: 'detailed', label: 'Detailed', icon: '📝' },
  { id: 'essay', label: 'Essay', icon: '🖊️' },
  { id: 'sample', label: 'Sample', icon: '✍️' },
  { id: 'vocabulary', label: 'Vocab', icon: '📚' },
  { id: 'grammar', label: 'Grammar', icon: '✏️' },
  { id: 'spelling', label: 'Spell', icon: '🔍' },
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
        <p className="text-xs font-bold text-amber-700 mb-1">⚠️ Could not check</p>
        <p className="text-xs text-amber-800 m-0">{result.feedback}</p>
      </div>
    );
  }

  const improved = result.improved?.trim();
  return (
    <div className={`mt-2 rounded-lg px-3 py-2.5 border ${result.correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-xs font-bold ${result.correct ? 'text-green-700' : 'text-red-700'}`}>
          {result.correct ? '✓ Correct' : '✗ Error found'}
        </span>
        <span className="ml-auto text-xs font-mono font-bold text-gray-500">{result.score}/100</span>
      </div>
      {result.feedback && (
        <p className="text-sm text-gray-800 leading-relaxed m-0 mb-2">{result.feedback}</p>
      )}
      {improved && (
        <div className={`bg-white/80 rounded-lg px-3 py-2.5 border ${result.correct ? 'border-green-200' : 'border-red-200'}`}>
          <p className={`text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${accentClass ?? 'text-[var(--ink-blue)]'}`}>
            ✨ Improved version
          </p>
          <p className={`font-['Georgia'] text-sm leading-relaxed m-0 italic ${accentClass?.replace('text-', 'text-') ?? 'text-[var(--ink-blue)]'}`}>
            {improved}
          </p>
        </div>
      )}
    </div>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4">🔒</div>
      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">This section is locked</h3>
      <p className="text-[var(--text-secondary)] text-sm max-w-xs mb-6">
        Upgrade to Basic, Standard, or Premium to unlock full analysis.
        The free preview shows only the overall band score and Task Achievement.
      </p>
      <a
        href="/pricing"
        className="inline-block bg-[var(--ink-blue)] text-white px-6 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
      >
        View plans →
      </a>
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
  const { user, profile, refreshProfile } = useAuth();

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

  // Essay sentence analysis — Set so multiple can be open simultaneously
  const [openSentences, setOpenSentences] = useState<Set<number>>(new Set());
  const toggleSentence = (i: number) =>
    setOpenSentences((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

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

  const isPro = profile?.plan === 'basic' || profile?.plan === 'standard' || profile?.plan === 'premium' || profile?.plan === 'forever';

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

      // Step 1: pre-check — Firebase auth + credit deduction (runs fast, separate timeout)
      const preRes = await fetch('/api/pre-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({}),
      });
      if (!preRes.ok) {
        const errText = await preRes.text();
        let errData: { error?: string } = {};
        try { errData = JSON.parse(errText); } catch { /* ignore */ }
        throw new Error(errData.error ?? `Server error (${preRes.status})`);
      }
      const { token: preCheckToken } = await preRes.json() as { token: string };

      // Step 2: feedback — only HMAC verify + Claude stream (no Firebase overhead)
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: essay,
          questionText: question,
          taskType: selectedTask === 'task1' ? 'Task 1' : 'Task 2',
          preCheckToken,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errData: { error?: string } = {};
        try { errData = JSON.parse(errText); } catch { /* ignore */ }
        throw new Error(errData.error ?? `Server error (${res.status})`);
      }

      // Read streaming response chunk by chunk
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let raw = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode(); // flush
      } else {
        raw = await res.text();
      }

      let parsedFeedback: EnhancedFeedbackResult;
      try {
        parsedFeedback = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      } catch {
        throw new Error('Feedback incomplete. Please try again.');
      }

      const feedbackWithLimit = { ...parsedFeedback, limited: parsedFeedback.limited ?? false };
      setFeedbacks((p) => ({ ...p, [taskKey]: feedbackWithLimit }));
      sessionStorage.setItem(cacheKey, JSON.stringify(feedbackWithLimit));
      refreshProfile().catch(() => {});

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
    const pageH = pdf.internal.pageSize.getHeight();
    const M = 16;          // margin
    const CW = pageW - M * 2; // content width
    const BOTTOM = pageH - 14;
    let y = 0;

    // helpers
    const guard = (need: number) => { if (y + need > BOTTOM) { pdf.addPage(); y = 16; } };

    const write = (
      text: string,
      size: number,
      opts: { bold?: boolean; color?: [number, number, number]; indent?: number; lineGap?: number } = {}
    ) => {
      const { bold = false, color = [44, 44, 44], indent = 0, lineGap = 1.8 } = opts;
      pdf.setFontSize(size);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setTextColor(...color);
      const lh = size * 0.3528 * 1.35; // mm per line
      const lines = pdf.splitTextToSize(text, CW - indent) as string[];
      const blockH = lines.length * lh + lineGap;
      guard(blockH);
      pdf.text(lines, M + indent, y);
      y += blockH;
    };

    const gap = (h = 4) => { y += h; };

    const section = (title: string) => {
      guard(14);
      gap(3);
      // coloured left bar
      pdf.setFillColor(30, 58, 95);
      pdf.rect(M, y - 4, 3, 9, 'F');
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(30, 58, 95);
      pdf.text(title, M + 5, y + 1);
      y += 7;
      pdf.setDrawColor(200, 210, 230);
      pdf.setLineWidth(0.25);
      pdf.line(M, y, M + CW, y);
      y += 4;
    };

    const pill = (label: string, x: number, py: number, bg: [number, number, number], fg: [number, number, number]) => {
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      const tw = pdf.getTextWidth(label) + 4;
      pdf.setFillColor(...bg);
      pdf.roundedRect(x, py - 3.5, tw, 5, 1.5, 1.5, 'F');
      pdf.setTextColor(...fg);
      pdf.text(label, x + 2, py);
    };

    // page footer helper
    const addFooters = () => {
      const total = (pdf.internal as any).getNumberOfPages() as number;
      for (let i = 1; i <= total; i++) {
        pdf.setPage(i);
        pdf.setFillColor(30, 58, 95);
        pdf.rect(0, pageH - 10, pageW, 10, 'F');
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(255, 255, 255);
        pdf.text('WriteReady IELTS — AI Feedback Report', M, pageH - 4);
        pdf.text(`Page ${i} of ${total}`, pageW - M, pageH - 4, { align: 'right' });
      }
    };

    // ── PAGE 1: Header + Scores ──────────────────────────────────
    pdf.setFillColor(30, 58, 95);
    pdf.rect(0, 0, pageW, 26, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('WriteReady IELTS', M, 11);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('AI Feedback Report', M, 17);
    pdf.text(
      `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${feedback.taskType} · ${feedback.wordCount} words`,
      pageW - M, 17, { align: 'right' }
    );
    y = 32;

    // Overall score box
    pdf.setFillColor(249, 247, 240);
    pdf.roundedRect(M, y, CW, 22, 3, 3, 'F');
    pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 58, 95);
    pdf.text('Overall Band Score', M + 4, y + 8);
    pdf.setFontSize(22); pdf.setTextColor(201, 144, 10);
    pdf.text(feedback.scores.overall.toFixed(1), M + 4, y + 18);
    pdf.setFontSize(8); pdf.setTextColor(130, 130, 130);
    pdf.text('(±0.5)', M + 22, y + 18);
    // Mini score grid on the right
    const cats: [string, number][] = [
      ['Task Achievement', feedback.scores.taskAchievement],
      ['Coherence & Cohesion', feedback.scores.coherenceCohesion],
      ['Lexical Resource', feedback.scores.lexicalResource],
      ['Grammar Range', feedback.scores.grammaticalRangeAccuracy],
    ];
    const colX = M + CW / 2 + 2;
    cats.forEach(([name, score], ci) => {
      const cy = y + 5 + ci * 4.5;
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(70, 70, 70);
      pdf.text(name, colX, cy);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(30, 58, 95);
      pdf.text(score.toFixed(1), M + CW - 1, cy, { align: 'right' });
    });
    y += 26;

    // ── Priority Fixes ───────────────────────────────────────────
    section('Priority Fixes');
    feedback.priorityFixes.forEach((fix, i) => {
      write(`${i + 1}.  ${fix}`, 9.5, { color: [44, 44, 44] });
      gap(2);
    });

    // ── Band Gap Analysis ────────────────────────────────────────
    section('Band Gap Analysis');
    write(feedback.bandGapAnalysis, 9.5);

    // ── Detailed Feedback ────────────────────────────────────────
    section('Detailed Feedback');
    ([
      ['Task Achievement', feedback.feedback.taskAchievement],
      ['Coherence & Cohesion', feedback.feedback.coherenceCohesion],
      ['Lexical Resource', feedback.feedback.lexicalResource],
      ['Grammatical Range & Accuracy', feedback.feedback.grammaticalRangeAccuracy],
    ] as [string, { strengths: string[]; issues: string[] }][]).forEach(([name, cat]) => {
      guard(12);
      write(name, 10, { bold: true, color: [30, 58, 95] });
      cat.strengths.forEach((s) => write(`✓  ${s}`, 9, { color: [22, 101, 52], indent: 2 }));
      cat.issues.forEach((s) => write(`✗  ${s}`, 9, { color: [185, 28, 28], indent: 2 }));
      gap(3);
    });

    // ── Your Essay ───────────────────────────────────────────────
    pdf.addPage(); y = 16;
    section('Your Essay');
    const essayText = selectedTask === 'task1' ? reportData!.userText1 : reportData!.userText2;
    write(essayText || '(No essay text)', 9.5, { color: [30, 41, 59] });

    // ── Sentence Analysis ────────────────────────────────────────
    if (feedback.sentenceAnalysis?.length) {
      section('Sentence-by-Sentence Analysis');
      const typeLabel: Record<string, string> = {
        word_choice: 'Word Choice', grammar: 'Grammar',
        coherence: 'Coherence', structure: 'Structure', ok: 'Good',
      };
      const typeColor2: Record<string, { bg: [number,number,number]; fg: [number,number,number] }> = {
        word_choice: { bg: [237,233,254], fg: [109,40,217] },
        grammar:     { bg: [254,243,199], fg: [146,64,14]  },
        coherence:   { bg: [219,234,254], fg: [30,64,175]  },
        structure:   { bg: [254,226,226], fg: [185,28,28]  },
        ok:          { bg: [220,252,231], fg: [22,101,52]  },
      };
      feedback.sentenceAnalysis.forEach((s, i) => {
        const labelText = typeLabel[s.type] ?? s.type;
        const tc = typeColor2[s.type] ?? typeColor2.ok;
        // estimate block height
        const sentLines = (pdf.splitTextToSize(s.sentence, CW - 20) as string[]).length;
        const fbLines  = s.feedback ? (pdf.splitTextToSize(s.feedback, CW - 22) as string[]).length : 0;
        const impLines = (s.improved && s.type !== 'ok') ? (pdf.splitTextToSize(s.improved, CW - 22) as string[]).length : 0;
        const blockH = (sentLines + fbLines + impLines) * 3.8 + 14;
        guard(blockH);

        // card bg
        pdf.setFillColor(250, 250, 252);
        pdf.roundedRect(M, y, CW, blockH - 4, 2, 2, 'F');
        pdf.setDrawColor(220, 225, 235);
        pdf.setLineWidth(0.2);
        pdf.roundedRect(M, y, CW, blockH - 4, 2, 2, 'D');
        y += 4;

        // number + pill
        pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(150, 150, 150);
        pdf.text(`${i + 1}`, M + 3, y + 1);
        pill(labelText, M + 9, y + 1, tc.bg, tc.fg);

        write(s.sentence, 9.5, { color: [44, 44, 44] });

        if (s.feedback) {
          write(`Feedback: ${s.feedback}`, 8.5, { color: [80, 80, 80], indent: 4 });
        }
        if (s.improved && s.type !== 'ok') {
          write(`Improved: ${s.improved}`, 8.5, { color: [30, 58, 95], indent: 4 });
        }
        gap(3);
      });
    }

    // ── Vocabulary ───────────────────────────────────────────────
    pdf.addPage(); y = 16;
    section('Vocabulary');
    feedback.vocabulary.forEach((v) => {
      const exLines = (pdf.splitTextToSize(`"${v.exampleFromEssay}"`, CW - 6) as string[]).length;
      guard(exLines * 3.8 + 14);
      write(v.word, 10.5, { bold: true, color: [201, 144, 10] });
      write(`O'zbek: ${v.uzbek}`, 9, { color: [107, 114, 128], indent: 3 });
      write(`English: ${v.english}`, 9, { color: [80, 80, 90], indent: 3 });
      write(`"${v.exampleFromEssay}"`, 9, { color: [30, 58, 95], indent: 3 });
      gap(4);
    });

    // ── Grammar Points ───────────────────────────────────────────
    pdf.addPage(); y = 16;
    section('Grammar Points');
    feedback.grammar.forEach((g, i) => {
      const expLines = (pdf.splitTextToSize(g.explanation, CW - 6) as string[]).length;
      const exLines  = (pdf.splitTextToSize(g.example, CW - 6) as string[]).length;
      guard((expLines + exLines) * 3.8 + 14);
      write(`${i + 1}.  ${g.point}`, 10, { bold: true, color: [30, 58, 95] });
      write(g.explanation, 9, { color: [60, 60, 60], indent: 4 });
      // example box
      const exH = exLines * 3.8 + 6;
      guard(exH + 2);
      pdf.setFillColor(253, 246, 227);
      pdf.roundedRect(M + 4, y, CW - 8, exH, 2, 2, 'F');
      y += 3;
      write(`Example: "${g.example}"`, 9, { color: [120, 80, 20], indent: 7 });
      y += 2;
      gap(4);
    });

    // ── Sample Response ──────────────────────────────────────────
    if (feedback.sampleResponse) {
      pdf.addPage(); y = 16;
      section('Sample Response (Band 7-9)');
      gap(1);
      write(feedback.sampleResponse, 10, { color: [30, 41, 59] });
    }

    addFooters();
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
                scores, vocabulary flashcards, grammar analysis, and sentence practice.
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

      <div className="bg-[var(--bg-base)] min-h-[calc(100vh-120px)] py-10">
        <div className="container mx-auto max-w-4xl px-4">

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
              >
                <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Dashboard
              </Link>
              <h1 className="font-['Fraunces'] text-3xl font-extrabold text-[var(--text-primary)] mt-1">
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
            <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 mb-5 text-sm text-orange-800">
              ⚠️ {wordCountWarning}
            </div>
          )}

          {/* ── Question card ── */}
          <div className="bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] border-l-4 border-l-[var(--ink-blue)] mb-6 shadow-sm">
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-secondary)] mb-2">
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
            <div className="rounded-2xl border border-[var(--border-color)] p-16 text-center bg-[var(--bg-card)]">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-5">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="font-semibold text-[var(--text-primary)] text-lg mb-1">Analysing your essay…</p>
              <p className="text-sm text-[var(--text-secondary)]">This usually takes up to 1-5 minutes.</p>
            </div>
          )}

          {/* ── Error ── */}
          {feedbackError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-5 mb-6">
              <p className="font-semibold text-red-700 mb-3">Error: {feedbackError}</p>
              <Button size="sm" onClick={loadFeedback}>Try again</Button>
            </div>
          )}

          {/* ── Main feedback UI ── */}
          {feedback && (
            <div>
              {/* Score banner */}
              <div className="rounded-2xl p-7 mb-5 flex items-center gap-8 flex-wrap bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm">
                {/* Overall score ring */}
                <div className="flex flex-col items-center min-w-[110px]">
                  <p className="text-[0.65rem] font-bold tracking-widest uppercase text-[var(--text-secondary)] mb-3">
                    Band Score
                  </p>
                  <div className="relative flex items-center justify-center">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="38" fill="none" stroke="var(--border-color)" strokeWidth="7" />
                      <circle
                        cx="48" cy="48" r="38" fill="none"
                        stroke={feedback.scores.overall >= 7 ? '#f59e0b' : feedback.scores.overall >= 6 ? 'var(--ink-blue)' : '#f59e0b'}
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 38}`}
                        strokeDashoffset={`${2 * Math.PI * 38 * (1 - (feedback.scores.overall - 4) / 5)}`}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className={`font-['IBM_Plex_Mono'] text-2xl font-bold leading-none ${
                        feedback.scores.overall >= 7 ? 'text-amber-500' : feedback.scores.overall >= 6 ? 'text-[var(--ink-blue)]' : 'text-amber-600'
                      }`}>
                        {feedback.scores.overall.toFixed(1)}
                      </span>
                      <span className="text-[0.6rem] text-[var(--text-secondary)] mt-0.5">/ 9.0</span>
                      <span className="text-[0.55rem] text-[var(--text-secondary)] opacity-60 mt-0.5">±0.5</span>
                    </div>
                  </div>
                  <p className="text-[0.65rem] text-[var(--text-secondary)] mt-2">{feedback.wordCount} words</p>
                </div>

                {/* Category bars */}
                <div className="flex-1 min-w-[200px]">
                  <p className="text-[var(--text-secondary)] text-[0.65rem] font-bold tracking-widest uppercase mb-4">
                    Category Scores
                  </p>
                  <div className="flex flex-col gap-3">
                    {([
                      ['Task Achievement', 'TA', feedback.scores.taskAchievement, false],
                      ['Coherence & Cohesion', 'CC', feedback.scores.coherenceCohesion, true],
                      ['Lexical Resource', 'LR', feedback.scores.lexicalResource, true],
                      ['Grammatical Range', 'GRA', feedback.scores.grammaticalRangeAccuracy, true],
                    ] as [string, string, number, boolean][]).map(([, abbr, score, lockable]) => {
                      const isLocked = feedback.limited && lockable;
                      return (
                        <div key={abbr} className="flex items-center gap-3">
                          <span className="text-[0.7rem] text-[var(--text-secondary)] w-8 font-mono shrink-0">{abbr}</span>
                          <div className="flex-1 h-2 bg-[var(--bg-subtle,#f1f5f9)] rounded-full overflow-hidden">
                            {isLocked
                              ? <div className="h-full w-full bg-slate-200 rounded-full" />
                              : <div
                                  className={`h-full rounded-full transition-all duration-700 ${
                                    score >= 7 ? 'bg-amber-400' : score >= 6 ? 'bg-[var(--ink-blue)]' : 'bg-amber-500'
                                  }`}
                                  style={{ width: `${Math.max(4, ((score - 4) / 5) * 100)}%` }}
                                />
                            }
                          </div>
                          <span className="text-[0.8125rem] font-bold text-[var(--text-primary)] font-mono min-w-[30px] text-right">
                            {isLocked ? '🔒' : score.toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Recurring issues */}
              {recurringIssues.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5">
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
              <div className="sticky top-[72px] z-10 -mx-4 mb-6 bg-[var(--bg-card)]/90 backdrop-blur border-b border-[var(--border-color)]">
                <div className="flex flex-wrap px-1">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      title={tab.label}
                      className={`flex flex-col items-center gap-0.5 px-2.5 py-2 text-[0.6rem] cursor-pointer transition-all border-none bg-transparent relative ${
                        activeTab === tab.id
                          ? 'text-[var(--ink-blue)] font-bold'
                          : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span className="text-base leading-none">{tab.icon}</span>
                      <span className="whitespace-nowrap">{tab.label}</span>
                      {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--ink-blue)] rounded-t-full" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {([
                      ['Task Achievement', feedback.scores.taskAchievement, false],
                      ['Coherence & Cohesion', feedback.scores.coherenceCohesion, true],
                      ['Lexical Resource', feedback.scores.lexicalResource, true],
                      ['Grammatical Range', feedback.scores.grammaticalRangeAccuracy, true],
                    ] as [string, number, boolean][]).map(([name, score, lockable]) => {
                      const isLocked = feedback.limited && lockable;
                      return (
                        <div key={name} className={`bg-[var(--bg-card)] rounded-2xl p-5 border shadow-sm text-center ${isLocked ? 'border-slate-200 opacity-60' : 'border-[var(--border-color)]'}`}>
                          <p className="text-[0.65rem] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 leading-snug">
                            {name}
                          </p>
                          {isLocked
                            ? <div className="text-2xl mb-1">🔒</div>
                            : <ScoreBadge score={score} />
                          }
                          <div className="h-1.5 bg-slate-100 rounded-full mt-3">
                            {!isLocked && <div
                              className={`h-full rounded-full ${
                                score >= 7 ? 'bg-amber-400' : score >= 6 ? 'bg-[var(--ink-blue)]' : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.max(4, ((score - 4) / 5) * 100)}%` }}
                            />}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {feedback.limited ? (
                    <UpgradePrompt />
                  ) : (
                    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border-color)] border-l-4 border-l-[var(--gold)] shadow-sm">
                      <p className="font-bold text-[var(--text-primary)] mb-3">📈 Band Gap Analysis</p>
                      <p className="font-['Georgia'] leading-relaxed text-[var(--text-primary)] text-[0.9375rem] m-0">
                        {feedback.bandGapAnalysis}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── PRIORITY FIXES ── */}
              {activeTab === 'priority' && (feedback.limited ? <UpgradePrompt /> : (
                <div className="flex flex-col gap-4">
                  {feedback.priorityFixes.map((fix, i) => {
                    const accent = i === 0 ? '#b91c1c' : i === 1 ? '#c9900a' : '#166534';
                    const label = i === 0 ? 'High priority' : i === 1 ? 'Medium priority' : 'Also consider';
                    const labelColor = i === 0 ? 'text-red-700' : i === 1 ? 'text-amber-800' : 'text-green-700';
                    const bgGradient = i === 0 ? 'from-red-50 to-transparent' : i === 1 ? 'from-amber-50 to-transparent' : 'from-green-50 to-transparent';
                    return (
                      <div
                        key={i}
                        className={`bg-gradient-to-r ${bgGradient} bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] flex gap-5 items-start shadow-sm`}
                        style={{ borderLeft: `4px solid ${accent}` }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-mono font-bold text-base shrink-0 shadow-sm"
                          style={{ background: accent }}
                        >
                          {i + 1}
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${labelColor}`}>
                            {label}
                          </p>
                          <p className="text-[var(--text-primary)] leading-relaxed text-[0.9375rem] m-0">{fix}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* ── DETAILED FEEDBACK ── */}
              {activeTab === 'detailed' && (feedback.limited ? <UpgradePrompt /> :(
                <div className="flex flex-col gap-3">
                  {(Object.entries(feedback.feedback) as [string, { strengths: string[]; issues: string[] }][]).map(
                    ([key, cat]) => (
                      <div key={key} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm">
                        <button
                          onClick={() => setExpandedCat(expandedCat === key ? null : key)}
                          className="w-full px-5 py-4 bg-transparent border-none flex items-center justify-between cursor-pointer"
                        >
                          <span className="font-bold text-[var(--text-primary)] text-[0.9375rem]">
                            {CAT_LABELS[key] ?? key}
                          </span>
                          <span className="text-[var(--text-secondary)] text-sm">{expandedCat === key ? '▲' : '▼'}</span>
                        </button>
                        {expandedCat === key && (
                          <div className="px-5 pb-5 border-t border-[var(--border-color)]">
                            {cat.strengths.length > 0 && (
                              <div className="mt-4 mb-3">
                                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-green-700 mb-2">
                                  Strengths
                                </p>
                                {cat.strengths.map((s, i) => (
                                  <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                    <span className="text-green-600 text-sm mt-0.5">✓</span>
                                    <p className="text-[0.9rem] text-[var(--text-primary)] leading-relaxed m-0">{s}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {cat.issues.length > 0 && (
                              <div>
                                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-red-600 mb-2">
                                  Issues to Improve
                                </p>
                                {cat.issues.map((s, i) => (
                                  <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                    <span className="text-red-600 text-sm mt-0.5">✗</span>
                                    <p className="text-[0.9rem] text-[var(--text-primary)] leading-relaxed m-0">{s}</p>
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
              ))}

              {/* ── VOCABULARY ── */}
              {activeTab === 'vocabulary' && (feedback.limited ? <UpgradePrompt /> :(
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
              ))}

              {/* ── GRAMMAR ── */}
              {activeTab === 'grammar' && (feedback.limited ? <UpgradePrompt /> :(
                <div className="flex flex-col gap-3">
                  {feedback.grammar.map((g, i) => (
                    <div key={i} className="bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] shadow-sm">
                      <div className="flex gap-4 items-start">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--ink-blue)]/10 text-[var(--ink-blue)] font-mono font-bold text-sm shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-[var(--text-primary)] mb-1.5 text-[0.9375rem]">{g.point}</p>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2.5">{g.explanation}</p>
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
              ))}

              {/* ── ESSAY ANALYSIS ── */}
              {activeTab === 'essay' && (feedback.limited ? <UpgradePrompt /> : (() => {
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
                          const isOpen = openSentences.has(i);
                          return (
                            <div
                              key={i}
                              className={`rounded-xl border px-5 py-3.5 cursor-pointer transition-all ${style.bg} ${style.border}`}
                              onClick={() => toggleSentence(i)}
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
              })())}

              {/* ── SAMPLE RESPONSE ── */}
              {activeTab === 'sample' && (feedback.limited ? <UpgradePrompt /> : (
                <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] border-l-4 border-l-[var(--gold)] px-6 py-6 shadow-sm">
                  <p className="text-xs font-bold tracking-widest uppercase text-[var(--gold)] mb-4">
                    ✍️ Band 7–8 Sample Response
                  </p>
                  <p className="font-['Georgia'] text-[var(--text-primary)] leading-[1.9] text-[0.9375rem] whitespace-pre-wrap">
                    {feedback.sampleResponse ?? 'Sample response not available for this analysis.'}
                  </p>
                </div>
              ))}

              {/* ── SPELLING CHECKER ── */}
              {activeTab === 'spelling' && (() => {
                const essayText = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
                return (
                <div>
                  {!ltChecked ? (
                    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] bg-slate-50">
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
                    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] bg-slate-50 rounded-t-2xl">
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
                                // Keep the popover inside the container so it isn't cut off at the edges
                                const POP_W = 290;
                                const x = Math.max(8, Math.min(r.left - cr.left, cr.width - POP_W));
                                setLtPopover({ match: seg.match!, x, y: r.bottom - cr.top + 6 });
                              }}
                            >{seg.text}</mark>
                          ) : <span key={i}>{seg.text}</span>
                        )}
                        {ltPopover && (
                          <div
                            className="absolute z-30 bg-[#0f172a] border border-[#1e3a5f] rounded-xl p-3.5 max-w-[280px] shadow-xl"
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
                        <div key={i} className="bg-[var(--bg-card)] rounded-2xl px-4 py-3 border border-[var(--border-color)] flex items-center gap-3">
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
              {activeTab === 'quiz' && (feedback.limited ? <UpgradePrompt /> : (
                <div>
                  <p className="text-sm text-[var(--text-muted)] mb-5">
                    Write a sentence using each word or grammar rule. Tap <strong>Show example</strong> to check.
                  </p>
                  <div className="flex flex-col gap-4">
                    {feedback.vocabulary.map((v, i) => {
                      const key = `vocab_${i}`;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-2xl px-5 py-4 border border-[var(--border-color)] shadow-sm">
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
                              {practiceChecking[key] ? 'Checking…' : '🤖 Check with AI'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-[var(--ink-blue)] underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Hide' : 'Show example'}
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
                        <div key={key} className="bg-[var(--bg-card)] rounded-2xl px-5 py-4 border border-[var(--border-color)] shadow-sm">
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
                              {practiceChecking[key] ? 'Checking…' : '🤖 Check with AI'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-amber-700 underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Hide' : 'Show example'}
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
              ))}
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
