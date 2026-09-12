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
    numeroMeconecta: string | null;
    solicitante: string;
    lugar: string;
    fechaTermino: string;
    descripcion: string;
    titulo: string;
  };
  items: { codigo: string; cantidad: number; observacion: string }[];
}

/** Etiqueta de columna → clave, tolerando tildes y mayúsculas. */
function norm(s: string): string {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function construirCobro(hoja: Hoja, ordenId: string): Promise<CobroExport> {
  const sb = createClient();
  const { data: ot, error } = await sb
    .from("ordenes_trabajo")
    .select("numero, numero_meconecta, solicitante, ubicacion_texto, lugar, fecha_termino, completado_en, descripcion, titulo")
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
  return {
    formato: "cobro-electrilam",
    version: 1,
    generadoEn: new Date().toISOString(),
    orden: {
      numero: (o.numero as number) ?? null,
      numeroMeconecta: (o.numero_meconecta as string) ?? null,
      solicitante: txt(o.solicitante),
      lugar: txt(o.ubicacion_texto) || txt(o.lugar),
      // fecha_termino es la planificada; completado_en es cuándo se cerró de verdad
      fechaTermino: txt(o.completado_en).slice(0, 10) || txt(o.fecha_termino).slice(0, 10),
      descripcion: txt(o.descripcion),
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
