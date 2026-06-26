import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useAuth } from '../contexts/AuthContext';
import { useUsage } from '../hooks/useUsage';
import { getQuestions, seedQuestions } from '../firebase/firestore';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import type { Question, PracticeMode } from '../types';

gsap.registerPlugin(ScrollTrigger);

const modes = [
  { id: 'mock', emoji: '⏱', title: 'Mock Exam', desc: '60-min timer · Exam simulation' },
  { id: 'practice', emoji: '✏️', title: 'Practice', desc: 'No timer · Build your skills' },
  { id: 'relax', emoji: '☕', title: 'Relax', desc: 'Your prompt · Write freely' },
];

export function DashboardPage() {
  const { user, profile } = useAuth();
  const { usage } = useUsage(user?.uid ?? null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQ, setLoadingQ] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    getQuestions(10).then((q) => {
      setQuestions(q);
      setLoadingQ(false);
    });
  }, [user]);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.gs-db-welcome', { y: 28, opacity: 0 });
      gsap.set('.gs-db-quota', { y: 20, opacity: 0 });
      gsap.set('.gs-db-mode-card', { y: 32, opacity: 0 });

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.to('.gs-db-welcome', { y: 0, opacity: 1, duration: 0.6 })
        .to('.gs-db-quota', { y: 0, opacity: 1, duration: 0.5 }, '-=0.3')
        .to('.gs-db-mode-card', { y: 0, opacity: 1, duration: 0.5, stagger: 0.1 }, '-=0.25');

      gsap.from('.gs-db-question', {
        scrollTrigger: { trigger: '.gs-db-questions', start: 'top 85%' },
        y: 24, opacity: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out',
      });

      gsap.from('.gs-db-upsell', {
        scrollTrigger: { trigger: '.gs-db-upsell', start: 'top 88%' },
        y: 36, opacity: 0, duration: 0.65, ease: 'power3.out',
      });
    }, rootRef);

    return () => ctx.revert();
  }, []);

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
  const usedCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? 12;
  const usagePct = Math.min(100, (usedCount / usageLimit) * 100);
  const remaining = usageLimit - usedCount;

  return (
    <Layout>
      <div style={{ padding: '2.5rem 0', minHeight: 'calc(100vh - 120px)', background: '#f8fafc' }}>
        <div className="container" ref={rootRef}>

          {/* Welcome header */}
          <div className="gs-db-welcome" style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.375rem' }}>
              Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
            </h1>
            <p style={{ color: '#64748b' }}>
              {isPro
                ? `${remaining} AI analyses remaining this month`
                : 'Free plan — upgrade to unlock AI feedback'}
            </p>
          </div>

          {/* Quota bar for pro users */}
          {isPro && usage && (
            <div
              className="gs-db-quota"
              style={{
                background: 'white',
                borderRadius: 16,
                padding: '1.25rem 1.5rem',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                marginBottom: '2rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#0f172a' }}>Monthly AI Feedback Quota</span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    color: usagePct >= 85 ? '#ef4444' : '#1d4ed8',
                  }}
                >
                  {usedCount}/{usageLimit}
                </span>
              </div>
              <div style={{ height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${usagePct}%`,
                    background: usagePct >= 85 ? '#ef4444' : '#1d4ed8',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Mode picker */}
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '1rem' }}>Choose a practice mode</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
            {modes.map((m) => (
              <button
                key={m.id}
                className="gs-db-mode-card"
                onClick={() => navigate(`/writing/${m.id}`)}
                style={{
                  background: m.id === 'mock' ? '#1d4ed8' : m.id === 'relax' ? '#f0fdf4' : 'white',
                  border: `1.5px solid ${m.id === 'mock' ? 'transparent' : m.id === 'relax' ? '#bbf7d0' : '#e2e8f0'}`,
                  borderRadius: 14,
                  padding: '1.5rem',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.transform = '';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                }}
              >
                <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>{m.emoji}</div>
                <div
                  style={{
                    fontFamily: 'Fraunces, serif',
                    fontSize: '1.125rem',
                    fontWeight: 700,
                    color: m.id === 'mock' ? 'white' : '#0f172a',
                    marginBottom: '0.25rem',
                  }}
                >
                  {m.title}
                </div>
                <div style={{ fontSize: '0.8125rem', color: m.id === 'mock' ? 'rgba(255,255,255,0.75)' : '#64748b' }}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Question bank */}
          <div className="gs-db-questions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>Question Bank</h2>
            {questions.length === 0 && !loadingQ && (
              <Button size="sm" onClick={handleSeed} loading={seeding}>
                Load sample questions
              </Button>
            )}
          </div>

          {loadingQ ? (
            <p style={{ color: '#64748b' }}>Loading questions…</p>
          ) : questions.length === 0 ? (
            <div
              style={{
                background: 'white', borderRadius: 14, padding: '2rem',
                border: '1px solid #e2e8f0', textAlign: 'center',
              }}
            >
              <p style={{ color: '#64748b' }}>No questions yet. Click "Load sample questions" to seed some examples.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="gs-db-question"
                  style={{
                    background: 'white',
                    borderRadius: 14,
                    padding: '1.125rem 1.25rem',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '1rem',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={tagStyle('#1d4ed8')}>
                        {q.taskType === 'task2' ? 'Task 2' : 'Task 1'}
                      </span>
                      <span style={tagStyle('#c9900a')}>{q.category}</span>
                      <span style={tagStyle('#64748b')}>{q.topic}</span>
                    </div>
                    <p style={{ fontSize: '0.9375rem', color: '#334155', lineHeight: 1.6, margin: 0 }}>
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
                          background: m.id === 'mock' ? '#1d4ed8' : m.id === 'relax' ? '#f0fdf4' : '#f1f5f9',
                          color: m.id === 'mock' ? 'white' : '#334155',
                          border: 'none',
                          borderRadius: 6,
                          padding: '0.375rem 0.625rem',
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                        }}
                      >
                        {m.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}


          {!isPro && (
            <div
              className="gs-db-upsell"
              style={{
                marginTop: '3rem',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
                borderRadius: 16,
                padding: '2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3 style={{ fontFamily: 'Fraunces, serif', color: 'white', marginBottom: '0.375rem', fontSize: '1.25rem' }}>
                  Unlock AI Feedback
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', margin: 0 }}>
                  Get sentence-level corrections, vocabulary upgrades, and a band score estimate.
                </p>
              </div>
              <Link to="/pricing">
                <Button style={{ background: '#c9900a', flexShrink: 0 } as React.CSSProperties}>
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

function tagStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    background: `${color}18`,
    color,
    borderRadius: 20,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };
}
