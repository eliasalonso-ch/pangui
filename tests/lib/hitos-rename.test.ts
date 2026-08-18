import { describe, it, expect } from "vitest";
import { reemplazarHitoEnDescripcion } from "@/lib/hitos-api";

// Renombrar un ITO reescribe las OTs que lo mencionan. La copia dentro de
// `descripcion` es la que lee la bandeja, así que si este reemplazo falla el
// filtro de la bandeja y la ficha del ITO dejan de coincidir.

describe("reemplazarHitoEnDescripcion", () => {
  it("reemplaza el segmento Hito de la línea de metadatos", () => {
    const desc = "N° OT: 12 | Solicitante: Ana | Hito: Cristian Quijada\n\nCuerpo de la OT.";
    expect(reemplazarHitoEnDescripcion(desc, "Cristian Quijada", "Cristián Quijada"))
      .toBe("N° OT: 12 | Solicitante: Ana | Hito: Cristián Quijada\n\nCuerpo de la OT.");
  });

  it("no toca el cuerpo aunque mencione el mismo nombre", () => {
    const desc = "Hito: Cristian Quijada\n\nHabló Cristian Quijada en terreno.";
    const out = reemplazarHitoEnDescripcion(desc, "Cristian Quijada", "Otro Nombre");
    expect(out).toBe("Hito: Otro Nombre\n\nHabló Cristian Quijada en terreno.");
  });

  it("compara sin distinguir mayúsculas, igual que normalizeIto", () => {
    const desc = "Hito: cristian quijada\n\nCuerpo.";
    expect(reemplazarHitoEnDescripcion(desc, "Cristian Quijada", "Nuevo"))
      .toBe("Hito: Nuevo\n\nCuerpo.");
  });

  it("deja intacta una descripción sin metadatos", () => {
    const desc = "Solo texto libre, sin bloque de metadatos.";
    expect(reemplazarHitoEnDescripcion(desc, "Cristian Quijada", "Nuevo")).toBe(desc);
  });

  it("no toca el segmento Hito de otra OT que no coincide", () => {
    const desc = "N° OT: 9 | Hito: Enzo Cifuente\n\nCuerpo.";
    expect(reemplazarHitoEnDescripcion(desc, "Cristian Quijada", "Nuevo")).toBe(desc);
  });

  it("conserva los demás segmentos y su orden", () => {
    const desc = "N° OT: 5 | Solicitante: Ana | Hito: Enzo Cifuente | Ubicación: Torre A\n\nCuerpo.";
    expect(reemplazarHitoEnDescripcion(desc, "Enzo Cifuente", "Enzo C."))
      .toBe("N° OT: 5 | Solicitante: Ana | Hito: Enzo C. | Ubicación: Torre A\n\nCuerpo.");
  });
});
