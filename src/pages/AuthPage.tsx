import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function AuthPage() {
  const [params] = useSearchParams();
  const initialMode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

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
          <Card padding="lg">
            <h2 className="font-[Fraunces,serif] text-2xl mb-1 text-center text-[var(--text-primary)]">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-center text-[var(--text-secondary)] text-sm mb-6">
              {mode === 'login' ? 'Sign in to continue your IELTS prep' : 'Start practicing for free'}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-[10px] text-sm mb-4 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)] block mb-[0.375rem]">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="w-full px-[0.875rem] py-[0.625rem] border-[1.5px] border-[var(--border-color)] rounded-[10px] text-[0.9375rem] text-[var(--text-primary)] bg-[var(--bg-input)] outline-none transition-[border-color] duration-150 box-border placeholder:text-[var(--text-secondary)] focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-[var(--text-primary)] block mb-[0.375rem]">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  minLength={6}
                  className="w-full px-[0.875rem] py-[0.625rem] border-[1.5px] border-[var(--border-color)] rounded-[10px] text-[0.9375rem] text-[var(--text-primary)] bg-[var(--bg-input)] outline-none transition-[border-color] duration-150 box-border placeholder:text-[var(--text-secondary)] focus:border-blue-500"
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

            <p className="text-center mt-5 text-sm text-[var(--text-secondary)]">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="bg-transparent text-blue-600 dark:text-blue-400 font-semibold text-sm border-0 cursor-pointer"
              >
                {mode === 'login' ? 'Sign up free' : 'Sign in'}
              </button>
            </p>
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
