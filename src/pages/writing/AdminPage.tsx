import { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import useUpload from "@/hooks/useUploadImage";
import Logo from "/logo.png";
import { getBlogPosts, saveBlogPost, updateBlogPost, deleteBlogPost } from "../../firebase/blog";
import type { BlogPost } from "../../types/blog";

interface Task1 { id: string; image: string; report: string; }
interface Task2 { id: string; report: string; }
interface UserRow {
  id: string;
  email: string;
  plan: string;
  subscription?: string;
  createdAt?: string;
}
interface LeaderEntry {
  uid: string;
  email: string;
  prevBand: number | null;
  currBand: number | null;
  improvement: number;
  reportCount: number;
  bonusAnalyses: number;
}

type NavSection = "dashboard" | "task1" | "task2" | "users" | "leaderboard" | "announcements" | "centers" | "blog";

const CREDENTIALS = { login: "2026SPRING", password: "paidOFF" };

function nextMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function planBadge(plan: string, subscription?: string) {
  if (subscription === "forever" || plan === "forever")
    return { label: "Lifetime", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  if (plan === "pro" || (subscription && new Date(subscription) > new Date()))
    return { label: "Pro", cls: "bg-blue-50 text-blue-700 border border-blue-200" };
  return { label: "Free", cls: "bg-slate-100 text-slate-500 border border-slate-200" };
}

function formatDate(iso?: string) {
  if (!iso || iso === "forever") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Login ────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (user: string) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handle = () => {
    if (login === CREDENTIALS.login && password === CREDENTIALS.password) {
      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem("adminUser", login);
      onLogin(login);
    } else {
      setError("Login yoki parol noto'g'ri!");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="w-full max-w-[400px]">
        <div className="bg-[#0f172a] rounded-t-2xl px-8 py-10 text-center text-white">
          <img width={120} className="mx-auto mb-4" src={Logo} alt="" />
          <p className="text-[0.7rem] font-bold tracking-widest uppercase text-white/40 mb-1">Admin Access</p>
          <h1 className="text-2xl font-bold m-0">WriteReady Admin</h1>
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-7 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Login</label>
            <input
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
              placeholder="Login kiriting"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Parol</label>
            <input
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors"
              type="password"
              placeholder="Parol kiriting"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">{error}</div>}
          <button
            className="w-full bg-[#1C3A5E] text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-[#2d5a8e] transition-colors"
            onClick={handle}
          >
            Kirish
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar nav items ────────────────────────────────────────────
const NAV: { id: NavSection; label: string; icon: string }[] = [
  { id: "dashboard",   label: "Dashboard",        icon: "📊" },
  { id: "task1",       label: "Task 1",           icon: "🖼️" },
  { id: "task2",       label: "Task 2",           icon: "✍️" },
  { id: "users",       label: "Users",            icon: "👥" },
  { id: "leaderboard",    label: "Leaderboard",      icon: "🏆" },
  { id: "announcements",  label: "Elonlar",          icon: "📢" },
  { id: "centers",        label: "Learning Centers", icon: "🏫" },
  { id: "blog",           label: "Blog",             icon: "📝" },
];

// ── Main ─────────────────────────────────────────────────────────
export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminUser, setAdminUser] = useState("Admin");
  const [section, setSection] = useState<NavSection>("dashboard");

  // Task 1
  const [task1List, setTask1List] = useState<Task1[]>([]);
  const [task1Search, setTask1Search] = useState("");
  const [t1Image, setT1Image] = useState("");
  const [t1Report, setT1Report] = useState("");
  const [t1Error, setT1Error] = useState("");
  const [t1Loading, setT1Loading] = useState(false);
  const [editT1, setEditT1] = useState<Task1 | null>(null);
  const [editImage, setEditImage] = useState("");
  const [editReport, setEditReport] = useState("");

  // Task 2
  const [task2List, setTask2List] = useState<Task2[]>([]);
  const [task2Search, setTask2Search] = useState("");
  const [t2Report, setT2Report] = useState("");
  const [t2Error, setT2Error] = useState("");
  const [t2Loading, setT2Loading] = useState(false);
  const [editT2, setEditT2] = useState<Task2 | null>(null);
  const [editT2Report, setEditT2Report] = useState("");

  // Users
  const [allUsers, setAllUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [userSuccess, setUserSuccess] = useState("");
  const [userError, setUserError] = useState("");

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [bonusInput, setBonusInput] = useState("3");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMsg, setGrantMsg] = useState("");

  // Announcements
  interface AnnouncementRow { id: string; text: string; active: boolean; createdAt?: string; }
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annText, setAnnText] = useState("");
  const [annSaving, setAnnSaving] = useState(false);

  // Blog
  interface BlogPostRow { id: string; title: string; slug: string; status: string; category: string; viewCount: number; likeCount: number; commentCount: number; publishedAt?: string; }
  const [blogPosts, setBlogPosts] = useState<BlogPostRow[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogEditor, setBlogEditor] = useState<Partial<BlogPost> | null>(null);
  const [blogSaving, setBlogSaving] = useState(false);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiTopic, setAiTopic] = useState("");

  const { uploadImage, uploading } = useUpload();

  useEffect(() => {
    const saved = localStorage.getItem("adminLoggedIn");
    const u = localStorage.getItem("adminUser");
    if (saved === "true") { setIsLoggedIn(true); if (u) setAdminUser(u); }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, "task1_reports"), orderBy("createdAt", "desc"))),
          getDocs(query(collection(db, "task2_reports"), orderBy("createdAt", "desc"))),
        ]);
        setTask1List(s1.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task1, "id">) })));
        setTask2List(s2.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task2, "id">) })));
      } catch (e) { console.error(e); }
    })();
  }, [isLoggedIn]);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const rows: UserRow[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email ?? "",
          plan: data.plan ?? "free",
          subscription: data.subscription ?? "",
          createdAt: data.createdAt?.toDate?.()?.toISOString() ?? "",
        };
      });
      rows.sort((a, b) => {
        const pa = a.plan === "forever" ? 2 : a.plan === "pro" ? 1 : 0;
        const pb = b.plan === "forever" ? 2 : b.plan === "pro" ? 1 : 0;
        return pb - pa;
      });
      setAllUsers(rows);
    } catch (e) { console.error(e); }
    setUsersLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && allUsers.length === 0) loadUsers();
  }, [isLoggedIn, section]);

  const loadBlogPosts = async () => {
    setBlogLoading(true);
    try {
      const posts = await getBlogPosts();
      setBlogPosts(posts.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        status: p.status,
        category: p.category,
        viewCount: p.viewCount,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        publishedAt: p.publishedAt?.toLocaleDateString('en-GB') ?? '',
      })));
    } catch (e) { console.error(e); }
    setBlogLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && section === 'blog') loadBlogPosts();
  }, [isLoggedIn, section]);

  const loadLeaderboard = async () => {
    setLeaderLoading(true);
    setGrantMsg("");
    try {
      const now = new Date();
      const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const repSnap = await getDocs(collection(db, "feedback_reports"));

      // uid → { curr: {total,count}, prev: {total,count} }
      const map: Record<string, { curr: { total: number; count: number }; prev: { total: number; count: number } }> = {};

      repSnap.docs.forEach((d) => {
        const data = d.data();
        const uid = data.uid as string;
        if (!uid) return;
        const scores: Record<string, number> = data.scores ?? {};
        const vals = Object.values(scores).filter((v) => typeof v === "number") as number[];
        if (!vals.length) return;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

        // Determine which month this report belongs to
        const ts = data.createdAt?.toDate?.() as Date | undefined;
        if (!ts) return;
        const reportMonth = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;

        if (!map[uid]) map[uid] = { curr: { total: 0, count: 0 }, prev: { total: 0, count: 0 } };
        if (reportMonth === currMonth) {
          map[uid].curr.total += avg;
          map[uid].curr.count += 1;
        } else if (reportMonth === prevMonth) {
          map[uid].prev.total += avg;
          map[uid].prev.count += 1;
        }
      });

      // Fetch users for emails & bonusAnalyses
      const usersSnap = await getDocs(collection(db, "users"));
      const emailMap: Record<string, string> = {};
      const bonusMap: Record<string, number> = {};
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        emailMap[d.id] = data.email ?? d.id;
        bonusMap[d.id] = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
      });

      const entries: LeaderEntry[] = Object.entries(map)
        .filter(([, { curr }]) => curr.count > 0) // must have activity this month
        .map(([uid, { curr, prev }]) => {
          const currBand = curr.count > 0 ? Math.round((curr.total / curr.count) * 10) / 10 : null;
          const prevBand = prev.count > 0 ? Math.round((prev.total / prev.count) * 10) / 10 : null;
          const improvement = currBand !== null && prevBand !== null ? currBand - prevBand : currBand ?? 0;
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

      // Sort by improvement desc, top 10
      entries.sort((a, b) => b.improvement - a.improvement);
      setLeaderboard(entries.slice(0, 10));
    } catch (e) { console.error(e); }
    setLeaderLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && section === "leaderboard") loadLeaderboard();
  }, [isLoggedIn, section]);

  const loadAnnouncements = async () => {
    setAnnLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc")));
      setAnnouncements(snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, text: data.text ?? "", active: data.active ?? false, createdAt: data.createdAt?.toDate?.()?.toISOString?.() };
      }));
    } catch (e) { console.error(e); }
    setAnnLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && section === "announcements") loadAnnouncements();
  }, [isLoggedIn, section]);

  const addAnnouncement = async () => {
    if (!annText.trim()) return;
    setAnnSaving(true);
    try {
      await addDoc(collection(db, "announcements"), {
        text: annText.trim(),
        active: true,
        createdAt: new Date(),
      });
      setAnnText("");
      await loadAnnouncements();
    } catch (e) { console.error(e); }
    setAnnSaving(false);
  };

  const toggleAnnouncement = async (id: string, active: boolean) => {
    await updateDoc(doc(db, "announcements", id), { active: !active });
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, active: !a.active } : a));
  };

  const deleteAnnouncement = async (id: string) => {
    await deleteDoc(doc(db, "announcements", id));
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  };

  const grantBonus = async () => {
    const n = parseInt(bonusInput);
    if (!n || n < 1 || selectedUids.size === 0) return;
    setGrantLoading(true); setGrantMsg("");
    try {
      await Promise.all([...selectedUids].map(async (uid) => {
        const userRef = doc(db, "users", uid);
        const snap = await getDocs(query(collection(db, "users"), where("__name__", "==", uid)));
        const current = snap.docs[0]?.data()?.bonusAnalyses ?? 0;
        const msg = `🎁 Tabriklaymiz! Sizga ${n} ta bepul AI tahlil berildi. Inshoingizni yuboring va natijani ko'ring!`;
        await updateDoc(userRef, { bonusAnalyses: current + n, notification: msg });
        await addDoc(collection(db, "notifications", uid, "items"), {
          type: "bonus",
          fromUserName: "WriteReady",
          preview: msg,
          read: false,
          createdAt: new Date(),
        });
      }));
      setGrantMsg(`✓ ${selectedUids.size} ta foydalanuvchiga ${n} ta bepul tahlil berildi.`);
      setSelectedUids(new Set());
      await loadLeaderboard();
    } catch (e) { setGrantMsg("Xatolik: " + (e as Error).message); }
    setGrantLoading(false);
  };

  // ── Task 1 CRUD ──
  const addTask1 = async () => {
    if (!t1Image || !t1Report) { setT1Error("Image va Report bo'sh bo'lmasligi kerak!"); return; }
    setT1Loading(true); setT1Error("");
    try {
      const q = query(collection(db, "task1_reports"), where("report", "==", t1Report));
      if (!(await getDocs(q)).empty) { setT1Error("Bu report allaqachon kiritilgan!"); return; }
      const ref = await addDoc(collection(db, "task1_reports"), { image: t1Image, report: t1Report, createdAt: new Date() });
      setTask1List((p) => [{ id: ref.id, image: t1Image, report: t1Report }, ...p]);
      setT1Image(""); setT1Report("");
    } catch { setT1Error("Xatolik yuz berdi."); }
    finally { setT1Loading(false); }
  };

  const deleteTask1 = async (id: string) => {
    if (!confirm("Bu Task 1 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, "task1_reports", id));
    setTask1List((p) => p.filter((t) => t.id !== id));
  };

  const saveEditT1 = async () => {
    if (!editT1 || !editImage || !editReport) return;
    await updateDoc(doc(db, "task1_reports", editT1.id), { image: editImage, report: editReport });
    setTask1List((p) => p.map((t) => t.id === editT1.id ? { ...t, image: editImage, report: editReport } : t));
    setEditT1(null);
  };

  // ── Task 2 CRUD ──
  const addTask2 = async () => {
    if (!t2Report) { setT2Error("Report bo'sh bo'lmasligi kerak!"); return; }
    setT2Loading(true); setT2Error("");
    try {
      const q = query(collection(db, "task2_reports"), where("report", "==", t2Report));
      if (!(await getDocs(q)).empty) { setT2Error("Bu report allaqachon kiritilgan!"); return; }
      const ref = await addDoc(collection(db, "task2_reports"), { report: t2Report, createdAt: new Date() });
      setTask2List((p) => [{ id: ref.id, report: t2Report }, ...p]);
      setT2Report("");
    } catch { setT2Error("Xatolik yuz berdi."); }
    finally { setT2Loading(false); }
  };

  const deleteTask2 = async (id: string) => {
    if (!confirm("Bu Task 2 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, "task2_reports", id));
    setTask2List((p) => p.filter((t) => t.id !== id));
  };

  const saveEditT2 = async () => {
    if (!editT2 || !editT2Report) return;
    await updateDoc(doc(db, "task2_reports", editT2.id), { report: editT2Report });
    setTask2List((p) => p.map((t) => t.id === editT2.id ? { ...t, report: editT2Report } : t));
    setEditT2(null);
  };

  // ── User subscription ──
  const setSubscription = async (user: UserRow, type: "month" | "forever" | "free") => {
    setUserActionLoading(true); setUserError(""); setUserSuccess("");
    try {
      const updates =
        type === "forever" ? { subscription: "forever", plan: "forever" } :
        type === "month"   ? { subscription: nextMonthDate(), plan: "pro" } :
                             { subscription: "", plan: "free" };
      await updateDoc(doc(db, "users", user.id), updates);
      setAllUsers((p) => p.map((u) => u.id === user.id ? { ...u, ...updates } : u));
      if (selectedUser?.id === user.id) setSelectedUser((p) => p ? { ...p, ...updates } : null);
      setUserSuccess(
        type === "forever" ? "Lifetime access granted!" :
        type === "month"   ? `Pro extended until ${nextMonthDate()}` :
                             "Subscription revoked — user set to Free."
      );
    } catch { setUserError("Failed to update subscription."); }
    finally { setUserActionLoading(false); }
  };

  const signOut = () => {
    setIsLoggedIn(false);
    localStorage.removeItem("adminLoggedIn");
    localStorage.removeItem("adminUser");
  };

  if (!isLoggedIn) return <LoginScreen onLogin={(u) => { setAdminUser(u); setIsLoggedIn(true); }} />;

  const filteredT1 = task1List.filter((t) => t.report.toLowerCase().includes(task1Search.toLowerCase()));
  const filteredT2 = task2List.filter((t) => t.report.toLowerCase().includes(task2Search.toLowerCase()));
  const filteredUsers = allUsers.filter((u) =>
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );
  const proCount = allUsers.filter((u) => u.plan === "pro" || u.plan === "forever" || (u.subscription && u.subscription !== "" && new Date(u.subscription) > new Date())).length;
  const lifetimeCount = allUsers.filter((u) => u.subscription === "forever" || u.plan === "forever").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = allUsers.filter((u) => u.createdAt?.slice(0, 10) === todayStr).length;

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">

      {/* ── Sidebar ── */}
      <aside className="w-[220px] shrink-0 bg-[#0f172a] flex flex-col min-h-screen sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <img src={Logo} alt="WriteReady" className="h-8 object-contain" />
          <p className="text-[0.6rem] font-bold tracking-widest text-white/30 uppercase mt-2">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer ${
                section === item.id
                  ? "bg-white/10 text-white"
                  : "text-white/55 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
              {item.id === "users" && allUsers.length > 0 && (
                <span className="ml-auto text-[0.65rem] font-bold bg-white/10 text-white/60 rounded-full px-1.5 py-0.5">
                  {allUsers.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Bottom: user + signout */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#1C3A5E] border border-white/20 flex items-center justify-center text-white font-bold text-[0.7rem] shrink-0">
              {adminUser.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{adminUser}</p>
              <p className="text-[0.65rem] text-white/35">Administrator</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full text-left flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border-none cursor-pointer bg-transparent"
          >
            <span>↩</span> Sign out
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 min-w-0 p-7 overflow-y-auto">

        {/* ── DASHBOARD ── */}
        {section === "dashboard" && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-[#1C3A5E] mb-1">Overview</p>
              <h1 className="text-2xl font-bold text-slate-900 m-0">Dashboard</h1>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {[
                { label: "Task 1 prompts",      value: task1List.length,    color: "text-blue-700",    bg: "bg-blue-50",   border: "border-blue-100",   icon: "🖼️" },
                { label: "Task 2 prompts",      value: task2List.length,    color: "text-green-700",   bg: "bg-green-50",  border: "border-green-100",  icon: "✍️" },
                { label: "Jami foydalanuvchi",  value: allUsers.length || "—", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200",  icon: "👥" },
                { label: "Bugun qo'shildi",     value: todayCount || "—",   color: "text-purple-700",  bg: "bg-purple-50", border: "border-purple-100", icon: "🆕" },
                { label: "Pro obunachi",         value: proCount || "—",     color: "text-[#1C3A5E]",   bg: "bg-sky-50",   border: "border-sky-100",    icon: "⭐" },
                { label: "Lifetime a'zo",        value: lifetimeCount || "—",color: "text-amber-700",   bg: "bg-amber-50",  border: "border-amber-100",  icon: "♾️" },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-5`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">{s.icon}</span>
                    <p className={`text-xs font-semibold ${s.color}`}>{s.label}</p>
                  </div>
                  <p className={`font-mono text-3xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Quick Actions</p>
                <div className="flex flex-col gap-2">
                  {[
                    { label: "Add Task 1 prompt", section: "task1" as NavSection, color: "text-blue-700 border-blue-200 hover:bg-blue-50" },
                    { label: "Add Task 2 prompt", section: "task2" as NavSection, color: "text-green-700 border-green-200 hover:bg-green-50" },
                    { label: "Manage Users", section: "users" as NavSection, color: "text-purple-700 border-purple-200 hover:bg-purple-50" },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={() => setSection(a.section)}
                      className={`text-left px-4 py-2.5 rounded-lg border text-sm font-semibold transition-colors bg-white cursor-pointer ${a.color}`}
                    >
                      {a.label} →
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Recent Users</p>
                {allUsers.length === 0 ? (
                  <button onClick={loadUsers} className="text-sm text-purple-600 underline cursor-pointer bg-transparent border-none">Load users</button>
                ) : (
                  <div className="flex flex-col gap-2">
                    {allUsers.slice(0, 5).map((u) => {
                      const b = planBadge(u.plan, u.subscription);
                      return (
                        <div key={u.id} className="flex items-center justify-between gap-2">
                          <span className="text-sm text-slate-700 truncate">{u.email}</span>
                          <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TASK 1 ── */}
        {section === "task1" && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-blue-700 mb-1">Task 1</p>
              <h1 className="text-2xl font-bold text-slate-900 m-0">Rasm + savol qo'shish</h1>
            </div>

            {/* Add form */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
              <p className="text-sm font-bold text-slate-700">Yangi Task 1 qo'shish</p>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Rasm yuklash</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) { const url = await uploadImage(f); if (url) setT1Image(url); }
                  }}
                  className="block w-full text-sm text-gray-700"
                />
              </div>
              {uploading && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3.5 py-2.5 text-sm text-blue-700 flex items-center gap-2">
                  <Spinner color="#1d4ed8" /> Yuklanmoqda...
                </div>
              )}
              {t1Image && (
                <div className="rounded-xl overflow-hidden border border-slate-200 max-h-48">
                  <img src={t1Image} alt="preview" className="w-full h-48 object-cover" />
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Savol matni</label>
                <textarea
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none resize-y min-h-[100px] focus:border-blue-500 transition-colors"
                  placeholder="Task 1 savol matnini kiriting..."
                  value={t1Report}
                  onChange={(e) => setT1Report(e.target.value)}
                  rows={4}
                />
              </div>
              {t1Error && <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">{t1Error}</div>}
              <button
                className={`${t1Loading || uploading ? "bg-slate-400" : "bg-blue-700 hover:bg-blue-800"} text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors`}
                onClick={addTask1}
                disabled={t1Loading || uploading}
              >
                {t1Loading ? <><Spinner color="white" /> Saqlanmoqda...</> : "+ Qo'shish"}
              </button>
            </div>

            {/* List */}
            {task1List.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">Mavjud Task 1 promptlar ({task1List.length})</p>
                  <input
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-blue-500 transition-colors w-48"
                    placeholder="Qidirish..."
                    value={task1Search}
                    onChange={(e) => setTask1Search(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredT1.length === 0 ? (
                    <p className="text-sm text-slate-400 col-span-full py-6 text-center">Natija yo'q.</p>
                  ) : filteredT1.map((t) => (
                    <div key={t.id} className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
                      <div className="relative group">
                        <img src={t.image} alt="" className="w-full h-28 object-cover rounded-lg" />
                        <button
                          onClick={() => setPreviewImage(t.image)}
                          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 rounded-lg transition-all duration-150 border-none cursor-pointer"
                          title="To'liq ko'rish"
                        >
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                            </svg>
                            Kattalashtirish
                          </span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed m-0 line-clamp-3">{t.report}</p>
                      <div className="flex gap-2 mt-auto">
                        <button
                          className="w-8 h-7 bg-white text-slate-500 border border-slate-200 rounded-lg text-xs flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors shrink-0"
                          onClick={() => setPreviewImage(t.image)}
                          title="Preview"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        </button>
                        <button
                          className="flex-1 bg-white text-blue-700 border border-blue-200 rounded-lg py-1.5 text-xs font-semibold cursor-pointer hover:bg-blue-50 transition-colors"
                          onClick={() => { setEditT1(t); setEditImage(t.image); setEditReport(t.report); }}
                        >Edit</button>
                        <button
                          className="flex-1 bg-white text-red-500 border border-red-200 rounded-lg py-1.5 text-xs font-semibold cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={() => deleteTask1(t.id)}
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TASK 2 ── */}
        {section === "task2" && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-green-700 mb-1">Task 2</p>
              <h1 className="text-2xl font-bold text-slate-900 m-0">Savol qo'shish</h1>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
              <p className="text-sm font-bold text-slate-700">Yangi Task 2 qo'shish</p>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Savol matni</label>
                <textarea
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none resize-y min-h-[120px] focus:border-green-500 transition-colors"
                  placeholder="Task 2 savol matnini kiriting..."
                  value={t2Report}
                  onChange={(e) => setT2Report(e.target.value)}
                  rows={5}
                />
              </div>
              {t2Error && <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">{t2Error}</div>}
              <button
                className={`${t2Loading ? "bg-slate-400" : "bg-green-700 hover:bg-green-800"} text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 transition-colors`}
                onClick={addTask2}
                disabled={t2Loading}
              >
                {t2Loading ? <><Spinner color="white" /> Saqlanmoqda...</> : "+ Qo'shish"}
              </button>
            </div>

            {task2List.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-700">Mavjud Task 2 promptlar ({task2List.length})</p>
                  <input
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-green-500 transition-colors w-48"
                    placeholder="Qidirish..."
                    value={task2Search}
                    onChange={(e) => setTask2Search(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {filteredT2.length === 0 ? (
                    <p className="text-sm text-slate-400 py-6 text-center">Natija yo'q.</p>
                  ) : filteredT2.map((t) => (
                    <div key={t.id} className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex items-start justify-between gap-4">
                      <p className="text-sm text-slate-700 leading-relaxed m-0 flex-1">{t.report}</p>
                      <div className="flex gap-2 shrink-0">
                        <button
                          className="bg-white text-green-700 border border-green-200 rounded-lg py-1.5 px-3 text-xs font-semibold cursor-pointer hover:bg-green-50 transition-colors"
                          onClick={() => { setEditT2(t); setEditT2Report(t.report); }}
                        >Edit</button>
                        <button
                          className="bg-white text-red-500 border border-red-200 rounded-lg py-1.5 px-3 text-xs font-semibold cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={() => deleteTask2(t.id)}
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USERS ── */}
        {section === "users" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[0.7rem] font-bold tracking-widest uppercase text-purple-700 mb-1">Users</p>
                <h1 className="text-2xl font-bold text-slate-900 m-0">User Management</h1>
              </div>
              <button
                onClick={loadUsers}
                disabled={usersLoading}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                {usersLoading ? "Yuklanmoqda..." : "↻ Refresh"}
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total users", value: allUsers.length, color: "text-slate-700", bg: "bg-white" },
                { label: "Pro / Lifetime", value: proCount, color: "text-blue-700", bg: "bg-blue-50" },
                { label: "Lifetime only", value: lifetimeCount, color: "text-amber-700", bg: "bg-amber-50" },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl p-4`}>
                  <p className={`text-xs font-semibold ${s.color} mb-1`}>{s.label}</p>
                  <p className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {userSuccess && <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">{userSuccess}</div>}
            {userError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{userError}</div>}

            {/* Search */}
            <input
              className="w-full max-w-xs px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 outline-none focus:border-purple-500 transition-colors"
              placeholder="Email bo'yicha qidirish..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {usersLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                  <Spinner color="#94a3b8" /> Yuklanmoqda...
                </div>
              ) : allUsers.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">Hech qanday foydalanuvchi topilmadi.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Plan</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Subscription tugaydi</th>
                        <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Amallar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => {
                        const b = planBadge(u.plan, u.subscription);
                        const expiry = u.subscription === "forever" ? "Lifetime ♾️" : formatDate(u.subscription) ? `${formatDate(u.subscription)}` : "—";
                        const isExpired = u.subscription && u.subscription !== "forever" && new Date(u.subscription) < new Date();
                        return (
                          <tr
                            key={u.id}
                            className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedUser?.id === u.id ? "bg-purple-50" : ""}`}
                            onClick={() => { setSelectedUser(selectedUser?.id === u.id ? null : u); setUserSuccess(""); setUserError(""); }}
                          >
                            <td className="px-4 py-3 font-medium text-slate-800">{u.email}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[0.65rem] font-bold px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>
                            </td>
                            <td className={`px-4 py-3 text-sm ${isExpired ? "text-red-500" : "text-slate-600"}`}>{expiry}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-[0.7rem] text-slate-400">{selectedUser?.id === u.id ? "▲ yopish" : "▼ boshqarish"}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Inline actions for selected user */}
            {selectedUser && (
              <div className="bg-white rounded-xl border-2 border-purple-200 p-5 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {selectedUser.email.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{selectedUser.email}</p>
                    <p className="text-xs text-slate-500">
                      {selectedUser.subscription === "forever"
                        ? "Lifetime — never expires"
                        : formatDate(selectedUser.subscription)
                        ? `Expires: ${formatDate(selectedUser.subscription)}`
                        : "No active subscription"}
                    </p>
                  </div>
                  <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${planBadge(selectedUser.plan, selectedUser.subscription).cls}`}>
                    {planBadge(selectedUser.plan, selectedUser.subscription).label}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Subscription o'zgartirish</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => setSubscription(selectedUser, "month")}
                      disabled={userActionLoading}
                      className="bg-blue-700 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-blue-800 transition-colors disabled:opacity-50"
                    >
                      + 1 Month Pro
                    </button>
                    <button
                      onClick={() => setSubscription(selectedUser, "forever")}
                      disabled={userActionLoading}
                      className="bg-amber-600 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-amber-700 transition-colors disabled:opacity-50"
                    >
                      Lifetime Forever
                    </button>
                    <button
                      onClick={() => setSubscription(selectedUser, "free")}
                      disabled={userActionLoading}
                      className="bg-white text-red-500 border border-red-300 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Revoke to Free
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── LEADERBOARD ── */}
        {section === "leaderboard" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-[0.7rem] font-bold tracking-widest uppercase text-amber-600 mb-1">Gamification</p>
                <h1 className="text-2xl font-bold text-slate-900 m-0">Leaderboard — Top o'quvchilar</h1>
              </div>
              <button onClick={loadLeaderboard} disabled={leaderLoading}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                {leaderLoading ? "Yuklanmoqda..." : "↻ Yangilash"}
              </button>
            </div>

            {/* Grant panel */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col gap-4">
              <p className="text-sm font-bold text-amber-800">Tanlangan o'quvchilarga bepul tahlil berish</p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-amber-700">Bepul tahlil soni:</label>
                  <input
                    type="number" min="1" max="50"
                    value={bonusInput}
                    onChange={(e) => setBonusInput(e.target.value)}
                    className="w-20 px-3 py-1.5 border border-amber-300 rounded-lg text-sm font-mono text-slate-900 outline-none focus:border-amber-500 bg-white"
                  />
                </div>
                <button
                  onClick={grantBonus}
                  disabled={grantLoading || selectedUids.size === 0 || !bonusInput}
                  className="bg-amber-600 text-white border-none rounded-lg px-5 py-2 text-sm font-bold cursor-pointer hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {grantLoading ? "Berilmoqda..." : `🎁 ${selectedUids.size} ta o'quvchiga ber`}
                </button>
                {selectedUids.size > 0 && (
                  <button onClick={() => setSelectedUids(new Set())}
                    className="text-xs text-slate-500 underline bg-transparent border-none cursor-pointer">
                    Tanlovni bekor qilish
                  </button>
                )}
              </div>
              {grantMsg && (
                <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${grantMsg.startsWith("✓") ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-600"}`}>
                  {grantMsg}
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {leaderLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                  <Spinner color="#94a3b8" /> Yuklanmoqda...
                </div>
              ) : leaderboard.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">
                  Hali hech qanday AI tahlil yo'q.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">O'rin</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">Foydalanuvchi</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">O'tgan oy</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Bu oy</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">O'sish</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Bonus</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">Tanlash</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {leaderboard.map((entry, i) => {
                        const isTop3 = i < 3;
                        const rankIcon = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                        const checked = selectedUids.has(entry.uid);
                        const impColor = entry.improvement > 0 ? "text-emerald-600 bg-emerald-50 border-emerald-200" : entry.improvement < 0 ? "text-red-500 bg-red-50 border-red-200" : "text-slate-500 bg-slate-50 border-slate-200";
                        const impSign = entry.improvement > 0 ? "+" : "";
                        return (
                          <tr key={entry.uid} className={`transition-colors hover:bg-slate-50 ${isTop3 ? "bg-amber-50/40" : ""} ${checked ? "bg-amber-100/60" : ""}`}>
                            <td className="px-4 py-3 text-center">
                              {rankIcon
                                ? <span className="text-xl leading-none">{rankIcon}</span>
                                : <span className="font-mono text-xs text-slate-400">#{i + 1}</span>
                              }
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-medium text-slate-800">{entry.email}</span>
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-sm text-slate-500">
                              {entry.prevBand !== null ? entry.prevBand.toFixed(1) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center font-mono text-sm font-bold text-slate-800">
                              {entry.currBand !== null ? entry.currBand.toFixed(1) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block font-mono font-bold text-sm px-2.5 py-0.5 rounded-lg border ${impColor}`}>
                                {impSign}{entry.improvement.toFixed(1)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {entry.bonusAnalyses > 0 ? (
                                <span className="inline-block bg-green-50 text-green-700 border border-green-200 text-xs font-bold px-2 py-0.5 rounded-full">
                                  +{entry.bonusAnalyses}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setSelectedUids((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(entry.uid)) next.delete(entry.uid);
                                    else next.add(entry.uid);
                                    return next;
                                  });
                                }}
                                className="w-4 h-4 accent-amber-600 cursor-pointer"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANNOUNCEMENTS ── */}
        {section === "announcements" && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-blue-700 mb-1">Announcements</p>
              <h1 className="text-2xl font-bold text-slate-900 m-0">Elonlar boshqaruvi</h1>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
              <p className="text-sm font-semibold text-slate-700">Yangi elon qo'shish</p>
              <textarea
                className="w-full border border-slate-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                rows={3}
                placeholder="Elon matni (foydalanuvchilarga ko'rinadi)..."
                value={annText}
                onChange={(e) => setAnnText(e.target.value)}
              />
              <button
                disabled={annSaving || !annText.trim()}
                onClick={addAnnouncement}
                className="self-start px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {annSaving ? "Saqlanmoqda..." : "Elon qo'shish"}
              </button>
            </div>

            {annLoading ? (
              <div className="animate-pulse h-24 bg-slate-100 rounded-xl" />
            ) : announcements.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
                <p className="text-3xl mb-2">📢</p>
                <p className="text-sm text-slate-500">Hali hech qanday elon yo'q.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {announcements.map((a) => (
                  <div key={a.id} className={`bg-white rounded-xl border p-4 flex items-start gap-4 ${a.active ? 'border-blue-200' : 'border-slate-200 opacity-60'}`}>
                    <div className="flex-1">
                      <p className="text-sm text-slate-800 leading-snug">{a.text}</p>
                      {a.createdAt && (
                        <p className="text-xs text-slate-400 mt-1">{new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleAnnouncement(a.id, a.active)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${a.active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {a.active ? 'Faol' : 'Nofaol'}
                      </button>
                      <button
                        onClick={() => deleteAnnouncement(a.id)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        O'chirish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LEARNING CENTERS ── */}
        {section === "centers" && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-teal-700 mb-1">Learning Centers</p>
              <h1 className="text-2xl font-bold text-slate-900 m-0">O'quv markazlari</h1>
            </div>
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <p className="text-3xl mb-3">🏫</p>
              <p className="text-slate-600 font-semibold mb-1">Tez kunda</p>
              <p className="text-sm text-slate-400">Bu bo'lim hali ishlab chiqilmoqda.</p>
            </div>
          </div>
        )}

        {section === "blog" && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[0.7rem] font-bold tracking-widest uppercase text-blue-700 mb-1">Blog</p>
                <h1 className="text-2xl font-bold text-slate-900 m-0">Blog Posts</h1>
              </div>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
                onClick={() => setBlogEditor({
                  title: '', slug: '', excerpt: '', content: '', featuredImage: '',
                  category: 'Writing tips', tags: [], status: 'draft', author: 'WriteReady Team',
                  seo: { metaTitle: '', metaDescription: '', focusKeyword: '' },
                  viewCount: 0, likeCount: 0, commentCount: 0, publishedAt: null,
                })}
              >
                + New post
              </button>
            </div>

            {/* Editor panel */}
            {blogEditor !== null && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                <h2 className="text-lg font-bold text-slate-900">{blogEditor.id ? 'Edit Post' : 'New Post'}</h2>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Title</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.title ?? ''}
                      onChange={(e) => {
                        const title = e.target.value;
                        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                        setBlogEditor((p) => ({ ...p, title, slug }));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Slug</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.slug ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, slug: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Excerpt</label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 resize-none"
                    value={blogEditor.excerpt ?? ''}
                    onChange={(e) => setBlogEditor((p) => ({ ...p, excerpt: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Content (Markdown)</label>
                  <textarea
                    rows={12}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 resize-none font-mono"
                    value={blogEditor.content ?? ''}
                    onChange={(e) => setBlogEditor((p) => ({ ...p, content: e.target.value }))}
                  />
                </div>

                {/* AI Draft */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-2">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Generate with AI</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      placeholder="Enter topic…"
                      value={aiTopic}
                      onChange={(e) => setAiTopic(e.target.value)}
                    />
                    <button
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
                      disabled={aiDraftLoading || !aiTopic.trim()}
                      onClick={async () => {
                        setAiDraftLoading(true);
                        try {
                          const res = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              messages: [{
                                role: 'user',
                                content: `Write a 600-800 word blog post body for IELTS learners about: ${aiTopic}. Focus keyword: ${blogEditor.seo?.focusKeyword || aiTopic}. Write in markdown with clear headings (##), short paragraphs. Topic: ${blogEditor.title || aiTopic}`,
                              }],
                            }),
                          });
                          const json = await res.json() as { reply?: string };
                          const text = json.reply ?? '';
                          setBlogEditor((p) => ({ ...p, content: text }));
                        } catch (e) { console.error(e); }
                        setAiDraftLoading(false);
                      }}
                    >
                      {aiDraftLoading ? 'Generating…' : 'Generate'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Featured Image URL</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.featuredImage ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, featuredImage: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Author</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.author ?? 'WriteReady Team'}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, author: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Category</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
                      value={blogEditor.category ?? 'Writing tips'}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, category: e.target.value as BlogPost['category'] }))}
                    >
                      {['Writing tips', 'Vocabulary', 'Band score', 'Grammar', 'News'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Status</label>
                    <select
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500 bg-white"
                      value={blogEditor.status ?? 'draft'}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, status: e.target.value as BlogPost['status'] }))}
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                      <option value="scheduled">Scheduled</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">SEO Title</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.seo?.metaTitle ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: e.target.value, metaDescription: p?.seo?.metaDescription ?? '', focusKeyword: p?.seo?.focusKeyword ?? '' } }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Meta Description</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.seo?.metaDescription ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: p?.seo?.metaTitle ?? '', metaDescription: e.target.value, focusKeyword: p?.seo?.focusKeyword ?? '' } }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Focus Keyword</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.seo?.focusKeyword ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: p?.seo?.metaTitle ?? '', metaDescription: p?.seo?.metaDescription ?? '', focusKeyword: e.target.value } }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">CTA Text</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.ctaText ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, ctaText: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">CTA Link</label>
                    <input
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-500"
                      value={blogEditor.ctaLink ?? ''}
                      onChange={(e) => setBlogEditor((p) => ({ ...p, ctaLink: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                    disabled={blogSaving}
                    onClick={async () => {
                      if (!blogEditor) return;
                      setBlogSaving(true);
                      try {
                        const postData: Omit<BlogPost, 'id'> = {
                          title: blogEditor.title ?? '',
                          slug: blogEditor.slug ?? '',
                          excerpt: blogEditor.excerpt ?? '',
                          content: blogEditor.content ?? '',
                          featuredImage: blogEditor.featuredImage ?? '',
                          category: blogEditor.category ?? 'Writing tips',
                          tags: blogEditor.tags ?? [],
                          seo: blogEditor.seo ?? { metaTitle: '', metaDescription: '', focusKeyword: '' },
                          status: blogEditor.status ?? 'draft',
                          publishedAt: blogEditor.status === 'published' ? new Date() : null,
                          author: blogEditor.author ?? 'WriteReady Team',
                          ctaText: blogEditor.ctaText ?? '',
                          ctaLink: blogEditor.ctaLink ?? '',
                          viewCount: blogEditor.viewCount ?? 0,
                          likeCount: blogEditor.likeCount ?? 0,
                          commentCount: blogEditor.commentCount ?? 0,
                        };
                        if (blogEditor.id) {
                          await updateBlogPost(blogEditor.id, postData);
                        } else {
                          await saveBlogPost(postData);
                        }
                        setBlogEditor(null);
                        await loadBlogPosts();
                      } catch (e) { console.error(e); }
                      setBlogSaving(false);
                    }}
                  >
                    {blogSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="px-5 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                    onClick={() => setBlogEditor(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            {blogLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : blogPosts.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                <p className="text-3xl mb-3">📝</p>
                <p className="text-slate-600 font-semibold mb-1">No posts yet</p>
                <p className="text-sm text-slate-400">Click "New post" to create your first blog post.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Category</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">Views</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">Likes</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide">Comments</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blogPosts.map((p) => (
                      <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900 max-w-[220px] truncate">{p.title}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            p.status === 'published' ? 'bg-green-50 text-green-700' :
                            p.status === 'draft' ? 'bg-slate-100 text-slate-600' :
                            'bg-yellow-50 text-yellow-700'
                          }`}>{p.status}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.category}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.viewCount}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.likeCount}</td>
                        <td className="px-4 py-3 text-center text-slate-600">{p.commentCount}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.publishedAt}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              className="text-xs px-3 py-1 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
                              onClick={async () => {
                                // load full post for editing
                                const { getBlogPostById } = await import('../../firebase/blog');
                                const full = await getBlogPostById(p.id);
                                if (full) setBlogEditor(full);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-xs px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                              onClick={async () => {
                                if (!confirm('Delete this post?')) return;
                                await deleteBlogPost(p.id);
                                await loadBlogPosts();
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Image Preview Modal ── */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-3xl font-light bg-transparent border-none cursor-pointer leading-none"
            >×</button>
            <img
              src={previewImage}
              alt="Preview"
              className="w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* ── Edit Task 1 Modal ── */}
      {editT1 && (
        <Modal onClose={() => setEditT1(null)}>
          <h2 className="text-lg font-bold text-slate-900 m-0">Edit Task 1</h2>
          <img src={editImage} alt="" className="w-full h-36 object-cover rounded-lg" />
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Replace Image</label>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) { const url = await uploadImage(f); if (url) setEditImage(url); }
              }}
              className="text-sm text-slate-700"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Savol matni</label>
            <textarea
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none resize-y min-h-[100px] focus:border-blue-500 transition-colors"
              value={editReport}
              onChange={(e) => setEditReport(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-3">
            <button className="flex-1 bg-blue-700 text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-blue-800 transition-colors" onClick={saveEditT1}>Save</button>
            <button className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setEditT1(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Task 2 Modal ── */}
      {editT2 && (
        <Modal onClose={() => setEditT2(null)}>
          <h2 className="text-lg font-bold text-slate-900 m-0">Edit Task 2</h2>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Savol matni</label>
            <textarea
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none resize-y min-h-[120px] focus:border-green-500 transition-colors"
              value={editT2Report}
              onChange={(e) => setEditT2Report(e.target.value)}
              rows={6}
            />
          </div>
          <div className="flex gap-3">
            <button className="flex-1 bg-green-700 text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-green-800 transition-colors" onClick={saveEditT2}>Save</button>
            <button className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setEditT2(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: 12, height: 12,
      border: `2px solid ${color}`, borderTopColor: "transparent",
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[520px] p-7 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
