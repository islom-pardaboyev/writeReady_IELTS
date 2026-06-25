import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';

const PRO_FEATURES = [
  'Real exam-style prompts',
  'Sentence-by-sentence feedback',
  'Estimated band score per sentence',
  'Full essay report (4 criteria)',
  '15 topic-specific vocabulary words',
  'High-level sample essays',
];

export function AccountPage() {
  const { user, profile, logOut } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user]);

  if (!user || !profile) return null;

  const isPro = profile.plan === 'pro' || profile.plan === 'forever';
  const isForever = profile.plan === 'forever';
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);

  const handleLogout = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <Layout>
      <div style={{ padding: '3rem 0', minHeight: 'calc(100vh - 120px)', background: 'var(--paper)' }}>
        <div className="container" style={{ maxWidth: 560 }}>

          {/* ── Profile card ── */}
          <div
            style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '1.125rem',
              marginBottom: '1rem',
            }}
          >
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={displayName}
                style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'var(--ink-blue)',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Fraunces, serif',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--ink-blue)', marginBottom: 2 }}>
                {user.displayName || displayName}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
          </div>

          {/* ── Plan card ── */}
          {isPro ? (
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e2d4a 100%)',
                borderRadius: 'var(--radius-lg)',
                padding: '2rem',
                marginBottom: '1rem',
                color: 'white',
              }}
            >
              {/* Badge */}
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  background: 'rgba(139,92,246,0.25)',
                  border: '1px solid rgba(139,92,246,0.4)',
                  color: '#c4b5fd',
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '0.3rem 0.75rem', borderRadius: 20, marginBottom: '1rem',
                }}
              >
                <span>⚡</span> PRO
              </div>

              <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                You're on Pro!
              </div>
              <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.75rem' }}>
                {isForever ? 'Lifetime access — never expires' : 'Pro plan — active subscription'}
              </div>

              {/* Usage bar */}
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)' }}>Used this month</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {usedCount}/{usageLimit}
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${usagePct}%`,
                      background: usagePct >= 85 ? '#f87171' : '#818cf8',
                      borderRadius: 4,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {PRO_FEATURES.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div
                      style={{
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'rgba(139,92,246,0.25)',
                        border: '1px solid rgba(139,92,246,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ color: '#a78bfa', fontSize: '0.625rem', fontWeight: 700 }}>✓</span>
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Free plan card */
            <div
              style={{
                background: 'white',
                borderRadius: 'var(--radius-lg)',
                padding: '2rem',
                border: '1px solid var(--border)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', color: 'var(--ink-blue)', marginBottom: '0.375rem' }}>
                Free Plan
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                You're on the free plan. Upgrade to Pro to unlock AI feedback, band score estimates, and vocabulary upgrades.
              </p>
              <Link to="/pricing">
                <Button style={{ background: 'var(--gold)' } as React.CSSProperties}>
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )}

          {/* ── Actions ── */}
          <div
            style={{
              background: 'white',
              borderRadius: 'var(--radius-lg)',
              padding: '1rem 1.5rem',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Link to="/writing" style={{ fontSize: '0.875rem', color: 'var(--ink-blue)', fontWeight: 500 }}>
              Go to Writing →
            </Link>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: '0.875rem',
                padding: '0.25rem 0',
              }}
            >
              Sign out
            </button>
          </div>

        </div>
      </div>
    </Layout>
  );
}
