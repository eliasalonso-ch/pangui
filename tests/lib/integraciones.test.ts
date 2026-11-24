import { describe, it, expect, vi, afterEach } from "vitest";
import { puedeVerIntegraciones, UDEC_WORKSPACE_ID } from "@/lib/integraciones";
import { estadoVisible, probarMeconecta } from "@/lib/meconecta-conexion";

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

afterEach(() => vi.unstubAllGlobals());

describe("puedeVerIntegraciones", () => {
  it("el menú es para owner/admin de cualquier workspace", () => {
    expect(puedeVerIntegraciones(ELECTRILAM, "owner")).toBe(true);
    expect(puedeVerIntegraciones("otro", "admin")).toBe(true);
    expect(puedeVerIntegraciones(UDEC_WORKSPACE_ID, "member")).toBe(false);
    expect(puedeVerIntegraciones("otro", "member")).toBe(false);
    expect(puedeVerIntegraciones(null, null)).toBe(false);
  });
  it("MeConecta solo en Electrilam y la UdeC; Google Calendar en todos", () => {
    expect(puedeVerIntegraciones(ELECTRILAM, "admin", "meconecta")).toBe(true);
    expect(puedeVerIntegraciones(UDEC_WORKSPACE_ID, "owner", "meconecta")).toBe(true);
    expect(puedeVerIntegraciones("otro", "owner", "meconecta")).toBe(false);
    expect(puedeVerIntegraciones("otro", "owner", "google-calendar")).toBe(true);
    expect(puedeVerIntegraciones("otro", "member", "google-calendar")).toBe(false);
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
