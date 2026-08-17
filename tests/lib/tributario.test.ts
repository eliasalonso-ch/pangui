import { describe, it, expect } from "vitest";
import {
  TASA_IVA,
  desglosarBruto,
  desglosarNeto,
  desglosarCobroSuscripcion,
  formatearCLP,
  textoDesglose,
  normalizarRut,
  digitoVerificador,
  rutEsValido,
  formatearRut,
} from "@/lib/tributario";

describe("desglosarBruto", () => {
  it("descompone los precios del catálogo", () => {
    // Los tres planes self-serve de lib/flow-plans.ts.
    expect(desglosarBruto(4990)).toEqual({ neto: 4193, iva: 797, bruto: 4990 });
    expect(desglosarBruto(6990)).toEqual({ neto: 5874, iva: 1116, bruto: 6990 });
    expect(desglosarBruto(9990)).toEqual({ neto: 8395, iva: 1595, bruto: 9990 });
  });

  it("trata 0 como desglose vacío", () => {
    expect(desglosarBruto(0)).toEqual({ neto: 0, iva: 0, bruto: 0 });
  });

  it("rechaza montos negativos o no numéricos", () => {
    expect(() => desglosarBruto(-1)).toThrow(/no puede ser negativo/);
    expect(() => desglosarBruto(Number.NaN)).toThrow(/inválido/);
    expect(() => desglosarBruto(Number.POSITIVE_INFINITY)).toThrow(/inválido/);
  });

  it("devuelve siempre enteros: el CLP no tiene decimales", () => {
    for (const bruto of [1, 7, 99, 4990, 123457]) {
      const d = desglosarBruto(bruto);
      expect(Number.isInteger(d.neto)).toBe(true);
      expect(Number.isInteger(d.iva)).toBe(true);
      expect(Number.isInteger(d.bruto)).toBe(true);
    }
  });

  // Ésta es la razón de existir del módulo: si el IVA se calculara como
  // round(neto * 0.19) en vez de (bruto - neto), habría montos donde la
  // factura no cuadra y el SII la rechaza.
  it("garantiza neto + iva === bruto para todo monto de 1 a 2.000.000", () => {
    const descuadres: number[] = [];
    for (let bruto = 1; bruto <= 2_000_000; bruto++) {
      const d = desglosarBruto(bruto);
      if (d.neto + d.iva !== bruto) descuadres.push(bruto);
    }
    expect(descuadres).toEqual([]);
  });

  it("demuestra que el cálculo ingenuo del IVA sí descuadra", () => {
    // Contraprueba: round(neto * 0.19) falla para al menos un monto en el
    // rango. Si este test empieza a fallar es que alguien "arregló" el
    // cálculo ingenuo, y entonces el comentario del módulo miente.
    const fallos: number[] = [];
    for (let bruto = 1; bruto <= 100_000; bruto++) {
      const neto = Math.round(bruto / (1 + TASA_IVA));
      if (neto + Math.round(neto * TASA_IVA) !== bruto) fallos.push(bruto);
    }
    expect(fallos.length).toBeGreaterThan(0);
  });
});

describe("desglosarNeto", () => {
  it("reconstruye el bruto desde el neto y cuadra", () => {
    const d = desglosarNeto(8395);
    expect(d.neto).toBe(8395);
    expect(d.neto + d.iva).toBe(d.bruto);
  });

  it("garantiza el cuadre para todo neto de 1 a 500.000", () => {
    const descuadres: number[] = [];
    for (let neto = 1; neto <= 500_000; neto++) {
      const d = desglosarNeto(neto);
      if (d.neto + d.iva !== d.bruto) descuadres.push(neto);
    }
    expect(descuadres).toEqual([]);
  });

  it("rechaza montos negativos", () => {
    expect(() => desglosarNeto(-5)).toThrow(/no puede ser negativo/);
  });
});

describe("desglosarCobroSuscripcion", () => {
  it("calcula el IVA sobre el total, no por usuario", () => {
    // 7 usuarios a $9.990 = $69.930 bruto.
    const total = desglosarCobroSuscripcion(9990, 7);
    expect(total.bruto).toBe(69_930);
    expect(total.neto + total.iva).toBe(total.bruto);
  });

  it("no equivale a desglosar cada línea y sumar", () => {
    // Con Basic ($4.990) y 10 usuarios, desglosar por línea y sumar arrastra
    // el redondeo 10 veces: da $41.930 de neto contra los $41.933 correctos.
    // Este test fija esa diferencia para que nadie "simplifique" el cálculo a
    // una suma de líneas — el total de la factura dejaría de cuadrar con sus
    // propias líneas y el SII la rechazaría.
    const total = desglosarCobroSuscripcion(4990, 10);
    const porLinea = desglosarBruto(4990);

    expect(total.bruto).toBe(49_900);
    expect(total.neto).toBe(41_933);
    expect(porLinea.neto * 10).toBe(41_930);
    expect(total.neto + total.iva).toBe(total.bruto);
  });

  it("un solo usuario equivale al desglose del precio de lista", () => {
    expect(desglosarCobroSuscripcion(9990, 1)).toEqual(desglosarBruto(9990));
  });

  it("cero usuarios no cobra nada", () => {
    expect(desglosarCobroSuscripcion(9990, 0)).toEqual({ neto: 0, iva: 0, bruto: 0 });
  });

  it("rechaza cantidades de usuarios inválidas", () => {
    expect(() => desglosarCobroSuscripcion(9990, -1)).toThrow(/usuarios inválida/);
    expect(() => desglosarCobroSuscripcion(9990, 1.5)).toThrow(/usuarios inválida/);
  });
});

describe("formato", () => {
  it("formatea CLP sin decimales", () => {
    // El separador de miles del locale es un punto; se normaliza el espacio
    // no separable que algunos runtimes insertan tras el símbolo.
    expect(formatearCLP(9990).replace(/ /g, " ")).toContain("9.990");
    expect(formatearCLP(9990)).not.toContain(",00");
  });

  it("arma el texto de desglose para la UI", () => {
    const texto = textoDesglose(9990);
    expect(texto).toContain("9.990");
    expect(texto).toContain("8.395");
    expect(texto).toContain("1.595");
    expect(texto).toContain("neto");
    expect(texto).toContain("IVA");
  });
});

describe("RUT", () => {
  it("normaliza puntos, guiones y mayúsculas", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("12345678-5")).toBe("12345678-5");
    expect(normalizarRut("10.000.013-k")).toBe("10000013-K");
    expect(normalizarRut(" 76.086.428-5 ")).toBe("76086428-5");
  });

  it("calcula el dígito verificador por módulo 11", () => {
    expect(digitoVerificador("12345678")).toBe("5");
    expect(digitoVerificador("76086428")).toBe("5");
    expect(digitoVerificador("15334415")).toBe("9");
    // Cuerpo cuyo resto es 10, el único caso que produce "K".
    expect(digitoVerificador("10000013")).toBe("K");
    expect(digitoVerificador("6000000")).toBe("K");
  });

  it("acepta RUT válidos, con y sin formato", () => {
    expect(rutEsValido("12.345.678-5")).toBe(true);
    expect(rutEsValido("12345678-5")).toBe(true);
    expect(rutEsValido("10.000.013-K")).toBe(true);
    expect(rutEsValido("10000013-k")).toBe(true);
    // RUT de empresa (8 dígitos) y de persona (7 dígitos).
    expect(rutEsValido("76086428-5")).toBe(true);
    expect(rutEsValido("6375315-7")).toBe(true);
  });

  it("rechaza dígito verificador incorrecto", () => {
    expect(rutEsValido("12.345.678-9")).toBe(false);
    expect(rutEsValido("15334415-1")).toBe(false);
    // DV correcto es K; un dígito numérico no debe colarse.
    expect(rutEsValido("10000013-0")).toBe(false);
  });

  it("rechaza entradas mal formadas o vacías", () => {
    expect(rutEsValido(null)).toBe(false);
    expect(rutEsValido(undefined)).toBe(false);
    expect(rutEsValido("")).toBe(false);
    expect(rutEsValido("no-es-un-rut")).toBe(false);
    expect(rutEsValido("123-5")).toBe(false);          // cuerpo muy corto
    expect(rutEsValido("123456789012-5")).toBe(false); // cuerpo muy largo
    expect(rutEsValido("12345678-X")).toBe(false);     // DV inválido
  });

  it("formatea con puntos para mostrar", () => {
    expect(formatearRut("12345678-5")).toBe("12.345.678-5");
    expect(formatearRut("10000013-K")).toBe("10.000.013-K");
    expect(formatearRut("6375315-7")).toBe("6.375.315-7");
  });
});
