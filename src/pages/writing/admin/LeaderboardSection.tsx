import { useCallback, useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { Gift, RefreshCw, Trophy, X } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { cn } from "@/lib/utils";
import { reportBand } from "@shared/bandScore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { ListDetail, ListPane, DetailView, DetailHeader } from "@/components/staff/ListDetail";
import { EmptyState, Field, LoadError, Notice, RowSkeletons } from "@/components/staff/parts";

interface LeaderEntry {
  uid: string;
  email: string;
  prevBand: number | null;
  currBand: number | null;
  improvement: number;
  reportCount: number;
  bonusAnalyses: number;
}

export function LeaderboardSection() {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("3");
  const [granting, setGranting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const repSnap = await getDocs(collection(db, "feedback_reports"));
      const map: Record<string, { curr: { total: number; count: number }; prev: { total: number; count: number } }> = {};
      repSnap.docs.forEach((d) => {
        const data = d.data();
        const uid = data.uid as string;
        if (!uid) return;
        // The report's official overall band. Averaging every stored number
        // counted the overall a second time next to the four criteria.
        const avg = reportBand(data.scores);
        if (avg === null) return;
        const ts = data.createdAt?.toDate?.() as Date | undefined;
        if (!ts) return;
        const month = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
        map[uid] ??= { curr: { total: 0, count: 0 }, prev: { total: 0, count: 0 } };
        if (month === currMonth) { map[uid].curr.total += avg; map[uid].curr.count += 1; }
        else if (month === prevMonth) { map[uid].prev.total += avg; map[uid].prev.count += 1; }
      });

      const usersSnap = await getDocs(collection(db, "users"));
      const emailMap: Record<string, string> = {};
      const bonusMap: Record<string, number> = {};
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        emailMap[d.id] = data.studentLogin ?? data.email ?? d.id;
        bonusMap[d.id] = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
      });

      // Improvement needs a band in both months. A student new this month
      // used to count their whole band as "improvement" (+6.5 from nothing),
      // which put newcomers above students who had really moved up.
      const rows: LeaderEntry[] = Object.entries(map)
        .filter(([, { curr, prev }]) => curr.count > 0 && prev.count > 0)
        .map(([uid, { curr, prev }]) => {
          const currBand = Math.round((curr.total / curr.count) * 10) / 10;
          const prevBand = Math.round((prev.total / prev.count) * 10) / 10;
          const improvement = currBand - prevBand;
          return {
            uid,
            email: emailMap[uid] ?? uid,
            currBand,
            prevBand,
            improvement: Math.round(improvement * 10) / 10,
            reportCount: curr.count + prev.count,
            bonusAnalyses: bonusMap[uid] ?? 0,
          };
        });
      rows.sort((a, b) => b.improvement - a.improvement);
      setEntries(rows.slice(0, 10));
      setLoadFailed(false);
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (uid: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });

  const grant = async () => {
    const n = parseInt(amount, 10);
    if (!n || n < 1 || selected.size === 0) return;
    setGranting(true);
    setNotice(null);
    try {
      await Promise.all([...selected].map(async (uid) => {
        const snap = await getDocs(query(collection(db, "users"), where("__name__", "==", uid)));
        const current = snap.docs[0]?.data()?.bonusAnalyses ?? 0;
        // Shown to the student twice: as the dashboard banner (users.notification)
        // and as the preview line in the notification bell. The rest of the site
        // is in English, so this line is too.
        const msg = `🎁 Congratulations! You got ${n} full AI ${n === 1 ? "report" : "reports"}, the same as a paid plan: band scores, sentence-by-sentence corrections, vocabulary, grammar and a sample answer. Send an essay and see your result!`;
        await updateDoc(doc(db, "users", uid), { bonusAnalyses: current + n, notification: msg });
        await addDoc(collection(db, "notifications", uid, "items"), {
          type: "bonus",
          fromUserName: "WriteReady",
          preview: msg,
          read: false,
          createdAt: new Date(),
        });
      }));
      const count = selected.size;
      setNotice({ tone: "success", text: `Gave ${n} free ${n === 1 ? "analysis" : "analyses"} to ${count} ${count === 1 ? "student" : "students"}. They were notified on the site.` });
      setSelected(new Set());
      await load();
    } catch (e) {
      setNotice({ tone: "error", text: `Could not give the analyses: ${(e as Error).message}` });
    }
    setGranting(false);
  };

  const chosen = entries.filter((e) => selected.has(e.uid));

  const listPane = (
    <ListPane
      title="Leaderboard"
      action={
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading} aria-label="Reload leaderboard" title="Reload leaderboard">
          <RefreshCw className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
      toolbar={<p className="text-sm text-[var(--text-secondary)]">Top 10 students by band improvement this month versus last month. Students need reports in both months to appear.</p>}
    >
      {loading && entries.length === 0 ? (
        <RowSkeletons rows={8} />
      ) : loadFailed && entries.length === 0 ? (
        <LoadError what="the leaderboard" onRetry={load} />
      ) : entries.length === 0 ? (
        <EmptyState icon={Trophy} title="No reports this month">The leaderboard fills in once students get AI feedback this month.</EmptyState>
      ) : (
        <ol aria-label="Leaderboard" className="flex flex-col gap-0.5 p-2">
          {entries.map((e, i) => {
            const checked = selected.has(e.uid);
            const up = e.improvement > 0;
            const down = e.improvement < 0;
            return (
              <li key={e.uid}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-[var(--ring)]",
                    checked ? "bg-[var(--accent)]" : "hover:bg-[var(--bg-subtle)]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(e.uid)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--ink-blue)]"
                    aria-label={`Select ${e.email}`}
                  />
                  <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{e.email}</span>
                    <span className="block text-xs tabular-nums text-[var(--text-secondary)]">
                      {e.prevBand !== null ? `${e.prevBand.toFixed(1)} last month, ${e.currBand?.toFixed(1)} now` : `${e.currBand?.toFixed(1)} this month, new`}
                      {e.bonusAnalyses > 0 && ` · ${e.bonusAnalyses} full ${e.bonusAnalyses === 1 ? "report" : "reports"} left`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
                      up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : down ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                      : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    )}
                  >
                    {up ? "+" : ""}{e.improvement.toFixed(1)}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      )}
    </ListPane>
  );

  const detail = (
    <DetailView>
      <DetailHeader
        leading={<span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)]"><Gift size={20} aria-hidden="true" /></span>}
        title="Give full reports"
        meta="Reward the students who improved most. Each one gets full AI reports, the same as a paid plan, plus a notification on the site."
      />
      {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}
      {chosen.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-[var(--border-strong)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
          Tick students in the list to choose who gets the free analyses.
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--text-primary)]">{chosen.length} {chosen.length === 1 ? "student" : "students"} chosen</p>
            <ul className="flex flex-wrap gap-1.5">
              {chosen.map((e) => (
                <li key={e.uid} className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-card)] py-0.5 pl-3 pr-1 text-sm">
                  <span className="truncate">{e.email}</span>
                  <button
                    type="button"
                    onClick={() => toggle(e.uid)}
                    aria-label={`Remove ${e.email}`}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); grant(); }}>
            <Field label="Full reports for each student" htmlFor="bonus-amount" className="w-full max-w-[240px]">
              <Input name="bonus-amount" autoComplete="off" id="bonus-amount" type="number" min={1} max={50} value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" />
            </Field>
            <Button type="submit" loading={granting} disabled={!amount || Number(amount) < 1}>
              {granting ? "Giving…" : `Give to ${chosen.length} ${chosen.length === 1 ? "student" : "students"}`}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
          </form>
        </div>
      )}
    </DetailView>
  );

  return (
    <ListDetail
      label="Leaderboard"
      list={listPane}
      detail={detail}
      detailOpen={false}
      onBack={() => {}}
      backLabel="Leaderboard"
      stack
    />
  );
}
