import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  increment,
} from "firebase/firestore";
import { adminDb as db, adminAuth } from "@/firebase/adminConfig";
import { signInAnonymously, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import useUpload from "@/hooks/useUploadImage";
import Logo from "/logo.png";
import { getBlogPosts, saveBlogPost, updateBlogPost, deleteBlogPost } from "../../firebase/blog";
import type { BlogPost } from "../../types/blog";
import {
  getTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher as deleteTeacherDoc,
  getHumanReviewsForTeacher,
  compressImageToBase64,
} from "../../firebase/teachers";
import type { Teacher } from "../../types";
import { getFeatureFlag, setFeatureFlag, getHumanCheckPrice, setHumanCheckPrice } from "../../hooks/useFeatureFlag";
import { Badge } from "@/components/ui/badge";
import { RichEditor } from "@/components/ui/RichEditor";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";

interface Task1 { id: string; image: string; report: string; }
interface Task2 { id: string; report: string; }
interface UserRow {
  id: string;
  email: string;
  plan: string;
  subscription?: string;
  expiresAt?: string;
  createdAt?: string;
  balanceUZS?: number;
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

type NavSection = "dashboard" | "task1" | "task2" | "users" | "leaderboard" | "announcements" | "centers" | "teachers" | "blog";


function planBadge(plan: string, subscription?: string) {
  if (subscription === "forever" || plan === "forever")
    return { label: "Lifetime", cls: "bg-amber-50 text-amber-700 border border-amber-200" };
  if (plan === "premium")
    return { label: "Premium", cls: "bg-purple-50 text-purple-700 border border-purple-200" };
  if (plan === "standard")
    return { label: "Standard", cls: "bg-blue-50 text-blue-700 border border-blue-200" };
  if (plan === "basic")
    return { label: "Basic", cls: "bg-blue-50 text-blue-600 border border-blue-200" };
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
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = async () => {
    if (!login.trim() || !password.trim()) return;
    setLoading(true); setError("");

    const auth = adminAuth;
    const ADMIN_FB_EMAIL = "admin@writeready.internal";
    const CENTER_FB_PREFIX = "center_";

    // Check main admin credentials
    if (login.trim() === import.meta.env.VITE_LOGIN && password === import.meta.env.VITE_PASSWORD) {
      try {
        try {
          await signInWithEmailAndPassword(auth, ADMIN_FB_EMAIL, `ADMIN_${import.meta.env.VITE_PASSWORD}_internal`);
        } catch {
          await createUserWithEmailAndPassword(auth, ADMIN_FB_EMAIL, `ADMIN_${import.meta.env.VITE_PASSWORD}_internal`);
        }
        localStorage.setItem("adminLoggedIn", "true");
        localStorage.setItem("adminUser", login.trim());
        setLoading(false);
        onLogin(login.trim());
        return;
      } catch (e) { console.error(e); }
    }

    // Check if it's a learning center login
    try {
      // Need anonymous auth first to read Firestore
      try { await signInAnonymously(auth); } catch { /* already signed in */ }
      const snap = await getDocs(
        query(collection(db, "learningCenters"), where("login", "==", login.trim()))
      );
      if (!snap.empty) {
        const centerDoc = snap.docs[0];
        const data = centerDoc.data();
        if (data.password === password) {
          // Sign in as center admin with dedicated Firebase account
          const centerEmail = `${CENTER_FB_PREFIX}${centerDoc.id}@writeready.internal`;
          const centerFbPass = `CENTER_${centerDoc.id}_internal`;
          try {
            try {
              await signInWithEmailAndPassword(auth, centerEmail, centerFbPass);
            } catch {
              await createUserWithEmailAndPassword(auth, centerEmail, centerFbPass);
            }
          } catch { /* use anonymous if email fails */ }
          localStorage.setItem("centerAdminLoggedIn", "true");
          localStorage.setItem("centerAdminId", centerDoc.id);
          localStorage.setItem("centerAdminName", data.name ?? "Center");
          setLoading(false);
          navigate("/center-admin");
          return;
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
    setError("Login yoki parol noto'g'ri!");
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
            <Input
              className="border-slate-200 bg-white text-slate-900"
              placeholder="Login kiriting"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Parol</label>
            <PasswordInput
              className="border-slate-200 bg-white text-slate-900"
              placeholder="Parol kiriting"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">{error}</div>}
          <button
            disabled={loading}
            className="w-full bg-[#1C3A5E] text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-[#2d5a8e] transition-colors disabled:opacity-60"
            onClick={handle}
          >
            {loading ? "Tekshirilmoqda..." : "Kirish"}
          </button>

          <div className="flex items-center gap-3 pt-1">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-400">Boshqa panellar</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => navigate("/center-admin")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              🏫 Learning Center
            </button>
            <button
              type="button"
              onClick={() => navigate("/teacher-portal")}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              🎓 Teacher Portal
            </button>
          </div>
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
  { id: "teachers",       label: "Teachers",         icon: "🎓" },
  { id: "blog",           label: "Blog",             icon: "📝" },
];

// ── Admin sidebar inner (needs useSidebar) ───────────────────────
function AdminSidebar({
  section,
  setSection,
  adminUser,
  allUsers,
  signOut,
}: {
  section: NavSection;
  setSection: (s: NavSection) => void;
  adminUser: string;
  allUsers: UserRow[];
  signOut: () => void;
}) {
  const { open } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className={open ? "px-2" : "flex justify-center"}>
          {open ? (
            <>
              <img src={Logo} alt="WriteReady" className="h-8 object-contain" />
              <p className="text-[0.6rem] font-bold tracking-widest text-white/30 uppercase mt-2">Admin Panel</p>
            </>
          ) : (
            <img src={Logo} alt="WriteReady" className="h-7 w-7 object-contain" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  isActive={section === item.id}
                  onClick={() => setSection(item.id)}
                  tooltip={item.label}
                >
                  <span className="text-base leading-none shrink-0">{item.icon}</span>
                  {open && (
                    <>
                      <span>{item.label}</span>
                      {item.id === "users" && allUsers.length > 0 && (
                        <span className="ml-auto text-[0.65rem] font-bold bg-white/10 text-white/60 rounded-full px-1.5 py-0.5">
                          {allUsers.length}
                        </span>
                      )}
                    </>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {open && (
          <div className="flex items-center gap-2.5 px-2 mb-3">
            <Avatar className="w-8 h-8 shrink-0 border border-white/20">
              <AvatarFallback className="bg-[#1C3A5E] text-white text-[0.7rem]">
                {adminUser.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{adminUser}</p>
              <p className="text-[0.65rem] text-white/35">Administrator</p>
            </div>
          </div>
        )}
        <button
          onClick={signOut}
          title={!open ? "Sign out" : undefined}
          className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border-none cursor-pointer bg-transparent ${!open ? "justify-center" : ""}`}
        >
          <span>↩</span>
          {open && "Sign out"}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

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
  const [balanceInput, setBalanceInput] = useState("");

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
  type AnnCategory = 'announcement' | 'update' | 'maintenance' | 'tip' | 'offer';
  interface AnnouncementRow { id: string; title: string; text: string; category: AnnCategory; link: string; linkLabel: string; active: boolean; createdAt?: string; }
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annTitle, setAnnTitle] = useState("");
  const [annText, setAnnText] = useState("");
  const [annCategory, setAnnCategory] = useState<AnnCategory>("announcement");
  const [annLink, setAnnLink] = useState("");
  const [annLinkLabel, setAnnLinkLabel] = useState("");
  const [annSaving, setAnnSaving] = useState(false);

  // Centers
  interface CenterRow {
    id: string; name: string; contactPerson: string; phone: string;
    contractNumber: string; paymentAmount: number; studentLimit: number;
    login: string; password: string; expiresAt: string; status: string;
    studentCount?: number;
  }
  interface CenterStudent { id: string; fullName: string; login: string; addedAt?: string; }
  const [centers, setCenters] = useState<CenterRow[]>([]);
  const [centersLoading, setCentersLoading] = useState(false);
  const [centerEditor, setCenterEditor] = useState<Partial<CenterRow> | null>(null);
  const [centerSaving, setCenterSaving] = useState(false);
  const [viewCenter, setViewCenter] = useState<CenterRow | null>(null);
  const [centerStudents, setCenterStudents] = useState<CenterStudent[]>([]);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentLogin, setNewStudentLogin] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('');
  const [studentAdding, setStudentAdding] = useState(false);
  const [editCenterStudent, setEditCenterStudent] = useState<CenterStudent | null>(null);
  const [editCSName, setEditCSName] = useState('');
  const [editCSLogin, setEditCSLogin] = useState('');
  const [editCSPass, setEditCSPass] = useState('');
  const [savingCS, setSavingCS] = useState(false);

  // Teachers (Human Check)
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teacherEditor, setTeacherEditor] = useState<Partial<Teacher> | null>(null);
  const [teacherSaving, setTeacherSaving] = useState(false);
  const [teacherReviewCounts, setTeacherReviewCounts] = useState<Record<string, { pending: number; checked: number }>>({});
  const [humanCheckFlag, setHumanCheckFlag] = useState(false);
  const [humanCheckFlagLoading, setHumanCheckFlagLoading] = useState(false);
  const [humanCheckPriceInput, setHumanCheckPriceInput] = useState('');
  const [humanCheckPriceSaving, setHumanCheckPriceSaving] = useState(false);
  const [humanCheckPriceMsg, setHumanCheckPriceMsg] = useState('');
  const [teacherEarningsFor, setTeacherEarningsFor] = useState<Teacher | null>(null);
  const [teacherEarnings, setTeacherEarnings] = useState<{ month: string; count: number; total: number }[]>([]);
  const [teacherEarningsLoading, setTeacherEarningsLoading] = useState(false);

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
    if (saved === "true") {
      setIsLoggedIn(true);
      if (u) setAdminUser(u);
      // Re-authenticate adminAuth so Firestore queries work after page reload
      const ADMIN_FB_EMAIL = "admin@writeready.internal";
      signInWithEmailAndPassword(adminAuth, ADMIN_FB_EMAIL, `ADMIN_${import.meta.env.VITE_PASSWORD}_internal`).catch(() => {});
    }
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
      const rows: UserRow[] = snap.docs
        .filter((d) => !d.data().email?.endsWith('@writeready.internal'))
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            email: data.studentLogin ? `${data.studentLogin} (${data.centerName ?? 'student'})` : (data.email ?? ""),
            plan: data.plan ?? "free",
            subscription: data.subscription ?? "",
            expiresAt: data.expiresAt ?? "",
            createdAt: data.createdAt?.toDate?.()?.toISOString() ?? "",
            balanceUZS: typeof data.balanceUZS === "number" ? data.balanceUZS : 0,
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

      const map: Record<string, { curr: { total: number; count: number }; prev: { total: number; count: number } }> = {};

      repSnap.docs.forEach((d) => {
        const data = d.data();
        const uid = data.uid as string;
        if (!uid) return;
        const scores: Record<string, number> = data.scores ?? {};
        const vals = Object.values(scores).filter((v) => typeof v === "number") as number[];
        if (!vals.length) return;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

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

      const usersSnap = await getDocs(collection(db, "users"));
      const emailMap: Record<string, string> = {};
      const bonusMap: Record<string, number> = {};
      usersSnap.docs.forEach((d) => {
        const data = d.data();
        emailMap[d.id] = data.studentLogin ?? data.email ?? d.id;
        bonusMap[d.id] = typeof data.bonusAnalyses === "number" ? data.bonusAnalyses : 0;
      });

      const entries: LeaderEntry[] = Object.entries(map)
        .filter(([, { curr }]) => curr.count > 0)
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
        return { id: d.id, title: data.title ?? "", text: data.text ?? "", category: data.category ?? "announcement", link: data.link ?? "", linkLabel: data.linkLabel ?? "", active: data.active ?? false, createdAt: data.createdAt?.toDate?.()?.toISOString?.() };
      }));
    } catch (e) { console.error(e); }
    setAnnLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && section === "announcements") loadAnnouncements();
  }, [isLoggedIn, section]);

  const loadCenters = async () => {
    setCentersLoading(true);
    try {
      const snap = await getDocs(collection(db, 'learningCenters'));
      const rows: CenterRow[] = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const studSnap = await getDocs(collection(db, 'learningCenters', d.id, 'students'));
        return {
          id: d.id,
          name: data.name ?? '',
          contactPerson: data.contactPerson ?? '',
          phone: data.phone ?? '',
          contractNumber: data.contractNumber ?? '',
          paymentAmount: data.paymentAmount ?? 0,
          studentLimit: data.studentLimit ?? 30,
          login: data.login ?? '',
          password: data.password ?? '',
          expiresAt: data.expiresAt ?? '',
          status: data.expiresAt ? (new Date(data.expiresAt) > new Date() ? 'active' : 'expired') : 'pending',
          studentCount: studSnap.size,
        };
      }));
      setCenters(rows);
    } catch (e) { console.error(e); }
    setCentersLoading(false);
  };

  const loadCenterStudents = async (centerId: string) => {
    try {
      const snap = await getDocs(collection(db, 'learningCenters', centerId, 'students'));
      setCenterStudents(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: data.fullName ?? '',
          login: data.login ?? '',
          addedAt: data.addedAt?.toDate?.()?.toISOString?.() ?? '',
        };
      }));
    } catch (e) { console.error(e); }
  };

  const openEditCenterStudent = (s: CenterStudent) => {
    setEditCenterStudent(s); setEditCSName(s.fullName); setEditCSLogin(s.login); setEditCSPass('');
  };

  const saveEditCenterStudent = async () => {
    if (!editCenterStudent || !viewCenter || !editCSName.trim() || !editCSLogin.trim()) return;
    setSavingCS(true);
    try {
      if (editCSLogin.trim() !== editCenterStudent.login) {
        const ex = await getDocs(query(collection(db, 'learningCenters', viewCenter.id, 'students'), where('login', '==', editCSLogin.trim())));
        if (!ex.empty) { alert('Bu login allaqachon mavjud.'); setSavingCS(false); return; }
      }
      const updates: Record<string, string> = { fullName: editCSName.trim(), login: editCSLogin.trim() };
      if (editCSPass.trim()) updates.password = editCSPass.trim();
      await updateDoc(doc(db, 'learningCenters', viewCenter.id, 'students', editCenterStudent.id), updates);
      setCenterStudents((p) => p.map((s) => s.id === editCenterStudent.id ? { ...s, fullName: editCSName.trim(), login: editCSLogin.trim() } : s));
      setEditCenterStudent(null);
    } catch (e) { console.error(e); }
    setSavingCS(false);
  };

  const saveCenter = async () => {
    if (!centerEditor) return;
    if (!centerEditor.name || !centerEditor.login || !centerEditor.password || !centerEditor.expiresAt) {
      alert('Please fill required fields: name, login, password, expires at');
      return;
    }
    setCenterSaving(true);
    try {
      const payload = {
        name: centerEditor.name ?? '',
        contactPerson: centerEditor.contactPerson ?? '',
        phone: centerEditor.phone ?? '',
        contractNumber: centerEditor.contractNumber ?? '',
        paymentAmount: Number(centerEditor.paymentAmount) || 0,
        studentLimit: Number(centerEditor.studentLimit) || 30,
        login: centerEditor.login ?? '',
        password: centerEditor.password ?? '',
        expiresAt: centerEditor.expiresAt ?? '',
        // status is auto-calculated from expiresAt, not stored
      };
      if (centerEditor.id) {
        await updateDoc(doc(db, 'learningCenters', centerEditor.id), payload);
      } else {
        await addDoc(collection(db, 'learningCenters'), { ...payload, createdAt: new Date() });
      }
      setCenterEditor(null);
      await loadCenters();
    } catch (e) { console.error(e); }
    setCenterSaving(false);
  };

  const deleteCenter = async (id: string) => {
    if (!confirm('Bu o\'quv markazini o\'chirishni xohlaysizmi?')) return;
    await deleteDoc(doc(db, 'learningCenters', id));
    setCenters((prev) => prev.filter((c) => c.id !== id));
  };

  const loadTeachers = async () => {
    setTeachersLoading(true);
    try {
      const rows = await getTeachers(db);
      setTeachers(rows);
      const counts: Record<string, { pending: number; checked: number }> = {};
      await Promise.all(rows.map(async (t) => {
        const reviews = await getHumanReviewsForTeacher(t.id, db);
        counts[t.id] = {
          pending: reviews.filter((r) => r.status === 'pending').length,
          checked: reviews.filter((r) => r.status === 'checked').length,
        };
      }));
      setTeacherReviewCounts(counts);
    } catch (e) { console.error(e); }
    setTeachersLoading(false);
  };

  const loadHumanCheckFlag = async () => {
    setHumanCheckFlagLoading(true);
    try {
      setHumanCheckFlag(await getFeatureFlag('humanCheck'));
      setHumanCheckPriceInput(String(await getHumanCheckPrice()));
    } catch (e) { console.error(e); }
    setHumanCheckFlagLoading(false);
  };

  const toggleHumanCheckFlag = async () => {
    const next = !humanCheckFlag;
    setHumanCheckFlag(next);
    try {
      await setFeatureFlag('humanCheck', next);
    } catch (e) {
      console.error(e);
      setHumanCheckFlag(!next);
    }
  };

  const saveHumanCheckPrice = async () => {
    const price = Number(humanCheckPriceInput);
    if (!price || price <= 0) return;
    setHumanCheckPriceSaving(true);
    try {
      await setHumanCheckPrice(price);
      setHumanCheckPriceMsg('Saved.');
      setTimeout(() => setHumanCheckPriceMsg(''), 2000);
    } catch (e) {
      console.error(e);
      setHumanCheckPriceMsg('Failed to save.');
    }
    setHumanCheckPriceSaving(false);
  };

  const saveTeacher = async () => {
    if (!teacherEditor) return;
    if (!teacherEditor.name || !teacherEditor.login || !teacherEditor.password) {
      alert('Please fill required fields: name, login, password');
      return;
    }
    setTeacherSaving(true);
    try {
      const payload = {
        name: teacherEditor.name ?? '',
        photoBase64: teacherEditor.photoBase64,
        certificateBase64: teacherEditor.certificateBase64,
        ieltsOverall: Number(teacherEditor.ieltsOverall) || 0,
        ieltsWriting: Number(teacherEditor.ieltsWriting) || 0,
        login: teacherEditor.login ?? '',
        password: teacherEditor.password ?? '',
      };
      if (teacherEditor.id) {
        await updateTeacher(teacherEditor.id, payload, db);
      } else {
        await createTeacher(payload, db);
      }
      setTeacherEditor(null);
      await loadTeachers();
    } catch (e) { console.error(e); }
    setTeacherSaving(false);
  };

  const deleteTeacher = async (id: string) => {
    if (!confirm('Delete this teacher?')) return;
    await deleteTeacherDoc(id, db);
    setTeachers((prev) => prev.filter((t) => t.id !== id));
  };

  const loadTeacherEarnings = async (teacher: Teacher) => {
    setTeacherEarningsFor(teacher);
    setTeacherEarningsLoading(true);
    try {
      const reviews = await getHumanReviewsForTeacher(teacher.id, db);
      const byMonth = new Map<string, { count: number; total: number }>();
      reviews
        .filter((r) => r.status === 'checked' && r.checkedAt)
        .forEach((r) => {
          const key = r.checkedAt!.toISOString().slice(0, 7); // YYYY-MM
          const entry = byMonth.get(key) ?? { count: 0, total: 0 };
          entry.count += 1;
          entry.total += r.priceUZS ?? 0;
          byMonth.set(key, entry);
        });
      const rows = Array.from(byMonth.entries())
        .map(([month, { count, total }]) => ({ month, count, total }))
        .sort((a, b) => b.month.localeCompare(a.month));
      setTeacherEarnings(rows);
    } catch (e) {
      console.error(e);
      setTeacherEarnings([]);
    }
    setTeacherEarningsLoading(false);
  };

  const handleTeacherPhotoUpload = async (file: File, field: 'photoBase64' | 'certificateBase64') => {
    try {
      const base64 = await compressImageToBase64(file);
      setTeacherEditor((p) => ({ ...p, [field]: base64 }));
    } catch (e) { console.error(e); }
  };

  const addStudentToCenter = async () => {
    if (!viewCenter || !newStudentName.trim() || !newStudentLogin.trim() || !newStudentPassword.trim()) return;
    if ((viewCenter.studentCount ?? 0) >= viewCenter.studentLimit) {
      alert('Student limit reached for this center.');
      return;
    }
    setStudentAdding(true);
    try {
      // Check login uniqueness within center
      const existing = await getDocs(query(collection(db, 'learningCenters', viewCenter.id, 'students'), where('login', '==', newStudentLogin.trim())));
      if (!existing.empty) { alert('Bu login allaqachon mavjud.'); setStudentAdding(false); return; }
      await addDoc(collection(db, 'learningCenters', viewCenter.id, 'students'), {
        fullName: newStudentName.trim(),
        login: newStudentLogin.trim(),
        password: newStudentPassword.trim(),
        addedAt: new Date(),
      });
      setNewStudentName(''); setNewStudentLogin(''); setNewStudentPassword('');
      await loadCenterStudents(viewCenter.id);
      setViewCenter((prev) => prev ? { ...prev, studentCount: (prev.studentCount ?? 0) + 1 } : prev);
    } catch (e) { console.error(e); }
    setStudentAdding(false);
  };

  const removeStudentFromCenter = async (centerId: string, studentId: string) => {
    if (!confirm('Bu o\'quvchini o\'chirishni xohlaysizmi?')) return;
    await deleteDoc(doc(db, 'learningCenters', centerId, 'students', studentId));
    setCenterStudents((prev) => prev.filter((s) => s.id !== studentId));
    setViewCenter((prev) => prev ? { ...prev, studentCount: Math.max(0, (prev.studentCount ?? 1) - 1) } : prev);
  };

  useEffect(() => {
    if (isLoggedIn && section === 'centers' && centers.length === 0) loadCenters();
  }, [isLoggedIn, section]);

  useEffect(() => {
    if (isLoggedIn && section === 'teachers' && teachers.length === 0) loadTeachers();
    if (isLoggedIn && section === 'teachers') loadHumanCheckFlag();
  }, [isLoggedIn, section]);

  const addAnnouncement = async () => {
    if (!annTitle.trim() || !annText.trim()) return;
    setAnnSaving(true);
    try {
      await addDoc(collection(db, "announcements"), {
        title: annTitle.trim(),
        text: annText.trim(),
        category: annCategory,
        link: annLink.trim(),
        linkLabel: annLinkLabel.trim(),
        active: true,
        createdAt: new Date(),
      });
      setAnnTitle(""); setAnnText(""); setAnnCategory("announcement"); setAnnLink(""); setAnnLinkLabel("");
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
  const setSubscription = async (user: UserRow, type: "basic" | "standard" | "premium" | "forever" | "free") => {
    setUserActionLoading(true); setUserError(""); setUserSuccess("");
    try {
      const oneMonthLater = new Date();
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      const expiresAt = oneMonthLater.toISOString().slice(0, 10);

      const updates =
        type === "forever"  ? { plan: "forever", subscription: "forever", expiresAt: "" } :
        type === "premium"  ? { plan: "premium",  subscription: "",        expiresAt } :
        type === "standard" ? { plan: "standard", subscription: "",        expiresAt } :
        type === "basic"    ? { plan: "basic",    subscription: "",        expiresAt } :
                              { plan: "free",     subscription: "",        expiresAt: "" };
      await updateDoc(doc(db, "users", user.id), updates);
      setAllUsers((p) => p.map((u) => u.id === user.id ? { ...u, ...updates } : u));
      if (selectedUser?.id === user.id) setSelectedUser((p) => p ? { ...p, ...updates } : null);
      setUserSuccess(
        type === "forever"  ? "Lifetime access granted!" :
        type === "premium"  ? "Premium plan activated!" :
        type === "standard" ? "Standard plan activated!" :
        type === "basic"    ? "Basic plan activated!" :
                              "Plan revoked — user set to Free."
      );
    } catch { setUserError("Failed to update subscription."); }
    finally { setUserActionLoading(false); }
  };

  const addBalance = async (user: UserRow, amountUZS: number) => {
    if (!amountUZS || amountUZS <= 0) return;
    setUserActionLoading(true); setUserError(""); setUserSuccess("");
    try {
      await updateDoc(doc(db, "users", user.id), { balanceUZS: increment(amountUZS) });
      const newBalance = (user.balanceUZS ?? 0) + amountUZS;
      setAllUsers((p) => p.map((u) => u.id === user.id ? { ...u, balanceUZS: newBalance } : u));
      if (selectedUser?.id === user.id) setSelectedUser((p) => p ? { ...p, balanceUZS: newBalance } : null);
      setBalanceInput("");
      setUserSuccess(`+${amountUZS.toLocaleString()} UZS added — new balance: ${newBalance.toLocaleString()} UZS`);
    } catch { setUserError("Failed to add balance."); }
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
  const proCount = allUsers.filter((u) => u.plan === "basic" || u.plan === "standard" || u.plan === "premium" || u.plan === "forever").length;
  const lifetimeCount = allUsers.filter((u) => u.subscription === "forever" || u.plan === "forever").length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = allUsers.filter((u) => u.createdAt?.slice(0, 10) === todayStr).length;

  const currentNav = NAV.find((n) => n.id === section);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-50 font-sans">
        <AdminSidebar
          section={section}
          setSection={setSection}
          adminUser={adminUser}
          allUsers={allUsers}
          signOut={signOut}
        />

        <SidebarInset>
          {/* Header */}
          <header className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
            <SidebarTrigger />
            <div className="h-5 w-px bg-slate-200" />
            <div>
              <p className="text-xs font-bold tracking-widest uppercase text-slate-400">Admin Panel</p>
              <p className="text-sm font-semibold text-slate-800 leading-tight">{currentNav?.label ?? "Dashboard"}</p>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 p-7 overflow-y-auto">

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
                              <Badge variant={b.label === 'Lifetime' ? 'warning' : b.label === 'Pro' ? 'info' : 'outline'} className="text-[0.65rem]">{b.label}</Badge>
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
                    <Textarea
                      className="border-slate-200 bg-white text-slate-900 min-h-[100px]"
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
                      <Input
                        className="border-slate-200 bg-white text-slate-900 w-48 h-8 text-sm"
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
                    <Textarea
                      className="border-slate-200 bg-white text-slate-900 min-h-[120px]"
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
                      <Input
                        className="border-slate-200 bg-white text-slate-900 w-48 h-8 text-sm"
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
                <Input
                  className="border-slate-200 bg-white text-slate-900 max-w-xs"
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
                            <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Subscription tugaydi</th>
                            <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Amallar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredUsers.map((u) => {
                            const b = planBadge(u.plan, u.subscription);
                            const isLifetime = u.plan === "forever" || u.subscription === "forever";
                            const isPaid = ["basic","standard","premium"].includes(u.plan);
                            const isExpired = isPaid && !!u.expiresAt && new Date(u.expiresAt) < new Date();
                            const expiry = isLifetime ? "Lifetime ♾️" : isPaid && u.expiresAt ? (isExpired ? `Expired ${u.expiresAt}` : u.expiresAt) : "—";
                            return (
                              <tr
                                key={u.id}
                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedUser?.id === u.id ? "bg-purple-50" : ""}`}
                                onClick={() => { setSelectedUser(selectedUser?.id === u.id ? null : u); setUserSuccess(""); setUserError(""); }}
                              >
                                <td className="px-4 py-3 font-medium text-slate-800">{u.email}</td>
                                <td className="px-4 py-3">
                                  <Badge variant={b.label === 'Lifetime' ? 'warning' : b.label === 'Premium' ? 'purple' : b.label === 'Standard' || b.label === 'Basic' ? 'info' : 'secondary'} className="text-[0.65rem]">{b.label}</Badge>
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-sm text-emerald-700">{(u.balanceUZS ?? 0).toLocaleString()}</td>
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
                      <Avatar className="w-10 h-10 shrink-0">
                        <AvatarFallback className="bg-purple-600 text-white text-sm font-bold">{selectedUser.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{selectedUser.email}</p>
                        <p className="text-xs text-slate-500">
                          {selectedUser.plan === "forever" || selectedUser.subscription === "forever"
                            ? "Lifetime — never expires"
                            : ["basic", "standard", "premium"].includes(selectedUser.plan) && selectedUser.expiresAt
                            ? (new Date(selectedUser.expiresAt) < new Date()
                                ? `⚠️ Expired on ${selectedUser.expiresAt}`
                                : `Active ${selectedUser.plan} plan · expires ${selectedUser.expiresAt}`)
                            : "No active subscription"}
                        </p>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-mono">
                        {(selectedUser.balanceUZS ?? 0).toLocaleString()} UZS
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${planBadge(selectedUser.plan, selectedUser.subscription).cls}`}>
                        {planBadge(selectedUser.plan, selectedUser.subscription).label}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Balance qo'shish</p>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Input
                          type="number" min="1" placeholder="Summani kiriting (UZS)"
                          value={balanceInput}
                          onChange={(e) => setBalanceInput(e.target.value)}
                          className="w-48 h-9 border-slate-200 bg-white text-slate-900 font-mono text-sm"
                        />
                        <button
                          onClick={() => addBalance(selectedUser, Number(balanceInput))}
                          disabled={userActionLoading || !balanceInput || Number(balanceInput) <= 0}
                          className="bg-emerald-600 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-emerald-700 transition-colors disabled:opacity-50"
                        >
                          + Balance qo'shish
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Reja o'zgartirish</p>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setSubscription(selectedUser, "basic")}
                          disabled={userActionLoading}
                          className="bg-blue-500 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50"
                        >
                          Basic (39,000)
                        </button>
                        <button
                          onClick={() => setSubscription(selectedUser, "standard")}
                          disabled={userActionLoading}
                          className="bg-blue-700 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-blue-800 transition-colors disabled:opacity-50"
                        >
                          Standard (59,000)
                        </button>
                        <button
                          onClick={() => setSubscription(selectedUser, "premium")}
                          disabled={userActionLoading}
                          className="bg-purple-600 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-purple-700 transition-colors disabled:opacity-50"
                        >
                          Premium (89,000)
                        </button>
                        <button
                          onClick={() => setSubscription(selectedUser, "forever")}
                          disabled={userActionLoading}
                          className="bg-amber-600 text-white border-none rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          Lifetime ♾️
                        </button>
                        <button
                          onClick={() => setSubscription(selectedUser, "free")}
                          disabled={userActionLoading}
                          className="bg-white text-red-500 border border-red-300 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          Bepulga o'tish
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
                      <Input
                        type="number" min="1" max="50"
                        value={bonusInput}
                        onChange={(e) => setBonusInput(e.target.value)}
                        className="w-20 h-8 border-amber-300 bg-white text-slate-900 font-mono text-sm"
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

                {/* New announcement form */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-700">Yangi elon qo'shish</p>

                  {/* Category */}
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'announcement', label: '📢 Announcement', color: 'bg-blue-100 text-blue-700 border-blue-300' },
                      { id: 'update',       label: '🚀 Update',       color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                      { id: 'maintenance',  label: '🔧 Maintenance',  color: 'bg-amber-100 text-amber-700 border-amber-300' },
                      { id: 'tip',          label: '💡 Tip',          color: 'bg-purple-100 text-purple-700 border-purple-300' },
                      { id: 'offer',        label: '🎁 Offer',        color: 'bg-rose-100 text-rose-700 border-rose-300' },
                    ] as { id: AnnCategory; label: string; color: string }[]).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAnnCategory(c.id)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${annCategory === c.id ? c.color + ' ring-2 ring-offset-1 ring-current' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>

                  <Input
                    className="border-slate-200 bg-white text-slate-900"
                    placeholder="Sarlavha (katta, asosiy)..."
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                  />
                  <Textarea
                    className="border-slate-200 bg-white text-slate-900"
                    rows={3}
                    placeholder="Elon matni (tafsilotlar)..."
                    value={annText}
                    onChange={(e) => setAnnText(e.target.value)}
                  />

                  {/* Optional link */}
                  <div className="flex gap-2">
                    <Input
                      className="border-slate-200 bg-white text-slate-900 flex-1"
                      placeholder="Havola (ixtiyoriy): https://..."
                      value={annLink}
                      onChange={(e) => setAnnLink(e.target.value)}
                    />
                    <Input
                      className="border-slate-200 bg-white text-slate-900 w-36"
                      placeholder="Tugma matni"
                      value={annLinkLabel}
                      onChange={(e) => setAnnLinkLabel(e.target.value)}
                    />
                  </div>

                  <button
                    disabled={annSaving || !annTitle.trim() || !annText.trim()}
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
                    {announcements.map((a) => {
                      const catColors: Record<string, string> = {
                        announcement: 'bg-blue-600', update: 'bg-emerald-600',
                        maintenance: 'bg-amber-500', tip: 'bg-purple-600', offer: 'bg-rose-600',
                      };
                      const catIcons: Record<string, string> = {
                        announcement: '📢', update: '🚀', maintenance: '🔧', tip: '💡', offer: '🎁',
                      };
                      return (
                        <div key={a.id} className={`bg-white rounded-xl border overflow-hidden ${a.active ? 'border-blue-200' : 'border-slate-200 opacity-60'}`}>
                          <div className={`${catColors[a.category] ?? 'bg-blue-600'} px-4 py-1.5 flex items-center gap-2`}>
                            <span className="text-white text-xs font-bold tracking-widest uppercase">{catIcons[a.category]} {a.category}</span>
                          </div>
                          <div className="p-4 flex items-start gap-4">
                            <div className="flex-1">
                              {a.title && <p className="font-bold text-slate-900 mb-0.5">{a.title}</p>}
                              <p className="text-sm text-slate-600 leading-snug">{a.text}</p>
                              {a.link && <p className="text-xs text-blue-600 mt-1 truncate">{a.link}</p>}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── LEARNING CENTERS ── */}
            {section === "centers" && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-[0.7rem] font-bold tracking-widest uppercase text-teal-700 mb-1">B2B</p>
                    <h1 className="text-2xl font-bold text-slate-900 m-0">O'quv markazlari</h1>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={loadCenters} disabled={centersLoading}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                      {centersLoading ? 'Yuklanmoqda...' : '↻ Refresh'}
                    </button>
                    <button
                      onClick={() => setCenterEditor({ name: '', contactPerson: '', phone: '', contractNumber: '', paymentAmount: 0, studentLimit: 30, login: '', password: '', expiresAt: '', status: 'pending' })}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors cursor-pointer">
                      + Add Center
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Total Centers', value: centers.length, color: 'text-teal-700', bg: 'bg-teal-50' },
                    { label: 'Active Centers', value: centers.filter(c => c.status === 'active').length, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                    { label: 'Total Students', value: centers.reduce((sum, c) => sum + (c.studentCount ?? 0), 0), color: 'text-blue-700', bg: 'bg-blue-50' },
                  ].map((s) => (
                    <div key={s.label} className={`${s.bg} border border-slate-200 rounded-xl p-4`}>
                      <p className={`text-xs font-semibold ${s.color} mb-1`}>{s.label}</p>
                      <p className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {centersLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                    <Spinner color="#94a3b8" /> Yuklanmoqda...
                  </div>
                ) : centers.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                    <p className="text-3xl mb-3">🏫</p>
                    <p className="text-slate-600 font-semibold mb-1">Hali markazlar yo'q</p>
                    <p className="text-sm text-slate-400">Birinchi o'quv markazini qo'shing.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Center Name</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Students</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Expires</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Payment</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {centers.map((c) => (
                            <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                              <td className="px-4 py-3 text-slate-600">{c.contactPerson}</td>
                              <td className="px-4 py-3 text-slate-600 font-mono text-xs">{c.phone}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`font-mono text-sm font-bold ${(c.studentCount ?? 0) >= c.studentLimit ? 'text-red-600' : 'text-slate-700'}`}>
                                  {c.studentCount ?? 0}/{c.studentLimit}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={c.status === 'active' ? 'success' : c.status === 'expired' ? 'destructive' : 'warning'} className="text-xs capitalize">
                                  {c.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(c.expiresAt) ?? '—'}</td>
                              <td className="px-4 py-3 text-right font-mono text-sm text-slate-700">{c.paymentAmount.toLocaleString()} UZS</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => { setViewCenter(c); loadCenterStudents(c.id); }}
                                    className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">Students</button>
                                  <button onClick={() => setCenterEditor(c)}
                                    className="text-xs px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">Edit</button>
                                  <button onClick={() => deleteCenter(c.id)}
                                    className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">Del</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {/* Add/Edit Center Dialog */}
                <Dialog open={!!centerEditor} onOpenChange={(open) => { if (!open) setCenterEditor(null); }}>
                  <DialogContent className="bg-white max-w-[560px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-slate-900">{centerEditor?.id ? 'Edit Center' : 'Add Learning Center'}</DialogTitle>
                    </DialogHeader>
                    {centerEditor && (
                      <div className="flex flex-col gap-4 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Center Name *</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={centerEditor.name ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, name: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Contact Person</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={centerEditor.contactPerson ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, contactPerson: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Phone</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={centerEditor.phone ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, phone: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login Username *</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={centerEditor.login ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, login: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Password *</label>
                            <Input type="password" className="border-slate-200 bg-white text-slate-900" value={centerEditor.password ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, password: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Contract Number</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={centerEditor.contractNumber ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, contractNumber: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Payment (UZS)</label>
                            <Input type="number" className="border-slate-200 bg-white text-slate-900" value={centerEditor.paymentAmount ?? 0} onChange={(e) => setCenterEditor(p => ({ ...p, paymentAmount: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Student Limit</label>
                            <Input type="number" className="border-slate-200 bg-white text-slate-900" value={centerEditor.studentLimit ?? 30} onChange={(e) => setCenterEditor(p => ({ ...p, studentLimit: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Expires At *</label>
                            <Input type="date" className="border-slate-200 bg-white text-slate-900" value={centerEditor.expiresAt ?? ''} onChange={(e) => setCenterEditor(p => ({ ...p, expiresAt: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Status</label>
                            <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-500 bg-white text-slate-900"
                              value={centerEditor.status ?? 'pending'}
                              onChange={(e) => setCenterEditor(p => ({ ...p, status: e.target.value }))}>
                              <option value="active">Active</option>
                              <option value="pending">Pending</option>
                              <option value="expired">Expired</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button disabled={centerSaving} onClick={saveCenter}
                            className="flex-1 bg-teal-600 text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-teal-700 transition-colors disabled:opacity-50">
                            {centerSaving ? 'Saqlanmoqda...' : 'Save'}
                          </button>
                          <button onClick={() => setCenterEditor(null)}
                            className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
                {/* View Students Dialog */}
                <Dialog open={!!viewCenter} onOpenChange={(open) => { if (!open) { setViewCenter(null); setCenterStudents([]); } }}>
                  <DialogContent className="bg-white max-w-[640px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-slate-900">{viewCenter?.name} — Students</DialogTitle>
                    </DialogHeader>
                    {viewCenter && (
                      <div className="flex flex-col gap-4 mt-2">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">O'quvchi qo'shish</p>
                          <div className="grid grid-cols-3 gap-2">
                            <Input placeholder="Ism familiya" className="border-slate-200 bg-white text-slate-900" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} />
                            <Input placeholder="Login" className="border-slate-200 bg-white text-slate-900" value={newStudentLogin} onChange={(e) => setNewStudentLogin(e.target.value)} />
                            <Input placeholder="Parol" className="border-slate-200 bg-white text-slate-900" value={newStudentPassword} onChange={(e) => setNewStudentPassword(e.target.value)} />
                          </div>
                          <button disabled={studentAdding || !newStudentName.trim() || !newStudentLogin.trim() || !newStudentPassword.trim()} onClick={addStudentToCenter}
                            className="self-start px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 cursor-pointer">
                            {studentAdding ? "Qo'shilmoqda..." : '+ Add Student'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">{centerStudents.length} / {viewCenter.studentLimit} students used</p>
                        {centerStudents.length === 0 ? (
                          <div className="py-8 text-center text-slate-400 text-sm">No students yet.</div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ism</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Login</th>
                                  <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Qo'shildi</th>
                                  <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {centerStudents.map((s) => (
                                  <tr key={s.id} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-800">{s.fullName}</td>
                                    <td className="px-4 py-3 text-slate-600 text-xs font-mono">{s.login || '—'}</td>
                                    <td className="px-4 py-3 text-slate-400 text-xs">{s.addedAt ? new Date(s.addedAt).toLocaleDateString('en-GB') : '—'}</td>
                                    <td className="px-4 py-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button onClick={() => openEditCenterStudent(s)}
                                          className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
                                          Tahrir
                                        </button>
                                        <button onClick={() => removeStudentFromCenter(viewCenter.id, s.id)}
                                          className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">
                                          O'chirish
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
                  </DialogContent>
                </Dialog>
              {/* Edit student dialog */}
              <Dialog open={!!editCenterStudent} onOpenChange={(open) => { if (!open) setEditCenterStudent(null); }}>
                <DialogContent className="bg-white max-w-[440px]">
                  <DialogHeader>
                    <DialogTitle className="text-slate-900">O'quvchini tahrirlash</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 mt-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Ism Familiya</label>
                      <Input className="border-slate-200 bg-white text-slate-900" value={editCSName} onChange={(e) => setEditCSName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login</label>
                      <Input className="border-slate-200 bg-white text-slate-900" value={editCSLogin} onChange={(e) => setEditCSLogin(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Yangi Parol (ixtiyoriy)</label>
                      <Input type="password" placeholder="Bo'sh qoldirsa o'zgarmaydi" className="border-slate-200 bg-white text-slate-900" value={editCSPass} onChange={(e) => setEditCSPass(e.target.value)} />
                    </div>
                    <div className="flex gap-3">
                      <button disabled={savingCS || !editCSName.trim() || !editCSLogin.trim()} onClick={saveEditCenterStudent}
                        className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-50 border-none">
                        {savingCS ? "Saqlanmoqda..." : "Saqlash"}
                      </button>
                      <button onClick={() => setEditCenterStudent(null)}
                        className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                        Bekor
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            )}

            {/* ── TEACHERS (Human Check) ── */}
            {section === "teachers" && (
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-[0.7rem] font-bold tracking-widest uppercase text-emerald-700 mb-1">Human Check</p>
                    <h1 className="text-2xl font-bold text-slate-900 m-0">Teachers</h1>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={loadTeachers} disabled={teachersLoading}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
                      {teachersLoading ? 'Loading...' : '↻ Refresh'}
                    </button>
                    <button
                      onClick={() => setTeacherEditor({ name: '', ieltsOverall: 8, ieltsWriting: 8, login: '', password: '' })}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer">
                      + Add Teacher
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Human Check feature</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Controls whether the "Human Check" button is visible to students on the site. Turn this on once you've added
                      teachers and are ready to launch.
                    </p>
                  </div>
                  <button
                    onClick={toggleHumanCheckFlag}
                    disabled={humanCheckFlagLoading}
                    className={`shrink-0 relative w-12 h-7 rounded-full transition-colors cursor-pointer ${humanCheckFlag ? 'bg-emerald-600' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${humanCheckFlag ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Human Check price</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Deducted from a student's balance each time they submit a Human Check request.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number" min="1"
                      value={humanCheckPriceInput}
                      onChange={(e) => setHumanCheckPriceInput(e.target.value)}
                      className="w-32 h-9 border-slate-200 bg-white text-slate-900 font-mono text-sm"
                    />
                    <span className="text-xs text-slate-500">UZS</span>
                    <button
                      onClick={saveHumanCheckPrice}
                      disabled={humanCheckPriceSaving || !humanCheckPriceInput}
                      className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {humanCheckPriceSaving ? 'Saving...' : 'Save'}
                    </button>
                    {humanCheckPriceMsg && <span className="text-xs text-emerald-600">{humanCheckPriceMsg}</span>}
                  </div>
                </div>

                {teachersLoading ? (
                  <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                    <Spinner color="#94a3b8" /> Loading...
                  </div>
                ) : teachers.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                    <p className="text-3xl mb-3">🎓</p>
                    <p className="text-slate-600 font-semibold mb-1">No teachers yet</p>
                    <p className="text-sm text-slate-400">Add your first teacher to enable Human Check.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Teacher</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Overall</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Writing</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Unchecked</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Checked</th>
                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {teachers.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  {t.photoBase64 ? (
                                    <img src={t.photoBase64} alt={t.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                                      {t.name.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{t.name}</p>
                                    <p className="text-xs text-slate-400 font-mono truncate">{t.login}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-sm text-slate-700">{t.ieltsOverall.toFixed(1)}</td>
                              <td className="px-4 py-3 text-center font-mono text-sm text-slate-700">{t.ieltsWriting.toFixed(1)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-mono text-sm font-bold text-amber-600">{teacherReviewCounts[t.id]?.pending ?? 0}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-mono text-sm font-bold text-emerald-600">{teacherReviewCounts[t.id]?.checked ?? 0}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Badge variant={t.active ? 'success' : 'destructive'} className="text-xs capitalize">
                                  {t.active ? 'Active' : 'Inactive'}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button onClick={() => loadTeacherEarnings(t)}
                                    className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer">Earnings</button>
                                  <button onClick={() => setTeacherEditor(t)}
                                    className="text-xs px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer">Edit</button>
                                  <button onClick={() => deleteTeacher(t.id)}
                                    className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">Del</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Add/Edit Teacher Dialog */}
                <Dialog open={!!teacherEditor} onOpenChange={(open) => { if (!open) setTeacherEditor(null); }}>
                  <DialogContent className="bg-white max-w-[520px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-slate-900">{teacherEditor?.id ? 'Edit Teacher' : 'Add Teacher'}</DialogTitle>
                    </DialogHeader>
                    {teacherEditor && (
                      <div className="flex flex-col gap-4 mt-2">
                        <div>
                          <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Name *</label>
                          <Input className="border-slate-200 bg-white text-slate-900" value={teacherEditor.name ?? ''} onChange={(e) => setTeacherEditor((p) => ({ ...p, name: e.target.value }))} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">IELTS Overall</label>
                            <Input type="number" step="0.5" min="0" max="9" className="border-slate-200 bg-white text-slate-900" value={teacherEditor.ieltsOverall ?? 8} onChange={(e) => setTeacherEditor((p) => ({ ...p, ieltsOverall: Number(e.target.value) }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">IELTS Writing</label>
                            <Input type="number" step="0.5" min="0" max="9" className="border-slate-200 bg-white text-slate-900" value={teacherEditor.ieltsWriting ?? 8} onChange={(e) => setTeacherEditor((p) => ({ ...p, ieltsWriting: Number(e.target.value) }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login *</label>
                            <Input className="border-slate-200 bg-white text-slate-900" value={teacherEditor.login ?? ''} onChange={(e) => setTeacherEditor((p) => ({ ...p, login: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Password *</label>
                            <Input type="password" className="border-slate-200 bg-white text-slate-900" value={teacherEditor.password ?? ''} onChange={(e) => setTeacherEditor((p) => ({ ...p, password: e.target.value }))} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Photo</label>
                            {teacherEditor.photoBase64 && <img src={teacherEditor.photoBase64} alt="Photo" className="w-16 h-16 rounded-full object-cover mb-2" />}
                            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTeacherPhotoUpload(f, 'photoBase64'); }} className="text-xs" />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">IELTS Certificate</label>
                            {teacherEditor.certificateBase64 && <img src={teacherEditor.certificateBase64} alt="Certificate" className="w-16 h-16 rounded-lg object-cover mb-2" />}
                            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTeacherPhotoUpload(f, 'certificateBase64'); }} className="text-xs" />
                          </div>
                        </div>
                        {teacherEditor.id && (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={teacherEditor.active ?? true} onChange={(e) => setTeacherEditor((p) => ({ ...p, active: e.target.checked }))} />
                            Active (visible to students)
                          </label>
                        )}
                        <div className="flex gap-3 pt-2">
                          <button disabled={teacherSaving} onClick={saveTeacher}
                            className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-emerald-700 transition-colors disabled:opacity-50">
                            {teacherSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setTeacherEditor(null)}
                            className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Teacher Earnings Dialog */}
                <Dialog open={!!teacherEarningsFor} onOpenChange={(open) => { if (!open) { setTeacherEarningsFor(null); setTeacherEarnings([]); } }}>
                  <DialogContent className="bg-white max-w-[480px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-slate-900">{teacherEarningsFor?.name} — Earnings by month</DialogTitle>
                    </DialogHeader>
                    {teacherEarningsLoading ? (
                      <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                        <Spinner color="#94a3b8" /> Loading...
                      </div>
                    ) : teacherEarnings.length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-8">No checked reviews yet.</p>
                    ) : (
                      <div className="mt-2 rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Month</th>
                              <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Reviews</th>
                              <th className="px-4 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Earned</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {teacherEarnings.map((row) => (
                              <tr key={row.month}>
                                <td className="px-4 py-3 font-medium text-slate-800">{row.month}</td>
                                <td className="px-4 py-3 text-center text-slate-600">{row.count}</td>
                                <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700">{row.total.toLocaleString()} UZS</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td className="px-4 py-3 font-bold text-slate-800">Total</td>
                              <td className="px-4 py-3 text-center font-bold text-slate-800">{teacherEarnings.reduce((s, r) => s + r.count, 0)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{teacherEarnings.reduce((s, r) => s + r.total, 0).toLocaleString()} UZS</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {/* ── BLOG ── */}
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
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
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
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.slug ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, slug: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Excerpt</label>
                      <Textarea
                        rows={3}
                        className="border-slate-200 bg-white text-slate-900"
                        value={blogEditor.excerpt ?? ''}
                        onChange={(e) => setBlogEditor((p) => ({ ...p, excerpt: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Content</label>
                      <RichEditor
                        value={blogEditor.content ?? ''}
                        onChange={(html) => setBlogEditor((p) => ({ ...p, content: html }))}
                      />
                    </div>

                    {/* AI Draft */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Generate with AI</p>
                      <div className="flex gap-2">
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
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
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.featuredImage ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, featuredImage: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Author</label>
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
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
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.seo?.metaTitle ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: e.target.value, metaDescription: p?.seo?.metaDescription ?? '', focusKeyword: p?.seo?.focusKeyword ?? '' } }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Meta Description</label>
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.seo?.metaDescription ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: p?.seo?.metaTitle ?? '', metaDescription: e.target.value, focusKeyword: p?.seo?.focusKeyword ?? '' } }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Focus Keyword</label>
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.seo?.focusKeyword ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, seo: { ...p?.seo, metaTitle: p?.seo?.metaTitle ?? '', metaDescription: p?.seo?.metaDescription ?? '', focusKeyword: e.target.value } }))}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">CTA Text</label>
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
                          value={blogEditor.ctaText ?? ''}
                          onChange={(e) => setBlogEditor((p) => ({ ...p, ctaText: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">CTA Link</label>
                        <Input
                          className="border-slate-200 bg-white text-slate-900"
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
                            const wasPublished = postData.status === 'published';
                            const wasAlreadyPublished = blogEditor.id && blogEditor.status === 'published';
                            if (blogEditor.id) {
                              await updateBlogPost(blogEditor.id, postData);
                            } else {
                              await saveBlogPost(postData);
                            }
                            if (wasPublished && !wasAlreadyPublished) {
                              const usersSnap = await getDocs(collection(db, "users"));
                              const preview = `📝 Yangi maqola: "${postData.title}"`;
                              await Promise.all(usersSnap.docs.map((u) =>
                                addDoc(collection(db, "notifications", u.id, "items"), {
                                  type: "new_post",
                                  fromUserName: "WriteReady",
                                  postSlug: postData.slug,
                                  preview,
                                  read: false,
                                  createdAt: new Date(),
                                })
                              ));
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
                              <Badge variant={p.status === 'published' ? 'success' : p.status === 'draft' ? 'outline' : 'warning'} className="text-xs capitalize">{p.status}</Badge>
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
        </SidebarInset>

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

        {/* ── Edit Task 1 Dialog ── */}
        <Dialog open={!!editT1} onOpenChange={(open) => { if (!open) setEditT1(null); }}>
          <DialogContent className="bg-white max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Edit Task 1</DialogTitle>
            </DialogHeader>
            {editT1 && (
              <div className="flex flex-col gap-4">
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
                  <Textarea
                    className="border-slate-200 bg-white text-slate-900 min-h-[100px]"
                    value={editReport}
                    onChange={(e) => setEditReport(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 bg-blue-700 text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-blue-800 transition-colors" onClick={saveEditT1}>Save</button>
                  <button className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setEditT1(null)}>Cancel</button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit Task 2 Dialog ── */}
        <Dialog open={!!editT2} onOpenChange={(open) => { if (!open) setEditT2(null); }}>
          <DialogContent className="bg-white max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="text-slate-900">Edit Task 2</DialogTitle>
            </DialogHeader>
            {editT2 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Savol matni</label>
                  <Textarea
                    className="border-slate-200 bg-white text-slate-900 min-h-[120px]"
                    value={editT2Report}
                    onChange={(e) => setEditT2Report(e.target.value)}
                    rows={6}
                  />
                </div>
                <div className="flex gap-3">
                  <button className="flex-1 bg-green-700 text-white border-none rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-green-800 transition-colors" onClick={saveEditT2}>Save</button>
                  <button className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setEditT2(null)}>Cancel</button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </SidebarProvider>
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
