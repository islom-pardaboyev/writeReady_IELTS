import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, signInWithCustomToken, signOut } from "firebase/auth";
import { adminAuth, adminDb } from "@/firebase/adminConfig";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Download, Upload, LogOut, LayoutDashboard } from "lucide-react";
import {
  getHumanReviewsForTeacher,
  uploadTeacherFeedback,
  teacherEarningUZS,
} from "@/firebase/teachers";
import { buildReviewDocx, downloadBlob, fileToBase64 } from "@/lib/reviewDocx";
import type { HumanReview } from "@/types";
import Logo from "/logo.png";
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
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";

function TeacherSidebar({
  teacherName,
  signOut,
}: {
  teacherName: string;
  signOut: () => void;
}) {
  const { open } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <div className={open ? "px-2" : "flex justify-center"}>
          {open ? (
            <>
              <img src={Logo} alt="WriteReady" className="h-7 object-contain" />
              <p className="text-[0.6rem] font-bold tracking-widest text-white/30 uppercase mt-2">Teacher Portal</p>
              <p className="text-sm font-semibold text-white truncate mt-0.5">{teacherName}</p>
            </>
          ) : (
            <img src={Logo} alt="WriteReady" className="h-7 w-7 object-contain" />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive tooltip="Reviews">
                <LayoutDashboard size={18} className="shrink-0" />
                {open && <span>Reviews</span>}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <button
          onClick={signOut}
          title={!open ? "Sign out" : undefined}
          className={`w-full text-left flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border-none cursor-pointer bg-transparent ${!open ? "justify-center" : ""}`}
        >
          <LogOut size={16} className="shrink-0" />
          {open && "Sign out"}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function TeacherPortalPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [reviews, setReviews] = useState<HumanReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [busyReviewId, setBusyReviewId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"download" | "upload" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("teacherLoggedIn");
    const id = localStorage.getItem("teacherId");
    const name = localStorage.getItem("teacherName");
    if (saved !== "true" || !id) return;
    // Firebase Auth persists the signed-in session across reloads on its
    // own; wait for it to report a real user before trusting the localStorage
    // flag, so Firestore queries never race ahead of the restored session.
    const unsub = onAuthStateChanged(adminAuth, (fbUser) => {
      if (fbUser) {
        setIsLoggedIn(true);
        setTeacherId(id);
        setTeacherName(name ?? "Teacher");
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !teacherId) return;
    loadReviews(teacherId);
  }, [isLoggedIn, teacherId]);

  const loadReviews = async (id: string) => {
    setReviewsLoading(true);
    try {
      const data = await getHumanReviewsForTeacher(id, adminDb);
      setReviews(data);
    } catch (e) {
      console.error(e);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      // Credential check happens server-side (api/staff-login.ts) via the
      // Firebase Admin SDK, so the teacher's password never reaches the
      // browser — it then mints a custom token for this teacher's dedicated
      // Firebase account, giving us a real authenticated session for reading
      // assigned reviews.
      const res = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "teacher", login: login.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error ?? "Incorrect login or password.");
        return;
      }

      await signInWithCustomToken(adminAuth, data.customToken);

      localStorage.setItem("teacherLoggedIn", "true");
      localStorage.setItem("teacherId", data.teacherId);
      localStorage.setItem("teacherName", data.teacherName);
      setTeacherId(data.teacherId);
      setTeacherName(data.teacherName);
      setIsLoggedIn(true);
    } catch (err) {
      console.error(err);
      setLoginError("Something went wrong. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("teacherLoggedIn");
    localStorage.removeItem("teacherId");
    localStorage.removeItem("teacherName");
    await signOut(adminAuth).catch(() => {});
    setIsLoggedIn(false);
    setReviews([]);
  };

  const handleDownload = async (review: HumanReview) => {
    setActionError(null);
    setActionSuccess(null);
    setBusyReviewId(review.id);
    setBusyAction("download");
    try {
      const blob = await buildReviewDocx(review);
      downloadBlob(blob, `${review.studentName.replace(/\s+/g, "_")}_essay.docx`);
    } catch (err) {
      console.error(err);
      setActionError("Could not generate the Word file. Please try again.");
    } finally {
      setBusyReviewId(null);
      setBusyAction(null);
    }
  };

  const handleUpload = async (review: HumanReview, file: File) => {
    setActionError(null);
    setActionSuccess(null);
    setBusyReviewId(review.id);
    setBusyAction("upload");
    try {
      const base64 = await fileToBase64(file);
      await uploadTeacherFeedback(review.id, base64, file.name, adminDb);
      await loadReviews(teacherId);
      setActionSuccess(`Feedback uploaded for ${review.studentName} — ${file.name}`);
    } catch (err) {
      console.error(err);
      setActionError("Could not upload your feedback. Please try again.");
    } finally {
      setBusyReviewId(null);
      setBusyAction(null);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-emerald-50 mb-4">
            <GraduationCap className="w-6 h-6 text-emerald-600" />
          </div>
          <h1 className="text-lg font-semibold text-center text-slate-900 mb-1">Teacher Portal</h1>
          <p className="text-sm text-slate-500 text-center mb-6">Sign in to review assigned essays.</p>

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div>
              <Label htmlFor="tp-login">Login</Label>
              <Input id="tp-login" autoComplete="username" className="mt-1.5" value={login} onChange={(e) => setLogin(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="tp-password">Password</Label>
              <PasswordInput id="tp-password" autoComplete="current-password" className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {loginError && <p className="text-sm text-red-500">{loginError}</p>}
            <Button type="submit" disabled={loggingIn} className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white">
              {loggingIn ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const pendingCount = reviews.filter((r) => r.status === "pending").length;
  const checkedCount = reviews.filter((r) => r.status === "checked").length;

  // Earnings broken down by the month each review was checked
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const now = new Date();
  const thisMonthKey = monthKey(now);
  const lastMonthKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const earningsByMonth = new Map<string, { count: number; total: number }>();
  reviews
    .filter((r) => r.status === "checked" && r.checkedAt)
    .forEach((r) => {
      const key = monthKey(r.checkedAt!);
      const entry = earningsByMonth.get(key) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += teacherEarningUZS(r);
      earningsByMonth.set(key, entry);
    });

  const earningsRows = Array.from(earningsByMonth.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => b.month.localeCompare(a.month));

  const thisMonth = earningsByMonth.get(thisMonthKey) ?? { count: 0, total: 0 };
  const lastMonth = earningsByMonth.get(lastMonthKey) ?? { count: 0, total: 0 };
  const totalEarned = earningsRows.reduce((s, r) => s + r.total, 0);

  const monthLabel = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen bg-slate-50 font-sans">
        <TeacherSidebar teacherName={teacherName} signOut={handleLogout} />

        <SidebarInset>
          <header className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
            <SidebarTrigger />
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-semibold text-slate-800 leading-tight">Reviews</p>
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-5 py-8 w-full">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <div className="text-sm text-slate-500 mt-1">Unchecked reports</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-2xl font-bold text-emerald-600">{checkedCount}</div>
            <div className="text-sm text-slate-500 mt-1">Checked reports</div>
          </div>
        </div>

        {/* Earnings summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">This month</div>
            <div className="text-2xl font-bold text-emerald-600 font-mono">{thisMonth.total.toLocaleString()} <span className="text-sm font-semibold">UZS</span></div>
            <div className="text-xs text-slate-500 mt-1">{thisMonth.count} review{thisMonth.count === 1 ? "" : "s"} checked</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Last month</div>
            <div className="text-2xl font-bold text-slate-700 font-mono">{lastMonth.total.toLocaleString()} <span className="text-sm font-semibold">UZS</span></div>
            <div className="text-xs text-slate-500 mt-1">{lastMonth.count} review{lastMonth.count === 1 ? "" : "s"} checked</div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">All time</div>
            <div className="text-2xl font-bold text-slate-700 font-mono">{totalEarned.toLocaleString()} <span className="text-sm font-semibold">UZS</span></div>
            <div className="text-xs text-slate-500 mt-1">{checkedCount} review{checkedCount === 1 ? "" : "s"} total</div>
          </div>
        </div>

        {/* Earnings by month */}
        {earningsRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">Earnings by month</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th scope="col" className="px-5 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Month</th>
                    <th scope="col" className="px-5 py-2.5 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Reviews</th>
                    <th scope="col" className="px-5 py-2.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {earningsRows.map((row) => (
                    <tr key={row.month}>
                      <td className="px-5 py-3 font-medium text-slate-800">{monthLabel(row.month)}</td>
                      <td className="px-5 py-3 text-center text-slate-600">{row.count}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-emerald-700">{row.total.toLocaleString()} UZS</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {actionError && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2.5 mb-4" role="alert" aria-live="polite">{actionError}</div>
        )}
        {actionSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-2.5 mb-4" aria-live="polite">✓ {actionSuccess}</div>
        )}

        {reviewsLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-16">No essays assigned to you yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{r.studentName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {r.studentEmail} · {r.mode} · {[r.task1 && "Task 1", r.task2 && "Task 2"].filter(Boolean).join(" & ")} · {r.requestedAt.toLocaleDateString()}
                    </div>
                  </div>
                  <Badge variant={r.status === "checked" ? "info" : "warning"} className="shrink-0 uppercase tracking-wide">
                    {r.status === "checked" ? "Checked" : "Unchecked"}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyReviewId === r.id}
                    onClick={() => handleDownload(r)}
                  >
                    {busyReviewId === r.id && busyAction === "download" ? (
                      <span className="animate-spin w-3.5 h-3.5 mr-1.5 border-2 border-slate-400 border-t-transparent rounded-full" />
                    ) : (
                      <Download className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {busyReviewId === r.id && busyAction === "download" ? "Preparing…" : "Download essay (.docx)"}
                  </Button>

                  <label className={`inline-flex ${busyReviewId === r.id ? "pointer-events-none" : ""}`}>
                    <input
                      type="file"
                      accept=".docx"
                      className="sr-only peer"
                      disabled={busyReviewId === r.id}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(r, file);
                        e.target.value = "";
                      }}
                    />
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border cursor-pointer peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500 peer-focus-visible:ring-offset-1 ${
                        busyReviewId === r.id && busyAction === "upload"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      } ${busyReviewId === r.id ? "opacity-70 cursor-not-allowed" : ""}`}
                    >
                      {busyReviewId === r.id && busyAction === "upload" ? (
                        <span className="animate-spin w-3.5 h-3.5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      {busyReviewId === r.id && busyAction === "upload"
                        ? "Uploading…"
                        : r.status === "checked" ? "Replace feedback" : "Upload feedback"}
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
