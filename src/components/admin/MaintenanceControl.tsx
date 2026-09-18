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
import { Input } from '@/components/ui/input';

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
    getMaintenanceStatus({ fresh: true }).then(setStatus);
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
    <div className={`rounded-xl border p-5 flex flex-col gap-4 ${on ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${on ? 'text-red-700' : 'text-slate-800'}`}>
            {on ? '🛑 Maintenance mode is ON' : 'Maintenance mode'}
          </p>
          <p className={`text-xs mt-0.5 max-w-xl ${on ? 'text-red-600' : 'text-slate-500'}`}>
            {!on && 'Close the site for every visitor except you, with a countdown showing when it reopens.'}
            {on && remaining === null && (
              <>
                Everyone except you sees the maintenance page
                {status.startedAt ? ` (on for ${formatDuration(now - status.startedAt)})` : ''}. No end time is set, so
                visitors see how long it has been down. Set one below to show a countdown instead.
              </>
            )}
            {on && remaining !== null && remaining > 0 && (
              <>Reopens in {formatDuration(remaining)}, on {formatDateTime(status.endsAt!)}. You still have full access.</>
            )}
            {on && remaining !== null && remaining <= 0 && (
              <>
                The planned end ({formatDateTime(status.endsAt!)}) passed {formatDuration(-remaining)} ago. The site stays
                closed until you turn maintenance off.
              </>
            )}
          </p>
        </div>
        {on && (
          <button
            onClick={() => send({ enabled: false })}
            disabled={busy}
            className="shrink-0 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors cursor-pointer disabled:opacity-60"
          >
            Turn off and reopen site
          </button>
        )}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label htmlFor="maintenance-amount" className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wide">
            {on ? 'New end, counted from now' : 'Close the site for'}
          </label>
          <div className="flex gap-2">
            <Input
              id="maintenance-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDuration()}
              className="w-20 border-slate-200 bg-white text-slate-900"
            />
            <select
              aria-label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as MaintenanceUnit)}
              className="h-10 px-3 border border-slate-200 rounded-md text-sm bg-white text-slate-900 outline-none focus:border-[#4F46E5]"
            >
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <button
          onClick={submitDuration}
          disabled={busy}
          className={`h-10 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
            on ? 'bg-white text-red-700 border border-red-200 hover:bg-red-100' : 'bg-red-600 text-white hover:bg-red-700'
          }`}
        >
          {busy ? 'Saving…' : on ? 'Update end time' : 'Start maintenance'}
        </button>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="bg-white border border-red-200 rounded-lg px-3.5 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}
      {dialog}
    </div>
  );
}
