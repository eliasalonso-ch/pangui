import { createClient } from "@/lib/supabase";
import type { Proveedor, ProveedorForm, ProveedorListItem } from "@/types/proveedores";

const PROVEEDOR_SELECT = `
  id, workspace_id, nombre, rut, giro, direccion, comuna, ciudad,
  contacto, email, telefono, sitio_web, condiciones_pago, notas,
  logo_url, activo, creado_por, actualizado_por, created_at, updated_at,
  creador:usuarios!creado_por(id, nombre),
  actualizador:usuarios!actualizado_por(id, nombre)
`;

/**
 * Proveedores del workspace.
 *
 * Sin paginar: son decenas, no miles, y el selector de la orden de compra los
 * necesita todos para buscar. Si algun dia crecen, esto se pagina como planes.
 */
export async function listProveedores(incluirInactivos = false): Promise<ProveedorListItem[]> {
  const sb = createClient();

  let q = sb
    .from("proveedores")
    .select("id, nombre, rut, contacto, email, telefono, logo_url, activo, created_at")
    .order("nombre");

  if (!incluirInactivos) q = q.eq("activo", true);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProveedorListItem[];
}

export async function getProveedor(id: string): Promise<Proveedor | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("proveedores")
    .select(PROVEEDOR_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Proveedor) ?? null;
}

/** Campos de texto que se guardan trimmeados, y vacio se guarda como null. */
const CAMPOS_TEXTO = [
  "rut", "giro", "direccion", "comuna", "ciudad", "contacto",
  "email", "telefono", "sitio_web", "condiciones_pago", "notas", "logo_url",
] as const;

function limpiar(form: Partial<ProveedorForm>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof form.nombre === "string") out.nombre = form.nombre.trim();
  for (const k of CAMPOS_TEXTO) {
    if (k in form) {
      const v = form[k];
      out[k] = typeof v === "string" ? v.trim() || null : (v ?? null);
    }
  }
  if (typeof form.activo === "boolean") out.activo = form.activo;
  return out;
}

export async function createProveedor(form: ProveedorForm): Promise<Proveedor> {
  const sb = createClient();

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  const { data: perfil, error: perfilErr } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", uid ?? "")
    .maybeSingle();
  if (perfilErr) throw perfilErr;
  if (!perfil?.workspace_id) throw new Error("No se pudo determinar el espacio de trabajo.");

  const { data, error } = await sb
    .from("proveedores")
    .insert({ ...limpiar(form), workspace_id: perfil.workspace_id, creado_por: uid })
    .select(PROVEEDOR_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Proveedor;
}

export async function updateProveedor(id: string, patch: Partial<ProveedorForm>): Promise<void> {
  const sb = createClient();

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  const { error } = await sb
    .from("proveedores")
    .update({ ...limpiar(patch), actualizado_por: uid, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Baja logica.
 *
 * No se borra la fila: activos, partes y ordenes de compra le apuntan, y aunque
 * las FK son ON DELETE SET NULL, una OC que pierde a quien iba dirigida deja de
 * poder reenviarse o auditarse.
 */
export async function archivarProveedor(id: string): Promise<void> {
  await updateProveedor(id, { activo: false });
}

export async function reactivarProveedor(id: string): Promise<void> {
  await updateProveedor(id, { activo: true });
}
