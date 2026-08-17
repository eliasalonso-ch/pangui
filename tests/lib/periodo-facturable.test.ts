import { describe, it, expect } from "vitest";
import { periodoAFacturar, soloFecha } from "@/lib/dte/periodo-facturable";

const activo = {
  status: "active",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  nextInvoiceDate: "2026-09-01",
};

describe("periodoAFacturar", () => {
  it("factura un período pagado", () => {
    expect(periodoAFacturar(activo)).toEqual({
      periodoInicio: "2026-08-01",
      periodoFin: "2026-08-31",
    });
  });

  it("no factura un trial: el cliente todavía no ha pagado nada", () => {
    expect(periodoAFacturar({ ...activo, status: "trialing" })).toBeNull();
  });

  it("no factura un impago: emitir obligaría a anular después", () => {
    expect(periodoAFacturar({ ...activo, status: "past_due" })).toBeNull();
    expect(periodoAFacturar({ ...activo, status: "unpaid" })).toBeNull();
  });

  it("no factura una cancelación", () => {
    expect(periodoAFacturar({ ...activo, status: "canceled" })).toBeNull();
  });

  it("usa next_invoice_date cuando Flow no manda period_end", () => {
    const sinFin = { ...activo, periodEnd: null };
    expect(periodoAFacturar(sinFin)).toEqual({
      periodoInicio: "2026-08-01",
      periodoFin: "2026-09-01",
    });
  });

  it("normaliza fechas con hora al formato del SII", () => {
    const conHora = {
      status: "active",
      periodStart: "2026-08-01 00:00:00",
      periodEnd: "2026-08-31 23:59:59",
      nextInvoiceDate: null,
    };
    expect(periodoAFacturar(conHora)).toEqual({
      periodoInicio: "2026-08-01",
      periodoFin: "2026-08-31",
    });
  });

  it("no registra nada si falta el período", () => {
    // Sin fechas no se puede identificar qué se factura, y el índice único que
    // evita la doble facturación depende de ellas. El período aparecerá en
    // facturas-pendientes.sql como red de seguridad.
    expect(periodoAFacturar({ ...activo, periodStart: null })).toBeNull();
    expect(periodoAFacturar({ ...activo, periodEnd: null, nextInvoiceDate: null })).toBeNull();
  });

  it("rechaza un período invertido", () => {
    const invertido = { ...activo, periodStart: "2026-09-01", periodEnd: "2026-08-01", nextInvoiceDate: null };
    expect(periodoAFacturar(invertido)).toBeNull();
  });

  it("rechaza fechas con formato inesperado", () => {
    expect(periodoAFacturar({ ...activo, periodStart: "01/08/2026" })).toBeNull();
  });
});

describe("soloFecha", () => {
  it("extrae la parte de fecha de los formatos que manda Flow", () => {
    expect(soloFecha("2026-08-01")).toBe("2026-08-01");
    expect(soloFecha("2026-08-01 00:00:00")).toBe("2026-08-01");
    expect(soloFecha("2026-08-01T00:00:00Z")).toBe("2026-08-01");
  });

  it("devuelve null si no reconoce el formato", () => {
    expect(soloFecha("01-08-2026")).toBeNull();
    expect(soloFecha("")).toBeNull();
    expect(soloFecha("ayer")).toBeNull();
  });
});
