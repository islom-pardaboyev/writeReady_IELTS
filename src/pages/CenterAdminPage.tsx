import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";
import { ChartColumn, LayoutDashboard, Plus, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { adminDb as db, adminAuth } from "@/firebase/adminConfig";
import { createStudentAuthAccount } from "@/firebase/createStudentAccount";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { StaffShell, type StaffNavGroup } from "@/components/staff/StaffShell";
import { StaffLogin } from "@/components/staff/StaffLogin";
import { ListDetail, ListPane, RowList, ListRow, DetailView, DetailHeader, DetailSection } from "@/components/staff/ListDetail";
import { EmptyState, Field, Initials, LoadError, Notice, PageHeading, Panel, RowSkeletons, SearchField, StatStrip } from "@/components/staff/parts";
import { daysUntil, formatDate, inDays, timeAgo } from "@/pages/writing/admin/format";

interface CenterData {
  id: string;
  name: string;
  studentLimit: number;
  expiresAt: string;
}

interface Student {
  id: string;
  fullName: string;
  login: string;
  addedAt?: string;
}

interface StudentAnalytics {
  student: Student;
  avgBand: number | null;
  reportCount: number;
  lastActive: string | null;
  monthlyCount: number;
}

type Section = "overview" | "students" | "analytics";

const MONTHLY_ALLOWANCE = 12;

function mapStudentSnap(docs: { id: string; data: () => Record<string, unknown> }[]): Student[] {
  return docs
    .map((d) => {
      const data = d.data();
      const addedAt = data.addedAt as { toDate?: () => Date } | undefined;
      return {
        id: d.id,
        fullName: (data.fullName as string) ?? "",
        login: (data.login as string) ?? "",
        addedAt: addedAt?.toDate?.()?.toISOString?.() ?? "",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function contractStatus(expiresAt?: string) {
  const d = daysUntil(expiresAt);
  if (d === null) return { label: "No end date", variant: "secondary" as const, days: null };
  if (d < 0) return { label: "Expired", variant: "danger" as const, days: d };
  if (d <= 14) return { label: "Ending soon", variant: "warning" as const, days: d };
  return { label: "Active", variant: "success" as const, days: d };
}

export default function CenterAdminPage() {
  const { confirm, dialog } = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [centerId, setCenterId] = useState("");
  const [centerName, setCenterName] = useState("");
  const [section, setSection] = useState<Section>("overview");

  const [centerData, setCenterData] = useState<CenterData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsFailed, setStudentsFailed] = useState(false);
  const [reportsToday, setReportsToday] = useState<number | null>(null);
  const [reportsFailed, setReportsFailed] = useState(false);

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPass, setNewPass] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [editName, setEditName] = useState("");
  const [editLogin, setEditLogin] = useState("");
  const [editPass, setEditPass] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editNotice, setEditNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsFailed, setAnalyticsFailed] = useState(false);
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("centerAdminLoggedIn");
    const id = localStorage.getItem("centerAdminId");
    const name = localStorage.getItem("centerAdminName");
    if (saved !== "true" || !id) return;
    // Firebase Auth persists the signed-in session across reloads on its
    // own; wait for it to report a real user before trusting the localStorage
    // flag, so Firestore queries never race ahead of the restored session.
    const unsub = onAuthStateChanged(adminAuth, (fbUser) => {
      if (fbUser) {
        setIsLoggedIn(true);
        setCenterId(id);
        setCenterName(name ?? "Center");
      }
    });
    return unsub;
  }, []);

  const loadCenterData = useCallback(async (id: string) => {
    try {
      // A direct read of its own record, so the security rules can limit
      // each center to exactly that document.
      const snap = await getDoc(doc(db, "learningCenters", id));
      if (snap.exists()) {
        const d = snap.data();
        setCenterData({ id: snap.id, name: d.name ?? "", studentLimit: d.studentLimit ?? 30, expiresAt: d.expiresAt ?? "" });
      }
    } catch (e) { console.error(e); }
  }, []);

  const loadStudents = useCallback(async (id: string) => {
    setStudentsLoading(true);
    try {
      const snap = await getDocs(collection(db, "learningCenters", id, "students"));
      setStudents(mapStudentSnap(snap.docs));
      setStudentsFailed(false);
    } catch (e) {
      console.error(e);
      setStudentsFailed(true);
    }
    setStudentsLoading(false);
  }, []);

  const loadReportsToday = useCallback(async (list: Student[]) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [snap, usersSnap] = await Promise.all([getDocs(collection(db, "feedback_reports")), getDocs(collection(db, "users"))]);
      const logins = new Set(list.map((s) => s.login).filter(Boolean));
      const uids = new Set<string>();
      usersSnap.docs.forEach((d) => {
        const sLogin = d.data().studentLogin;
        if (sLogin && logins.has(sLogin)) uids.add(d.id);
      });
      let count = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!uids.has(data.uid)) return;
        const ts = data.createdAt?.toDate?.() as Date | undefined;
        if (ts && ts >= todayStart) count++;
      });
      setReportsToday(count);
      setReportsFailed(false);
    } catch (e) {
      console.error(e);
      setReportsFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && centerId) {
      loadCenterData(centerId);
      loadStudents(centerId);
    }
  }, [isLoggedIn, centerId, loadCenterData, loadStudents]);

  useEffect(() => {
    if (students.length > 0) loadReportsToday(students);
    else setReportsToday(0);
  }, [students, loadReportsToday]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const [studSnap, usersSnap, reportsSnap] = await Promise.all([
        getDocs(collection(db, "learningCenters", centerId, "students")),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "feedback_reports")),
      ]);
      const studs = mapStudentSnap(studSnap.docs);
      const loginToUid: Record<string, string> = {};
      usersSnap.docs.forEach((d) => {
        const sLogin = d.data().studentLogin;
        if (sLogin) loginToUid[sLogin] = d.id;
      });
      const monthKeyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" });
      const monthKey = monthKeyFormat.format(new Date());

      const result: StudentAnalytics[] = studs.map((s) => {
        const uid = loginToUid[s.login];
        if (!uid) return { student: s, avgBand: null, reportCount: 0, lastActive: null, monthlyCount: 0 };
        const mine = reportsSnap.docs.filter((d) => d.data().uid === uid);
        let totalBand = 0; let bandCount = 0; let lastTs: Date | null = null; let monthlyCount = 0;
        mine.forEach((d) => {
          const data = d.data();
          const vals = Object.values((data.scores ?? {}) as Record<string, number>).filter((v) => typeof v === "number");
          if (vals.length) { totalBand += vals.reduce((a, b) => a + b, 0) / vals.length; bandCount++; }
          const ts = data.createdAt?.toDate?.() as Date | undefined;
          if (ts) {
            if (!lastTs || ts > lastTs) lastTs = ts;
            if (monthKeyFormat.format(ts) === monthKey) monthlyCount++;
          }
        });
        return {
          student: s,
          avgBand: bandCount > 0 ? Math.round((totalBand / bandCount) * 10) / 10 : null,
          reportCount: mine.length,
          lastActive: lastTs ? (lastTs as Date).toISOString() : null,
          monthlyCount,
        };
      });
      result.sort((a, b) => (b.avgBand ?? 0) - (a.avgBand ?? 0));
      setAnalytics(result);
      setAnalyticsFailed(false);
    } catch (e) {
      console.error(e);
      setAnalyticsFailed(true);
    }
    setAnalyticsLoading(false);
  }, [centerId]);

  useEffect(() => {
    if (isLoggedIn && section === "analytics" && centerId) loadAnalytics();
  }, [isLoggedIn, section, centerId, loadAnalytics]);

  const limit = centerData?.studentLimit ?? 30;
  const full = students.length >= limit;

  const selectStudent = (id: string | null) => {
    setSelectedId(id);
    setAddError("");
    setEditNotice(null);
    const s = students.find((x) => x.id === id);
    setEditName(s?.fullName ?? "");
    setEditLogin(s?.login ?? "");
    setEditPass("");
  };

  const addStudent = async () => {
    if (!newName.trim() || !newLogin.trim() || !newPass.trim()) { setAddError("Fill in the name, login and password."); return; }
    setAddError("");
    if (newPass.trim().length < 6) { setAddError("The password needs at least 6 characters."); return; }
    if (full) { setAddError(`You have used all ${limit} student places.`); return; }
    setAdding(true);
    try {
      const loginKey = newLogin.trim().toLowerCase();
      const existing = await getDocs(query(collection(db, "learningCenters", centerId, "students"), where("login", "==", loginKey)));
      if (!existing.empty) { setAddError("That login is already used by one of your students."); setAdding(false); return; }

      // Create the student's Firebase Auth account so they can actually sign in.
      const fakeEmail = `${loginKey}@writeready.student`;
      let uid: string;
      try {
        uid = await createStudentAuthAccount(fakeEmail, newPass.trim());
      } catch (err) {
        const code = (err as { code?: string })?.code;
        setAddError(code === "auth/email-already-in-use" ? "That login is already taken. Choose another." : "Could not create the student account. Try again.");
        setAdding(false);
        return;
      }

      // User profile: grants pro access tied to the center's contract end.
      await setDoc(doc(db, "users", uid), {
        email: fakeEmail,
        studentLogin: loginKey,
        fullName: newName.trim(),
        plan: "pro",
        subscriptionExpiresAt: centerData?.expiresAt || null,
        centerId,
        centerName,
        createdAt: serverTimestamp(),
        bonusAnalyses: 0,
      });
      // Student record under the center (doc id = uid so it maps to the account).
      await setDoc(doc(db, "learningCenters", centerId, "students", uid), {
        fullName: newName.trim(),
        login: loginKey,
        password: newPass.trim(),
        uid,
        addedAt: serverTimestamp(),
      });

      setNewName(""); setNewLogin(""); setNewPass("");
      await loadStudents(centerId);
      setSelectedId(uid);
      setEditName(newName.trim());
      setEditLogin(loginKey);
      setEditNotice({ tone: "success", text: "Student added. They can sign in on writeready.uz with this login and password." });
    } catch (e) {
      console.error(e);
      setAddError("Could not add the student. Try again.");
    }
    setAdding(false);
  };

  const removeStudent = async (s: Student) => {
    if (!(await confirm(`Remove ${s.fullName}? They lose the access your center gives them.`, { title: "Remove student?", destructive: true, confirmLabel: "Remove" }))) return;
    await deleteDoc(doc(db, "learningCenters", centerId, "students", s.id));
    setStudents((prev) => prev.filter((x) => x.id !== s.id));
    selectStudent(null);
  };

  const saveStudent = async (s: Student) => {
    if (!editName.trim() || !editLogin.trim()) { setEditNotice({ tone: "error", text: "Name and login are required." }); return; }
    setEditNotice(null);
    setSavingEdit(true);
    try {
      if (editLogin.trim() !== s.login) {
        const existing = await getDocs(query(collection(db, "learningCenters", centerId, "students"), where("login", "==", editLogin.trim())));
        if (!existing.empty) { setEditNotice({ tone: "error", text: "That login is already used by one of your students." }); setSavingEdit(false); return; }
      }
      const updates: Record<string, string> = { fullName: editName.trim(), login: editLogin.trim() };
      if (editPass.trim()) updates.password = editPass.trim();
      await updateDoc(doc(db, "learningCenters", centerId, "students", s.id), updates);
      // The student doc's id is the user's uid (see addStudent). Analytics and
      // "reports today" join users.studentLogin -> students.login by value, so
      // an edited login must be mirrored onto the user profile or that student
      // silently disappears from both until this is back in sync.
      if (editLogin.trim() !== s.login) {
        await updateDoc(doc(db, "users", s.id), { studentLogin: editLogin.trim() }).catch(() => {});
      }
      setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, fullName: editName.trim(), login: editLogin.trim() } : x)));
      setEditPass("");
      setEditNotice({ tone: "success", text: "Changes saved." });
    } catch (e) {
      console.error(e);
      setEditNotice({ tone: "error", text: "Could not save the changes. Try again." });
    }
    setSavingEdit(false);
  };

  const signOut = async () => {
    localStorage.removeItem("centerAdminLoggedIn");
    localStorage.removeItem("centerAdminId");
    localStorage.removeItem("centerAdminName");
    await fbSignOut(adminAuth).catch(() => {});
    setIsLoggedIn(false);
  };

  const login = async (username: string, password: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "center", login: username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return res.status >= 500 ? "The sign-in service had a problem. Try again in a minute." : "That username or password is not right.";
      }
      await signInWithCustomToken(adminAuth, data.customToken);
      localStorage.setItem("centerAdminLoggedIn", "true");
      localStorage.setItem("centerAdminId", data.centerId);
      localStorage.setItem("centerAdminName", data.centerName ?? "Center");
      setCenterId(data.centerId);
      setCenterName(data.centerName ?? "Center");
      setIsLoggedIn(true);
      return null;
    } catch (e) {
      console.error(e);
      return "Could not reach the server. Check your connection and try again.";
    }
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => !q || s.fullName.toLowerCase().includes(q) || s.login.toLowerCase().includes(q));
  }, [students, search]);

  if (!isLoggedIn) {
    return (
      <StaffLogin
        title="Learning center sign-in"
        description="Add your students and follow their results."
        loginLabel="Username"
        onSubmit={login}
      />
    );
  }

  const status = contractStatus(centerData?.expiresAt);
  const nav: StaffNavGroup<Section>[] = [
    {
      items: [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "students", label: "Students", icon: Users },
        { id: "analytics", label: "Analytics", icon: ChartColumn },
      ],
    },
  ];

  const selected = students.find((s) => s.id === selectedId) ?? null;
  const dirty = !!selected && (editName !== selected.fullName || editLogin !== selected.login || !!editPass);

  // ── Overview ─────────────────────────────────────────────────────────────
  const overview = (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8 sm:px-6 lg:px-10">
      <PageHeading
        title={centerName || "Overview"}
        description={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        actions={<Button onClick={() => { setSection("students"); selectStudent("new"); }} disabled={full}><UserPlus aria-hidden="true" /> Add student</Button>}
      />
      <StatStrip
        items={[
          { label: "Students", value: students.length, onClick: () => setSection("students") },
          { label: "Places used", value: `${students.length} of ${limit}`, hint: full ? "All places are used" : `${limit - students.length} left` },
          { label: "AI reports today", value: reportsFailed ? "…" : reportsToday ?? "…", hint: reportsFailed ? "Could not load. Reload the page to retry." : undefined, onClick: () => setSection("analytics") },
          { label: "Contract ends", value: <span className="text-xl">{formatDate(centerData?.expiresAt) ?? "Not set"}</span> },
        ]}
      />
      <Panel title="Contract" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={status.variant}>{status.label}</Badge>
          <p className="text-sm text-[var(--text-secondary)]">
            {status.days === null ? "WriteReady has not set an end date for your contract yet." :
              status.days < 0 ? `Your contract ended ${formatDate(centerData?.expiresAt)}. Students keep access only while it is active.` :
              `Your students have access until ${formatDate(centerData?.expiresAt)} (${inDays(status.days)}).`}
          </p>
        </div>
        {status.variant !== "success" && status.days !== null && (
          <Notice tone={status.variant === "danger" ? "error" : "warning"} className="mt-4">
            Contact WriteReady to renew your contract so your students keep their access.
          </Notice>
        )}
      </Panel>
    </div>
  );

  // ── Students ─────────────────────────────────────────────────────────────
  const studentsList = (
    <ListPane
      title="Students"
      count={students.length}
      action={<Button size="sm" onClick={() => selectStudent("new")} disabled={full} title={full ? "All places are used" : undefined}><Plus aria-hidden="true" /> Add</Button>}
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search by name or login" label="Search students" inputRef={searchRef} />
          <p className={cn("text-xs tabular-nums", full ? "text-red-600 dark:text-red-400" : "text-[var(--text-secondary)]")}>
            {students.length} of {limit} places used
          </p>
        </>
      }
    >
      {studentsLoading && students.length === 0 ? (
        <RowSkeletons />
      ) : studentsFailed && students.length === 0 ? (
        <LoadError what="your students" onRetry={() => loadStudents(centerId)} />
      ) : filteredStudents.length === 0 ? (
        <EmptyState icon={Users} title={students.length ? "No students match" : "No students yet"}>
          {students.length ? "Try another name or login." : "Add your students so they can use WriteReady."}
        </EmptyState>
      ) : (
        <RowList label="Students">
          {filteredStudents.map((s) => (
            <ListRow key={s.id} selected={s.id === selectedId} onSelect={() => selectStudent(s.id)}>
              <Initials name={s.fullName} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{s.fullName}</p>
                <p className="truncate text-xs text-[var(--text-secondary)]"><span className="font-mono">{s.login || "No login"}</span>{s.addedAt && ` · added ${formatDate(s.addedAt)}`}</p>
              </div>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  let studentDetail;
  if (selectedId === "new") {
    studentDetail = (
      <DetailView
        footer={
          <>
            <Button variant="ghost" onClick={() => selectStudent(null)}>Cancel</Button>
            <Button onClick={addStudent} loading={adding} disabled={full}>{adding ? "Adding…" : "Add student"}</Button>
          </>
        }
      >
        <DetailHeader title="Add a student" meta="The student signs in on writeready.uz with this login and password." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ns-name" className="sm:col-span-2">
            <Input id="ns-name" autoComplete="off" placeholder="Ali Valiyev" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="Login" htmlFor="ns-login" hint="Letters and numbers, no spaces.">
            <Input id="ns-login" autoComplete="off" placeholder="ali_valiyev" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="ns-pass" hint="At least 6 characters.">
            <PasswordInput id="ns-pass" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          </Field>
        </div>
        {full && <Notice tone="warning" className="mt-5">All {limit} places are used. Contact WriteReady to raise your limit.</Notice>}
        {addError && <Notice tone="error" className="mt-5">{addError}</Notice>}
      </DetailView>
    );
  } else if (selected) {
    studentDetail = (
      <DetailView
        footer={
          dirty ? (
            <>
              <Button variant="ghost" onClick={() => selectStudent(selected.id)}>Discard changes</Button>
              <Button onClick={() => saveStudent(selected)} loading={savingEdit}>{savingEdit ? "Saving…" : "Save changes"}</Button>
            </>
          ) : undefined
        }
      >
        <DetailHeader
          leading={<Initials name={selected.fullName} size={44} />}
          title={selected.fullName}
          meta={<>Login <span className="font-mono">{selected.login}</span>{selected.addedAt && `, added ${formatDate(selected.addedAt)}`}</>}
        />
        {editNotice && <Notice tone={editNotice.tone} className="mt-5">{editNotice.text}</Notice>}
        <DetailSection title="Details">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Full name" htmlFor="es-name" className="sm:col-span-2">
              <Input id="es-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <Field label="Login" htmlFor="es-login">
              <Input id="es-login" autoComplete="off" value={editLogin} onChange={(e) => setEditLogin(e.target.value)} />
            </Field>
            <Field label="New password" htmlFor="es-pass" optional hint="Leave empty to keep the current one.">
              <PasswordInput id="es-pass" autoComplete="new-password" value={editPass} onChange={(e) => setEditPass(e.target.value)} />
            </Field>
          </div>
        </DetailSection>
        <DetailSection title="Remove student" description="Frees up a place. The student loses the access your center gives them.">
          <Button variant="dangerOutline" onClick={() => removeStudent(selected)}><Trash2 aria-hidden="true" /> Remove student</Button>
        </DetailSection>
      </DetailView>
    );
  } else {
    studentDetail = (
      <EmptyState
        icon={Users}
        title="Select a student"
        className="py-24"
        action={!full && <Button variant="outline" onClick={() => selectStudent("new")}><Plus aria-hidden="true" /> Add student</Button>}
      >
        Choose a student on the left to change their name, login or password.
      </EmptyState>
    );
  }

  // ── Analytics ────────────────────────────────────────────────────────────
  const picked = analytics.find((a) => a.student.id === analyticsId) ?? null;
  const analyticsList = (
    <ListPane
      title="Analytics"
      action={
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadAnalytics} disabled={analyticsLoading} aria-label="Reload analytics" title="Reload analytics">
          <RefreshCw className={cn(analyticsLoading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
        </Button>
      }
      toolbar={<p className="text-sm text-[var(--text-secondary)]">Students ranked by average band score, with this month's usage.</p>}
    >
      {analyticsLoading && analytics.length === 0 ? (
        <RowSkeletons />
      ) : analyticsFailed && analytics.length === 0 ? (
        <LoadError what="results" onRetry={loadAnalytics} />
      ) : analytics.length === 0 ? (
        <EmptyState icon={ChartColumn} title="No results yet">Results appear once your students send essays for AI feedback.</EmptyState>
      ) : (
        <RowList label="Students by band score">
          {analytics.map((a, i) => (
            <ListRow key={a.student.id} selected={a.student.id === analyticsId} onSelect={() => setAnalyticsId(a.student.id)}>
              <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{a.student.fullName}</p>
                <p className="truncate text-xs tabular-nums text-[var(--text-secondary)]">
                  <span className={cn(a.monthlyCount >= MONTHLY_ALLOWANCE && "font-medium text-red-600 dark:text-red-400")}>{a.monthlyCount} of {MONTHLY_ALLOWANCE} this month</span>
                  {" · "}{a.lastActive ? `active ${timeAgo(a.lastActive)}` : "not active yet"}
                </p>
              </div>
              <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-[var(--text-primary)]">
                {a.avgBand !== null ? a.avgBand.toFixed(1) : <span className="text-sm font-normal text-[var(--text-secondary)]">None</span>}
              </span>
            </ListRow>
          ))}
        </RowList>
      )}
    </ListPane>
  );

  const analyticsDetail = picked ? (
    <DetailView>
      <DetailHeader
        leading={<Initials name={picked.student.fullName} size={44} />}
        title={picked.student.fullName}
        meta={<>Login <span className="font-mono">{picked.student.login}</span></>}
      />
      <div className="mt-6">
        <StatStrip
          items={[
            { label: "Average band", value: picked.avgBand !== null ? picked.avgBand.toFixed(1) : "None" },
            { label: "AI reports", value: picked.reportCount },
            { label: "Last active", value: <span className="text-xl">{formatDate(picked.lastActive) ?? "Never"}</span> },
          ]}
        />
      </div>
      <DetailSection title="This month" description={`Students get ${MONTHLY_ALLOWANCE} AI reports a month.`}>
        <div className="flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className={cn("h-full rounded-full", picked.monthlyCount >= MONTHLY_ALLOWANCE ? "bg-red-500" : picked.monthlyCount >= 8 ? "bg-amber-500" : "bg-[var(--ink-blue)]")}
              style={{ width: `${Math.min(100, (picked.monthlyCount / MONTHLY_ALLOWANCE) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-primary)]">{picked.monthlyCount} of {MONTHLY_ALLOWANCE} used</span>
        </div>
      </DetailSection>
    </DetailView>
  ) : (
    <EmptyState icon={ChartColumn} title="Select a student" className="py-24">
      Choose a student on the left to see their average band, reports and this month's usage.
    </EmptyState>
  );

  return (
    <>
      <StaffShell
        role="Learning center"
        identity={{ name: centerName, detail: "Learning center" }}
        nav={nav}
        active={section}
        onNavigate={setSection}
        onSignOut={signOut}
      >
        {section === "overview" && overview}
        {section === "students" && (
          <ListDetail
            label="Students"
            list={studentsList}
            detail={studentDetail}
            detailOpen={selectedId !== null}
            onBack={() => selectStudent(null)}
            backLabel="All students"
            detailKey={selectedId ?? "none"}
          />
        )}
        {section === "analytics" && (
          <ListDetail
            label="Analytics"
            list={analyticsList}
            detail={analyticsDetail}
            detailOpen={analyticsId !== null}
            onBack={() => setAnalyticsId(null)}
            backLabel="All students"
            detailKey={analyticsId ?? "none"}
          />
        )}
      </StaffShell>
      {dialog}
    </>
  );
}
