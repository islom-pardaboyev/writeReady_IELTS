import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import {
  ArrowLeft, Download, ChevronLeft, ChevronRight, Loader2, Lock, AlertTriangle,
  LayoutGrid, Target, ListChecks, FileText, PenLine, BookOpen, SpellCheck2, SearchCheck, Brain,
  TrendingUp, Repeat2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles, Link2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { decodeReport } from '../lib/reportEncoding';
import type { ReportData } from '../lib/reportEncoding';
import { getFeedbackReportHistory } from '../firebase/firestore';
import { db } from '../firebase/config';
import { useTask1Chart } from '../lib/task1Chart';
import type { EnhancedFeedbackResult } from '../types';
import { hasFreeReportThisWeek } from '../lib/weeklyFree';
import { downloadFeedbackPdf } from '../lib/feedbackPdf';
import { useSingleRun } from '../hooks/useSingleRun';
import { LogoLoader } from '@/components/ui/LogoLoader';
import { FeedbackRating } from '@/components/ui/FeedbackRating';

type TaskKey = 'task1' | 'task2';
type Tab = 'overview' | 'priority' | 'detailed' | 'essay' | 'sample' | 'vocabulary' | 'grammar' | 'spelling' | 'quiz';

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'priority', label: 'Priority', icon: Target },
  { id: 'detailed', label: 'Detailed', icon: ListChecks },
  { id: 'essay', label: 'Essay', icon: FileText },
  { id: 'sample', label: 'Sample', icon: PenLine },
  { id: 'vocabulary', label: 'Vocab', icon: BookOpen },
  { id: 'grammar', label: 'Grammar', icon: SpellCheck2 },
  { id: 'spelling', label: 'Spelling', icon: SearchCheck },
  { id: 'quiz', label: 'Practice', icon: Brain },
];

// Official IELTS band-score descriptors
function bandLabel(score: number): string {
  if (score >= 8.5) return 'Expert user';
  if (score >= 7.5) return 'Very good user';
  if (score >= 6.5) return 'Good user';
  if (score >= 5.5) return 'Competent user';
  if (score >= 4.5) return 'Modest user';
  return 'Limited user';
}

// A single consistent color identity per scoring category, reused across the
// hero, overview cards and detailed accordion so the whole page reads as one system.
type CategoryColor = 'teal' | 'indigo' | 'purple' | 'amber';
const CATEGORY_META: { key: string; shortLabel: string; icon: typeof Target; color: CategoryColor }[] = [
  { key: 'taskAchievement', shortLabel: 'Task Achievement', icon: Target, color: 'teal' },
  { key: 'coherenceCohesion', shortLabel: 'Coherence & Cohesion', icon: Link2, color: 'indigo' },
  { key: 'lexicalResource', shortLabel: 'Lexical Resource', icon: BookOpen, color: 'purple' },
  { key: 'grammaticalRangeAccuracy', shortLabel: 'Grammatical Range', icon: SpellCheck2, color: 'amber' },
];
const CATEGORY_COLOR_CLASSES: Record<CategoryColor, { icon: string; iconBg: string }> = {
  teal: { icon: 'text-teal-600 dark:text-teal-400', iconBg: 'bg-teal-500/10' },
  indigo: { icon: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-500/10' },
  purple: { icon: 'text-purple-600 dark:text-purple-400', iconBg: 'bg-purple-500/10' },
  amber: { icon: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-500/10' },
};
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORY_META.map((c) => [c.key, c]));

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
  return '#4F46E5';
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
    result.feedback.includes('Could not check it') ||
    result.feedback.includes('Network error') ||
    result.feedback.includes('Evaluation failed') ||
    result.feedback.includes('not configured') ||
    result.feedback.includes('required')
  );

  if (isSystemError) {
    return (
      <div className="mt-3 rounded-xl px-3.5 py-3 border bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 flex gap-2.5 items-start">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">Could not check</p>
          <p className="text-xs text-amber-800 dark:text-amber-200 m-0">{result.feedback}</p>
        </div>
      </div>
    );
  }

  const improved = result.improved?.trim();
  return (
    <div className={`mt-3 rounded-xl px-3.5 py-3 border ${result.correct ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
      <div className="flex items-center gap-2 mb-2">
        {result.correct ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Correct
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-400">
            <XCircle className="w-3.5 h-3.5" /> Error found
          </span>
        )}
        <span className="ml-auto text-xs font-mono font-bold text-gray-500 dark:text-neutral-400">{result.score}/100</span>
      </div>
      {result.feedback && (
        <p className="text-sm text-gray-800 dark:text-neutral-200 leading-relaxed m-0 mb-2">{result.feedback}</p>
      )}
      {improved && (
        <div className={`bg-white/80 dark:bg-black/20 rounded-lg px-3 py-2.5 border ${result.correct ? 'border-green-200 dark:border-green-800' : 'border-red-200 dark:border-red-800'}`}>
          <p className={`flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest mb-1 ${accentClass ?? 'text-[var(--ink-blue)]'}`}>
            <Sparkles className="w-3 h-3" /> Improved version
          </p>
          <p className={`text-sm leading-relaxed m-0 italic ${accentClass?.replace('text-', 'text-') ?? 'text-[var(--ink-blue)]'}`}>
            {improved}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The free plan gives one AI report a week. A mock exam gives the student two
 * essays. This is where those two facts meet, so it does two jobs: before
 * anything is spent it asks which essay to mark, and afterwards it says where
 * the report went instead of leaving an empty panel behind.
 */
function FreeTaskGate({
  hasCredit,
  markedTask,
  onChoose,
}: {
  hasCredit: boolean;
  markedTask: TaskKey | null;
  onChoose: (task: TaskKey) => void;
}) {
  const label = (t: TaskKey) => (t === 'task1' ? 'Task 1' : 'Task 2');

  if (hasCredit && !markedTask) {
    return (
      <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-8 shadow-sm">
        <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[var(--ink-blue)]/10 mb-4">
          <Sparkles className="w-5 h-5 text-[var(--ink-blue)]" />
        </span>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Which essay should we mark?</h2>
        <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
          You wrote two essays, and the free plan includes <strong className="text-[var(--text-primary)]">one AI
          report a week</strong>. Pick the essay you want marked. The other one stays saved and unmarked, and your
          next free report arrives on Monday.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {(['task1', 'task2'] as const).map((t) => (
            <Button key={t} onClick={() => onChoose(t)}>
              Mark {label(t)}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--text-secondary)]">
          Need both marked?{' '}
          <Link to="/pricing" className="font-semibold text-[var(--ink-blue)]">
            A paid plan
          </Link>{' '}
          has enough reports for every essay you write.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-8 shadow-sm">
      <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-[var(--ink-blue)]/10 mb-4">
        <Lock className="w-5 h-5 text-[var(--ink-blue)]" />
      </span>
      <h2 className="text-xl font-bold text-[var(--text-primary)]">This essay is not marked</h2>
      <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
        The free plan includes one AI report a week
        {markedTask ? <>, and this week&rsquo;s went to <strong className="text-[var(--text-primary)]">{label(markedTask)}</strong></> : null}
        . Your essay is saved, so you can mark it once your next free report arrives on Monday.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/pricing">
          <Button>See paid plans</Button>
        </Link>
        <Link to="/dashboard">
          <Button variant="secondary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}

/** What sits under the score on a free report: the bands, then what a paid plan adds. */
function FreeReportNotice() {
  return (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-sm">
      <p className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--ink-blue)]/10">
          <Lock className="w-4 h-4 text-[var(--ink-blue)]" />
        </span>
        Your free weekly report is the band score
      </p>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">
        The four criteria above are marked against the official IELTS band descriptors, the same way a
        paid report is marked. The greyed-out tabs are what a paid plan adds:
      </p>
      <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[0.9375rem] text-[var(--text-secondary)] list-none p-0">
        {['Every sentence reviewed and rewritten', 'Priority fixes and band gap analysis',
          '15 words with Uzbek meanings', '10 grammar points',
          'A band 8 to 9 sample answer', 'Spelling check and practice exercises'].map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span aria-hidden="true" className="text-[var(--ink-blue)] mt-0.5">+</span>
            {item}
          </li>
        ))}
      </ul>
      <Link
        to="/pricing"
        className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-[var(--ink-blue-solid)] px-6 py-3 text-sm font-bold text-white no-underline transition-opacity hover:opacity-90"
      >
        See plans <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  );
}

function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--ink-blue)]/10 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-[var(--ink-blue)]" />
      </div>
      <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">This section is locked</h3>
      <p className="text-[var(--text-secondary)] text-sm max-w-xs mb-6 leading-relaxed">
        Your free report shows the full estimated band scores. Upgrade to
        Basic, Standard, or Premium to unlock the detailed analysis, corrections,
        vocabulary, grammar, and a sample essay.
      </p>
      <a
        href="/pricing"
        className="inline-flex items-center gap-1.5 bg-[var(--ink-blue-solid)] text-white px-6 py-3 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity no-underline"
      >
        View plans <ChevronRight className="w-4 h-4" />
      </a>
    </div>
  );
}

// Three clearly distinct tiers — gold never doubles as both "great" and "needs work".
function scoreColor(score: number) {
  return score >= 7 ? 'text-amber-500' : score >= 6 ? 'text-[var(--ink-blue)]' : 'text-rose-500';
}

function scoreBarColor(score: number) {
  return score >= 7 ? 'bg-amber-400' : score >= 6 ? 'bg-[var(--ink-blue)]' : 'bg-rose-500';
}

function scoreStroke(score: number) {
  return score >= 7 ? '#f59e0b' : score >= 6 ? 'var(--ink-blue)' : '#f43f5e';
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className={`font-mono font-bold text-4xl leading-none ${scoreColor(score)}`}>
      {score.toFixed(1)}
    </span>
  );
}

// Ordered stages shown while the report streams in. The report JSON arrives in
// this exact order, so we detect which section has appeared to show REAL
// progress (not a fake timer).
const ANALYSIS_STAGES = [
  { key: 'read', label: 'Reading your essay', icon: '📖' },
  { key: 'overview', label: 'Assessing band scores', icon: '🎯' },
  { key: 'improve', label: 'Finding what to work on', icon: '🔍' },
  { key: 'sample', label: 'Writing a model sample essay', icon: '✍️' },
  { key: 'vocab', label: 'Building your vocabulary list', icon: '📚' },
  { key: 'grammar', label: 'Preparing grammar points', icon: '🧠' },
  { key: 'exercises', label: 'Preparing interactive exercises', icon: '🎮' },
] as const;
const LAST_STAGE = ANALYSIS_STAGES.length - 1;

// Map the streamed-so-far JSON text to the furthest stage reached.
function stageFromRaw(raw: string): number {
  if (raw.includes('"grammar"')) return 5;
  if (raw.includes('"vocabulary"')) return 4;
  if (raw.includes('"sampleResponse"')) return 3;
  if (raw.includes('"priorityFixes"') || raw.includes('"feedback"')) return 2;
  if (raw.includes('"scores"') || raw.includes('"bandRationale"')) return 1;
  return 0;
}

export function FeedbackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, profile, refreshProfile, loading: authLoading } = useAuth();

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskKey>('task2');
  const [wordCountWarning, setWordCountWarning] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);
  const [hasBothTasks, setHasBothTasks] = useState(false);

  const [loadings, setLoadings] = useState<Record<string, boolean>>({});
  const [analysisStage, setAnalysisStage] = useState<Record<string, number>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, EnhancedFeedbackResult>>({});
  const [feedbackErrors, setFeedbackErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const loading = loadings[selectedTask] ?? false;
  const feedback = feedbacks[selectedTask] ?? null;
  const feedbackError = feedbackErrors[selectedTask] ?? null;

  // The tab a free report is allowed to show. Every panel renders off this
  // rather than activeTab, so a free report stays on Overview even if
  // activeTab was left on another tab by a paid report in the same session.
  // Nothing else can mount, so nothing else can start a request.
  const shownTab: Tab = feedback?.limited ? 'overview' : activeTab;

  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  // Each category accordion opens/closes independently — opening one must never close another.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['taskAchievement']));
  const toggleCat = (key: string) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });


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
      if (next.has(i)) {
        next.delete(i);
      } else {
        next.add(i);
      }
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
  const { busy: exporting, run: runExport } = useSingleRun();
  const storedChart = useTask1Chart(db, reportData?.task1 ?? null);
  // Quick Write lets a student upload their own chart, which rides along in
  // the link rather than living in the database.
  const task1Chart = storedChart || (reportData?.task1?.image ?? '');

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

  // Reports generated earlier in this browser session are in sessionStorage.
  // Restore them on mount, so reloading the page shows the report again rather
  // than the gate below, and so markedTask knows which essay a free weekly
  // report was already spent on.
  useEffect(() => {
    if (!id) return;
    const restored: Record<string, EnhancedFeedbackResult> = {};
    for (const t of ['task1', 'task2'] as const) {
      const raw = sessionStorage.getItem(`feedback_${id}_${t}`);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as EnhancedFeedbackResult;
        // Same staleness check loadFeedback uses: drop pre-`improved` reports.
        const hasImproved = parsed.sentenceAnalysis?.some((sa) => 'improved' in sa);
        if (!hasImproved && parsed.sentenceAnalysis?.length) continue;
        // Entries cached before `limited` was set correctly claim to be full
        // reports while carrying none of the data a full report has. A report
        // with no sentence analysis and no vocabulary is a score-only one.
        const looksLimited = !parsed.sentenceAnalysis?.length && !parsed.vocabulary?.length;
        restored[t] = looksLimited ? { ...parsed, limited: true } : parsed;
      } catch { /* ignore a corrupt entry */ }
    }
    if (Object.keys(restored).length) setFeedbacks((prev) => ({ ...restored, ...prev }));
  }, [id]);

  // Word count check
  useEffect(() => {
    if (!reportData) return;
    const essay = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
    const count = essay.trim().split(/\s+/).filter(Boolean).length;
    const min = selectedTask === 'task1' ? 150 : 250;
    if (count > 0 && count < min) {
      setWordCountWarning(
        `Your essay is ${count} words, below the IELTS minimum of ${min} words for ${
          selectedTask === 'task1' ? 'Task 1' : 'Task 2'
        }. Short essays are penalised for Task Achievement.`
      );
    } else {
      setWordCountWarning(null);
    }
  }, [reportData, selectedTask]);

  // Redirect if not logged in — wait for Firebase Auth to finish rehydrating
  // the session first, otherwise a hard refresh on this page (a shared report
  // link is exactly that) bounces a signed-in user to /auth before their
  // session has a chance to load.
  useEffect(() => {
    if (!authLoading && user === null) navigate('/auth');
  }, [user, authLoading, navigate]);

  const isPro = profile?.plan === 'basic' || profile?.plan === 'standard' || profile?.plan === 'premium' || profile?.plan === 'forever';
  // Free-plan users get 1 AI feedback report per week (or an admin-granted
  // bonus report) — they can request feedback just like paid users as long
  // as they haven't used it yet. pre-check.ts is the source of truth for
  // whether the attempt actually succeeds.
  const hasFreeCredit = (profile?.bonusAnalyses ?? 0) > 0 || hasFreeReportThisWeek(profile?.freeUsage);
  const canGetFeedback = isPro || hasFreeCredit;

  // A mock exam is two essays; a free plan is one report a week. Loading
  // automatically would spend that report on whichever task happened to be
  // selected, so free plans choose the essay themselves and the other one
  // stays unmarked. Paid plans have reports to spare, so they load straight in.
  const markedTask: TaskKey | null =
    (['task1', 'task2'] as const).find((t) => feedbacks[t]) ?? null;
  const hasAnyFeedback = markedTask !== null;
  const mustChooseTask = !isPro && hasBothTasks;

  // `task` is passed explicitly when the student chooses which essay to spend
  // their free weekly report on: setSelectedTask would not have applied yet,
  // so reading selectedTask here would mark the wrong essay.
  const loadFeedback = useCallback(async (task?: TaskKey) => {
    if (!reportData || !user) return;
    const taskKey = task ?? selectedTask;

    const essay = taskKey === 'task1' ? reportData.userText1 : reportData.userText2;
    const question =
      taskKey === 'task1' ? (reportData.task1?.report ?? '') : (reportData.task2?.report ?? '');

    const cacheKey = `feedback_${id}_${taskKey}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as EnhancedFeedbackResult;
        // Invalidate cache if it's missing the improved field (old format)
        const hasImproved = parsed.sentenceAnalysis?.some(s => 'improved' in s);
        if (hasImproved || !parsed.sentenceAnalysis?.length) {
          setFeedbacks((p) => ({ ...p, [taskKey]: parsed }));
          return;
        }
        sessionStorage.removeItem(cacheKey);
      } catch { /* ignore */ }
    }

    setLoadings((p) => ({ ...p, [taskKey]: true }));
    setAnalysisStage((p) => ({ ...p, [taskKey]: 0 }));
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
      const { token: preCheckToken, limited: limitedReport } = await preRes.json() as {
        token: string;
        /** True only for the automatic weekly free report. An admin-granted
         *  bonus is a reward and buys the same full report a paid plan does. */
        limited?: boolean;
      };

      // Step 2: feedback — only HMAC verify + Claude stream (no Firebase overhead)
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: essay,
          questionText: question,
          taskType: taskKey === 'task1' ? 'Task 1' : 'Task 2',
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
      let lastStage = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          raw += decoder.decode(value, { stream: true });
          const st = stageFromRaw(raw);
          if (st > lastStage) {
            lastStage = st;
            setAnalysisStage((p) => ({ ...p, [taskKey]: st }));
          }
        }
        raw += decoder.decode(); // flush
      } else {
        raw = await res.text();
      }
      // Stream finished — final "preparing interactive exercises" beat.
      setAnalysisStage((p) => ({ ...p, [taskKey]: LAST_STAGE }));

      let parsedFeedback: EnhancedFeedbackResult;
      try {
        parsedFeedback = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
      } catch {
        throw new Error('Feedback incomplete. Please try again.');
      }

      // pre-check decides which prompt runs, so it is the authority on whether
      // this report is the free score-only one. The model is never asked to
      // return a `limited` field, so reading it off the response always gave
      // false: every free report then rendered as a full one and the tabs it
      // has no data for crashed on undefined.
      const feedbackWithLimit = { ...parsedFeedback, limited: limitedReport === true };
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
  // refreshProfile isn't memoized in AuthContext; including it would recreate
  // this callback (and re-trigger the auto-load effect below) on every auth re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportData, selectedTask, user, id]);

  // Auto-load feedback when ready (per task)
  useEffect(() => {
    if (reportData && user && canGetFeedback && !mustChooseTask && !feedback && !loading && !feedbackError) {
      loadFeedback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportData, user, canGetFeedback, mustChooseTask, selectedTask]);

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
          feedback: data.error ?? 'Could not check it. Please try again.',
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
        feedback: `Network error: ${(err as Error).message}`,
        improved: '',
      }}));
    } finally {
      setPracticeChecking((p) => ({ ...p, [key]: false }));
    }
  };

  const applyLtFix = (match: LTMatch, replacement: string) => {
    setLtCorrected((prev) => prev.slice(0, match.offset) + replacement + prev.slice(match.offset + match.length));
    // Every other match's offset was computed against the pre-edit text. If the
    // replacement is a different length than the original (the normal case),
    // matches after this one now point at the wrong characters unless shifted.
    const delta = replacement.length - match.length;
    setLtMatches((prev) =>
      prev
        .filter((m) => m !== match)
        .map((m) => (m.offset > match.offset ? { ...m, offset: m.offset + delta } : m))
    );
    setLtPopover(null);
  };

  const exportPDF = () => {
    if (!feedback || !reportData) return;
    const isTask1 = selectedTask === 'task1';
    return runExport(() =>
      downloadFeedbackPdf({
        feedback,
        taskNum: isTask1 ? 1 : 2,
        question: isTask1 ? reportData.task1?.report : reportData.task2?.report,
        imageSrc: isTask1 ? task1Chart : null,
        essay: (isTask1 ? reportData.userText1 : reportData.userText2) ?? '',
        fileName: `WriteReady_Feedback_Task${isTask1 ? 1 : 2}_${new Date().toISOString().slice(0, 10)}.pdf`,
      }),
    );
  };

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (decodeError) {
    return (
      <AppShell minimal>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-[var(--text-muted)]">Invalid feedback link.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </AppShell>
    );
  }

  if (!reportData) {
    return (
      <AppShell minimal>
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)] gap-3">
          <LogoLoader size={56} />
          <span>Loading…</span>
        </div>
      </AppShell>
    );
  }

  if (profile && !canGetFeedback && !hasAnyFeedback) {
    return (
      <AppShell minimal>
        <div className="bg-[var(--bg-base)] min-h-[calc(100vh-56px)] py-10 flex items-center">
          <div className="container mx-auto max-w-xl px-4">
            <div className="bg-[var(--ink-blue-solid)] rounded-2xl p-10 text-center text-white">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-5">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold mb-3">
                You&rsquo;ve used your free report this week
              </h2>
              <p className="text-white/70 mb-7 leading-relaxed">
                Your essay has been saved. The free plan gives 1 AI feedback report per week, and
                that report covers one essay. Come back on Monday for another free check, or upgrade
                to Basic, Standard or Premium for more reports each month, with band scores,
                corrections, vocabulary and grammar.
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
      </AppShell>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <AppShell minimal>
      <style>{`
        .fp-flip-card { perspective: 1000px; cursor: pointer; }
        .fp-flip-inner { position: relative; width: 100%; height: 100%; transition: transform 0.55s cubic-bezier(.4,0,.2,1); transform-style: preserve-3d; }
        .fp-flip-inner.is-flipped { transform: rotateY(180deg); }
        .fp-flip-face { position: absolute; top: 0; left: 0; width: 100%; height: 100%; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 1.25rem; box-sizing: border-box; text-align: center; }
        .fp-flip-back { transform: rotateY(180deg); }
        @keyframes fpFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .fp-tab-panel { animation: fpFadeIn 0.35s ease; }
        @media (prefers-reduced-motion: reduce) {
          .fp-tab-panel { animation: none; }
          .fp-flip-inner { transition: none; }
        }
      `}</style>

      <div className="bg-[var(--bg-base)] min-h-[calc(100vh-56px)] pb-16">
        {/* ── Page header ── */}
        <div className="border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="container mx-auto max-w-5xl px-4 sm:px-6 py-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group no-underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
                  Dashboard
                </Link>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] mt-1 tracking-tight">
                  AI Feedback Report
                </h1>
              </div>
              {feedback && (
                <Button onClick={exportPDF} loading={exporting} variant="secondary" size="sm">
                  {!exporting && <Download className="w-3.5 h-3.5" />} {exporting ? 'Saving PDF…' : 'Download PDF'}
                </Button>
              )}
            </div>

            {/* ── Task selector ── */}
            {hasBothTasks && (
              <div className="flex gap-2 mt-5">
                {(['task1', 'task2'] as const).map((t) => {
                  const hasFb = !!feedbacks[t];
                  const isLoading = loadings[t];
                  return (
                    <button
                      key={t}
                      onClick={() => { setSelectedTask(t); setActiveTab('overview'); }}
                      className={`px-5 py-1.5 rounded-full border-2 font-semibold text-sm transition-colors cursor-pointer flex items-center gap-2 ${
                        selectedTask === t
                          ? 'border-[var(--ink-blue)] bg-[var(--ink-blue-solid)] text-white'
                          : 'border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--ink-blue)]'
                      }`}
                    >
                      {t === 'task1' ? 'Task 1' : 'Task 2'}
                      {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin opacity-70" />
                      ) : hasFb ? (
                        <CheckCircle2 className="w-3 h-3 opacity-80" />
                      ) : mustChooseTask ? (
                        <Lock className="w-3 h-3 opacity-60" aria-label="not marked" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="container mx-auto max-w-5xl px-4 sm:px-6 pt-6">

          {/* ── Word count warning ── */}
          {wordCountWarning && (
            <div className="flex items-start gap-2.5 bg-orange-50 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800 rounded-2xl px-4 py-3 mb-5 text-sm text-orange-800 dark:text-orange-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {wordCountWarning}
            </div>
          )}

          {/* ── Question card ── */}
          <div className="bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] border-l-4 border-l-[var(--ink-blue)] mb-6 shadow-sm">
            <p className="text-xs font-bold tracking-widest uppercase text-[var(--text-secondary)] mb-2">
              {selectedTask === 'task1' ? 'Task 1' : 'Task 2'} Question
            </p>
            {selectedTask === 'task1' && task1Chart && (
              (() => {
                const src = task1Chart;
                const pdf = src.startsWith('data:application/pdf') || /\.pdf(\?|$)/i.test(src);
                return pdf ? (
                  <object data={src} type="application/pdf" className="w-full h-[400px] rounded-lg border border-[var(--border)] mb-3">
                    <iframe src={src} className="w-full h-[400px] border-0 rounded-lg mb-3" title="Task 1 chart" />
                  </object>
                ) : (
                  <img
                    src={src}
                    alt="Task 1 chart"
                    width={1200}
                    height={800}
                    className="w-full max-h-72 object-contain rounded-lg border border-[var(--border)] mb-3"
                  />
                );
              })()
            )}
            <p className="leading-relaxed text-[var(--text-primary)] text-[0.9375rem] m-0">
              {selectedTask === 'task1' ? reportData.task1?.report : reportData.task2?.report}
            </p>
          </div>

          {/* ── Free plan: one report a week, two essays in this exam ── */}
          {mustChooseTask && !feedback && !loading && !feedbackError && (
            <FreeTaskGate
              hasCredit={canGetFeedback}
              markedTask={markedTask}
              onChoose={(t) => {
                setSelectedTask(t);
                setActiveTab('overview');
                loadFeedback(t);
              }}
            />
          )}

          {/* ── Loading (staged progress) ── */}
          {loading && (() => {
            const stage = analysisStage[selectedTask] ?? 0;
            const pct = Math.round((stage / LAST_STAGE) * 100);
            return (
              <div className="rounded-2xl border border-[var(--border-color)] p-6 sm:p-8 bg-[var(--bg-card)] shadow-sm">
                <div className="flex items-center gap-3.5 mb-6">
                  <LogoLoader size={48} label="Analysing your essay" className="shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--text-primary)] text-lg leading-tight">Analysing your essay…</p>
                    <p className="text-sm text-[var(--text-secondary)]">{ANALYSIS_STAGES[stage].label} · {pct}%</p>
                  </div>
                </div>

                {/* progress bar */}
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden mb-6">
                  <div
                    className="h-full bg-[var(--ink-blue)] rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(pct, 6)}%` }}
                  />
                </div>

                {/* stage checklist */}
                <ul className="space-y-2.5">
                  {ANALYSIS_STAGES.map((s, i) => {
                    const done = i < stage;
                    const active = i === stage;
                    return (
                      <li
                        key={s.key}
                        className={`flex items-center gap-3 transition-opacity duration-300 ${active ? 'opacity-100' : done ? 'opacity-80' : 'opacity-40'}`}
                      >
                        <span
                          className={`flex items-center justify-center w-7 h-7 rounded-full text-[0.8rem] shrink-0 transition-colors ${
                            done
                              ? 'bg-green-100 text-green-600'
                              : active
                                ? 'bg-[var(--ink-blue)]/10'
                                : 'bg-[var(--bg-subtle)]'
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : active ? (
                            <Loader2 className="w-3.5 h-3.5 text-[var(--ink-blue)] animate-spin" />
                          ) : (
                            <span aria-hidden className="text-[0.7rem]">{s.icon}</span>
                          )}
                        </span>
                        <span className={`text-sm ${active ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                          {s.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {/* ── Error ── */}
          {feedbackError && (() => {
            const isQuotaError = /free essay check|analysis limit reached/i.test(feedbackError);
            return (
              <div className="bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 rounded-2xl px-6 py-5 mb-6" role="alert" aria-live="polite">
                <p className="font-semibold text-red-700 dark:text-red-300 mb-1">Error: {feedbackError}</p>
                {!isQuotaError && (
                  <p className="text-sm text-red-600/80 dark:text-red-400/80 mb-4">
                    If this keeps happening, contact us on Telegram and we'll sort it out quickly.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2.5 mt-1">
                  {isQuotaError ? (
                    <Link to="/pricing">
                      <Button size="sm">Upgrade plan</Button>
                    </Link>
                  ) : (
                    <>
                      <Button size="sm" onClick={() => loadFeedback()}>Try again</Button>
                      <a
                        href="https://t.me/writeready_admin"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#229ED9] hover:bg-[#1c8dc2] rounded-lg transition-colors no-underline"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                        </svg>
                        Contact @writeready_admin
                      </a>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── Main feedback UI ── */}
          {feedback && (
            <div>
              {/* Score hero */}
              <div className="relative overflow-hidden rounded-2xl mb-5 bg-[var(--bg-card)] border border-[var(--border-color)] shadow-sm">
                <div className="absolute inset-0 bg-linear-to-br from-[var(--ink-blue)]/[0.07] via-transparent to-[var(--gold)]/[0.06] pointer-events-none" />
                <div
                  className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-[0.15] pointer-events-none"
                  style={{ background: scoreStroke(feedback.scores.overall) }}
                />
                <div className="relative p-6 sm:p-8 flex items-center gap-8 lg:gap-10 flex-wrap">
                  {/* Overall score ring */}
                  <div className="flex flex-col items-center min-w-[130px]">
                    <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold tracking-widest uppercase text-[var(--text-secondary)] mb-4">
                      <Sparkles className="w-3 h-3 text-[var(--gold)]" /> Band Score
                    </p>
                    <div className="relative flex items-center justify-center">
                      <svg className="w-28 h-28 -rotate-90 drop-shadow-[0_2px_10px_rgba(0,0,0,0.08)]" viewBox="0 0 96 96">
                        <circle cx="48" cy="48" r="40" fill="none" stroke="var(--border-color)" strokeWidth="8" />
                        <circle
                          cx="48" cy="48" r="40" fill="none"
                          stroke={scoreStroke(feedback.scores.overall)}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 40}`}
                          strokeDashoffset={`${2 * Math.PI * 40 * (1 - (feedback.scores.overall - 4) / 5)}`}
                          className="transition-[stroke-dashoffset,stroke] duration-700"
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className={`font-mono text-3xl font-bold leading-none ${scoreColor(feedback.scores.overall)}`}>
                          {feedback.scores.overall.toFixed(1)}
                        </span>
                        <span className="text-[0.6rem] text-[var(--text-secondary)] mt-1">/ 9.0 · ±0.5</span>
                      </div>
                    </div>
                    <span className="mt-3 px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] text-[0.7rem] font-bold text-[var(--text-primary)]">
                      {bandLabel(feedback.scores.overall)}
                    </span>
                    <p className="text-[0.7rem] text-[var(--text-secondary)] mt-2">{feedback.wordCount} words</p>
                  </div>

                  <div className="hidden sm:block w-px self-stretch bg-[var(--border-color)]" />

                  {/* Category bars */}
                  <div className="flex-1 min-w-[240px]">
                    <p className="text-[var(--text-secondary)] text-[0.65rem] font-bold tracking-widest uppercase mb-4">
                      Category Scores
                    </p>
                    <div className="flex flex-col gap-3.5">
                      {CATEGORY_META.map((cat) => {
                        const score = feedback.scores[cat.key as keyof typeof feedback.scores];
                        const cc = CATEGORY_COLOR_CLASSES[cat.color];
                        const Icon = cat.icon;
                        return (
                          <div key={cat.key} className="flex items-center gap-3">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 ${cc.iconBg}`}>
                              <Icon className={`w-3.5 h-3.5 ${cc.icon}`} />
                            </span>
                            <span className="text-[0.8rem] text-[var(--text-secondary)] w-[8.5rem] sm:w-40 shrink-0 truncate">{cat.shortLabel}</span>
                            <div className="flex-1 h-2 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-[width,background-color] duration-700 ${scoreBarColor(score)}`}
                                style={{ width: `${Math.max(4, ((score - 4) / 5) * 100)}%` }}
                              />
                            </div>
                            <span className="text-[0.8125rem] font-bold text-[var(--text-primary)] font-mono min-w-[30px] text-right">
                              {score.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Recurring issues */}
              {!feedback.limited && recurringIssues.length > 0 && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 dark:bg-amber-900/20 dark:border-amber-800 rounded-2xl px-5 py-4 mb-5">
                  <Repeat2 className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-2">
                      Recurring patterns in your recent essays
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {recurringIssues.map((issue) => (
                        <span
                          key={issue}
                          className="bg-amber-100 border border-amber-300 dark:bg-amber-900/30 dark:border-amber-700 rounded-full px-3 py-0.5 text-[0.8125rem] text-amber-900 dark:text-amber-200"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab bar */}
              <div className="sticky top-14 z-10 -mx-4 sm:-mx-6 mb-6 bg-[var(--bg-base)]/95 backdrop-blur-md border-b border-[var(--border-color)]">
                <div role="tablist" aria-label="Feedback report sections" className="mock-question-scroll flex overflow-x-auto px-4 sm:px-6">
                  {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = shownTab === tab.id;
                    // A free report buys the score. The rest stay on screen so the
                    // student can see what a paid plan adds, but they are real
                    // disabled buttons: not clickable, not reachable by keyboard,
                    // and they never mount a panel that would fetch anything.
                    const locked = !!feedback.limited && tab.id !== 'overview';
                    return (
                      <button
                        key={tab.id}
                        id={`fp-tab-${tab.id}`}
                        role="tab"
                        aria-selected={active}
                        aria-controls={`fp-panel-${tab.id}`}
                        disabled={locked}
                        tabIndex={locked ? -1 : undefined}
                        title={locked ? 'Included in a paid plan' : undefined}
                        onClick={locked ? undefined : () => setActiveTab(tab.id)}
                        className={`flex items-center gap-1.5 mt-1.5 px-3.5 py-2.5 rounded-lg text-[0.8125rem] font-semibold whitespace-nowrap border-none bg-transparent relative transition-colors duration-150 shrink-0 ${
                          locked
                            ? 'text-[var(--text-secondary)] opacity-40 cursor-not-allowed'
                            : active
                              ? 'text-[var(--ink-blue)] cursor-pointer'
                              : 'text-[var(--text-secondary)] cursor-pointer hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                        {locked && <Lock className="w-3 h-3 shrink-0" aria-label="paid plan only" />}
                        {active && (
                          <span className="absolute bottom-[-6px] left-2 right-2 h-0.5 bg-[var(--ink-blue)] rounded-t-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── OVERVIEW ── */}
              {shownTab === 'overview' && (
                <div id="fp-panel-overview" role="tabpanel" aria-labelledby="fp-tab-overview" className="fp-tab-panel">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {CATEGORY_META.map((cat) => {
                      const score = feedback.scores[cat.key as keyof typeof feedback.scores];
                      const cc = CATEGORY_COLOR_CLASSES[cat.color];
                      const Icon = cat.icon;
                      return (
                        <div
                          key={cat.key}
                          className="bg-[var(--bg-card)] rounded-2xl p-5 border border-[var(--border-color)] shadow-sm text-center transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5"
                        >
                          <div className={`w-9 h-9 rounded-xl ${cc.iconBg} flex items-center justify-center mx-auto mb-3`}>
                            <Icon className={`w-4 h-4 ${cc.icon}`} />
                          </div>
                          <p className="text-[0.65rem] font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 leading-snug">
                            {cat.shortLabel}
                          </p>
                          <ScoreBadge score={score} />
                          <div className="h-1.5 bg-[var(--bg-subtle)] rounded-full mt-3">
                            <div
                              className={`h-full rounded-full transition-[width,background-color] duration-700 ${scoreBarColor(score)}`}
                              style={{ width: `${Math.max(4, ((score - 4) / 5) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {feedback.limited ? (
                    <FreeReportNotice />
                  ) : (
                    <div className="bg-[var(--bg-card)] rounded-2xl p-6 border border-[var(--border-color)] border-l-4 border-l-[var(--gold)] shadow-sm transition-shadow duration-200 hover:shadow-md">
                      <p className="flex items-center gap-2 font-bold text-[var(--text-primary)] mb-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--gold)]/15">
                          <TrendingUp className="w-4 h-4 text-[var(--gold)]" />
                        </span>
                        Band Gap Analysis
                      </p>
                      <p className="leading-relaxed text-[var(--text-primary)] text-[0.9375rem] m-0">
                        {feedback.bandGapAnalysis}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── PRIORITY FIXES ── */}
              {shownTab === 'priority' && (
                <div id="fp-panel-priority" role="tabpanel" aria-labelledby="fp-tab-priority" className="fp-tab-panel flex flex-col gap-4">
                  {(feedback.priorityFixes ?? []).map((fix, i) => {
                    const accent = i === 0 ? '#b91c1c' : i === 1 ? '#D97706' : '#16A34A';
                    const label = i === 0 ? 'High priority' : i === 1 ? 'Medium priority' : 'Also consider';
                    const labelColor = i === 0 ? 'text-red-700 dark:text-red-400' : i === 1 ? 'text-amber-800 dark:text-amber-400' : 'text-green-700 dark:text-green-400';
                    const bgGradient = i === 0 ? 'from-red-500/[0.06]' : i === 1 ? 'from-amber-500/[0.07]' : 'from-green-500/[0.06]';
                    return (
                      <div
                        key={i}
                        className={`bg-linear-to-r ${bgGradient} to-transparent bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] flex gap-5 items-start shadow-sm transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5`}
                        style={{ borderLeft: `4px solid ${accent}` }}
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-mono font-bold text-base shrink-0"
                          style={{ background: accent, boxShadow: `0 0 0 4px ${accent}1A` }}
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
              )}

              {/* ── DETAILED FEEDBACK ── */}
              {shownTab === 'detailed' && (feedback.limited ? <UpgradePrompt /> :(
                <div id="fp-panel-detailed" role="tabpanel" aria-labelledby="fp-tab-detailed" className="fp-tab-panel flex flex-col gap-3">
                  {(Object.entries(feedback.feedback ?? {}) as [string, { strengths: string[]; issues: string[] }][]).map(
                    ([key, cat]) => {
                      const isOpen = expandedCats.has(key);
                      const catMeta = CATEGORY_BY_KEY[key] as typeof CATEGORY_META[number] | undefined;
                      const cc = CATEGORY_COLOR_CLASSES[catMeta?.color ?? 'indigo'];
                      const Icon = catMeta?.icon ?? ListChecks;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <button
                            onClick={() => toggleCat(key)}
                            className="w-full px-5 py-4 bg-transparent border-none flex items-center gap-3 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
                            aria-expanded={isOpen}
                          >
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${cc.iconBg}`}>
                              <Icon className={`w-4 h-4 ${cc.icon}`} />
                            </span>
                            <span className="font-bold text-[var(--text-primary)] text-[0.9375rem] flex-1 text-left">
                              {CAT_LABELS[key] ?? key}
                            </span>
                            <span className="hidden sm:flex items-center gap-1.5 text-[0.7rem] text-[var(--text-secondary)]">
                              {cat.strengths.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
                                  <CheckCircle2 className="w-3 h-3" /> {cat.strengths.length}
                                </span>
                              )}
                              {cat.issues.length > 0 && (
                                <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                                  <XCircle className="w-3 h-3" /> {cat.issues.length}
                                </span>
                              )}
                            </span>
                            {isOpen ? (
                              <ChevronUp className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-[var(--text-secondary)] shrink-0" />
                            )}
                          </button>
                          <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                            <div className="overflow-hidden">
                              <div className="px-5 pb-5 border-t border-[var(--border-color)]">
                                {cat.strengths.length > 0 && (
                                  <div className="mt-4 mb-3">
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-green-700 dark:text-green-400 mb-2">
                                      Strengths
                                    </p>
                                    {cat.strengths.map((s, i) => (
                                      <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                                        <p className="text-[0.9rem] text-[var(--text-primary)] leading-relaxed m-0">{s}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {cat.issues.length > 0 && (
                                  <div>
                                    <p className="text-[0.65rem] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2">
                                      Issues to Improve
                                    </p>
                                    {cat.issues.map((s, i) => (
                                      <div key={i} className="flex gap-2.5 mb-1.5 items-start">
                                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                        <p className="text-[0.9rem] text-[var(--text-primary)] leading-relaxed m-0">{s}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              ))}

              {/* ── VOCABULARY ── */}
              {shownTab === 'vocabulary' && (feedback.limited ? <UpgradePrompt /> :(
                <div id="fp-panel-vocabulary" role="tabpanel" aria-labelledby="fp-tab-vocabulary" className="fp-tab-panel">
                  <p className="text-sm text-[var(--text-muted)] mb-5">
                    Tap a card to flip it and see the meaning and example sentence.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {(feedback.vocabulary ?? []).map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-pressed={!!flipped[i]}
                        aria-label={`${v.word}, tap to ${flipped[i] ? 'hide' : 'show'} translation`}
                        className="fp-flip-card h-[185px] text-left bg-transparent border-0 p-0 cursor-pointer transition-transform duration-200 hover:scale-[1.03]"
                        onClick={() => setFlipped((prev) => ({ ...prev, [i]: !prev[i] }))}
                      >
                        <div className={`fp-flip-inner h-full${flipped[i] ? ' is-flipped' : ''}`}>
                          <div
                            className="fp-flip-face bg-linear-to-br from-purple-500 to-purple-700 text-white border border-purple-600 shadow-sm"
                          >
                            <p className="text-[0.65rem] font-bold tracking-widest uppercase text-white/40 mb-3">
                              Word {i + 1} of {(feedback.vocabulary ?? []).length}
                            </p>
                            <p className="text-xl font-bold text-white leading-snug">
                              {v.word}
                            </p>
                            <p className="text-[0.7rem] text-white/35 mt-auto">tap to flip ↩</p>
                          </div>
                          <div
                            className="fp-flip-face fp-flip-back bg-[var(--paper)] border border-[var(--border)] shadow-sm"
                          >
                            <div className="w-full">
                              <span className="bg-[var(--gold)] text-white text-[0.65rem] font-bold px-2 py-0.5 rounded-full inline-block mb-2 uppercase tracking-wide">
                                Uzbek
                              </span>
                              <p className="text-[0.9rem] font-bold text-[var(--text-primary)] mb-1">{v.uzbek}</p>
                              <p className="text-[0.75rem] text-[var(--text-muted)] mb-2 leading-snug">{v.english}</p>
                              <p className="text-[0.75rem] text-purple-700 dark:text-purple-300 italic leading-snug">
                                "{v.exampleFromEssay}"
                              </p>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* ── GRAMMAR ── */}
              {shownTab === 'grammar' && (feedback.limited ? <UpgradePrompt /> :(
                <div id="fp-panel-grammar" role="tabpanel" aria-labelledby="fp-tab-grammar" className="fp-tab-panel flex flex-col gap-3">
                  {(feedback.grammar ?? []).map((g, i) => (
                    <div key={i} className="bg-[var(--bg-card)] rounded-2xl px-6 py-5 border border-[var(--border-color)] shadow-sm transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex gap-4 items-start">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                          <SpellCheck2 className="w-4 h-4" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold text-[var(--text-primary)] mb-1.5 text-[0.9375rem]">{g.point}</p>
                          <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-2.5">{g.explanation}</p>
                          <div className="bg-[var(--gold)]/10 border border-[var(--gold)]/30 rounded-lg px-3.5 py-2.5">
                            <p className="text-[0.8125rem] text-amber-900 dark:text-amber-300 italic m-0">
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
              {shownTab === 'essay' && (feedback.limited ? <UpgradePrompt /> : (() => {
                const sentences = feedback.sentenceAnalysis ?? [];
                const typeColor: Record<string, { bg: string; border: string; label: string; dot: string; text: string }> = {
                  word_choice: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', label: 'Word Choice', dot: 'bg-purple-500', text: 'text-purple-900 dark:text-purple-200' },
                  grammar:     { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800',  label: 'Grammar',     dot: 'bg-amber-500',  text: 'text-amber-900 dark:text-amber-200'  },
                  coherence:   { bg: 'bg-indigo-50 dark:bg-indigo-900/20',   border: 'border-indigo-200 dark:border-indigo-800',   label: 'Coherence',   dot: 'bg-indigo-500',   text: 'text-indigo-900 dark:text-indigo-200'   },
                  structure:   { bg: 'bg-red-50 dark:bg-red-900/20',    border: 'border-red-200 dark:border-red-800',    label: 'Structure',   dot: 'bg-red-500',    text: 'text-red-900 dark:text-red-200'    },
                  ok:          { bg: 'bg-green-50 dark:bg-green-900/20',  border: 'border-green-200 dark:border-green-800',  label: 'Good',        dot: 'bg-green-500',  text: 'text-green-900 dark:text-green-200'  },
                };
                return (
                  <div id="fp-panel-essay" role="tabpanel" aria-labelledby="fp-tab-essay" className="fp-tab-panel">
                    <div className="flex flex-wrap gap-2 mb-5">
                      {Object.entries(typeColor).map(([type, style]) => (
                        <span key={type} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.border} ${style.text}`}>
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
                            <button
                              key={i}
                              type="button"
                              className={`w-full text-left block rounded-xl border px-5 py-3.5 cursor-pointer transition-[transform,box-shadow] duration-200 hover:shadow-md hover:-translate-y-0.5 ${style.bg} ${style.border}`}
                              onClick={() => toggleSentence(i)}
                              aria-expanded={isOpen}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[0.9375rem] text-gray-800 dark:text-neutral-100 leading-relaxed m-0">
                                    {s.sentence}
                                  </p>
                                  <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                    <div className="overflow-hidden">
                                      <div className="mt-2.5 pt-2.5 border-t border-current/10 flex flex-col gap-2">
                                        <div>
                                          <span className={`text-[0.65rem] font-bold uppercase tracking-widest mr-2 ${style.dot.replace('bg-', 'text-')}`}>
                                            {style.label}
                                          </span>
                                          <span className="text-sm text-gray-700 dark:text-neutral-300">{s.feedback}</span>
                                        </div>
                                        {s.improved && s.type !== 'ok' && (
                                          <div className="bg-[var(--ink-blue)]/6 border border-[var(--ink-blue)]/20 rounded-lg px-3 py-2.5">
                                            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-widest text-[var(--ink-blue)] mb-1">
                                              <Sparkles className="w-3 h-3" /> Improved version
                                            </p>
                                            <p className="text-sm text-[var(--ink-blue)] leading-relaxed m-0 italic">
                                              {s.improved}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                {isOpen ? (
                                  <ChevronUp className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-1" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-1" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })())}

              {/* ── SAMPLE RESPONSE ── */}
              {shownTab === 'sample' && (feedback.limited ? <UpgradePrompt /> : (
                <div id="fp-panel-sample" role="tabpanel" aria-labelledby="fp-tab-sample" className="fp-tab-panel relative overflow-hidden bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] border-l-4 border-l-[var(--gold)] px-6 py-6 shadow-sm transition-shadow duration-200 hover:shadow-md">
                  <div className="absolute inset-0 bg-linear-to-br from-[var(--gold)]/[0.05] via-transparent to-transparent pointer-events-none" />
                  <p className="relative flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-[var(--gold)] mb-4">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-[var(--gold)]/15">
                      <PenLine className="w-3.5 h-3.5" />
                    </span>
                    Band 7–8 Sample Response
                  </p>
                  <p className="relative text-[var(--text-primary)] leading-[1.9] text-[0.9375rem] whitespace-pre-wrap">
                    {feedback.sampleResponse ?? 'Sample response not available for this analysis.'}
                  </p>
                </div>
              ))}

              {/* ── SPELLING CHECKER ── */}
              {shownTab === 'spelling' && (() => {
                const essayText = selectedTask === 'task1' ? reportData.userText1 : reportData.userText2;
                return (
                <div id="fp-panel-spelling" role="tabpanel" aria-labelledby="fp-tab-spelling" className="fp-tab-panel">
                  {!ltChecked ? (
                    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                        <div className="flex gap-1">
                          {(['en-GB', 'en-US'] as const).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => setLtLang(lang)}
                              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                                ltLang === lang
                                  ? 'bg-[var(--ink-blue-solid)] text-white border-[var(--ink-blue)]'
                                  : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-color)]'
                              }`}
                            >
                              {lang === 'en-GB' ? '🇬🇧 British' : '🇺🇸 American'}
                            </button>
                          ))}
                        </div>
                        <Button size="sm" onClick={() => runSpellCheck(essayText)} disabled={ltLoading || !essayText.trim()}>
                          {ltLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          {ltLoading ? 'Checking…' : 'Check my essay'}
                        </Button>
                      </div>
                      <div className="px-5 py-4 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap min-h-[200px]">
                        {essayText || <span className="italic">No essay text available.</span>}
                      </div>
                      {ltError && <p className="px-5 pb-3 text-sm text-red-600 dark:text-red-400">{ltError}</p>}
                    </div>
                  ) : (
                    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border-color)] shadow-sm">
                      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-subtle)] rounded-t-2xl">
                        <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${ltMatches.length === 0 ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {ltMatches.length === 0 ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                          {ltMatches.length === 0 ? 'No issues found' : `${ltMatches.length} issue${ltMatches.length !== 1 ? 's' : ''} found`}
                        </span>
                        <button
                          onClick={() => { setLtChecked(false); setLtMatches([]); setLtPopover(null); }}
                          className="text-sm text-[var(--text-muted)] underline cursor-pointer bg-transparent border-none"
                        >
                          Reset
                        </button>
                      </div>
                      <div
                        className="relative px-5 py-4 text-[0.9375rem] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap min-h-[200px] cursor-default"
                        ref={ltOverlayRef}
                        onClick={() => setLtPopover(null)}
                      >
                        {buildSegments(ltCorrected, ltMatches).map((seg, i) => {
                          if (!seg.match) return <span key={i}>{seg.text}</span>;
                          const openPopover = (target: HTMLElement) => {
                            const r = target.getBoundingClientRect();
                            const cr = ltOverlayRef.current!.getBoundingClientRect();
                            // Keep the popover inside the container so it isn't cut off at the edges
                            const POP_W = 290;
                            const x = Math.max(8, Math.min(r.left - cr.left, cr.width - POP_W));
                            setLtPopover({ match: seg.match!, x, y: r.bottom - cr.top + 6 });
                          };
                          return (
                            <mark
                              key={i}
                              tabIndex={0}
                              role="button"
                              aria-label={`Spelling/grammar issue: ${seg.text}`}
                              style={{ background: 'transparent', borderBottom: `2px solid ${ltColor(seg.match.rule.issueType)}`, cursor: 'pointer' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openPopover(e.target as HTMLElement);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openPopover(e.target as HTMLElement);
                                }
                              }}
                            >{seg.text}</mark>
                          );
                        })}
                        {ltPopover && (
                          <div
                            className="absolute z-30 bg-[#171717] border border-[#262626] rounded-xl p-3.5 max-w-[280px] shadow-xl"
                            style={{ left: ltPopover.x, top: ltPopover.y }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <p className="text-[0.8rem] text-neutral-300 mb-2.5 leading-snug">{ltPopover.match.message}</p>
                            {ltPopover.match.replacements.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {ltPopover.match.replacements.slice(0, 5).map((r, i) => (
                                  <button
                                    key={i}
                                    onClick={() => applyLtFix(ltPopover.match, r.value)}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded cursor-pointer border-none"
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
                            <span className="font-semibold text-sm text-[var(--text-primary)] block">"{ltCorrected.slice(m.offset, m.offset + m.length)}"</span>
                            <span className="text-xs text-[var(--text-muted)]">{m.message}</span>
                          </div>
                          {m.replacements.length > 0 && (
                            <button
                              onClick={() => applyLtFix(m, m.replacements[0].value)}
                              className="px-3 py-1 bg-[var(--ink-blue-solid)] text-white text-xs font-semibold rounded cursor-pointer border-none shrink-0"
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
              {shownTab === 'quiz' && (feedback.limited ? <UpgradePrompt /> : (
                <div id="fp-panel-quiz" role="tabpanel" aria-labelledby="fp-tab-quiz" className="fp-tab-panel">
                  <p className="text-sm text-[var(--text-muted)] mb-5">
                    Write a sentence using each word or grammar rule. Tap <strong>Show example</strong> to check.
                  </p>
                  <div className="flex flex-col gap-4">
                    {(feedback.vocabulary ?? []).map((v, i) => {
                      const key = `vocab_${i}`;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-2xl px-5 py-4 border border-[var(--border-color)] border-l-4 border-l-purple-500 shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <div className="flex items-center gap-3 mb-3">
                            <span className="bg-purple-500/10 text-purple-700 dark:text-purple-300 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Vocab</span>
                            <span className="font-bold text-purple-700 dark:text-purple-300 text-base">{v.word}</span>
                            <span className="text-xs text-[var(--text-muted)]">— {v.uzbek}</span>
                          </div>
                          <textarea autoComplete="off"
                            className="w-full border border-[var(--border-color)] bg-[var(--bg-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] resize-none outline-hidden focus:border-purple-500 focus-visible:ring-2 focus-visible:ring-purple-500/40 transition-colors"
                            rows={2}
                            name={`practice-${key}`}
                            aria-label={`Sentence using ${v.word}`}
                            placeholder={`Write a sentence using "${v.word}"…`}
                            value={practiceInputs[key] ?? ''}
                            onChange={(e) => setPracticeInputs((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => checkPracticeSentence(key, practiceInputs[key] ?? '', v.word, 'vocab', v.exampleFromEssay)}
                              disabled={practiceChecking[key] || !(practiceInputs[key] ?? '').trim()}
                              className="inline-flex items-center gap-1.5 text-xs bg-purple-600 text-white px-3 py-1 rounded cursor-pointer border-none disabled:opacity-40 hover:bg-purple-700 transition-colors"
                            >
                              {practiceChecking[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                              {practiceChecking[key] ? 'Checking…' : 'Check with AI'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-purple-700 dark:text-purple-300 underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Hide' : 'Show example'}
                            </button>
                          </div>
                          {practiceChecked[key] && (
                            <PracticeResult result={practiceChecked[key]} accentClass="text-purple-700 dark:text-purple-300" />
                          )}
                          {practiceRevealed[key] && (
                            <p className="mt-2 text-sm text-purple-700 dark:text-purple-300 italic bg-purple-500/5 rounded-lg px-3 py-2">
                              "{v.exampleFromEssay}"
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {(feedback.grammar ?? []).map((g, i) => {
                      const key = `grammar_${i}`;
                      return (
                        <div key={key} className="bg-[var(--bg-card)] rounded-2xl px-5 py-4 border border-[var(--border-color)] border-l-4 border-l-amber-500 shadow-sm transition-shadow duration-200 hover:shadow-md">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="bg-[var(--gold)]/20 text-amber-800 dark:text-amber-200 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Grammar</span>
                            <span className="font-bold text-[var(--text-primary)] text-sm">{g.point}</span>
                          </div>
                          <p className="text-xs text-[var(--text-muted)] mb-3">{g.explanation}</p>
                          <textarea autoComplete="off"
                            className="w-full border border-[var(--border-color)] bg-[var(--bg-input)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] resize-none outline-hidden focus:border-[var(--gold)] focus-visible:ring-2 focus-visible:ring-[var(--gold)]/40 transition-colors"
                            rows={2}
                            name={`practice-${key}`}
                            aria-label={`Example for ${g.point}`}
                            placeholder="Write an example using this rule…"
                            value={practiceInputs[key] ?? ''}
                            onChange={(e) => setPracticeInputs((p) => ({ ...p, [key]: e.target.value }))}
                          />
                          <div className="mt-2 flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => checkPracticeSentence(key, practiceInputs[key] ?? '', g.point, 'grammar', g.example)}
                              disabled={practiceChecking[key] || !(practiceInputs[key] ?? '').trim()}
                              className="inline-flex items-center gap-1.5 text-xs bg-amber-700 text-white px-3 py-1 rounded cursor-pointer border-none disabled:opacity-40 hover:bg-amber-800 transition-colors"
                            >
                              {practiceChecking[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                              {practiceChecking[key] ? 'Checking…' : 'Check with AI'}
                            </button>
                            <button
                              onClick={() => setPracticeRevealed((p) => ({ ...p, [key]: !p[key] }))}
                              className="text-xs text-amber-700 dark:text-amber-400 underline cursor-pointer bg-transparent border-none"
                            >
                              {practiceRevealed[key] ? 'Hide' : 'Show example'}
                            </button>
                          </div>
                          {practiceChecked[key] && (
                            <PracticeResult result={practiceChecked[key]} accentClass="text-amber-800 dark:text-amber-300" />
                          )}
                          {practiceRevealed[key] && (
                            <p className="mt-2 text-sm text-amber-900 dark:text-amber-200 italic bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
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

          {feedback && (
            <div className="mt-10 pt-5 border-t border-[var(--border-color)] flex justify-center">
              <FeedbackRating reportId={id ?? 'report'} />
            </div>
          )}

          <div className="text-center mt-6">
            <Link to="/dashboard">
              <Button variant="secondary"><ChevronLeft className="w-4 h-4" /> Try another question</Button>
            </Link>
          </div>
        </div>
      </div>

    </AppShell>
  );
}
