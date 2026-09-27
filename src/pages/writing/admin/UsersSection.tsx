import { useEffect, useMemo, useRef, useState } from "react";
import { doc, increment, updateDoc } from "firebase/firestore";
import { RefreshCw, Trash2, Users } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { deleteUserAccount } from "@/firebase/firestore";
import { useConfirm } from "@/hooks/useConfirm";
import { formatDateTime } from "@/lib/duration";
import { effectivePlan, monthlyLimitFor } from "@/lib/plans";
import { hasFreeReportThisWeek } from "@/lib/weeklyFree";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection, KeyValues } from "@/components/staff/ListDetail";
import { EmptyState, Field, FilterChips, Initials, LoadError, Notice, RowSkeletons, SearchField } from "@/components/staff/parts";
import { PLANS, formatDate, isExpiredPaid, isPaying, joinedToday, lastActiveLabel, planBadge, planLabel, planOf, planStatus, uzs, type PlanId } from "./format";
import type { SectionProps, SetState, UserRow } from "./types";

type Filter = "all" | "today" | "paying" | "expired";

export function UsersSection({
  users,
  setUsers,
  loading,
  failed,
  reload,
  intent,
  clearIntent,
}: SectionProps & {
  users: UserRow[];
  setUsers: SetState<UserRow[]>;
  loading: boolean;
  failed: boolean;
  reload: () => void;
}) {
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [amount, setAmount] = useState("");
  const [usageAdjust, setUsageAdjust] = useState("");
  const [planChoice, setPlanChoice] = useState<PlanId | null>(null);
  const [deleting, setDeleting] = useState(false);

  const select = (id: string | null) => {
    setSelectedId(id);
    setNotice(null);
    setAmount("");
    setUsageAdjust("");
    setPlanChoice(null);
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.filter) setFilter(intent.filter as Filter);
    if (intent.id) select(intent.id);
    if (intent.action === "search") {
      setFilter("all");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const counts = useMemo(() => ({
    all: users.length,
    today: users.filter(joinedToday).length,
    paying: users.filter(isPaying).length,
    expired: users.filter(isExpiredPaid).length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (filter === "today" ? joinedToday(u) : filter === "paying" ? isPaying(u) : filter === "expired" ? isExpiredPaid(u) : true))
      .filter((u) => !q || u.email.toLowerCase().includes(q))
      // Most recently active first, so the people using the site right now
      // are at the top; join date breaks ties and orders those never seen.
      .sort((a, b) => (b.lastActiveAt ?? "").localeCompare(a.lastActiveAt ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }, [users, filter, search]);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const patchUser = (id: string, updates: Partial<UserRow>) =>
    setUsers((p) => p.map((u) => (u.id === id ? { ...u, ...updates } : u)));

  const changePlan = async (user: UserRow, type: PlanId) => {
    setBusy(true);
    setNotice(null);
    try {
      const oneMonthLater = new Date();
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      const expiresAt = oneMonthLater.toISOString().slice(0, 10);
      const updates =
        type === "forever" ? { plan: "forever", subscription: "forever", expiresAt: "" }
        : type === "free" ? { plan: "free", subscription: "", expiresAt: "" }
        : { plan: type, subscription: "", expiresAt };
      await updateDoc(doc(db, "users", user.id), updates);
      patchUser(user.id, updates);
      setPlanChoice(null);
      const label = PLANS.find((p) => p.id === type)!.label;
      setNotice({
        tone: "success",
        text: type === "free" ? "Plan removed. This user is on Free now." : type === "forever" ? "Lifetime access granted." : `${label} plan active until ${formatDate(expiresAt)}.`,
      });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not change the plan. Try again." });
    }
    setBusy(false);
  };

  const addBalance = async (user: UserRow) => {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, "users", user.id), { balanceUZS: increment(n) });
      const next = (user.balanceUZS ?? 0) + n;
      patchUser(user.id, { balanceUZS: next });
      setAmount("");
      setNotice({ tone: "success", text: `Added ${uzs(n)}. New balance: ${uzs(next)}.` });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not add to the balance. Try again." });
    }
    setBusy(false);
  };

  const resetBalance = async (user: UserRow) => {
    if (!(await confirm(`Set ${user.email}'s balance to 0 UZS?`, { title: "Reset balance?", confirmLabel: "Reset to 0" }))) return;
    setBusy(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, "users", user.id), { balanceUZS: 0 });
      patchUser(user.id, { balanceUZS: 0 });
      setNotice({ tone: "success", text: "Balance reset to 0 UZS." });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not reset the balance. Try again." });
    }
    setBusy(false);
  };

  // Paid plans only: this month's usage is tracked by calendar month, not by
  // which plan was active when it was spent, so toggling a plan off and back
  // on mid-month leaves the old count in place. This is the fix for that —
  // kept out of free/bonus reports, which already have their own admin lever
  // (the leaderboard's bonus grant).
  const adjustUsage = async (user: UserRow, direction: "give" | "take") => {
    const n = Number(usageAdjust);
    if (!n || n <= 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const monthKey = new Date().toISOString().slice(0, 7);
      const limit = monthlyLimitFor(effectivePlan(user));
      const used = user.usage?.monthKey === monthKey ? (user.usage?.count ?? 0) : 0;
      const nextUsed = Math.max(0, Math.min(limit, used + (direction === "take" ? n : -n)));
      const usage = { monthKey, count: nextUsed };
      await updateDoc(doc(db, "users", user.id), { usage });
      patchUser(user.id, { usage });
      setUsageAdjust("");
      setNotice({ tone: "success", text: `Now ${limit - nextUsed} of ${limit} analyses left this month.` });
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not update this month's usage. Try again." });
    }
    setBusy(false);
  };

  const deleteUser = async (user: UserRow) => {
    const ok = await confirm(
      `Delete ${user.email} permanently?\n\nTheir profile, AI feedback reports, Human Check requests and notifications are removed from the database. This cannot be undone.\n\nThis deletes their data only: they can still sign in with their old login, but they will have no data and no paid plan.`,
      { title: "Delete user?", destructive: true, confirmLabel: "Delete user" },
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteUserAccount(user.id, db);
      setUsers((p) => p.filter((u) => u.id !== user.id));
      select(null);
    } catch (e) {
      console.error(e);
      setNotice({ tone: "error", text: "Could not delete this user. Try again." });
    }
    setDeleting(false);
  };

  const listPane = (
    <ListPane
      title="Users"
      count={users.length}
      action={
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reload} disabled={loading} aria-label="Reload users" title="Reload users">
          <RefreshCw className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search by email or login…" label="Search users" inputRef={searchRef} />
          <FilterChips
            label="Filter users"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: counts.all },
              { id: "today", label: "Joined today", count: counts.today },
              { id: "paying", label: "Paying", count: counts.paying },
              { id: "expired", label: "Expired", count: counts.expired },
            ]}
          />
        </>
      }
    >
      {loading && users.length === 0 ? (
        <RowSkeletons />
      ) : failed && users.length === 0 ? (
        <LoadError what="users" onRetry={reload} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search || filter !== "all" ? "No users match" : "No users yet"}
          action={(search || filter !== "all") && <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all"); }}>Show all users</Button>}
        >
          {search || filter !== "all" ? "Try another search or filter." : "People appear here after they sign up."}
        </EmptyState>
      ) : (
        <RowList label="Users">
          {filtered.map((u) => (
            <ListRow key={u.id} selected={u.id === selectedId} onSelect={() => select(u.id)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{u.email || "No email"}</span>
                  <Badge variant={planBadge(u)} className="shrink-0 text-[0.7rem]">{planLabel(u)}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                  {joinedToday(u) ? "Joined today" : u.createdAt ? `Joined ${formatDate(u.createdAt)}` : "Join date unknown"}
                  {(u.balanceUZS ?? 0) > 0 && <> · <span className="tabular-nums">{uzs(u.balanceUZS ?? 0)}</span></>}
                </p>
                <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{lastActiveLabel(u)}</p>
              </div>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  let detail;
  if (selected) {
    const current = planOf(selected);
    const expired = isExpiredPaid(selected);

    // What this person's plan actually grants right now — the same rule
    // api/pre-check.ts applies, so this matches what happens when they ask
    // for a report, not just the plan label above (which can be an expired one).
    const monthKey = new Date().toISOString().slice(0, 7);
    const grantedPlan = effectivePlan(selected);
    const monthlyLimit = monthlyLimitFor(grantedPlan);
    const usedThisMonth = selected.usage?.monthKey === monthKey ? (selected.usage?.count ?? 0) : 0;
    const remainingThisMonth = Math.max(0, monthlyLimit - usedThisMonth);
    const usagePct = monthlyLimit > 0 ? Math.min(100, (usedThisMonth / monthlyLimit) * 100) : 0;
    const bonus = selected.bonusAnalyses ?? 0;
    const freeAvailable = hasFreeReportThisWeek(selected.freeUsage);
    const grantedPlanLabel = PLANS.find((p) => p.id === grantedPlan)?.label ?? "Free";
    detail = (
      <DetailView>
        <DetailHeader
          leading={<Initials name={selected.email} size={44} />}
          title={selected.email || "No email"}
          badges={<Badge variant={planBadge(selected)}>{planLabel(selected)}</Badge>}
          meta={<span className={cn(expired && "text-red-600 dark:text-red-400")}>{planStatus(selected)}</span>}
        />
        {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}

        <DetailSection title="Balance" description="Used to pay for Human Check reviews.">
          <p className="font-mono text-3xl font-semibold tabular-nums text-[var(--text-primary)]">{uzs(selected.balanceUZS ?? 0)}</p>
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => { e.preventDefault(); addBalance(selected); }}
          >
            <Field label="Add to balance" htmlFor="balance-amount" className="w-full max-w-[220px]">
              <Input name="balance-amount" autoComplete="off" id="balance-amount" type="number" inputMode="numeric" min={1} placeholder="Amount in UZS…" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
            </Field>
            <Button type="submit" disabled={busy || !amount || Number(amount) <= 0}>Add</Button>
            <Button type="button" variant="outline" disabled={busy || (selected.balanceUZS ?? 0) === 0} onClick={() => resetBalance(selected)}>
              Reset to 0
            </Button>
          </form>
        </DetailSection>

        <DetailSection title="Plan" description="Paid plans run for one month from today. Learning-center students get access through their center.">
          <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PLANS.map((p) => {
              const isCurrent = p.id === current && selected.plan !== "pro";
              const isChosen = planChoice === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={isChosen || (!planChoice && isCurrent)}
                  disabled={busy}
                  onClick={() => setPlanChoice(isCurrent ? null : p.id)}
                  className={cn(
                    "rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isChosen
                      ? "border-[var(--ink-blue)] bg-[var(--accent)]"
                      : isCurrent && !planChoice
                        ? "border-[var(--border-strong)] bg-[var(--bg-subtle)]"
                        : "border-[var(--border-color)] bg-[var(--bg-card)] hover:bg-[var(--bg-subtle)]",
                  )}
                >
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">{p.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                    {isCurrent ? "Current plan" : p.price ? `${p.price} a month` : p.id === "forever" ? "Never expires" : "No paid features"}
                  </span>
                </button>
              );
            })}
          </div>
          {planChoice && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => changePlan(selected, planChoice)} loading={busy} variant={planChoice === "free" ? "dangerOutline" : "default"}>
                {planChoice === "free" ? "Remove paid plan" : `Switch to ${PLANS.find((p) => p.id === planChoice)!.label}`}
              </Button>
              <Button variant="ghost" onClick={() => setPlanChoice(null)}>Cancel</Button>
            </div>
          )}
        </DetailSection>

        <DetailSection
          title="AI feedback"
          description={
            monthlyLimit > 0
              ? "Bonus reports are spent only after the plan's monthly quota runs out, so a bonus never eats into it."
              : "Free plan: one AI feedback report a week. A bonus report is spent before that weekly one."
          }
        >
          <Card className="px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.9375rem] font-semibold text-[var(--text-primary)]">
                {monthlyLimit > 0 ? `${grantedPlanLabel} · Monthly AI analyses` : "Free plan · Weekly AI analysis"}
              </span>
              <div className="flex items-center gap-2">
                {bonus > 0 && <Badge variant="warning">🎁 +{bonus} bonus</Badge>}
                {monthlyLimit > 0 ? (
                  <span className={cn("font-mono text-[0.9375rem] font-medium", usagePct >= 85 ? "text-red-500" : "text-brand-blue-600 dark:text-brand-blue-400")}>
                    {usedThisMonth}/{monthlyLimit}
                  </span>
                ) : (
                  <Badge variant={freeAvailable ? "success" : "secondary"}>
                    {freeAvailable ? "Available" : "Used · resets Monday"}
                  </Badge>
                )}
              </div>
            </div>
            {monthlyLimit > 0 && (
              <>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className={cn("h-full rounded-full transition-[width] duration-300", usagePct >= 85 ? "bg-red-500" : "bg-brand-blue-600")}
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {usedThisMonth} of {monthlyLimit} analyses used · {remainingThisMonth} remaining
                </p>
                <form
                  className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--border-color)] pt-4"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <Field label="Adjust this month's usage" htmlFor="usage-adjust-amount" className="w-full max-w-[200px]">
                    <Input
                      name="usage-adjust-amount"
                      autoComplete="off"
                      id="usage-adjust-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      placeholder="Number of analyses"
                      value={usageAdjust}
                      onChange={(e) => setUsageAdjust(e.target.value)}
                      className="font-mono"
                    />
                  </Field>
                  <Button type="button" variant="outline" disabled={busy || !usageAdjust || Number(usageAdjust) <= 0} onClick={() => adjustUsage(selected, "give")}>
                    Give {usageAdjust || "…"} more
                  </Button>
                  <Button type="button" variant="outline" disabled={busy || !usageAdjust || Number(usageAdjust) <= 0} onClick={() => adjustUsage(selected, "take")}>
                    Take away {usageAdjust || "…"}
                  </Button>
                </form>
              </>
            )}
          </Card>
        </DetailSection>

        <DetailSection title="Account" description="Last active is the last time this person opened the site. For anyone who has not been back since we started recording it, it shows their last essay check instead.">
          <KeyValues
            items={[
              { label: "Joined", value: formatDate(selected.createdAt) ?? "Unknown" },
              { label: "Plan ends", value: current === "forever" ? "Never" : formatDate(selected.expiresAt) ?? "No end date" },
              {
                label: "Last active",
                value: selected.lastActiveAt
                  ? <span title={formatDateTime(new Date(selected.lastActiveAt).getTime())}>{lastActiveLabel(selected)}</span>
                  : "Never",
              },
              { label: "User ID", value: <span className="font-mono text-xs">{selected.id}</span> },
            ]}
          />
        </DetailSection>

        <DetailSection title="Delete user" description="Removes this person's profile, reports, Human Check requests and notifications. This cannot be undone.">
          <Button variant="dangerOutline" onClick={() => deleteUser(selected)} loading={deleting}>
            <Trash2 aria-hidden="true" /> {deleting ? "Deleting…" : "Delete user"}
          </Button>
        </DetailSection>
      </DetailView>
    );
  } else {
    detail = (
      <EmptyState icon={Users} title="Select a user" className="py-24">
        Pick someone on the left to see their plan and balance, change their plan or top up their balance.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label="Users"
        list={listPane}
        detail={detail}
        detailOpen={!!selected}
        onBack={() => select(null)}
        backLabel="All users"
        detailKey={selectedId ?? "none"}
      />
      {dialog}
    </>
  );
}
