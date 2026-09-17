import type { ReactNode } from "react";
import { ChatBot } from "../ui/ChatBot";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
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
