import { useEffect, useRef, useSyncExternalStore } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { Download, LayoutDashboard, LogOut, Menu, Star, User, Wallet } from "lucide-react";
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
import { formatUZS } from '@/lib/money';

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
  if (plan === "custom") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-brand-50 text-brand-700 border border-brand-200 rounded-full px-2 py-0.5 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700">
        <span aria-hidden="true">✓</span> CUSTOM
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
  "text-[var(--text-primary)] text-[0.9375rem] font-semibold px-3.5 py-2 rounded-full no-underline hover:bg-[var(--bg-subtle)] transition-colors aria-[current=page]:bg-[var(--accent)] aria-[current=page]:text-[var(--accent-foreground)]";

// The site's main links, in order. The sample-answer pages draw their own
// copy of this header (src/components/questions/QuestionsShell.tsx, which the
// build renders to static HTML); keep the two lists in step.
const NAV_LINKS: [to: string, label: string][] = [
  ["/writing/mock", "Writing"],
  ["/questions", "Sample answers"],
  ["/blog", "Blog"],
  ["/pricing", "Pricing"],
];

const dropdownLinkClass =
  "flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1";

/**
 * The breakpoint is lg: below 1024px the full row (logo, four links, theme
 * toggle, sign in and the Start Free button) adds up to more than the screen,
 * so tablets and phones get the menu button instead.
 */
export function Header() {
  const { user, profile, logOut, avatarUrl } = useAuth();
  const navigate = useNavigate();
  const marqueeRef = useRef<MarqueeElement>(null);

  // Re-render when the browser decides the app became installable, which it
  // does a moment after load rather than at mount.
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const installable = canInstall();

  // <marquee> has no CSS knob for prefers-reduced-motion; stop it in JS.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      marqueeRef.current?.stop();
    }
  }, []);

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
    <header className="sticky top-0 z-10 bg-[var(--bg-card)]/95 backdrop-blur-[8px] border-b border-[var(--border-color)]">
      <div className="bg-[var(--gold)] py-1.5 text-sm font-medium text-amber-950">
        <marquee
          ref={marqueeRef}
          behavior="scroll"
          direction="left"
          scrollamount="7"
          onMouseEnter={() => marqueeRef.current?.stop()}
          onMouseLeave={() => marqueeRef.current?.start()}
          onTouchStart={() => marqueeRef.current?.stop()}
          onTouchEnd={() => marqueeRef.current?.start()}
        >
          <span aria-hidden="true">🚧</span> The site is currently in beta.
          Please report any issues to{" "}
          <a
            href="https://t.me/writeready_admin"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline hover:no-underline"
          >
            our Telegram Admin
          </a>
          .
        </marquee>
      </div>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-[68px] flex items-center justify-between gap-2">
        <Link to="/" className="flex shrink-0 items-center gap-2 no-underline">
          <img
            src={Logo}
            width={40}
            height={40}
            className="size-8 sm:size-[40px]"
            alt=""
          />
          <span className="font-display font-extrabold text-base sm:text-lg text-[var(--text-primary)] whitespace-nowrap">
            WriteReady{" "}
            <span className="hidden text-[var(--ink-blue)] sm:inline">
              IELTS
            </span>
          </span>
        </Link>

        <nav className="flex shrink-0 items-center gap-1">
          <div className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map(([to, label]) => (
              <NavLink key={to} to={to} className={navLinkClass}>
                {label}
              </NavLink>
            ))}
          </div>

          <ThemeToggle />
          <NotificationBell />

          {user && !isAdminAccount ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Avatar only on a phone; the name and chevron need room the
                    row does not have next to the menu button. */}
                <Button variant="secondary" className="px-2 md:px-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={firstName}
                      width={30}
                      height={30}
                      className="size-[30px] rounded-full object-cover shrink-0"
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
                    <Wallet className="size-4 text-[var(--text-secondary)]" aria-hidden="true" /> Balance
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-600">
                    {formatUZS(profile?.balanceUZS ?? 0)}
                  </span>
                </Link>

                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <LayoutDashboard className="size-4 text-[var(--text-secondary)]" aria-hidden="true" /> Dashboard
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    to="/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <User className="size-4 text-[var(--text-secondary)]" aria-hidden="true" /> My Account
                  </Link>
                </DropdownMenuItem>

                {(profile?.plan === "free" || !profile) && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/pricing"
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 font-semibold no-underline cursor-pointer hover:bg-amber-50 rounded-md mx-1 dark:text-amber-400 dark:hover:bg-amber-900/20"
                    >
                      <Star className="size-4" aria-hidden="true" /> Upgrade plan
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 bg-[var(--border-color)]" />

                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 cursor-pointer hover:bg-red-50 rounded-md mx-1 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <LogOut className="size-4" aria-hidden="true" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                className={`hidden lg:inline-block ${navLinkClass}`}
              >
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="ml-1 bg-[var(--ink-blue-solid)] text-white text-sm font-bold px-4 md:px-5 py-2.5 rounded-full no-underline whitespace-nowrap hover:opacity-90 transition-opacity dark:bg-brand-600"
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
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)] lg:hidden"
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

              {NAV_LINKS.map(([to, label]) => (
                <DropdownMenuItem key={to} asChild>
                  <Link to={to} className={dropdownLinkClass}>
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}

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
