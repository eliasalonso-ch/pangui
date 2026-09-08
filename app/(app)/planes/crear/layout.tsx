"use client";

import { PlanDraftProvider } from "./PlanDraftContext";

/**
 * Envuelve /planes/crear y /planes/crear/plantilla en el mismo provider.
 *
 * Next mantiene montado el layout al navegar entre rutas que cuelgan de él, y
 * eso es justamente lo que conserva el plan a medio llenar cuando el usuario se
 * va a definir la plantilla y vuelve.
 */
export default function CrearPlanLayout({ children }: { children: React.ReactNode }) {
  return <PlanDraftProvider>{children}</PlanDraftProvider>;
}
