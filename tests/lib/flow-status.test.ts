import { describe, it, expect } from "vitest";
import { estadoDesdeFlow, estaPagada } from "@/lib/flow-status";

describe("estadoDesdeFlow", () => {
  it("activa y al día es active", () => {
    expect(estadoDesdeFlow({ status: 1, morose: 0 })).toBe("active");
    expect(estadoDesdeFlow({ status: 1 })).toBe("active");
  });

  it("activa pero vencida es past_due", () => {
    expect(estadoDesdeFlow({ status: 1, morose: 1 })).toBe("past_due");
  });

  // El caso que motivó el módulo: una suscripción recién creada cuyo link de
  // pago nadie pagó reporta status=1 + morose=2. Tratarla como active daba
  // acceso pagado sin pago y emitía una factura por un cobro inexistente.
  it("activa pero pendiente de pago es past_due, NO active", () => {
    expect(estadoDesdeFlow({ status: 1, morose: 2 })).toBe("past_due");
  });

  it("mapea el resto de estados de Flow", () => {
    expect(estadoDesdeFlow({ status: 0 })).toBe("unpaid");
    expect(estadoDesdeFlow({ status: 2 })).toBe("trialing");
    expect(estadoDesdeFlow({ status: 4 })).toBe("canceled");
  });

  it("un trial sigue siendo trial aunque morose venga con ruido", () => {
    expect(estadoDesdeFlow({ status: 2, morose: 2 })).toBe("trialing");
  });

  it("ante un estado desconocido asume lo conservador", () => {
    // Nunca 'active': regalar acceso o emitir factura por un estado que no
    // entendemos es peor que exigir un pago de más.
    expect(estadoDesdeFlow({ status: 99 })).toBe("past_due");
    expect(estadoDesdeFlow({ status: -1 })).toBe("past_due");
  });
});

describe("estaPagada", () => {
  it("solo active cuenta como pagada", () => {
    expect(estaPagada("active")).toBe(true);
    for (const estado of ["trialing", "past_due", "unpaid", "canceled"] as const) {
      expect(estaPagada(estado)).toBe(false);
    }
  });

  it("una suscripción pendiente de pago no factura", () => {
    // La composición que de verdad importa: Flow dice status=1/morose=2 y el
    // sistema no debe emitir documento tributario.
    expect(estaPagada(estadoDesdeFlow({ status: 1, morose: 2 }))).toBe(false);
  });
});
