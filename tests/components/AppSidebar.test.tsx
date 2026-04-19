import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetUser = vi.fn();
const mockFrom    = vi.fn();
const mockChannel = vi.fn(() => ({ subscribe: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    channel: mockChannel,
  }),
}));

vi.mock("@/lib/permisos", () => ({
  usePermisos: () => ({ puedeVer: () => true }),
}));

vi.mock("@/lib/roles", () => ({
  ROL_LABEL: { admin: "Administrador", jefe: "Usuario", tecnico: "Usuario limitado" },
}));

import AppSidebar from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

function makeChain(data: any) {
  const chain: any = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: () => Promise.resolve({ data, error: null }),
  };
  return chain;
}

beforeEach(() => vi.clearAllMocks());

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  );
}

describe("AppSidebar", () => {
  it("renders core nav items", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();
    expect(screen.getByText("Órdenes")).toBeInTheDocument();
    expect(screen.getByText("Notificaciones")).toBeInTheDocument();
    expect(screen.getByText("Configuración")).toBeInTheDocument();
  });

  it("renders Inicio nav item", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("shows admin-only items when user is admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue(makeChain({ rol: "admin", onboarding_done: true, nombre: "Admin User", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText("Equipo")).toBeInTheDocument();
    });
  });

  it("hides Equipo for tecnico role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    mockFrom.mockReturnValue(makeChain({ rol: "tecnico", onboarding_done: true, nombre: "Tech User", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => expect(mockFrom).toHaveBeenCalled());
    expect(screen.queryByText("Equipo")).not.toBeInTheDocument();
  });

  it("renders user name and role in footer after load", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue(makeChain({ rol: "admin", onboarding_done: true, nombre: "Ana Torres", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText("Ana Torres")).toBeInTheDocument();
      expect(screen.getByText("Administrador")).toBeInTheDocument();
    });
  });

  it("renders user initials avatar", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue(makeChain({ rol: "admin", onboarding_done: true, nombre: "Ana Torres", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText("AT")).toBeInTheDocument();
    });
  });

  it("opens logout popover when user button is clicked", async () => {
    const user = userEvent.setup();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue(makeChain({ rol: "admin", onboarding_done: true, nombre: "Ana Torres", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => screen.getByText("Ana Torres"));

    const userBtn = screen.getByText("Ana Torres").closest("button")!;
    await user.click(userBtn);
    expect(screen.getByText("Cerrar sesión")).toBeInTheDocument();
  });

  it("nav links point to correct hrefs", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();

    expect(screen.getByText("Órdenes").closest("a")).toHaveAttribute("href", "/ordenes");
    expect(screen.getByText("Inicio").closest("a")).toHaveAttribute("href", "/inicio");
    expect(screen.getByText("Notificaciones").closest("a")).toHaveAttribute("href", "/notificaciones");
  });

  it("shows logo image", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();
    const logo = document.querySelector("img[alt='Pangui']");
    expect(logo).toBeInTheDocument();
  });
});
