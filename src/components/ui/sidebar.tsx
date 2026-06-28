import { createContext, useContext, useState } from "react"
import { ChevronLeft, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Context ──────────────────────────────────────────────────────────
interface SidebarContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({
  open: true,
  setOpen: () => {},
  toggle: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toggle = () => setOpen((v) => !v)
  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────
export function Sidebar({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { open } = useSidebar()
  return (
    <aside
      className={cn(
        "flex flex-col min-h-screen sticky top-0 h-screen shrink-0 overflow-hidden transition-all duration-300 ease-in-out bg-[#0f172a]",
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
    <div className={cn("px-3 py-5 border-b border-white/10 shrink-0", className)}>
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
    <div className={cn("px-3 py-4 border-t border-white/10 shrink-0", className)}>
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
  const { open } = useSidebar()
  if (!open) return null
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
}

export function SidebarMenuButton({
  children,
  isActive,
  className,
  tooltip,
  ...props
}: SidebarMenuButtonProps) {
  const { open } = useSidebar()
  return (
    <button
      title={!open && tooltip ? tooltip : undefined}
      className={cn(
        "group w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer",
        !open && "justify-center px-2",
        isActive
          ? "bg-white/10 text-white"
          : "text-white/55 hover:text-white hover:bg-white/5",
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
  const { open, toggle } = useSidebar()
  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors border-none cursor-pointer bg-transparent",
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
