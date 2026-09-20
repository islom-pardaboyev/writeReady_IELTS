import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { sendReport } from '@/lib/report';

/**
 * Catches a render crash and offers to report it, instead of leaving the user
 * on a blank white page that nobody ever hears about.
 *
 * The technical detail is attached automatically — a student cannot describe a
 * JavaScript error, but the browser can. All they have to type is what they
 * were doing, and even that is optional.
 *
 * A boundary only catches errors thrown while rendering. Errors inside event
 * handlers and rejected promises do not reach it; those paths show their own
 * messages today.
 */

interface Props { children: ReactNode }
interface State { error: Error | null; stack: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console too, so it is still visible in Vercel's logs.
    console.error('Unhandled render error:', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <CrashCard error={this.state.error} stack={this.state.stack} />;
  }
}

function CrashCard({ error, stack }: { error: Error; stack: string }) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [failure, setFailure] = useState('');

  const send = async () => {
    setStatus('sending');
    const res = await sendReport({
      type: 'crash',
      message: note.trim(),
      error: `${error.name}: ${error.message}`,
      stack: stack || error.stack || '',
    });
    if (res.ok) {
      setStatus('sent');
    } else {
      setStatus('failed');
      setFailure(res.error ?? '');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--bg-base)]">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-7 shadow-lg">
        <div className="text-3xl mb-3" aria-hidden="true">😕</div>
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Something went wrong</h1>

        {status === 'sent' ? (
          <>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Thank you — your report has been sent. We will look at it.
            </p>
            <Button onClick={() => window.location.assign('/')} className="w-full mt-6">
              Back to home
            </Button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Sorry about that. Telling us what you were doing helps us fix it — the
              technical details are added for you.
            </p>

            <label htmlFor="crash-note" className="block mt-5 mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              What were you doing? <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="crash-note"
              name="crash-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="I clicked Finish and the page went blank…"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg resize-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none focus:border-[var(--ink-blue)] focus:ring-1 focus:ring-[var(--ink-blue)] placeholder:text-[var(--text-secondary)]/60"
            />

            {status === 'failed' && (
              <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
                {failure || 'Could not send the report.'}
              </p>
            )}

            <div className="flex flex-col gap-2.5 mt-5">
              <Button onClick={send} loading={status === 'sending'} className="w-full">
                {status === 'failed' ? 'Try sending again' : 'Send report'}
              </Button>
              <Button variant="secondary" onClick={() => window.location.assign('/')} className="w-full">
                Back to home without sending
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
