// Qué objetos puede borrar un usuario con su propia sesión.
//
// Antes bastaba con estar logueado: cualquiera podía borrar cualquier archivo
// del bucket si conocía la URL, también los de otra empresa. Ahora la carpeta
// tiene que pertenecer a algo que ese usuario puede ver. La consulta se hace
// con SU sesión, así que quien decide es RLS (incluye OTs recibidas por envío).
//
// Sigue la misma regla de carpetas que r2-presign: lo que puedes subir, lo
// puedes borrar.

// deno-lint-ignore no-explicit-any
type Cliente = { from(tabla: string): any };

// Raíces sin id en la ruta: el archivo se sube antes de que exista la fila, así
// que no hay contra qué validar. Mismas que acepta r2-presign.
const RAICES_LIBRES = new Set([
  "scans", "partes", "adjuntos", "solicitudes", "sociedades",
  "ubicaciones", "lugares", "cuadrillas", "proveedores", "medidores",
]);

const TABLA_POR_RAIZ: Record<string, string> = {
  ordenes: "ordenes_trabajo",
  activos: "activos",
  levantamientos: "levantamientos",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DRAFT_ID_RE = /^draft-\d{10,}-[a-z0-9]{4,12}$/;

export async function puedeBorrarClave(supabase: Cliente, clave: string): Promise<boolean> {
  const [raiz, id, ...resto] = clave.split("/");
  const tabla = TABLA_POR_RAIZ[raiz];
  if (!tabla) return RAICES_LIBRES.has(raiz);

  // `ordenes/<archivo>` suelto, sin id de por medio: no se puede atribuir.
  if (resto.length === 0) return false;
  if (raiz === "activos" && DRAFT_ID_RE.test(id)) return true;
  if (!UUID_RE.test(id)) return false;

  const { data } = await supabase.from(tabla).select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}
