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
 */

/** Un intervalo de estado. `fin` null = sigue abierto. */
export interface PeriodoEstado {
  activo_id: string;
  estado: string;
  tipo_inactividad: "planeado" | "sin_planear" | null;
  inicio: string;
  fin: string | null;
}

export interface PuntoDisponibilidad {
  /** "2026-03" */
  key: string;
  /** Etiqueta corta: "mar". */
  label: string;
  /** Horas con el activo andando. */
  operativoHoras: number;
  /** Horas detenido por avería. */
  imprevistaHoras: number;
  /** Horas detenido por mantención programada. */
  planificadaHoras: number;
  /** Averías que empezaron en este período. */
  fallas: number;
  /** uptime / (uptime + downtime) × 100. `null` si el mes no tiene historial. */
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

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun",
                  "jul", "ago", "sep", "oct", "nov", "dic"];

const MS_HORA = 3_600_000;

/** Horas de solape entre [desde,hasta] y [ini,fin]. 0 si no se tocan. */
function horasEnVentana(desde: number, hasta: number, ini: number, fin: number): number {
  const solape = Math.min(hasta, fin) - Math.max(desde, ini);
  return solape > 0 ? solape / MS_HORA : 0;
}

/**
 * Serie mensual de disponibilidad, MTBF y MTTR.
 *
 * Cada período se RECORTA al mes que se está sumando: una parada que cruza de
 * un mes a otro aporta sus horas a cada uno, no completa a los dos.
 *
 * Las fallas se cuentan por el mes en que EMPEZÓ la parada. Una avería que
 * arranca el 31 y se resuelve el 2 es una falla de ese mes, aunque casi todas
 * sus horas caigan en el siguiente.
 */
export function construirSerieDisponibilidad(
  periodos: PeriodoEstado[],
  meses: number,
  ahoraMs: number,
): PuntoDisponibilidad[] {
  const ahora = new Date(ahoraMs);
  const salida: PuntoDisponibilidad[] = [];

  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    salida.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MESES_ES[d.getMonth()],
      operativoHoras: 0, imprevistaHoras: 0, planificadaHoras: 0, fallas: 0,
      disponibilidadPct: null, mtbfHoras: null, mttrHoras: null,
    });
  }

  for (const punto of salida) {
    const [y, m] = punto.key.split("-").map(Number);
    const iniMes = new Date(y, m - 1, 1).getTime();
    const finMes = Math.min(new Date(y, m, 1).getTime(), ahoraMs);
    if (finMes <= iniMes) continue;

    for (const p of periodos) {
      const ini = new Date(p.inicio).getTime();
      const fin = p.fin ? new Date(p.fin).getTime() : ahoraMs;
      const horas = horasEnVentana(iniMes, finMes, ini, fin);

      if (horas > 0) {
        // `baja` es un activo retirado, no una parada: no entra en ningún lado.
        if (p.estado === "baja") continue;
        if (p.estado === "operativo") punto.operativoHoras += horas;
        else if (p.tipo_inactividad === "planeado") punto.planificadaHoras += horas;
        else punto.imprevistaHoras += horas;
      }

      // La falla se cuenta donde empieza, aunque sus horas caigan en otro mes.
      if (p.estado !== "operativo" && p.estado !== "baja"
          && p.tipo_inactividad === "sin_planear"
          && ini >= iniMes && ini < finMes) {
        punto.fallas += 1;
      }
    }

    const cubierto = punto.operativoHoras + punto.imprevistaHoras + punto.planificadaHoras;
    // Sin historial en el mes no se inventa un 100%: el activo no fue medido,
    // que no es lo mismo que haber andado perfecto.
    punto.disponibilidadPct = cubierto > 0
      ? Number(((punto.operativoHoras / cubierto) * 100).toFixed(2))
      : null;

    if (punto.fallas > 0) {
      punto.mtbfHoras = Number((punto.operativoHoras / punto.fallas).toFixed(1));
      punto.mttrHoras = Number((punto.imprevistaHoras / punto.fallas).toFixed(2));
    }

    punto.operativoHoras = Number(punto.operativoHoras.toFixed(2));
    punto.imprevistaHoras = Number(punto.imprevistaHoras.toFixed(2));
    punto.planificadaHoras = Number(punto.planificadaHoras.toFixed(2));
  }

  return salida;
}

/** Totales del rango completo, para el número grande de cada tarjeta. */
export function resumirDisponibilidad(serie: PuntoDisponibilidad[]): ResumenDisponibilidad {
  const operativoHoras = serie.reduce((s, p) => s + p.operativoHoras, 0);
  const imprevistaHoras = serie.reduce((s, p) => s + p.imprevistaHoras, 0);
  const planificadaHoras = serie.reduce((s, p) => s + p.planificadaHoras, 0);
  const fallas = serie.reduce((s, p) => s + p.fallas, 0);
  const cubierto = operativoHoras + imprevistaHoras + planificadaHoras;

  return {
    operativoHoras, imprevistaHoras, planificadaHoras, fallas,
    disponibilidadPct: cubierto > 0 ? (operativoHoras / cubierto) * 100 : null,
    mtbfHoras: fallas > 0 ? operativoHoras / fallas : null,
    mttrHoras: fallas > 0 ? imprevistaHoras / fallas : null,
  };
}

/** Métricas de un activo puntual, para la tabla de peores actores. */
export function resumirPorActivo(
  periodos: PeriodoEstado[],
  activoId: string,
  desdeMs: number,
  ahoraMs: number,
): ResumenDisponibilidad {
  let operativoHoras = 0, imprevistaHoras = 0, planificadaHoras = 0, fallas = 0;

  for (const p of periodos) {
    if (p.activo_id !== activoId || p.estado === "baja") continue;
    const ini = new Date(p.inicio).getTime();
    const fin = p.fin ? new Date(p.fin).getTime() : ahoraMs;
    const horas = horasEnVentana(desdeMs, ahoraMs, ini, fin);

    if (horas > 0) {
      if (p.estado === "operativo") operativoHoras += horas;
      else if (p.tipo_inactividad === "planeado") planificadaHoras += horas;
      else imprevistaHoras += horas;
    }
    if (p.estado !== "operativo" && p.tipo_inactividad === "sin_planear"
        && ini >= desdeMs && ini <= ahoraMs) {
      fallas += 1;
    }
  }

  const cubierto = operativoHoras + imprevistaHoras + planificadaHoras;
  return {
    operativoHoras, imprevistaHoras, planificadaHoras, fallas,
    disponibilidadPct: cubierto > 0 ? (operativoHoras / cubierto) * 100 : null,
    mtbfHoras: fallas > 0 ? operativoHoras / fallas : null,
    mttrHoras: fallas > 0 ? imprevistaHoras / fallas : null,
  };
}
