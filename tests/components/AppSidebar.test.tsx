import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockGetUser = vi.fn();
// Doble generico del query builder: se devuelve a si mismo en cada eslabon y
// resuelve como una respuesta vacia de PostgREST. AppSidebar (workspaces) y
// useNotificaciones (notifications) construyen cadenas distintas, y ninguno de
// los dos es lo que estos tests miden.
const makeQuery = (): any => {
  const q: any = new Proxy(() => q, {
    get(_t, prop) {
      if (prop === "then") return (res: any) => Promise.resolve({ data: [], error: null }).then(res);
      return () => q;
    },
    apply: () => q,
  });
  return q;
};
const mockFrom    = vi.fn(() => makeQuery());
// useNotificaciones encadena .on() tres veces antes de .subscribe(), asi que el
// doble tiene que devolverse a si mismo en cada .on(). Con el stub anterior
// (solo `subscribe`) el efecto reventaba con "sb.channel(...).on is not a
// function" y tumbaba el render entero.
const mockChannel = vi.fn(() => {
  const ch: any = {
    on: () => ch,
    subscribe: vi.fn(() => ch),
    unsubscribe: vi.fn(),
  };
  return ch;
});

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
    channel: mockChannel,
    removeChannel: vi.fn(),
  }),
}));

// AppSidebar pide la fila del usuario a getPerfilUsuario(), no al cliente de
// Supabase: mockear solo `@/lib/supabase` dejaba correr la implementacion real,
// que sin sesion devuelve null, y el footer nunca se pintaba.
vi.mock("@/lib/perfil-usuario", () => ({
  getPerfilUsuario: vi.fn(),
  resetPerfilUsuarioCache: vi.fn(),
}));

vi.mock("@/lib/permisos", () => ({
  usePermisos: () => ({ puedeVer: () => true }),
}));

import AppSidebar from "@/components/AppSidebar";
import { resetAuthUserCache } from "@/lib/auth-user";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import { SidebarProvider } from "@/components/ui/sidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const perfil = vi.mocked(getPerfilUsuario);

/** Fila de `usuarios` tal como la devuelve getPerfilUsuario(). */
function perfilDe(data: any) {
  return { id: "u1", nombre: null, rol: null, workspace_id: null, solo_asignadas: false, ...data };
}

beforeEach(() => {
  vi.clearAllMocks();
  // getAuthUser cachea el usuario a nivel de modulo: sin esto el primer test
  // fija el valor para todos los demas.
  resetAuthUserCache();
  perfil.mockResolvedValue(null);
});

// AppSidebar reads the plan through useSuscripcion, which is a TanStack query,
// so it needs a client in scope. A fresh one per render keeps tests isolated;
// retry is off so a failed fetch surfaces immediately instead of backing off.
function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

describe("AppSidebar", () => {
  it("renders core nav items", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();
    expect(screen.getByText("Órdenes")).toBeInTheDocument();
    expect(screen.getByText("Notificaciones")).toBeInTheDocument();
    // "Configuración" ya no es un item del nav: se movio al popover del pie
    // como "Mi cuenta". Se comprueba "Activos", que si sigue en el nav.
    expect(screen.getByText("Activos")).toBeInTheDocument();
  });

  it("renders Inicio nav item", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();
    expect(screen.getByText("Inicio")).toBeInTheDocument();
  });

  it("shows admin-only items when user is admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    perfil.mockResolvedValue(perfilDe({ rol: "admin", onboarding_done: true, nombre: "Admin User", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => {
      expect(screen.getByText("Equipo")).toBeInTheDocument();
    });
  });

  it("hides Equipo for member role", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    perfil.mockResolvedValue(perfilDe({ rol: "member", onboarding_done: true, nombre: "Tech User", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => expect(perfil).toHaveBeenCalled());
    expect(screen.queryByText("Equipo")).not.toBeInTheDocument();
  });

  // Los tests de nombre/iniciales/logout vivian aqui, pero ese bloque se mudo
  // a GlobalTopBar: SidebarUserFooter sigue definido en el archivo y ya no se
  // renderiza. Probarlos aqui daba un falso negativo sobre el sidebar; les
  // corresponde un test de GlobalTopBar.

  it("nav links point to correct hrefs", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    renderSidebar();

    // El item abre la vista de lista, que es la vista por defecto de la seccion.
    expect(screen.getByText("Órdenes").closest("a")).toHaveAttribute("href", "/ordenes/lista");
    expect(screen.getByText("Inicio").closest("a")).toHaveAttribute("href", "/inicio");
    // El item apunta a la bandeja, no a la raiz de la seccion.
    expect(screen.getByText("Notificaciones").closest("a")).toHaveAttribute("href", "/notificaciones/bandeja");
  });

  it("shows logo image", async () => {
    // El logo solo se pinta cuando `workspaceLogo` deja de ser undefined, y eso
    // pasa despues de resolver el workspace: sin sesion no hay nada que mostrar.
    // Cae al logo por defecto cuando el workspace no subio el suyo.
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    perfil.mockResolvedValue(perfilDe({ rol: "admin", nombre: "Ana Torres", workspace_id: "ws-1" }));

    renderSidebar();
    await waitFor(() => {
      expect(document.querySelector("img[alt='Logo']")).toBeInTheDocument();
    });
  });
});
