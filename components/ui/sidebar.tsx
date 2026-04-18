"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

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
// Core layout
// ─────────────────────────────────────────────
export const Sidebar = ({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <aside className={cn("w-[220px] bg-sidebar", className)}>
      {children}
    </aside>
  )
}

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
  <div className="flex-1 overflow-auto" {...props} />
)

export const SidebarGroup = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="p-2" {...props} />
)

export const SidebarGroupContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} />
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
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean
}) => (
  <button
    className={cn(
      "flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted",
      isActive && "bg-muted font-medium",
      className
    )}
    {...props}
  />
)