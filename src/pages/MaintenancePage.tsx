import { useEffect, useState } from 'react';
import { formatDateTime, formatDuration, splitDuration } from '@/lib/duration';
import Logo from '/logo.png';

export function MaintenancePage({ startedAt, endsAt }: { startedAt: number | null; endsAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-[440px] text-center">
        <img src={Logo} width={72} className="mx-auto mb-6" alt="WriteReady" />
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6 text-3xl" aria-hidden="true">
          🛠️
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">We'll be right back</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          WriteReady is closed for maintenance while we fix an issue. Thanks for your patience.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl px-5 py-5">
          {endsAt === null ? (
            <>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-slate-400 mb-2">Time under maintenance</p>
              <p className="font-mono text-3xl font-bold text-[#4F46E5] tabular-nums">
                {startedAt ? formatDuration(now - startedAt) : '—'}
              </p>
            </>
          ) : endsAt > now ? (
            <Countdown remaining={endsAt - now} endsAt={endsAt} />
          ) : (
            <>
              <p className="text-[0.7rem] font-bold tracking-widest uppercase text-slate-400 mb-2">Almost done</p>
              <p className="text-sm text-slate-600">We're finishing up and will reopen very soon.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Countdown({ remaining, endsAt }: { remaining: number; endsAt: number }) {
  const { days, hours, minutes, seconds } = splitDuration(remaining);
  const parts = [
    { label: 'days', value: days },
    { label: 'hours', value: hours },
    { label: 'min', value: minutes },
    { label: 'sec', value: seconds },
  ];
  return (
    <>
      <p className="text-[0.7rem] font-bold tracking-widest uppercase text-slate-400 mb-3">Back in</p>
      <div className="grid grid-cols-4 gap-2">
        {parts.map((p) => (
          <div key={p.label} className="rounded-lg bg-slate-50 border border-slate-200 py-3">
            <p className="font-mono text-2xl sm:text-3xl font-bold text-[#4F46E5] tabular-nums leading-none">
              {String(p.value).padStart(2, '0')}
            </p>
            <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-slate-400 mt-1.5">{p.label}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-4">Planned reopening: {formatDateTime(endsAt)}</p>
    </>
  );
}
