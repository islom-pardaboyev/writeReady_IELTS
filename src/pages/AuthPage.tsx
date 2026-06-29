import { useState, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { db } from '../firebase/config';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

type Mode = 'login' | 'signup' | 'student';

export function AuthPage() {
  const [params] = useSearchParams();
  const initialMode: Mode = params.get('mode') === 'signup' ? 'signup' : params.get('mode') === 'student' ? 'student' : 'login';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentLogin, setStudentLogin] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, signInWithGoogle, user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  // While auth state is loading, show nothing (avoids GSAP flash then redirect)
  if (authLoading) return null;
  // Already logged in — redirect immediately without rendering the form
  if (user) return <Navigate to="/dashboard" replace />;

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.gs-auth-logo', { y: -20, opacity: 0 });
      gsap.set('.gs-auth-card', { y: 36, opacity: 0, scale: 0.97 });
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-auth-logo', { y: 0, opacity: 1, duration: 0.5 })
        .to('.gs-auth-card', { y: 0, opacity: 1, scale: 1, duration: 0.6 }, '-=0.25');
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
    } finally {
      setLoading(false);
    }
  };

  const handleStudentLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const loginKey = studentLogin.trim().toLowerCase();
    const fakeEmail = `${loginKey}@writeready.student`;
    const firebaseAuth = getAuth();
    try {
      // Step 1: Sign in with Firebase Auth (password set by student during registration)
      let uid: string;
      try {
        const cred = await signInWithEmailAndPassword(firebaseAuth, fakeEmail, studentPassword);
        uid = cred.user.uid;
      } catch {
        setError('Login yoki parol noto\'g\'ri. Agar yangi bo\'lsangiz, invite link orqali ro\'yxatdan o\'ting.');
        setLoading(false);
        return;
      }

      // Step 2: Check center is still active
      const userDoc = await import('firebase/firestore').then(({ getDoc, doc: fDoc }) =>
        getDoc(fDoc(db, 'users', uid))
      );
      if (userDoc.exists()) {
        const uData = userDoc.data();
        if (uData.centerId) {
          const { getDoc: gd, doc: fd } = await import('firebase/firestore');
          const centerDoc = await gd(fd(db, 'learningCenters', uData.centerId));
          if (centerDoc.exists()) {
            const cData = centerDoc.data();
            const isActive = cData.expiresAt ? new Date(cData.expiresAt) > new Date() : false;
            if (!isActive) {
              await firebaseAuth.signOut();
              setError('O\'quv markazingizning muddati tugagan. Markaz administratoriga murojaat qiling.');
              setLoading(false);
              return;
            }
          }
        }
      }

      await refreshProfile();
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Xatolik yuz berdi';
      setError(msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim());
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-4 py-8"
    >
      <div className="w-full max-w-[420px]">
        <Link
          to="/"
          className="gs-auth-logo block text-center mb-8 font-[Fraunces,serif] font-bold text-2xl text-[var(--text-primary)] no-underline"
        >
          WriteReady <span className="text-[#c9900a] dark:text-amber-400">IELTS</span>
        </Link>

        <div className="gs-auth-card">
          <Card className="p-8">
            {/* Mode tabs */}
            <div className="flex rounded-[10px] bg-[var(--bg-subtle)] p-1 mb-6 gap-1">
              {(['login', 'signup', 'student'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); }}
                  className={`flex-1 text-xs font-semibold py-1.5 rounded-[8px] transition-colors border-0 cursor-pointer ${
                    mode === m
                      ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
                      : 'bg-transparent text-[var(--text-secondary)]'
                  }`}
                >
                  {m === 'login' ? 'Sign In' : m === 'signup' ? 'Sign Up' : '🏫 Student'}
                </button>
              ))}
            </div>

            <h2 className="font-[Fraunces,serif] text-2xl mb-1 text-center text-[var(--text-primary)]">
              {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create account' : 'Student Login'}
            </h2>
            <p className="text-center text-[var(--text-secondary)] text-sm mb-6">
              {mode === 'login'
                ? 'Sign in to continue your IELTS prep'
                : mode === 'signup'
                ? 'Start practicing for free'
                : 'O\'quv markazingiz bergan login va parolni kiriting'}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-[10px] text-sm mb-4 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {error}
              </div>
            )}

            {mode === 'student' ? (
              <form onSubmit={handleStudentLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-login" className="font-semibold">Login</Label>
                  <Input
                    id="s-login"
                    type="text"
                    value={studentLogin}
                    onChange={(e) => setStudentLogin(e.target.value)}
                    required
                    placeholder="O'quv markaz bergan login"
                    autoComplete="username"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-pass" className="font-semibold">Parol</Label>
                  <Input
                    id="s-pass"
                    type="password"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    required
                    placeholder="O'quv markaz bergan parol"
                  />
                </div>
                <Button type="submit" loading={loading} size="lg" className="w-full mt-1 bg-emerald-600 hover:bg-emerald-700">
                  Kirish
                </Button>
                <p className="text-center text-xs text-[var(--text-secondary)]">
                  Login va parolni o'quv markazingizdan oling
                </p>
              </form>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-email" className="font-semibold">Email</Label>
                    <Input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-password" className="font-semibold">Password</Label>
                    <Input
                      id="auth-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                      minLength={6}
                    />
                  </div>
                  <Button type="submit" loading={loading} size="lg" className="w-full mt-1 bg-blue-700">
                    {mode === 'login' ? 'Sign In' : 'Create Account'}
                  </Button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                  <span className="text-[0.75rem] text-[var(--text-secondary)]">or</span>
                  <div className="flex-1 h-px bg-[var(--border-color)]" />
                </div>

                <button
                  onClick={handleGoogle}
                  disabled={loading}
                  className="w-full px-5 py-[0.625rem] border-[1.5px] border-[var(--border-color)] rounded-[10px] bg-[var(--bg-card)] text-sm font-medium text-[var(--text-primary)] flex items-center justify-center gap-2 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
