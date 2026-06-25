import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';

export function LandingPage() {
  return (
    <Layout>
      {/* Hero */}
      <section
        style={{
          background: 'var(--ink-blue)',
          color: 'white',
          padding: '5rem 0 4rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 40px)',
          }}
        />
        <div className="container" style={{ position: 'relative' }}>
          <div
            style={{
              display: 'inline-block',
              background: 'rgba(217,164,65,0.15)',
              border: '1px solid rgba(217,164,65,0.4)',
              color: 'var(--gold)',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '0.375rem 1rem',
              borderRadius: 20,
              marginBottom: '1.5rem',
            }}
          >
            AI-Powered IELTS Writing Coach
          </div>
          <h1
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: 'clamp(2.5rem, 6vw, 4rem)',
              fontWeight: 900,
              color: 'white',
              marginBottom: '1.25rem',
              maxWidth: 720,
              margin: '0 auto 1.25rem',
            }}
          >
            Write better.<br />
            <span style={{ color: 'var(--gold)' }}>Score higher.</span>
          </h1>
          <p
            style={{
              fontSize: '1.125rem',
              color: 'rgba(255,255,255,0.75)',
              maxWidth: 540,
              margin: '0 auto 2.5rem',
              lineHeight: 1.7,
            }}
          >
            Get sentence-by-sentence feedback in Uzbek and English. Practice in Mock, Practice, or Relax mode. Powered by Claude AI.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/auth?mode=signup">
              <Button size="lg" style={{ background: 'var(--gold)', fontSize: '1rem' } as React.CSSProperties}>
                Start Practicing Free
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="secondary" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)' } as React.CSSProperties}>
                See Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Modes section */}
      <section style={{ padding: '5rem 0', background: 'var(--paper)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>Three modes, one goal</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.0625rem' }}>Choose your practice style and build exam confidence your way</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            <ModeCard
              emoji="⏱"
              title="Mock"
              subtitle="Exam simulation"
              description="Strict 40-minute timer, one attempt, no pausing. Mirrors real IELTS exam pressure and conditions."
              accent="var(--ink-blue)"
              bg="var(--ink-blue)"
              light
            />
            <ModeCard
              emoji="✏️"
              title="Practice"
              subtitle="Targeted improvement"
              description="No strict timer. Submit paragraph by paragraph. Focus on grammar, coherence, vocabulary, or task achievement."
              accent="var(--coral)"
              bg="white"
            />
            <ModeCard
              emoji="☕"
              title="Relax"
              subtitle="Low-pressure drafting"
              description="No timer, no pressure. Brainstorm ideas, build vocabulary, and explore topics at your own pace."
              accent="var(--ink-blue)"
              bg="var(--mist)"
            />
          </div>
        </div>
      </section>

      {/* Feedback preview */}
      <section style={{ padding: '5rem 0', background: 'var(--paper-dark)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Feedback like a real teacher</h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '1.25rem' }}>
                Not a generic AI chatbot response — annotations styled like ink on paper. Coral underlines for grammar corrections, gold highlights for vocabulary upgrades.
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {['Sentence-by-sentence grammar & coherence notes', 'Vocabulary upgrades with Uzbek + English meanings', 'Band score estimate (1–9)', 'Model paragraph showing a stronger version'].map((f) => (
                  <li key={f} style={{ display: 'flex', gap: '0.625rem', fontSize: '0.9375rem', color: 'var(--slate)' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '2rem' }}>
                <Link to="/auth?mode=signup">
                  <Button>Get Feedback Now</Button>
                </Link>
              </div>
            </div>
            <div
              style={{
                background: 'white',
                borderRadius: 'var(--radius-lg)',
                padding: '2rem',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)',
                fontFamily: 'Georgia, serif',
                lineHeight: 1.9,
                fontSize: '0.9375rem',
                color: 'var(--slate)',
              }}
            >
              <p style={{ marginBottom: '0.75rem' }}>
                Technology{' '}
                <span style={{ textDecoration: 'underline wavy var(--coral)', textUnderlineOffset: 3 }}>
                  have
                </span>{' '}
                changed our lives{' '}
                <span style={{ background: 'rgba(217,164,65,0.18)', borderRadius: 3, padding: '0 3px' }}>
                  dramatically
                </span>
                {' '}in recent years.
              </p>
              <div style={{ marginLeft: '1.5rem', borderLeft: '3px solid var(--coral)', paddingLeft: '1rem', marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--coral)', fontFamily: 'Inter, sans-serif', fontStyle: 'normal' }}>
                  <strong>Grammar:</strong> Subject-verb agreement — "Technology" is singular → "has changed"
                </p>
              </div>
              <div
                style={{
                  background: 'rgba(217,164,65,0.08)',
                  border: '1px solid rgba(217,164,65,0.3)',
                  borderRadius: 'var(--radius)',
                  padding: '0.75rem 1rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--gold)' }}>dramatically</span>
                <span style={{ color: 'var(--text-muted)' }}> → </span>
                <span style={{ fontWeight: 600 }}>profoundly / fundamentally</span>
                <br />
                <span style={{ color: 'var(--text-muted)' }}>O'zbek: keskin darajada · Example: "This has profoundly shaped society."</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'var(--ink-blue)', padding: '5rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ color: 'white', fontSize: '2.25rem', marginBottom: '1rem' }}>Ready to reach your target band?</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '2rem', fontSize: '1.0625rem' }}>
            Free to start. Upgrade for AI feedback.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" style={{ background: 'var(--gold)', fontSize: '1rem' } as React.CSSProperties}>
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}

function ModeCard({
  emoji, title, subtitle, description, bg, light,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  bg: string;
  light?: boolean;
}) {
  return (
    <div
      style={{
        background: bg,
        borderRadius: 'var(--radius-lg)',
        padding: '2rem',
        border: `1px solid ${light ? 'transparent' : 'var(--border)'}`,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{emoji}</div>
      <h3
        style={{
          fontFamily: 'Fraunces, serif',
          fontSize: '1.25rem',
          color: light ? 'white' : 'var(--ink-blue)',
          marginBottom: '0.25rem',
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: light ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', marginBottom: '0.75rem' }}>
        {subtitle}
      </p>
      <p style={{ fontSize: '0.9375rem', color: light ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', lineHeight: 1.7 }}>
        {description}
      </p>
    </div>
  );
}
