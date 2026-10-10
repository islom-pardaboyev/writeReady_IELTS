import { useMemo, useEffect, useState } from 'react';
import { useNavigate, Link, Navigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/badge';
import { countFeedbackReports, getActivityDays, getProgressReports, type FeedbackReport } from '../firebase/firestore';
import { readProgressCache, saveProgressCache } from '../lib/progressCache';
import { getHumanReviewsForStudent } from '../firebase/teachers';
import type { HumanReview } from '../types';
import { ProgressSection } from '../components/ui/ProgressSection';
import { ProfileHeader, StatsOverview } from '../components/dashboard/ProfileOverview';
import { dashboardStats, hasProgress } from '../lib/dashboardStats';
import { TelegramBotCard } from '../components/ui/TelegramBotCard';
import { doc, updateDoc } from 'firebase/firestore';
import { hasFreeReportThisWeek } from '../lib/weeklyFree';
import { PLAN_INFO, isPaidPlan as isPaidPlanFn, pdfHistoryLimit } from '../lib/plans';
import { downloadArchivedReport, listDownloadableReports } from '../lib/reportDownload';
import { useSingleRun } from '../hooks/useSingleRun';
import { db } from '../firebase/config';
import { GraduationCap, Clock, Coffee, Download, FileText, Gift, Loader2, PenLine, School, Timer, X, Zap } from 'lucide-react';
import { CRITERIA, reportBand, type Criterion } from '@shared/bandScore';

// A plan's allowance renews at 00:00 UTC on its day (api/_lib/planCycle.ts).
const renewDay = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });


// The same icon and colour each mode wears on the home page.
const modes = [
  { id: 'mock', Icon: Timer, well: 'bg-brand-600 text-white', title: 'Mock Exam', desc: '60-min timer · Exam simulation' },
  { id: 'practice', Icon: PenLine, well: 'bg-field-mint text-field-ink', title: 'Practice', desc: 'No timer · Build your skills' },
  { id: 'quick', Icon: Zap, well: 'bg-field-amber text-field-ink', title: 'Quick Write', desc: 'Task 1 or 2 · PDF + AI feedback' },
  { id: 'relax', Icon: Coffee, well: 'bg-field-lilac text-field-ink', title: 'Relax', desc: 'Your prompt · Write freely' },
];

const SECTION_TITLE = 'font-display text-[1.375rem] font-extrabold tracking-[-0.02em] text-[var(--text-primary)]';

// Recent Analyses cards shown before "See more" — one row on desktop.
const RECENT_PREVIEW_COUNT = 3;

// The report's official overall band, the same number the report showed.
function overallBand(scores: Record<string, number>): string {
  const band = reportBand(scores);
  return band === null ? '—' : band.toFixed(1);
}

const relativeTimeFormat = new Intl.RelativeTimeFormat(navigator.language, { numeric: 'auto' });

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return relativeTimeFormat.format(-mins, 'minute');
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return relativeTimeFormat.format(-hrs, 'hour');
  const days = Math.floor(hrs / 24);
  if (days < 7) return relativeTimeFormat.format(-days, 'day');
  return new Intl.DateTimeFormat(navigator.language, { day: 'numeric', month: 'short' }).format(date);
}

function bandColor(band: string): string {
  const n = parseFloat(band);
  if (isNaN(n)) return 'text-[var(--text-secondary)]';
  if (n >= 7) return 'text-emerald-600 dark:text-emerald-400';
  if (n >= 6) return 'text-blue-600 dark:text-blue-400';
  if (n >= 5) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-500 dark:text-red-400';
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, (value / 9) * 100);
  const color = value >= 7 ? 'bg-emerald-500' : value >= 6 ? 'bg-blue-500' : value >= 5 ? 'bg-amber-500' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] text-[var(--text-secondary)] w-8 shrink-0 font-mono">{value.toFixed(1)}</span>
      <div className="flex-1 h-1 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.65rem] text-[var(--text-secondary)] w-8 shrink-0 text-right truncate">{label}</span>
    </div>
  );
}

const SCORE_LABELS: Record<Criterion, string> = {
  taskAchievement: 'TA',
  coherenceCohesion: 'CC',
  lexicalResource: 'LR',
  grammaticalRangeAccuracy: 'GRA',
};

/**
 * The four criteria in the examiner's order. The stored scores also hold the
 * overall band (shown large on the card already, and listed as "ove" when
 * every key was printed), and a stored map keeps no fixed key order, so the
 * rows came out shuffled from card to card.
 */
function criterionRows(scores: Record<string, number>, taskType: string) {
  const task2 = !taskType.toLowerCase().includes('1');
  return CRITERIA.filter((c) => typeof scores[c] === 'number').map((c) => ({
    key: c,
    // Task 2 calls the first criterion Task Response.
    label: c === 'taskAchievement' && task2 ? 'TR' : SCORE_LABELS[c],
    value: scores[c],
  }));
}

export function DashboardPage() {
  const { user, profile, loading, refreshProfile } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  // The newest 30 reports, oldest first. One download feeds the figures at the
  // top, the progress charts and the recent analyses.
  const [progress, setProgress] = useState<FeedbackReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportCount, setReportCount] = useState<number | null>(null);
  // Essays finished per day (saved PDFs), for the streak; null until loaded.
  const [activity, setActivity] = useState<Record<string, number> | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [humanReviews, setHumanReviews] = useState<HumanReview[]>([]);
  const [humanReviewsLoading, setHumanReviewsLoading] = useState(true);

  useEffect(() => {
    // Redirect admin/center-admin accounts away from user dashboard
    if (user?.email?.endsWith('@writeready.internal')) {
      if (localStorage.getItem('centerAdminLoggedIn') === 'true') {
        navigate('/center-admin');
      } else if (localStorage.getItem('adminLoggedIn') === 'true') {
        navigate('/admin');
      } else {
        navigate('/');
      }
      return;
    }
    if (!user?.uid) return;
    refreshProfile();
    // The chart shows the saved copy at once; the count (one read) says
    // whether it is still current (src/lib/progressCache.ts).
    const uid = user.uid;
    const saved = readProgressCache(uid);
    if (saved) {
      setProgress(saved.reports);
      setReportCount(saved.count);
      setReportsLoading(false);
    }
    countFeedbackReports(uid)
      .catch((e) => {
        console.error('Could not count feedback reports:', e);
        return null;
      })
      .then(async (count) => {
        if (count !== null) setReportCount(count);
        if (saved && count === saved.count) return;
        const reports = await getProgressReports(uid);
        setProgress(reports);
        if (count !== null) saveProgressCache(uid, count, reports);
      })
      .catch((e) => console.error('Failed to load feedback reports:', e))
      .finally(() => setReportsLoading(false));
    getActivityDays(user.uid).then(setActivity);
    getHumanReviewsForStudent(user.uid)
      .then(setHumanReviews)
      .catch((e) => console.error('Failed to load human reviews:', e))
      .finally(() => setHumanReviewsLoading(false));
  // refreshProfile isn't memoized in AuthContext; including it would re-run
  // this effect (and re-fetch reports) on every auth re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, user?.email, navigate]);

  useEffect(() => {
    if (profile?.notification) setNotification(profile.notification as string);
  }, [profile?.notification]);

  const dismissNotification = async () => {
    setNotification(null);
    if (user?.uid) {
      await updateDoc(doc(db, 'users', user.uid), { notification: '' }).catch(() => {});
    }
  };

  const isPaidPlan = isPaidPlanFn(profile?.plan);
  const isPro = isPaidPlan;
  const profileAny = profile as unknown as Record<string, unknown> | null;
  const centerName = profileAny?.centerName as string | undefined;
  const centerId = profileAny?.centerId as string | undefined;
  const subscriptionExpiresAt = profileAny?.subscriptionExpiresAt as string | null | undefined;
  const isStudent = !!(centerId && centerName);
  // `profile.plan` is already the plan after expiry, so a learning-center
  // student whose center's contract has ended reads as free here — they get
  // the same weekly free report as anyone else until the center renews.
  const centerPlanEnded = isStudent && !isPaidPlan;
  const bonusAnalyses = profile?.bonusAnalyses ?? 0;
  const freeReportAvailable = hasFreeReportThisWeek(profile?.freeUsage);
  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 0;
  const usagePct = usageLimit > 0 ? Math.min(100, (usedCount / usageLimit) * 100) : 0;
  const remaining = usageLimit - usedCount;

  const planName = PLAN_INFO[profile?.plan ?? 'free'].label;
  const onFreePlan = !isPaidPlan && (!isStudent || centerPlanEnded);

  const statsLoading = reportsLoading || activity === null;
  const stats = useMemo(
    () => (statsLoading ? null : dashboardStats(progress, new Date(), activity ?? {})),
    [progress, activity, statsLoading],
  );
  // Newest first, as the Recent Analyses cards list them. One row shows
  // until the student asks for the rest.
  const reports = useMemo(() => [...progress].reverse(), [progress]);
  const [showAllReports, setShowAllReports] = useState(false);
  const visibleReports = showAllReports ? reports : reports.slice(0, RECENT_PREVIEW_COUNT);

  // Which recent reports can still be downloaded as a PDF: the newest 10 on
  // Premium, 3 on the other paid plans (api/_lib/reportArchive.ts).
  const pdfLimit = pdfHistoryLimit(profile?.plan ?? 'free');
  const [downloadable, setDownloadable] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const { run: runDownload } = useSingleRun();
  useEffect(() => {
    if (!user || pdfLimit === 0) return;
    listDownloadableReports(user)
      .then((ids) => setDownloadable(new Set(ids)))
      .catch((e) => console.error('Could not list downloadable reports:', e));
  }, [user, pdfLimit, progress]);
  const downloadReport = (reportId: string) => user && runDownload(async () => {
    setDownloadingId(reportId);
    setDownloadError(null);
    try {
      await downloadArchivedReport(user, reportId);
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Could not download the report.');
    } finally {
      setDownloadingId(null);
    }
  });

  // Signed-out visitors belong on the landing page, not an empty dashboard.
  // After every hook above, so the hook count never changes between renders.
  if (!loading && !user) return <Navigate to="/" replace />;

  return (
    <AppShell>
      <div className="py-10">
        <div className="max-w-[1160px] mx-auto px-6">

          {/* Bonus notification banner — hide for paid users */}
          {notification && !isPaidPlan && (
            <div role="status" aria-live="polite" className="mb-6 flex items-center gap-3 rounded-3xl bg-field-amber px-5 py-4 text-field-ink">
              <Gift className="size-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium leading-relaxed">{notification}</p>
              <button
                onClick={dismissNotification}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border-none bg-transparent text-field-ink transition-colors hover:bg-field-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-field-ink"
                aria-label="Dismiss"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Who you are, then where you stand */}
          {user && profile ? (
            <ProfileHeader user={user} profile={profile} />
          ) : (
            <div aria-hidden="true" className="mb-6 h-[236px] rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] animate-pulse motion-reduce:animate-none" />
          )}
          <StatsOverview
            stats={stats}
            loading={statsLoading}
            totalReports={reportCount ?? progress.length}
            showAnalytics={hasProgress(progress)}
          />

          {/* Learning Center student info card */}
          {isStudent && (
            <Card className="gs-db-quota mb-8 rounded-3xl border-transparent bg-field-mint px-6 py-5 text-field-ink shadow-none">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--bg-card)] text-[var(--text-primary)]">
                  <School className="size-6" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="mb-0.5 text-sm font-semibold text-field-ink/80">Learning center student</p>
                  <p className="font-display text-lg font-extrabold leading-tight text-field-ink">{centerName}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-field-ink/80">
                      {centerPlanEnded ? (
                        "Your center's plan has ended. You're on the free plan until it renews."
                      ) : (
                        <>
                          <span className="font-semibold text-field-ink">{planName}</span> plan ·{' '}
                          <span className="font-semibold text-field-ink">{remaining}</span> AI analyses remaining this month
                        </>
                      )}
                    </span>
                    {subscriptionExpiresAt && (
                      <span className="rounded-full bg-field-ink/10 px-2 py-0.5 text-xs text-field-ink">
                        {centerPlanEnded ? 'Ended' : 'Access until'}{' '}
                        {new Date(subscriptionExpiresAt).toLocaleDateString(navigator.language, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-2xl font-semibold tabular-nums text-field-ink">{usedCount}/{usageLimit}</div>
                  <div className="text-xs text-field-ink/75">used</div>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-field-ink/15">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${usagePct >= 85 ? 'bg-red-500' : 'bg-field-ink'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </Card>
          )}

          {/* Quota bar */}
          {(isPro || bonusAnalyses > 0 || onFreePlan) && (
            <Card className="gs-db-quota mb-8 rounded-3xl px-6 py-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="font-semibold text-[0.9375rem] text-[var(--text-primary)]">
                  {isPro ? `${planName} · Monthly AI analyses` : 'Free weekly analysis'}
                </span>
                <div className="flex items-center gap-2">
                  {bonusAnalyses > 0 && (
                    <Badge variant="warning" className="gap-1"><Gift className="size-3.5" aria-hidden="true" />+{bonusAnalyses} bonus</Badge>
                  )}
                  {isPro && (
                    <span className={`font-mono text-[0.9375rem] font-medium ${usagePct >= 85 ? 'text-red-500' : 'text-brand-600 dark:text-brand-400'}`}>
                      {usedCount}/{usageLimit}
                    </span>
                  )}
                  {onFreePlan && (
                    <Badge variant={freeReportAvailable ? 'success' : 'secondary'}>
                      {freeReportAvailable ? 'Available' : 'Used · resets Monday'}
                    </Badge>
                  )}
                </div>
              </div>
              {isPro && (
                <>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-[var(--border-color)] dark:bg-[var(--border-strong)]">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${usagePct >= 85 ? 'bg-red-500' : 'bg-brand-600 dark:bg-brand-400'}`}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {usedCount} of {usageLimit} analyses used · {remaining} remaining
                    {usage?.renewsAt && <> · renews {renewDay.format(usage.renewsAt)}</>}
                  </p>
                </>
              )}
              {onFreePlan && (
                <p className="text-xs text-[var(--text-secondary)]">
                  Free-plan users get 1 AI feedback report every week, and one report covers one essay. Upgrade for a
                  higher monthly allowance.
                </p>
              )}
            </Card>
          )}

          {/* Mode picker */}
          <h2 className={`${SECTION_TITLE} mb-4`}>Choose a practice mode</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">
            {modes.map((m) => (
              <Link
                key={m.id}
                to={`/writing/${m.id}`}
                className="gs-db-mode-card block cursor-pointer rounded-3xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-left no-underline transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] motion-reduce:hover:translate-y-0 motion-reduce:focus-visible:translate-y-0"
              >
                <span className={`grid size-12 place-items-center rounded-2xl ${m.well}`}>
                  <m.Icon className="size-6" aria-hidden="true" />
                </span>
                <div className="mt-4 font-display text-lg font-extrabold tracking-[-0.01em] text-[var(--text-primary)]">{m.title}</div>
                <div className="mt-1 text-[0.8125rem] text-[var(--text-secondary)]">{m.desc}</div>
              </Link>
            ))}
          </div>

          <TelegramBotCard paidPlan={isPaidPlan} />

          {/* Progress Section */}
          {user?.uid && <ProgressSection reports={progress} loading={reportsLoading} />}

          {/* Recent Analyses */}
          {isPro && (
            <div className="gs-db-history mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className={SECTION_TITLE}>Recent analyses</h2>
                {reports.length > 0 && (
                  <span className="text-xs text-[var(--text-secondary)] font-medium">
                    {showAllReports ? `Last ${reports.length} sessions` : `${visibleReports.length} of ${reports.length}`}
                  </span>
                )}
              </div>
              {pdfLimit > 0 && (
                <p className="text-xs text-[var(--text-secondary)] -mt-2 mb-4">
                  You can download your last {pdfLimit} reports as PDFs. Each new report replaces the oldest one.
                </p>
              )}
              {downloadError && (
                <p role="alert" className="text-xs text-red-600 dark:text-red-400 -mt-2 mb-4">{downloadError}</p>
              )}

              {reportsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[160px] rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] animate-pulse motion-reduce:animate-none" />
                  ))}
                </div>
              ) : reports.length === 0 ? (
                <Card className="rounded-3xl px-8 py-10 text-center">
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-field-lilac text-field-ink">
                    <FileText className="size-6" aria-hidden="true" />
                  </span>
                  <p className="font-semibold text-[var(--text-primary)] mb-1">No analyses yet</p>
                  <p className="text-sm text-[var(--text-secondary)]">Submit an essay and get AI feedback to see your progress here.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {visibleReports.map((r) => {
                    const band = overallBand(r.scores);
                    const scoreRows = criterionRows(r.scores, r.taskType ?? '');
                    return (
                      <Card
                        key={r.id}
                        className="group flex flex-col gap-4 rounded-3xl p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] motion-reduce:hover:translate-y-0"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Badge variant={r.taskType?.toLowerCase().includes('1') ? 'purple' : 'info'} className="mb-2">
                              {r.taskType?.toLowerCase().includes('1') ? 'Task 1' : 'Task 2'}
                            </Badge>
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                              {r.topic}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-mono text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums ${bandColor(band)}`}>
                              {band}
                            </div>
                            <div className="mt-1 text-[0.6875rem] text-[var(--text-secondary)]">Overall</div>
                          </div>
                        </div>

                        {/* Score bars */}
                        {scoreRows.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {scoreRows.map((row) => (
                              <ScoreBar key={row.key} label={row.label} value={row.value} />
                            ))}
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)] mt-auto">
                          <span className="text-[0.7rem] text-[var(--text-secondary)]">
                            {timeAgo(r.createdAt)}
                          </span>
                          {downloadable.has(r.id) && (
                            <button
                              type="button"
                              onClick={() => downloadReport(r.id)}
                              disabled={downloadingId !== null}
                              aria-label={`Download PDF: ${r.topic}`}
                              className="flex items-center gap-1 text-[0.7rem] font-medium text-brand-blue-600 dark:text-brand-blue-400 bg-transparent border-0 p-0 cursor-pointer hover:underline underline-offset-4 disabled:opacity-60 disabled:cursor-default"
                            >
                              {downloadingId === r.id
                                ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                                : <Download className="w-3 h-3" aria-hidden />}
                              {downloadingId === r.id ? 'Preparing…' : 'Download PDF'}
                            </button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              {!reportsLoading && reports.length > RECENT_PREVIEW_COUNT && (
                <div className="mt-4 flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAllReports((v) => !v)}
                    aria-expanded={showAllReports}
                  >
                    {showAllReports ? 'Show less' : `See more (${reports.length - RECENT_PREVIEW_COUNT})`}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Human Check */}
          {isPro && (
            <div id="gs-db-history" className=" mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className={SECTION_TITLE}>Human Check</h2>
                <span className="text-xs text-[var(--text-secondary)] font-medium">Teacher reviews</span>
              </div>

              {humanReviewsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[140px] rounded-3xl bg-[var(--bg-card)] border border-[var(--border-color)] animate-pulse motion-reduce:animate-none" />
                  ))}
                </div>
              ) : humanReviews.length === 0 ? (
                <Card className="rounded-3xl px-8 py-10 text-center">
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-field-mint text-field-ink">
                    <GraduationCap className="size-6" aria-hidden="true" />
                  </span>
                  <p className="font-semibold text-[var(--text-primary)] mb-1">No teacher reviews yet</p>
                  <p className="text-sm text-[var(--text-secondary)]">Tap "Human Check" after submitting an essay to get real feedback from a teacher.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {humanReviews.map((r) => {
                    const taskLabel = [r.task1 && 'Task 1', r.task2 && 'Task 2'].filter(Boolean).join(' & ');
                    const isChecked = r.status === 'checked';
                    return (
                      <Link key={r.id} to={`/human-review/${r.id}`} className="no-underline">
                        <Card className="group flex h-full flex-col gap-4 rounded-3xl p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] motion-reduce:hover:translate-y-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <Badge variant="purple" className="mb-2">
                                {taskLabel || r.mode}
                              </Badge>
                              <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                                {r.teacherName}
                              </p>
                            </div>
                            <Badge variant={isChecked ? 'success' : 'warning'} className="shrink-0">
                              {isChecked ? 'Checked' : 'Unchecked'}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)] mt-auto">
                            <span className="text-[0.7rem] text-[var(--text-secondary)]">
                              {timeAgo(r.requestedAt)}
                            </span>
                            {isChecked ? (
                              <span className="flex items-center gap-1 text-[0.7rem] font-medium text-emerald-600 dark:text-emerald-400">
                                <Download className="w-3 h-3" /> Feedback ready
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[0.7rem] font-medium text-amber-600 dark:text-amber-400">
                                <Clock className="w-3 h-3" /> Awaiting review
                              </span>
                            )}
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isPro && (
            <div className="gs-db-upsell mt-4 flex flex-wrap items-center justify-between gap-5 rounded-3xl bg-brand-600 p-7 sm:p-9">
              <div>
                <h3 className="mb-1.5 font-display text-2xl font-extrabold tracking-[-0.02em] text-white">
                  Unlock AI Feedback
                </h3>
                <p className="m-0 max-w-[52ch] text-[0.9375rem] leading-relaxed text-white/85">
                  Get sentence-level corrections, vocabulary upgrades, and a band score estimate.
                </p>
              </div>
              <Link
                to="/pricing"
                className="inline-flex h-12 shrink-0 items-center rounded-full bg-white px-6 text-[0.9375rem] font-bold text-brand-700 no-underline transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-600 motion-reduce:hover:translate-y-0"
              >
                Upgrade Plan
              </Link>
            </div>
          )}

        </div>
      </div>

    </AppShell>
  );
}
