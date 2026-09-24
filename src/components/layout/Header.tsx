import { useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router";
import { Download, Menu } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { canInstall, getVersion, install, subscribe } from "@/lib/pwaInstall";
import Logo from "/logo.svg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "../ui/Button";
import { NotificationBell } from "../ui/NotificationBell";

export function SubscriptionBadge({
  plan,
  subscription,
}: {
  plan: string;
  subscription?: string;
}) {
  if (plan === "forever" || subscription === "forever") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
        <span aria-hidden="true">♾️</span> LIFETIME
      </span>
    );
  }
  if (plan === "premium") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2 py-0.5 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700">
        <span aria-hidden="true">✓</span> PREMIUM
      </span>
    );
  }
  if (plan === "standard") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2 py-0.5 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700">
        <span aria-hidden="true">⭐</span> STANDARD
      </span>
    );
  }
  if (plan === "basic") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-brand-50 text-brand-600 border border-brand-200 rounded-full px-2 py-0.5 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700">
        <span aria-hidden="true">✓</span> BASIC
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 dark:bg-neutral-800 dark:text-neutral-400 dark:border-neutral-700">
      Free
    </span>
  );
}

const navLinkClass =
  "text-[var(--text-secondary)] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-[var(--bg-subtle)] transition-colors";

const dropdownLinkClass =
  "flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1";

/**
 * The breakpoint is md, not sm: at 640px the full row (logo, three links, theme
 * toggle, sign in and the Start Free button) still adds up to more than the
 * screen, so it would swap to the wide layout while it was too wide to fit.
 */
export function Header() {
  const { user, profile, logOut } = useAuth();
  const navigate = useNavigate();

  // Re-render when the browser decides the app became installable, which it
  // does a moment after load rather than at mount.
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const installable = canInstall();

  // Admin accounts should not appear as regular users in the header
  const isAdminAccount = user?.email?.endsWith("@writeready.internal") ?? false;

  const firstName = user?.displayName
    ? user.displayName.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "");

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 py-2 z-10 bg-[var(--bg-card)]/95 backdrop-blur-[8px] border-b border-[var(--border-color)]">
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-2">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <img src={Logo} width={40} height={40} className="size-8 sm:size-[40px]" alt="" />
          <span className="font-bold text-base sm:text-lg text-[var(--text-primary)] whitespace-nowrap">
            WriteReady{" "}
            <span className="hidden text-[var(--ink-blue)] sm:inline">
              IELTS
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1">
          <div className="hidden items-center gap-1 md:flex">
            <Link to="/writing/mock" className={navLinkClass}>
              Writing
            </Link>
            <Link to="/blog" className={navLinkClass}>
              Blog
            </Link>
            <Link to="/pricing" className={navLinkClass}>
              Pricing
            </Link>
          </div>

          <ThemeToggle />
          <NotificationBell />

          {user && !isAdminAccount ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Avatar only on a phone; the name and chevron need room the
                    row does not have next to the menu button. */}
                <Button variant="secondary" className="px-2 md:px-4">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={firstName}
                      width={30}
                      height={30}
                      className="rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden md:inline">{firstName}</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="hidden opacity-60 shrink-0 md:block"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 4l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                align="end"
                sideOffset={8}
                className="w-56 py-1 bg-[var(--bg-card)] border-[var(--border-color)]"
              >
                <div className="px-3 py-2.5 border-b border-[var(--border-color)]">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {profile?.studentLogin ?? user.displayName ?? firstName}
                  </p>
                  {profile?.centerName ? (
                    <p className="text-xs text-brand-blue-600 font-medium truncate mt-0.5">
                      <span aria-hidden="true">🏫</span> {profile.centerName}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)] truncate">
                      {user.email}
                    </p>
                  )}
                  <div className="mt-2">
                    <SubscriptionBadge
                      plan={profile?.plan ?? "free"}
                      subscription={profile?.subscription}
                    />
                  </div>
                </div>

                <Link
                  to="/pricing"
                  className="flex items-center justify-between gap-2 px-3 py-2.5 mx-1 mt-1 rounded-md no-underline cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm text-[var(--text-primary)]">
                    <span aria-hidden="true">💰</span> Balance
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-600">
                    {(profile?.balanceUZS ?? 0).toLocaleString()} UZS
                  </span>
                </Link>

                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <span aria-hidden="true">🏠</span> Dashboard
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    to="/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <span aria-hidden="true">👤</span> My Account
                  </Link>
                </DropdownMenuItem>

                {(profile?.plan === "free" || !profile) && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/pricing"
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 font-semibold no-underline cursor-pointer hover:bg-amber-50 rounded-md mx-1 dark:text-amber-400 dark:hover:bg-amber-900/20"
                    >
                      <span aria-hidden="true">⭐</span> Upgrade plan
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 bg-[var(--border-color)]" />

                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 cursor-pointer hover:bg-red-50 rounded-md mx-1 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <span aria-hidden="true">↩</span> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/auth?mode=login" className={`hidden md:inline-block ${navLinkClass}`}>
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="ml-1 bg-[var(--ink-blue-solid)] text-white text-sm font-semibold px-3 md:px-5 py-2 rounded-lg no-underline whitespace-nowrap hover:opacity-90 transition-opacity dark:bg-brand-600"
              >
                Start Free
              </Link>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)] md:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="w-48 py-1 bg-[var(--bg-card)] border-[var(--border-color)]"
            >
              {installable && (
                <>
                  <DropdownMenuItem
                    onSelect={install}
                    className={`${dropdownLinkClass} font-semibold text-[var(--ink-blue)]`}
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download app
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 bg-[var(--border-color)]" />
                </>
              )}

              <DropdownMenuItem asChild>
                <Link to="/writing/mock" className={dropdownLinkClass}>
                  Writing
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/blog" className={dropdownLinkClass}>
                  Blog
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/pricing" className={dropdownLinkClass}>
                  Pricing
                </Link>
              </DropdownMenuItem>

              {!user && (
                <>
                  <DropdownMenuSeparator className="my-1 bg-[var(--border-color)]" />
                  <DropdownMenuItem asChild>
                    <Link to="/auth?mode=login" className={dropdownLinkClass}>
                      Sign in
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
