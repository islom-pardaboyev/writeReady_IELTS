import { useCallback, useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { onAuthStateChanged, signOut as fbSignOut } from "firebase/auth";
import {
  Building2,
  FileText,
  GraduationCap,
  Image,
  LayoutDashboard,
  Megaphone,
  Newspaper,
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
import { CentersSection } from "./admin/CentersSection";
import { TeachersSection } from "./admin/TeachersSection";
import { BlogSection } from "./admin/BlogSection";
import { SettingsSection } from "./admin/SettingsSection";
import type { AdminSection, Intent, PendingReview, UserRow } from "./admin/types";

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
      const snap = await getDocs(collection(db, "users"));
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
      markFailed("prompts", false);
    } catch (e) {
      console.error(e);
      markFailed("prompts", true);
    }
    setPromptsLoading(false);
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
    loadPrompts();
    loadPending();
  }, [isLoggedIn, loadUsers, loadPrompts, loadPending]);

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
          task1Count={task1.length}
          task2Count={task2.length}
          pending={pending}
          failed={failed}
          go={go}
          refresh={() => { loadUsers(); loadPrompts(); loadPending(); }}
        />
      )}
      {section === "task1" && <PromptsSection key="task1" task={1} list={task1} setList={setTask1} loading={promptsLoading} failed={failed.prompts} reload={loadPrompts} {...common} />}
      {section === "task2" && <PromptsSection key="task2" task={2} list={task2} setList={setTask2} loading={promptsLoading} failed={failed.prompts} reload={loadPrompts} {...common} />}
      {section === "users" && <UsersSection users={users} setUsers={setUsers} loading={usersLoading} failed={failed.users} reload={loadUsers} {...common} />}
      {section === "leaderboard" && <LeaderboardSection />}
      {section === "announcements" && <AnnouncementsSection {...common} />}
      {section === "centers" && <CentersSection {...common} />}
      {section === "teachers" && <TeachersSection {...common} pending={pending} onCountsChange={loadPending} />}
      {section === "blog" && <BlogSection {...common} />}
      {section === "settings" && <SettingsSection />}
    </StaffShell>
  );
}
