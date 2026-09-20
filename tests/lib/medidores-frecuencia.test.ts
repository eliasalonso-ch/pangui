/**
 * La ronda de un medidor manual, en minutos.
 *
 * La web guardaba `frecuencia_dias`, así que la ronda más corta posible era de
 * un día: un medidor configurado desde la móvil como "Cada hora" se veía en la
 * web como "Cada 1 días" y la lista de pendientes no lo mostraba hasta el día
 * siguiente. Las dos apps escriben la misma columna, así que los catálogos
 * tienen que coincidir.
 */
import { describe, it, expect } from "vitest";
import { FRECUENCIAS, etiquetaFrecuencia, proximaLectura } from "@/lib/medidores-api";

describe("catálogo de frecuencias", () => {
  it("ofrece las rondas por turno, que es lo que faltaba", () => {
    const etiquetas = FRECUENCIAS.map(f => f.label);
    expect(etiquetas).toContain("Cada hora");
    expect(etiquetas).toContain("Cada 4 horas");
    expect(etiquetas).toContain("Cada 8 horas");
    expect(etiquetas).toContain("Cada 12 horas");
  });

  it("guarda en minutos", () => {
    expect(FRECUENCIAS.find(f => f.label === "Cada hora")?.minutos).toBe(60);
    expect(FRECUENCIAS.find(f => f.label === "Diaria")?.minutos).toBe(1440);
    expect(FRECUENCIAS.find(f => f.label === "Semanal")?.minutos).toBe(10080);
  });

  it("rotula una frecuencia que no está en el catálogo", () => {
    expect(etiquetaFrecuencia(null)).toBe("Sin ronda");
    expect(etiquetaFrecuencia(60)).toBe("Cada hora");
    expect(etiquetaFrecuencia(3 * 1440)).toBe("Cada 3 días");
    expect(etiquetaFrecuencia(6 * 60)).toBe("Cada 6 horas");
    expect(etiquetaFrecuencia(90)).toBe("Cada 90 minutos");
  });
});

describe("proximaLectura", () => {
  const base = {
    tipo: "manual" as const,
    ultima: { ts: "2026-09-20T10:00:00.000Z" },
  };

  it("cuenta en minutos: una ronda por hora vence a la hora", () => {
    const p = proximaLectura({ ...base, frecuencia_minutos: 60, frecuencia_dias: 1 } as never);
    expect(p?.toISOString()).toBe("2026-09-20T11:00:00.000Z");
  });

  it("cae a la columna vieja mientras la fila no tenga la nueva", () => {
    const p = proximaLectura({ ...base, frecuencia_minutos: null, frecuencia_dias: 2 } as never);
    expect(p?.toISOString()).toBe("2026-09-22T10:00:00.000Z");
  });

  it("sin ronda no vence nunca", () => {
    expect(proximaLectura({ ...base, frecuencia_minutos: null, frecuencia_dias: null } as never)).toBeNull();
  });

  it("un automatizado no espera que nadie vaya a leerlo", () => {
    expect(proximaLectura({
      ...base, tipo: "automatizado", frecuencia_minutos: 60, frecuencia_dias: 1,
    } as never)).toBeNull();
  });
});
