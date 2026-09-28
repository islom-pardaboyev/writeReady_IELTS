import { useEffect, useRef, useState, type FormEvent } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { ArrowLeft, Mail } from 'lucide-react';
import { auth } from '../../firebase/config';
import { Button } from '../ui/Button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

// Sign in with a 6-digit code sent to the student's email (api/_lib/emailCode.ts).
// For a shared computer: no Google sign-in and no password needed. The same
// form creates the account when the address has none yet.

const RESEND_WAIT_S = 60;

async function post(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch('/api/email-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Something went wrong. Try again in a minute.');
  return data;
}

export function EmailCodeSignIn({
  initialEmail,
  onSignedIn,
  onBack,
}: {
  initialEmail: string;
  onSignedIn: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  // Counts down to when another code may be sent. A countdown on screen, not a fetch.
  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post({ action: 'send', email: email.trim() });
      setStep('code');
      setCode('');
      setWait(RESEND_WAIT_S);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    setError('');
    setBusy(true);
    try {
      const data = await post({ action: 'verify', email: email.trim(), code: value });
      await signInWithCustomToken(auth, String(data.customToken));
      onSignedIn();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const onCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    // All six digits in (typed or pasted): check straight away.
    if (digits.length === 6 && !busy) void verify(digits);
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          {error}
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code-email" className="font-semibold">Email</Label>
            <Input
              id="code-email"
              name="email"
              type="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com…"
              autoComplete="email"
            />
            <p className="text-xs text-[var(--text-secondary)]">
              We'll email you a 6-digit code. No password or Google sign-in needed.
            </p>
          </div>
          <Button type="submit" loading={busy} size="lg" className="w-full">
            {!busy && <Mail aria-hidden />} Send me a code
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void verify(code);
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
            We sent a code to <strong className="font-semibold text-[var(--text-primary)] break-all">{email.trim()}</strong>. It works
            for 10 minutes. Check your spam folder if it isn't there.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code-digits" className="font-semibold">6-digit code</Label>
            <Input
              ref={codeRef}
              id="code-digits"
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="000000"
              className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
              aria-describedby="code-help"
            />
          </div>
          <Button type="submit" loading={busy} disabled={code.length !== 6} size="lg" className="w-full">
            Sign in
          </Button>
          <div id="code-help" className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => { setStep('email'); setError(''); }}
              className="cursor-pointer border-0 bg-transparent p-0 font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Use a different email
            </button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={wait > 0 || busy}
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[var(--ink-blue)] hover:underline disabled:cursor-not-allowed disabled:text-[var(--text-secondary)] disabled:no-underline"
            >
              {wait > 0 ? (
                <>Send a new code in <span className="font-mono tabular-nums">{wait}</span>s</>
              ) : (
                'Send a new code'
              )}
            </button>
          </div>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 border-0 bg-transparent p-0 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to other ways to sign in
      </button>
    </div>
  );
}
