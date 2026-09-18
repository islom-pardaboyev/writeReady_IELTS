import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { Building2, Eye, EyeOff, Pencil, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { adminDb as db } from "@/firebase/adminConfig";
import { createStudentAuthAccount } from "@/firebase/createStudentAccount";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection, KeyValues } from "@/components/staff/ListDetail";
import { EmptyState, Field, FilterChips, Initials, LoadError, Notice, RowSkeletons, SearchField } from "@/components/staff/parts";
import { daysUntil, formatDate, inDays, uzs } from "./format";
import type { SectionProps } from "./types";

interface Center {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  contractNumber: string;
  paymentAmount: number;
  studentLimit: number;
  login: string;
  password: string;
  expiresAt: string;
  studentCount: number;
}

interface CenterStudent { id: string; fullName: string; login: string; addedAt?: string }

type Status = "active" | "ending" | "expired" | "pending";
type Filter = "all" | Status;

const ENDING_SOON_DAYS = 14;

function statusOf(c: Pick<Center, "expiresAt">): Status {
  const d = daysUntil(c.expiresAt);
  if (d === null) return "pending";
  if (d < 0) return "expired";
  if (d <= ENDING_SOON_DAYS) return "ending";
  return "active";
}

const STATUS_BADGE: Record<Status, { label: string; variant: "success" | "warning" | "danger" | "secondary" }> = {
  active: { label: "Active", variant: "success" },
  ending: { label: "Ending soon", variant: "warning" },
  expired: { label: "Expired", variant: "danger" },
  pending: { label: "No end date", variant: "secondary" },
};

const EMPTY_CENTER: Partial<Center> = {
  name: "", contactPerson: "", phone: "", contractNumber: "", paymentAmount: 0, studentLimit: 30, login: "", password: "", expiresAt: "",
};

export function CentersSection({ intent, clearIntent }: SectionProps) {
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Center> | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [students, setStudents] = useState<CenterStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsFailed, setStudentsFailed] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [adding, setAdding] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [editStudentId, setEditStudentId] = useState<string | null>(null);
  const [esName, setEsName] = useState("");
  const [esLogin, setEsLogin] = useState("");
  const [esPass, setEsPass] = useState("");
  const [esError, setEsError] = useState("");
  const [esSaving, setEsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "learningCenters"));
      const rows = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const studSnap = await getDocs(collection(db, "learningCenters", d.id, "students"));
        return {
          id: d.id,
          name: data.name ?? "",
          contactPerson: data.contactPerson ?? "",
          phone: data.phone ?? "",
          contractNumber: data.contractNumber ?? "",
          paymentAmount: data.paymentAmount ?? 0,
          studentLimit: data.studentLimit ?? 30,
          login: data.login ?? "",
          password: data.password ?? "",
          expiresAt: data.expiresAt ?? "",
          studentCount: studSnap.size,
        } satisfies Center;
      }));
      rows.sort((a, b) => a.name.localeCompare(b.name));
      setCenters(rows);
      setLoadFailed(false);
    } catch (e) {
      console.error(e);
      setLoadFailed(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStudents = useCallback(async (centerId: string) => {
    setStudentsLoading(true);
    try {
      const snap = await getDocs(collection(db, "learningCenters", centerId, "students"));
      setStudents(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, fullName: data.fullName ?? "", login: data.login ?? "", addedAt: data.addedAt?.toDate?.()?.toISOString?.() ?? "" };
      }).sort((a, b) => a.fullName.localeCompare(b.fullName)));
      setStudentsFailed(false);
    } catch (e) {
      console.error(e);
      setStudentsFailed(true);
    }
    setStudentsLoading(false);
  }, []);

  const select = (id: string | null) => {
    setSelectedId(id);
    setEditing(id === "new" ? { ...EMPTY_CENTER } : null);
    setFormError("");
    setShowPassword(false);
    setStudentError("");
    setEditStudentId(null);
    setNewName(""); setNewLogin(""); setNewPassword("");
    setStudents([]);
    if (id && id !== "new") loadStudents(id);
  };

  useEffect(() => {
    if (!intent) return;
    if (intent.action === "new") select("new");
    if (intent.id) select(intent.id);
    if (intent.filter) setFilter(intent.filter as Filter);
    clearIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  const counts = useMemo(() => {
    const c = { all: centers.length, active: 0, ending: 0, expired: 0, pending: 0 };
    centers.forEach((x) => { c[statusOf(x)] += 1; });
    return c;
  }, [centers]);

  const filtered = centers
    .filter((c) => filter === "all" || statusOf(c) === filter)
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()));

  const selected = centers.find((c) => c.id === selectedId) ?? null;

  const patchCount = (id: string, delta: number) =>
    setCenters((prev) => prev.map((c) => (c.id === id ? { ...c, studentCount: Math.max(0, c.studentCount + delta) } : c)));

  const saveCenter = async () => {
    if (!editing) return;
    if (!editing.name?.trim() || !editing.login?.trim() || !editing.password || !editing.expiresAt) {
      setFormError("Fill in the name, login, password and contract end date.");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        contactPerson: editing.contactPerson ?? "",
        phone: editing.phone ?? "",
        contractNumber: editing.contractNumber ?? "",
        paymentAmount: Number(editing.paymentAmount) || 0,
        studentLimit: Number(editing.studentLimit) || 30,
        login: editing.login.trim(),
        password: editing.password,
        expiresAt: editing.expiresAt,
        // Status is derived from expiresAt, never stored.
      };
      let id = editing.id;
      if (id) {
        await updateDoc(doc(db, "learningCenters", id), payload);
      } else {
        id = (await addDoc(collection(db, "learningCenters"), { ...payload, createdAt: new Date() })).id;
      }
      await load();
      select(id);
    } catch (e) {
      console.error(e);
      setFormError("Could not save the learning center. Try again.");
    }
    setSaving(false);
  };

  const deleteCenter = async (c: Center) => {
    if (!(await confirm(`Delete ${c.name}? The center loses access to its portal. Student accounts are not deleted.`, { title: "Delete learning center?", destructive: true, confirmLabel: "Delete center" }))) return;
    await deleteDoc(doc(db, "learningCenters", c.id));
    setCenters((prev) => prev.filter((x) => x.id !== c.id));
    select(null);
  };

  const addStudent = async (c: Center) => {
    if (!newName.trim() || !newLogin.trim() || !newPassword.trim()) {
      setStudentError("Fill in the name, login and password.");
      return;
    }
    setStudentError("");
    if (newPassword.trim().length < 6) { setStudentError("The password needs at least 6 characters."); return; }
    if (c.studentCount >= c.studentLimit) { setStudentError(`${c.name} has used all ${c.studentLimit} student places.`); return; }
    setAdding(true);
    try {
      const loginKey = newLogin.trim().toLowerCase();
      const existing = await getDocs(query(collection(db, "learningCenters", c.id, "students"), where("login", "==", loginKey)));
      if (!existing.empty) { setStudentError("That login is already used in this center."); setAdding(false); return; }

      // Create the student's Firebase Auth account so they can actually sign in.
      const fakeEmail = `${loginKey}@writeready.student`;
      let uid: string;
      try {
        uid = await createStudentAuthAccount(fakeEmail, newPassword.trim());
      } catch (err) {
        const code = (err as { code?: string })?.code;
        setStudentError(code === "auth/email-already-in-use" ? "That login is already taken. Choose another." : "Could not create the student account. Try again.");
        setAdding(false);
        return;
      }

      await setDoc(doc(db, "users", uid), {
        email: fakeEmail,
        studentLogin: loginKey,
        fullName: newName.trim(),
        plan: "pro",
        subscriptionExpiresAt: c.expiresAt || null,
        centerId: c.id,
        centerName: c.name,
        createdAt: serverTimestamp(),
        bonusAnalyses: 0,
      });
      await setDoc(doc(db, "learningCenters", c.id, "students", uid), {
        fullName: newName.trim(),
        login: loginKey,
        password: newPassword.trim(),
        uid,
        addedAt: serverTimestamp(),
      });

      setNewName(""); setNewLogin(""); setNewPassword("");
      await loadStudents(c.id);
      patchCount(c.id, 1);
    } catch (e) {
      console.error(e);
      setStudentError("Could not add the student. Try again.");
    }
    setAdding(false);
  };

  const removeStudent = async (c: Center, s: CenterStudent) => {
    if (!(await confirm(`Remove ${s.fullName} from ${c.name}? They lose the access the center gives them.`, { title: "Remove student?", destructive: true, confirmLabel: "Remove" }))) return;
    await deleteDoc(doc(db, "learningCenters", c.id, "students", s.id));
    setStudents((prev) => prev.filter((x) => x.id !== s.id));
    patchCount(c.id, -1);
  };

  const startEditStudent = (s: CenterStudent) => {
    setEditStudentId(s.id);
    setEsName(s.fullName);
    setEsLogin(s.login);
    setEsPass("");
    setEsError("");
  };

  const saveStudent = async (c: Center, s: CenterStudent) => {
    if (!esName.trim() || !esLogin.trim()) { setEsError("Name and login are required."); return; }
    setEsSaving(true);
    setEsError("");
    try {
      if (esLogin.trim() !== s.login) {
        const ex = await getDocs(query(collection(db, "learningCenters", c.id, "students"), where("login", "==", esLogin.trim())));
        if (!ex.empty) { setEsError("That login is already used in this center."); setEsSaving(false); return; }
      }
      const updates: Record<string, string> = { fullName: esName.trim(), login: esLogin.trim() };
      if (esPass.trim()) updates.password = esPass.trim();
      await updateDoc(doc(db, "learningCenters", c.id, "students", s.id), updates);
      // The student doc id is the user's uid; analytics join users.studentLogin
      // to students.login, so a changed login has to be mirrored there too.
      if (esLogin.trim() !== s.login) {
        await updateDoc(doc(db, "users", s.id), { studentLogin: esLogin.trim() }).catch(() => {});
      }
      setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, fullName: esName.trim(), login: esLogin.trim() } : x)));
      setEditStudentId(null);
    } catch (e) {
      console.error(e);
      setEsError("Could not save the student. Try again.");
    }
    setEsSaving(false);
  };

  const set = (patch: Partial<Center>) => setEditing((p) => ({ ...p, ...patch }));

  const listPane = (
    <ListPane
      title="Learning centers"
      count={centers.length}
      action={
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={load} disabled={loading} aria-label="Reload centers" title="Reload centers">
            <RefreshCw className={cn(loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
          </Button>
          <Button size="sm" onClick={() => select("new")}><Plus aria-hidden="true" /> New</Button>
        </>
      }
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search centers" label="Search learning centers" inputRef={searchRef} />
          <FilterChips
            label="Filter centers"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "All", count: counts.all },
              { id: "active", label: "Active", count: counts.active },
              { id: "ending", label: "Ending soon", count: counts.ending },
              { id: "expired", label: "Expired", count: counts.expired },
            ]}
          />
        </>
      }
    >
      {loading && centers.length === 0 ? (
        <RowSkeletons />
      ) : loadFailed && centers.length === 0 ? (
        <LoadError what="learning centers" onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={centers.length ? "No centers match" : "No learning centers yet"}
          action={centers.length ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilter("all"); }}>Show all centers</Button> : undefined}
        >
          {centers.length ? "Try another search or filter." : "Add a partner center so it can enrol its own students."}
        </EmptyState>
      ) : (
        <RowList label="Learning centers">
          {filtered.map((c) => {
            const st = STATUS_BADGE[statusOf(c)];
            const full = c.studentCount >= c.studentLimit;
            return (
              <ListRow key={c.id} selected={c.id === selectedId} onSelect={() => select(c.id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{c.name}</span>
                    <Badge variant={st.variant} className="shrink-0 text-[0.7rem]">{st.label}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                    <span className={cn("tabular-nums", full && "font-medium text-red-600 dark:text-red-400")}>{c.studentCount} of {c.studentLimit} students</span>
                    {c.expiresAt && ` · ends ${formatDate(c.expiresAt)}`}
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
            <Button onClick={saveCenter} loading={saving}>{saving ? "Saving…" : isNew ? "Add center" : "Save changes"}</Button>
          </>
        }
      >
        <DetailHeader title={isNew ? "New learning center" : `Edit ${editing.name || "center"}`} meta="The center signs in to its portal with this login and password." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Center name" htmlFor="c-name" className="sm:col-span-2">
            <Input id="c-name" value={editing.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Contact person" htmlFor="c-contact" optional>
            <Input id="c-contact" value={editing.contactPerson ?? ""} onChange={(e) => set({ contactPerson: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="c-phone" optional>
            <Input id="c-phone" type="tel" value={editing.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Portal login" htmlFor="c-login">
            <Input id="c-login" autoComplete="off" value={editing.login ?? ""} onChange={(e) => set({ login: e.target.value })} />
          </Field>
          <Field label="Portal password" htmlFor="c-password">
            <PasswordInput id="c-password" autoComplete="new-password" value={editing.password ?? ""} onChange={(e) => set({ password: e.target.value })} />
          </Field>
          <Field label="Contract ends" htmlFor="c-expires" hint="Status is set from this date: ending soon within 14 days, expired after it passes.">
            <Input id="c-expires" type="date" value={editing.expiresAt ?? ""} onChange={(e) => set({ expiresAt: e.target.value })} />
          </Field>
          <Field label="Student places" htmlFor="c-limit">
            <Input id="c-limit" type="number" min={1} value={editing.studentLimit ?? 30} onChange={(e) => set({ studentLimit: Number(e.target.value) })} className="font-mono" />
          </Field>
          <Field label="Contract number" htmlFor="c-contract" optional>
            <Input id="c-contract" value={editing.contractNumber ?? ""} onChange={(e) => set({ contractNumber: e.target.value })} />
          </Field>
          <Field label="Payment (UZS)" htmlFor="c-payment" optional>
            <Input id="c-payment" type="number" min={0} value={editing.paymentAmount ?? 0} onChange={(e) => set({ paymentAmount: Number(e.target.value) })} className="font-mono" />
          </Field>
        </div>
        {formError && <Notice tone="error" className="mt-5">{formError}</Notice>}
      </DetailView>
    );
  } else if (selected) {
    const status = statusOf(selected);
    const st = STATUS_BADGE[status];
    const days = daysUntil(selected.expiresAt);
    const full = selected.studentCount >= selected.studentLimit;
    detail = (
      <DetailView>
        <DetailHeader
          leading={<Initials name={selected.name} size={44} />}
          title={selected.name}
          badges={<Badge variant={st.variant}>{st.label}</Badge>}
          meta={
            days === null ? "No contract end date set" :
            days < 0 ? `Contract ended ${formatDate(selected.expiresAt)} (${inDays(days)})` :
            `Contract ends ${formatDate(selected.expiresAt)} (${inDays(days)})`
          }
          actions={<Button variant="outline" size="sm" onClick={() => { setEditing({ ...selected }); setFormError(""); }}><Pencil aria-hidden="true" /> Edit</Button>}
        />
        {status === "expired" && <Notice tone="error" className="mt-5">The contract has ended. Extend the end date to keep the center's students active.</Notice>}
        {status === "ending" && <Notice tone="warning" className="mt-5">The contract ends {inDays(days ?? 0)}. Renew it before then to avoid interruptions.</Notice>}

        <DetailSection title="Contract and sign-in">
          <KeyValues
            items={[
              { label: "Contact person", value: selected.contactPerson || "Not set" },
              { label: "Phone", value: selected.phone ? <a href={`tel:${selected.phone}`} className="underline underline-offset-2">{selected.phone}</a> : "Not set" },
              { label: "Payment", value: <span className="font-mono tabular-nums">{uzs(selected.paymentAmount)}</span> },
              { label: "Contract number", value: selected.contractNumber || "Not set" },
              { label: "Portal login", value: <span className="font-mono">{selected.login}</span> },
              {
                label: "Portal password",
                value: (
                  <span className="inline-flex items-center gap-2">
                    <span className="font-mono">{showPassword ? selected.password : "••••••••"}</span>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    </button>
                  </span>
                ),
              },
            ]}
          />
        </DetailSection>

        <DetailSection
          title="Students"
          description={<span className={cn("tabular-nums", full && "text-red-600 dark:text-red-400")}>{selected.studentCount} of {selected.studentLimit} places used</span>}
        >
          <form
            className="grid gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] p-4 sm:grid-cols-3"
            onSubmit={(e) => { e.preventDefault(); addStudent(selected); }}
          >
            <Field label="Full name" htmlFor="ns-name">
              <Input id="ns-name" autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="Login" htmlFor="ns-login">
              <Input id="ns-login" autoComplete="off" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="ns-pass" hint="At least 6 characters.">
              <PasswordInput id="ns-pass" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-3">
              <Button type="submit" loading={adding} disabled={full}>
                <UserPlus aria-hidden="true" /> {adding ? "Adding…" : "Add student"}
              </Button>
              {full && <span className="text-sm text-[var(--text-secondary)]">All places are used. Raise the limit in Edit to add more.</span>}
            </div>
            {studentError && <Notice tone="error" className="sm:col-span-3">{studentError}</Notice>}
          </form>

          {studentsLoading ? (
            <RowSkeletons rows={3} />
          ) : studentsFailed ? (
            <LoadError what="this center's students" onRetry={() => loadStudents(selected.id)} className="py-8" />
          ) : students.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">No students yet. Students added here sign in on the main site with their login.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)]">
              {students.map((s) => (
                <li key={s.id} className="px-4 py-3">
                  {editStudentId === s.id ? (
                    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); saveStudent(selected, s); }}>
                      <Field label="Full name" htmlFor={`es-name-${s.id}`}>
                        <Input id={`es-name-${s.id}`} value={esName} onChange={(e) => setEsName(e.target.value)} />
                      </Field>
                      <Field label="Login" htmlFor={`es-login-${s.id}`}>
                        <Input id={`es-login-${s.id}`} value={esLogin} onChange={(e) => setEsLogin(e.target.value)} />
                      </Field>
                      <Field label="New password" htmlFor={`es-pass-${s.id}`} optional hint="Leave empty to keep it.">
                        <PasswordInput id={`es-pass-${s.id}`} autoComplete="new-password" value={esPass} onChange={(e) => setEsPass(e.target.value)} />
                      </Field>
                      {esError && <Notice tone="error" className="sm:col-span-3">{esError}</Notice>}
                      <div className="flex gap-2 sm:col-span-3">
                        <Button type="submit" size="sm" loading={esSaving}>Save</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditStudentId(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Initials name={s.fullName} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{s.fullName}</p>
                        <p className="truncate text-xs text-[var(--text-secondary)]">
                          <span className="font-mono">{s.login || "No login"}</span>
                          {s.addedAt && ` · added ${formatDate(s.addedAt)}`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEditStudent(s)} aria-label={`Edit ${s.fullName}`}>
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeStudent(selected, s)} aria-label={`Remove ${s.fullName}`} className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DetailSection>

        <DetailSection title="Delete center" description="Removes the center and its portal access. Student accounts stay.">
          <Button variant="dangerOutline" onClick={() => deleteCenter(selected)}><Trash2 aria-hidden="true" /> Delete center</Button>
        </DetailSection>
      </DetailView>
    );
  } else {
    detail = (
      <EmptyState
        icon={Building2}
        title="Select a learning center"
        className="py-24"
        action={<Button variant="outline" onClick={() => select("new")}><Plus aria-hidden="true" /> New learning center</Button>}
      >
        Choose a center on the left to see its contract and manage its students.
      </EmptyState>
    );
  }

  return (
    <>
      <ListDetail
        label="Learning centers"
        list={listPane}
        detail={detail}
        detailOpen={selectedId !== null}
        onBack={() => select(null)}
        backLabel="All centers"
        detailKey={`${selectedId ?? "none"}-${editing ? "edit" : "view"}`}
      />
      {dialog}
    </>
  );
}
