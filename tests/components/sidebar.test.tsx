import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

function TestSidebar({ onNav }: { onNav?: () => void }) {
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <span>Logo</span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive onClick={onNav}>
                Órdenes
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton>
                Partes
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
  );
}

describe("Sidebar components", () => {
  it("renders nav items", () => {
    render(<TestSidebar />);
    expect(screen.getByText("Órdenes")).toBeInTheDocument();
    expect(screen.getByText("Partes")).toBeInTheDocument();
  });

  it("renders the header slot", () => {
    render(<TestSidebar />);
    expect(screen.getByText("Logo")).toBeInTheDocument();
  });

  it("active item has data-active attribute", () => {
    render(<TestSidebar />);
    const btn = screen.getByText("Órdenes").closest("button, a");
    expect(btn).toHaveAttribute("data-active", "true");
  });

  it("inactive item does not have data-active", () => {
    render(<TestSidebar />);
    const btn = screen.getByText("Partes").closest("button, a");
    expect(btn).not.toHaveAttribute("data-active", "true");
  });

  it("calls onClick when nav item is clicked", async () => {
    const user = userEvent.setup();
    const onNav = vi.fn();
    render(<TestSidebar onNav={onNav} />);
    await user.click(screen.getByText("Órdenes"));
    expect(onNav).toHaveBeenCalledOnce();
  });

  it("sidebar has fixed width of 220px", () => {
    render(<TestSidebar />);
    const aside = document.querySelector("aside");
    expect(aside).toHaveClass("w-[220px]");
  });

  it("sidebar has white background and right border", () => {
    render(<TestSidebar />);
    const aside = document.querySelector("aside");
    expect(aside).toHaveStyle({ background: "#fff", borderRight: "1px solid #E5E7EB" });
  });

  it("SidebarMenuButton renders as button by default", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarMenuButton>Test</SidebarMenuButton>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
  });

  it("SidebarMenuButton asChild renders child element", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarMenuButton asChild>
            <a href="/test">Link item</a>
          </SidebarMenuButton>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByRole("link", { name: "Link item" })).toBeInTheDocument();
  });
});
