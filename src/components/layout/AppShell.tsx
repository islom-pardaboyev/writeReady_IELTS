import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import Logo from "/logo.png";
import { ChatBot } from "../ui/ChatBot";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { useAuth } from "../../hooks/useAuth";

interface AppShellProps {
  children: ReactNode;
  /** Render a slim top bar instead of the full app sidebar — for immersive, full-width surfaces like the feedback report. */
  minimal?: boolean;
}

function MinimalTopBar() {
  const { logOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logOut();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 sm:px-6 border-b border-[var(--border-color)] bg-[var(--bg-card)]/90 backdrop-blur-md">
      <Link to="/dashboard" className="flex items-center gap-2 no-underline min-w-0">
        <img src={Logo} width={28} height={28} alt="" className="shrink-0" />
        <span className="font-bold text-sm text-[var(--text-primary)] truncate hidden sm:inline">
          WriteReady
        </span>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell />
        <button
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] cursor-pointer text-[var(--text-secondary)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

export function AppShell({ children, minimal = false }: AppShellProps) {
  if (minimal) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-card)] focus:text-[var(--text-primary)] focus:shadow-lg"
        >
          Skip to main content
        </a>
        <MinimalTopBar />
        <main id="main-content" className="bg-[var(--bg-base)]">{children}</main>
        <ChatBot />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--bg-card)] focus:text-[var(--text-primary)] focus:shadow-lg"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
        <AppSidebar />
        <SidebarInset>
          <div className="md:hidden sticky top-0 z-20 flex items-center px-3 py-2 bg-[var(--bg-card)]/95 backdrop-blur-[8px] border-b border-[var(--border-color)]">
            <SidebarTrigger />
          </div>
          <main id="main-content" className="flex-1 bg-[var(--bg-base)]">{children}</main>
        </SidebarInset>
      </div>
      <ChatBot />
    </SidebarProvider>
  );
}
