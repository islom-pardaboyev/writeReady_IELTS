import { createContext, useContext } from "react"

export interface SidebarContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  toggle: () => void
  isMobile: boolean
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue>({
  open: true,
  setOpen: () => {},
  toggle: () => {},
  isMobile: false,
  mobileOpen: false,
  setMobileOpen: () => {},
})

export function useSidebar() {
  return useContext(SidebarContext)
}
