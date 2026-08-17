import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registrarPeriodoFacturado } from "@/lib/dte/registrar-periodo";
import type { ClienteAdmin } from "@/lib/dte/emisor";

/**
 * Doble del cliente admin. Modela las tres formas de uso que atraviesa el
 * flujo: el count de usuarios, el maybeSingle del perfil y el insert del
 * documento.
 */
function fakeAdmin(opciones: {
  usuarios?: number;
  perfil?: Record<string, unknown> | null;
  errorAlInsertar?: { message: string; code?: string };
} = {}) {
  const capturado: { documento?: Record<string, unknown> } = {};
  const usuarios = opciones.usuarios ?? 3;

  const admin = {
    from(tabla: string) {
      if (tabla === "usuarios") {
        const cadena = {
          select: () => cadena,
          eq: () => cadena,
          is: () => Promise.resolve({ count: usuarios }),
        };
        return cadena;
      }
      if (tabla === "billing_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: opciones.perfil === undefined
                  ? {
                      billing_email: "pagos@cliente.cl",
                      razon_social: "Cliente SpA",
                      rut: "76086428-5",
                      giro: "Servicios de ingeniería",
                      domicilio: "Av. Siempre Viva 742",
                      region: "Metropolitana de Santiago",
                      comuna: "Providencia",
                      ciudad: "Santiago",
                      tipo_receptor: "empresa",
                    }
                  : opciones.perfil,
              }),
            }),
          }),
        };
      }
      // documentos_tributarios
      return {
        insert(valores: Record<string, unknown>) {
          capturado.documento = valores;
          return {
            select: () => ({
              single: () => Promise.resolve(
                opciones.errorAlInsertar
                  ? { data: null, error: opciones.errorAlInsertar }
                  : { data: { id: "doc-9", ...valores }, error: null },
              ),
            }),
          };
        },
      };
    },
  } as unknown as ClienteAdmin;

  return { admin, capturado };
}

const ctxBase = {
  workspaceId: "ws-1",
  subscriptionId: "sub-1",
  precioPorUsuario: 9990,
  status: "active",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  nextInvoiceDate: "2026-09-01",
};

describe("registrarPeriodoFacturado", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("registra el documento de un período pagado", async () => {
    const { admin, capturado } = fakeAdmin({ usuarios: 3 });
    const id = await registrarPeriodoFacturado(admin, ctxBase);

    expect(id).toBe("doc-9");
    // 3 × $9.990 = $29.970 bruto.
    expect(capturado.documento?.total_clp).toBe(29_970);
    expect(capturado.documento?.usuarios_facturados).toBe(3);
    expect(capturado.documento?.periodo_inicio).toBe("2026-08-01");
    expect(capturado.documento?.estado).toBe("pendiente");
  });

  it("congela los datos del receptor del perfil", async () => {
    const { admin, capturado } = fakeAdmin();
    await registrarPeriodoFacturado(admin, ctxBase);
    expect(capturado.documento?.receptor_rut).toBe("76086428-5");
    expect(capturado.documento?.receptor_giro).toBe("Servicios de ingeniería");
    expect(capturado.documento?.receptor_email).toBe("pagos@cliente.cl");
  });

  it("emite factura (33) a empresa y boleta (39) a persona", async () => {
    const empresa = fakeAdmin();
    await registrarPeriodoFacturado(empresa.admin, ctxBase);
    expect(empresa.capturado.documento?.tipo_dte).toBe(33);

    const persona = fakeAdmin({
      perfil: { rut: "10000013-K", razon_social: "Juan Pérez", tipo_receptor: "persona" },
    });
    await registrarPeriodoFacturado(persona.admin, ctxBase);
    expect(persona.capturado.documento?.tipo_dte).toBe(39);
  });

  it("no factura trial, impago ni cancelación", async () => {
    for (const status of ["trialing", "past_due", "unpaid", "canceled"]) {
      const { admin, capturado } = fakeAdmin();
      const id = await registrarPeriodoFacturado(admin, { ...ctxBase, status });
      expect(id).toBeNull();
      expect(capturado.documento).toBeUndefined();
    }
  });

  it("no factura un plan sin precio (gratis o enterprise)", async () => {
    const { admin, capturado } = fakeAdmin();
    expect(await registrarPeriodoFacturado(admin, { ...ctxBase, precioPorUsuario: 0 })).toBeNull();
    expect(capturado.documento).toBeUndefined();
  });

  it("no factura un workspace sin usuarios cobrables", async () => {
    const { admin, capturado } = fakeAdmin({ usuarios: 0 });
    expect(await registrarPeriodoFacturado(admin, ctxBase)).toBeNull();
    expect(capturado.documento).toBeUndefined();
  });

  it("registra igual si el perfil está incompleto: el cobro ya ocurrió", async () => {
    // Los campos faltantes quedan null y se ven marcados con ⚠ en
    // facturas-pendientes.sql antes de emitir en el SII.
    const { admin, capturado } = fakeAdmin({ perfil: null });
    const id = await registrarPeriodoFacturado(admin, ctxBase);

    expect(id).toBe("doc-9");
    expect(capturado.documento?.receptor_rut).toBe("");
    expect(capturado.documento?.receptor_giro).toBeNull();
    expect(capturado.documento?.tipo_dte).toBe(33); // default empresa
  });

  it("trata el período ya facturado como caso normal, sin lanzar", async () => {
    const { admin } = fakeAdmin({
      errorAlInsertar: { message: "duplicate key", code: "23505" },
    });
    await expect(registrarPeriodoFacturado(admin, ctxBase)).resolves.toBeNull();
  });

  it("no propaga fallos de base: el webhook debe seguir su curso", async () => {
    const { admin } = fakeAdmin({
      errorAlInsertar: { message: "connection lost", code: "08006" },
    });
    await expect(registrarPeriodoFacturado(admin, ctxBase)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
