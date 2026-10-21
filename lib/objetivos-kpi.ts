/**
 * Objetivos de KPI de confiabilidad (plan Empresa). Tabla `objetivos_kpi`,
 * migración 20261021180000.
 *
 * Parecido a los "Asset Health Goals" de MaintainX (un valor "bueno" y uno
 * "malo"), con un tercer umbral opcional entre ambos, "alerta", para avisar
 * antes de llegar a malo:
 *
 *   bueno ── aceptable ── alerta ── en riesgo ── malo
 *
 * Una meta por KPI para todo el workspace, como MaintainX. Se configura desde
 * el engranaje de cada gráfico; sin meta configurada se usa una de referencia.
 */

import { createClient } from "@/lib/supabase";

export type KpiObjetivo = "disponibilidad" | "mtbf" | "mttr" | "planificada";
export type NivelObjetivo = "bueno" | "aceptable" | "riesgo" | "malo";

export interface ObjetivoKpi {
  id?: string;
  kpi: KpiObjetivo;
  bueno: number;
  /** Umbral de aviso entre bueno y malo. null = sin nivel "en riesgo". */
  alerta: number | null;
  malo: number;
  /** "referencia" = no la configuró el cliente: es la de la industria (METAS_REFERENCIA). */
  fuente?: "guardada" | "referencia";
}

export const KPI_META: Record<KpiObjetivo, { label: string; unidad: "%" | "h"; menosEsMejor: boolean; ayuda: string }> = {
  disponibilidad: { label: "Disponibilidad", unidad: "%", menosEsMejor: false, ayuda: "Tiempo operativo sobre el tiempo registrado." },
  mtbf: { label: "MTBF", unidad: "h", menosEsMejor: false, ayuda: "Horas operativas entre fallas imprevistas." },
  mttr: { label: "MTTR", unidad: "h", menosEsMejor: true, ayuda: "Horas desde que falla hasta que vuelve a operar." },
  planificada: { label: "Parada planificada", unidad: "%", menosEsMejor: false, ayuda: "Parte de la parada total que fue planificada." },
};

export const KPIS: KpiObjetivo[] = ["disponibilidad", "mtbf", "mttr", "planificada"];

export const NIVEL_LABEL: Record<NivelObjetivo, string> = { bueno: "Bueno", aceptable: "Aceptable", riesgo: "En riesgo", malo: "Malo" };

/**
 * Bueno / aceptable / en riesgo / malo según la meta. Los bordes cuentan como
 * el nivel mejor: llegar justo a la meta es cumplirla, y tocar la alerta
 * todavía es aceptable.
 */
export function evaluar(kpi: KpiObjetivo, valor: number | null, obj: ObjetivoKpi | null): NivelObjetivo | null {
  if (valor == null || obj == null) return null;
  // "Mejor o igual que" según la dirección del KPI.
  const alMenos = (umbral: number) => (KPI_META[kpi].menosEsMejor ? valor <= umbral : valor >= umbral);
  if (alMenos(obj.bueno)) return "bueno";
  if (!alMenos(obj.malo) || valor === obj.malo) return "malo";
  if (obj.alerta != null && !alMenos(obj.alerta)) return "riesgo";
  return "aceptable";
}

/**
 * Metas de referencia de la industria, para cuando el cliente todavía no fijó
 * las suyas. Rangos publicados (SMRP y guías de confiabilidad, 2025-2026):
 *  - Disponibilidad: ~95% como meta general (97-98% en activos críticos).
 *  - MTBF: 700+ h en planta madura, 2.000+ h en activos críticos. Depende
 *    mucho del tipo de equipo.
 *  - MTTR: 2-4 h en equipo de línea, 4-8 h en servicios.
 *  - Parada planificada: 80-90% clase mundial; ~65% el mínimo aceptable.
 * Son punto de partida, no verdad: las fuentes difieren y lo recomendado es
 * ajustarlas a la historia propia. Por eso en pantalla siempre dicen que son de
 * referencia y lo que guarda el cliente las reemplaza.
 */
type Umbrales = { bueno: number; alerta: number; malo: number };
export const METAS_REFERENCIA: Record<KpiObjetivo, Umbrales> = {
  disponibilidad: { bueno: 95, alerta: 92, malo: 90 },
  mtbf: { bueno: 2000, alerta: 1000, malo: 700 },
  mttr: { bueno: 4, alerta: 6, malo: 8 },
  planificada: { bueno: 85, alerta: 75, malo: 65 },
};

export function referenciaPara(kpi: KpiObjetivo): ObjetivoKpi {
  return { kpi, ...METAS_REFERENCIA[kpi], fuente: "referencia" };
}

/** La meta que se usa en pantalla: la configurada por el cliente o, si no hay, la de referencia. */
export function metaVigente(kpi: KpiObjetivo, lista: ObjetivoKpi[]): ObjetivoKpi {
  return lista.find(o => o.kpi === kpi) ?? referenciaPara(kpi);
}

/**
 * Mismas reglas que los CHECK de la tabla, para avisar antes de guardar.
 * `alerta` es opcional (null), pero si está tiene que quedar entre los dos.
 */
export function validarObjetivo(kpi: KpiObjetivo, bueno: number, malo: number, alerta: number | null = null): string | null {
  const m = KPI_META[kpi];
  if (!Number.isFinite(bueno) || !Number.isFinite(malo)) return "Completa “bueno” y “malo”.";
  if (alerta != null && !Number.isFinite(alerta)) return "La alerta tiene que ser un número.";
  const valores = alerta == null ? [bueno, malo] : [bueno, alerta, malo];
  if (valores.some(v => v < 0)) return "Los valores no pueden ser negativos.";
  if (m.unidad === "%" && valores.some(v => v > 100)) return "Un porcentaje va de 0 a 100.";
  if (m.menosEsMejor ? bueno >= malo : bueno <= malo) {
    return m.menosEsMejor ? "En MTTR, “bueno” tiene que ser menor que “malo”." : "“Bueno” tiene que ser mayor que “malo”.";
  }
  if (alerta != null && !(m.menosEsMejor ? bueno < alerta && alerta < malo : bueno > alerta && alerta > malo)) {
    return "La alerta tiene que quedar entre “bueno” y “malo”.";
  }
  return null;
}

export async function fetchObjetivosKpi(): Promise<ObjetivoKpi[]> {
  const { data, error } = await createClient()
    .from("objetivos_kpi")
    .select("id, kpi, bueno, alerta, malo");
  if (error) throw error;
  return (data ?? []).map(o => ({
    ...o, bueno: Number(o.bueno), malo: Number(o.malo), alerta: o.alerta == null ? null : Number(o.alerta),
    fuente: "guardada" as const,
  })) as ObjetivoKpi[];
}

/** Crea o reemplaza la meta de ese KPI (única por workspace y KPI). */
export async function guardarObjetivoKpi(workspaceId: string, o: ObjetivoKpi): Promise<void> {
  const { error } = await createClient()
    .from("objetivos_kpi")
    .upsert(
      { workspace_id: workspaceId, kpi: o.kpi, bueno: o.bueno, alerta: o.alerta, malo: o.malo },
      { onConflict: "workspace_id,kpi" },
    );
  if (error) throw error;
}

export async function borrarObjetivoKpi(id: string): Promise<void> {
  const { error } = await createClient().from("objetivos_kpi").delete().eq("id", id);
  if (error) throw error;
}
