import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";
import { esAdmin } from "@/lib/roles";

/** Workspace de la Universidad de Concepción. */
export const UDEC_WORKSPACE_ID = "d266776d-b1c0-4b94-bc18-b775b12846fd";

/**
 * MeConecta es solo para Electrilam y la UdeC.
 *
 * ponytail: en la UdeC es SOLO VISTA (demo). La base (set_meconecta_credentials,
 * get_meconecta_credentials) y las edge functions meconecta-* siguen fijas al
 * workspace de Electrilam, así que conectar desde la UdeC responde "No
 * autorizado". Para que funcione hay que pasar esas funciones a my_workspace_id()
 * y que el scraper recorra todas las filas de integration_connections.
 */
const WORKSPACES_MECONECTA = [ELECTRILAM_WORKSPACE_ID, UDEC_WORKSPACE_ID];

export interface Integracion {
  slug: string;
  nombre: string;
  proveedor: string;
  descripcion: string;
  href: string;
  /** Solo para estos workspaces. Sin la lista, cualquier workspace. */
  workspaces?: string[];
}

export const INTEGRACIONES: Integracion[] = [
  {
    slug: "google-calendar",
    nombre: "Google Calendar",
    proveedor: "Google",
    descripcion:
      "Tus pendientes de las OTs aparecen en tu Google Calendar, con su aviso, y se actualizan solos cuando cambian en Pangui.",
    href: "/integraciones/google-calendar",
  },
  {
    slug: "meconecta",
    nombre: "MeConecta",
    proveedor: "Universidad de Concepción",
    descripcion:
      "Recibe aviso de cada solicitud nueva asignada en el portal de mantención de la UdeC y cruza sus folios con tus OTs.",
    href: "/integraciones/meconecta",
    workspaces: WORKSPACES_MECONECTA,
  },
];

/** Las integraciones que ve este workspace. */
export function integracionesDe(workspaceId: string | null | undefined): Integracion[] {
  return INTEGRACIONES.filter(i => !i.workspaces || (!!workspaceId && i.workspaces.includes(workspaceId)));
}

/**
 * Integraciones (menú y páginas) es para owners/admins. Con `slug`, además,
 * que esa integración esté disponible para el workspace.
 */
export function puedeVerIntegraciones(
  workspaceId: string | null | undefined,
  rol: string | null | undefined,
  slug?: string,
): boolean {
  if (!workspaceId || !esAdmin(rol)) return false;
  return !slug || integracionesDe(workspaceId).some(i => i.slug === slug);
}
