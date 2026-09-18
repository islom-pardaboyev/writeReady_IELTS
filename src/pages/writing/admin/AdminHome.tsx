import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import {
  ArrowRight,
  Building2,
  CircleCheck,
  Clock,
  FileText,
  Image,
  Inbox,
  Megaphone,
  Newspaper,
  Power,
  RefreshCw,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { getMaintenanceStatus, type MaintenanceStatus } from "@/hooks/useFeatureFlag";
import { formatDuration } from "@/lib/duration";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { LoadError, PageHeading, Panel, StatStrip } from "@/components/staff/parts";
import { daysUntil, formatDate, inDays, isExpiredPaid, isPaying, joinedToday, planBadge, planLabel, timeAgo } from "./format";
import type { AdminSection, Intent, PendingReview, UserRow } from "./types";

interface CenterLite { id: string; name: string; expiresAt: string }
interface ReportLite { id: string; uid: string; taskType: string; band: string; createdAt: Date | null }

type Tone = "ok" | "warning" | "danger" | "neutral";

interface AttentionItem {
  key: string;
  tone: Tone;
  icon: LucideIcon;
  title: string;
  detail?: string;
  action: { label: string; onClick: () => void };
}

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  neutral: "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
};

const ENDING_SOON_DAYS = 14;

function overallBand(scores: Record<string, unknown>): string {
  const vals = Object.values(scores).filter((v): v is number => typeof v === "number");
  if (!vals.length) return "";
  return (Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 2) / 2).toFixed(1);
}

export function AdminHome({
  users,
  usersLoading,
  task1Count,
  task2Count,
  pending,
  failed,
  go,
  refresh,
}: {
  users: UserRow[];
  usersLoading: boolean;
  task1Count: number;
  task2Count: number;
  pending: PendingReview[];
  failed: { users: boolean; prompts: boolean; pending: boolean };
  go: (section: AdminSection, extra?: Omit<Intent, "section">) => void;
  refresh: () => void;
}) {
  const [centers, setCenters] = useState<CenterLite[]>([]);
  const [reports, setReports] = useState<ReportLite[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [own, setOwn] = useState({ centers: false, reports: false, maintenance: false });

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, m] = await Promise.allSettled([
      getDocs(collection(db, "learningCenters")),
      getDocs(query(collection(db, "feedback_reports"), orderBy("createdAt", "desc"), limit(5))),
      getMaintenanceStatus({ fresh: true, strict: true }),
    ]);
    setOwn({ centers: c.status === "rejected", reports: r.status === "rejected", maintenance: m.status === "rejected" });
    if (c.status === "fulfilled") {
      setCenters(c.value.docs.map((d) => ({ id: d.id, name: d.data().name ?? "Unnamed center", expiresAt: d.data().expiresAt ?? "" })));
    }
    if (r.status === "fulfilled") {
      setReports(r.value.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          uid: data.uid ?? "",
          taskType: String(data.taskType ?? "").toLowerCase().includes("1") ? "Task 1" : "Task 2",
          band: overallBand(data.scores ?? {}),
          createdAt: data.createdAt?.toDate?.() ?? null,
        };
      }));
    }
    if (m.status === "fulfilled") setMaintenance(m.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const emailOf = useMemo(() => new Map(users.map((u) => [u.id, u.email])), [users]);

  const attention = useMemo<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    if (maintenance?.enabled) {
      const left = maintenance.endsAt ? maintenance.endsAt - Date.now() : null;
      items.push({
        key: "maintenance",
        tone: "danger",
        icon: Power,
        title: "Maintenance mode is on",
        detail: left === null ? "No end time set. Visitors cannot use the site." : left > 0 ? `Reopens in ${formatDuration(left)}` : "The planned end has passed. The site stays closed until you reopen it.",
        action: { label: "Manage", onClick: () => go("settings") },
      });
    }

    const issues: AttentionItem[] = [];
    if (pending.length > 0) {
      const oldest = pending.reduce<Date | null>((min, p) => (p.requestedAt && (!min || p.requestedAt < min) ? p.requestedAt : min), null);
      issues.push({
        key: "reviews",
        tone: "warning",
        icon: Inbox,
        title: `${pending.length} ${pending.length === 1 ? "essay is" : "essays are"} waiting for a teacher`,
        detail: pending.length === 1
          ? `${pending[0].studentName || "A student"} asked ${pending[0].teacherName || "a teacher"} ${timeAgo(pending[0].requestedAt)}`
          : oldest ? `Oldest request ${timeAgo(oldest)}` : undefined,
        action: { label: "Teachers", onClick: () => go("teachers") },
      });
    }

    const renewals = centers
      .map((c) => ({ ...c, days: daysUntil(c.expiresAt) }))
      .filter((c) => c.days !== null && c.days <= ENDING_SOON_DAYS)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    renewals.slice(0, 3).forEach((c) => {
      const ended = (c.days ?? 0) < 0;
      issues.push({
        key: `center-${c.id}`,
        tone: ended ? "danger" : "warning",
        icon: Building2,
        title: ended ? `${c.name}: contract has ended` : `${c.name}: contract ends ${inDays(c.days ?? 0)}`,
        detail: `${ended ? "Ended" : "Ends"} ${formatDate(c.expiresAt)}`,
        action: { label: "Open", onClick: () => go("centers", { id: c.id }) },
      });
    });
    if (renewals.length > 3) {
      issues.push({
        key: "centers-more",
        tone: "warning",
        icon: Building2,
        title: `${renewals.length - 3} more centers need renewing`,
        action: { label: "Centers", onClick: () => go("centers") },
      });
    }

    const expired = users.filter(isExpiredPaid).length;
    if (expired > 0) {
      issues.push({
        key: "expired",
        tone: "neutral",
        icon: Clock,
        title: `${expired} paid ${expired === 1 ? "plan has" : "plans have"} expired`,
        detail: "Those students are back on free features.",
        action: { label: "Review", onClick: () => go("users", { filter: "expired" }) },
      });
    }

    const failures: AttentionItem[] = [];
    const couldNot = (key: string, what: string, retry: () => void) =>
      failures.push({ key, tone: "warning", icon: TriangleAlert, title: `Could not check ${what}`, detail: "The request failed.", action: { label: "Retry", onClick: retry } });
    if (own.maintenance) couldNot("f-maintenance", "maintenance mode", load);
    if (failed.pending) couldNot("f-pending", "Human Check reviews", refresh);
    if (own.centers) couldNot("f-centers", "learning center contracts", load);
    if (failed.users) couldNot("f-users", "users and paid plans", refresh);

    if (maintenance && !maintenance.enabled && !own.maintenance) {
      const clear = issues.length === 0 && failures.length === 0;
      items.push({
        key: "open",
        tone: "ok",
        icon: CircleCheck,
        title: clear ? "All clear" : "The site is open to everyone",
        detail: clear ? "The site is open, no reviews are waiting and no contracts need renewing." : "Maintenance mode is off.",
        action: { label: "Settings", onClick: () => go("settings") },
      });
    }
    return [...items, ...failures, ...issues];
  }, [maintenance, pending, centers, users, go, own, failed, load, refresh]);

  const newest = useMemo(
    () => [...users].filter((u) => u.createdAt).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 5),
    [users],
  );

  const shortcuts: { label: string; icon: LucideIcon; onClick: () => void }[] = [
    { label: "New Task 1 prompt", icon: Image, onClick: () => go("task1", { action: "new" }) },
    { label: "New Task 2 prompt", icon: FileText, onClick: () => go("task2", { action: "new" }) },
    { label: "Find a user", icon: Search, onClick: () => go("users", { action: "search" }) },
    { label: "New blog post", icon: Newspaper, onClick: () => go("blog", { action: "new" }) },
    { label: "New announcement", icon: Megaphone, onClick: () => go("announcements", { action: "new" }) },
    { label: "Add learning center", icon: Building2, onClick: () => go("centers", { action: "new" }) },
  ];

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const busy = loading || usersLoading;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10">
      <PageHeading
        title="Overview"
        description={today}
        actions={
          <Button variant="outline" size="sm" onClick={() => { load(); refresh(); }} disabled={busy}>
            <RefreshCw className={cn(busy && "animate-spin motion-reduce:animate-none")} aria-hidden="true" /> Refresh
          </Button>
        }
      />

      <StatStrip
        items={[
          { label: "New today", value: failed.users ? "…" : users.filter(joinedToday).length, hint: failed.users ? "Not loaded" : undefined, onClick: () => go("users", { filter: "today" }) },
          { label: "Paying users", value: failed.users ? "…" : users.filter(isPaying).length, hint: failed.users ? "Not loaded" : undefined, onClick: () => go("users", { filter: "paying" }) },
          { label: "All users", value: failed.users ? "…" : users.length, hint: failed.users ? "Not loaded" : undefined, onClick: () => go("users") },
          { label: "Task 1 prompts", value: failed.prompts ? "…" : task1Count, hint: failed.prompts ? "Not loaded" : undefined, onClick: () => go("task1") },
          { label: "Task 2 prompts", value: failed.prompts ? "…" : task2Count, hint: failed.prompts ? "Not loaded" : undefined, onClick: () => go("task2") },
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <Panel title="Needs attention" bodyClassName="pb-2">
            {loading ? (
              <div aria-hidden="true" className="flex flex-col gap-4 pb-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-[var(--bg-subtle)] motion-reduce:animate-none" />)}
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {attention.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li key={a.key} className="flex items-center gap-3 py-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONE[a.tone])}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{a.title}</p>
                        {a.detail && <p className="text-sm text-[var(--text-secondary)]">{a.detail}</p>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={a.action.onClick} className="shrink-0">
                        {a.action.label} <ArrowRight aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Latest AI reports" description="The five most recent essays students sent for AI feedback." bodyClassName="pb-2">
            {loading ? (
              <div aria-hidden="true" className="flex flex-col gap-3 pb-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--bg-subtle)] motion-reduce:animate-none" />)}
              </div>
            ) : own.reports ? (
              <LoadError what="the latest reports" onRetry={load} className="py-6" />
            ) : reports.length === 0 ? (
              <p className="pb-3 text-sm text-[var(--text-secondary)]">No reports yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {reports.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => go("users", { id: r.uid })}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{emailOf.get(r.uid) ?? "Unknown student"}</span>
                        <span className="block text-xs text-[var(--text-secondary)]">{r.taskType} · {timeAgo(r.createdAt)}</span>
                      </span>
                      {r.band && (
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-lg font-semibold tabular-nums text-[var(--text-primary)]">{r.band}</span>
                          <span className="block text-[0.7rem] text-[var(--text-secondary)]">band</span>
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Panel title="Shortcuts">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
              {shortcuts.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={s.onClick}
                    className="flex items-center gap-2.5 rounded-lg border border-[var(--border-color)] px-3 py-2.5 text-left text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <Icon size={16} className="shrink-0 text-[var(--ink-blue)]" aria-hidden="true" />
                    <span className="min-w-0 truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel
            title="Newest sign-ups"
            action={<Button variant="ghost" size="sm" onClick={() => go("users")}>All users <ArrowRight aria-hidden="true" /></Button>}
            bodyClassName="pb-2"
          >
            {usersLoading && users.length === 0 ? (
              <div aria-hidden="true" className="flex flex-col gap-3 pb-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-[var(--bg-subtle)] motion-reduce:animate-none" />)}
              </div>
            ) : failed.users && users.length === 0 ? (
              <LoadError what="users" onRetry={refresh} className="py-6" />
            ) : newest.length === 0 ? (
              <p className="pb-3 text-sm text-[var(--text-secondary)]">No sign-ups yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border-color)]">
                {newest.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => go("users", { id: u.id })}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{u.email}</span>
                        <span className="block text-xs text-[var(--text-secondary)]">{timeAgo(u.createdAt)}</span>
                      </span>
                      <Badge variant={planBadge(u)} className="shrink-0 text-[0.7rem]">{planLabel(u)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
