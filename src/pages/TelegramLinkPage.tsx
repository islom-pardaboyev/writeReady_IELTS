import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { encodeReport } from '@/lib/reportEncoding';
import { LogoLoader } from '@/components/ui/LogoLoader';
import Logo from '/logo.svg';

type Opened = { kind: 'essay'; question: string; essay: string } | { kind: 'connect' } | { error: string };

/**
 * One request per link. The server hands a link out once (and deletes it),
 * so a second request, even React running this effect twice in development,
 * would only find it gone.
 */
const opening = new Map<string, Promise<Opened>>();

function openOnce(code: string, idToken: string): Promise<Opened> {
  let request = opening.get(code);
  if (!request) {
    request = (async (): Promise<Opened> => {
      try {
        const res = await fetch('/api/bot-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as { kind?: string; question?: string; essay?: string; error?: string };
        if (res.ok && data.kind === 'connect') return { kind: 'connect' };
        if (!res.ok || !data.question || !data.essay) return { error: data.error ?? 'Could not open the link. Please try again.' };
        return { kind: 'essay', question: data.question, essay: data.essay };
      } catch {
        return { error: 'Could not open the link. Check your connection and try again.' };
      }
    })();
    opening.set(code, request);
  }
  return request;
}

/**
 * Where the Telegram bot's links land (/tg/<code>).
 *
 * The student signs in (the sign-in page comes back here) and the server
 * connects their Telegram to this account (api/_lib/routes/botLink.ts). A
 * "See full feedback" link also hands over its essay, which opens on the
 * feedback page like any other; a "Connect my account" link only connects.
 */
export function TelegramLinkPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const opened = await openOnce(code, await user.getIdToken());
      if (cancelled) return;
      if ('error' in opened) {
        setError(opened.error);
        return;
      }
      if (opened.kind === 'connect') {
        setConnected(true);
        return;
      }
      // The essay now travels in the report page's own address, so reloading
      // or coming back to that page never needs the link again.
      const id = encodeReport({ task1: null, task2: { report: opened.question }, userText1: '', userText2: opened.essay });
      navigate(`/feedback/${id}`, { replace: true });
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
        {connected ? (
          <>
            <h1 className="text-2xl font-bold">Telegram connected</h1>
            <p role="status" className="mt-3 text-pretty leading-relaxed text-[var(--text-secondary)]">
              Your Telegram is now connected to this account.{' '}
              {profile?.plan && profile.plan !== 'free'
                ? "You get 1 free check every week in the bot, on top of your plan: the bot never uses your plan's reports."
                : 'You get 1 free check every week, shared between the bot and the site.'}{' '}
              The essays you check in the bot are saved in your history here.
            </p>
            <Link
              to="/dashboard"
              className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--ink-blue-solid)] px-6 font-semibold text-white no-underline transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)]"
            >
              Go to your dashboard
            </Link>
          </>
        ) : error ? (
          <>
            <h1 className="text-2xl font-bold">We couldn't open this link</h1>
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
            <p role="status" className="mt-6 text-[var(--text-secondary)]">Just a moment…</p>
          </>
        )}
      </main>
    </div>
  );
}
