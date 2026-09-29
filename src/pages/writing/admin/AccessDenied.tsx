import { Link } from "react-router";
import { ShieldX } from "lucide-react";
import Logo from "/logo.svg";
import { Button } from "@/components/ui/Button";

/** Shown on /admin to anyone who is not signed in as the site owner. */
export function AccessDenied({ email }: { email: string | null }) {
  return (
    <div className="staff-shell flex min-h-dvh items-center justify-center bg-[var(--bg-base)] px-4 py-10 text-[var(--text-primary)]">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={Logo} width={36} height={36} alt="" />
          <span className="text-base font-bold">WriteReady</span>
        </div>
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 sm:p-7">
          <div className="flex size-10 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
            <ShieldX className="size-5" aria-hidden="true" />
          </div>
          <p className="mt-5 font-mono text-xs font-semibold tracking-[0.2em] text-[var(--text-secondary)]">403</p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em]">Access denied</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            This page is only for the site owner.
          </p>
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            {email ? (
              <>You are signed in as <span className="break-all font-medium text-[var(--text-primary)]">{email}</span>.</>
            ) : (
              "You are not signed in."
            )}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {email ? (
              <Button asChild className="w-full">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild className="w-full">
                  <Link to="/auth?next=/admin">Sign in</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/">Go to home page</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
