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
      {/* h-screen + overflow-hidden so neither the sidebar nor the main pane
          ever pushes the page itself into a scroll — each child manages its
          own overflow. */}
      <div className="flex h-screen w-full overflow-hidden">{children}</div>
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
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        height: "100vh",
        position: "sticky",
        top: 0,
        // No outer scroll — SidebarContent is the only scrollable region so we
        // don't get two stacked scrollbars when the menu overflows.
        overflow: "hidden",
      }}
      {...props}
    >
      {children}
    </aside>
  );
};

export const SidebarInset = ({ children }: { children: React.ReactNode }) => (
  // h-screen + overflow-y-auto makes the main pane the scroll container for page
  // content. The provider clips page-level scroll (overflow-hidden), so this is
  // the element that actually scrolls. min-w-0 prevents flex overflow on the X axis.
  <main className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden" style={{ background: "var(--surface-0)" }}>{children}</main>
)

export const SidebarHeader = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div {...props} />
)

export const SidebarContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)}
    style={{ padding: "8px 0" }}
    {...props}
  />
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
        color: "var(--fg-4)",
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
          color: isActive ? "var(--brand)" : "var(--fg-3)",
          background: isActive ? "var(--brand-tint)" : "transparent",
          boxShadow: isActive ? (collapsed ? "none" : "inset 3px 0 0 var(--brand)") : "none",
          borderRadius: 6,
          transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--fg-1)";
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--fg-3)";
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
      style={{ border: "none", borderTop: "1px solid var(--border)" }}
      {...props}
    />
  );
};

export const SidebarFooter = (props: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    style={{ borderTop: "1px solid var(--border)", padding: "8px" }}
    {...props}
  />
)
