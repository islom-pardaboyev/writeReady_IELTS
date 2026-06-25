import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';

export function PricingPage() {
  const { user, profile } = useAuth();

  const plans = [
    {
      name: 'Free',
      price: '0',
      unit: '',
      description: 'Get started with unlimited writing practice',
      features: [
        'Access all 3 practice modes (Mock, Practice, Relax)',
        'Full question bank access',
        'Word count & timer tools',
        'Writing history',
        'No AI feedback',
      ],
      cta: user ? (profile?.plan === 'free' ? 'Current plan' : 'Downgrade') : 'Sign up free',
      href: user ? '/dashboard' : '/auth?mode=signup',
      highlight: false,
      disabled: profile?.plan === 'free',
    },
    {
      name: 'Pro',
      price: '25,000',
      unit: 'UZS/month',
      description: 'AI feedback to accelerate your improvement',
      features: [
        'Everything in Free',
        '12 AI analyses per month',
        'Sentence-by-sentence feedback',
        'Vocabulary upgrades with Uzbek meanings',
        'Band score estimate',
        'Model paragraph',
        'PDF export',
        'Usage resets each calendar month',
      ],
      cta: profile?.plan === 'pro' ? 'Current plan' : 'Get Pro',
      href: user ? '#contact' : '/auth?mode=signup',
      highlight: true,
      disabled: profile?.plan === 'pro',
    },
    {
      name: 'Lifetime',
      price: '199,000',
      unit: 'UZS once',
      description: 'Pay once, use forever — never expire',
      features: [
        'Everything in Pro',
        '12 AI analyses per month, forever',
        'Priority support',
        'All future features',
        'No subscription to manage',
      ],
      cta: profile?.plan === 'forever' ? 'Current plan' : 'Get Lifetime',
      href: user ? '#contact' : '/auth?mode=signup',
      highlight: false,
      disabled: profile?.plan === 'forever',
    },
  ];

  return (
    <Layout>
      <section style={{ padding: '5rem 0', background: 'var(--paper)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '1rem' }}>Simple pricing</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.0625rem' }}>
              Start free. Upgrade when you're ready for AI feedback.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: 960, margin: '0 auto' }}>
            {plans.map((plan) => (
              <div
                key={plan.name}
                style={{
                  background: plan.highlight ? 'var(--ink-blue)' : 'white',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  border: plan.highlight ? '2px solid var(--gold)' : '1px solid var(--border)',
                  boxShadow: plan.highlight ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {plan.highlight && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -12,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--gold)',
                      color: 'white',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '0.25rem 0.875rem',
                      borderRadius: 20,
                    }}
                  >
                    Most popular
                  </div>
                )}

                <div style={{ marginBottom: '1.5rem' }}>
                  <h3
                    style={{
                      fontFamily: 'Fraunces, serif',
                      fontSize: '1.25rem',
                      color: plan.highlight ? 'white' : 'var(--ink-blue)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {plan.name}
                  </h3>
                  <p style={{ fontSize: '0.875rem', color: plan.highlight ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>
                    {plan.description}
                  </p>
                </div>

                <div style={{ marginBottom: '1.75rem' }}>
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '2rem',
                      fontWeight: 500,
                      color: plan.highlight ? 'white' : 'var(--ink-blue)',
                    }}
                  >
                    {plan.price === '0' ? 'Free' : plan.price}
                  </span>
                  {plan.unit && (
                    <span style={{ fontSize: '0.875rem', color: plan.highlight ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginLeft: '0.375rem' }}>
                      {plan.unit}
                    </span>
                  )}
                </div>

                <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '2rem', flex: 1 }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem', color: plan.highlight ? 'rgba(255,255,255,0.85)' : 'var(--slate)' }}>
                      <span style={{ color: 'var(--gold)', fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to={plan.href}>
                  <Button
                    style={{
                      width: '100%',
                      background: plan.highlight ? 'var(--gold)' : undefined,
                      opacity: plan.disabled ? 0.5 : 1,
                    } as React.CSSProperties}
                    variant={plan.highlight ? 'primary' : 'secondary'}
                    disabled={plan.disabled}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <div
            id="contact"
            style={{
              maxWidth: 540,
              margin: '3rem auto 0',
              textAlign: 'center',
              padding: '2rem',
              background: 'var(--paper-dark)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
            }}
          >
            <h3 style={{ fontFamily: 'Fraunces, serif', marginBottom: '0.5rem' }}>Ready to upgrade?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', marginBottom: '1rem' }}>
              Contact us to complete your Pro or Lifetime purchase. We'll activate your account within 24 hours.
            </p>
            <a href="mailto:support@writeready.uz">
              <Button>Contact to Upgrade →</Button>
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
