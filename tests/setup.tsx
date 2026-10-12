import "@testing-library/jest-dom";
import { vi } from "vitest";

// Silence Next.js router warnings in tests
vi.mock("next/navigation", () => ({
  useRouter:   () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  redirect:    vi.fn(),
}));

// Stub next/link as a plain <a>
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// Env vars required by supabase client
process.env.NEXT_PUBLIC_SUPABASE_URL      = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

// jsdom no implementa scrollIntoView, y los desplegables lo llaman al abrirse
// (SearchSelect, OTFormFields, el DatePicker): sin esto, abrir uno en un test
// revienta con "scrollIntoView is not a function". El guard es para los tests
// que corren en entorno node, donde no hay Element.
if (typeof Element !== "undefined") Element.prototype.scrollIntoView = vi.fn();
