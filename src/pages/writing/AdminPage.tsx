import { useCallback, useEffect, useState } from "react";
import { collection, getCountFromServer, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import {
  Building2,
  FileText,
  GraduationCap,
  Image,
  LayoutDashboard,
  Megaphone,
  Newspaper,
  Send,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { adminDb as db, adminAuth, ADMIN_EMAIL } from "@/firebase/adminConfig";
import { StaffShell, type StaffNavGroup } from "@/components/staff/StaffShell";
import { AdminLogin } from "./admin/AdminLogin";
import { AdminHome } from "./admin/AdminHome";
import { PromptsSection, type Prompt } from "./admin/PromptsSection";
import { UsersSection } from "./admin/UsersSection";
import { LeaderboardSection } from "./admin/LeaderboardSection";
import { AnnouncementsSection } from "./admin/AnnouncementsSection";
import { TelegramBotSection } from "./admin/TelegramBotSection";
import { CentersSection } from "./admin/CentersSection";
import { TeachersSection } from "./admin/TeachersSection";
import { BlogSection } from "./admin/BlogSection";
import { SettingsSection } from "./admin/SettingsSection";
import type { AdminSection, Intent, PendingReview, UserRow } from "./admin/types";

/**
 * How many recent essay checks the user list looks through to guess when
 * someone was last active. Only people who have not opened the site since
 * api/_lib/routes/seen.ts started stamping `lastActiveAt` need it. Reading every report
 * instead cost one read per report each time the panel opened.
 */
const RECENT_REPORTS = 300;

/** The newer of two ISO times, or "" when there is neither. */
const latest = (...times: (string | undefined)[]) =>
  times.filter(Boolean).sort().at(-1) ?? "";

export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState("Admin");
  const [section, setSection] = useState<AdminSection>("home");
  const [intent, setIntent] = useState<Intent | null>(null);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [task1, setTask1] = useState<Prompt[]>([]);
  const [task2, setTask2] = useState<Prompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  // The full prompt lists are only downloaded when a prompts section is
  // opened. The overview needs just the two totals, which cost a read or two.
  const [promptsLoaded, setPromptsLoaded] = useState(false);
  // Kept apart from failed.prompts, which is about the totals on the overview:
  // a list that failed to load must not hide totals that did.
  const [listFailed, setListFailed] = useState(false);
  const [promptCounts, setPromptCounts] = useState<{ task1: number; task2: number } | null>(null);
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [failed, setFailed] = useState({ users: false, prompts: false, pending: false });
  const markFailed = (key: keyof typeof failed, value: boolean) => setFailed((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const saved = localStorage.getItem("adminLoggedIn");
    const u = localStorage.getItem("adminUser");
    if (saved !== "true") return;
    // Firebase Auth persists the signed-in session across reloads on its
    // own; wait for it to report a real user before trusting the localStorage
    // flag, so Firestore queries never race ahead of the restored session.
    // The teacher and center portals share this Firebase app, so the restored
    // user may not be the admin. Trusting the flag then shows the admin screen
    // while every write is refused — send them back to sign in instead.
    const unsub = onAuthStateChanged(adminAuth, (fbUser) => {
      if (!fbUser) return;
      if (fbUser.email?.toLowerCase() === ADMIN_EMAIL) {
        setIsLoggedIn(true);
        if (u) setAdminUser(u);
      } else {
        localStorage.removeItem("adminLoggedIn");
        localStorage.removeItem("adminUser");
        setIsLoggedIn(false);
      }
    });
    return unsub;
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      // `lastActiveAt` is stamped by api/_lib/routes/seen.ts every time someone opens the
      // site, so it counts a visit even if they never check an essay. It only
      // exists for people who have been back since it was added, so their
      // newest essay check stands in for the ones who have not. Reports come
      // back newest first, so the first one for a user is their latest.
      const [snap, reportSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(query(collection(db, "feedback_reports"), orderBy("createdAt", "desc"), limit(RECENT_REPORTS))),
      ]);
      const lastReport: Record<string, string> = {};
      reportSnap.docs.forEach((d) => {
        const data = d.data();
        const uid = data.uid as string | undefined;
        if (!uid || lastReport[uid]) return;
        const ts = data.createdAt?.toDate?.() as Date | undefined;
        if (ts) lastReport[uid] = ts.toISOString();
      });
      setUsers(
        snap.docs
          .filter((d) => !d.data().email?.endsWith("@writeready.internal"))
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              email: data.studentLogin ? `${data.studentLogin} (${data.centerName ?? "student"})` : (data.email ?? ""),
              plan: data.plan ?? "free",
              subscription: data.subscription ?? "",
              expiresAt: data.expiresAt ?? "",
              createdAt: data.createdAt?.toDate?.()?.toISOString() ?? "",
              balanceUZS: typeof data.balanceUZS === "number" ? data.balanceUZS : 0,
              lastActiveAt: latest(data.lastActiveAt?.toDate?.()?.toISOString(), lastReport[d.id]),
            };
          }),
      );
      markFailed("users", false);
    } catch (e) {
      console.error(e);
      markFailed("users", true);
    }
    setUsersLoading(false);
  }, []);

  const loadPrompts = useCallback(async () => {
    setPromptsLoading(true);
    try {
      const [s1, s2] = await Promise.all([
        getDocs(query(collection(db, "task1_reports"), orderBy("createdAt", "desc"))),
        getDocs(query(collection(db, "task2_reports"), orderBy("createdAt", "desc"))),
      ]);
      // Thumbnails only — the full chart is fetched when a prompt is opened.
      setTask1(s1.docs.map((d) => ({ id: d.id, thumb: d.data().thumb ?? "", report: d.data().report ?? "" })));
      setTask2(s2.docs.map((d) => ({ id: d.id, report: d.data().report ?? "" })));
      setPromptsLoaded(true);
      setListFailed(false);
      markFailed("prompts", false);
    } catch (e) {
      console.error(e);
      setListFailed(true);
    }
    setPromptsLoading(false);
  }, []);

  const loadPromptCounts = useCallback(async () => {
    try {
      const [c1, c2] = await Promise.all([
        getCountFromServer(collection(db, "task1_reports")),
        getCountFromServer(collection(db, "task2_reports")),
      ]);
      setPromptCounts({ task1: c1.data().count, task2: c2.data().count });
      markFailed("prompts", false);
    } catch (e) {
      console.error(e);
      markFailed("prompts", true);
    }
  }, []);

  const loadPending = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, "humanReviews"), where("status", "==", "pending")));
      setPending(snap.docs.map((d) => ({
        id: d.id,
        requestedAt: d.data().requestedAt?.toDate?.() ?? null,
        teacherId: d.data().teacherId ?? "",
        teacherName: d.data().teacherName ?? "",
        studentName: d.data().studentName ?? "",
      })));
      markFailed("pending", false);
    } catch (e) {
      console.error(e);
      markFailed("pending", true);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadUsers();
    loadPromptCounts();
    loadPending();
  }, [isLoggedIn, loadUsers, loadPromptCounts, loadPending]);

  const inPrompts = section === "task1" || section === "task2";
  // The list shows its skeleton from the moment the section opens, not only
  // once the request has started a render later.
  const listPending = promptsLoading || (!promptsLoaded && !listFailed);
  useEffect(() => {
    if (isLoggedIn && inPrompts && !promptsLoaded) loadPrompts();
  }, [isLoggedIn, inPrompts, promptsLoaded, loadPrompts]);

  const go = useCallback((next: AdminSection, extra?: Omit<Intent, "section">) => {
    setSection(next);
    setIntent(extra ? { section: next, ...extra } : null);
  }, []);

  const clearIntent = useCallback(() => setIntent(null), []);

  const signOut = async () => {
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminUser");
    await fbSignOut(adminAuth).catch(() => {});
    setIsLoggedIn(false);
    setSection("home");
  };

  if (!isLoggedIn) return <AdminLogin onLogin={(u) => { setAdminUser(u); setIsLoggedIn(true); }} />;

  const nav: StaffNavGroup<AdminSection>[] = [
    { items: [{ id: "home", label: "Overview", icon: LayoutDashboard }] },
    {
      label: "Content",
      items: [
        { id: "task1", label: "Task 1 prompts", icon: Image },
        { id: "task2", label: "Task 2 prompts", icon: FileText },
        { id: "blog", label: "Blog", icon: Newspaper },
        { id: "announcements", label: "Announcements", icon: Megaphone },
        { id: "telegram", label: "Telegram bot", icon: Send },
      ],
    },
    {
      label: "People",
      items: [
        { id: "users", label: "Users", icon: Users },
        { id: "leaderboard", label: "Leaderboard", icon: Trophy },
      ],
    },
    {
      label: "Partners",
      items: [
        { id: "centers", label: "Learning centers", icon: Building2 },
        { id: "teachers", label: "Teachers", icon: GraduationCap, badge: pending.length || undefined },
      ],
    },
    { label: "Site", items: [{ id: "settings", label: "Settings", icon: Settings }] },
  ];

  const sectionIntent = intent?.section === section ? intent : null;
  const common = { intent: sectionIntent, clearIntent };

  return (
    <StaffShell
      role="Admin"
      identity={{ name: adminUser, detail: "Administrator" }}
      nav={nav}
      active={section}
      onNavigate={(id) => go(id)}
      onSignOut={signOut}
    >
      {section === "home" && (
        <AdminHome
          users={users}
          usersLoading={usersLoading}
          task1Count={promptsLoaded ? task1.length : promptCounts?.task1 ?? null}
          task2Count={promptsLoaded ? task2.length : promptCounts?.task2 ?? null}
          pending={pending}
          failed={failed}
          go={go}
          refresh={() => { loadUsers(); if (promptsLoaded) loadPrompts(); else loadPromptCounts(); loadPending(); }}
        />
      )}
      {section === "task1" && <PromptsSection key="task1" task={1} list={task1} setList={setTask1} loading={listPending} failed={listFailed} reload={loadPrompts} {...common} />}
      {section === "task2" && <PromptsSection key="task2" task={2} list={task2} setList={setTask2} loading={listPending} failed={listFailed} reload={loadPrompts} {...common} />}
      {section === "users" && <UsersSection users={users} setUsers={setUsers} loading={usersLoading} failed={failed.users} reload={loadUsers} {...common} />}
      {section === "leaderboard" && <LeaderboardSection />}
      {section === "announcements" && <AnnouncementsSection {...common} />}
      {section === "telegram" && <TelegramBotSection />}
      {section === "centers" && <CentersSection {...common} />}
      {section === "teachers" && <TeachersSection {...common} pending={pending} onCountsChange={loadPending} />}
      {section === "blog" && <BlogSection {...common} />}
      {section === "settings" && <SettingsSection />}
    </StaffShell>
  );
}
