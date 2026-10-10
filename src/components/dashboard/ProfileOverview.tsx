import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { User } from 'firebase/auth';
import { Camera, ChevronRight, Flame, Pencil, Settings } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/Button';
import { InkBanner, Meter, ProfileAvatar } from '../profile/parts';
import { useAuth } from '../../hooks/useAuth';
import { PLAN_INFO, planBadgeVariant } from '../../lib/plans';
import { joinedDate, profileName } from '../../lib/profileInfo';
import { bandDescriptor, isTask1, nextHalfBand, PROGRESS_ID, type DashboardStats } from '../../lib/dashboardStats';
import type { UserProfile } from '../../types';

// The top of the student dashboard: who you are, then where you stand.

const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const weekdayDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const oneDecimal = (n: number) => n.toFixed(1);

export function ProfileHeader({ user, profile }: { user: User; profile: UserProfile }) {
  const name = profileName(user, profile);
  const handle = profile.studentLogin;
  const joined = joinedDate(user, profile);
  const plan = profile.plan ?? 'free';
  const { avatarUrl } = useAuth();
  const photoLabel = profile.photoVersion ? 'Change profile photo' : 'Add a profile photo';

  return (
    <Card className="gs-db-welcome mb-6 overflow-hidden rounded-3xl">
      <InkBanner className="h-28 sm:h-36">
        <Link
          to="/account#edit-profile"
          className="absolute right-3 top-3 inline-flex h-9 items-center gap-2 rounded-full border border-white/35 bg-white/15 px-3.5 text-sm font-semibold text-white no-underline transition-colors duration-150 hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:right-4 sm:top-4"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Edit profile
        </Link>
      </InkBanner>

      <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-end sm:gap-5 sm:px-7 sm:pb-6">
        <div className="relative -mt-12 self-start sm:-mt-14 sm:self-auto">
          <ProfileAvatar src={avatarUrl} name={name} />
          {/* The photo's own edit button, where people look for it (Telegram
              and most apps put it on the picture). Opens My Account's photo row. */}
          <Link
            to="/account#photo"
            aria-label={photoLabel}
            title={photoLabel}
            className="absolute -bottom-1.5 -right-1.5 grid size-9 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] no-underline shadow-[var(--shadow-sm)] transition-colors duration-150 hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)] motion-reduce:transition-none dark:hover:text-brand-400"
          >
            <Camera className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <div className="min-w-0 flex-1 sm:pb-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 break-words font-display text-2xl font-extrabold tracking-[-0.025em] text-[var(--text-primary)] sm:text-[1.75rem] sm:leading-tight">
              {name}
            </h1>
            <Badge variant={planBadgeVariant(plan)}>{PLAN_INFO[plan].label}</Badge>
            {profile.founder && <Badge variant="outline">Founding student</Badge>}
          </div>
          {/* One line with dots between on wider screens; stacked on a phone, where a dot would dangle. */}
          <p className="mt-1.5 flex flex-col gap-0.5 text-sm text-[var(--text-secondary)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
            {handle && <span className="font-semibold text-brand-600 dark:text-brand-400">@{handle}</span>}
            {!handle && user.email && <span className="min-w-0 truncate">{user.email}</span>}
            {profile.centerName && (
              <>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>{profile.centerName}</span>
              </>
            )}
            {joined && (
              <>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>joined {monthYear.format(joined)}</span>
              </>
            )}
          </p>
        </div>

        <Button variant="outline" asChild className="self-start sm:self-auto">
          <Link to="/account#appearance" className="no-underline">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function Skeleton({ className, tone = 'bg-[var(--border-color)]' }: { className: string; tone?: string }) {
  return <span aria-hidden="true" className={`block rounded animate-pulse motion-reduce:animate-none ${tone} ${className}`} />;
}

function BandCard({ stats, loading }: { stats: DashboardStats | null; loading: boolean }) {
  const band = stats?.currentBand ?? null;
  const next = band === null ? null : nextHalfBand(band);

  return (
    <Card className="gs-db-stat relative flex flex-col overflow-hidden rounded-3xl border-transparent bg-brand-600 p-5 text-white shadow-none sm:p-7">
      <h2 className="text-sm font-semibold text-white/85">Current band</h2>

      {loading ? (
        <div className="mt-3 space-y-4">
          <Skeleton className="h-12 w-28" tone="bg-white/25" />
          <Skeleton className="h-2 w-full" tone="bg-white/25" />
        </div>
      ) : band === null ? (
        <div className="mt-3 flex flex-1 flex-col">
          <p className="font-mono text-5xl font-semibold tracking-[-0.03em] text-white/40" aria-hidden="true">0.0</p>
          <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-white/85">
            Your band shows here after your first checked essay.
          </p>
          <Link
            to="/writing/practice"
            className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Start practising
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="font-mono text-6xl font-semibold leading-none tracking-[-0.04em] text-white tabular-nums sm:text-7xl">
              {oneDecimal(band)}
            </p>
            <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white">{bandDescriptor(band)}</span>
          </div>
          <p className="mt-3 text-sm text-white/85">
            {stats!.currentFrom === 1 ? 'From your first report' : `Average of your last ${stats!.currentFrom} reports`}
          </p>

          <div className="mt-auto pt-6">
            {next ? (
              <>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-mono text-white tabular-nums">
                    {oneDecimal(band)} <span className="text-white/75">/ {oneDecimal(next.next)}</span>
                  </span>
                  <span className="text-white/85">
                    <span className="font-mono font-medium text-white tabular-nums">{oneDecimal(next.toGo)}</span> to band {oneDecimal(next.next)}
                  </span>
                </div>
                <Meter value={next.progress} label={`Progress to band ${oneDecimal(next.next)}`} className="bg-white" trackClassName="bg-white/25" />
              </>
            ) : (
              <p className="text-sm font-medium text-white">Band 9, the top of the scale.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function StatCard({ label, icon, value, hint, loading, field }: { label: string; icon?: ReactNode; value: ReactNode; hint: ReactNode; loading: boolean; field: string }) {
  return (
    <Card className={`gs-db-stat flex min-w-0 flex-col rounded-3xl border-transparent p-4 text-field-ink shadow-none sm:p-5 ${field}`}>
      <h2 className="flex items-start gap-1.5 text-xs font-semibold leading-tight text-field-ink/80 sm:items-center sm:text-sm">
        {icon}
        {label}
      </h2>
      <div className="mt-auto pt-3">
        {loading ? (
          <>
            <Skeleton className="h-8 w-12" tone="bg-field-ink/15" />
            <Skeleton className="mt-2 h-3 w-16" tone="bg-field-ink/15" />
          </>
        ) : (
          <>
            <p className="font-mono text-2xl font-semibold leading-none tracking-[-0.02em] text-field-ink tabular-nums sm:text-[2.125rem]">{value}</p>
            <p className="mt-1.5 text-[0.6875rem] leading-snug text-field-ink/75 sm:truncate sm:text-xs">{hint}</p>
          </>
        )}
      </div>
    </Card>
  );
}

function TaskBar({ label, value, className }: { label: string; value: number | null; className: string }) {
  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_2.25rem] items-center gap-3">
      <span className="text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      <Meter value={value === null ? 0 : value / 9} label={`${label} average band`} className={className} />
      <span className="text-right font-mono text-xs font-semibold text-[var(--text-primary)] tabular-nums">
        {value === null ? <span className="text-[var(--text-secondary)]">none</span> : oneDecimal(value)}
      </span>
    </div>
  );
}

function dotClass(count: number): string {
  if (count >= 2) return 'bg-brand-600 dark:bg-brand-300';
  if (count === 1) return 'bg-brand-400 dark:bg-brand-500';
  return 'bg-[var(--border-color)] dark:bg-[var(--border-strong)]';
}

function ActivityCard({ stats, loading, showAnalytics }: { stats: DashboardStats | null; loading: boolean; showAnalytics: boolean }) {
  const days = stats?.days ?? [];
  const active = days.filter((d) => d.count > 0).length;

  return (
    <Card className="gs-db-stat col-span-3 rounded-3xl p-4 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Last 14 days
          {!loading && (
            <span className="ml-2 text-xs font-normal text-[var(--text-secondary)]">
              <span className="font-mono tabular-nums">{active}</span> active {active === 1 ? 'day' : 'days'}
            </span>
          )}
        </h2>
        {showAnalytics && (
          <a
            href={`#${PROGRESS_ID}`}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-600 no-underline hover:underline dark:text-brand-400"
          >
            Full analytics
            <ChevronRight className="size-4" aria-hidden="true" />
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:gap-8">
        <div className="min-w-0 flex-1">
          {loading ? (
            <Skeleton className="h-4 w-full" />
          ) : (
            <>
              <ol className="flex items-center justify-between gap-1" aria-label={`You wrote on ${active} of the last 14 days`}>
                {days.map((d) => {
                  const text = `${d.isToday ? 'Today' : weekdayDay.format(d.date)}: ${d.count === 0 ? 'no essays' : d.count === 1 ? '1 essay' : `${d.count} essays`}`;
                  return (
                    <li key={d.date.getTime()} className="grid place-items-center">
                      <span
                        title={text}
                        className={`block size-3.5 rounded-full sm:size-4 ${dotClass(d.count)} ${d.isToday ? 'ring-2 ring-brand-500/50 ring-offset-2 ring-offset-[var(--bg-card)]' : ''}`}
                      />
                      <span className="sr-only">{text}</span>
                    </li>
                  );
                })}
              </ol>
              <div aria-hidden="true" className="mt-2 flex justify-between text-[0.6875rem] text-[var(--text-secondary)]">
                <span>{days[0] ? dayMonth.format(days[0].date) : ''}</span>
                <span>Today</span>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5 md:w-48 md:shrink-0">
          {loading ? (
            <>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-full" />
            </>
          ) : (
            <>
              <TaskBar label="Task 1" value={stats?.task1Average ?? null} className="bg-purple-500 dark:bg-purple-400" />
              <TaskBar label="Task 2" value={stats?.task2Average ?? null} className="bg-indigo-500 dark:bg-indigo-400" />
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

export function StatsOverview({
  stats,
  loading,
  totalReports,
  showAnalytics,
}: {
  stats: DashboardStats | null;
  loading: boolean;
  /** Every report the student has had. */
  totalReports: number;
  showAnalytics: boolean;
}) {
  const best = stats?.bestReport;
  const streak = stats?.streak ?? 0;

  return (
    <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <BandCard stats={stats} loading={loading} />
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Essays checked"
          field="bg-field-mint"
          loading={loading}
          value={totalReports}
          hint={`${stats?.thisMonth ?? 0} this month`}
        />
        <StatCard
          label="Day streak"
          field="bg-field-amber"
          icon={<Flame className={`size-3.5 sm:size-4 ${streak > 0 ? '' : 'opacity-50'}`} aria-hidden="true" />}
          loading={loading}
          value={streak}
          hint={stats?.wroteToday || streak === 0 ? `best ${stats?.bestStreak ?? 0}` : 'write today to keep it'}
        />
        <StatCard
          label="Best band"
          field="bg-field-lilac"
          loading={loading}
          value={stats?.bestBand == null ? <span className="opacity-45">0.0</span> : oneDecimal(stats.bestBand)}
          hint={best?.createdAt ? `${isTask1(best.taskType) ? 'Task 1' : 'Task 2'}, ${dayMonth.format(best.createdAt)}` : 'no reports yet'}
        />
        <ActivityCard stats={stats} loading={loading} showAnalytics={showAnalytics} />
      </div>
    </div>
  );
}
