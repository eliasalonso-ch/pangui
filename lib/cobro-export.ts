import { createClient } from "@/lib/supabase";
import { fetchFilas, COLUMNA_CODIGO } from "@/lib/hojas-api";
import type { Hoja } from "@/lib/hojas-api";

/**
 * Exporta una hoja de cobro como archivo .json para la app local de cobros.
 *
 * El archivo lleva la cabecera de la OT (número, solicitante, lugar, fecha,
 * descripción) y las líneas código+cantidad. NO lleva precios: los resuelve la
 * app de cobros contra su catálogo local, igual que el VLOOKUP del Excel.
 */
export interface CobroExport {
  formato: "cobro-electrilam";
  version: 1;
  generadoEn: string;
  orden: {
    numero: number | null;
    /** N° de OT del cliente (SF9…). Si falta, el cobro es SIN OT. */
    numeroMeconecta: string | null;
    solicitante: string;
    /** Ubicación: edificio · detalle · lugar. */
    lugar: string;
    /** Fecha en que se completó la OT (no la planificada). */
    fechaTermino: string;
    /** Momento exacto del cierre, con hora, para el PDF. */
    completadoEn: string | null;
    /** Título de la OT: "P953 - Conexión medidor faena copas". */
    descripcion: string;
    titulo: string;
  };
  items: { codigo: string; cantidad: number; observacion: string }[];
}

/** Etiqueta de columna → clave, tolerando tildes y mayúsculas. */
function norm(s: string): string {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * El N° de OT del cliente (SF920260929640) viene dentro del texto de la
 * descripción, no en una columna propia: `numero_meconecta` quedó vacío en
 * las 827 órdenes. Con ese número el cobro es CON OT; sin él, SIN OT.
 */
const RE_NUM_OT = /SF9\d{10,}/;

export function numeroOtCliente(...textos: (string | null | undefined)[]): string {
  for (const t of textos) {
    const m = t && t.match(RE_NUM_OT);
    if (m) return m[0];
  }
  return "";
}

export async function construirCobro(hoja: Hoja, ordenId: string): Promise<CobroExport> {
  const sb = createClient();
  const { data: ot, error } = await sb
    .from("ordenes_trabajo")
    .select("numero, numero_meconecta, solicitante, fecha_termino, completado_en, descripcion, titulo, observacion, ubicacion_id, lugar_id, ubicaciones(edificio, detalle), lugares(nombre)")
    .eq("id", ordenId)
    .single();
  if (error) throw error;

  const filas = await fetchFilas(hoja.id);

  // Se localizan las columnas por etiqueta, no por posición: el usuario puede
  // haber renombrado o agregado columnas en la hoja.
  const col = (etiqueta: string) =>
    hoja.columnas.find((c) => norm(c.label) === norm(etiqueta))?.id;
  const colCodigo = col(COLUMNA_CODIGO) ?? hoja.columnas[0]?.id;
  const colCantidad = col("Cantidad") ?? hoja.columnas[1]?.id;
  const colObs = col("Observación");

  const items = filas
    .map((f) => ({
      codigo: String(f.celdas[colCodigo ?? ""] ?? "").trim(),
      // las celdas son texto libre: "2", "2,5" y " 3 " tienen que llegar como número
      cantidad: parseFloat(String(f.celdas[colCantidad ?? ""] ?? "").replace(",", ".")) || 0,
      observacion: colObs ? String(f.celdas[colObs] ?? "").trim() : "",
    }))
    .filter((i) => i.codigo && i.cantidad > 0);

  const o = (ot ?? {}) as Record<string, unknown>;
  const txt = (v: unknown) => (v == null ? "" : String(v));

  // Supabase devuelve la relación como objeto o como arreglo según el join.
  const uno = (rel: unknown): Record<string, unknown> =>
    (Array.isArray(rel) ? rel[0] : rel) as Record<string, unknown> ?? {};
  const ubi = uno(o.ubicaciones);
  const lug = uno(o.lugares);
  // "CENTRO EULA - EDIFICIO 2" es el edificio; el detalle y el lugar lo afinan.
  const ubicacion = [txt(ubi.edificio), txt(ubi.detalle), txt(lug.nombre)]
    .filter(Boolean).join(" · ");

  // La fecha del cobro es cuándo se completó realmente la OT, no la planificada.
  const completado = txt(o.completado_en);

  return {
    formato: "cobro-electrilam",
    version: 1,
    generadoEn: new Date().toISOString(),
    orden: {
      numero: (o.numero as number) ?? null,
      numeroMeconecta:
        numeroOtCliente(o.numero_meconecta as string, o.descripcion as string,
                        o.titulo as string, o.observacion as string) || null,
      solicitante: txt(o.solicitante),
      lugar: ubicacion,
      fechaTermino: completado.slice(0, 10) || txt(o.fecha_termino).slice(0, 10),
      // hora incluida: en el PDF se muestra "11-09-2026 12:55"
      completadoEn: completado || null,
      descripcion: txt(o.titulo),   // el título ES la glosa del trabajo
      titulo: txt(o.titulo),
    },
    items,
  };
}

export function descargarCobro(cobro: CobroExport): void {
  const ident = cobro.orden.numeroMeconecta || (cobro.orden.numero != null ? `OT-${cobro.orden.numero}` : "cobro");
  const nombre = `cobro_${ident.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  const blob = new Blob([JSON.stringify(cobro, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
