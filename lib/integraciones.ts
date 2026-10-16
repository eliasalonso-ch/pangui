import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";
import { esAdmin } from "@/lib/roles";

/** Workspace de la Universidad de Concepción. */
export const UDEC_WORKSPACE_ID = "d266776d-b1c0-4b94-bc18-b775b12846fd";

/**
 * Integraciones es, por ahora, solo para owners/admins de Electrilam y la UdeC.
 *
 * ponytail: en la UdeC es SOLO VISTA (demo). La base (set_meconecta_credentials,
 * get_meconecta_credentials) y las edge functions meconecta-* siguen fijas al
 * workspace de Electrilam, así que conectar desde la UdeC responde "No
 * autorizado". Para que funcione hay que pasar esas funciones a my_workspace_id()
 * y que el scraper recorra todas las filas de integration_connections.
 */
const WORKSPACES_INTEGRACIONES = [ELECTRILAM_WORKSPACE_ID, UDEC_WORKSPACE_ID];

export function puedeVerIntegraciones(
  workspaceId: string | null | undefined,
  rol: string | null | undefined,
): boolean {
  return !!workspaceId && WORKSPACES_INTEGRACIONES.includes(workspaceId) && esAdmin(rol);
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
