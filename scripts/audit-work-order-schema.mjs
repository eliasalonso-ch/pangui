import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase audit credentials");

const required = {
  usuarios: ["id", "workspace_id", "activo", "rol"],
  workspaces: ["id", "fotos_obligatorias_todas", "modo_registro"],
  ordenes_trabajo: [
    "id", "workspace_id", "titulo", "descripcion", "estado", "prioridad",
    "tipo", "tipo_trabajo", "clasificacion", "fecha_inicio", "fecha_termino",
    "created_at", "updated_at", "creado_por", "asignados_ids", "n_serie",
    "solicitante", "solicitante_telefono", "solicitante_email", "hito",
    "presupuesto", "numero", "categoria_id", "categoria_ids", "ubicacion_id",
    "activo_id", "lugar_id", "sociedad_id", "iniciado_at", "pausado_at",
    "en_ejecucion", "tiempo_total_segundos", "recurrencia",
    "recurrencia_config", "proxima_ejecucion", "recurrencia_origen_id",
    "recurrencia_iteracion", "parent_id", "requiere_materiales",
    "requiere_hoja", "requiere_fotos", "imagen_url", "fotos_urls", "links",
    "deleted_at", "completado_por",
  ],
  actividad_ot: ["id", "orden_id", "tipo", "comentario", "usuario_id", "created_at", "foto_url"],
  ubicaciones: ["id", "workspace_id"],
  lugares: ["id", "workspace_id", "ubicacion_id"],
  sociedades: ["id", "workspace_id"],
  activos: ["id", "workspace_id", "ubicacion_id", "lugar_id", "sociedad_id"],
  categorias_ot: ["id", "workspace_id"],
  foto_grupos: ["id", "orden_id", "workspace_id", "titulo", "locked", "created_by"],
  foto_grupo_items: ["id", "grupo_id", "url", "orden_display", "created_at"],
  ot_procedimientos: ["id", "orden_id", "procedimiento_id"],
  procedimientos: ["id", "bloquea_inicio", "bloquea_cierre_ot", "hereda_a_hijos"],
  procedimiento_ejecuciones: ["id", "orden_id", "procedimiento_id", "estado"],
  orden_partes: ["id", "orden_id"],
  hojas_inventario: ["id", "orden_id"],
  hojas_inventario_filas: ["id", "hoja_id"],
};

const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/openapi+json",
  },
});
if (!response.ok) throw new Error(`OpenAPI schema request failed: ${response.status}`);
const openapi = await response.json();
const definitions = openapi.definitions ?? openapi.components?.schemas ?? {};
console.log(
  `RELATED TABLES ${Object.keys(definitions).filter((name) => /hoja|fila|procedimiento_ejecucion/.test(name)).sort().join(", ")}`,
);
let failed = false;

for (const [table, columns] of Object.entries(required)) {
  const definition = definitions[table];
  if (!definition) {
    failed = true;
    console.log(`MISSING TABLE ${table}`);
    continue;
  }
  const actual = definition.properties ?? {};
  const missing = columns.filter((column) => !(column in actual));
  if (missing.length) {
    failed = true;
    console.log(`MISSING COLUMNS ${table}: ${missing.join(", ")}`);
    console.log(`  AVAILABLE ${table}: ${Object.keys(actual).sort().join(", ")}`);
  } else {
    console.log(`OK ${table} (${columns.length} required columns)`);
  }
}

process.exitCode = failed ? 1 : 0;
