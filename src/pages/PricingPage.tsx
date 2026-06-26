import { useRef, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';

gsap.registerPlugin(ScrollTrigger);

const FREE_FEATURES = [
  'All 3 practice modes (Mock, Practice, Relax)',
  'Full question bank access',
  'Word count & timer tools',
  'Writing history',
];

const PRO_FEATURES = [
  'Everything in Free',
  '12 AI analyses per month',
  'Sentence-by-sentence feedback',
  'Vocabulary upgrades with Uzbek meanings',
  'Band score estimate per sentence',
  'Model paragraph',
  'PDF export',
];

export function PricingPage() {
  const { user, profile } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);

  const isFree = !profile || profile.plan === 'free';
  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.gs-pricing-header', { y: 32, opacity: 0 });
      gsap.set('.gs-plan-card', { y: 40, opacity: 0, scale: 0.97 });
      gsap.set('.gs-contact-box', { y: 30, opacity: 0 });

      gsap.to('.gs-pricing-header', { y: 0, opacity: 1, duration: 0.65, ease: 'power3.out', delay: 0.1 });

      gsap.to('.gs-plan-card', {
        scrollTrigger: { trigger: '.gs-plans', start: 'top 82%' },
        y: 0, opacity: 1, scale: 1, duration: 0.65, stagger: 0.15, ease: 'power2.out',
      });

      gsap.to('.gs-contact-box', {
        scrollTrigger: { trigger: '.gs-contact-box', start: 'top 88%' },
        y: 0, opacity: 1, duration: 0.6, ease: 'power2.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <Layout>
      <div ref={rootRef} style={{ background: '#f8fafc', minHeight: 'calc(100vh - 120px)', padding: '5rem 0' }}>
        <div className="container">

          {/* Header */}
          <div className="gs-pricing-header" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <div style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.375rem 1rem', borderRadius: 20, marginBottom: '1.25rem' }}>
              Pricing
            </div>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(2rem, 5vw, 2.75rem)', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem', lineHeight: 1.15 }}>
              Simple, honest pricing
            </h1>
            <p style={{ color: '#64748b', fontSize: '1.0625rem', maxWidth: 460, margin: '0 auto' }}>
              Start free. Upgrade when you're ready for AI-powered feedback.
            </p>
          </div>

          {/* Plans */}
          <div className="gs-plans" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', maxWidth: 720, margin: '0 auto' }}>

            {/* Free plan */}
            <div className="gs-plan-card" style={{ background: 'white', borderRadius: 20, padding: '2rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.375rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.25rem' }}>Free</div>
                <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Get started with unlimited writing practice</div>
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '2.25rem', fontWeight: 600, color: '#0f172a' }}>$0</span>
                <span style={{ fontSize: '0.875rem', color: '#94a3b8', marginLeft: '0.375rem' }}>forever</span>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', flex: 1 }}>
                {FREE_FEATURES.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', fontSize: '0.9rem', color: '#334155' }}>
                    <span style={{ color: '#22c55e', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
                <li style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', fontSize: '0.9rem', color: '#94a3b8' }}>
                  <span style={{ flexShrink: 0, marginTop: 1 }}>✗</span>
                  No AI feedback
                </li>
              </ul>
              <Link to={user ? '/dashboard' : '/auth?mode=signup'} style={{ display: 'block' }}>
                <Button variant="secondary" style={{ width: '100%', opacity: isFree ? 0.55 : 1 } as React.CSSProperties} disabled={isFree}>
                  {isFree ? 'Current plan' : 'Downgrade to Free'}
                </Button>
              </Link>
            </div>

            {/* Pro plan */}
            <div className="gs-plan-card" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', borderRadius: 20, padding: '2rem', border: '2px solid #c9900a', boxShadow: '0 8px 32px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: '#c9900a', color: 'white', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.3rem 1rem', borderRadius: 20, whiteSpace: 'nowrap' }}>
                Most popular
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.375rem', fontWeight: 700, color: 'white', marginBottom: '0.25rem' }}>Pro</div>
                <div style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.55)' }}>AI feedback to accelerate your improvement</div>
              </div>
              <div style={{ marginBottom: '2rem' }}>
                <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '2.25rem', fontWeight: 600, color: 'white' }}>25,000</span>
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.5)', marginLeft: '0.375rem' }}>UZS / month</span>
              </div>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', flex: 1 }}>
                {PRO_FEATURES.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="#contact" style={{ display: 'block' }}>
                <Button style={{ width: '100%', background: '#c9900a', border: 'none', opacity: isPro ? 0.55 : 1 } as React.CSSProperties} disabled={isPro}>
                  {isPro ? 'Current plan' : 'Get Pro →'}
                </Button>
              </a>
            </div>
          </div>

          {/* Contact box */}
          <div id="contact" className="gs-contact-box" style={{ maxWidth: 520, margin: '3rem auto 0', textAlign: 'center', padding: '2rem 2.5rem', background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>💬</div>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', color: '#0f172a', marginBottom: '0.5rem' }}>
              Ready to upgrade?
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9375rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Contact us to complete your Pro purchase. We'll activate your account within 24 hours.
            </p>
            <a href="mailto:support@writeready.uz">
              <Button style={{ background: '#1d4ed8' } as React.CSSProperties}>
                Contact to Upgrade →
              </Button>
            </a>
          </div>

        </div>
      </div>
    </Layout>
  );
}
