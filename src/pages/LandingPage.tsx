import { Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';

export function LandingPage() {
  return (
    <Layout>
      {/* ── Hero ── */}
      <section
        style={{
          background: 'var(--ink-blue)',
          color: 'white',
          padding: '6rem 0 5rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* grid overlay */}
        <div
          style={{
            position: 'absolute', inset: 0, opacity: 0.05,
            backgroundImage:
              'repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 48px),' +
              'repeating-linear-gradient(90deg,#fff 0,#fff 1px,transparent 1px,transparent 48px)',
          }}
        />
        <div className="container" style={{ position: 'relative' }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              background: 'rgba(217,164,65,0.12)', border: '1px solid rgba(217,164,65,0.35)',
              color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '0.35rem 1rem', borderRadius: 20, marginBottom: '2rem',
            }}
          >
            <span style={{ fontSize: '0.75rem' }}>✦</span>
            AI-Powered IELTS Writing Coach
          </div>

          <h1
            style={{
              fontFamily: 'Fraunces, serif',
              fontSize: 'clamp(2.75rem, 7vw, 4.5rem)',
              fontWeight: 900,
              color: 'white',
              lineHeight: 1.1,
              margin: '0 auto 1.5rem',
              maxWidth: 700,
            }}
          >
            Write better.<br />
            <span style={{ color: 'var(--gold)' }}>Score higher.</span>
          </h1>

          <p
            style={{
              fontSize: '1.0625rem',
              color: 'rgba(255,255,255,0.7)',
              maxWidth: 480,
              margin: '0 auto 2.5rem',
              lineHeight: 1.75,
            }}
          >
            Sentence-by-sentence AI feedback in Uzbek and English.
            Practice in Mock, Practice, or Relax mode.
          </p>

          <div style={{ display: 'flex', gap: '0.875rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
            <Link to="/auth?mode=signup">
              <Button size="lg" style={{ background: 'var(--gold)', fontSize: '0.9375rem', padding: '0.75rem 1.75rem' } as React.CSSProperties}>
                Start Practicing Free
              </Button>
            </Link>
            <Link to="/pricing">
              <Button size="lg" variant="secondary" style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', fontSize: '0.9375rem' } as React.CSSProperties}>
                See Pricing
              </Button>
            </Link>
          </div>

          {/* Stats row */}
          <div
            style={{
              display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '0.5rem',
            }}
          >
            {[
              { value: '4', label: 'Scoring criteria' },
              { value: 'Band 7+', label: 'Target score' },
              { value: 'Uzbek & English', label: 'Feedback language' },
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12,
                  padding: '0.75rem 1.5rem',
                  textAlign: 'center',
                  minWidth: 130,
                }}
              >
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.375rem', fontWeight: 700, color: 'var(--gold)', marginBottom: 2 }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ padding: '5rem 0', background: 'white' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--ink-blue)' }}>
              How it works
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Three steps to better writing</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
            {[
              { step: '01', title: 'Choose a mode', desc: 'Mock exam for pressure, Practice for pace, or Relax for exploration.' },
              { step: '02', title: 'Write your essay', desc: 'Task 1 and Task 2 prompts selected randomly from a real exam bank.' },
              { step: '03', title: 'Get AI feedback', desc: 'Sentence-level grammar notes, vocab upgrades, and a band score estimate.' },
            ].map((s) => (
              <div
                key={s.step}
                style={{
                  background: 'var(--paper)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  border: '1px solid var(--border)',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    color: 'var(--gold)',
                    opacity: 0.25,
                    lineHeight: 1,
                    marginBottom: '1rem',
                  }}
                >
                  {s.step}
                </div>
                <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.1875rem', color: 'var(--ink-blue)', marginBottom: '0.5rem' }}>
                  {s.title}
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Three modes ── */}
      <section style={{ padding: '5rem 0', background: 'var(--paper)' }}>
        <div className="container">
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '2rem', marginBottom: '0.5rem', color: 'var(--ink-blue)' }}>
              Three modes, one goal
            </h2>
            <p style={{ color: 'var(--text-muted)' }}>Choose your practice style and build exam confidence your way</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {[
              {
                emoji: '⏱', title: 'Mock Exam', subtitle: 'Exam simulation',
                desc: '60-minute timer, both tasks. Mirrors the real IELTS on-computer experience with pressure and conditions.',
                bg: 'var(--ink-blue)', light: true,
              },
              {
                emoji: '✏️', title: 'Practice Mode', subtitle: 'Targeted improvement',
                desc: 'No timer. Work through Task 1 and Task 2 at your own pace with random questions.',
                bg: 'white', light: false,
              },
              {
                emoji: '☕', title: 'Relax Mode', subtitle: 'Low-pressure drafting',
                desc: 'Write with your own custom prompt. Enter any question you like and write freely.',
                bg: 'var(--mist)', light: false,
              },
            ].map((m) => (
              <Link key={m.title} to="/writing" style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    background: m.bg,
                    borderRadius: 'var(--radius-lg)',
                    padding: '2rem',
                    border: m.light ? '1px solid transparent' : '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)',
                    height: '100%',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-sm)'; }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.875rem' }}>{m.emoji}</div>
                  <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', color: m.light ? 'white' : 'var(--ink-blue)', marginBottom: '0.25rem' }}>
                    {m.title}
                  </h3>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: m.light ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', marginBottom: '0.75rem' }}>
                    {m.subtitle}
                  </p>
                  <p style={{ fontSize: '0.9rem', color: m.light ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', lineHeight: 1.7 }}>
                    {m.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feedback preview ── */}
      <section style={{ padding: '5rem 0', background: 'var(--paper-dark)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3.5rem', alignItems: 'center' }}>
            <div>
              <div
                style={{
                  display: 'inline-block', background: 'rgba(217,164,65,0.1)',
                  border: '1px solid rgba(217,164,65,0.3)', color: 'var(--gold)',
                  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', padding: '0.3rem 0.875rem',
                  borderRadius: 20, marginBottom: '1.25rem',
                }}
              >
                AI Feedback
              </div>
              <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '2rem', marginBottom: '1rem', color: 'var(--ink-blue)' }}>
                Feedback like a real teacher
              </h2>
              <p style={{ color: 'var(--text-muted)', lineHeight: 1.8, marginBottom: '1.5rem', fontSize: '0.9375rem' }}>
                Not a generic AI response — annotations styled like ink on paper. Coral underlines for grammar corrections, gold highlights for vocabulary upgrades.
              </p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                {[
                  'Sentence-by-sentence grammar & coherence notes',
                  'Vocabulary upgrades with Uzbek + English meanings',
                  'Band score estimate (1–9)',
                  'Model paragraph showing a stronger version',
                ].map((f) => (
                  <li key={f} style={{ display: 'flex', gap: '0.625rem', fontSize: '0.9rem', color: 'var(--slate)', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--gold)', fontWeight: 700, marginTop: 1 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '2rem' }}>
                <Link to="/auth?mode=signup">
                  <Button>Get Feedback Now</Button>
                </Link>
              </div>
            </div>

            {/* Annotation mockup */}
            <div
              style={{
                background: 'white', borderRadius: 'var(--radius-lg)',
                padding: '2rem', border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-md)', fontFamily: 'Georgia, serif',
                lineHeight: 1.9, fontSize: '0.9375rem', color: 'var(--slate)',
              }}
            >
              <p style={{ marginBottom: '0.75rem' }}>
                Technology{' '}
                <span style={{ textDecoration: 'underline wavy var(--coral)', textUnderlineOffset: 3 }}>have</span>
                {' '}changed our lives{' '}
                <span style={{ background: 'rgba(217,164,65,0.18)', borderRadius: 3, padding: '0 3px' }}>dramatically</span>
                {' '}in recent years.
              </p>
              <div style={{ marginLeft: '1.5rem', borderLeft: '3px solid var(--coral)', paddingLeft: '1rem', marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--coral)', fontFamily: 'Inter, sans-serif', fontStyle: 'normal' }}>
                  <strong>Grammar:</strong> Subject-verb agreement — "Technology" is singular → "has changed"
                </p>
              </div>
              <div
                style={{
                  background: 'rgba(217,164,65,0.08)', border: '1px solid rgba(217,164,65,0.3)',
                  borderRadius: 'var(--radius)', padding: '0.75rem 1rem',
                  fontSize: '0.8125rem', fontFamily: 'Inter, sans-serif',
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--gold)' }}>dramatically</span>
                <span style={{ color: 'var(--text-muted)' }}> → </span>
                <span style={{ fontWeight: 600 }}>profoundly / fundamentally</span>
                <br />
                <span style={{ color: 'var(--text-muted)' }}>O'zbek: keskin darajada · "This has profoundly shaped society."</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: 'var(--ink-blue)', padding: '5rem 0', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ fontFamily: 'Fraunces, serif', color: 'white', fontSize: '2.25rem', marginBottom: '1rem' }}>
            Ready to reach your target band?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: '2rem', fontSize: '1rem' }}>
            Free to start. Upgrade for unlimited AI feedback.
          </p>
          <Link to="/auth?mode=signup">
            <Button size="lg" style={{ background: 'var(--gold)', fontSize: '0.9375rem' } as React.CSSProperties}>
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>
    </Layout>
  );
}
