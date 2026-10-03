// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { login, loginRechazado, MeconectaAuthError } from "@/supabase/functions/_shared/meconecta-scrape";

function respuesta(body: string, cookie = "PHPSESSID=abc123; path=/") {
  return { status: 200, ok: true, headers: { get: () => cookie }, text: async () => body, body: null };
}

afterEach(() => vi.unstubAllGlobals());

describe("loginRechazado", () => {
  it("detecta login_status invalid", () => {
    expect(loginRechazado('{"login_status":"invalid","redirect_url":"index.php"}')).toBe(true);
  });
  it("no marca otros estados ni cuerpos no-JSON", () => {
    expect(loginRechazado('{"login_status":"success"}')).toBe(false);
    expect(loginRechazado("<html></html>")).toBe(false);
    expect(loginRechazado("")).toBe(false);
  });
});

describe("login", () => {
  it("lanza MeconectaAuthError aunque el portal entregue PHPSESSID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta('{"login_status":"invalid"}')));
    await expect(login("x@y.cl", "mala")).rejects.toBeInstanceOf(MeconectaAuthError);
  });
  it("devuelve la cookie cuando el login no es rechazado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta('{"login_status":"success"}')));
    await expect(login("x@y.cl", "buena")).resolves.toBe("PHPSESSID=abc123");
  });
});
