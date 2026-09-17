import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PenLine,
  Newspaper,
  Wallet,
  User as UserIcon,
  LogOut,
} from "lucide-react";
import Logo from "/logo.png";
import { useAuth } from "../../hooks/useAuth";
import { SubscriptionBadge } from "./Header";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/ui/NotificationBell";
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
          </SidebarMenu>
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
          <NotificationBell />
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
