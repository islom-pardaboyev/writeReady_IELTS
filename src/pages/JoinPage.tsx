import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { db } from "../firebase/config";

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<"loading" | "form" | "invalid" | "done">("loading");
  const [centerName, setCenterName] = useState("");
  const [centerId, setCenterId] = useState("");
  const [centerExpiresAt, setCenterExpiresAt] = useState<string>("");

  const [fullName, setFullName] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    (async () => {
      try {
        const inviteDoc = await getDoc(doc(db, "invites", token));
        if (!inviteDoc.exists()) { setStep("invalid"); return; }
        const data = inviteDoc.data();
        // Check invite not expired
        if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
          setStep("invalid"); return;
        }
        // Check center still active
        const centerDoc = await getDoc(doc(db, "learningCenters", data.centerId));
        if (!centerDoc.exists()) { setStep("invalid"); return; }
        const cData = centerDoc.data();
        const centerActive = cData.expiresAt ? new Date(cData.expiresAt) > new Date() : false;
        if (!centerActive) { setStep("invalid"); return; }

        setCenterName(cData.name ?? data.centerName ?? "O'quv markaz");
        setCenterId(data.centerId);
        setCenterExpiresAt(cData.expiresAt ?? "");
        setStep("form");
      } catch {
        setStep("invalid");
      }
    })();
  }, [token]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!fullName.trim() || !login.trim() || !password) { setError("Barcha maydonlarni to'ldiring."); return; }
    if (password.length < 6) { setError("Parol kamida 6 ta belgi bo'lishi kerak."); return; }
    if (password !== password2) { setError("Parollar mos kelmadi."); return; }

    setLoading(true);
    const loginKey = login.trim().toLowerCase();
    const fakeEmail = `${loginKey}@writeready.student`;
    const auth = getAuth();

    try {
      // Check login uniqueness across all centers
      const studentsSnap = await getDocs(
        query(collection(db, "learningCenters", centerId, "students"), where("login", "==", loginKey))
      );
      if (!studentsSnap.empty) { setError("Bu login allaqachon band. Boshqa login tanlang."); setLoading(false); return; }

      // Create Firebase Auth account
      let uid: string;
      try {
        const cred = await createUserWithEmailAndPassword(auth, fakeEmail, password);
        uid = cred.user.uid;
      } catch (err: unknown) {
        const msg = (err as { code?: string })?.code;
        if (msg === "auth/email-already-in-use") {
          // Try sign in — maybe they started but didn't finish
          try {
            const cred = await signInWithEmailAndPassword(auth, fakeEmail, password);
            uid = cred.user.uid;
          } catch {
            setError("Bu login band. Boshqa login tanlang."); setLoading(false); return;
          }
        } else {
          setError("Xatolik yuz berdi. Qayta urinib ko'ring."); setLoading(false); return;
        }
      }

      // Create user doc
      await setDoc(doc(db, "users", uid), {
        email: fakeEmail,
        studentLogin: loginKey,
        fullName: fullName.trim(),
        plan: "pro",
        subscriptionExpiresAt: centerExpiresAt || null,
        centerId,
        centerName,
        createdAt: serverTimestamp(),
        bonusAnalyses: 0,
      });

      // Add to center students
      await setDoc(doc(db, "learningCenters", centerId, "students", uid), {
        fullName: fullName.trim(),
        login: loginKey,
        uid,
        joinedAt: serverTimestamp(),
      });

      navigate("/dashboard");
    } catch {
      setError("Xatolik yuz berdi. Qayta urinib ko'ring.");
    }
    setLoading(false);
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (step === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">Havola yaroqsiz</h1>
          <p className="text-slate-500 text-sm mb-6">Bu invite havola muddati tugagan yoki noto'g'ri.</p>
          <Link to="/auth" className="text-blue-600 text-sm font-medium hover:underline">Kirish sahifasiga qaytish</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block font-bold text-2xl text-slate-800 no-underline">
            WriteReady <span className="text-amber-500">IELTS</span>
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🏫</div>
            <h1 className="text-xl font-bold text-slate-800">Qo'shilish</h1>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-semibold text-blue-600">{centerName}</span> o'quv markazi taklif qilmoqda
            </p>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">To'liq ism</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Isim Familiya"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Login (foydalanuvchi nomi)</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="masalan: ali_karimov"
                value={login}
                onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/\s/g, "_"))}
                required
              />
              <p className="text-xs text-slate-400 mt-1">Faqat lotin harflar, raqamlar va _ belgisi</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Parol</label>
              <input
                type="password"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Kamida 6 ta belgi"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block uppercase tracking-wide">Parolni tasdiqlang</label>
              <input
                type="password"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Parolni qayta kiriting"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors cursor-pointer"
            >
              {loading ? "Ro'yxatdan o'tilmoqda..." : "Ro'yxatdan o'tish"}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-4">
            Allaqachon ro'yxatdan o'tganmisiz?{" "}
            <Link to="/auth?mode=student" className="text-blue-600 hover:underline">Kirish</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
