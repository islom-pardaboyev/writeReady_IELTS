import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { onAuthStateChanged, signInWithCustomToken, signOut as fbSignOut } from "firebase/auth";
import { ChartColumn, LayoutDashboard, Plus, RefreshCw, Trash2, UserPlus, Users } from "lucide-react";
import { adminDb as db, adminAuth } from "@/firebase/adminConfig";
import { createStudentAuthAccount, deleteStudentAuthAccount } from "@/firebase/createStudentAccount";
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
import { PLAN_INFO } from "@/lib/plans";
import { centerPlanOf, type CenterPlanId } from "@/lib/centerPricing";
import { removeCenterStudent, updateCenterStudent } from "@/lib/centerStudent";
import { reportBand } from "@shared/bandScore";

interface CenterData {
  id: string;
  name: string;
  studentLimit: number;
  expiresAt: string;
  /** The plan WriteReady sold this center; every student of it gets that plan. */
  plan: CenterPlanId;
}

interface Student {
  id: string;
  /** The student's account. New students use it as their document id too. */
  uid: string;
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

function mapStudentSnap(docs: { id: string; data: () => Record<string, unknown> }[]): Student[] {
  return docs
    .map((d) => {
      const data = d.data();
      const addedAt = data.addedAt as { toDate?: () => Date } | undefined;
      return {
        id: d.id,
        uid: typeof data.uid === "string" && data.uid ? data.uid : d.id,
        fullName: (data.fullName as string) ?? "",
        login: (data.login as string) ?? "",
        addedAt: addedAt?.toDate?.()?.toISOString?.() ?? "",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * The feedback reports of these students, and nobody else's. Firestore takes
 * at most 30 values in an `in` filter, so the list is fetched in slices. The
 * portal used to download every report and every user profile on the whole
 * platform and filter them here, which showed each center other people's data
 * and grew slower with every new student anywhere.
 */
async function reportsFor(uids: string[]) {
  const slices: string[][] = [];
  for (let i = 0; i < uids.length; i += 30) slices.push(uids.slice(i, i + 30));
  const snaps = await Promise.all(
    slices.map((ids) => getDocs(query(collection(db, "feedback_reports"), where("uid", "in", ids)))),
  );
  return snaps.flatMap((snap) => snap.docs.map((d) => d.data()));
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
        setCenterData({
          id: snap.id,
          name: d.name ?? "",
          studentLimit: d.studentLimit ?? 30,
          expiresAt: d.expiresAt ?? "",
          plan: centerPlanOf(d.plan),
        });
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
      const reports = await reportsFor(list.map((s) => s.uid));
      let count = 0;
      reports.forEach((data) => {
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
      const studSnap = await getDocs(collection(db, "learningCenters", centerId, "students"));
      const studs = mapStudentSnap(studSnap.docs);
      // "Last active" is when the student last used the site (stamped by
      // api/seen.ts on their profile), not only when they last got a report:
      // a student who logs in and writes without asking for feedback used to
      // show as "not active yet". A center may read its own students' profiles.
      const [reports, profiles] = await Promise.all([
        reportsFor(studs.map((s) => s.uid)),
        getDocs(query(collection(db, "users"), where("centerId", "==", centerId))),
      ]);
      const seenAt = new Map(profiles.docs.map((d) => [d.id, d.data().lastActiveAt?.toDate?.() as Date | undefined]));
      const monthKeyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit" });
      const monthKey = monthKeyFormat.format(new Date());

      const result: StudentAnalytics[] = studs.map((s) => {
        const mine = reports.filter((data) => data.uid === s.uid);
        let totalBand = 0; let bandCount = 0; let lastTs: Date | null = seenAt.get(s.uid) ?? null; let monthlyCount = 0;
        mine.forEach((data) => {
          // Each report's official overall band, the number the student saw.
          const band = reportBand(data.scores);
          if (band !== null) { totalBand += band; bandCount++; }
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
  // A student added after the contract ended would land on the free plan, so
  // the portal stops there instead of handing over an account that gives
  // nothing.
  const contractEnded = (daysUntil(centerData?.expiresAt) ?? 0) < 0;
  const canAdd = !full && !contractEnded;
  // Every student of the center gets the plan the center bought.
  const allowance = PLAN_INFO[centerPlanOf(centerData?.plan)].monthlyAnalyses;

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
    if (contractEnded) { setAddError("Your contract has ended, so a new student would get nothing. Contact WriteReady to renew it."); return; }
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

      // The profile must repeat exactly what the center's own record says:
      // firestore.rules compares the two, and a plan WriteReady changed after
      // this page loaded would be refused. So read the record again first.
      const fresh = await getDoc(doc(db, "learningCenters", centerId)).catch(() => null);
      const centerNow = fresh?.exists() ? fresh.data() : null;
      const plan = centerPlanOf(centerNow?.plan ?? centerData?.plan);
      const endsAt: string = (centerNow?.expiresAt ?? centerData?.expiresAt ?? "") as string;

      // User profile: grants the center's own plan, tied to its contract
      // end. These fields have to stay in step with the admin panel's
      // studentPlanFields() in
      // src/pages/writing/admin/CentersSection.tsx and with firestore.rules.
      const profile = {
        email: fakeEmail,
        studentLogin: loginKey,
        fullName: newName.trim(),
        plan,
        expiresAt: endsAt ? `${endsAt}T23:59:59` : "",
        subscriptionExpiresAt: endsAt || null,
        centerId,
        centerName,
        bonusAnalyses: 0,
      };

      try {
        await setDoc(doc(db, "users", uid), { ...profile, createdAt: serverTimestamp() });
      } catch (err) {
        // The rules compare this profile against the center's own record, so
        // printing both side by side says which field was refused.
        console.error("The student's profile was refused. Tried to write:", profile);
        console.error("The center's record says:", centerNow
          ? { plan: centerNow.plan, expiresAt: centerNow.expiresAt, expiresAtType: typeof centerNow.expiresAt }
          : "could not be read");
        // The sign-in account already exists at this point. Leaving it would
        // hold the login hostage: the next try would be refused as "already
        // taken" while the student still has no profile.
        await deleteStudentAuthAccount(fakeEmail, newPass.trim());
        throw err;
      }

      // Student record under the center (doc id = uid so it maps to the account).
      try {
        // No password here: it lives in the sign-in account only.
        await setDoc(doc(db, "learningCenters", centerId, "students", uid), {
          fullName: newName.trim(),
          login: loginKey,
          uid,
          addedAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("The center's own student list refused the write for center", centerId);
        await deleteStudentAuthAccount(fakeEmail, newPass.trim());
        throw err;
      }

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
    const result = await removeCenterStudent(centerId, s.id);
    if (!result.ok) { setEditNotice({ tone: "error", text: result.error }); return; }
    setStudents((prev) => prev.filter((x) => x.id !== s.id));
    selectStudent(null);
  };

  const saveStudent = async (s: Student) => {
    if (!editName.trim() || !editLogin.trim()) { setEditNotice({ tone: "error", text: "Name and login are required." }); return; }
    setEditNotice(null);
    setSavingEdit(true);
    // The server changes the login and password the student really signs in
    // with (api/center-student.ts), not just the copy shown here.
    const result = await updateCenterStudent(centerId, s.id, {
      fullName: editName.trim(),
      login: editLogin.trim(),
      ...(editPass.trim() ? { password: editPass.trim() } : {}),
    });
    if (result.ok) {
      const login = result.login ?? editLogin.trim().toLowerCase();
      setStudents((prev) => prev.map((x) => (x.id === s.id ? { ...x, fullName: editName.trim(), login } : x)));
      setEditLogin(login);
      setEditPass("");
      setEditNotice({ tone: "success", text: editPass.trim() || login !== s.login ? "Saved. The student signs in with the new details from now on." : "Changes saved." });
    } else {
      setEditNotice({ tone: "error", text: result.error });
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
        if (res.status === 429) return data.error ?? "Too many wrong passwords. Wait 15 minutes and try again.";
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
        actions={<Button onClick={() => { setSection("students"); selectStudent("new"); }} disabled={!canAdd}><UserPlus aria-hidden="true" /> Add student</Button>}
      />
      <StatStrip
        items={[
          { label: "Students", value: students.length, onClick: () => setSection("students") },
          { label: "Places used", value: `${students.length} of ${limit}`, hint: full ? "All places are used" : `${limit - students.length} left` },
          { label: "AI reports today", value: reportsFailed ? "…" : reportsToday ?? "…", hint: reportsFailed ? "Could not load. Reload the page to retry." : undefined, onClick: () => setSection("analytics") },
          { label: "Contract ends", value: <span className="text-xl">{formatDate(centerData?.expiresAt) ?? "Not set"}</span> },
          {
            label: "Student plan",
            value: <span className="text-xl">{PLAN_INFO[centerPlanOf(centerData?.plan)].label}</span>,
            hint: `${PLAN_INFO[centerPlanOf(centerData?.plan)].monthlyAnalyses} AI checks a month each`,
          },
        ]}
      />
      <Panel title="Contract" className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={status.variant}>{status.label}</Badge>
          <p className="text-sm text-[var(--text-secondary)]">
            {status.days === null ? "WriteReady has not set an end date for your contract yet." :
              status.days < 0 ? `Your contract ended ${formatDate(centerData?.expiresAt)}. Students keep access only while it is active.` :
              `Your students have the ${PLAN_INFO[centerPlanOf(centerData?.plan)].label} plan until ${formatDate(centerData?.expiresAt)} (${inDays(status.days)}).`}
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
      action={<Button size="sm" onClick={() => selectStudent("new")} disabled={!canAdd} title={full ? "All places are used" : contractEnded ? "Your contract has ended" : undefined}><Plus aria-hidden="true" /> Add</Button>}
      toolbar={
        <>
          <SearchField value={search} onChange={setSearch} placeholder="Search by name or login…" label="Search students" inputRef={searchRef} />
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
            <Button onClick={addStudent} loading={adding} disabled={!canAdd}>{adding ? "Adding…" : "Add student"}</Button>
          </>
        }
      >
        <DetailHeader title="Add a student" meta="The student signs in on writeready.uz with this login and password." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="ns-name" className="sm:col-span-2">
            <Input name="ns-name" id="ns-name" autoComplete="off" placeholder="Ali Valiyev…" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="Login" htmlFor="ns-login" hint="Letters and numbers, no spaces.">
            <Input name="ns-login" id="ns-login" autoComplete="off" placeholder="ali_valiyev…" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="ns-pass" hint="At least 6 characters.">
            <PasswordInput name="ns-pass" id="ns-pass" autoComplete="new-password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          </Field>
        </div>
        {full && <Notice tone="warning" className="mt-5">All {limit} places are used. Contact WriteReady to raise your limit.</Notice>}
        {contractEnded && <Notice tone="error" className="mt-5">Your contract has ended, so your students are on the free plan and no new student can be added. Contact WriteReady to renew it.</Notice>}
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
              <Input name="es-name" autoComplete="off" id="es-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </Field>
            <Field label="Login" htmlFor="es-login">
              <Input name="es-login" id="es-login" autoComplete="off" value={editLogin} onChange={(e) => setEditLogin(e.target.value)} />
            </Field>
            <Field label="New password" htmlFor="es-pass" optional hint="Leave empty to keep the current one.">
              <PasswordInput name="es-pass" id="es-pass" autoComplete="new-password" value={editPass} onChange={(e) => setEditPass(e.target.value)} />
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
        action={canAdd && <Button variant="outline" onClick={() => selectStudent("new")}><Plus aria-hidden="true" /> Add student</Button>}
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
                  <span className={cn(a.monthlyCount >= allowance && "font-medium text-red-600 dark:text-red-400")}>{a.monthlyCount} of {allowance} this month</span>
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
      <DetailSection title="This month" description={`Students get ${allowance} AI reports a month on the ${PLAN_INFO[centerPlanOf(centerData?.plan)].label} plan.`}>
        <div className="flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
            <div
              className={cn("h-full rounded-full", picked.monthlyCount >= allowance ? "bg-red-500" : picked.monthlyCount >= 8 ? "bg-amber-500" : "bg-[var(--ink-blue)]")}
              style={{ width: `${Math.min(100, (picked.monthlyCount / allowance) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-primary)]">{picked.monthlyCount} of {allowance} used</span>
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
