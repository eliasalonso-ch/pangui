/**
 * Los ITOs son, por ahora, exclusivos del espacio de trabajo de Electrilam.
 *
 * El mismo id está fijado en la app móvil para esconder ITOs del menú "Más".
 * Se replica acá en vez de inventar una feature flag para que ambas apps
 * decidan con el mismo criterio; si más adelante hay que habilitar otros
 * espacios, se cambia por una columna en `workspaces` en las dos apps a la vez.
 */
export const ELECTRILAM_WORKSPACE_ID = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

export function tieneItos(workspaceId: string | null | undefined): boolean {
  return workspaceId === ELECTRILAM_WORKSPACE_ID;
}
