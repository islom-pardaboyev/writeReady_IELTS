import { useLayoutEffect, useRef, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/badge';
import { getRecentFeedbackReports, type FeedbackReport } from '../firebase/firestore';
import { ProgressSection } from '../components/ui/ProgressSection';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

gsap.registerPlugin(ScrollTrigger);

const modes = [
  { id: 'mock', emoji: '⏱', title: 'Mock Exam', desc: '60-min timer · Exam simulation' },
  { id: 'practice', emoji: '✏️', title: 'Practice', desc: 'No timer · Build your skills' },
  { id: 'relax', emoji: '☕', title: 'Relax', desc: 'Your prompt · Write freely' },
];

function overallBand(scores: Record<string, number>): string {
  const vals = Object.values(scores).filter((v) => typeof v === 'number');
  if (!vals.length) return '—';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return (Math.round(avg * 2) / 2).toFixed(1);
}

function timeAgo(date: Date | null): string {
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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

const SCORE_LABELS: Record<string, string> = {
  taskAchievement: 'TA',
  coherenceCohesion: 'CC',
  lexicalResource: 'LR',
  grammaticalRangeAccuracy: 'GRA',
};

export function DashboardPage() {
  const { user, profile, refreshProfile } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.gs-db-welcome', { y: 28, opacity: 0 });
      gsap.set('.gs-db-quota', { y: 20, opacity: 0 });
      gsap.set('.gs-db-mode-card', { y: 32, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-db-welcome', { y: 0, opacity: 1, duration: 0.6 })
        .to('.gs-db-quota', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
        .to('.gs-db-mode-card', { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }, '-=0.25');

      gsap.from('.gs-db-upsell', {
        scrollTrigger: { trigger: '.gs-db-upsell', start: 'top 88%' },
        y: 36, opacity: 0, duration: 0.65, ease: 'power3.out',
      });

      gsap.from('.gs-db-history', {
        scrollTrigger: { trigger: '.gs-db-history', start: 'top 88%' },
        y: 36, opacity: 0, duration: 0.65, ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

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
    getRecentFeedbackReports(user.uid, 5)
      .then(setReports)
      .finally(() => setReportsLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    if (profile?.notification) setNotification(profile.notification as string);
  }, [profile?.notification]);

  const dismissNotification = async () => {
    setNotification(null);
    if (user?.uid) {
      await updateDoc(doc(db, 'users', user.uid), { notification: '' }).catch(() => {});
    }
  };

  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';
  const profileAny = profile as unknown as Record<string, unknown> | null;
  const centerName = profileAny?.centerName as string | undefined;
  const centerId = profileAny?.centerId as string | undefined;
  const subscriptionExpiresAt = profileAny?.subscriptionExpiresAt as string | null | undefined;
  const isStudent = !!(centerId && centerName);
  const bonusAnalyses = profile?.bonusAnalyses ?? 0;
  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);
  const remaining = usageLimit - usedCount;

  return (
    <Layout>
      <div className="py-10">
        <div className="max-w-[1160px] mx-auto px-6" ref={rootRef}>

          {/* Bonus notification banner */}
          {notification && (
            <div className="mb-6 flex items-start gap-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-2xl px-5 py-4">
              <span className="text-2xl shrink-0">🎁</span>
              <p className="text-sm text-amber-800 font-medium flex-1 leading-relaxed">{notification}</p>
              <button
                onClick={dismissNotification}
                className="text-amber-500 hover:text-amber-700 bg-transparent border-none cursor-pointer text-lg leading-none shrink-0"
                aria-label="Yopish"
              >×</button>
            </div>
          )}

          {/* Welcome header */}
          <div className="gs-db-welcome mb-8">
            <h1 className="font-fraunces text-4xl font-extrabold text-[var(--text-primary)] mb-1.5">
              Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            <p className="text-[var(--text-secondary)]">
              {isPro && !isStudent
                ? `${remaining} AI analyses remaining this month${bonusAnalyses > 0 ? ` · +${bonusAnalyses} bonus` : ''}`
                : !isStudent && bonusAnalyses > 0
                ? `+${bonusAnalyses} bepul tahlil mavjud 🎁`
                : !isStudent
                ? 'Free plan — upgrade to unlock AI feedback'
                : `AI feedback — ${remaining} analyses remaining this month`}
            </p>
          </div>

          {/* Learning Center student info card */}
          {isStudent && (
            <Card className="gs-db-quota px-6 py-5 mb-8 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-11 h-11 rounded-full bg-emerald-600 flex items-center justify-center text-2xl shrink-0">🏫</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold tracking-widest uppercase text-emerald-600 dark:text-emerald-400 mb-0.5">Learning Center Student</p>
                  <p className="font-fraunces text-lg font-bold text-[var(--text-primary)] leading-tight">{centerName}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-sm text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">{remaining}</span> AI analyses remaining this month
                    </span>
                    {subscriptionExpiresAt && (
                      <span className="text-xs text-[var(--text-secondary)] bg-white/60 dark:bg-white/10 px-2 py-0.5 rounded-full">
                        Access until {new Date(subscriptionExpiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">{usedCount}/{usageLimit}</div>
                  <div className="text-xs text-[var(--text-secondary)]">used</div>
                </div>
              </div>
              <div className="mt-4 h-1.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${usagePct >= 85 ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </Card>
          )}

          {/* Quota bar */}
          {(isPro || bonusAnalyses > 0) && (
            <Card className="gs-db-quota px-6 py-5 mb-8">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="font-semibold text-[0.9375rem] text-[var(--text-primary)]">Monthly AI Feedback Quota</span>
                <div className="flex items-center gap-2">
                  {bonusAnalyses > 0 && (
                    <Badge variant="warning">🎁 +{bonusAnalyses} bonus</Badge>
                  )}
                  {isPro && (
                    <span className={`font-mono text-[0.9375rem] font-medium ${usagePct >= 85 ? 'text-red-500' : 'text-blue-600 dark:text-blue-400'}`}>
                      {usedCount}/{usageLimit}
                    </span>
                  )}
                </div>
              </div>
              {isPro && (
                <div className="h-1.5 bg-[var(--bg-subtle)] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${usagePct >= 85 ? 'bg-red-500' : 'bg-blue-600'}`}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              )}
            </Card>
          )}

          {/* Mode picker */}
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-4">Choose a practice mode</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-10">
            {modes.map((m) => (
              <button
                key={m.id}
                className={`gs-db-mode-card rounded-[14px] p-6 text-left cursor-pointer transition-[transform,box-shadow] duration-150 shadow-[var(--shadow-sm)] border-[1.5px] ${
                  m.id === 'mock'
                    ? 'bg-blue-700 border-transparent dark:bg-blue-800'
                    : m.id === 'relax'
                    ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                    : 'bg-[var(--bg-card)] border-[var(--border-color)]'
                }`}
                onClick={() => navigate(`/writing/${m.id}`)}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
                }}
              >
                <div className="text-[1.75rem] mb-2">{m.emoji}</div>
                <div className={`font-fraunces text-lg font-bold mb-1 ${m.id === 'mock' ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                  {m.title}
                </div>
                <div className={`text-[0.8125rem] ${m.id === 'mock' ? 'text-white/75' : 'text-[var(--text-secondary)]'}`}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Progress Section */}
          {user?.uid && <ProgressSection uid={user.uid} />}

          {/* Recent Analyses */}
          {isPro && (
            <div className="gs-db-history mb-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Recent Analyses</h2>
                <span className="text-xs text-[var(--text-secondary)] font-medium">Last 5 sessions</span>
              </div>

              {reportsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-[160px] rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] animate-pulse" />
                  ))}
                </div>
              ) : reports.length === 0 ? (
                <Card className="px-8 py-10 text-center">
                  <div className="text-3xl mb-3">📝</div>
                  <p className="font-semibold text-[var(--text-primary)] mb-1">No analyses yet</p>
                  <p className="text-sm text-[var(--text-secondary)]">Submit an essay and get AI feedback to see your progress here.</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.map((r) => {
                    const band = overallBand(r.scores);
                    const scoreEntries = Object.entries(r.scores);
                    return (
                      <Card
                        key={r.id}
                        className="group p-5 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4"
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <Badge variant={r.taskType === 'task1' ? 'purple' : 'info'} className="mb-2 text-[0.65rem] uppercase tracking-wider">
                              {r.taskType === 'task1' ? 'Task 1' : 'Task 2'}
                            </Badge>
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate leading-tight">
                              {r.topic}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={`font-fraunces text-2xl font-extrabold leading-none ${bandColor(band)}`}>
                              {band}
                            </div>
                            <div className="text-[0.6rem] text-[var(--text-secondary)] mt-0.5">Overall</div>
                          </div>
                        </div>

                        {/* Score bars */}
                        {scoreEntries.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            {scoreEntries.map(([key, val]) => (
                              <ScoreBar
                                key={key}
                                label={SCORE_LABELS[key] ?? key.slice(0, 3)}
                                value={typeof val === 'number' ? val : 0}
                              />
                            ))}
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)] mt-auto">
                          <span className="text-[0.7rem] text-[var(--text-secondary)]">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!isPro && (
            <div className="gs-db-upsell mt-4 bg-gradient-to-br from-slate-900 to-[#1e3a5f] rounded-2xl p-8 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="font-fraunces text-white mb-1.5 text-xl">
                  Unlock AI Feedback
                </h3>
                <p className="text-white/65 text-[0.9375rem] m-0">
                  Get sentence-level corrections, vocabulary upgrades, and a band score estimate.
                </p>
              </div>
              <Link to="/pricing">
                <Button className="bg-[#c9900a] shrink-0 hover:bg-[#b8820a]">
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
