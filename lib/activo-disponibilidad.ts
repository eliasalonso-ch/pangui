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
 * Fórmulas (las mismas de esa documentación):
 *   MTBF           = (tiempo operativo − parada imprevista) / fallas
 *   MTTR           = parada imprevista / fallas
 *   Disponibilidad = uptime / (uptime + downtime)
 *
 * Dos decisiones que no son obvias:
 *
 *  1. Se calcula POR PERÍODO, no acumulado. El MTBF acumulado dibuja una rampa
 *     ascendente aunque el activo esté empeorando —el numerador crece con el
 *     calendario— y eso esconde justo lo que hay que ver.
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
  fallas: number;
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
    mttrHoras: fallas > 0 ? imprevistaHoras / fallas : null,
  };
}

/** Un punto del gráfico, con el redondeo que usan los ejes y tooltips. */
export function puntoDisponibilidad(
  clave: string,
  label: string,
  s: SumasDisponibilidad,
): PuntoDisponibilidad {
  const r = derivarDisponibilidad(s);
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
  };
}

/** Totales del rango completo, para el número grande de cada tarjeta. */
export function resumirDisponibilidad(serie: PuntoDisponibilidad[]): ResumenDisponibilidad {
  return derivarDisponibilidad({
    operativo_h: serie.reduce((s, p) => s + p.operativoHoras, 0),
    imprevista_h: serie.reduce((s, p) => s + p.imprevistaHoras, 0),
    planificada_h: serie.reduce((s, p) => s + p.planificadaHoras, 0),
    fallas: serie.reduce((s, p) => s + p.fallas, 0),
  });
}
