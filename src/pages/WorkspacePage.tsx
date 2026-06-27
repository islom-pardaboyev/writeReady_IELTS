import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getQuestion, saveSubmission } from '../firebase/firestore';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Question, PracticeMode, FeedbackResult } from '../types';

const MOCK_SECONDS = 40 * 60;

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const mode = (params.get('mode') ?? 'practice') as PracticeMode;
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [question, setQuestion] = useState<Question | null>(null);
  const [essay, setEssay] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(MOCK_SECONDS);
  const [timerRunning, setTimerRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) { navigate('/auth'); return; }
    if (!id) { navigate('/dashboard'); return; }
    getQuestion(id).then((q) => {
      setQuestion(q);
      setLoading(false);
    });
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id, user]);

  const startTimer = useCallback(() => {
    setStarted(true);
    setTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current!);
          setTimerRunning(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (mode !== 'mock') { setStarted(true); return; }
  }, [mode]);

  const isPro = profile?.plan === 'pro' || profile?.plan === 'forever';
  const wordCount = essay.trim() ? essay.trim().split(/\s+/).length : 0;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timerStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const timerUrgent = mode === 'mock' && timeLeft < 300;

  const handleSubmit = async () => {
    if (!question || !user) return;
    if (!essay.trim() || essay.trim().split(/\s+/).length < 10) {
      setError('Please write at least 10 words before submitting.');
      return;
    }
    setError('');
    setSubmitting(true);

    if (mode === 'mock' && timerRunning) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimerRunning(false);
    }

    if (!isPro) {
      const submissionId = await saveSubmission(user.uid, {
        questionId: question.id,
        questionText: question.promptText,
        essayText: essay,
        mode,
      });
      navigate(`/feedback/${submissionId}?locked=true`);
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const res = await fetch('/api/analyze-essay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essayText: essay,
          questionText: question.promptText,
          mode,
          idToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError(data.error || 'Access denied. Please check your subscription.');
        } else if (res.status === 429) {
          setError('Monthly limit reached. Your quota resets next month.');
        } else {
          setError(data.error || 'Analysis failed. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      const submissionId = await saveSubmission(user.uid, {
        questionId: question.id,
        questionText: question.promptText,
        essayText: essay,
        mode,
        feedback: data.feedback as FeedbackResult,
      });

      navigate(`/feedback/${submissionId}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  };

  const bgColor = mode === 'relax' ? 'var(--mist)' : 'var(--paper)';

  if (loading) {
    return (
      <Layout>
        <div className="py-16 text-center text-[var(--text-muted)]">
          Loading question…
        </div>
      </Layout>
    );
  }

  if (!question) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <p className="text-[var(--text-muted)] mb-4">Question not found.</p>
          <Link to="/dashboard"><Button>Back to Dashboard</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div
        className="min-h-[calc(100vh-120px)] py-8"
        style={{ background: bgColor }}
      >
        <div className="container">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link to="/dashboard" className="text-[var(--text-muted)] text-sm">
                ← Dashboard
              </Link>
              <ModeBadge mode={mode} />
            </div>

            <div className="flex items-center gap-4">
              <span className="font-mono text-sm text-[var(--text-muted)]">
                {wordCount} words
              </span>

              {mode === 'mock' && (
                <span
                  className={`font-mono text-xl font-medium px-3 py-1 rounded-[var(--radius)] border ${
                    timerUrgent
                      ? 'text-[var(--coral)] bg-[rgba(224,101,75,0.08)] border-[rgba(224,101,75,0.3)]'
                      : 'text-[var(--ink-blue)] bg-[rgba(28,58,94,0.06)] border-[rgba(28,58,94,0.15)]'
                  }`}
                >
                  {timerStr}
                </span>
              )}
            </div>
          </div>

          {/* Mock start overlay */}
          {mode === 'mock' && !started && (
            <Card className="text-center p-12 mb-6">
              <div className="text-5xl mb-4">⏱</div>
              <h2 className="mb-3">Ready for your Mock exam?</h2>
              <p className="text-[var(--text-muted)] max-w-[420px] mx-auto mb-4">
                You'll have <strong>40 minutes</strong> to complete this essay. The timer starts the moment you press Begin. No pausing, no hints.
              </p>
              <Button size="lg" onClick={startTimer}>
                Begin Mock Exam
              </Button>
            </Card>
          )}

          {(mode !== 'mock' || started) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
              {/* Question */}
              <Card>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', flexWrap: 'wrap' }}>
                  <span style={tagStyle}>
                    {question.taskType === 'task2' ? 'Task 2' : 'Task 1'}
                  </span>
                  <span style={{ ...tagStyle, background: 'rgba(217,164,65,0.1)', color: 'var(--gold)' }}>
                    {question.category}
                  </span>
                </div>
                <p
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: '1.0625rem',
                    lineHeight: 1.85,
                    color: 'var(--slate)',
                  }}
                >
                  {question.promptText}
                </p>
                {question.taskType === 'task2' && (
                  <p style={{ marginTop: '0.875rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Write at least 250 words. You should spend about 40 minutes on this task.
                  </p>
                )}
              </Card>

              {/* Text editor */}
              <div>
                <textarea
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  placeholder={
                    mode === 'relax'
                      ? 'Start writing — no pressure, explore your ideas…'
                      : mode === 'practice'
                      ? 'Write your response here. You can submit paragraph by paragraph for targeted feedback…'
                      : 'Write your essay here…'
                  }
                  style={{
                    width: '100%',
                    minHeight: 400,
                    padding: '1.5rem',
                    fontFamily: 'Georgia, serif',
                    fontSize: '1.0625rem',
                    lineHeight: 2,
                    color: 'var(--slate)',
                    background: 'white',
                    border: '1.5px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    resize: 'vertical',
                    outline: 'none',
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--ink-blue)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '0.75rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8125rem', color: wordCount < 250 ? 'var(--text-muted)' : 'var(--ink-blue)' }}>
                      {wordCount} / 250+ words
                    </span>
                    {!isPro && (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        ⚠️ Upgrade to Pro for AI feedback
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    {error && (
                      <span style={{ fontSize: '0.875rem', color: 'var(--coral)' }}>{error}</span>
                    )}
                    <Link to="/dashboard">
                      <Button variant="secondary" size="sm">Cancel</Button>
                    </Link>
                    <Button
                      onClick={handleSubmit}
                      loading={submitting}
                      disabled={!essay.trim()}
                    >
                      {isPro ? 'Submit & Analyze' : 'Submit Essay'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Timer expired warning for mock */}
              {mode === 'mock' && timeLeft === 0 && (
                <div
                  style={{
                    background: 'rgba(224,101,75,0.08)',
                    border: '1.5px solid var(--coral)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '1.25rem',
                    textAlign: 'center',
                  }}
                >
                  <strong style={{ color: 'var(--coral)' }}>Time's up!</strong>{' '}
                  <span style={{ color: 'var(--slate)' }}>Your 40 minutes have ended. Please submit your essay now.</span>
                </div>
              )}

              {/* Mode tips */}
              {mode === 'relax' && (
                <Card style={{ background: 'rgba(215,226,234,0.5)', border: '1px solid rgba(28,58,94,0.1)' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--ink-blue)', fontWeight: 500 }}>
                    ☕ Relax mode: No timer, no pressure. Use this space to brainstorm, explore vocabulary, or draft ideas before a real attempt.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function ModeBadge({ mode }: { mode: PracticeMode }) {
  const colors: Record<PracticeMode, { bg: string; color: string; label: string }> = {
    mock: { bg: 'var(--ink-blue)', color: 'white', label: '⏱ Mock' },
    practice: { bg: 'var(--paper-dark)', color: 'var(--slate)', label: '✏️ Practice' },
    relax: { bg: 'var(--mist)', color: 'var(--ink-blue)', label: '☕ Relax' },
  };
  const c = colors[mode];
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        fontSize: '0.75rem',
        fontWeight: 700,
        padding: '0.25rem 0.75rem',
        borderRadius: 20,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {c.label}
    </span>
  );
}

const tagStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.1875rem 0.5rem',
  background: 'rgba(28,58,94,0.07)',
  color: 'var(--ink-blue)',
  borderRadius: 20,
  fontSize: '0.6875rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
