import { describe, it, expect } from "vitest";
import { tipoDeCambio, resumirCambio, fechaEfectiva } from "@/lib/cambio-plan";

describe("tipoDeCambio", () => {
  it("reconoce una subida", () => {
    expect(tipoDeCambio("basic", "pro")).toBe("subida");
    expect(tipoDeCambio("basic", "esencial")).toBe("subida");
    expect(tipoDeCambio("esencial", "pro")).toBe("subida");
  });

  it("reconoce una bajada", () => {
    expect(tipoDeCambio("pro", "basic")).toBe("bajada");
    expect(tipoDeCambio("pro", "esencial")).toBe("bajada");
  });

  it("reconoce el mismo plan", () => {
    expect(tipoDeCambio("pro", "pro")).toBe("mismo");
  });
});

const base = {
  usuariosActivos: 3,
  periodoFin: "2026-09-16T00:00:00Z",
  precioPorUsuario: null,
};

describe("resumirCambio — subida", () => {
  const r = resumirCambio({ ...base, planActual: "basic", planNuevo: "pro" });

  it("calcula los totales con IVA incluido", () => {
    // 3 × $4.990 = $14.970 → 3 × $9.990 = $29.970
    expect(r.totalActual).toBe(14_970);
    expect(r.totalNuevo).toBe(29_970);
  });

  it("avisa que el cambio es inmediato y cobra la diferencia", () => {
    expect(r.detalle).toContain("se aplica ahora");
    expect(r.detalle).toContain("cobrará la diferencia");
  });

  // Lo que motivó el módulo: una subida no se puede deshacer, y el usuario
  // tiene que saberlo ANTES de confirmar, no después.
  it("advierte que no se puede deshacer", () => {
    expect(r.reversible).toBe(false);
    expect(r.advertencia).toContain("no se puede deshacer");
    expect(r.advertencia).toContain("Basic");
  });

  it("nombra el plan destino en el botón", () => {
    expect(r.textoConfirmar).toContain("Pro");
  });
});

describe("resumirCambio — bajada", () => {
  const r = resumirCambio({ ...base, planActual: "pro", planNuevo: "basic" });

  it("explica que conserva el plan actual hasta el fin del período pagado", () => {
    expect(r.detalle).toContain("Conservas Pro");
    expect(r.detalle).toContain("16 de septiembre de 2026");
  });

  it("no advierte de irreversibilidad: se puede cancelar", () => {
    expect(r.reversible).toBe(true);
    expect(r.advertencia).toBeNull();
  });

  it("muestra la baja de precio", () => {
    expect(r.totalActual).toBe(29_970);
    expect(r.totalNuevo).toBe(14_970);
  });
});

describe("resumirCambio — precio de cliente fundador", () => {
  it("usa el precio negociado en vez del de catálogo", () => {
    // Un fundador conserva su precio al cambiar de tier (ver change-plan), así
    // que el total no puede salir del catálogo.
    const r = resumirCambio({
      ...base,
      planActual: "basic",
      planNuevo: "pro",
      usuariosActivos: 10,
      precioPorUsuario: 3990,
    });
    expect(r.totalActual).toBe(39_900);
    expect(r.totalNuevo).toBe(39_900);
  });
});

describe("resumirCambio — casos borde", () => {
  it("el mismo plan no propone nada", () => {
    const r = resumirCambio({ ...base, planActual: "pro", planNuevo: "pro" });
    expect(r.tipo).toBe("mismo");
    expect(r.detalle).toContain("Ya estás en Pro");
  });

  it("un solo usuario usa el singular", () => {
    const r = resumirCambio({ ...base, planActual: "basic", planNuevo: "pro", usuariosActivos: 1 });
    expect(r.detalle).toContain("1 usuario activo");
    expect(r.detalle).not.toContain("usuarios activos");
  });

  it("cero usuarios no rompe el cálculo", () => {
    const r = resumirCambio({ ...base, planActual: "basic", planNuevo: "pro", usuariosActivos: 0 });
    expect(r.totalNuevo).toBe(0);
  });

  it("tolera una cantidad negativa de usuarios", () => {
    const r = resumirCambio({ ...base, planActual: "basic", planNuevo: "pro", usuariosActivos: -5 });
    expect(r.totalNuevo).toBe(0);
  });
});

describe("fechaEfectiva", () => {
  it("formatea el día calendario en UTC", () => {
    // Sin timeZone UTC, en Chile (UTC−4) esto mostraría el 15.
    expect(fechaEfectiva("2026-09-16T00:00:00Z")).toBe("16 de septiembre de 2026");
  });

  it("cae a un texto genérico si no hay fecha", () => {
    expect(fechaEfectiva(null)).toBe("el fin del período actual");
    expect(fechaEfectiva("no es una fecha")).toBe("el fin del período actual");
  });
});
