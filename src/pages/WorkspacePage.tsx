import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useUnsavedWork } from '../hooks/useUnsavedWork';
import { getQuestion, saveSubmission } from '../firebase/firestore';
import { AppShell } from '../components/layout/AppShell';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Question, PracticeMode } from '../types';

const MOCK_SECONDS = 40 * 60;

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const mode = (params.get('mode') ?? 'practice') as PracticeMode;
  const { user, profile, loading: authLoading } = useAuth();
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
    // Wait for Firebase Auth to finish rehydrating before deciding the
    // visitor is signed out — otherwise a hard refresh on this page bounces a
    // signed-in user to /auth before their session has a chance to load.
    if (authLoading) return;
    if (!user) { navigate('/auth'); return; }
    if (!id) { navigate('/dashboard'); return; }
    getQuestion(id).then((q) => {
      setQuestion(q);
      setLoading(false);
    });
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [id, user, authLoading, navigate]);

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

  const hasUnsavedWork = essay.trim().length > 0 && !submitting;

  const confirmLeave = useUnsavedWork(hasUnsavedWork);

  const isPro = profile?.plan === 'basic' || profile?.plan === 'standard' || profile?.plan === 'premium' || profile?.plan === 'forever';
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

    try {
      const submissionId = await saveSubmission(user.uid, {
        questionId: question.id,
        questionText: question.promptText,
        essayText: essay,
        mode,
      });
      // FeedbackPage auto-triggers /api/feedback for Pro users; locked=true for free users
      navigate(`/feedback/${submissionId}${isPro ? '' : '?locked=true'}`);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  };

  const bgColor = mode === 'relax' ? 'var(--mist)' : 'var(--paper)';

  if (loading) {
    return (
      <AppShell>
        <div className="py-16 text-center text-[var(--text-muted)]">
          Loading question…
        </div>
      </AppShell>
    );
  }

  if (!question) {
    return (
      <AppShell>
        <div className="py-16 text-center">
          <p className="text-[var(--text-muted)] mb-4">Question not found.</p>
          <Link to="/dashboard" onClick={confirmLeave}><Button>Back to Dashboard</Button></Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className="min-h-[calc(100vh-120px)] py-8"
        style={{ background: bgColor }}
      >
        <div className="container">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Link to="/dashboard" onClick={confirmLeave} className="text-[var(--text-muted)] text-sm">
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
                      ? 'text-[var(--coral)] bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.3)]'
                      : 'text-[var(--ink-blue)] bg-[rgba(79,70,229,0.06)] border-[rgba(79,70,229,0.15)]'
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
            <div className="grid grid-cols-1 gap-6">
              {/* Question */}
              <Card>
                <div className="flex gap-2 mb-[0.875rem] flex-wrap">
                  <span className={tagClassName}>
                    {question.taskType === 'task2' ? 'Task 2' : 'Task 1'}
                  </span>
                  <span className={`${tagClassName} !bg-[rgba(245,158,11,0.1)] !text-[var(--gold)]`}>
                    {question.category}
                  </span>
                </div>
                <p className="font-serif text-[1.0625rem] leading-[1.85] text-[var(--slate)]">
                  {question.promptText}
                </p>
                {question.taskType === 'task2' && (
                  <p className="mt-[0.875rem] text-sm text-[var(--text-muted)]">
                    Write at least 250 words. You should spend about 40 minutes on this task.
                  </p>
                )}
              </Card>

              {/* Text editor */}
              <div>
                <textarea name="your-essay-response" autoComplete="off"
                  aria-label="Your essay response"
                  value={essay}
                  onChange={(e) => setEssay(e.target.value)}
                  placeholder={
                    mode === 'relax'
                      ? 'Start writing. No pressure, explore your ideas…'
                      : mode === 'practice'
                      ? 'Write your response here. You can submit paragraph by paragraph for targeted feedback…'
                      : 'Write your essay here…'
                  }
                  className="w-full min-h-[400px] p-6 font-serif text-[1.0625rem] leading-loose text-[var(--slate)] bg-white border-[1.5px] border-[var(--border)] rounded-[var(--radius-lg)] resize-y outline-none shadow-[var(--shadow-sm)] transition-[border-color] duration-150 focus:border-[var(--ink-blue)]"
                />
                <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                  <div className="flex gap-4 items-center">
                    <span className={`font-mono text-[0.8125rem] ${wordCount < 250 ? 'text-[var(--text-muted)]' : 'text-[var(--ink-blue)]'}`}>
                      {wordCount} / 250+ words
                    </span>
                    {!isPro && (
                      <span className="text-[0.8125rem] text-[var(--text-muted)]">
                        ⚠️ Upgrade to Pro for AI feedback
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 items-center">
                    {error && (
                      <span className="text-sm text-[var(--coral)]">{error}</span>
                    )}
                    <Link to="/dashboard" onClick={confirmLeave}>
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
                <div className="bg-[rgba(239,68,68,0.08)] border-[1.5px] border-[var(--coral)] rounded-[var(--radius-lg)] p-5 text-center">
                  <strong className="text-[var(--coral)]">Time's up!</strong>{' '}
                  <span className="text-[var(--slate)]">Your 40 minutes have ended. Please submit your essay now.</span>
                </div>
              )}

              {/* Mode tips */}
              {mode === 'relax' && (
                <Card className="bg-[rgba(241,245,249,0.5)] border border-[rgba(79,70,229,0.1)]">
                  <p className="text-sm text-[var(--ink-blue)] font-medium">
                    ☕ Relax mode: No timer, no pressure. Use this space to brainstorm, explore vocabulary, or draft ideas before a real attempt.
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function ModeBadge({ mode }: { mode: PracticeMode }) {
  const colors: Record<PracticeMode, { className: string; label: string }> = {
    mock: { className: 'bg-[var(--ink-blue-solid)] text-white', label: '⏱ Mock' },
    practice: { className: 'bg-[var(--paper-dark)] text-[var(--slate)]', label: '✏️ Practice' },
    relax: { className: 'bg-[var(--mist)] text-[var(--ink-blue)]', label: '☕ Relax' },
  };
  const c = colors[mode];
  return (
    <span
      className={`${c.className} text-[0.75rem] font-bold px-3 py-1 rounded-full uppercase tracking-[0.05em]`}
    >
      {c.label}
    </span>
  );
}

const tagClassName = 'inline-block px-2 py-[0.1875rem] bg-[rgba(79,70,229,0.07)] text-[var(--ink-blue)] rounded-full text-[0.6875rem] font-bold uppercase tracking-[0.05em]';
