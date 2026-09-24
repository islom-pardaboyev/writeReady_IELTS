import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, FileDown, ImageDown, Share2, ShieldCheck, Shuffle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Button } from './Button';
import { Input } from './input';
import { Label } from './label';
import { useAuth } from '@/hooks/useAuth';
import { useSingleRun } from '@/hooks/useSingleRun';
import {
  cardFileName, cardImage, cardPdf, quotesFor, saveFile, taskPage, writingBandPage, type CardPage,
} from '@/lib/scoreCard';
import { writingBand } from '@shared/bandScore';
import { MAX_CARD_NAME, cleanCardName } from '@shared/verifyCode';
import type { FeedbackScores } from '@/types';

/** One marked task: its bands, and the history entry it is saved as (needed to verify it). */
export interface TaskReport {
  scores: FeedbackScores;
  reportId?: string;
}

/**
 * What the card is about. One task gets a card the student can save as an
 * image or a PDF. A full test (both tasks) gets a three-page PDF only:
 * Task 1, Task 2, and the Writing band from both.
 */
export type ScoreCardSource =
  | { kind: 'task'; taskType: 'Task 1' | 'Task 2'; report: TaskReport }
  | { kind: 'full'; task1: TaskReport | null; task2: TaskReport | null };

interface ScoreCardDialogProps {
  onClose: () => void;
  /** The name from the student's account. They can change it for the card. */
  defaultName: string;
  source: ScoreCardSource;
}

type Verify = { code: string; url: string };

function buildPages(source: ScoreCardSource, name: string, quote: string, verify: Verify | undefined): CardPage[] {
  if (source.kind === 'task') return [{ ...taskPage(name, source.taskType, source.report.scores, { quote }), verify }];
  const { task1, task2 } = source;
  const note = task1 && task2
    ? 'Part of a full Writing test. Your Writing band from both tasks is on page 3.'
    : 'Part of a full Writing test. The Writing band needs feedback on both tasks.';
  const pages: CardPage[] = [];
  if (task1) pages.push(taskPage(name, 'Task 1', task1.scores, { context: 'Full test · Task 1', note }));
  if (task2) pages.push(taskPage(name, 'Task 2', task2.scores, { context: 'Full test · Task 2', note }));
  if (task1 && task2) pages.push(writingBandPage(name, task1.scores, task2.scores, quote));
  return pages.map((page) => ({ ...page, verify }));
}

/** The history entries a verification covers, or null when one is missing (a report made before verification). */
function reportIdsOf(source: ScoreCardSource): string[] | null {
  const reports = source.kind === 'task' ? [source.report] : [source.task1, source.task2].filter((r) => r !== null);
  const ids = reports.map((r) => r.reportId);
  return ids.length > 0 && ids.every((id): id is string => typeof id === 'string' && id !== '') ? ids : null;
}

/**
 * The score card: a live preview, the name and line on it, an optional
 * verification QR code, and the ways to save it. Mount it only while it is
 * open, so each opening starts on a fresh random line.
 */
export function ScoreCardDialog({ onClose, defaultName, source }: ScoreCardDialogProps) {
  const { user } = useAuth();
  const isFull = source.kind === 'full';
  const fullComplete = source.kind === 'full' && !!source.task1 && !!source.task2;
  // The line follows the band the card leads with: the task's overall, or
  // the Writing band on a full test's last page.
  const quoteBand = source.kind === 'task'
    ? source.report.scores.overall
    : source.task1 && source.task2 ? writingBand(source.task1.scores.overall, source.task2.scores.overall).band : 0;
  const quotes = quotesFor(quoteBand);
  const [quoteIndex, setQuoteIndex] = useState(() => Math.floor(Math.random() * quotes.length));
  const [name, setName] = useState(defaultName);
  const [previews, setPreviews] = useState<{ blob: Blob; url: string }[]>([]);
  const [failed, setFailed] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const { busy: savingPdf, run: runPdf } = useSingleRun();
  const { busy: savingImage, run: runImage } = useSingleRun();
  const urls = useRef<string[]>([]);
  const drawn = useRef(false);
  const nameId = useId();
  const verifyLabelId = useId();

  const reportIds = reportIdsOf(source);
  const idsKey = reportIds?.join(',') ?? '';
  const canVerify = reportIds !== null;
  const [verifyOn, setVerifyOn] = useState(canVerify);
  const [verification, setVerification] = useState<(Verify & { forName: string }) | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const activated = useRef(new Set<string>());

  const cardName = cleanCardName(name);
  const quote = quotes[quoteIndex % quotes.length];
  // The code belongs to one name, so it only goes on the card once it has
  // caught up with what the student typed.
  const verifyReady = !verifyOn || (verification !== null && verification.forName === cardName);
  const verify = verifyOn && verification ? { code: verification.code, url: verification.url } : undefined;
  const pages = buildPages(source, cardName, quote, verify);
  const showsQuote = pages.some((p) => p.quote);
  // The parent builds `source` afresh on every render, so the effects below
  // key on what the pages say rather than on the objects themselves.
  const pagesKey = JSON.stringify(pages);

  const callVerify = async (body: Record<string, unknown>) => {
    if (!user) throw new Error('Please sign in again.');
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as { code?: string; url?: string; name?: string; error?: string };
    if (!res.ok || !data.code || !data.url) throw new Error(data.error ?? 'Verification is unavailable right now.');
    return { code: data.code, url: data.url, forName: data.name ?? cardName };
  };

  // The code a card would carry, for the preview. Nothing is saved until
  // the student downloads or shares, so an unused preview leaves no trace.
  useEffect(() => {
    if (!verifyOn || !reportIds) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      callVerify({ action: 'prepare', reportIds, name: cardName })
        .then((v) => { if (!cancelled) { setVerification(v); setVerifyError(null); } })
        .catch((e: Error) => {
          if (cancelled) return;
          setVerifyError(e.message);
          setVerifyOn(false);
        });
    }, verification ? 400 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  // callVerify and reportIds are rebuilt every render; cardName and idsKey say when they really changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyOn, cardName, idsKey]);

  // Redraw when anything on the card changes. Typing waits a moment so the
  // card is not redrawn on every key.
  useEffect(() => {
    let cancelled = false;
    const list = JSON.parse(pagesKey) as CardPage[];
    const timer = setTimeout(() => {
      Promise.all(list.map((p) => cardImage(p)))
        .then((blobs) => {
          if (cancelled) return;
          urls.current.forEach((u) => URL.revokeObjectURL(u));
          const next = blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
          urls.current = next.map((n) => n.url);
          drawn.current = true;
          setFailed(false);
          setPreviews(next);
        })
        .catch(() => { if (!cancelled) setFailed(true); });
    }, drawn.current ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pagesKey]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const ready = previews.length === pages.length && !failed && verifyReady;
  const imageName = cardFileName(pages, 'png');
  const file = !isFull && previews[0] ? new File([previews[0].blob], imageName, { type: 'image/png' }) : null;
  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  /**
   * Saves the verification, so the code on the card works. Called on every
   * download and share, and remembered, so it runs once per code.
   */
  const activate = async (): Promise<boolean> => {
    if (!verifyOn || !verification || !reportIds) return true;
    if (activated.current.has(verification.code)) return true;
    try {
      const saved = await callVerify({ action: 'activate', reportIds, name: cardName });
      if (saved.code !== verification.code) throw new Error('The verification changed. Please try again.');
      activated.current.add(saved.code);
      setVerifyError(null);
      return true;
    } catch (e) {
      setVerifyError(`The verification could not be saved: ${(e as Error).message} Turn it off to save the card without it.`);
      return false;
    }
  };

  const saveImage = () => runImage(async () => {
    if (!previews[0] || !(await activate())) return;
    saveFile(previews[0].blob, imageName);
  });
  const savePdf = () => runPdf(async () => {
    setPdfError(false);
    if (!(await activate())) return;
    try {
      saveFile(await cardPdf(pages), cardFileName(pages, 'pdf'));
    } catch {
      setPdfError(true);
    }
  });
  const share = async () => {
    if (!file) return;
    setShareError(false);
    // The share sheet must open straight from the tap, so the verification
    // is saved alongside it rather than first.
    const activation = activate();
    try {
      await navigator.share({ files: [file], title: 'My IELTS Writing band' });
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if ((e as Error).name !== 'AbortError') setShareError(true);
    }
    await activation;
  };

  const nameField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={nameId}>Name on the card</Label>
      <Input
        id={nameId}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_CARD_NAME}
        autoComplete="name"
        placeholder="Your name"
        className="focus-visible:ring-[var(--ink-blue)]"
      />
      <p className="text-xs text-[var(--text-secondary)]">Only changes the {isFull ? 'PDF' : 'card'}, not your account.</p>
    </div>
  );

  const lineField = showsQuote && (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-medium text-[var(--text-primary)]">{isFull ? 'Your line on page 3' : 'Your line'}</p>
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">&ldquo;{quote}&rdquo;</p>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setQuoteIndex((i) => i + 1)}>
        <Shuffle aria-hidden /> Another line
      </Button>
    </div>
  );

  const verifyField = (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={verifyOn}
        aria-labelledby={verifyLabelId}
        disabled={!canVerify}
        onClick={() => { setVerifyError(null); setVerifyOn((on) => !on); }}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          verifyOn ? 'bg-[var(--ink-blue)]' : 'bg-[var(--border-strong)]'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.25)] transition-transform duration-200 motion-reduce:transition-none ${
            verifyOn ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="min-w-0">
        <p id={verifyLabelId} className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          <ShieldCheck className="w-4 h-4 text-[var(--ink-blue)]" aria-hidden /> Add a verification QR code
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {canVerify
            ? 'Anyone who scans it sees the name and bands on this card, confirmed by WriteReady. You can withdraw it from your account page.'
            : 'Verification works for reports made from now on. This one was made before it existed.'}
        </p>
      </div>
    </div>
  );

  const problemText = failed
    ? 'The card could not be made in this browser. Open the report in Chrome or Safari and try again.'
    : verifyError
      ? verifyError
      : pdfError
        ? `The PDF could not be made. Try again${isFull ? '' : ', or save the image instead'}.`
        : shareError
          ? 'Sharing did not work. Save the image instead and post it from your gallery.'
          : null;
  const problem = problemText && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
      {problemText}
    </p>
  );

  const preview = (page: CardPage, i: number) => {
    const shown = previews[i];
    if (shown) {
      return (
        <img
          src={shown.url}
          alt={`${page.context}: ${page.name}, band ${page.band.toFixed(1)}`}
          width={1080}
          height={1920}
          className="block w-full h-auto rounded-xl border border-[var(--border-color)] shadow-[var(--shadow-md)]"
        />
      );
    }
    return failed ? (
      <div className="aspect-[9/16] rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] flex items-center justify-center">
        <AlertTriangle className="w-5 h-5 text-[var(--text-secondary)]" aria-hidden />
      </div>
    ) : (
      <div className="aspect-[9/16] rounded-xl bg-[var(--bg-subtle)] animate-pulse motion-reduce:animate-none" />
    );
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isFull ? 'Download your score report' : 'Download your score card'}</DialogTitle>
          <DialogDescription>
            {!isFull
              ? 'Save it as an image for your story, or as a PDF.'
              : fullComplete
                ? 'A 3-page PDF: your Task 1 band, your Task 2 band, and your Writing band from both tasks.'
                : 'Your Writing band needs feedback on both tasks. Until then, the PDF has the task that is marked.'}
          </DialogDescription>
        </DialogHeader>

        {isFull ? (
          <div className="flex flex-col gap-6">
            <ol className="grid grid-cols-3 gap-3 sm:gap-4" aria-busy={!ready}>
              {pages.map((page, i) => (
                <li key={page.context} className="flex flex-col gap-2 min-w-0">
                  {preview(page, i)}
                  <span className="text-xs text-[var(--text-secondary)]">
                    Page {i + 1}: {page.context.replace('Full test · ', '')}
                  </span>
                </li>
              ))}
            </ol>
            <div className="grid gap-6 sm:grid-cols-2">
              {nameField}
              {lineField}
            </div>
            {verifyField}
            {problem}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[232px_1fr] items-start">
            <div className="mx-auto w-[196px] sm:w-[232px]" aria-busy={!ready}>{preview(pages[0], 0)}</div>
            <div className="flex flex-col gap-6 min-w-0">
              {nameField}
              {lineField}
              {verifyField}
              {problem}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {isFull ? (
            <Button disabled={!ready} loading={savingPdf} onClick={savePdf}>
              {!savingPdf && <FileDown aria-hidden />} {savingPdf ? 'Saving PDF…' : `Download PDF (${pages.length} ${pages.length === 1 ? 'page' : 'pages'})`}
            </Button>
          ) : (
            <>
              {canShare && (
                <Button variant="outline" disabled={!ready} onClick={share}>
                  <Share2 aria-hidden /> Share
                </Button>
              )}
              <Button variant="outline" disabled={!ready} loading={savingPdf} onClick={savePdf}>
                {!savingPdf && <FileDown aria-hidden />} {savingPdf ? 'Saving PDF…' : 'Download PDF'}
              </Button>
              <Button disabled={!ready} loading={savingImage} onClick={saveImage}>
                {!savingImage && <ImageDown aria-hidden />} {savingImage ? 'Saving…' : 'Download image'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
