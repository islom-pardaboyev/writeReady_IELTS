import { useEffect, useState } from 'react';
import { formatElapsed } from '@/lib/formatElapsed';
import Logo from '/logo.png';

export function MaintenancePage({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="w-full max-w-[440px] text-center">
        <img src={Logo} width={72} className="mx-auto mb-6" alt="WriteReady" />
        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6 text-3xl" aria-hidden="true">
          🛠️
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">We'll be right back</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          WriteReady is undergoing maintenance while we fix an issue. The site will be back online shortly — thanks for your patience.
        </p>
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5">
          <p className="text-[0.7rem] font-bold tracking-widest uppercase text-slate-400 mb-2">Time under maintenance</p>
          <p className="font-mono text-3xl font-bold text-[#4F46E5] tabular-nums">
            {startedAt ? formatElapsed(now - startedAt) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
