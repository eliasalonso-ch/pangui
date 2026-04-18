"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full">{children}</div>
}

export const Sidebar = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <aside
    className={cn("w-[220px] flex flex-col flex-shrink-0", className)}
    style={{ background: "#fff", borderRight: "1px solid #E5E7EB" }}
    {...props}
  >
    {children}
  </aside>
)

export const SidebarInset = ({ children }: { children: React.ReactNode }) => (
  <main className="flex-1 min-w-0">{children}</main>
)

export const SidebarHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} />
)

export const SidebarContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex-1 overflow-auto" style={{ padding: "8px" }} {...props} />
)

export const SidebarGroup = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mb-2" {...props} />
)

export const SidebarGroupContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex flex-col gap-1" {...props} />
)

export const SidebarMenu = (props: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className="flex flex-col gap-1 list-none" {...props} />
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
        "flex w-full items-center gap-3 rounded-md px-3 text-sm transition-colors",
        "h-10 border-none bg-transparent outline-none cursor-pointer",
        "font-medium text-[#4D5A66]",
        "hover:bg-[#F9FAFB] hover:text-[#1E2429]",
        isActive && "bg-[#EEF1FB] text-[#273D88] font-semibold",
        className
      )}
      {...props}
    />
  )
}
