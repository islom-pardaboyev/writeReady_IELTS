import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import Logo from "/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function SubscriptionBadge({
  plan,
  subscription,
}: {
  plan: string;
  subscription?: string;
}) {
  if (plan === "forever" || subscription === "forever") {
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
        ♾️ LIFETIME
      </span>
    );
  }
  if (subscription && subscription !== "" && new Date(subscription) > new Date()) {
    const exp = new Date(subscription);
    const months = Math.round(
      (exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
    );
    const label =
      months <= 1
        ? exp.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
        : `${months}m`;
    return (
      <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5">
        ✓ Active ({label})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
      Free
    </span>
  );
}

export function Header() {
  const { user, profile, logOut } = useAuth();
  const navigate = useNavigate();

  const firstName = user?.displayName
    ? user.displayName.split(" ")[0]
    : user?.email?.split("@")[0] ?? "";

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 py-2 z-[100] bg-[rgba(255,255,255,0.95)] backdrop-blur-[8px] border-b border-[#e2e8f0]">
      <div className="max-w-[1160px] mx-auto px-6 h-[60px] flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 no-underline">
          <img src={Logo} width={70} alt="" />
          <span className="font-bold text-lg text-[#0f172a]">
            WriteReady <span className="text-[#c9900a]">IELTS</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          <Link
            to="/writing/mock"
            className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-slate-100 transition-colors"
          >
            Writing
          </Link>
          <Link
            to="/pricing"
            className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-slate-100 transition-colors"
          >
            Pricing
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-2 flex items-center gap-2 bg-[#1e3a5f] text-white text-sm font-semibold pl-1.5 pr-3 py-1.5 rounded-lg border-none cursor-pointer outline-none select-none hover:bg-[#2d5a8e] transition-colors">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={firstName}
                      width={30}
                      className="rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
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
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" sideOffset={8} className="w-56 py-1">
                {/* User info */}
                <div className="px-3 py-2.5 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {user.displayName ?? firstName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
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
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 no-underline cursor-pointer hover:bg-slate-50 rounded-md mx-1"
                  >
                    <span>🏠</span> Dashboard
                  </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild>
                  <Link
                    to="/account"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 no-underline cursor-pointer hover:bg-slate-50 rounded-md mx-1"
                  >
                    <span>👤</span> My Account
                  </Link>
                </DropdownMenuItem>

                {(profile?.plan === "free" || !profile?.subscription) && (
                  <DropdownMenuItem asChild>
                    <Link
                      to="/pricing"
                      className="flex items-center gap-2.5 px-3 py-2 text-sm text-amber-700 font-semibold no-underline cursor-pointer hover:bg-amber-50 rounded-md mx-1"
                    >
                      <span>⭐</span> Upgrade to Pro
                    </Link>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 bg-slate-100" />

                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 cursor-pointer hover:bg-red-50 rounded-md mx-1"
                >
                  <span>↩</span> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link
                to="/auth?mode=login"
                className="text-[#475569] text-sm font-medium px-[0.875rem] py-[0.375rem] rounded-[6px] no-underline hover:bg-slate-100 transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/auth?mode=signup"
                className="ml-1 bg-[#1e3a5f] text-white text-sm font-semibold px-5 py-2 rounded-lg no-underline hover:bg-[#2d5a8e] transition-colors"
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
