import { describe, expect, it } from "vitest";
import { classifyWaitingReason } from "../lib/waiting-reason";

describe("classifyWaitingReason", () => {
  it("detecta faltantes de materiales", () => {
    expect(classifyWaitingReason("Faltan materiales").key).toBe("materiales");
    expect(classifyWaitingReason("Esperando material eléctrico").key).toBe("materiales");
  });

  it("detecta reprogramaciones, incluso escritas como 'coordinado'", () => {
    // El móvil antepone "Reprogramar:", pero la gente también escribe libre.
    expect(classifyWaitingReason("Reprogramar: cliente pidió otra fecha").key).toBe("reprogramar");
    expect(classifyWaitingReason("Coordinado para las 17:00hrs").key).toBe("reprogramar");
    expect(classifyWaitingReason("Se reagendó para el lunes").key).toBe("reprogramar");
  });

  it("detecta falta de acceso", () => {
    expect(classifyWaitingReason("Sin acceso al recinto").key).toBe("acceso");
    expect(classifyWaitingReason("No pudimos ingresar").key).toBe("acceso");
  });

  it("cae en 'otro' cuando el texto no calza con nada", () => {
    // Caso real de la base: los técnicos pausan por colación.
    expect(classifyWaitingReason("Colación").key).toBe("otro");
    expect(classifyWaitingReason(null).key).toBe("otro");
    expect(classifyWaitingReason("").key).toBe("otro");
  });

  it("materiales gana sobre reprogramar cuando el texto menciona los dos", () => {
    // El orden importa: el bloqueo real es el material, la fecha es su
    // consecuencia.
    expect(classifyWaitingReason("Faltan materiales, se coordina para el jueves").key)
      .toBe("materiales");
  });

  it("siempre devuelve una etiqueta mostrable", () => {
    for (const c of ["Faltan materiales", "Coordinado", "Sin acceso", "Colación", null]) {
      expect(classifyWaitingReason(c).label.length).toBeGreaterThan(0);
    }
  });
});
