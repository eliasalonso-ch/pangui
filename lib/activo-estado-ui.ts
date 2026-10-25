/**
 * Etiquetas y colores del estado de un activo, compartidos por la página de
 * estado, su tabla de historial y la analítica. Módulo sin dependencias: quien
 * solo necesita un color no arrastra la tabla (TanStack Table) a su bundle.
 */
import type { AssetStatus } from "@/types/ordenes";

export const ESTADO_LABEL: Record<AssetStatus, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

export const ESTADO_COLOR: Record<AssetStatus, string> = {
  operativo: "#10B981",
  fuera_servicio: "#EF4444",
  mantencion: "#F59E0B",
  baja: "#6B7280",
};

/**
 * El estado define el tipo de parada (CHECKs en la base, 2026-10-22): fuera de
 * servicio es siempre una avería y mantención siempre planificada. Ya no se
 * pregunta; operativo no lleva tipo.
 */
export function tipoDeEstado(estado: AssetStatus): "planeado" | "sin_planear" | null {
  if (estado === "mantencion") return "planeado";
  if (estado === "fuera_servicio") return "sin_planear";
  return null;
}

/**
 * Color de un período según CÓMO CUENTA, no según el estado: operativo verde,
 * parada planificada naranjo, imprevista rojo. Así la línea de tiempo dice lo
 * mismo que los totales: una mantención sin planear es una avería (rojo)
 * aunque vaya en el carril de mantención.
 */
export function colorPeriodo(p: { estado: AssetStatus; tipo_inactividad: string | null }): string {
  if (p.estado === "operativo" || p.estado === "baja") return ESTADO_COLOR[p.estado];
  return p.tipo_inactividad === "planeado" ? ESTADO_COLOR.mantencion : ESTADO_COLOR.fuera_servicio;
}

/**
 * Disponibilidad con un decimal, redondeando hacia ABAJO: 99,995% con 15 min
 * de avería se mostraba "100.0%", que se lee como "nunca falló".
 */
export function fmtDisponibilidad(pct: number): string {
  return `${(Math.floor(pct * 10) / 10).toFixed(1)}%`;
}

export function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * "22-10-2026, 06:22 p. m. → 06:33 p. m. (en curso)": de cuándo a cuándo va un
 * período. El abierto termina en `ahora` (el de la última actualización):
 * antes decía solo "→ en curso" y no se leía cuánto llevaba. Si empieza y
 * termina el mismo día, el fin va solo con la hora.
 */
export function rangoPeriodo(inicio: string, fin: string | null, ahora: number): string {
  const ini = new Date(inicio);
  const hasta = fin ? new Date(fin) : new Date(ahora);
  const finTxt = ini.toDateString() === hasta.toDateString()
    ? hasta.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : fmtFecha(hasta.toISOString());
  return `${fmtFecha(inicio)} → ${finTxt}${fin ? "" : " (en curso)"}`;
}
