import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LandingPage() {
  const { user } = useAuth();

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#0f172a', background: 'white' }}>

      {/* ── Nav ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 1.5rem', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1e3a5f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '0.875rem' }}>W</div>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>WriteReady <span style={{ color: '#c9900a' }}>IELTS</span></span>
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Link to="/writing" style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 500, padding: '0.375rem 0.875rem', borderRadius: 6, textDecoration: 'none' }}>Writing</Link>
            <Link to="/pricing" style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 500, padding: '0.375rem 0.875rem', borderRadius: 6, textDecoration: 'none' }}>Pricing</Link>
            {user ? (
              <Link to="/account" style={{ marginLeft: '0.5rem', background: '#1e3a5f', color: 'white', fontSize: '0.875rem', fontWeight: 600, padding: '0.5rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
                My Account
              </Link>
            ) : (
              <>
                <Link to="/auth?mode=login" style={{ color: '#475569', fontSize: '0.875rem', fontWeight: 500, padding: '0.375rem 0.875rem', borderRadius: 6, textDecoration: 'none' }}>Sign in</Link>
                <Link to="/auth?mode=signup" style={{ marginLeft: '0.25rem', background: '#1e3a5f', color: 'white', fontSize: '0.875rem', fontWeight: 600, padding: '0.5rem 1.25rem', borderRadius: 8, textDecoration: 'none' }}>
                  Start Free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '5rem 1.5rem 4rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
        {/* Left */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0.35rem 0.875rem', borderRadius: 20, marginBottom: '1.75rem' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
            AI-Powered · Uzbek & English
          </div>

          <h1 style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)', fontWeight: 900, lineHeight: 1.1, color: '#0f172a', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            IELTS Writing{' '}
            <span style={{ color: '#1d4ed8' }}>Feedback.</span>
            <br />
            Delivered instantly<br />through AI.
          </h1>

          <p style={{ fontSize: '1.0625rem', color: '#64748b', lineHeight: 1.75, marginBottom: '2rem', maxWidth: 440 }}>
            WriteReady combines real IELTS exam prompts with AI to deliver sentence-level feedback, vocabulary upgrades, and a band score — in both Uzbek and English.
          </p>

          <div style={{ display: 'flex', gap: '0.875rem', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap' }}>
            <Link to="/auth?mode=signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#1e3a5f', color: 'white', fontWeight: 700, fontSize: '0.9375rem', padding: '0.75rem 1.75rem', borderRadius: 50, textDecoration: 'none' }}>
              Check My Essay →
            </Link>
            <Link to="/writing/mock" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: '#334155', fontWeight: 600, fontSize: '0.9375rem', textDecoration: 'none' }}>
              Try a Test →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
            {[
              'First analysis free',
              'No credit card required',
              'Real exam-style prompts',
              'Sentence-level feedback',
            ].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#475569' }}>
                <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1rem' }}>✓</span> {t}
              </div>
            ))}
          </div>
        </div>

        {/* Right — feedback UI mockup */}
        <div style={{ position: 'relative' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
            {/* Mock header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.875rem', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f87171' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fbbf24' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#34d399' }} />
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>AI Feedback Report</span>
            </div>

            {/* Band score badge */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>Task 2 — Opinion Essay</span>
              <div style={{ background: '#1e3a5f', color: 'white', fontSize: '0.8125rem', fontWeight: 700, padding: '0.25rem 0.875rem', borderRadius: 20 }}>
                Band 7.0
              </div>
            </div>

            {/* Annotated text */}
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '0.9rem', lineHeight: 2, color: '#334155', marginBottom: '1rem', background: 'white', borderRadius: 8, padding: '1rem', border: '1px solid #e2e8f0' }}>
              <p>
                Technology{' '}
                <span style={{ textDecoration: 'underline wavy #ef4444', textUnderlineOffset: 3 }}>have</span>
                {' '}changed our lives{' '}
                <span style={{ background: 'rgba(234,179,8,0.15)', borderRadius: 3, padding: '0 3px', fontWeight: 500 }}>dramatically</span>
                {' '}in recent years.
              </p>
            </div>

            {/* Grammar note */}
            <div style={{ borderLeft: '3px solid #ef4444', paddingLeft: '0.875rem', marginBottom: '0.875rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.125rem' }}>Grammar</p>
              <p style={{ fontSize: '0.8rem', color: '#64748b' }}>"Technology" is singular → use "has changed"</p>
            </div>

            {/* Vocab card */}
            <div style={{ background: 'rgba(234,179,8,0.07)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>dramatically</span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>→</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>profoundly</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>O'zbek: keskin darajada · C1 level</p>
            </div>
          </div>

          {/* Floating band card */}
          <div style={{
            position: 'absolute', bottom: -20, right: -20,
            background: 'white', borderRadius: 12, padding: '1rem 1.25rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0',
            minWidth: 160,
          }}>
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Criteria scores</p>
            {[['Task Achievement', '7.0'], ['Coherence', '7.5'], ['Lexical Resource', '6.5'], ['Grammar', '7.0']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem', color: '#334155', padding: '0.125rem 0' }}>
                <span>{k}</span>
                <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '2.5rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { value: 'Band 7+', sub: 'Target score', note: 'IELTS Writing' },
            { value: '4', sub: 'Scoring criteria', note: 'TA · CC · LR · GRA' },
            { value: 'Instant', sub: 'AI feedback', note: 'Uzbek & English' },
            { value: '3 modes', sub: 'Practice styles', note: 'Mock · Practice · Relax' },
          ].map((s) => (
            <div key={s.sub} style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', marginBottom: '0.125rem' }}>{s.value}</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#334155', marginBottom: '0.125rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.sub}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ maxWidth: 1160, margin: '0 auto', padding: '5rem 1.5rem' }}>
        <div style={{ marginBottom: '3rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8', marginBottom: '0.5rem' }}>Simple process</p>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>Three steps to a higher band</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
          {[
            { n: '01', title: 'Choose your mode', desc: 'Mock exam for pressure, Practice for pace, or Relax for free writing with your own prompt.' },
            { n: '02', title: 'Write your essay', desc: 'Real IELTS Task 1 and Task 2 prompts, selected randomly from our exam bank.' },
            { n: '03', title: 'Get AI feedback', desc: 'Sentence-level grammar notes, vocabulary upgrades with Uzbek meanings, and a band score estimate.' },
          ].map((s) => (
            <div key={s.n} style={{ background: '#f8fafc', borderRadius: 12, padding: '2rem', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 900, color: '#e2e8f0', lineHeight: 1, marginBottom: '1rem', letterSpacing: '-0.02em' }}>{s.n}</div>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>{s.title}</h3>
              <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Modes ── */}
      <section style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '5rem 1.5rem' }}>
          <div style={{ marginBottom: '3rem' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1d4ed8', marginBottom: '0.5rem' }}>Practice modes</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>One goal, three ways to train</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {[
              { emoji: '⏱', title: 'Mock Exam', tag: 'Exam simulation', desc: '60-minute timer, both Task 1 and Task 2. Mirrors the real IELTS on-computer experience.', bg: '#1e3a5f', light: true },
              { emoji: '✏️', title: 'Practice Mode', tag: 'Targeted improvement', desc: 'No timer pressure. Work through tasks at your own pace with randomly selected prompts.', bg: 'white', light: false },
              { emoji: '☕', title: 'Relax Mode', tag: 'Free writing', desc: 'Use your own custom prompt. Enter any question you like, optionally upload a chart, and write freely.', bg: '#eff6ff', light: false },
            ].map((m) => (
              <Link key={m.title} to="/writing" style={{ textDecoration: 'none' }}>
                <div style={{ background: m.bg, borderRadius: 12, padding: '2rem', border: m.light ? 'none' : '1px solid #e2e8f0', height: '100%', transition: 'transform 0.15s, box-shadow 0.15s', display: 'block', cursor: 'pointer' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = ''; }}
                >
                  <div style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>{m.emoji}</div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: m.light ? 'rgba(255,255,255,0.5)' : '#94a3b8', marginBottom: '0.375rem' }}>{m.tag}</div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: m.light ? 'white' : '#0f172a', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>{m.title}</h3>
                  <p style={{ fontSize: '0.875rem', color: m.light ? 'rgba(255,255,255,0.7)' : '#64748b', lineHeight: 1.7 }}>{m.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: '#0f172a', padding: '5rem 1.5rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', marginBottom: '1rem' }}>
            Ready to reach your target band?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '1rem', marginBottom: '2rem', lineHeight: 1.7 }}>
            Free to start. Upgrade for unlimited AI feedback in Uzbek and English.
          </p>
          <Link to="/auth?mode=signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: '#c9900a', color: 'white', fontWeight: 700, fontSize: '1rem', padding: '0.875rem 2rem', borderRadius: 50, textDecoration: 'none' }}>
            Create Free Account →
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: '#0f172a', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1.5rem', textAlign: 'center' }}>
        <p style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.3)' }}>
          © {new Date().getFullYear()} WriteReady IELTS · AI-powered writing coach
        </p>
      </footer>

    </div>
  );
}
