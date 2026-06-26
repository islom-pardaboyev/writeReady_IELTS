import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
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

function isProSubscription(subscription?: string): boolean {
  if (!subscription) return false;
  if (subscription === 'forever') return true;
  return new Date(subscription) > new Date();
}

export function AccountPage() {
  const { user, profile, logOut } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) navigate('/auth');
  }, [user]);

  useLayoutEffect(() => {
    if (!user || !profile) return;
    const ctx = gsap.context(() => {
      gsap.set('.gs-profile-card', { x: -30, opacity: 0 });
      gsap.set('.gs-plan-card', { x: 30, opacity: 0 });
      gsap.set('.gs-account-actions', { y: 20, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-profile-card', { x: 0, opacity: 1, duration: 0.6 })
        .to('.gs-plan-card', { x: 0, opacity: 1, duration: 0.65 }, '-=0.35')
        .to('.gs-account-actions', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3');
    }, rootRef);

    return () => ctx.revert();
  }, [user, profile]);

  if (!user || !profile) return null;

  const isPro = isProSubscription(profile.subscription) || profile.plan === 'pro' || profile.plan === 'forever';
  const isForever = profile.subscription === 'forever' || profile.plan === 'forever';
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
      <div ref={rootRef} style={{ padding: '3rem 0', minHeight: 'calc(100vh - 120px)', background: '#f8fafc' }}>
        <div className="container" style={{ maxWidth: 560 }}>

          {/* ── Profile card ── */}
          <div
            className="gs-profile-card"
            style={{
              background: 'white',
              borderRadius: 16,
              padding: '1.5rem',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
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
                  background: '#1d4ed8',
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
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', marginBottom: 2 }}>
                {user.displayName || displayName}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
            {isPro && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#c9900a',
                  border: '1px solid #c9900a',
                  padding: '0.25rem 0.625rem',
                  borderRadius: 20,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  flexShrink: 0,
                }}
              >
                {isForever ? 'Lifetime' : 'Pro'}
              </span>
            )}
          </div>

          {/* ── Plan card ── */}
          {isPro ? (
            <div
              className="gs-plan-card"
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
                borderRadius: 16,
                padding: '2rem',
                marginBottom: '1rem',
                color: 'white',
              }}
            >
              {/* Badge */}
              <div
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                  background: 'rgba(201,144,10,0.2)',
                  border: '1px solid rgba(201,144,10,0.5)',
                  color: '#fbbf24',
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  padding: '0.3rem 0.75rem', borderRadius: 20, marginBottom: '1rem',
                }}
              >
                <span>⚡</span> {isForever ? 'LIFETIME' : 'PRO'}
              </div>

              <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                {isForever ? 'Lifetime Access' : 'Pro Plan'}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginBottom: '1.75rem' }}>
                {isForever
                  ? 'Never expires — full access forever'
                  : profile.subscription
                    ? `Active until ${new Date(profile.subscription).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
                    : 'Active subscription'}
              </div>

              {/* Usage bar */}
              <div style={{ marginBottom: '1.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.55)' }}>AI analyses used this month</span>
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {usedCount}/{usageLimit}
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${usagePct}%`,
                      background: usagePct >= 85 ? '#f87171' : '#60a5fa',
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
                        width: 18, height: 18, borderRadius: '50%',
                        background: 'rgba(96,165,250,0.2)',
                        border: '1px solid rgba(96,165,250,0.4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ color: '#93c5fd', fontSize: '0.6rem', fontWeight: 700 }}>✓</span>
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Free plan card */
            <div
              className="gs-plan-card"
              style={{
                background: 'white',
                borderRadius: 16,
                padding: '2rem',
                border: '1px solid #e2e8f0',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', color: '#0f172a', marginBottom: '0.375rem' }}>
                Free Plan
              </div>
              <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                You're on the free plan. Upgrade to Pro to unlock AI feedback, band score estimates, and vocabulary upgrades.
              </p>
              <Link to="/pricing">
                <Button style={{ background: '#1d4ed8' } as React.CSSProperties}>
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )}

          {/* ── Actions ── */}
          <div
            className="gs-account-actions"
            style={{
              background: 'white',
              borderRadius: 16,
              padding: '1rem 1.5rem',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Link to="/writing" style={{ fontSize: '0.875rem', color: '#1d4ed8', fontWeight: 500 }}>
              Go to Writing →
            </Link>
            <button
              onClick={handleLogout}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                fontSize: '0.875rem',
                padding: '0.25rem 0',
                border: 'none',
                cursor: 'pointer',
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
