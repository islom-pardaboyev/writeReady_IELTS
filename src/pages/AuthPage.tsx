import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link, Navigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import Logo from '/logo.svg';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/input';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Label } from '../components/ui/label';
import { SegmentedControl } from '../components/appearance/SegmentedControl';
import { getAuth, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { isTesterEmail } from '@shared/testerAccount';
import { AuthAside } from '../components/auth/AuthAside';
import { AuthNotice } from '../components/auth/AuthNotice';
import { EmailCodeSignIn } from '../components/auth/EmailCodeSignIn';
import { PasswordRequirements } from '../components/auth/PasswordRequirements';
import { unmetPasswordRules } from '../lib/passwordRules';

type Mode = 'login' | 'signup' | 'student';

function cleanAuthError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  return msg.replace('Firebase: ', '').replace(/\(auth\/.*\)\.?/, '').trim();
}

/**
 * Temporary: the shared test account (api/_lib/testerAccount.ts) gets straight
 * in, with no emailed code. The server checks the password and makes the
 * account the first time.
 */
async function signInAsTester(email: string, password: string) {
  const res = await fetch('/api/email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'tester', email: email.trim(), password }),
  });
  const data = (await res.json().catch(() => ({}))) as { customToken?: unknown; error?: unknown };
  if (!res.ok || typeof data.customToken !== 'string') {
    throw new Error(typeof data.error === 'string' ? data.error : 'Sign-in failed. Try again in a minute.');
  }
  await signInWithCustomToken(getAuth(), data.customToken);
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
  // Sign-up was tried with a password that misses some rules: those turn red.
  const [showUnmetRules, setShowUnmetRules] = useState(false);
  // Sign in with a code emailed to the student, instead of a password or Google.
  const [useCode, setUseCode] = useState(false);
  // Waits here while the student confirms their email with a code: a new
  // password account, or an old one whose email was never confirmed.
  const [pending, setPending] = useState<{ email: string; password: string; isNew: boolean } | null>(null);
  const { signIn, signInWithGoogle, user, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  // While auth state is loading, show nothing (avoids a flash of the form before the redirect)
  if (authLoading) return null;
  // Already logged in — redirect immediately without rendering the form
  if (user) return <Navigate to={next} replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (isTesterEmail(email)) {
      setLoading(true);
      try {
        await signInAsTester(email, password);
        navigate(next);
      } catch (err: unknown) {
        setError(cleanAuthError(err, 'Sign-in failed'));
      } finally {
        setLoading(false);
      }
      return;
    }
    if (mode === 'signup') {
      if (unmetPasswordRules(password).length > 0) {
        // Said under the field (PasswordRequirements), not in the notice above the form.
        setShowUnmetRules(true);
        document.getElementById('auth-password')?.focus();
        return;
      }
      // The account is created only after the emailed code proves the address
      // is theirs (api/_lib/emailCode.ts), not straight from this form.
      setPending({ email: email.trim(), password, isNew: true });
      return;
    }
    setLoading(true);
    try {
      if ((await signIn(email, password)) === 'confirm-email') {
        // Right password, but nobody ever confirmed the email: no way in until they do.
        setPending({ email: email.trim(), password, isNew: false });
        return;
      }
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
    setShowUnmetRules(false);
    setUseCode(false);
    setPending(null);
  };

  // The rules a new password needs, under the field while signing up. Not for
  // the test account, whose fixed password is checked on the server.
  const showRules = mode === 'signup' && !isTesterEmail(email);

  const title =
    mode === 'student'
      ? 'Learning centre sign-in'
      : pending
      ? 'Confirm your email'
      : useCode
      ? 'Sign in with a code'
      : mode === 'login'
      ? 'Welcome back'
      : 'Create your free account';

  const subtitle =
    mode === 'student'
      ? 'Use the login and password your centre gave you.'
      : pending
      ? pending.isNew
        ? 'One last step: enter the code we emailed you.'
        : 'Your email was never confirmed. This is needed once.'
      : useCode
      ? 'We will email you a 6-digit code. No password needed.'
      : mode === 'login'
      ? 'Sign in to pick up where you left off.'
      : 'Get one free band report every week.';

  // The Sign in / Create account switch, on the two main forms only.
  const showSwitch = mode !== 'student' && !pending && !useCode;

  return (
    // The gaps and the field height shrink with the screen's height (--auth-gap,
    // --auth-field), so the whole form shows without scrolling on a laptop or a
    // phone. The aside is one screen tall and never adds to the page.
    <div className="grid min-h-dvh bg-[var(--bg-card)] font-sans [--auth-field:clamp(2.5rem,6dvh,3rem)] [--auth-gap:clamp(0.5rem,1.75dvh,1.25rem)] dark:bg-[var(--bg-base)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AuthAside />

      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-col outline-none">
        <div className="flex h-[clamp(2.75rem,7dvh,4rem)] shrink-0 items-center px-4 sm:px-8">
          {/* The margin carries the logo from 1024px; below that it is here. */}
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg font-display font-extrabold text-[var(--text-primary)] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 lg:hidden"
          >
            <img src={Logo} width={32} height={32} className="size-8" alt="" />
            <span>
              WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
            </span>
          </Link>
          <Link
            to="/"
            className="hidden items-center gap-1.5 rounded-md text-sm font-medium text-[var(--text-secondary)] no-underline transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 lg:inline-flex"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to home
          </Link>
        </div>

        {/* Anchored near the top, not centred: switching between Sign in and
            Create account changes the form's height, and a centred form would
            jump. */}
        <div className="flex flex-1 justify-center px-4 pb-2 pt-[clamp(0.25rem,4dvh,4.5rem)] sm:px-8 sm:pb-[var(--auth-gap)]">
          <div className="w-full max-w-[420px]">
            {showSwitch && (
              <>
                <span id="auth-switch-label" className="sr-only">Sign in or create an account</span>
                <SegmentedControl<'login' | 'signup'>
                  value={mode === 'signup' ? 'signup' : 'login'}
                  onChange={switchTo}
                  labelledBy="auth-switch-label"
                  options={[
                    { value: 'login', label: 'Sign in' },
                    { value: 'signup', label: 'Create account' },
                  ]}
                  className="mb-[calc(var(--auth-gap)*1.5)] rounded-full [&>button]:rounded-full"
                />
              </>
            )}

            <h1 className="font-display text-[1.75rem] font-extrabold leading-[1.15] tracking-[-0.03em] text-balance text-[var(--text-primary)]">{title}</h1>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-[var(--text-secondary)]">{subtitle}</p>

            <div className="mt-[calc(var(--auth-gap)*1.5)]">
              {error && !useCode && !pending && <AuthNotice className="mb-4">{error}</AuthNotice>}

              {mode === 'student' ? (
                <form onSubmit={handleStudentLogin} className="flex flex-col gap-[var(--auth-gap)]">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="s-login" className={LABEL}>Login</Label>
                    <Input
                      id="s-login"
                      name="username"
                      type="text"
                      spellCheck={false}
                      value={studentLogin}
                      onChange={(e) => setStudentLogin(e.target.value)}
                      required
                      placeholder="Login from your centre"
                      autoComplete="username"
                      className={FIELD}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="s-pass" className={LABEL}>Password</Label>
                    <PasswordInput
                      id="s-pass"
                      name="password"
                      autoComplete="current-password"
                      value={studentPassword}
                      onChange={(e) => setStudentPassword(e.target.value)}
                      required
                      placeholder="Password from your centre"
                      className={FIELD}
                    />
                  </div>
                  <Button type="submit" loading={loading} className={`mt-1 ${BIG_BUTTON}`}>
                    Sign in
                  </Button>
                </form>
              ) : pending ? (
                <EmailCodeSignIn
                  initialEmail={pending.email}
                  password={pending.password}
                  submitLabel={pending.isNew ? 'Create account' : 'Confirm and sign in'}
                  onSignedIn={() => navigate(next)}
                  onBack={() => setPending(null)}
                />
              ) : useCode ? (
                <EmailCodeSignIn
                  initialEmail={email}
                  onSignedIn={() => navigate(next)}
                  onBack={() => { setUseCode(false); setError(''); }}
                />
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={handleGoogle} disabled={loading} className={BIG_BUTTON}>
                    <GoogleIcon />
                    Continue with Google
                  </Button>

                  <div className="my-[var(--auth-gap)] flex items-center gap-3" aria-hidden="true">
                    <div className="h-px flex-1 bg-[var(--border-color)]" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">or with email</span>
                    <div className="h-px flex-1 bg-[var(--border-color)]" />
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--auth-gap)]">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="auth-email" className={LABEL}>Email</Label>
                      <Input
                        id="auth-email"
                        name="email"
                        type="email"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="you@example.com"
                        autoComplete="email"
                        className={FIELD}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <Label htmlFor="auth-password" className={LABEL}>Password</Label>
                        {mode === 'login' && (
                          // There is no password reset, so this is the way back in for
                          // a forgotten password. Also handy on a shared computer.
                          <button
                            type="button"
                            onClick={() => { setUseCode(true); setError(''); }}
                            disabled={loading}
                            className={`text-sm ${LINK_BUTTON}`}
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <PasswordInput
                        id="auth-password"
                        name="password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          // Every rule met now: the red marks are done with.
                          if (showUnmetRules && unmetPasswordRules(e.target.value).length === 0) setShowUnmetRules(false);
                        }}
                        required
                        placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
                        // Sign-up checks the rules below itself; the browser's own
                        // "too short" bubble would get in first with a different message.
                        minLength={mode === 'signup' ? undefined : 6}
                        aria-describedby={showRules ? 'password-rules' : undefined}
                        aria-invalid={showRules && showUnmetRules && unmetPasswordRules(password).length > 0 ? true : undefined}
                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        className={FIELD}
                      />
                      {showRules && <PasswordRequirements id="password-rules" password={password} showUnmet={showUnmetRules} />}
                    </div>
                    <Button type="submit" loading={loading} className={`mt-1 ${BIG_BUTTON}`}>
                      {mode === 'login' ? 'Sign in' : 'Create account'}
                    </Button>
                  </form>

                  {mode === 'signup' && (
                    <p className="mt-2 text-center text-xs leading-relaxed text-[var(--text-secondary)]">
                      We will email you a 6-digit code to confirm the address is yours. By creating an account you agree to our{' '}
                      <Link to="/terms" className="font-medium text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--ink-blue)]">
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="font-medium text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--ink-blue)]">
                        Privacy Policy
                      </Link>
                      .
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mt-[var(--auth-gap)] border-t border-[var(--border-color)] pt-[var(--auth-gap)] text-center text-sm text-[var(--text-secondary)]">
              {mode === 'student' ? (
                <p>
                  Not from a learning centre?{' '}
                  <button type="button" onClick={() => switchTo('login')} className={LINK_BUTTON}>
                    Sign in here
                  </button>
                </p>
              ) : (
                <p>
                  Got a login from your learning centre?{' '}
                  <button type="button" onClick={() => switchTo('student')} className={LINK_BUTTON}>
                    Sign in here
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * Fields on the sign-in page run up to 48px tall with 16px text: bigger to
 * hit, and a phone does not zoom into them. The height comes from
 * --auth-field, which shrinks to 40px on a short screen.
 */
const FIELD = 'h-[var(--auth-field,3rem)] rounded-xl px-4 text-base focus-visible:ring-[var(--ring)]';
const LABEL = 'text-sm font-semibold text-[var(--text-primary)]';
const BIG_BUTTON = 'h-[var(--auth-field,3rem)] w-full rounded-full text-[0.9375rem] font-bold';

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
