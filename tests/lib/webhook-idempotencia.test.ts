import { describe, it, expect } from "vitest";
import { claveIdempotencia, esDuplicado, UNIQUE_VIOLATION } from "@/lib/webhook-idempotencia";

describe("claveIdempotencia", () => {
  const base = {
    subscriptionId: "sus_abc123",
    status: "active",
    periodStart: "2026-08-01",
    nextInvoiceDate: "2026-09-01",
  };

  it("colapsa dos entregas del mismo evento en una sola clave", () => {
    // Misma suscripción, mismo estado, mismo período: es una reentrega.
    expect(claveIdempotencia(base)).toBe(claveIdempotencia({ ...base }));
  });

  it("distingue la renovación del mes siguiente", () => {
    // Mismo estado y misma suscripción, pero período nuevo: evento legítimo.
    const septiembre = { ...base, periodStart: "2026-09-01", nextInvoiceDate: "2026-10-01" };
    expect(claveIdempotencia(septiembre)).not.toBe(claveIdempotencia(base));
  });

  it("distingue un cambio de estado dentro del mismo período", () => {
    // Un impago que pasa active → past_due debe procesarse, no descartarse.
    expect(claveIdempotencia({ ...base, status: "past_due" })).not.toBe(claveIdempotencia(base));
  });

  it("distingue suscripciones distintas", () => {
    expect(claveIdempotencia({ ...base, subscriptionId: "sus_xyz789" })).not.toBe(claveIdempotencia(base));
  });

  it("no depende del instante de entrega", () => {
    // La clave se deriva solo del contenido; dos entregas separadas en el
    // tiempo producen la misma clave. Si alguien agregara un timestamp, este
    // test fallaría y la idempotencia estaría rota.
    const clave = claveIdempotencia(base);
    expect(clave).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(clave).toBe("sus_abc123:active:2026-08-01");
  });

  it("cae a next_invoice_date cuando no viene period_start", () => {
    const sinInicio = { ...base, periodStart: null };
    expect(claveIdempotencia(sinInicio)).toBe("sus_abc123:active:2026-09-01");
  });

  it("usa un marcador estable cuando no viene ninguna fecha", () => {
    const sinFechas = { subscriptionId: "sus_abc123", status: "canceled", periodStart: null, nextInvoiceDate: null };
    expect(claveIdempotencia(sinFechas)).toBe("sus_abc123:canceled:sin-periodo");
    // Estable: dos entregas sin fechas siguen colapsando.
    expect(claveIdempotencia(sinFechas)).toBe(claveIdempotencia({ ...sinFechas }));
  });
});

describe("esDuplicado", () => {
  it("reconoce la violación de índice único de Postgres", () => {
    expect(esDuplicado({ code: UNIQUE_VIOLATION })).toBe(true);
    expect(esDuplicado({ code: "23505" })).toBe(true);
  });

  it("no confunde otros errores con un duplicado", () => {
    // Un fallo de conexión no debe interpretarse como "ya procesado": el
    // evento quedaría sin aplicar y sin candado.
    expect(esDuplicado({ code: "08006" })).toBe(false);
    expect(esDuplicado({ code: "23503" })).toBe(false);
    expect(esDuplicado(null)).toBe(false);
    expect(esDuplicado(undefined)).toBe(false);
    expect(esDuplicado({})).toBe(false);
  });
});
