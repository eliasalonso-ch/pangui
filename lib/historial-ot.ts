/**
 * Serie temporal del "Historial de Orden de Trabajo".
 *
 * Módulo puro, sin Supabase ni DOM: recibe OTs ya cargadas y devuelve los
 * puntos que dibuja el gráfico. Toda la decisión (rango, agrupación,
 * acumulado) se testea acá y no contra el componente.
 */

export type Agrupacion = "dia" | "semana" | "mes";

export type RangoModo = "entre" | "ultimo";

export type UnidadUltimo = "dias" | "semanas" | "meses";

export interface RangoHistorial {
  modo: RangoModo;
  /** modo "entre": extremos inclusivos, en hora local. */
  desde?: Date;
  hasta?: Date;
  /** modo "ultimo": los últimos N × unidad hasta hoy. */
  cantidad?: number;
  unidad?: UnidadUltimo;
  /** Suma cada periodo al anterior en vez de contarlos por separado. */
  acumulable?: boolean;
  agrupacion: Agrupacion;
}

export interface OrdenHistorial {
  created_at: string;
  completado_en?: string | null;
  estado?: string | null;
}

export interface PuntoHistorial {
  /** Inicio del periodo, para ordenar y para el tooltip. */
  fecha: Date;
  label: string;
  creadas: number;
  completadas: number;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Medianoche local del día de `d`, sin mutar el original. */
export function inicioDeDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Lunes de la semana de `d` — la semana chilena parte el lunes. */
export function inicioDeSemana(d: Date): Date {
  const base = inicioDeDia(d);
  // getDay(): domingo = 0. Se corre a lunes = 0 para restar parejo.
  const offset = (base.getDay() + 6) % 7;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() - offset);
}

export function inicioDeMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function inicioDePeriodo(d: Date, agrupacion: Agrupacion): Date {
  if (agrupacion === "semana") return inicioDeSemana(d);
  if (agrupacion === "mes") return inicioDeMes(d);
  return inicioDeDia(d);
}

/** Avanza un periodo. Usa setMonth para que los meses no se desfasen. */
export function siguientePeriodo(d: Date, agrupacion: Agrupacion): Date {
  if (agrupacion === "mes") return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  if (agrupacion === "semana") return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

/**
 * Extremos del rango, ya normalizados a periodos completos.
 *
 * En modo "ultimo" el rango termina hoy e incluye el día de hoy, por eso se
 * resta `cantidad - 1`: "últimos 30 días" son 30 días contando hoy, no 31.
 */
export function resolverRango(rango: RangoHistorial, hoy: Date = new Date()): { desde: Date; hasta: Date } {
  if (rango.modo === "entre") {
    const desde = inicioDeDia(rango.desde ?? hoy);
    const hasta = inicioDeDia(rango.hasta ?? hoy);
    // Un rango al revés se endereza en vez de devolver una serie vacía.
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde };
  }

  const cantidad = Math.max(1, rango.cantidad ?? 30);
  const hasta = inicioDeDia(hoy);
  if (rango.unidad === "meses") {
    return { desde: new Date(hasta.getFullYear(), hasta.getMonth() - (cantidad - 1), 1), hasta };
  }
  if (rango.unidad === "semanas") {
    return { desde: inicioDeSemana(new Date(hasta.getTime() - (cantidad - 1) * 7 * DIA_MS)), hasta };
  }
  return { desde: new Date(hasta.getTime() - (cantidad - 1) * DIA_MS), hasta };
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function etiquetaPeriodo(d: Date, agrupacion: Agrupacion): string {
  if (agrupacion === "mes") return `${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Etiqueta del rango para el encabezado ("jul 25 - ago 15"). */
export function etiquetaRango(desde: Date, hasta: Date): string {
  const fmt = (d: Date) => `${MESES_CORTOS[d.getMonth()]} ${d.getDate()}`;
  return `${fmt(desde)} - ${fmt(hasta)}`;
}

/**
 * Construye la serie completa, incluidos los periodos sin OTs.
 *
 * Los huecos importan: si solo se devolvieran los periodos con datos, el
 * gráfico uniría dos puntos lejanos con una recta y aparentaría actividad
 * continua donde no la hubo.
 */
export function construirSerie(
  ordenes: OrdenHistorial[],
  rango: RangoHistorial,
  hoy: Date = new Date(),
): PuntoHistorial[] {
  const { desde, hasta } = resolverRango(rango, hoy);
  const { agrupacion } = rango;

  const puntos: PuntoHistorial[] = [];
  const indice = new Map<number, PuntoHistorial>();

  let cursor = inicioDePeriodo(desde, agrupacion);
  const fin = inicioDePeriodo(hasta, agrupacion);
  // Cota de seguridad: un rango absurdo (años en días) no debe colgar el render.
  const MAX_PUNTOS = 750;
  while (cursor <= fin && puntos.length < MAX_PUNTOS) {
    const punto: PuntoHistorial = {
      fecha: cursor,
      label: etiquetaPeriodo(cursor, agrupacion),
      creadas: 0,
      completadas: 0,
    };
    puntos.push(punto);
    indice.set(cursor.getTime(), punto);
    cursor = siguientePeriodo(cursor, agrupacion);
  }

  if (puntos.length === 0) return puntos;

  const primero = puntos[0].fecha.getTime();
  const ultimo = puntos[puntos.length - 1].fecha.getTime();

  function sumar(iso: string | null | undefined, campo: "creadas" | "completadas") {
    if (!iso) return;
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return;
    const clave = inicioDePeriodo(fecha, agrupacion).getTime();
    if (clave < primero || clave > ultimo) return;
    const punto = indice.get(clave);
    if (punto) punto[campo] += 1;
  }

  for (const o of ordenes) {
    sumar(o.created_at, "creadas");
    sumar(o.completado_en, "completadas");
  }

  if (rango.acumulable) {
    let creadas = 0;
    let completadas = 0;
    for (const p of puntos) {
      creadas += p.creadas;
      completadas += p.completadas;
      p.creadas = creadas;
      p.completadas = completadas;
    }
  }

  return puntos;
}

/** ¿Cae la OT dentro del rango elegido? Filtra la lista bajo el gráfico. */
export function dentroDelRango(
  orden: OrdenHistorial,
  rango: RangoHistorial,
  hoy: Date = new Date(),
): boolean {
  const { desde, hasta } = resolverRango(rango, hoy);
  const creada = new Date(orden.created_at);
  if (Number.isNaN(creada.getTime())) return false;
  const dia = inicioDeDia(creada);
  // `hasta` es medianoche del último día: se compara contra su final.
  return dia >= inicioDeDia(desde) && dia <= inicioDeDia(hasta);
}
