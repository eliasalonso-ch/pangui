import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush        = vi.fn();
const mockSignIn      = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/login",
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignIn,
    },
  }),
}));

// Import after mocks
import LoginPage from "@/app/login/page.jsx";

beforeEach(() => vi.clearAllMocks());

/**
 * Pinta el login y lo deja en el formulario de contraseña.
 *
 * El login arranca en modo "magic" (código por correo), asi que el campo de
 * contraseña y el boton "Iniciar sesión" no existen hasta pulsar "Usar
 * contraseña". Antes estos tests asumian que la contraseña era lo primero que
 * se veia y fallaban buscando un placeholder que aun no estaba en el DOM.
 */
async function renderLoginConContrasena() {
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.click(screen.getByRole("button", { name: /usar contraseña/i }));
  return user;
}

describe("LoginPage", () => {
  it("renders email and password fields", async () => {
    await renderLoginConContrasena();
    expect(screen.getByPlaceholderText("tu@empresa.cl")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("renders submit button", async () => {
    await renderLoginConContrasena();
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("shows error message on bad credentials", async () => {
    mockSignIn.mockResolvedValue({ data: null, error: new Error("Invalid credentials") });
    const user = await renderLoginConContrasena();

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "bad@email.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/correo o contraseña incorrectos/i)).toBeInTheDocument();
    });
  });

  it("redirects to /inicio on successful login", async () => {
    mockSignIn.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = await renderLoginConContrasena();

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "admin@pangui.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "correctpassword");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      // Tras autenticar se va al tablero, el mismo destino que usan el proxy y
      // el boton de "/" — no a la bandeja de ordenes.
      expect(mockPush).toHaveBeenCalledWith("/inicio");
    });
  });

  it("trims and lowercases email before submitting", async () => {
    mockSignIn.mockResolvedValue({ data: { user: {} }, error: null });
    const user = await renderLoginConContrasena();

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "  ADMIN@Pangui.CL  ");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "admin@pangui.cl",
        password: "pass",
      });
    });
  });

  it("shows loading state while submitting", async () => {
    // Never resolves — stay in loading state
    mockSignIn.mockReturnValue(new Promise(() => {}));
    const user = await renderLoginConContrasena();

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "a@b.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/un momento/i)).toBeInTheDocument();
    });
  });

  it("toggles password visibility", async () => {
    const user = await renderLoginConContrasena();

    const input = screen.getByPlaceholderText("••••••••");
    expect(input).toHaveAttribute("type", "password");

    // Find the eye toggle button (sibling of input)
    const toggleBtn = input.parentElement!.querySelector("button[type=button]")!;
    await user.click(toggleBtn);

    expect(input).toHaveAttribute("type", "text");

    await user.click(toggleBtn);
    expect(input).toHaveAttribute("type", "password");
  });

  it("does not render Volver al sitio link", () => {
    render(<LoginPage />);
    expect(screen.queryByText(/volver al sitio/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/volver/i)).not.toBeInTheDocument();
  });

  it("does not render Privacidad link", () => {
    render(<LoginPage />);
    expect(screen.queryByText(/privacidad/i)).not.toBeInTheDocument();
  });

  it("submit button is disabled while loading", async () => {
    mockSignIn.mockReturnValue(new Promise(() => {}));
    const user = await renderLoginConContrasena();

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "a@b.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /un momento/i })).toBeDisabled();
    });
  });
});
