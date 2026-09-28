import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router';
import Logo from '/logo.svg';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Label } from '../components/ui/label';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { EmailCodeSignIn } from '../components/auth/EmailCodeSignIn';

type Mode = 'login' | 'signup' | 'student';

function cleanAuthError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  return msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
}

export function AuthPage() {
  const [params, setParams] = useSearchParams();
  // Where to go once signed in: the page that sent the student here (the
  // Telegram bot's essay link, /tg/...), else the dashboard. Only a path on
  // this site, never another address.
  const nextParam = params.get('next') ?? '';
  const next = /^\/(?![/\\])/.test(nextParam) ? nextParam : '/dashboard';
  const initialMode: Mode = params.get('mode') === 'signup' ? 'signup' : params.get('mode') === 'student' ? 'student' : 'login';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [studentLogin, setStudentLogin] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Sign in (or up) with a code emailed to the student, instead of a password or Google.
  const [useCode, setUseCode] = useState(false);
  // Password sign-up waits here while the student confirms their email with a code.
  const [pendingSignup, setPendingSignup] = useState<{ email: string; password: string } | null>(null);
  const { signIn, signInWithGoogle, user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  // While auth state is loading, show nothing (avoids a flash of the form before the redirect)
  if (authLoading) return null;
  // Already logged in — redirect immediately without rendering the form
  if (user) return <Navigate to={next} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup') {
      // The account is created only after the emailed code proves the address
      // is theirs (api/_lib/emailCode.ts), not straight from this form.
      setPendingSignup({ email: email.trim(), password });
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(next);
    } catch (err: unknown) {
      setError(cleanAuthError(err, 'Authentication failed'));
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
      // Sign in with Firebase Auth (password set when the student was created)
      try {
        await signInWithEmailAndPassword(firebaseAuth, fakeEmail, studentPassword);
      } catch {
        setError('Incorrect login or password. Please check with your learning centre.');
        setLoading(false);
        return;
      }

      // Center students keep free premium access even after the center's
      // own subscription expires, so there's no active-center gate here.
      await refreshProfile();
      navigate(next);
    } catch (err: unknown) {
      setError(cleanAuthError(err, 'An error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate(next);
    } catch (err: unknown) {
      setError(cleanAuthError(err, 'Google sign-in failed'));
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (m: Mode) => {
    // Kept in the address too, so the tab title and a reload match the form.
    setParams((prev) => {
      const q = new URLSearchParams(prev);
      q.set('mode', m);
      return q;
    }, { replace: true });
    setMode(m);
    setError('');
    setUseCode(false);
    setPendingSignup(null);
  };

  const title =
    mode === 'student'
      ? 'Learning centre sign-in'
      : pendingSignup
      ? 'Confirm your email'
      : useCode
      ? 'Sign in with a code'
      : mode === 'login'
      ? 'Welcome back'
      : 'Create your free account';

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        <Link
          to="/"
          className="mx-auto mb-8 flex w-fit items-center gap-2 rounded-lg font-sans text-xl font-bold text-[var(--text-primary)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-4"
        >
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span>
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </Link>

        <Card className="p-6 sm:p-8">
          <h1 className="text-center font-sans text-2xl font-bold tracking-[-0.02em] text-balance text-[var(--text-primary)]">{title}</h1>
          {mode === 'student' && (
            <p className="mt-1.5 text-center text-sm text-[var(--text-secondary)]">
              Use the login and password your centre gave you.
            </p>
          )}

          <div className="mt-6">
            {error && !useCode && !pendingSignup && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                {error}
              </div>
            )}

            {mode === 'student' ? (
              <form onSubmit={handleStudentLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-login" className="font-semibold">Login</Label>
                  <Input
                    id="s-login"
                    name="username"
                    type="text"
                    spellCheck={false}
                    value={studentLogin}
                    onChange={(e) => setStudentLogin(e.target.value)}
                    required
                    placeholder="Login provided by your centre…"
                    autoComplete="username"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="s-pass" className="font-semibold">Password</Label>
                  <PasswordInput
                    id="s-pass"
                    name="password"
                    autoComplete="current-password"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    required
                    placeholder="Password provided by your centre…"
                  />
                </div>
                <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
                  Sign in
                </Button>
              </form>
            ) : pendingSignup ? (
              <EmailCodeSignIn
                initialEmail={pendingSignup.email}
                password={pendingSignup.password}
                onSignedIn={() => navigate(next)}
                onBack={() => setPendingSignup(null)}
              />
            ) : useCode ? (
              <EmailCodeSignIn
                initialEmail={email}
                onSignedIn={() => navigate(next)}
                onBack={() => { setUseCode(false); setError(''); }}
              />
            ) : (
              <>
                <Button type="button" variant="outline" size="lg" onClick={handleGoogle} disabled={loading} className="w-full">
                  <GoogleIcon />
                  Continue with Google
                </Button>

                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                  <span className="text-xs text-[var(--text-secondary)]">or with email</span>
                  <div className="h-px flex-1 bg-[var(--border-color)]" />
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-email" className="font-semibold">Email</Label>
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      placeholder="you@example.com…"
                      autoComplete="email"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="auth-password" className="font-semibold">Password</Label>
                    <PasswordInput
                      id="auth-password"
                      name="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder={mode === 'signup' ? 'At least 6 characters…' : '••••••••'}
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    />
                  </div>
                  <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                  </Button>
                </form>

                {/* For a shared computer: no password, no Google sign-in. */}
                <p className="mt-4 text-center text-sm">
                  <button
                    type="button"
                    onClick={() => { setUseCode(true); setError(''); }}
                    disabled={loading}
                    className={LINK_BUTTON}
                  >
                    Email me a sign-in code instead
                  </button>
                </p>
              </>
            )}
          </div>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-2 text-sm text-[var(--text-secondary)]">
          {mode === 'login' ? (
            <p>
              New here?{' '}
              <button type="button" onClick={() => switchTo('signup')} className={LINK_BUTTON}>
                Create a free account
              </button>
            </p>
          ) : (
            <p>
              {mode === 'signup' ? 'Already have an account?' : 'Not from a learning centre?'}{' '}
              <button type="button" onClick={() => switchTo('login')} className={LINK_BUTTON}>
                Sign in
              </button>
            </p>
          )}
          {mode !== 'student' && (
            <p>
              Got a login from your centre?{' '}
              <button type="button" onClick={() => switchTo('student')} className={LINK_BUTTON}>
                Sign in here
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const LINK_BUTTON =
  'cursor-pointer rounded border-0 bg-transparent p-0 font-semibold text-[var(--ink-blue)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}
