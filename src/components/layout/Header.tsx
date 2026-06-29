import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import Logo from "/logo.png";
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

function SubscriptionBadge({
  plan,
  subscription,
}: {
  plan: string;
  subscription?: string;
}) {
  if (plan === "forever" || subscription === "forever") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
        ♾️ LIFETIME
      </span>
    );
  }
  if (plan === "premium") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2 py-0.5 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700">
        ✓ PREMIUM
      </span>
    );
  }
  if (plan === "standard") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
        ⭐ STANDARD
      </span>
    );
  }
  if (plan === "basic") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700">
        ✓ BASIC
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 dark:bg-slate-700 dark:text-slate-400 dark:border-slate-600">
      Free
    </span>
  );
}

export function Header() {
  const { user, profile, logOut } = useAuth();
  const navigate = useNavigate();

  // Admin accounts should not appear as regular users in the header
  const isAdminAccount = user?.email?.endsWith('@writeready.internal') ?? false;

  const firstName = user?.displayName
    ? user.displayName.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "");

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 py-2 z-10 bg-[var(--bg-card)]/95 backdrop-blur-[8px] border-b border-[var(--border-color)]">
      <div className="max-w-[1160px] mx-auto px-6 h-[60px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <img src={Logo} width={70} alt="" />
          <span className="font-bold text-lg text-[var(--text-primary)]">
            WriteReady <span className="text-[#c9900a] dark:text-amber-400">IELTS</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/writing/mock"
            className="text-[var(--text-secondary)] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Writing
          </Link>
          <Link
            to="/blog"
            className="text-[var(--text-secondary)] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Blog
          </Link>
          <Link
            to="/pricing"
            className="text-[var(--text-secondary)] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Pricing
          </Link>

          <ThemeToggle />
          <NotificationBell />

          {user && !isAdminAccount ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={firstName}
                      width={30}
                      className="rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                      {firstName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  {firstName}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className="opacity-60 shrink-0"
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

              <DropdownMenuContent align="end" sideOffset={8} className="w-56 py-1 bg-[var(--bg-card)] border-[var(--border-color)]">
                <div className="px-3 py-2.5 border-b border-[var(--border-color)]">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                    {profile?.studentLogin ?? user.displayName ?? firstName}
                  </p>
                  {profile?.centerName ? (
                    <p className="text-xs text-blue-600 font-medium truncate mt-0.5">🏫 {profile.centerName}</p>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)] truncate">{user.email}</p>
                  )}
                  <div className="mt-2">
                    <SubscriptionBadge
                      plan={profile?.plan ?? "free"}
                      subscription={profile?.subscription}
                    />
                  </div>
                </div>

                <DropdownMenuItem asChild>
                  <Link
                    to="/dashboard"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <span>🏠</span> Dashboard
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    to="/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--text-primary)] no-underline cursor-pointer hover:bg-[var(--bg-subtle)] rounded-md mx-1"
                  >
                    <span>👤</span> My Account
                  </Link>
                </DropdownMenuItem>

                {(profile?.plan === "free" || !profile) && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/pricing"
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 font-semibold no-underline cursor-pointer hover:bg-amber-50 rounded-md mx-1 dark:text-amber-400 dark:hover:bg-amber-900/20"
                    >
                      <span>⭐</span> Rejani yangilash
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 bg-[var(--border-color)]" />

                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 cursor-pointer hover:bg-red-50 rounded-md mx-1 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <span>↩</span> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                className="text-[var(--text-secondary)] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-[var(--bg-subtle)] transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="ml-1 bg-[var(--ink-blue)] text-white text-sm font-semibold px-5 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity dark:bg-blue-600"
              >
                Start Free
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
