// ¿La llamada viene con la service role? Para funciones que llama pg_cron con
// el JWT 'service_role_key' de Vault.
//
// Solo mira el rol del JWT, SIN verificar la firma: eso lo hace el gateway de
// Supabase, así que la función que lo use debe quedar con verify_jwt activado
// (el valor por defecto; no ponerla en config.toml con verify_jwt = false).
//
// No se compara contra SUPABASE_SERVICE_ROLE_KEY: en este proyecto esa variable
// ya no tiene el mismo valor que el JWT de Vault y la comparación daba 401.
// Mismo patrón que meconecta-scrape-cron.
export function esServiceRole(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "service_role";
  } catch {
    return false;
  }
}
