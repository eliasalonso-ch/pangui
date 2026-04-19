"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full">{children}</div>
}

export const Sidebar = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <aside
    className={cn("flex flex-col flex-shrink-0", className)}
    style={{
      width: "var(--sidebar-width, 240px)",
      background: "#0F172A",
      borderRight: "none",
      height: "100vh",
      position: "sticky",
      top: 0,
      overflowY: "auto",
    }}
    {...props}
  >
    {children}
  </aside>
)

export const SidebarInset = ({ children }: { children: React.ReactNode }) => (
  <main className="flex-1 min-w-0" style={{ background: "var(--c-bg, #F8FAFC)" }}>{children}</main>
)

export const SidebarHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} />
)

export const SidebarContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex-1 overflow-auto" style={{ padding: "8px 8px" }} {...props} />
)

export const SidebarGroup = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mb-1" {...props} />
)

export const SidebarGroupLabel = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("px-3 mb-1", className)}
    style={{
      fontSize: "10px",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: "#475569",
      marginTop: "16px",
    }}
    {...props}
  >
    {children}
  </div>
)

export const SidebarGroupContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col gap-0.5" {...props} />
)

export const SidebarMenu = (props: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className="flex flex-col gap-0.5 list-none" {...props} />
)

export const SidebarMenuItem = (props: React.HTMLAttributes<HTMLLIElement>) => (
  <li className="list-none" {...props} />
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
      data-active={isActive ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 text-sm transition-all duration-150",
        "h-9 border-none bg-transparent outline-none cursor-pointer relative",
        "font-medium",
        className
      )}
      style={{
        color: isActive ? "#FFFFFF" : "#94A3B8",
        background: isActive ? "rgba(37,99,235,0.18)" : "transparent",
        boxShadow: isActive ? "inset 3px 0 0 #2563EB" : "none",
      }}
      onMouseEnter={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"
          ;(e.currentTarget as HTMLElement).style.color = "#E2E8F0"
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent"
          ;(e.currentTarget as HTMLElement).style.color = "#94A3B8"
        }
      }}
      {...props}
    />
  )
}

export const SidebarSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => (
  <hr
    className={cn("my-2 mx-3", className)}
    style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.06)" }}
    {...props}
  />
)

export const SidebarFooter = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "8px" }}
    {...props}
  />
)
