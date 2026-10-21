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

export function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
