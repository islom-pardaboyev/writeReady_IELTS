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
import Logo from '/logo.png'

interface Task1 {
  id: string;
  image: string;
  report: string;
}
interface Task2 {
  id: string;
  report: string;
}
interface FoundUser {
  id: string;
  email: string;
  plan: string;
  subscription?: string;
}

const CREDENTIALS = { login: "2026SPRING", password: "paidOFF" };

function nextMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function planBadge(plan: string, subscription?: string) {
  if (subscription === "forever" || plan === "forever")
    return {
      label: "Lifetime",
      className: "bg-amber-50 text-[#c9900a] border border-amber-200",
    };
  if (plan === "pro" || (subscription && new Date(subscription) > new Date()))
    return {
      label: "Pro",
      className: "bg-blue-50 text-blue-700 border border-blue-200",
    };
  return {
    label: "Free",
    className: "bg-slate-50 text-slate-500 border border-slate-200",
  };
}

// ── Login screen ───────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handle = () => {
    if (login === CREDENTIALS.login && password === CREDENTIALS.password) {
      localStorage.setItem("adminLoggedIn", "true");
      onLogin();
    } else {
      setError("Login yoki parol noto'g'ri!");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="w-full max-w-[420px]">
        <div className="bg-gradient-to-br from-[#0f172a] to-[#1e3a5f] rounded-t-2xl px-8 py-10 text-center text-white">
          
<img width={150} className="mx-auto" src={Logo} alt="" />
          <div className="text-[0.7rem] font-bold tracking-[0.12em] uppercase text-white/50 mb-1.5">
            Admin Access
          </div>
          <h1 className="font-fraunces text-[1.625rem] font-extrabold m-0">
            WriteReady Admin
          </h1>
          <p className="text-sm text-white/55 mt-2 leading-relaxed">
            Manage exam prompts and keep your writing library fresh.
          </p>
        </div>
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-sm p-8">
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
                Login
              </label>
              <input
                className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none box-border"
                placeholder="Login kiriting"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
                Parol
              </label>
              <input
                className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none box-border"
                type="password"
                placeholder="Parol kiriting"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handle()}
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              className="w-full bg-blue-700 text-white border-none rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
              onClick={handle}
            >
              Kirish
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin ─────────────────────────────────────────────────
export default function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [task1List, setTask1List] = useState<Task1[]>([]);
  const [task2List, setTask2List] = useState<Task2[]>([]);
  const [task1Search, setTask1Search] = useState("");
  const [task2Search, setTask2Search] = useState("");

  const [t1Image, setT1Image] = useState("");
  const [t1Report, setT1Report] = useState("");
  const [t1Error, setT1Error] = useState("");
  const [t1Loading, setT1Loading] = useState(false);

  const [t2Report, setT2Report] = useState("");
  const [t2Error, setT2Error] = useState("");
  const [t2Loading, setT2Loading] = useState(false);

  const [editT1, setEditT1] = useState<Task1 | null>(null);
  const [editT2, setEditT2] = useState<Task2 | null>(null);
  const [editImage, setEditImage] = useState("");
  const [editReport, setEditReport] = useState("");

  // User panel state
  const [userEmail, setUserEmail] = useState("");
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState("");
  const [userSuccess, setUserSuccess] = useState("");

  const { uploadImage, uploading } = useUpload();

  const filteredT1 = task1List.filter((t) =>
    t.report.toLowerCase().includes(task1Search.toLowerCase()),
  );
  const filteredT2 = task2List.filter((t) =>
    t.report.toLowerCase().includes(task2Search.toLowerCase()),
  );

  useEffect(() => {
    if (localStorage.getItem("adminLoggedIn") === "true") setIsLoggedIn(true);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(
            query(
              collection(db, "task1_reports"),
              orderBy("createdAt", "desc"),
            ),
          ),
          getDocs(
            query(
              collection(db, "task2_reports"),
              orderBy("createdAt", "desc"),
            ),
          ),
        ]);
        setTask1List(
          s1.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Task1, "id">),
          })),
        );
        setTask2List(
          s2.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Task2, "id">),
          })),
        );
      } catch (e) {
        console.error(e);
      }
    })();
  }, [isLoggedIn]);

  // ── Task CRUD ──────────────────────────────────────────────
  const addTask1 = async () => {
    if (!t1Image || !t1Report) {
      setT1Error("Image va Report bo'sh bo'lmasligi kerak!");
      return;
    }
    setT1Loading(true);
    setT1Error("");
    try {
      const q = query(
        collection(db, "task1_reports"),
        where("report", "==", t1Report),
      );
      if (!(await getDocs(q)).empty) {
        setT1Error("Bu report allaqachon kiritilgan!");
        return;
      }
      const ref = await addDoc(collection(db, "task1_reports"), {
        image: t1Image,
        report: t1Report,
        createdAt: new Date(),
      });
      setTask1List((prev) => [
        { id: ref.id, image: t1Image, report: t1Report },
        ...prev,
      ]);
      setT1Image("");
      setT1Report("");
    } catch {
      setT1Error("Xatolik yuz berdi.");
    } finally {
      setT1Loading(false);
    }
  };

  const addTask2 = async () => {
    if (!t2Report) {
      setT2Error("Report bo'sh bo'lmasligi kerak!");
      return;
    }
    setT2Loading(true);
    setT2Error("");
    try {
      const q = query(
        collection(db, "task2_reports"),
        where("report", "==", t2Report),
      );
      if (!(await getDocs(q)).empty) {
        setT2Error("Bu report allaqachon kiritilgan!");
        return;
      }
      const ref = await addDoc(collection(db, "task2_reports"), {
        report: t2Report,
        createdAt: new Date(),
      });
      setTask2List((prev) => [{ id: ref.id, report: t2Report }, ...prev]);
      setT2Report("");
    } catch {
      setT2Error("Xatolik yuz berdi.");
    } finally {
      setT2Loading(false);
    }
  };

  const deleteTask1 = async (id: string) => {
    if (!confirm("Bu Task 1 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, "task1_reports", id));
    setTask1List((prev) => prev.filter((t) => t.id !== id));
  };
  const deleteTask2 = async (id: string) => {
    if (!confirm("Bu Task 2 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, "task2_reports", id));
    setTask2List((prev) => prev.filter((t) => t.id !== id));
  };

  const saveEditT1 = async () => {
    if (!editT1 || !editImage || !editReport) return;
    await updateDoc(doc(db, "task1_reports", editT1.id), {
      image: editImage,
      report: editReport,
    });
    setTask1List((prev) =>
      prev.map((t) =>
        t.id === editT1.id ? { ...t, image: editImage, report: editReport } : t,
      ),
    );
    setEditT1(null);
  };
  const saveEditT2 = async () => {
    if (!editT2 || !editReport) return;
    await updateDoc(doc(db, "task2_reports", editT2.id), {
      report: editReport,
    });
    setTask2List((prev) =>
      prev.map((t) => (t.id === editT2.id ? { ...t, report: editReport } : t)),
    );
    setEditT2(null);
  };

  // ── User panel ─────────────────────────────────────────────
  const findUser = async () => {
    if (!userEmail.trim()) return;
    setUserLoading(true);
    setUserError("");
    setFoundUser(null);
    setUserSuccess("");
    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", userEmail.trim().toLowerCase()),
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setUserError("No user found with that email.");
        return;
      }
      const d = snap.docs[0];
      const data = d.data();
      setFoundUser({
        id: d.id,
        email: data.email,
        plan: data.plan ?? "free",
        subscription: data.subscription ?? "",
      });
    } catch {
      setUserError("Failed to find user.");
    } finally {
      setUserLoading(false);
    }
  };

  const setSubscription = async (type: "month" | "forever" | "free") => {
    if (!foundUser) return;
    setUserLoading(true);
    setUserError("");
    setUserSuccess("");
    try {
      const updates =
        type === "forever"
          ? { subscription: "forever", plan: "forever" }
          : type === "month"
            ? { subscription: nextMonthDate(), plan: "pro" }
            : { subscription: "", plan: "free" };
      await updateDoc(doc(db, "users", foundUser.id), updates);
      setFoundUser((prev) => (prev ? { ...prev, ...updates } : null));
      setUserSuccess(
        type === "forever"
          ? "Lifetime access granted!"
          : type === "month"
            ? `Pro extended until ${nextMonthDate()}`
            : "Subscription revoked — user set to Free.",
      );
    } catch {
      setUserError("Failed to update subscription.");
    } finally {
      setUserLoading(false);
    }
  };

  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
        {/* ── Top bar ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-6">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div>
              <div className="text-[0.7rem] font-bold tracking-[0.1em] uppercase text-blue-700 mb-1">
                Admin Dashboard
              </div>
              <h1 className="font-fraunces text-[1.75rem] font-extrabold text-slate-900 m-0">
                WriteReady Control Panel
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage prompts and user subscriptions.
              </p>
            </div>
            <button
              className="bg-white text-red-500 border-[1.5px] border-red-500 rounded-lg py-2 px-5 font-semibold text-[0.8125rem] cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => {
                setIsLoggedIn(false);
                localStorage.removeItem("adminLoggedIn");
              }}
            >
              Chiqish
            </button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
            {[
              {
                label: "Task 1 items",
                value: task1List.length,
                colorClass: "text-blue-700",
                bgClass: "bg-blue-50",
                borderClass: "border-blue-100",
              },
              {
                label: "Task 2 items",
                value: task2List.length,
                colorClass: "text-green-700",
                bgClass: "bg-green-50",
                borderClass: "border-green-100",
              },
              {
                label: "Total prompts",
                value: task1List.length + task2List.length,
                colorClass: "text-[#c9900a]",
                bgClass: "bg-amber-50",
                borderClass: "border-amber-100",
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`${s.bgClass} rounded-xl px-5 py-4 border ${s.borderClass}`}
              >
                <div
                  className={`text-[0.8125rem] ${s.colorClass} font-semibold mb-1.5`}
                >
                  {s.label}
                </div>
                <div className="font-mono text-[2rem] font-bold text-slate-900">
                  {s.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── User Management Panel ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7">
          <div className="flex items-center gap-3 pb-5 border-b border-slate-100 mb-6">
            <span className="bg-purple-50 text-purple-600 text-[0.7rem] font-bold tracking-[0.08em] uppercase py-1.5 px-3 rounded-full">
              Users
            </span>
            <h2 className="text-lg font-bold text-slate-900 m-0">
              User Management
            </h2>
          </div>

          {/* Search */}
          <div className="flex gap-3 mb-5">
            <input
              className="flex-1 px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none"
              type="email"
              placeholder="Enter user email address..."
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findUser()}
            />
            <button
              className={`${userLoading ? "bg-slate-400" : "bg-purple-600"} text-white border-none rounded-[10px] px-6 py-2.5 font-semibold text-sm cursor-pointer flex-shrink-0 flex items-center gap-1.5 transition-opacity hover:opacity-90`}
              onClick={findUser}
              disabled={userLoading}
            >
              {userLoading ? "Searching..." : "Find User"}
            </button>
          </div>

          {userError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600 mb-4">
              {userError}
            </div>
          )}
          {userSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3.5 py-2.5 text-sm text-green-700 mb-4">
              {userSuccess}
            </div>
          )}

          {/* Found user card */}
          {foundUser &&
            (() => {
              const badge = planBadge(foundUser.plan, foundUser.subscription);
              const isForever =
                foundUser.subscription === "forever" ||
                foundUser.plan === "forever";
              const isPro = !isForever && foundUser.plan === "pro";
              const subExpiry =
                foundUser.subscription && foundUser.subscription !== "forever"
                  ? new Date(foundUser.subscription).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )
                  : null;

              return (
                <div className="bg-[#fafafa] border-[1.5px] border-slate-200 rounded-2xl p-6 flex flex-col gap-5">
                  {/* User info */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4">
                      <div className="w-11 h-11 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-base flex-shrink-0">
                        {foundUser.email.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-[0.9375rem]">
                          {foundUser.email}
                        </div>
                        <div className="text-[0.8125rem] text-slate-500 mt-0.5">
                          {isForever
                            ? "Lifetime — never expires"
                            : subExpiry
                              ? `Pro until ${subExpiry}`
                              : "No active subscription"}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold py-1.5 px-3.5 rounded-full uppercase tracking-[0.06em] flex-shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Subscription actions */}
                  <div>
                    <div className="text-[0.8rem] font-semibold text-slate-400 uppercase tracking-[0.07em] mb-3">
                      Set Subscription
                    </div>
                    <div className="flex gap-2.5 flex-wrap">
                      <button
                        className={`bg-blue-700 text-white border-none rounded-[10px] px-5 py-2.5 font-semibold text-sm cursor-pointer flex items-center gap-1.5 transition-opacity ${isPro ? "opacity-50" : "hover:opacity-90"}`}
                        onClick={() => setSubscription("month")}
                        disabled={userLoading}
                      >
                        + 1 Month Pro
                      </button>
                      <button
                        className={`bg-[#c9900a] text-white border-none rounded-[10px] px-5 py-2.5 font-semibold text-sm cursor-pointer flex items-center gap-1.5 transition-opacity ${isForever ? "opacity-50" : "hover:opacity-90"}`}
                        onClick={() => setSubscription("forever")}
                        disabled={userLoading}
                      >
                        Lifetime Forever
                      </button>
                      <button
                        className={`bg-white text-red-500 border-[1.5px] border-red-200 rounded-[10px] px-5 py-2.5 font-semibold text-sm cursor-pointer flex items-center gap-1.5 transition-opacity ${foundUser.plan === "free" && !foundUser.subscription ? "opacity-50" : "hover:opacity-90"}`}
                        onClick={() => setSubscription("free")}
                        disabled={userLoading}
                      >
                        Revoke to Free
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
        </div>

        {/* ── Task 1 & Task 2 grid ── */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(480px,1fr))] gap-6">
          {/* Task 1 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 flex flex-col gap-5">
            <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
              <span className="bg-blue-50 text-blue-700 text-[0.7rem] font-bold tracking-[0.08em] uppercase py-1.5 px-3 rounded-full">
                Task 1
              </span>
              <h2 className="text-lg font-bold text-slate-900 m-0">
                Rasm + savol qo'shish
              </h2>
            </div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
                  Rasm yuklash
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      const url = await uploadImage(f);
                      if (url) setT1Image(url);
                    }
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
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <img
                    src={t1Image}
                    alt="preview"
                    className="w-full h-40 object-cover block"
                  />
                </div>
              )}
              <div>
                <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
                  Savol matni
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none resize-y min-h-[120px] leading-relaxed font-inherit box-border"
                  placeholder="Task 1 savol matnini kiriting..."
                  value={t1Report}
                  onChange={(e) => setT1Report(e.target.value)}
                  rows={4}
                />
              </div>
              {t1Error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">
                  {t1Error}
                </div>
              )}
              <button
                className={`${t1Loading || uploading ? "bg-slate-400" : "bg-blue-700"} text-white border-none rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90`}
                onClick={addTask1}
                disabled={t1Loading || uploading}
              >
                {t1Loading ? (
                  <>
                    <Spinner color="white" /> Saqlanmoqda...
                  </>
                ) : (
                  "+ Qo'shish"
                )}
              </button>
            </div>

            {task1List.length > 0 && (
              <div className="flex flex-col gap-3.5">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  {filteredT1.length}/{task1List.length} prompts
                </span>
                <input
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none box-border"
                  placeholder="Search Task 1..."
                  value={task1Search}
                  onChange={(e) => setTask1Search(e.target.value)}
                />
                <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto">
                  {filteredT1.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">
                      No results.
                    </p>
                  ) : (
                    filteredT1.map((t) => (
                      <div
                        key={t.id}
                        className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex flex-col gap-2.5"
                      >
                        <img
                          src={t.image}
                          alt=""
                          className="w-full h-[120px] object-cover rounded-lg"
                        />
                        <p className="text-sm text-slate-700 leading-relaxed m-0 line-clamp-3">
                          {t.report}
                        </p>
                        <div className="flex gap-2">
                          <button
                            className="flex-1 bg-white text-blue-700 border-[1.5px] border-blue-700 rounded-lg py-1.5 px-3.5 font-semibold text-[0.8125rem] cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setEditT1(t);
                              setEditImage(t.image);
                              setEditReport(t.report);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="flex-1 bg-white text-red-500 border-[1.5px] border-red-500 rounded-lg py-1.5 px-3.5 font-semibold text-[0.8125rem] cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => deleteTask1(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Task 2 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 flex flex-col gap-5">
            <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
              <span className="bg-green-50 text-green-700 text-[0.7rem] font-bold tracking-[0.08em] uppercase py-1.5 px-3 rounded-full">
                Task 2
              </span>
              <h2 className="text-lg font-bold text-slate-900 m-0">
                Savol qo'shish
              </h2>
            </div>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
                  Savol matni
                </label>
                <textarea
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none resize-y min-h-[120px] leading-relaxed font-inherit box-border"
                  placeholder="Task 2 savol matnini kiriting..."
                  value={t2Report}
                  onChange={(e) => setT2Report(e.target.value)}
                  rows={5}
                />
              </div>
              {t2Error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">
                  {t2Error}
                </div>
              )}
              <button
                className={`${t2Loading ? "bg-slate-400" : "bg-green-700"} text-white border-none rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90`}
                onClick={addTask2}
                disabled={t2Loading}
              >
                {t2Loading ? (
                  <>
                    <Spinner color="white" /> Saqlanmoqda...
                  </>
                ) : (
                  "+ Qo'shish"
                )}
              </button>
            </div>

            {task2List.length > 0 && (
              <div className="flex flex-col gap-3.5">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  {filteredT2.length}/{task2List.length} prompts
                </span>
                <input
                  className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none box-border"
                  placeholder="Search Task 2..."
                  value={task2Search}
                  onChange={(e) => setTask2Search(e.target.value)}
                />
                <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto">
                  {filteredT2.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">
                      No results.
                    </p>
                  ) : (
                    filteredT2.map((t) => (
                      <div
                        key={t.id}
                        className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex flex-col gap-2.5"
                      >
                        <p className="text-sm text-slate-700 leading-relaxed m-0">
                          {t.report}
                        </p>
                        <div className="flex gap-2">
                          <button
                            className="flex-1 bg-white text-green-700 border-[1.5px] border-green-700 rounded-lg py-1.5 px-3.5 font-semibold text-[0.8125rem] cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => {
                              setEditT2(t);
                              setEditReport(t.report);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="flex-1 bg-white text-red-500 border-[1.5px] border-red-500 rounded-lg py-1.5 px-3.5 font-semibold text-[0.8125rem] cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => deleteTask2(t.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Task 1 modal ── */}
      {editT1 && (
        <Modal onClose={() => setEditT1(null)}>
          <h2 className="font-fraunces text-[1.25rem] font-extrabold text-slate-900 m-0">
            Edit Task 1
          </h2>
          <img
            src={editImage}
            alt=""
            className="w-full h-[140px] object-cover rounded-[10px]"
          />
          <div>
            <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
              Replace Image (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const url = await uploadImage(f);
                  if (url) setEditImage(url);
                }
              }}
            />
          </div>
          <div>
            <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
              Savol matni
            </label>
            <textarea
              className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none resize-y min-h-[120px] leading-relaxed font-inherit box-border"
              value={editReport}
              onChange={(e) => setEditReport(e.target.value)}
              rows={5}
            />
          </div>
          <div className="flex gap-3">
            <button
              className="flex-1 bg-blue-700 text-white border-none rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
              onClick={saveEditT1}
            >
              Save
            </button>
            <button
              className="flex-1 bg-white text-gray-700 border-[1.5px] border-slate-200 rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-80 transition-opacity"
              onClick={() => setEditT1(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit Task 2 modal ── */}
      {editT2 && (
        <Modal onClose={() => setEditT2(null)}>
          <h2 className="font-fraunces text-[1.25rem] font-extrabold text-slate-900 m-0">
            Edit Task 2
          </h2>
          <div>
            <label className="text-[0.8125rem] font-semibold text-gray-700 mb-1 block">
              Savol matni
            </label>
            <textarea
              className="w-full px-3.5 py-2.5 border-[1.5px] border-slate-200 rounded-[10px] text-[0.9rem] text-slate-900 bg-white outline-none resize-y min-h-[120px] leading-relaxed font-inherit box-border"
              value={editReport}
              onChange={(e) => setEditReport(e.target.value)}
              rows={7}
            />
          </div>
          <div className="flex gap-3">
            <button
              className="flex-1 bg-green-700 text-white border-none rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
              onClick={saveEditT2}
            >
              Save
            </button>
            <button
              className="flex-1 bg-white text-gray-700 border-[1.5px] border-slate-200 rounded-[10px] py-3 font-semibold text-sm cursor-pointer flex items-center justify-center gap-1.5 hover:opacity-80 transition-opacity"
              onClick={() => setEditT2(null)}
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── small helpers ──────────────────────────────────────────────
function Spinner({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        border: `2px solid ${color}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-[rgba(15,23,42,0.5)] z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-full max-w-[520px] p-7 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
