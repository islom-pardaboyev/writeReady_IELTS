import { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, deleteDoc,
  updateDoc, doc, query, where, orderBy,
} from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import useUpload from '@/hooks/useUploadImage';

interface Task1 { id: string; image: string; report: string; }
interface Task2 { id: string; report: string; }
interface FoundUser { id: string; email: string; plan: string; subscription?: string; }

const CREDENTIALS = { login: '2026SPRING', password: 'paidOFF' };

// ── shared primitives ──────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.875rem',
  border: '1.5px solid #e2e8f0', borderRadius: 10,
  fontSize: '0.9rem', color: '#0f172a', background: 'white',
  outline: 'none', boxSizing: 'border-box',
};
const ta: React.CSSProperties = {
  ...inp, resize: 'vertical' as const, minHeight: 120,
  fontFamily: 'inherit', lineHeight: 1.6,
};
const btn = (bg: string, color = 'white'): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 10,
  padding: '0.625rem 1.25rem', fontWeight: 600,
  fontSize: '0.875rem', cursor: 'pointer', transition: 'opacity 0.15s',
  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
});
const outlineBtn = (color: string): React.CSSProperties => ({
  background: 'white', color, border: `1.5px solid ${color}`,
  borderRadius: 8, padding: '0.4rem 0.875rem',
  fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer',
});
const card: React.CSSProperties = {
  background: 'white', borderRadius: 16,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
};
const lbl: React.CSSProperties = {
  fontSize: '0.8125rem', fontWeight: 600,
  color: '#374151', marginBottom: 4, display: 'block',
};
const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fecaca',
  borderRadius: 8, padding: '0.625rem 0.875rem',
  fontSize: '0.875rem', color: '#dc2626',
};
const successBox: React.CSSProperties = {
  background: '#f0fdf4', border: '1px solid #bbf7d0',
  borderRadius: 8, padding: '0.625rem 0.875rem',
  fontSize: '0.875rem', color: '#16a34a',
};

function nextMonthDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function planBadge(plan: string, subscription?: string) {
  if (subscription === 'forever' || plan === 'forever')
    return { label: 'Lifetime', bg: '#fffbeb', color: '#c9900a', border: '#fde68a' };
  if (plan === 'pro' || (subscription && new Date(subscription) > new Date()))
    return { label: 'Pro', bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
  return { label: 'Free', bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' };
}

// ── Login screen ───────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handle = () => {
    if (login === CREDENTIALS.login && password === CREDENTIALS.password) {
      localStorage.setItem('adminLoggedIn', 'true');
      onLogin();
    } else {
      setError("Login yoki parol noto'g'ri!");
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: '16px 16px 0 0', padding: '2.5rem 2rem', textAlign: 'center', color: 'white' }}>
          <div style={{ width: 52, height: 52, background: 'rgba(255,255,255,0.15)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontFamily: 'Fraunces, serif', fontSize: '1.5rem', fontWeight: 700 }}>W</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Admin Access</div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.625rem', fontWeight: 800, margin: 0 }}>WriteReady Admin</h1>
          <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 1.5 }}>Manage exam prompts and keep your writing library fresh.</p>
        </div>
        <div style={{ ...card, borderRadius: '0 0 16px 16px', padding: '2rem', borderTop: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={lbl}>Login</label>
              <input style={inp} placeholder="Login kiriting" value={login} onChange={e => setLogin(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Parol</label>
              <input style={inp} type="password" placeholder="Parol kiriting" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()} />
            </div>
            {error && <div style={errorBox}>{error}</div>}
            <button style={{ ...btn('#1d4ed8'), width: '100%', padding: '0.75rem', justifyContent: 'center' }} onClick={handle}>Kirish</button>
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
  const [task1Search, setTask1Search] = useState('');
  const [task2Search, setTask2Search] = useState('');

  const [t1Image, setT1Image] = useState('');
  const [t1Report, setT1Report] = useState('');
  const [t1Error, setT1Error] = useState('');
  const [t1Loading, setT1Loading] = useState(false);

  const [t2Report, setT2Report] = useState('');
  const [t2Error, setT2Error] = useState('');
  const [t2Loading, setT2Loading] = useState(false);

  const [editT1, setEditT1] = useState<Task1 | null>(null);
  const [editT2, setEditT2] = useState<Task2 | null>(null);
  const [editImage, setEditImage] = useState('');
  const [editReport, setEditReport] = useState('');

  // User panel state
  const [userEmail, setUserEmail] = useState('');
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  const { uploadImage, uploading } = useUpload();

  const filteredT1 = task1List.filter(t => t.report.toLowerCase().includes(task1Search.toLowerCase()));
  const filteredT2 = task2List.filter(t => t.report.toLowerCase().includes(task2Search.toLowerCase()));

  useEffect(() => {
    if (localStorage.getItem('adminLoggedIn') === 'true') setIsLoggedIn(true);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    (async () => {
      try {
        const [s1, s2] = await Promise.all([
          getDocs(query(collection(db, 'task1_reports'), orderBy('createdAt', 'desc'))),
          getDocs(query(collection(db, 'task2_reports'), orderBy('createdAt', 'desc'))),
        ]);
        setTask1List(s1.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Task1, 'id'>) })));
        setTask2List(s2.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Task2, 'id'>) })));
      } catch (e) { console.error(e); }
    })();
  }, [isLoggedIn]);

  // ── Task CRUD ──────────────────────────────────────────────
  const addTask1 = async () => {
    if (!t1Image || !t1Report) { setT1Error("Image va Report bo'sh bo'lmasligi kerak!"); return; }
    setT1Loading(true); setT1Error('');
    try {
      const q = query(collection(db, 'task1_reports'), where('report', '==', t1Report));
      if (!(await getDocs(q)).empty) { setT1Error('Bu report allaqachon kiritilgan!'); return; }
      const ref = await addDoc(collection(db, 'task1_reports'), { image: t1Image, report: t1Report, createdAt: new Date() });
      setTask1List(prev => [{ id: ref.id, image: t1Image, report: t1Report }, ...prev]);
      setT1Image(''); setT1Report('');
    } catch { setT1Error('Xatolik yuz berdi.'); } finally { setT1Loading(false); }
  };

  const addTask2 = async () => {
    if (!t2Report) { setT2Error("Report bo'sh bo'lmasligi kerak!"); return; }
    setT2Loading(true); setT2Error('');
    try {
      const q = query(collection(db, 'task2_reports'), where('report', '==', t2Report));
      if (!(await getDocs(q)).empty) { setT2Error('Bu report allaqachon kiritilgan!'); return; }
      const ref = await addDoc(collection(db, 'task2_reports'), { report: t2Report, createdAt: new Date() });
      setTask2List(prev => [{ id: ref.id, report: t2Report }, ...prev]);
      setT2Report('');
    } catch { setT2Error('Xatolik yuz berdi.'); } finally { setT2Loading(false); }
  };

  const deleteTask1 = async (id: string) => {
    if (!confirm("Bu Task 1 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, 'task1_reports', id));
    setTask1List(prev => prev.filter(t => t.id !== id));
  };
  const deleteTask2 = async (id: string) => {
    if (!confirm("Bu Task 2 ni o'chirishni xohlaysizmi?")) return;
    await deleteDoc(doc(db, 'task2_reports', id));
    setTask2List(prev => prev.filter(t => t.id !== id));
  };

  const saveEditT1 = async () => {
    if (!editT1 || !editImage || !editReport) return;
    await updateDoc(doc(db, 'task1_reports', editT1.id), { image: editImage, report: editReport });
    setTask1List(prev => prev.map(t => t.id === editT1.id ? { ...t, image: editImage, report: editReport } : t));
    setEditT1(null);
  };
  const saveEditT2 = async () => {
    if (!editT2 || !editReport) return;
    await updateDoc(doc(db, 'task2_reports', editT2.id), { report: editReport });
    setTask2List(prev => prev.map(t => t.id === editT2.id ? { ...t, report: editReport } : t));
    setEditT2(null);
  };

  // ── User panel ─────────────────────────────────────────────
  const findUser = async () => {
    if (!userEmail.trim()) return;
    setUserLoading(true); setUserError(''); setFoundUser(null); setUserSuccess('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', userEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setUserError('No user found with that email.'); return; }
      const d = snap.docs[0];
      const data = d.data();
      setFoundUser({ id: d.id, email: data.email, plan: data.plan ?? 'free', subscription: data.subscription ?? '' });
    } catch { setUserError('Failed to find user.'); } finally { setUserLoading(false); }
  };

  const setSubscription = async (type: 'month' | 'forever' | 'free') => {
    if (!foundUser) return;
    setUserLoading(true); setUserError(''); setUserSuccess('');
    try {
      const updates =
        type === 'forever' ? { subscription: 'forever', plan: 'forever' } :
        type === 'month'   ? { subscription: nextMonthDate(), plan: 'pro' } :
                             { subscription: '', plan: 'free' };
      await updateDoc(doc(db, 'users', foundUser.id), updates);
      setFoundUser(prev => prev ? { ...prev, ...updates } : null);
      setUserSuccess(
        type === 'forever' ? 'Lifetime access granted!' :
        type === 'month'   ? `Pro extended until ${nextMonthDate()}` :
                             'Subscription revoked — user set to Free.'
      );
    } catch { setUserError('Failed to update subscription.'); } finally { setUserLoading(false); }
  };

  if (!isLoggedIn) return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* ── Top bar ── */}
        <div style={{ ...card, padding: '1.5rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1d4ed8', marginBottom: 4 }}>Admin Dashboard</div>
              <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>WriteReady Control Panel</h1>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginTop: 4 }}>Manage prompts and user subscriptions.</p>
            </div>
            <button style={{ ...outlineBtn('#ef4444'), padding: '0.5rem 1.25rem' }}
              onClick={() => { setIsLoggedIn(false); localStorage.removeItem('adminLoggedIn'); }}>
              Chiqish
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            {[
              { label: 'Task 1 items', value: task1List.length, color: '#1d4ed8', bg: '#eff6ff' },
              { label: 'Task 2 items', value: task2List.length, color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Total prompts', value: task1List.length + task2List.length, color: '#c9900a', bg: '#fffbeb' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '1rem 1.25rem', border: `1px solid ${s.color}22` }}>
                <div style={{ fontSize: '0.8125rem', color: s.color, fontWeight: 600, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '2rem', fontWeight: 700, color: '#0f172a' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── User Management Panel ── */}
        <div style={{ ...card, padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f1f5f9', marginBottom: '1.5rem' }}>
            <span style={{ background: '#fdf4ff', color: '#9333ea', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 0.75rem', borderRadius: 20 }}>Users</span>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>User Management</h2>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <input
              style={{ ...inp, flex: 1 }}
              type="email"
              placeholder="Enter user email address..."
              value={userEmail}
              onChange={e => setUserEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findUser()}
            />
            <button
              style={{ ...btn(userLoading ? '#94a3b8' : '#9333ea'), padding: '0.625rem 1.5rem', flexShrink: 0 }}
              onClick={findUser}
              disabled={userLoading}
            >
              {userLoading ? 'Searching...' : 'Find User'}
            </button>
          </div>

          {userError && <div style={{ ...errorBox, marginBottom: '1rem' }}>{userError}</div>}
          {userSuccess && <div style={{ ...successBox, marginBottom: '1rem' }}>{userSuccess}</div>}

          {/* Found user card */}
          {foundUser && (() => {
            const badge = planBadge(foundUser.plan, foundUser.subscription);
            const isForever = foundUser.subscription === 'forever' || foundUser.plan === 'forever';
            const isPro = !isForever && foundUser.plan === 'pro';
            const subExpiry = foundUser.subscription && foundUser.subscription !== 'forever'
              ? new Date(foundUser.subscription).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
              : null;

            return (
              <div style={{ background: '#fafafa', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* User info */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#9333ea', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
                      {foundUser.email.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9375rem' }}>{foundUser.email}</div>
                      <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 2 }}>
                        {isForever ? 'Lifetime — never expires'
                          : subExpiry ? `Pro until ${subExpiry}`
                          : 'No active subscription'}
                      </div>
                    </div>
                  </div>
                  <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: '0.75rem', fontWeight: 700, padding: '0.3rem 0.875rem', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
                    {badge.label}
                  </span>
                </div>

                {/* Subscription actions */}
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.75rem' }}>
                    Set Subscription
                  </div>
                  <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                    <button
                      style={{ ...btn('#1d4ed8'), opacity: isPro ? 0.5 : 1 }}
                      onClick={() => setSubscription('month')}
                      disabled={userLoading}
                    >
                      + 1 Month Pro
                    </button>
                    <button
                      style={{ ...btn('#c9900a'), opacity: isForever ? 0.5 : 1 }}
                      onClick={() => setSubscription('forever')}
                      disabled={userLoading}
                    >
                      Lifetime Forever
                    </button>
                    <button
                      style={{ ...btn('white', '#ef4444'), border: '1.5px solid #fecaca', opacity: foundUser.plan === 'free' && !foundUser.subscription ? 0.5 : 1 }}
                      onClick={() => setSubscription('free')}
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '1.5rem' }}>

          {/* Task 1 */}
          <div style={{ ...card, padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 0.75rem', borderRadius: 20 }}>Task 1</span>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Rasm + savol qo'shish</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={lbl}>Rasm yuklash</label>
                <input type="file" accept="image/*"
                  onChange={async e => { const f = e.target.files?.[0]; if (f) { const url = await uploadImage(f); if (url) setT1Image(url); } }}
                  style={{ display: 'block', width: '100%', fontSize: '0.875rem', color: '#374151' }} />
              </div>
              {uploading && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.875rem', color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Spinner color="#1d4ed8" /> Yuklanmoqda...
                </div>
              )}
              {t1Image && (
                <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <img src={t1Image} alt="preview" style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
                </div>
              )}
              <div>
                <label style={lbl}>Savol matni</label>
                <textarea style={ta} placeholder="Task 1 savol matnini kiriting..." value={t1Report} onChange={e => setT1Report(e.target.value)} rows={4} />
              </div>
              {t1Error && <div style={errorBox}>{t1Error}</div>}
              <button style={{ ...btn(t1Loading || uploading ? '#94a3b8' : '#1d4ed8'), padding: '0.75rem', justifyContent: 'center' }}
                onClick={addTask1} disabled={t1Loading || uploading}>
                {t1Loading ? <><Spinner color="white" /> Saqlanmoqda...</> : "+ Qo'shish"}
              </button>
            </div>

            {task1List.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                  {filteredT1.length}/{task1List.length} prompts
                </span>
                <input style={inp} placeholder="Search Task 1..." value={task1Search} onChange={e => setTask1Search(e.target.value)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 480, overflowY: 'auto' }}>
                  {filteredT1.length === 0
                    ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0', fontSize: '0.875rem' }}>No results.</p>
                    : filteredT1.map(t => (
                      <div key={t.id} style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <img src={t.image} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8 }} />
                        <p style={{ fontSize: '0.875rem', color: '#334155', lineHeight: 1.5, margin: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t.report}</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button style={{ ...outlineBtn('#1d4ed8'), flex: 1 }} onClick={() => { setEditT1(t); setEditImage(t.image); setEditReport(t.report); }}>Edit</button>
                          <button style={{ ...outlineBtn('#ef4444'), flex: 1 }} onClick={() => deleteTask1(t.id)}>Delete</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          {/* Task 2 */}
          <div style={{ ...card, padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingBottom: '1.25rem', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 0.75rem', borderRadius: 20 }}>Task 2</span>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Savol qo'shish</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={lbl}>Savol matni</label>
                <textarea style={ta} placeholder="Task 2 savol matnini kiriting..." value={t2Report} onChange={e => setT2Report(e.target.value)} rows={5} />
              </div>
              {t2Error && <div style={errorBox}>{t2Error}</div>}
              <button style={{ ...btn(t2Loading ? '#94a3b8' : '#16a34a'), padding: '0.75rem', justifyContent: 'center' }}
                onClick={addTask2} disabled={t2Loading}>
                {t2Loading ? <><Spinner color="white" /> Saqlanmoqda...</> : "+ Qo'shish"}
              </button>
            </div>

            {task2List.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
                  {filteredT2.length}/{task2List.length} prompts
                </span>
                <input style={inp} placeholder="Search Task 2..." value={task2Search} onChange={e => setTask2Search(e.target.value)} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: 520, overflowY: 'auto' }}>
                  {filteredT2.length === 0
                    ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 0', fontSize: '0.875rem' }}>No results.</p>
                    : filteredT2.map(t => (
                      <div key={t.id} style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        <p style={{ fontSize: '0.875rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>{t.report}</p>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button style={{ ...outlineBtn('#16a34a'), flex: 1 }} onClick={() => { setEditT2(t); setEditReport(t.report); }}>Edit</button>
                          <button style={{ ...outlineBtn('#ef4444'), flex: 1 }} onClick={() => deleteTask2(t.id)}>Delete</button>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Edit Task 1 modal ── */}
      {editT1 && (
        <Modal onClose={() => setEditT1(null)}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Edit Task 1</h2>
          <img src={editImage} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }} />
          <div>
            <label style={lbl}>Replace Image (optional)</label>
            <input type="file" accept="image/*"
              onChange={async e => { const f = e.target.files?.[0]; if (f) { const url = await uploadImage(f); if (url) setEditImage(url); } }} />
          </div>
          <div>
            <label style={lbl}>Savol matni</label>
            <textarea style={ta} value={editReport} onChange={e => setEditReport(e.target.value)} rows={5} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button style={{ ...btn('#1d4ed8'), flex: 1, padding: '0.75rem', justifyContent: 'center' }} onClick={saveEditT1}>Save</button>
            <button style={{ ...btn('white', '#374151'), flex: 1, padding: '0.75rem', border: '1.5px solid #e2e8f0', justifyContent: 'center' }} onClick={() => setEditT1(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Task 2 modal ── */}
      {editT2 && (
        <Modal onClose={() => setEditT2(null)}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Edit Task 2</h2>
          <div>
            <label style={lbl}>Savol matni</label>
            <textarea style={ta} value={editReport} onChange={e => setEditReport(e.target.value)} rows={7} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button style={{ ...btn('#16a34a'), flex: 1, padding: '0.75rem', justifyContent: 'center' }} onClick={saveEditT2}>Save</button>
            <button style={{ ...btn('white', '#374151'), flex: 1, padding: '0.75rem', border: '1.5px solid #e2e8f0', justifyContent: 'center' }} onClick={() => setEditT2(null)}>Cancel</button>
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
    <span style={{ display: 'inline-block', width: 12, height: 12, border: `2px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', width: '100%', maxWidth: 520, padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}