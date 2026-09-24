import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card } from './Card';
import { Button } from './Button';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCode } from '@shared/verifyCode';
import { cn } from '@/lib/utils';

interface Item {
  code: string;
  name: string;
  kind: 'task' | 'full';
  tasks: { taskType: 'Task 1' | 'Task 2'; scores: { overall: number } }[];
  writing: { band: number } | null;
  issuedAt: string;
}

async function callVerify(idToken: string, body: Record<string, unknown>) {
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Please try again.');
  return data;
}

/**
 * The score cards a student made verifiable (api/verify.ts), each with its
 * public page and a way to withdraw it. Withdrawing makes the card's QR code
 * say the card was withdrawn; the card itself cannot be recalled.
 */
export function VerifiedCards({ className }: { className?: string }) {
  const { user } = useAuth();
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const data = await callVerify(await user.getIdToken(), { action: 'list' }) as { items: Item[] };
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const withdraw = async (item: Item) => {
    if (!user) return;
    const ok = await confirm(
      `Anyone who scans the QR code on this card will be told it was withdrawn. Copies of the card you already shared stay out there, but WriteReady will no longer confirm them.`,
      { title: `Withdraw ${formatCode(item.code)}?`, confirmLabel: 'Withdraw', destructive: true },
    );
    if (!ok) return;
    setWithdrawing(item.code);
    try {
      await callVerify(await user.getIdToken(), { action: 'revoke', code: item.code });
      setItems((list) => list?.filter((i) => i.code !== item.code) ?? null);
    } catch (e) {
      setError(`Could not withdraw it: ${(e as Error).message}`);
    } finally {
      setWithdrawing(null);
    }
  };

  const band = (item: Item) => (item.kind === 'full' && item.writing ? item.writing.band : item.tasks[0]?.scores.overall ?? 0);
  const what = (item: Item) => (item.kind === 'full' ? 'Full Writing test' : `Writing ${item.tasks[0]?.taskType ?? ''}`);

  return (
    <Card className={cn('p-6', className)}>
      <div className="flex items-center gap-2 font-sans font-bold text-lg text-[var(--text-primary)]">
        <ShieldCheck className="w-[18px] h-[18px] text-[var(--ink-blue)]" aria-hidden /> Verified score cards
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
        Cards you saved with a verification QR code. Anyone with the code can see the name and bands on the card.
      </p>

      {items === null && !error && (
        <ul className="mt-4 flex flex-col gap-2" aria-busy="true" aria-label="Loading verified cards">
          {[0, 1].map((i) => (
            <li key={i} className="h-14 rounded-[10px] bg-[var(--bg-subtle)] animate-pulse motion-reduce:animate-none" />
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
          <span className="flex-1 min-w-[12rem]">{items === null ? `Could not load your verified cards. ${error}` : error}</span>
          {items === null && <Button size="sm" variant="outline" onClick={load}>Try again</Button>}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="mt-4 rounded-[10px] bg-[var(--bg-subtle)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          None yet. Turn on &ldquo;Add a verification QR code&rdquo; when you download a score card from a feedback report.
        </p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-[var(--border-color)] border-y border-[var(--border-color)]">
          {items.map((item) => (
            <li key={item.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="font-mono text-lg font-medium tabular-nums text-[var(--ink-blue)] w-10">{band(item).toFixed(1)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.name}</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {what(item)} · <span className="font-mono">{formatCode(item.code)}</span> ·{' '}
                  {new Date(item.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/v/${item.code}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-[var(--text-primary)] no-underline hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]"
                >
                  Open <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                  <span className="sr-only">(opens in a new tab)</span>
                </Link>
                <Button
                  size="sm"
                  variant="dangerOutline"
                  loading={withdrawing === item.code}
                  disabled={withdrawing !== null}
                  onClick={() => withdraw(item)}
                >
                  Withdraw
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Card>
  );
}
