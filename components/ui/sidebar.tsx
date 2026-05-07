"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

// ── Context ───────────────────────────────────────────────────────────────────

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

const SidebarContext = React.createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
});

export function useSidebar() {
  return React.useContext(SidebarContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="flex min-h-screen w-full">{children}</div>
    </SidebarContext.Provider>
  );
}

// ── Sidebar shell ─────────────────────────────────────────────────────────────

export const Sidebar = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { collapsed } = useSidebar();
  return (
    <aside
      className={cn("flex flex-col flex-shrink-0 transition-all duration-200", className)}
      style={{
        width: collapsed ? 56 : 200,
        background: "#FFFFFF",
        borderRight: "1px solid #E2E8F0",
        height: "100vh",
        position: "sticky",
        top: 0,
        overflowY: "auto",
        overflowX: "hidden",
      }}
      {...props}
    >
      {children}
    </aside>
  );
};

export const SidebarInset = ({ children }: { children: React.ReactNode }) => (
  <main className="flex-1 min-w-0" style={{ background: "var(--c-bg, #F8FAFC)" }}>{children}</main>
)

export const SidebarHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} />
)

export const SidebarContent = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="flex-1 overflow-auto" style={{ padding: "8px 0" }} {...props} />
)

export const SidebarGroup = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div className="mb-1" {...props} />
)

export const SidebarGroupLabel = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const { collapsed } = useSidebar();
  if (collapsed) return <div style={{ height: 16 }} />;
  return (
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
  );
};

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
  tooltip,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
  asChild?: boolean;
  tooltip?: string;
}) => {
  const { collapsed } = useSidebar();
  const Comp = asChild ? Slot : "button";

  return (
    <div style={{ position: "relative", padding: "0 8px" }} title={collapsed ? tooltip : undefined}>
      <Comp
        data-active={isActive ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 text-sm transition-all duration-150",
          "h-9 border-none bg-transparent outline-none cursor-pointer relative",
          "font-medium",
          collapsed ? "justify-center rounded-md mx-auto" : "rounded-md px-3",
          className
        )}
        style={{
          width: collapsed ? 40 : "100%",
          color: isActive ? "#1D4ED8" : "#475569",
          background: isActive ? "#EFF6FF" : "transparent",
          boxShadow: isActive ? (collapsed ? "none" : "inset 3px 0 0 #2563EB") : "none",
          borderRadius: 6,
          transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = "#F1F5F9";
            (e.currentTarget as HTMLElement).style.color = "#0F172A";
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#475569";
          }
        }}
        {...props}
      />
    </div>
  );
};

export const SidebarSeparator = ({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) => {
  const { collapsed } = useSidebar();
  return (
    <hr
      className={cn(collapsed ? "my-2 mx-2" : "my-2 mx-3", className)}
      style={{ border: "none", borderTop: "1px solid #E2E8F0" }}
      {...props}
    />
  );
};

export const SidebarFooter = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{ borderTop: "1px solid #E2E8F0", padding: "8px" }}
    {...props}
  />
)
