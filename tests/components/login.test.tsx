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

describe("LoginPage", () => {
  it("renders email and password fields", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("tu@empresa.cl")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("renders submit button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it("shows error message on bad credentials", async () => {
    mockSignIn.mockResolvedValue({ data: null, error: new Error("Invalid credentials") });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "bad@email.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/correo o contraseña incorrectos/i)).toBeInTheDocument();
    });
  });

  it("redirects to /ordenes on successful login", async () => {
    mockSignIn.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "admin@pangui.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "correctpassword");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/ordenes");
    });
  });

  it("trims and lowercases email before submitting", async () => {
    mockSignIn.mockResolvedValue({ data: { user: {} }, error: null });
    const user = userEvent.setup();
    render(<LoginPage />);

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
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "a@b.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByText(/ingresando/i)).toBeInTheDocument();
    });
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

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
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText("tu@empresa.cl"), "a@b.cl");
    await user.type(screen.getByPlaceholderText("••••••••"), "pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ingresando/i })).toBeDisabled();
    });
  });
});
