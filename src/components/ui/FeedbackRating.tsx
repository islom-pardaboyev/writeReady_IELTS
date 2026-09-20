import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { sendReport } from '@/lib/report';

/**
 * One tap, asked at the only moment the student has an opinion: right after
 * they read their band score.
 *
 * A thumbs-up sends straight away and closes. A thumbs-down opens a small box
 * first, because "not useful" is worth far more when it says why — but the
 * rating is already recorded either way, so leaving without typing still tells
 * us something.
 *
 * Deliberately never blocks the report and never reappears once answered.
 */
export function FeedbackRating({ reportId }: { reportId: string }) {
  const storageKey = `rated:${reportId}`;
  const [done, setDone] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  const [askWhy, setAskWhy] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const finish = () => {
    try { sessionStorage.setItem(storageKey, '1'); } catch { /* private window — just don't remember */ }
    setDone(true);
  };

  const rate = async (rating: 'up' | 'down') => {
    if (rating === 'down') { setAskWhy(true); }
    // Record the tap immediately. If they close the tab without writing a
    // reason, the score is still captured.
    void sendReport({ type: 'rating', rating });
    if (rating === 'up') finish();
  };

  const sendReason = async () => {
    setSending(true);
    await sendReport({ type: 'rating', rating: 'down', message: note.trim() });
    setSending(false);
    finish();
  };

  if (done) {
    return (
      <p className="text-xs text-[var(--text-secondary)] py-3" role="status">
        Thanks — that helps us improve the feedback.
      </p>
    );
  }

  if (askWhy) {
    return (
      <div className="py-3">
        <label htmlFor="rating-note" className="block mb-1.5 text-xs font-semibold text-[var(--text-primary)]">
          Sorry about that. What was wrong with it?
        </label>
        <textarea
          id="rating-note"
          name="rating-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          rows={2}
          placeholder="The band score felt too high / the corrections were wrong…"
          className="w-full px-3.5 py-2.5 text-sm rounded-lg resize-none bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-color)] outline-none focus:border-[var(--ink-blue)] focus:ring-1 focus:ring-[var(--ink-blue)] placeholder:text-[var(--text-secondary)]/60"
        />
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={sendReason} loading={sending} disabled={!note.trim()}>
            Send
          </Button>
          <Button size="sm" variant="ghost" onClick={finish}>
            Skip
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-xs text-[var(--text-secondary)]">Was this feedback useful?</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => rate('up')}
          aria-label="Yes, this feedback was useful"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-emerald-600 hover:border-emerald-400 dark:hover:text-emerald-400 dark:hover:border-emerald-600 transition-colors"
        >
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => rate('down')}
          aria-label="No, this feedback was not useful"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-red-600 hover:border-red-400 dark:hover:text-red-400 dark:hover:border-red-600 transition-colors"
        >
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
