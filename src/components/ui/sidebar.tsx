import { useState, useEffect } from "react"
import { ChevronLeft, Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SidebarContext, useSidebar } from "./sidebar-context"

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const toggle = () => setOpen((v) => !v)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, toggle, isMobile, mobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────
export function Sidebar({
  children,
  className,
  variant = "dark",
}: {
  children: React.ReactNode
  className?: string
  variant?: "dark" | "light"
}) {
  const { open, isMobile, mobileOpen, setMobileOpen } = useSidebar()

  const colors =
    variant === "dark"
      ? "bg-[var(--sidebar-bg-dark,#0a0a0a)]"
      : "bg-[var(--sidebar)] border-r border-[var(--sidebar-border)]"
  const hairlineStyle = {
    "--sidebar-hairline": variant === "dark" ? "rgba(255,255,255,0.1)" : "var(--sidebar-border)",
  } as React.CSSProperties

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 bg-black/40 z-30 border-none cursor-default"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          style={hairlineStyle}
          className={cn(
            "flex flex-col fixed inset-y-0 left-0 z-40 h-screen w-[260px] shrink-0 overflow-hidden overscroll-contain transition-transform duration-300 ease-in-out motion-reduce:transition-none",
            colors,
            mobileOpen ? "translate-x-0" : "-translate-x-full",
            className
          )}
        >
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className={cn(
              "absolute top-4 right-3 inline-flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer bg-transparent",
              variant === "dark" ? "text-white/60 hover:bg-white/10" : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
            )}
          >
            <X size={18} />
          </button>
          {children}
        </aside>
      </>
    )
  }

  return (
    <aside
      style={hairlineStyle}
      className={cn(
        "flex flex-col min-h-screen sticky top-0 h-screen shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
        colors,
        open ? "w-[220px]" : "w-16",
        className
      )}
    >
      {children}
    </aside>
  )
}

// ── SidebarHeader ─────────────────────────────────────────────────────
export function SidebarHeader({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3 py-5 border-b border-[var(--sidebar-hairline)] shrink-0", className)}>
      {children}
    </div>
  )
}

// ── SidebarContent ────────────────────────────────────────────────────
export function SidebarContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden py-2", className)}>
      {children}
    </div>
  )
}

// ── SidebarFooter ─────────────────────────────────────────────────────
export function SidebarFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3 py-4 border-t border-[var(--sidebar-hairline)] shrink-0", className)}>
      {children}
    </div>
  )
}

// ── SidebarGroup ──────────────────────────────────────────────────────
export function SidebarGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3 py-2", className)}>
      {children}
    </div>
  )
}

// ── SidebarGroupLabel ─────────────────────────────────────────────────
export function SidebarGroupLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { open, isMobile } = useSidebar()
  if (!open && !isMobile) return null
  return (
    <p
      className={cn(
        "text-[0.6rem] font-bold tracking-widest uppercase text-white/30 px-1 mb-1",
        className
      )}
    >
      {children}
    </p>
  )
}

// ── SidebarMenu ───────────────────────────────────────────────────────
export function SidebarMenu({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <ul className={cn("flex flex-col gap-0.5 list-none m-0 p-0", className)}>
      {children}
    </ul>
  )
}

// ── SidebarMenuItem ───────────────────────────────────────────────────
export function SidebarMenuItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <li className={cn("relative", className)}>
      {children}
    </li>
  )
}

// ── SidebarMenuButton ─────────────────────────────────────────────────
interface SidebarMenuButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  tooltip?: string
  variant?: "dark" | "light"
}

export function SidebarMenuButton({
  children,
  isActive,
  className,
  tooltip,
  variant = "dark",
  ...props
}: SidebarMenuButtonProps) {
  const { open, isMobile } = useSidebar()
  const collapsed = !open && !isMobile
  return (
    <button
      title={collapsed && tooltip ? tooltip : undefined}
      className={cn(
        "group w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer",
        collapsed && "justify-center px-2",
        variant === "dark"
          ? isActive
            ? "bg-white/10 text-white border-l-2 border-indigo-400"
            : "text-white/55 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
          : isActive
            ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-primary)] font-semibold"
            : "text-[var(--sidebar-foreground)]/70 hover:text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)]/60",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ── SidebarTrigger ────────────────────────────────────────────────────
export function SidebarTrigger({ className }: { className?: string }) {
  const { open, toggle, isMobile, mobileOpen, setMobileOpen } = useSidebar()

  if (isMobile) {
    return (
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors border-none cursor-pointer bg-transparent",
          className
        )}
        aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
      >
        <Menu size={18} />
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors border-none cursor-pointer bg-transparent",
        className
      )}
      aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
    >
      {open ? <ChevronLeft size={18} /> : <Menu size={18} />}
    </button>
  )
}

// ── SidebarInset ──────────────────────────────────────────────────────
export function SidebarInset({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex-1 min-w-0 flex flex-col overflow-y-auto", className)}>
      {children}
    </div>
  )
}
