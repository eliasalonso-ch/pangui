"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────
type SidebarContextType = {
  state: "expanded" | "collapsed"
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextType | null>(null)

export function useSidebar() {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider")
  return ctx
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)

  return (
    <SidebarContext.Provider
      value={{
        state: open ? "expanded" : "collapsed",
        toggleSidebar: () => setOpen((o) => !o),
      }}
    >
      <div className="flex min-h-screen w-full">{children}</div>
    </SidebarContext.Provider>
  )
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
type SidebarProps = React.HTMLAttributes<HTMLDivElement> & {
  collapsible?: "icon" | "offcanvas" | "none"
}

export const Sidebar = ({
  children,
  className,
  collapsible = "none",
}: SidebarProps) => {
  const { state } = useSidebar()

  const collapsed = state === "collapsed" && collapsible === "icon"

  return (
    <aside
      data-state={state}
      data-collapsible={collapsible}
      className={cn(
        "bg-sidebar border-r transition-all duration-200 flex flex-col",
        collapsed ? "w-[56px]" : "w-[220px]",
        className
      )}
    >
      {children}
    </aside>
  )
}

// ─────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────
export const SidebarInset = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return <main className="flex-1">{children}</main>
}

// ─────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────
export const SidebarHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="p-2" {...props} />
)

export const SidebarContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex-1 overflow-auto p-2" {...props} />
)

export const SidebarGroup = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mb-2" {...props} />
)

export const SidebarGroupContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col gap-1" {...props} />
)

// ─────────────────────────────────────────────
// Menu
// ─────────────────────────────────────────────
export const SidebarMenu = (props: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className="flex flex-col gap-1" {...props} />
)

export const SidebarMenuItem = (props: React.HTMLAttributes<HTMLLIElement>) => (
  <li {...props} />
)

export const SidebarMenuButton = ({
  className,
  isActive,
  asChild,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean
  asChild?: boolean
}) => {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
        "hover:bg-muted",
        isActive && "bg-muted font-medium",
        className
      )}
      {...props}
    />
  )
}