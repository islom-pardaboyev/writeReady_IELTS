import { Link, useLocation, useNavigate } from "react-router";
import {
  LayoutDashboard,
  PenLine,
  Newspaper,
  Wallet,
  User as UserIcon,
  LogOut,
  Send,
  ArrowUpRight,
} from "lucide-react";
import Logo from "/logo.svg";
import { useAuth } from "../../hooks/useAuth";
import { TELEGRAM_CHANNEL_URL } from "@/lib/links";
import { cn } from "@/lib/utils";
import { SubscriptionBadge } from "./Header";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { ShortcutsButton } from "@/components/shortcuts/ShortcutsButton";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/writing/mock", label: "Writing", icon: PenLine },
  { to: "/blog", label: "Blog", icon: Newspaper },
  { to: "/pricing", label: "Pricing", icon: Wallet },
  { to: "/account", label: "My Account", icon: UserIcon },
];

export function AppSidebar() {
  const { user, profile, logOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { open, isMobile, setMobileOpen } = useSidebar();
  const collapsed = !open && !isMobile;

  const firstName = user?.displayName
    ? user.displayName.split(" ")[0]
    : (user?.email?.split("@")[0] ?? "");

  const handleNavClick = () => {
    if (isMobile) setMobileOpen(false);
  };

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  return (
    <Sidebar variant="light">
      <SidebarHeader className="flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2 no-underline min-w-0" onClick={handleNavClick}>
          <img src={Logo} width={32} height={32} alt="" className="shrink-0" />
          {(open || isMobile) && (
            <span className="font-bold text-sm text-[var(--sidebar-foreground)] truncate">
              WriteReady
            </span>
          )}
        </Link>
        {!isMobile && <SidebarTrigger />}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    variant="light"
                    isActive={isActive}
                    tooltip={item.label}
                    onClick={() => {
                      handleNavClick();
                      navigate(item.to);
                    }}
                  >
                    <Icon size={18} className="shrink-0" />
                    {(open || isMobile) && <span className="truncate">{item.label}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            {/* Leaves the site, so it sits apart from the pages above. */}
            <SidebarMenuItem className="mt-2 border-t border-[var(--border-color)] pt-2">
              <a
                href={TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                title={collapsed ? "Telegram channel" : undefined}
                onClick={handleNavClick}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium no-underline transition-colors",
                  "text-[var(--sidebar-foreground)]/70 hover:bg-[var(--sidebar-accent)]/60 hover:text-[var(--sidebar-foreground)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]",
                  collapsed ? "justify-center px-2" : "pr-2.5",
                )}
              >
                <Send size={18} className="shrink-0" aria-hidden="true" />
                {collapsed ? (
                  <span className="sr-only">Telegram channel (opens in a new tab)</span>
                ) : (
                  <>
                    <span className="flex-1 truncate">Telegram channel</span>
                    <ArrowUpRight size={14} className="-ml-1.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </>
                )}
              </a>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Reachable from inside the app too, not only from the public pages. */}
          {!collapsed && (
            <nav aria-label="Legal" className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-3.5 text-xs">
              <Link
                to="/privacy"
                onClick={handleNavClick}
                className="rounded text-[var(--sidebar-foreground)]/60 no-underline hover:text-[var(--sidebar-foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]"
              >
                Privacy
              </Link>
              <Link
                to="/terms"
                onClick={handleNavClick}
                className="rounded text-[var(--sidebar-foreground)]/60 no-underline hover:text-[var(--sidebar-foreground)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-blue)]"
              >
                Terms
              </Link>
            </nav>
          )}
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {user && (open || isMobile) && (
          <div className="flex items-center gap-2 mb-3 px-0.5">
            {user.photoURL ? (
              <img src={user.photoURL} alt={firstName} width={32} height={32} className="rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-[var(--sidebar-accent)] text-[var(--sidebar-primary)] flex items-center justify-center text-xs font-bold shrink-0">
                {firstName.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--sidebar-foreground)] truncate">
                {profile?.studentLogin ?? user.displayName ?? firstName}
              </p>
              <div className="mt-0.5">
                <SubscriptionBadge plan={profile?.plan ?? "free"} subscription={profile?.subscription} />
              </div>
            </div>
          </div>
        )}

        <div className={collapsed ? "flex flex-col items-center gap-2" : "flex items-center gap-2"}>
          <ThemeToggle />
          {/* Beside the sidebar on desktop; above the bell in the phone drawer. */}
          <NotificationBell side={isMobile ? "top" : "right"} />
          <ShortcutsButton />
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            className="ml-auto inline-flex items-center justify-center w-9 h-9 rounded-lg border-none cursor-pointer bg-transparent text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
