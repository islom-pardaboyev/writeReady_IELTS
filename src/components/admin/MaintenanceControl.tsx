import { useEffect, useState } from 'react';
import { useConfirm } from '@/hooks/useConfirm';
import { adminAuth } from '@/firebase/adminConfig';
import {
  getMaintenanceStatus,
  updateMaintenance,
  type MaintenanceStatus,
  type MaintenanceUnit,
  type MaintenanceUpdate,
} from '@/hooks/useFeatureFlag';
import { formatDateTime, formatDuration } from '@/lib/duration';
import { Power } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Field, Notice, selectClass } from '@/components/staff/parts';

const UNITS: MaintenanceUnit[] = ['hours', 'days', 'months'];

function unitLabel(amount: number, unit: MaintenanceUnit) {
  return amount === 1 ? unit.slice(0, -1) : unit;
}

export function MaintenanceControl() {
  const { confirm, dialog } = useConfirm();
  const [status, setStatus] = useState<MaintenanceStatus>({ enabled: false, startedAt: null, endsAt: null });
  const [amount, setAmount] = useState('2');
  const [unit, setUnit] = useState<MaintenanceUnit>('hours');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    getMaintenanceStatus({ fresh: true, strict: true })
      .then(setStatus)
      .catch(() => setError('Could not check whether maintenance mode is on. Reload the page to try again.'));
  }, []);

  useEffect(() => {
    if (!status.enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status.enabled]);

  const send = async (update: MaintenanceUpdate) => {
    setBusy(true);
    setError('');
    try {
      const idToken = await adminAuth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Your admin session has expired. Log out and log in again.');
      setStatus(await updateMaintenance(update, idToken));
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update maintenance mode.');
    }
    setBusy(false);
  };

  const submitDuration = async () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) {
      setError('Enter a whole number, 1 or more.');
      return;
    }
    if (!status.enabled && !(await confirm(
      `Every visitor except you will see the maintenance page, with a countdown of ${n} ${unitLabel(n, unit)}. ` +
        'The site stays closed after the countdown ends, until you turn maintenance off here.',
      { title: 'Start maintenance?', confirmLabel: 'Start maintenance', destructive: true },
    ))) return;
    await send({ enabled: true, amount: n, unit });
  };

  const on = status.enabled;
  const remaining = status.endsAt !== null ? status.endsAt - now : null;

  return (
    <section className={cn('rounded-xl border bg-[var(--bg-card)]', on ? 'border-red-300 dark:border-red-900/70' : 'border-[var(--border-color)]')}>
      <header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-4 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              on ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400' : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]',
            )}
          >
            <Power size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Maintenance mode</h2>
              <Badge variant={on ? 'danger' : 'secondary'}>{on ? 'On' : 'Off'}</Badge>
            </div>
            <p className="mt-0.5 max-w-[62ch] text-sm text-[var(--text-secondary)]">
              {!on && 'Close the site for every visitor except you. Visitors see a countdown to when it reopens.'}
              {on && remaining === null && (
                <>
                  Everyone except you sees the maintenance page
                  {status.startedAt ? ` (closed for ${formatDuration(now - status.startedAt)})` : ''}. No end time is set, so
                  visitors see how long it has been closed. Set one below to show a countdown.
                </>
              )}
              {on && remaining !== null && remaining > 0 && (
                <>
                  Reopens in <span className="font-mono tabular-nums text-[var(--text-primary)]">{formatDuration(remaining)}</span>, on{' '}
                  {formatDateTime(status.endsAt!)}. You still have full access.
                </>
              )}
              {on && remaining !== null && remaining <= 0 && (
                <>
                  The planned end ({formatDateTime(status.endsAt!)}) passed {formatDuration(-remaining)} ago. The site stays
                  closed until you reopen it.
                </>
              )}
            </p>
          </div>
        </div>
        {on && (
          <Button onClick={() => send({ enabled: false })} loading={busy}>
            Reopen the site
          </Button>
        )}
      </header>

      <form
        className="flex flex-wrap items-end gap-2 border-t border-[var(--border-color)] px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitDuration();
        }}
      >
        <Field label={on ? 'New end, counted from now' : 'Close the site for'} htmlFor="maintenance-amount">
          <div className="flex gap-2">
            <Input name="maintenance-amount" autoComplete="off"
              id="maintenance-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-20 font-mono"
            />
            <select name="unit" autoComplete="off" aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as MaintenanceUnit)} className={cn(selectClass, 'w-auto')}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Button type="submit" variant={on ? 'outline' : 'destructive'} loading={busy}>
          {busy ? 'Saving…' : on ? 'Update end time' : 'Start maintenance'}
        </Button>
      </form>

      {error && (
        <div className="px-5 pb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {dialog}
    </section>
  );
}
