import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { encodeReport } from '@/lib/reportEncoding';
import { LogoLoader } from '@/components/ui/LogoLoader';
import Logo from '/logo.svg';

/**
 * Where the Telegram bot's "See full feedback" button lands (/tg/<code>).
 *
 * The student signs in (the sign-in page comes back here), the server hands
 * over the essay the code stands for and connects their Telegram to this
 * account (api/_lib/routes/botLink.ts), and the essay opens on the feedback page like
 * any other.
 */
export function TelegramLinkPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/bot-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as { question?: string; essay?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !data.question || !data.essay) {
          setError(data.error ?? 'Could not open the essay. Please try again.');
          return;
        }
        const id = encodeReport({ task1: null, task2: { report: data.question }, userText1: '', userText2: data.essay });
        navigate(`/feedback/${id}`, { replace: true });
      } catch {
        if (!cancelled) setError('Could not open the essay. Check your connection and try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [code, user, loading, navigate]);

  if (!loading && !user) return <Navigate to={`/auth?next=${encodeURIComponent(`/tg/${code}`)}`} replace />;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <header className="mx-auto flex w-full max-w-[1160px] items-center px-6 py-5">
        <Link to="/" className="flex items-center gap-2 no-underline text-[var(--text-primary)]">
          <img src={Logo} width={36} height={36} className="size-9" alt="" />
          <span className="text-lg font-bold">
            WriteReady <span className="text-[var(--ink-blue)]">IELTS</span>
          </span>
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
        {error ? (
          <>
            <h1 className="text-2xl font-bold">We couldn't open this essay</h1>
            <p role="alert" className="mt-3 text-pretty leading-relaxed text-[var(--text-secondary)]">{error}</p>
            <Link
              to="/dashboard"
              className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--ink-blue-solid)] px-6 font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
            >
              Go to your dashboard
            </Link>
          </>
        ) : (
          <>
            <LogoLoader />
            <p role="status" className="mt-6 text-[var(--text-secondary)]">Opening your essay…</p>
          </>
        )}
      </main>
    </div>
  );
}
