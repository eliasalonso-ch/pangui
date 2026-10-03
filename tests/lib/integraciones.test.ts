import { describe, it, expect, vi, afterEach } from "vitest";
import { puedeVerIntegraciones } from "@/lib/integraciones";
import { estadoVisible, probarMeconecta } from "@/lib/meconecta-conexion";

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

afterEach(() => vi.unstubAllGlobals());

describe("puedeVerIntegraciones", () => {
  it("solo owner/admin de Electrilam", () => {
    expect(puedeVerIntegraciones(ELECTRILAM, "owner")).toBe(true);
    expect(puedeVerIntegraciones(ELECTRILAM, "admin")).toBe(true);
    expect(puedeVerIntegraciones(ELECTRILAM, "member")).toBe(false);
    expect(puedeVerIntegraciones("otro", "owner")).toBe(false);
    expect(puedeVerIntegraciones(null, null)).toBe(false);
  });
});

describe("estadoVisible", () => {
  it("sin fila es sin_conexion", () => expect(estadoVisible(null)).toBe("sin_conexion"));
  it("usa el status de la fila", () => {
    expect(estadoVisible({ username: "a", status: "conectado", last_sync_at: null, last_error: null, authorized_at: "" }))
      .toBe("conectado");
  });
});

describe("probarMeconecta", () => {
  it("pide la revisión en modo soloProbar y devuelve el code de error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, json: async () => ({ ok: false, code: "credenciales_invalidas", error: "rechazada" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await probarMeconecta();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ soloProbar: true });
    expect(r).toEqual({ ok: false, code: "credenciales_invalidas", error: "rechazada" });
  });
});
