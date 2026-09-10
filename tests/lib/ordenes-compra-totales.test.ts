import { describe, it, expect } from "vitest";
import { calcularTotales, totalLinea } from "@/lib/ordenes-compra-api";
import type { OrdenCompraLineaForm } from "@/types/ordenes-compra";

/**
 * La invariante que importa es neto + iva === total, para CUALQUIER monto.
 *
 * Una orden de compra que no cuadra la rebota el proveedor, y si esa compra
 * despues se concilia contra la factura, el descuadre de $1 aparece en
 * contabilidad. Por eso el IVA se obtiene restando contra el bruto redondeado y
 * no con un segundo round(neto * 0.19).
 */

function linea(cantidad: number, precio: number, descuento = 0): OrdenCompraLineaForm {
  return { descripcion: "x", cantidad, precio_unitario: precio, descuento };
}

describe("calcularTotales", () => {
  it("reproduce los montos de la plantilla de referencia", () => {
    // FORMATO-ORDEN-DE-COMPRA: 10 x 3360.51 => neto 33.605, IVA 6.385, total 39.990
    const t = calcularTotales([linea(10, 3360.51)]);
    expect(t.neto).toBe(33605);
    expect(t.iva).toBe(6385);
    expect(t.total).toBe(39990);
  });

  it("reproduce la OC generada desde el plan Grimme", () => {
    const t = calcularTotales([
      linea(2, 48500),
      linea(4, 2100),
      linea(8, 3850),
      linea(6, 12400),
    ]);
    expect(t.neto).toBe(210600);
    expect(t.iva).toBe(40014);
    expect(t.total).toBe(250614);
  });

  it("mantiene neto + iva === total en un barrido amplio", () => {
    for (let monto = 1; monto <= 200_000; monto += 7) {
      const t = calcularTotales([linea(1, monto)]);
      expect(t.neto + t.iva).toBe(t.total);
    }
  });

  it("aplica descuento global y otros costos antes del IVA", () => {
    const t = calcularTotales([linea(1, 100000)], 10000, 5000);
    expect(t.neto).toBe(95000);
    expect(t.neto + t.iva).toBe(t.total);
  });

  it("no deja el neto negativo si el descuento supera el bruto", () => {
    const t = calcularTotales([linea(1, 1000)], 5000);
    expect(t.neto).toBe(0);
    expect(t.total).toBe(0);
  });

  it("suma las lineas redondeando cada una, no el producto crudo", () => {
    // Si se sumara sin redondear por linea, el neto arrastraria decimales que
    // el CLP no tiene y el total dejaria de cuadrar contra el documento impreso.
    const t = calcularTotales([linea(3, 1573.33), linea(3, 1573.33)]);
    expect(Number.isInteger(t.neto)).toBe(true);
    expect(t.neto + t.iva).toBe(t.total);
  });

  it("una OC vacia vale cero y no lanza", () => {
    const t = calcularTotales([]);
    expect(t).toMatchObject({ neto: 0, iva: 0, total: 0 });
  });
});

describe("totalLinea", () => {
  it("descuenta por linea", () => {
    expect(totalLinea(linea(5, 75374))).toBe(376870);
    expect(totalLinea(linea(5, 75374, 6870))).toBe(370000);
  });

  it("nunca es negativo: un descuento mayor al subtotal topa en 0", () => {
    // Salio en un PDF de prueba como "$-281". Un total negativo en el documento
    // que recibe el proveedor no significa nada.
    expect(totalLinea(linea(3, 1573, 5000))).toBe(0);
  });

  it("tolera campos vacios sin devolver NaN", () => {
    expect(totalLinea({ descripcion: "x", cantidad: 0, precio_unitario: 0 })).toBe(0);
  });
});
