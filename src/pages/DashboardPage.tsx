import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { getQuestions, seedQuestions } from '../firebase/firestore';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import type { Question, PracticeMode } from '../types';
import { Coffee, Pen, Timer } from 'lucide-react';

export function DashboardPage() {
  const { user, profile } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    getQuestions(10).then((q) => {
      setQuestions(q);
      setLoadingQ(false);
    });
  }, [user]);

  const handleSeed = async () => {
    setSeeding(true);
    await seedQuestions();
    const q = await getQuestions(10);
    setQuestions(q);
    setSeeding(false);
  };

  const startPractice = (_questionId: string, mode: PracticeMode) => {
    navigate(`/writing/${mode}`);
  };

  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';
  const remaining = usage ? usage.limit - usage.count : null;

  return (
    <Layout>
      <div style={{ padding: '2.5rem 0', minHeight: 'calc(100vh - 120px)' }}>
        <div className="container">
          {/* Welcome header */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.375rem' }}>
              Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              {isPro
                ? `${remaining ?? '–'} AI analyses remaining this month`
                : 'Free plan — upgrade to unlock AI feedback'}
            </p>
          </div>

          {/* Quota bar for pro users */}
          {isPro && usage && (
            <Card style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>Monthly AI Feedback Quota</span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: remaining! > 3 ? 'var(--ink-blue)' : 'var(--coral)',
                  }}
                >
                  {usage.count}/{usage.limit}
                </span>
              </div>
              <div style={{ height: 8, background: 'var(--paper-dark)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (usage.count / usage.limit) * 100)}%`,
                    background: remaining! > 3 ? 'var(--ink-blue)' : 'var(--coral)',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </Card>
          )}

          {/* Mode picker */}
          <h2 style={{ fontSize: '1.375rem', marginBottom: '1rem' }}>Choose a practice mode</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '3rem' }}>
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => navigate(`/writing/${m.id}`)}
                style={{
                  background: m.id === 'mock' ? 'var(--ink-blue)' : m.id === 'relax' ? 'var(--mist)' : 'white',
                  border: `1.5px solid ${m.id === 'mock' ? 'transparent' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.5rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-md)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-sm)'; }}
              >
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{m.emoji}</div>
                <div
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: m.id === 'mock' ? 'white' : 'var(--ink-blue)',
                    marginBottom: '0.25rem',
                  }}
                >
                  {m.title}
                </div>
                <div style={{ fontSize: '0.8125rem', color: m.id === 'mock' ? 'rgba(255,255,255,0.65)' : 'var(--text-muted)' }}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Question bank */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.375rem' }}>Question Bank</h2>
            {questions.length === 0 && !loadingQ && (
              <Button size="sm" onClick={handleSeed} loading={seeding}>
                Load sample questions
              </Button>
            )}
          </div>

          {loadingQ ? (
            <p style={{ color: 'var(--text-muted)' }}>Loading questions…</p>
          ) : questions.length === 0 ? (
            <Card>
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                No questions yet. Click "Load sample questions" to seed some examples.
              </p>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {questions.map((q) => (
                <Card key={q.id} padding="md" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={tagStyle('var(--ink-blue)')}>
                        {q.taskType === 'task2' ? 'Task 2' : 'Task 1'}
                      </span>
                      <span style={tagStyle('var(--gold)')}>{q.category}</span>
                      <span style={tagStyle('var(--text-muted)')}>{q.topic}</span>
                    </div>
                    <p style={{ fontSize: '0.9375rem', color: 'var(--slate)', lineHeight: 1.6 }}>
                      {q.promptText.length > 150 ? q.promptText.slice(0, 150) + '…' : q.promptText}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap' }}>
                    {modes.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => startPractice(q.id, m.id as PracticeMode)}
                        title={m.title}
                        style={{
                          background: m.id === 'mock' ? 'var(--ink-blue)' : m.id === 'relax' ? 'var(--mist)' : 'var(--paper-dark)',
                          color: m.id === 'mock' ? 'white' : 'var(--slate)',
                          border: 'none',
                          borderRadius: 6,
                          padding: '0.375rem 0.625rem',
                          fontSize: '0.8125rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {m.emoji}
                      </button>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!isPro && (
            <div
              style={{
                marginTop: '3rem',
                background: 'var(--ink-blue)',
                borderRadius: 'var(--radius-lg)',
                padding: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ fontFamily: 'Fraunces, serif', color: 'white', marginBottom: '0.375rem' }}>
                  Unlock AI Feedback
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9375rem' }}>
                  Get sentence-level corrections, vocabulary upgrades, and a band score estimate.
                </p>
              </div>
              <Link to="/pricing">
                <Button style={{ background: 'var(--gold)', flexShrink: 0 } as React.CSSProperties}>
                  Upgrade to Pro
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

const modes = [
  { id: 'mock', emoji: <Timer />, title: 'Mock', desc: '40-min timer · Exam simulation' },
  { id: 'practice', emoji: <Pen />, title: 'Practice', desc: 'No timer · Per-paragraph feedback' },
  { id: 'relax', emoji: <Coffee />, title: 'Relax', desc: 'No pressure · Vocabulary focus' },
];

function tagStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    background: `${color}15`,
    color,
    borderRadius: 20,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
}
