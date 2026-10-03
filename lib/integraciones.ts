import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";
import { esAdmin } from "@/lib/roles";

/**
 * Integraciones es, por ahora, exclusivo de owners/admins de Electrilam: la
 * única integración (MeConecta, portal de la UdeC) solo existe para ellos.
 */
export function puedeVerIntegraciones(
  workspaceId: string | null | undefined,
  rol: string | null | undefined,
): boolean {
  return workspaceId === ELECTRILAM_WORKSPACE_ID && esAdmin(rol);
}

export interface Integracion {
  slug: string;
  nombre: string;
  proveedor: string;
  descripcion: string;
  href: string;
}

export const INTEGRACIONES: Integracion[] = [
  {
    slug: "meconecta",
    nombre: "MeConecta",
    proveedor: "Universidad de Concepción",
    descripcion:
      "Recibe aviso de cada solicitud nueva asignada en el portal de mantención de la UdeC y cruza sus folios con tus OTs.",
    href: "/integraciones/meconecta",
  },
];
