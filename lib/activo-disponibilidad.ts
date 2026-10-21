/**
 * Disponibilidad, MTBF y MTTR calculados desde el HISTORIAL DE ESTADOS.
 *
 * Por qué existe este módulo teniendo `activo-metrics.ts`: ese deriva los
 * números de las órdenes de trabajo, y una OT solo sabe cuánto duró la
 * reparación. La parada real incluye el rato en que la máquina estuvo detenida
 * esperando repuesto, esperando técnico o esperando decisión —y para producción
 * esa es la parada que importa—. `activo_estado_periodos` mide justamente eso:
 * el intervalo entre que el activo se detuvo y que volvió a andar.
 *
 * Es también la fuente que usan las herramientas del rubro. La documentación de
 * MaintainX lo dice de frente sobre su reporte de MTBF/MTTR: "This report uses
 * asset status changes for all its calculations. Asset status changes are a
 * more direct indicator of when an asset goes offline and when it comes back
 * online."
 *
 * Fórmulas (SMRP / ISO 14224, activos reparables):
 *   MTBF           = horas operativas / fallas
 *   MTTR           = horas de restauración / fallas ya restauradas
 *   Disponibilidad = uptime / (uptime + downtime)
 *
 * Una FALLA es un evento (lo arma la base, migración 20261021140000): una
 * detención con algo sin planear, desde que empieza hasta que el activo vuelve
 * a operar, aunque pase por varios estados. Su duración completa es el tiempo
 * de restauración ("mean time to restore", IEC 60050); una falla abierta cuenta
 * para el MTBF pero todavía no para el MTTR.
 *
 * Decisiones que no son obvias:
 *
 *  1. La TENDENCIA es una media móvil de 90 días por tramo, no el valor del
 *     tramo solo ni el acumulado. El MTBF de una semana con 0–1 fallas no está
 *     definido o es ruido (y nunca puede pasar de 168 h); el acumulado dibuja
 *     una rampa aunque el activo empeore. La ventana móvil es la práctica
 *     recomendada, mostrando cuántas fallas la sostienen.
 *
 *  2. La parada PLANIFICADA cuenta contra la disponibilidad. Es la
 *     disponibilidad operacional: a producción no le sirve que la máquina esté
 *     detenida "a propósito". La proporción entre planificada e imprevista se
 *     mira aparte, en su propio gráfico.
 *
 * Las sumas —con cada período recortado a la ventana y a cada tramo— las hace
 * la base (función `analitica_activos`, migración 20261012120000): bajar la
 * historia al navegador no escala. Acá solo se derivan las proporciones.
 */

export interface PuntoDisponibilidad {
  /** Inicio del tramo, "2026-03-01". */
  key: string;
  /** Etiqueta corta: "mar", "12 oct". */
  label: string;
  /** Horas con el activo andando. */
  operativoHoras: number;
  /** Horas detenido por avería. */
  imprevistaHoras: number;
  /** Horas detenido por mantención programada. */
  planificadaHoras: number;
  /** Averías que empezaron en este período. */
  fallas: number;
  /** uptime / (uptime + downtime) × 100. `null` si el tramo no tiene historial. */
  disponibilidadPct: number | null;
  /** Horas entre fallas. `null` si no hubo fallas en el período. */
  mtbfHoras: number | null;
  /** Horas por falla. `null` si no hubo fallas en el período. */
  mttrHoras: number | null;
  /** MTBF de los 90 días que terminan en este tramo. `null` sin fallas en esos 90 días. */
  mtbfMovilHoras: number | null;
  /** MTTR de los 90 días que terminan en este tramo. `null` sin fallas restauradas en esos 90 días. */
  mttrMovilHoras: number | null;
  /** Fallas en esos 90 días: cuántos datos sostienen la media móvil. */
  fallasMovil: number;
  /** Fallas del tramo ya restauradas y sus horas de restauración (para el total). `null` si la respuesta no las trae. */
  reparadas: number | null;
  restauracionHoras: number | null;
}

export interface ResumenDisponibilidad {
  operativoHoras: number;
  imprevistaHoras: number;
  planificadaHoras: number;
  fallas: number;
  disponibilidadPct: number | null;
  mtbfHoras: number | null;
  mttrHoras: number | null;
}

/**
 * Sumas de un tramo del gráfico (o de un activo), tal como las devuelve la
 * función SQL `analitica_activos`. Ya vienen recortadas a la ventana: la base
 * hace el trabajo pesado y acá solo se derivan las proporciones.
 */
export interface SumasDisponibilidad {
  operativo_h: number;
  imprevista_h: number;
  planificada_h: number;
  /** Fallas (eventos) que empezaron en el tramo. */
  fallas: number;
  /**
   * De esas, las ya restauradas y la suma de sus duraciones completas. Sin
   * estos campos (respuestas viejas, pruebas) el MTTR cae a horas imprevistas
   * del tramo / fallas.
   */
  reparadas?: number;
  restauracion_h?: number;
  /** Media móvil de 90 días que termina en el borde derecho del tramo. */
  op_movil_h?: number;
  fallas_movil?: number;
  reparadas_movil?: number;
  restauracion_movil_h?: number;
}

/**
 * Disponibilidad, MTBF y MTTR desde las sumas.
 *
 * Sin historial no se inventa un 100%: el activo no fue medido, que no es lo
 * mismo que haber andado perfecto. Sin fallas, MTBF y MTTR quedan en null.
 */
export function derivarDisponibilidad(s: SumasDisponibilidad): ResumenDisponibilidad {
  const operativoHoras = Number(s.operativo_h);
  const imprevistaHoras = Number(s.imprevista_h);
  const planificadaHoras = Number(s.planificada_h);
  const fallas = Number(s.fallas);
  const cubierto = operativoHoras + imprevistaHoras + planificadaHoras;
  return {
    operativoHoras, imprevistaHoras, planificadaHoras, fallas,
    disponibilidadPct: cubierto > 0 ? (operativoHoras / cubierto) * 100 : null,
    mtbfHoras: fallas > 0 ? operativoHoras / fallas : null,
    mttrHoras: s.restauracion_h != null
      ? (Number(s.reparadas) > 0 ? Number(s.restauracion_h) / Number(s.reparadas) : null)
      : (fallas > 0 ? imprevistaHoras / fallas : null),
  };
}

/** Un punto del gráfico, con el redondeo que usan los ejes y tooltips. */
export function puntoDisponibilidad(
  clave: string,
  label: string,
  s: SumasDisponibilidad,
): PuntoDisponibilidad {
  const r = derivarDisponibilidad(s);
  const fallasMovil = Number(s.fallas_movil ?? 0);
  const reparadasMovil = Number(s.reparadas_movil ?? 0);
  return {
    key: clave,
    label,
    operativoHoras: Number(r.operativoHoras.toFixed(2)),
    imprevistaHoras: Number(r.imprevistaHoras.toFixed(2)),
    planificadaHoras: Number(r.planificadaHoras.toFixed(2)),
    fallas: r.fallas,
    disponibilidadPct: r.disponibilidadPct == null ? null : Number(r.disponibilidadPct.toFixed(2)),
    mtbfHoras: r.mtbfHoras == null ? null : Number(r.mtbfHoras.toFixed(1)),
    mttrHoras: r.mttrHoras == null ? null : Number(r.mttrHoras.toFixed(2)),
    mtbfMovilHoras: fallasMovil > 0 ? Number((Number(s.op_movil_h) / fallasMovil).toFixed(1)) : null,
    mttrMovilHoras: reparadasMovil > 0 ? Number((Number(s.restauracion_movil_h) / reparadasMovil).toFixed(2)) : null,
    fallasMovil,
    reparadas: s.reparadas == null ? null : Number(s.reparadas),
    restauracionHoras: s.restauracion_h == null ? null : Number(Number(s.restauracion_h).toFixed(2)),
  };
}

/** Totales del rango completo, para el número grande de cada tarjeta. */
export function resumirDisponibilidad(serie: PuntoDisponibilidad[]): ResumenDisponibilidad {
  // Solo si todos los tramos traen la restauración; si no, MTTR por horas imprevistas.
  const conRestauracion = serie.length > 0 && serie.every(p => p.restauracionHoras != null);
  return derivarDisponibilidad({
    operativo_h: serie.reduce((s, p) => s + p.operativoHoras, 0),
    imprevista_h: serie.reduce((s, p) => s + p.imprevistaHoras, 0),
    planificada_h: serie.reduce((s, p) => s + p.planificadaHoras, 0),
    fallas: serie.reduce((s, p) => s + p.fallas, 0),
    reparadas: conRestauracion ? serie.reduce((s, p) => s + (p.reparadas ?? 0), 0) : undefined,
    restauracion_h: conRestauracion ? serie.reduce((s, p) => s + (p.restauracionHoras ?? 0), 0) : undefined,
  });
}
