import { describe, it, expect } from "vitest";
import { EmisorManual, DocumentoDuplicadoError, type ClienteAdmin } from "@/lib/dte/emisor";
import { TIPO_DTE, tipoDtePara, nombreDte } from "@/lib/dte/tipos";
import type { SolicitudDocumento } from "@/lib/dte/tipos";

/**
 * Doble del cliente Supabase: registra lo que se le pidió escribir y devuelve
 * la fila resultante, sin red ni mocks de PostgREST.
 */
function fakeAdmin(opciones: {
  errorAlInsertar?: { message: string; code?: string };
  errorAlActualizar?: { message: string; code?: string };
} = {}) {
  const capturado: { insert?: Record<string, unknown>; update?: Record<string, unknown>; id?: unknown } = {};

  const admin: ClienteAdmin = {
    from() {
      return {
        insert(valores: Record<string, unknown>) {
          capturado.insert = valores;
          return {
            select() {
              return {
                async single() {
                  if (opciones.errorAlInsertar) return { data: null, error: opciones.errorAlInsertar };
                  return { data: { id: "doc-1", ...valores }, error: null };
                },
              };
            },
          };
        },
        update(valores: Record<string, unknown>) {
          capturado.update = valores;
          return {
            eq(_columna: string, valor: unknown) {
              capturado.id = valor;
              return {
                select() {
                  return {
                    async single() {
                      if (opciones.errorAlActualizar) return { data: null, error: opciones.errorAlActualizar };
                      return {
                        data: {
                          id: valor, workspace_id: "ws-1", subscription_id: "sub-1",
                          tipo_dte: 33, periodo_inicio: "2026-08-01", periodo_fin: "2026-08-31",
                          neto_clp: 41933, iva_clp: 7967, total_clp: 49900,
                          usuarios_facturados: 10, precio_unitario_clp: 4990,
                          ...valores,
                        },
                        error: null,
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { admin, capturado };
}

const solicitudBase: SolicitudDocumento = {
  workspaceId:        "ws-1",
  subscriptionId:     "sub-1",
  tipoDte:            TIPO_DTE.FACTURA_AFECTA,
  periodoInicio:      "2026-08-01",
  periodoFin:         "2026-08-31",
  usuariosFacturados: 10,
  precioUnitarioClp:  4990,
  receptor: {
    rut:         "76086428-5",
    razonSocial: "Cliente SpA",
    giro:        "Servicios de ingeniería",
    direccion:   "Av. Siempre Viva 742",
    comuna:      "Providencia",
    ciudad:      "Santiago",
    email:       "pagos@cliente.cl",
  },
};

describe("EmisorManual.registrar", () => {
  it("calcula el desglose sobre el total del período", async () => {
    const { admin, capturado } = fakeAdmin();
    const doc = await new EmisorManual(admin).registrar(solicitudBase);

    // El precio de lista es NETO: 10 usuarios × $4.990 = $49.900 de base
    // imponible, más IVA da $59.381 de total facturado.
    expect(doc.netoClp).toBe(49_900);
    expect(doc.ivaClp).toBe(9_481);
    expect(doc.totalClp).toBe(59_381);
    expect(doc.netoClp + doc.ivaClp).toBe(doc.totalClp);
    expect(capturado.insert?.neto_clp).toBe(49_900);
  });

  it("deja el documento pendiente y sin folio", async () => {
    const { admin } = fakeAdmin();
    const doc = await new EmisorManual(admin).registrar(solicitudBase);
    expect(doc.estado).toBe("pendiente");
    expect(doc.folio).toBeNull();
    expect(doc.emitidoAt).toBeNull();
  });

  it("congela los datos del receptor en el documento", async () => {
    const { admin, capturado } = fakeAdmin();
    await new EmisorManual(admin).registrar(solicitudBase);
    expect(capturado.insert?.receptor_rut).toBe("76086428-5");
    expect(capturado.insert?.receptor_razon_social).toBe("Cliente SpA");
    expect(capturado.insert?.receptor_giro).toBe("Servicios de ingeniería");
    expect(capturado.insert?.receptor_ciudad).toBe("Santiago");
  });

  it("convierte la violación de unicidad en DocumentoDuplicadoError", async () => {
    const { admin } = fakeAdmin({
      errorAlInsertar: { message: "duplicate key", code: "23505" },
    });
    await expect(new EmisorManual(admin).registrar(solicitudBase))
      .rejects.toBeInstanceOf(DocumentoDuplicadoError);
  });

  it("propaga otros errores de base con contexto", async () => {
    const { admin } = fakeAdmin({
      errorAlInsertar: { message: "connection lost", code: "08006" },
    });
    await expect(new EmisorManual(admin).registrar(solicitudBase))
      .rejects.toThrow(/connection lost/);
  });

  it("un período sin usuarios activos no cobra nada", async () => {
    const { admin } = fakeAdmin();
    const doc = await new EmisorManual(admin).registrar({
      ...solicitudBase,
      usuariosFacturados: 0,
    });
    expect(doc.totalClp).toBe(0);
    expect(doc.netoClp).toBe(0);
    expect(doc.ivaClp).toBe(0);
  });
});

describe("EmisorManual.confirmarEmision", () => {
  it("registra folio, estado y fecha de emisión", async () => {
    const { admin, capturado } = fakeAdmin();
    const doc = await new EmisorManual(admin).confirmarEmision("doc-1", 1042);

    expect(doc.folio).toBe(1042);
    expect(doc.estado).toBe("emitido");
    expect(doc.emitidoAt).not.toBeNull();
    expect(capturado.id).toBe("doc-1");
  });

  it("rechaza folios inválidos antes de tocar la base", async () => {
    const { admin, capturado } = fakeAdmin();
    const emisor = new EmisorManual(admin);

    await expect(emisor.confirmarEmision("doc-1", 0)).rejects.toThrow(/Folio inválido/);
    await expect(emisor.confirmarEmision("doc-1", -5)).rejects.toThrow(/Folio inválido/);
    await expect(emisor.confirmarEmision("doc-1", 1.5)).rejects.toThrow(/Folio inválido/);
    expect(capturado.update).toBeUndefined();
  });

  it("explica el folio repetido en vez de filtrar el error de Postgres", async () => {
    const { admin } = fakeAdmin({
      errorAlActualizar: { message: "duplicate key", code: "23505" },
    });
    await expect(new EmisorManual(admin).confirmarEmision("doc-1", 1042))
      .rejects.toThrow(/folio 1042 ya está registrado/i);
  });
});

describe("EmisorManual.marcarError", () => {
  it("guarda el motivo en la nota", async () => {
    const { admin, capturado } = fakeAdmin();
    const doc = await new EmisorManual(admin).marcarError("doc-1", "RUT rechazado por el SII");
    expect(doc.estado).toBe("error");
    expect(capturado.update?.nota).toBe("RUT rechazado por el SII");
  });
});

describe("tipo de documento según receptor", () => {
  it("empresa recibe factura y persona recibe boleta", () => {
    expect(tipoDtePara("empresa")).toBe(TIPO_DTE.FACTURA_AFECTA);
    expect(tipoDtePara("persona")).toBe(TIPO_DTE.BOLETA_AFECTA);
  });

  it("nombra los documentos para la UI", () => {
    expect(nombreDte(TIPO_DTE.FACTURA_AFECTA)).toBe("Factura electrónica");
    expect(nombreDte(TIPO_DTE.BOLETA_AFECTA)).toBe("Boleta electrónica");
    expect(nombreDte(TIPO_DTE.NOTA_CREDITO)).toBe("Nota de crédito");
  });
});
