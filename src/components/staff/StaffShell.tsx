import type { ReactNode } from "react";
import { LogOut, type LucideIcon } from "lucide-react";
import Logo from "/logo.png";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { useSidebar } from "@/components/ui/sidebar-context";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Initials } from "./parts";

export interface StaffNavItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export interface StaffNavGroup<T extends string> {
  label?: string;
  items: StaffNavItem<T>[];
}

interface StaffShellProps<T extends string> {
  role: string;
  identity: { name: string; detail: string; photo?: string };
  nav: StaffNavGroup<T>[];
  active: T;
  onNavigate: (id: T) => void;
  onSignOut: () => void;
  children: ReactNode;
}

const triggerClass = "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]";

function StaffSidebar<T extends string>({ role, identity, nav, active, onNavigate, onSignOut }: Omit<StaffShellProps<T>, "children">) {
  const { open, isMobile, setMobileOpen } = useSidebar();
  const expanded = open || isMobile;

  return (
    <Sidebar variant="light">
      <SidebarHeader className={expanded ? "flex items-center justify-between gap-2" : "flex flex-col items-center gap-3"}>
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={Logo} width={32} height={32} alt="" className="shrink-0" />
          {expanded && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold text-[var(--sidebar-foreground)]">WriteReady</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{role}</p>
            </div>
          )}
        </div>
        {!isMobile && <SidebarTrigger className={triggerClass} />}
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={`${role} sections`} className="px-3">
          {nav.map((group, gi) => (
            <div key={group.label ?? gi} className={gi > 0 ? "mt-4" : "mt-1"}>
              {group.label && expanded && (
                <p className="mb-1 px-3.5 text-xs font-medium text-[var(--text-secondary)]">{group.label}</p>
              )}
              {group.label && !expanded && gi > 0 && (
                <div aria-hidden="true" className="mx-2 mb-2 h-px bg-[var(--sidebar-border)]" />
              )}
              <SidebarMenu>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === active;
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        variant="light"
                        isActive={isActive}
                        aria-current={isActive ? "page" : undefined}
                        tooltip={item.badge ? `${item.label} (${item.badge})` : item.label}
                        onClick={() => {
                          onNavigate(item.id);
                          if (isMobile) setMobileOpen(false);
                        }}
                        className="py-2"
                      >
                        <Icon size={18} className="shrink-0" aria-hidden="true" />
                        {expanded && <span className="truncate">{item.label}</span>}
                        {expanded && !!item.badge && (
                          <span className="ml-auto rounded-full bg-amber-100 px-1.5 text-[0.7rem] font-semibold tabular-nums text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {item.badge}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </div>
          ))}
        </nav>
      </SidebarContent>

      <SidebarFooter>
        {expanded && (
          <div className="mb-3 flex items-center gap-2.5 px-0.5">
            <Initials name={identity.name} size={32} src={identity.photo} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--sidebar-foreground)]">{identity.name}</p>
              <p className="truncate text-xs text-[var(--text-secondary)]">{identity.detail}</p>
            </div>
          </div>
        )}
        <div className={expanded ? "flex items-center gap-2" : "flex flex-col items-center gap-2"}>
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className={`${expanded ? "ml-auto" : ""} inline-flex h-9 items-center justify-center gap-2 rounded-lg px-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] dark:text-red-400 dark:hover:bg-red-950/40`}
          >
            <LogOut size={16} aria-hidden="true" />
            {expanded && "Sign out"}
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function StaffShell<T extends string>(props: StaffShellProps<T>) {
  const { role, children } = props;
  return (
    <SidebarProvider>
      <a
        href="#staff-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[var(--bg-card)] focus:px-4 focus:py-2 focus:text-[var(--text-primary)] focus:shadow-lg"
      >
        Skip to content
      </a>
      <div className="staff-shell flex min-h-dvh bg-[var(--bg-base)] text-[var(--text-primary)]">
        <StaffSidebar {...props} />
        <SidebarInset className="staff-scroll">
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-card)]/95 px-3 py-2 backdrop-blur-[8px] md:hidden">
            <SidebarTrigger className={triggerClass} />
            <img src={Logo} width={24} height={24} alt="" />
            <span className="text-sm font-semibold">WriteReady</span>
            <span className="text-sm text-[var(--text-secondary)]">{role}</span>
          </div>
          <main id="staff-main" className="min-w-0 flex-1">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
