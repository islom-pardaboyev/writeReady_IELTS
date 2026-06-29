import { useState, useEffect } from "react";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/firebase";
import Logo from "/logo.png";

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[480px] p-7 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 bg-white outline-none focus:border-blue-400 transition-colors ${props.className ?? ''}`} />;
}

interface CenterData {
  id: string;
  name: string;
  studentLimit: number;
  expiresAt: string;
  status: string;
  paymentAmount: number;
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

type Section = "dashboard" | "students" | "analytics";

function nameColor(name: string): string {
  const colors = [
    "bg-rose-500", "bg-orange-500", "bg-amber-500", "bg-lime-600",
    "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-blue-500",
    "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block", width: 14, height: 14,
      border: "2px solid #94a3b8", borderTopColor: "transparent",
      borderRadius: "50%", animation: "ca-spin 0.7s linear infinite", flexShrink: 0,
    }} />
  );
}

// ── Login ────────────────────────────────────────────────────────────────────
function CenterLoginScreen({ onLogin }: { onLogin: (id: string, name: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!username.trim() || !password.trim()) { setError("Please enter username and password."); return; }
    setLoading(true); setError("");
    try {
      const snap = await getDocs(
        query(collection(db, "learningCenters"), where("login", "==", username.trim()))
      );
      if (snap.empty) { setError("Center not found."); setLoading(false); return; }
      const centerDoc = snap.docs[0];
      const data = centerDoc.data();
      if (data.password !== password) { setError("Incorrect password."); setLoading(false); return; }
      localStorage.setItem("centerAdminLoggedIn", "true");
      localStorage.setItem("centerAdminId", centerDoc.id);
      localStorage.setItem("centerAdminName", data.name ?? "Center");
      onLogin(centerDoc.id, data.name ?? "Center");
    } catch (e) {
      console.error(e);
      setError("Connection error. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="w-full max-w-[400px]">
        <div className="bg-[#0f172a] rounded-t-2xl px-8 py-10 text-center text-white">
          <img width={120} className="mx-auto mb-4" src={Logo} alt="WriteReady" />
          <p className="text-[0.7rem] font-bold tracking-widest uppercase text-white/40 mb-1">Learning Center</p>
          <h1 className="text-2xl font-bold m-0">Center Portal</h1>
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-7 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Username</label>
            <StyledInput
              placeholder="Center username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">Password</label>
            <StyledInput
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handle()}
            />
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">{error}</div>}
          <button
            className="w-full bg-[#1C3A5E] text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-[#2d5a8e] transition-colors disabled:opacity-50 border-none"
            onClick={handle}
            disabled={loading}
          >
            {loading ? "Checking..." : "Sign In"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function CenterAdminPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [centerId, setCenterId] = useState("");
  const [centerName, setCenterName] = useState("");
  const [section, setSection] = useState<Section>("dashboard");

  // Center info
  const [centerData, setCenterData] = useState<CenterData | null>(null);

  // Students
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLogin, setNewLogin] = useState("");
  const [newPass, setNewPass] = useState("");
  const [addingStudent, setAddingStudent] = useState(false);

  // Edit student
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [editName, setEditName] = useState("");
  const [editLogin, setEditLogin] = useState("");
  const [editPass, setEditPass] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Analytics
  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Dashboard stats
  const [reportsToday, setReportsToday] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("centerAdminLoggedIn");
    const id = localStorage.getItem("centerAdminId");
    const name = localStorage.getItem("centerAdminName");
    if (saved === "true" && id) {
      setIsLoggedIn(true);
      setCenterId(id);
      setCenterName(name ?? "Center");
    }
  }, []);

  const loadCenterData = async (id: string) => {
    try {
      const snap = await getDocs(query(collection(db, "learningCenters"), where("__name__", "==", id)));
      if (!snap.empty) {
        const d = snap.docs[0].data();
        setCenterData({
          id: snap.docs[0].id,
          name: d.name ?? "",
          studentLimit: d.studentLimit ?? 30,
          expiresAt: d.expiresAt ?? "",
          status: d.expiresAt ? (new Date(d.expiresAt) > new Date() ? "active" : "expired") : "pending",
          paymentAmount: d.paymentAmount ?? 0,
        });
      }
    } catch (e) { console.error(e); }
  };

  const loadStudents = async (id: string) => {
    setStudentsLoading(true);
    try {
      const snap = await getDocs(collection(db, "learningCenters", id, "students"));
      const rows: Student[] = snap.docs.map((d) => ({
        id: d.id,
        fullName: d.data().fullName ?? "",
        login: d.data().login ?? "",
        addedAt: d.data().addedAt?.toDate?.()?.toISOString?.() ?? "",
      }));
      setStudents(rows);
    } catch (e) { console.error(e); }
    setStudentsLoading(false);
  };

  const loadReportsToday = async (studentList: Student[]) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const snap = await getDocs(collection(db, "feedback_reports"));
      const studentLogins = new Set(studentList.map((s) => s.login).filter(Boolean));
      const usersSnap = await getDocs(collection(db, "users"));
      const studentUids = new Set<string>();
      usersSnap.docs.forEach((d) => {
        const sLogin = d.data().studentLogin;
        if (sLogin && studentLogins.has(sLogin)) studentUids.add(d.id);
      });
      let count = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!studentUids.has(data.uid)) return;
        const ts = data.createdAt?.toDate?.() as Date | undefined;
        if (ts && ts >= todayStart) count++;
      });
      setReportsToday(count);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (isLoggedIn && centerId) {
      loadCenterData(centerId);
      loadStudents(centerId).then(() => {});
    }
  }, [isLoggedIn, centerId]);

  useEffect(() => {
    if (students.length > 0) {
      loadReportsToday(students);
    }
  }, [students]);

  useEffect(() => {
    if (isLoggedIn && section === "analytics" && centerId) {
      loadAnalytics();
    }
  }, [isLoggedIn, section, centerId]);

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const studSnap = await getDocs(collection(db, "learningCenters", centerId, "students"));
      const studs: Student[] = studSnap.docs.map((d) => ({
        id: d.id,
        fullName: d.data().fullName ?? "",
        login: d.data().login ?? "",
        addedAt: d.data().addedAt?.toDate?.()?.toISOString?.() ?? "",
      }));

      // Get uid for each student login
      const usersSnap = await getDocs(collection(db, "users"));
      const loginToUid: Record<string, string> = {};
      usersSnap.docs.forEach((d) => {
        const sLogin = d.data().studentLogin;
        if (sLogin) loginToUid[sLogin] = d.id;
      });

      const reportsSnap = await getDocs(collection(db, "feedback_reports"));

      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const result: StudentAnalytics[] = studs.map((s) => {
        const uid = loginToUid[s.login];
        if (!uid) return { student: s, avgBand: null, reportCount: 0, lastActive: null, monthlyCount: 0 };

        const myReports = reportsSnap.docs.filter((d) => d.data().uid === uid);
        let totalBand = 0; let bandCount = 0; let lastTs: Date | null = null; let monthlyCount = 0;

        myReports.forEach((d) => {
          const data = d.data();
          const scores: Record<string, number> = data.scores ?? {};
          const vals = Object.values(scores).filter((v) => typeof v === "number") as number[];
          if (vals.length) { totalBand += vals.reduce((a, b) => a + b, 0) / vals.length; bandCount++; }
          const ts = data.createdAt?.toDate?.() as Date | undefined;
          if (ts) {
            if (!lastTs || ts > lastTs) lastTs = ts;
            const rKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}`;
            if (rKey === monthKey) monthlyCount++;
          }
        });

        return {
          student: s,
          avgBand: bandCount > 0 ? Math.round((totalBand / bandCount) * 10) / 10 : null,
          reportCount: myReports.length,
          lastActive: lastTs ? (lastTs as Date).toISOString() : null,
          monthlyCount,
        };
      });

      result.sort((a, b) => (b.avgBand ?? 0) - (a.avgBand ?? 0));
      setAnalytics(result);
    } catch (e) { console.error(e); }
    setAnalyticsLoading(false);
  };

  const addStudent = async () => {
    if (!newName.trim() || !newLogin.trim() || !newPass.trim()) return;
    if (students.length >= (centerData?.studentLimit ?? 30)) {
      alert("Student limit reached.");
      return;
    }
    setAddingStudent(true);
    try {
      // Check login uniqueness
      const existing = await getDocs(query(collection(db, "learningCenters", centerId, "students"), where("login", "==", newLogin.trim())));
      if (!existing.empty) { alert("Bu login allaqachon mavjud."); setAddingStudent(false); return; }
      await addDoc(collection(db, "learningCenters", centerId, "students"), {
        fullName: newName.trim(),
        login: newLogin.trim(),
        password: newPass.trim(),
        addedAt: new Date(),
      });
      setNewName(""); setNewLogin(""); setNewPass(""); setAddDialog(false);
      await loadStudents(centerId);
    } catch (e) { console.error(e); }
    setAddingStudent(false);
  };

  const removeStudent = async (studentId: string) => {
    if (!confirm("Bu o'quvchini o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, "learningCenters", centerId, "students", studentId));
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const openEditStudent = (s: Student) => {
    setEditStudent(s);
    setEditName(s.fullName);
    setEditLogin(s.login);
    setEditPass("");
  };

  const saveEditStudent = async () => {
    if (!editStudent || !editName.trim() || !editLogin.trim()) return;
    setSavingEdit(true);
    try {
      if (editLogin.trim() !== editStudent.login) {
        const existing = await getDocs(query(collection(db, "learningCenters", centerId, "students"), where("login", "==", editLogin.trim())));
        if (!existing.empty) { alert("Bu login allaqachon mavjud."); setSavingEdit(false); return; }
      }
      const updates: Record<string, string> = { fullName: editName.trim(), login: editLogin.trim() };
      if (editPass.trim()) updates.password = editPass.trim();
      await updateDoc(doc(db, "learningCenters", centerId, "students", editStudent.id), updates);
      setStudents((prev) => prev.map((s) => s.id === editStudent.id ? { ...s, fullName: editName.trim(), login: editLogin.trim() } : s));
      setEditStudent(null);
    } catch (e) { console.error(e); }
    setSavingEdit(false);
  };

  const signOut = () => {
    setIsLoggedIn(false);
    localStorage.removeItem("centerAdminLoggedIn");
    localStorage.removeItem("centerAdminId");
    localStorage.removeItem("centerAdminName");
  };

  const onLogin = (id: string, name: string) => {
    setCenterId(id); setCenterName(name); setIsLoggedIn(true);
  };

  if (!isLoggedIn) return <CenterLoginScreen onLogin={onLogin} />;

  const NAV: { id: Section; label: string; icon: string }[] = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "students", label: "Students", icon: "👥" },
    { id: "analytics", label: "Analytics", icon: "📈" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <style>{`@keyframes ca-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Sidebar */}
      <aside className="w-56 bg-[#0f172a] flex flex-col shrink-0 min-h-screen">
        <div className="px-5 py-6 border-b border-white/10">
          <img src={Logo} alt="WriteReady" className="h-7 object-contain mb-3" />
          <p className="text-[0.6rem] font-bold tracking-widest text-white/30 uppercase">Center Portal</p>
          <p className="text-sm font-semibold text-white truncate mt-0.5">{centerName}</p>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer
                ${section === item.id
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/8 hover:text-white bg-transparent"}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={signOut}
            className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors border-none cursor-pointer bg-transparent"
          >
            <span>↩</span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400">{centerName}</p>
          <p className="text-lg font-bold text-slate-800 leading-tight">{NAV.find(n => n.id === section)?.label}</p>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">

          {/* ── DASHBOARD ── */}
          {section === "dashboard" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Students", value: students.length, icon: "👥", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-100" },
                  { label: "Student Limit", value: `${students.length}/${centerData?.studentLimit ?? 30}`, icon: "🎯", color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" },
                  { label: "Reports Today", value: reportsToday, icon: "📝", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-100" },
                  { label: "Expires", value: formatDate(centerData?.expiresAt), icon: "📅", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-100" },
                ].map((s) => (
                  <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-5`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{s.icon}</span>
                      <p className={`text-xs font-semibold ${s.color}`}>{s.label}</p>
                    </div>
                    <p className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Payment status */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-700 mb-1">Subscription Status</p>
                  <p className="text-xs text-slate-500">Contract expires: {formatDate(centerData?.expiresAt)}</p>
                </div>
                <span className={`capitalize text-sm px-3 py-1 rounded-full font-semibold ${centerData?.status === 'active' ? 'bg-emerald-100 text-emerald-700' : centerData?.status === 'expired' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}`}>
                  {centerData?.status ?? "—"}
                </span>
              </div>
            </div>
          )}

          {/* ── STUDENTS ── */}
          {section === "students" && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">{students.length} / {centerData?.studentLimit ?? 30} students enrolled</p>
                <button
                  onClick={() => setAddDialog(true)}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none">
                  + Add Student
                </button>
              </div>

              {studentsLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-slate-400 text-sm"><Spinner /> Loading...</div>
              ) : students.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                  <p className="text-3xl mb-2">👥</p>
                  <p className="text-slate-500 font-semibold">No students yet</p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Ism</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Login</th>
                        <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Qo'shildi</th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Amal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-full ${nameColor(s.fullName)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                {initials(s.fullName)}
                              </div>
                              <span className="font-medium text-slate-800">{s.fullName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs font-mono">{(s as unknown as Record<string,unknown>).login as string ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(s.addedAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditStudent(s)}
                                className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
                                Tahrir
                              </button>
                              <button
                                onClick={() => removeStudent(s.id)}
                                className="text-xs px-2.5 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors cursor-pointer">
                                O'chir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit student modal */}
              {editStudent && (
                <Modal onClose={() => setEditStudent(null)}>
                  <h2 className="text-lg font-bold text-slate-900 m-0">O'quvchini tahrirlash</h2>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Ism Familiya</label>
                    <StyledInput value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login</label>
                    <StyledInput value={editLogin} onChange={(e) => setEditLogin(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Yangi Parol (ixtiyoriy)</label>
                    <StyledInput type="password" placeholder="Bo'sh qoldirsa o'zgarmaydi" value={editPass} onChange={(e) => setEditPass(e.target.value)} />
                  </div>
                  <div className="flex gap-3">
                    <button disabled={savingEdit || !editName.trim() || !editLogin.trim()} onClick={saveEditStudent}
                      className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-50 border-none">
                      {savingEdit ? "Saqlanmoqda..." : "Saqlash"}
                    </button>
                    <button onClick={() => setEditStudent(null)}
                      className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                      Bekor
                    </button>
                  </div>
                </Modal>
              )}

              {/* Add student modal */}
              {addDialog && (
                <Modal onClose={() => { setAddDialog(false); setNewName(""); setNewLogin(""); setNewPass(""); }}>
                  <h2 className="text-lg font-bold text-slate-900 m-0">O'quvchi qo'shish</h2>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Ism Familiya</label>
                    <StyledInput placeholder="Ali Valiyev" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login</label>
                    <StyledInput placeholder="ali_valiyev" value={newLogin} onChange={(e) => setNewLogin(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Parol</label>
                    <StyledInput placeholder="Kamida 6 ta belgi" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                  </div>
                  <p className="text-xs text-slate-400">Bu login va parolni o'quvchi saytga kirish uchun ishlatadi.</p>
                  <div className="flex gap-3">
                    <button disabled={addingStudent || !newName.trim() || !newLogin.trim() || !newPass.trim()} onClick={addStudent}
                      className="flex-1 bg-teal-600 text-white rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-teal-700 transition-colors disabled:opacity-50 border-none">
                      {addingStudent ? "Qo'shilmoqda..." : "Qo'shish"}
                    </button>
                    <button onClick={() => setAddDialog(false)}
                      className="flex-1 bg-white text-slate-700 border border-slate-200 rounded-lg py-2.5 font-semibold text-sm cursor-pointer hover:bg-slate-50 transition-colors">
                      Bekor
                    </button>
                  </div>
                </Modal>
              )}
            </div>
          )}

          {/* ── ANALYTICS ── */}
          {section === "analytics" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600">Performance overview for all students</p>
                <button onClick={loadAnalytics} disabled={analyticsLoading}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors border border-slate-200">
                  {analyticsLoading ? "Loading..." : "↻ Refresh"}
                </button>
              </div>

              {analyticsLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400 text-sm"><Spinner /> Analyzing...</div>
              ) : analytics.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
                  <p className="text-3xl mb-2">📈</p>
                  <p className="text-slate-500 font-semibold">No analytics data yet</p>
                  <p className="text-sm text-slate-400 mt-1">Students need to submit essays first.</p>
                </div>
              ) : (
                <>
                  {/* Top performers table */}
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <p className="text-sm font-bold text-slate-800">Top Performers</p>
                      <p className="text-xs text-slate-400 mt-0.5">Sorted by average band score</p>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-12">Rank</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Band Score</th>
                          <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Reports</th>
                          <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Last Active</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics.slice(0, 10).map((a, i) => {
                          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                          return (
                            <tr key={a.student.id} className={`hover:bg-slate-50 transition-colors ${i < 3 ? "bg-amber-50/30" : ""}`}>
                              <td className="px-4 py-3 text-center">
                                {medal
                                  ? <span className="text-xl leading-none">{medal}</span>
                                  : <span className="font-mono text-xs text-slate-400">#{i + 1}</span>}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className={`w-8 h-8 rounded-full ${nameColor(a.student.fullName)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                                    {initials(a.student.fullName)}
                                  </div>
                                  <div>
                                    <p className="font-medium text-slate-800 leading-tight">{a.student.fullName}</p>
                                    <p className="text-xs text-slate-400 font-mono">{a.student.login}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {a.avgBand !== null ? (
                                  <span className={`font-mono text-base font-bold ${a.avgBand >= 7 ? "text-emerald-600" : a.avgBand >= 6 ? "text-blue-600" : "text-slate-700"}`}>
                                    {a.avgBand.toFixed(1)}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-sm">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-sm text-slate-600">{a.reportCount}</td>
                              <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(a.lastActive)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Monthly usage chart */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <p className="text-sm font-bold text-slate-800 mb-1">Monthly Usage</p>
                    <p className="text-xs text-slate-400 mb-4">Reports submitted this month (max 12 per student)</p>
                    <div className="flex flex-col gap-3">
                      {analytics.map((a) => (
                        <div key={a.student.id} className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-full ${nameColor(a.student.fullName)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                            {initials(a.student.fullName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-slate-700 truncate">{a.student.fullName}</span>
                              <span className="text-xs font-mono text-slate-500 shrink-0 ml-2">{a.monthlyCount}/12</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, (a.monthlyCount / 12) * 100)}%`,
                                  backgroundColor: a.monthlyCount >= 12 ? "#ef4444" : a.monthlyCount >= 8 ? "#f59e0b" : "#10b981",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
