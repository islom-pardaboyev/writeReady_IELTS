import { useState, type FormEvent, type ReactNode } from "react";
import Logo from "/logo.svg";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Field, Notice } from "./parts";

/**
 * Shared sign-in card for the staff panels. `onSubmit` resolves to an error
 * message to show, or null on success.
 */
export function StaffLogin({
  title,
  description,
  loginLabel = "Login",
  onSubmit,
  footer,
}: {
  title: string;
  description: string;
  loginLabel?: string;
  onSubmit: (login: string, password: string) => Promise<string | null>;
  footer?: ReactNode;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (!login.trim() || !password) {
      setError(`Enter your ${loginLabel.toLowerCase()} and password.`);
      return;
    }
    setLoading(true);
    setError("");
    const message = await onSubmit(login.trim(), password);
    if (message) {
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="staff-shell flex min-h-dvh items-center justify-center bg-[var(--bg-base)] px-4 py-10 text-[var(--text-primary)]">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={Logo} width={36} height={36} alt="" />
          <span className="text-base font-bold">WriteReady</span>
        </div>
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-7">
          <h1 className="text-xl font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
          <form onSubmit={handle} className="mt-6 flex flex-col gap-4" noValidate>
            <Field label={loginLabel} htmlFor="staff-login">
              <Input
                id="staff-login"
                name="username"
                autoComplete="username"
                spellCheck={false}
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Password" htmlFor="staff-password">
              <PasswordInput
                id="staff-password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" loading={loading} className="mt-1 w-full">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
        {footer && <div className="mt-5 text-sm text-[var(--text-secondary)]">{footer}</div>}
      </div>
    </div>
  );
}
