import { useState, useEffect, useLayoutEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import gsap from 'gsap';
import { useAuth } from '../contexts/AuthContext';
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
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Link
          to="/"
          className="gs-auth-logo"
          style={{
            display: 'block',
            textAlign: 'center',
            marginBottom: '2rem',
            fontFamily: 'Fraunces, serif',
            fontWeight: 700,
            fontSize: '1.5rem',
            color: '#0f172a',
            textDecoration: 'none',
          }}
        >
          WriteReady <span style={{ color: '#c9900a' }}>IELTS</span>
        </Link>

        <div className="gs-auth-card">
          <Card padding="lg">
            <h2
              style={{
                fontFamily: 'Fraunces, serif',
                fontSize: '1.5rem',
                marginBottom: '0.25rem',
                textAlign: 'center',
                color: '#0f172a',
              }}
            >
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h2>
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {mode === 'login' ? 'Sign in to continue your IELTS prep' : 'Start practicing for free'}
            </p>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.75rem 1rem', borderRadius: 10, fontSize: '0.875rem', marginBottom: '1rem' }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.375rem' }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                  minLength={6}
                  style={inputStyle}
                />
              </div>
              <Button type="submit" loading={loading} size="lg" style={{ width: '100%', marginTop: '0.25rem', background: '#1d4ed8' } as React.CSSProperties}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1.25rem 0' }}>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>or</span>
              <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            </div>

            <button
              onClick={handleGoogle}
              disabled={loading}
              style={{
                width: '100%', padding: '0.625rem 1.25rem',
                border: '1.5px solid #e2e8f0', borderRadius: 10,
                background: 'white', fontSize: '0.875rem', fontWeight: 500,
                color: '#374151', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: '0.5rem', cursor: 'pointer',
              }}
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.875rem', color: '#64748b' }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                style={{ background: 'none', color: '#1d4ed8', fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer' }}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.625rem 0.875rem',
  border: '1.5px solid #e2e8f0',
  borderRadius: 10,
  fontSize: '0.9375rem',
  color: '#0f172a',
  background: 'white',
  outline: 'none',
  transition: 'border-color 0.15s',
  boxSizing: 'border-box',
};

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
