import { useEffect, useRef, useState, type FormEvent } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { ArrowLeft, Mail } from 'lucide-react';
import { auth } from '../../firebase/config';
import { Button } from '../ui/Button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AuthNotice } from './AuthNotice';

// Sign in with a 6-digit code sent to the student's email (api/_lib/emailCode.ts).
// For a shared computer: no Google sign-in and no password needed. The same
// form creates the account when the address has none yet, and it is also the
// second step of password sign-up, so every new account has a proven address.

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
  password,
  submitLabel,
  onSignedIn,
  onBack,
}: {
  initialEmail: string;
  /**
   * Sign-up: the password the student chose. The code is sent straight away,
   * and the account is created with this password once the code checks out.
   * Also a password sign-in to an account whose email was never confirmed.
   */
  password?: string;
  submitLabel?: string;
  onSignedIn: () => void;
  onBack: () => void;
}) {
  const signingUp = password !== undefined;
  const [step, setStep] = useState<'email' | 'code'>(signingUp ? 'code' : 'email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const autoSent = useRef(false);

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
      setSent(true);
      setCode('');
      setWait(RESEND_WAIT_S);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Sign-up arrives with the address and password already typed: send the code
  // at once. Once only, even when React runs effects twice in development.
  useEffect(() => {
    if (!signingUp || autoSent.current) return;
    autoSent.current = true;
    void sendCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verify = async (value: string) => {
    setError('');
    setBusy(true);
    try {
      const data = await post({
        action: 'verify',
        email: email.trim(),
        code: value,
        ...(signingUp ? { password: password as string } : {}),
      });
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
      {error && <AuthNotice className="mb-6">{error}</AuthNotice>}

      {step === 'email' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="code-email" className={LABEL}>Email</Label>
            <Input
              id="code-email"
              name="email"
              type="email"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="you@example.com"
              autoComplete="email"
              className={FIELD}
            />
          </div>
          <Button type="submit" loading={busy} className={BIG_BUTTON}>
            {!busy && <Mail aria-hidden />} Send me a code
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void verify(code);
          }}
          className="flex flex-col gap-5"
        >
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]" aria-live="polite">
            {!sent && busy ? (
              <>Sending a code to <strong className="font-semibold text-[var(--text-primary)] break-all">{email.trim()}</strong>…</>
            ) : sent ? (
              <>
                We sent a code to <strong className="font-semibold text-[var(--text-primary)] break-all">{email.trim()}</strong>. Not
                there? Check spam.
              </>
            ) : (
              <>
                The code for <strong className="font-semibold text-[var(--text-primary)] break-all">{email.trim()}</strong> did not go
                out. Try sending it again.
              </>
            )}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="code-digits" className={LABEL}>6-digit code</Label>
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
              className="h-14 text-center font-mono text-2xl tracking-[0.4em] focus-visible:ring-[var(--ring)]"
              aria-describedby="code-help"
            />
          </div>
          <Button type="submit" loading={busy && sent} disabled={code.length !== 6 || busy} className={BIG_BUTTON}>
            {submitLabel ?? (signingUp ? 'Create account' : 'Sign in')}
          </Button>
          <div id="code-help" className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <button
              type="button"
              // Sign-up goes back to its own form, where the address and password were typed.
              onClick={() => { if (signingUp) onBack(); else { setStep('email'); setError(''); } }}
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
        className="mt-6 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border-0 bg-transparent p-0 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back
      </button>
    </div>
  );
}

// The same sizes as the forms on the sign-in page (src/pages/AuthPage.tsx).
const FIELD = 'h-12 px-4 text-base focus-visible:ring-[var(--ring)]';
const LABEL = 'text-sm font-semibold text-[var(--text-primary)]';
const BIG_BUTTON = 'h-12 w-full text-[0.9375rem]';
