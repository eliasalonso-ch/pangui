// Reglas puras para convertir una solicitud MeConecta en OT: calces contra el
// catálogo, prioridad, plazo y descripción. Sin imports a propósito: así los
// tests de la web (vitest + tsc) las cubren sin arrastrar código Deno.

/** minúsculas, sin tildes, espacios colapsados. */
export function norm(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * ITO = "Nombre Resolutor". El portal trae el nombre completo ("Cristian
 * Gonzalo Quijada González") y Pangui el corto ("Cristian Quijada", a veces con
 * typo: "Enzo Cifuente"). Calza el hito que comparte el primer nombre y cuyas
 * palabras empiezan alguna palabra del resolutor. Ambiguo => null.
 */
export function matchIto(resolutor: string, hitos: string[]): string | null {
  const r = norm(resolutor).split(" ").filter(Boolean);
  if (r.length === 0) return null;
  const hits = hitos.filter((h) => {
    const w = norm(h).split(" ").filter(Boolean);
    return w.length > 0 && w[0] === r[0] && w.every((p) => r.some((x) => x.startsWith(p)));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** "Electrica" (portal) ↔ "Eléctrico" (catálogo): se ignora tilde y género. */
export function matchCategoria(tipo: string, cats: { id: string; nombre: string }[]): string | null {
  const k = norm(tipo).replace(/[ao]$/, "");
  if (!k) return null;
  return cats.find((c) => norm(c.nombre).replace(/[ao]$/, "") === k)?.id ?? null;
}

export function prioridadDe(p: string): "baja" | "media" | "alta" | "urgente" {
  const n = norm(p);
  if (n.includes("urgen") || n.includes("emergen")) return "urgente"; // el portal dice "emergencia"
  if (n.includes("alta")) return "alta";
  if (n.includes("baja")) return "baja";
  return "media"; // "normal" y cualquier valor nuevo
}

export function sumarDias(ymd: string, dias: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Mismo formato que buildDescripcion() de la web (lib/ordenes-api.ts). */
export function descripcionDe(d: { folio: string; contacto: string; detalle: string }, ito: string | null): string {
  const header = [`N° OT: ${d.folio}`, d.contacto && `Solicitante: ${d.contacto}`, ito && `Hito: ${ito}`]
    .filter(Boolean).join(" | ");
  return d.detalle ? `${header}\n\n${d.detalle}` : header;
}
