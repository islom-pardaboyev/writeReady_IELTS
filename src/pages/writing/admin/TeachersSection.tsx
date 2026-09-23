import { useCallback, useEffect, useRef, useState } from "react";
import { GraduationCap, Pencil, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import {
  compressImageToBase64,
  createTeacher,
  deleteTeacher as deleteTeacherDoc,
  getHumanReviewsForTeacher,
  getTeachers,
  secureLegacyTeacherLogins,
  teacherEarningUZS,
  updateTeacher,
} from "@/firebase/teachers";
import type { Teacher } from "@/types";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { TELEGRAM_USERNAME_HELP, TELEGRAM_USERNAME_RE, normalizeTelegramUsername } from "@/lib/telegram";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection } from "@/components/staff/ListDetail";
import { EmptyState, Field, FileButton, Initials, LoadError, Notice, RowSkeletons, SearchField, StatStrip, Switch } from "@/components/staff/parts";
import { uzs } from "./format";
import type { PendingReview, SectionProps } from "./types";

interface Earning { month: string; count: number; total: number }

const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
};

export function TeachersSection({
  intent,
  clearIntent,
  pending,
  onCountsChange,
}: SectionProps & { pending: PendingReview[]; onCountsChange?: () => void }) {
  const { confirm, dialog } = useConfirm();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [counts, setCounts] = useState<Record<string, { pending: number; checked: number }>>({});
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Teacher> | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsFailed, setEarningsFailed] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Logins saved by the old code on the public profile, where students
      // could read them, are moved to teacherAuth first. A failure here must
      // not stop the list from loading.
      await secureLegacyTeacherLogins(db).catch((e) => console.error("Could not move teacher logins:", e));
      const rows = await getTeachers(db, { withLogins: true });
      setTeachers(rows);
      const next: Record<string, { pending: number; checked: number }> = {};
      await Promise.all(rows.map(async (t) => {
        const reviews = await getHumanReviewsForTeacher(t.id, db);
        next[t.id] = {
          pending: reviews.filter((r) => r.status === "pending").length,
          checked: reviews.filter((r) => r.status === "checked").length,
        };
      }));
      setCounts(next);
      setLoadFailed(false);
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadEarnings = useCallback(async (teacherId: string) => {
    setEarningsLoading(true);
    try {
      const reviews = await getHumanReviewsForTeacher(teacherId, db);
      const byMonth = new Map<string, { count: number; total: number }>();
      reviews
        .filter((r) => r.status === "checked" && r.checkedAt)
        .forEach((r) => {
          const key = r.checkedAt!.toISOString().slice(0, 7);
          const entry = byMonth.get(key) ?? { count: 0, total: 0 };
          entry.count += 1;
          entry.total += teacherEarningUZS(r);
          byMonth.set(key, entry);
        });
      setEarnings(Array.from(byMonth.entries()).map(([month, v]) => ({ month, ...v })).sort((a, b) => b.month.localeCompare(a.month)));
      setEarningsFailed(false);
    } catch (e) {
      console.error(e);
      setEarnings([]);
      setEarningsFailed(true);
    }
    setEarningsLoading(false);
  }, []);

  const select = (id: string | null) => {
    setSelectedId(id);
    setEditing(id === "new" ? { name: "", ieltsOverall: 8, ieltsWriting: 8, login: "", password: "", telegram: "" } : null);
    setFormError("");
    setNotice(null);
    setEarnings([]);
    if (id && id !== "new") loadEarnings(id);
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") select("new");
    if (intent.id) select(intent.id);
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const selected = teachers.find((t) => t.id === selectedId) ?? null;
  const set = (patch: Partial<Teacher>) => setEditing((p) => ({ ...p, ...patch }));

  const save = async () => {
    if (!editing) return;
    if (!editing.name?.trim() || !editing.login?.trim() || !editing.password) {
      setFormError("Fill in the name, login and password.");
      return;
    }
    if (!TELEGRAM_USERNAME_RE.test(editing.telegram ?? "")) {
      setFormError(TELEGRAM_USERNAME_HELP);
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        photoBase64: editing.photoBase64,
        certificateBase64: editing.certificateBase64,
        ieltsOverall: Number(editing.ieltsOverall) || 0,
        ieltsWriting: Number(editing.ieltsWriting) || 0,
        login: editing.login.trim(),
        password: editing.password,
        telegram: editing.telegram!,
        active: editing.active ?? true,
      };
      // Firestore rejects undefined values (e.g. a teacher with no photo).
      const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)) as typeof payload;
      let id = editing.id;
      if (id) await updateTeacher(id, clean, db);
      else id = await createTeacher(clean, db);
      await load();
      select(id);
      setNotice({ tone: "success", text: editing.id ? "Profile saved." : "Teacher added. They can sign in to the teacher portal now." });
    } catch (e) {
      console.error(e);
      // The rules only let the admin's own sign-in change teachers. Another
      // portal in this browser (teacher, learning center) can replace it.
      setFormError(
        (e as { code?: string })?.code === "permission-denied"
          ? "The database refused this change. Sign out, sign in as admin again, then try once more."
          : "Could not save the teacher. Try again.",
      );
    }
    setSaving(false);
  };

  const setActive = async (t: Teacher, active: boolean) => {
    setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, active } : x)));
    try {
      await updateTeacher(t.id, { active }, db);
    } catch (e) {
      console.error(e);
      setTeachers((prev) => prev.map((x) => (x.id === t.id ? { ...x, active: !active } : x)));
      setNotice({ tone: "error", text: "Could not change visibility. Try again." });
    }
  };

  const remove = async (t: Teacher) => {
    if (!(await confirm(`Delete ${t.name}? They can no longer sign in, and students stop seeing them for Human Check.`, { title: "Delete teacher?", destructive: true, confirmLabel: "Delete teacher" }))) return;
    await deleteTeacherDoc(t.id, db);
    setTeachers((prev) => prev.filter((x) => x.id !== t.id));
    select(null);
    onCountsChange?.();
  };

  const upload = async (file: File, field: "photoBase64" | "certificateBase64") => {
    try {
      const base64 = await compressImageToBase64(file);
      set({ [field]: base64 });
    } catch (e) { console.error(e); }
  };

  const totalPending = Object.values(counts).reduce((s, c) => s + c.pending, 0);
  const q = search.trim().toLowerCase();
  const shownTeachers = teachers.filter((t) => !q || t.name.toLowerCase().includes(q) || t.login.toLowerCase().includes(q));
  // Reviews still waiting on a teacher account that no longer exists: nobody can check them.
  const orphaned = loading || teachers.length === 0 ? [] : pending.filter((p) => !teachers.some((t) => t.id === p.teacherId));

  const listPane = (
    <ListPane
      title="Teachers"
      count={teachers.length}
      action={
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { load(); onCountsChange?.(); }} disabled={loading} aria-label="Reload teachers" title="Reload teachers">
            <RefreshCw className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => select("new")}><Plus aria-hidden="true" /> New</Button>
        </>
      }
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search by name or login…" label="Search teachers" inputRef={searchRef} />
          <p className="text-sm text-[var(--text-secondary)]">
            {totalPending === 0 ? "No essays are waiting with these teachers." : `${totalPending} ${totalPending === 1 ? "essay is" : "essays are"} waiting for review.`}
          </p>
          {orphaned.length > 0 && (
            <Notice tone="warning">
              {orphaned.length === 1
                ? teachers.some((t) => t.name === orphaned[0].teacherName)
                  ? `${orphaned[0].studentName || "A student"}'s essay is assigned to an earlier ${orphaned[0].teacherName} account that was deleted. The current ${orphaned[0].teacherName} cannot see it, so nobody can review it.`
                  : `${orphaned[0].studentName || "A student"}'s essay is assigned to ${orphaned[0].teacherName || "a teacher"}, whose account was deleted, so nobody can review it.`
                : `${orphaned.length} essays are assigned to teacher accounts that were deleted, so nobody can review them.`}
            </Notice>
          )}
        </>
      }
    >
      {loading && teachers.length === 0 ? (
        <RowSkeletons />
      ) : loadFailed && teachers.length === 0 ? (
        <LoadError what="teachers" onRetry={load} />
      ) : teachers.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No teachers yet">Add a teacher so students can order Human Check reviews.</EmptyState>
      ) : shownTeachers.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No teachers match" action={<Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button>}>
          Nobody matches “{search}”.
        </EmptyState>
      ) : (
        <RowList label="Teachers">
          {shownTeachers.map((t) => {
            const c = counts[t.id];
            return (
              <ListRow key={t.id} selected={t.id === selectedId} onSelect={() => select(t.id)}>
                <Initials name={t.name} size={36} src={t.photoBase64} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{t.name}</span>
                    {!!c?.pending && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[0.7rem] font-semibold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" title="Essays waiting">
                        {c.pending} waiting
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    Writing {t.ieltsWriting.toFixed(1)}{t.active ? "" : " · hidden from students"}
                  </p>
                </div>
              </ListRow>
            );
          })}
        </RowList>
      )}
    </ListPane>
  );

  let detail;
  if (editing) {
    const isNew = !editing.id;
    detail = (
      <DetailView
        footer={
          <>
            <Button variant="ghost" onClick={() => (isNew ? select(null) : setEditing(null))}>Cancel</Button>
            <Button onClick={save} loading={saving}>{saving ? "Saving…" : isNew ? "Add teacher" : "Save changes"}</Button>
          </>
        }
      >
        <DetailHeader title={isNew ? "New teacher" : `Edit ${editing.name || "teacher"}`} meta="Teachers sign in to the teacher portal with this login and password." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="t-name" className="sm:col-span-2">
            <Input name="t-name" autoComplete="off" id="t-name" value={editing.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="IELTS overall" htmlFor="t-overall">
            <Input name="t-overall" autoComplete="off" id="t-overall" type="number" step="0.5" min={0} max={9} value={editing.ieltsOverall ?? 8} onChange={(e) => set({ ieltsOverall: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="IELTS writing" htmlFor="t-writing">
            <Input name="t-writing" autoComplete="off" id="t-writing" type="number" step="0.5" min={0} max={9} value={editing.ieltsWriting ?? 8} onChange={(e) => set({ ieltsWriting: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="Portal login" htmlFor="t-login">
            <Input name="t-login" id="t-login" autoComplete="off" value={editing.login ?? ""} onChange={(e) => set({ login: e.target.value })} />
          </Field>
          <Field label="Portal password" htmlFor="t-password">
            <PasswordInput name="t-password" id="t-password" autoComplete="new-password" value={editing.password ?? ""} onChange={(e) => set({ password: e.target.value })} />
          </Field>
          <Field label="Telegram username" htmlFor="t-telegram" hint="Used to tag this teacher in the teachers' Telegram group when a student picks them." className="sm:col-span-2">
            <Input
              name="t-telegram"
              id="t-telegram"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="@username"
              maxLength={40}
              value={editing.telegram ?? ""}
              onChange={(e) => set({ telegram: normalizeTelegramUsername(e.target.value) })}
              className="font-mono"
            />
          </Field>
          <Field label="Photo" optional hint="Students see it when they pick a teacher.">
            <div className="flex items-center gap-3">
              <Initials name={editing.name || "?"} size={48} src={editing.photoBase64} />
              <FileButton accept="image/*" onFile={(f) => upload(f, "photoBase64")}><Upload size={16} aria-hidden="true" /> {editing.photoBase64 ? "Replace" : "Upload"}</FileButton>
            </div>
          </Field>
          <Field label="IELTS certificate" optional>
            <div className="flex items-center gap-3">
              {editing.certificateBase64 ? (
                <img src={editing.certificateBase64} alt="IELTS certificate" width={64} height={48} loading="lazy" className="h-12 w-16 rounded-md border border-[var(--border-color)] object-cover" />
              ) : (
                <span className="h-12 w-16 rounded-md bg-[var(--bg-subtle)]" />
              )}
              <FileButton accept="image/*" onFile={(f) => upload(f, "certificateBase64")}><Upload size={16} aria-hidden="true" /> {editing.certificateBase64 ? "Replace" : "Upload"}</FileButton>
            </div>
          </Field>
        </div>
        {formError && <Notice tone="error" className="mt-5">{formError}</Notice>}
      </DetailView>
    );
  } else if (selected) {
    const c = counts[selected.id] ?? { pending: 0, checked: 0 };
    const total = earnings.reduce((s, r) => s + r.total, 0);
    detail = (
      <DetailView>
        <DetailHeader
          leading={<Initials name={selected.name} size={48} src={selected.photoBase64} />}
          title={selected.name}
          badges={<Badge variant={selected.active ? "success" : "secondary"}>{selected.active ? "Visible" : "Hidden"}</Badge>}
          meta={
            <>
              IELTS {selected.ieltsOverall.toFixed(1)} overall, {selected.ieltsWriting.toFixed(1)} writing
              <span className="block">Portal login <span className="font-mono">{selected.login}</span></span>
              <span className="block">
                {selected.telegram
                  ? <>Telegram <span className="font-mono">{selected.telegram}</span></>
                  : "No Telegram username yet. Edit the profile to add one, so they can be tagged in the group."}
              </span>
            </>
          }
          actions={<Button variant="outline" size="sm" onClick={() => { setEditing({ ...selected }); setFormError(""); }}><Pencil aria-hidden="true" /> Edit</Button>}
        />
        {notice && <Notice tone={notice.tone} className="mt-5">{notice.text}</Notice>}

        <div className="mt-6">
          <StatStrip
            items={[
              { label: "Waiting for review", value: c.pending },
              { label: "Reviews checked", value: c.checked },
              { label: "Earned in total", value: earningsLoading || earningsFailed ? "…" : total.toLocaleString("en-US"), hint: earningsFailed ? "Not loaded" : "UZS" },
            ]}
          />
        </div>

        <DetailSection title="Visibility">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-color)] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Show to students</p>
              <p className="text-sm text-[var(--text-secondary)]">Hidden teachers keep their account but cannot be picked for new reviews.</p>
            </div>
            <Switch checked={selected.active} onChange={(v) => setActive(selected, v)} label="Show to students" />
          </div>
        </DetailSection>

        <DetailSection title="Earnings by month" description="What this teacher earned for reviews checked in each month, after the platform fee.">
          {earningsLoading ? (
            <RowSkeletons rows={2} />
          ) : earningsFailed ? (
            <LoadError what="earnings" onRetry={() => loadEarnings(selected.id)} className="py-8" />
          ) : earnings.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">No checked reviews yet.</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--bg-subtle)] text-left text-[var(--text-secondary)]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Month</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Reviews</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)]">
                  {earnings.map((r) => (
                    <tr key={r.month}>
                      <td className="px-4 py-2.5 text-[var(--text-primary)]">{monthLabel(r.month)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.count}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{uzs(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--border-strong)] font-semibold">
                  <tr>
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{earnings.reduce((s, r) => s + r.count, 0)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{uzs(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DetailSection>

        {selected.certificateBase64 && (
          <DetailSection title="IELTS certificate">
            <button
              type="button"
              onClick={() => setPreview(selected.certificateBase64!)}
              className="overflow-hidden rounded-xl border border-[var(--border-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="Open the certificate at full size"
            >
              <img src={selected.certificateBase64} alt="IELTS certificate" loading="lazy" className="max-h-56 object-contain" />
            </button>
          </DetailSection>
        )}

        <DetailSection title="Delete teacher" description="Removes the teacher's account. Reviews they already checked stay with the students.">
          <Button variant="dangerOutline" onClick={() => remove(selected)}><Trash2 aria-hidden="true" /> Delete teacher</Button>
        </DetailSection>
      </DetailView>
    );
  } else {
    detail = (
      <EmptyState
        icon={GraduationCap}
        title="Select a teacher"
        className="py-24"
        action={<Button variant="outline" onClick={() => select("new")}><Plus aria-hidden="true" /> New teacher</Button>}
      >
        Choose a teacher on the left to see their reviews and earnings, or add a new one. Human Check price and fee are in Settings.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label="Teachers"
        list={listPane}
        detail={detail}
        detailOpen={selectedId !== null}
        onBack={() => select(null)}
        backLabel="All teachers"
        detailKey={`${selectedId ?? "none"}-${editing ? "edit" : "view"}`}
      />
      <Dialog open={!!preview} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-3xl p-3">
          <DialogTitle className="sr-only">IELTS certificate</DialogTitle>
          {preview && <img src={preview} alt="IELTS certificate at full size" width={1200} height={800} className="max-h-[82vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
      {dialog}
    </>
  );
}
