import { useNavigate } from 'react-router-dom';
import { Layout } from '../../components/layout/Layout';

const modes = [
  {
    id: 'mock',
    title: 'Mock Exam',
    emoji: '⏱',
    desc: 'Full 60-minute timed exam simulation. Both Task 1 and Task 2 with random questions. Download your answers as a PDF when done.',
    color: '#1C3A5E',
    textColor: 'white',
  },
  {
    id: 'practice',
    title: 'Practice Mode',
    emoji: '✏️',
    desc: 'No timer. Work through Task 1 and Task 2 at your own pace with random questions. Save your work as a PDF anytime.',
    color: 'white',
    textColor: '#1A2230',
  },
  {
    id: 'relax',
    title: 'Relax Mode',
    emoji: '☕',
    desc: 'Write with your own custom prompt. Enter any question you like, optionally upload a chart image, and write freely.',
    color: '#D7E2EA',
    textColor: '#1A2230',
  },
];

export function WritingPage() {
  const navigate = useNavigate();

  return (
    <Layout>
      <div style={{ padding: '3rem 0', minHeight: 'calc(100vh - 120px)' }}>
        <div className="container">
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2.25rem', marginBottom: '0.5rem' }}>
              Choose a Practice Mode
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
              Questions are selected randomly from the bank for Mock and Practice modes.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/writing/${m.id}`)}
                style={{
                  background: m.color,
                  border: `1.5px solid ${m.id === 'practice' ? 'var(--border)' : 'transparent'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-3px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>{m.emoji}</div>
                <div
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontSize: '1.375rem',
                    fontWeight: 700,
                    color: m.textColor,
                    marginBottom: '0.625rem',
                  }}
                >
                  {m.title}
                </div>
                <p style={{ fontSize: '0.9rem', color: m.id === 'mock' ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', lineHeight: 1.6 }}>
                  {m.desc}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
