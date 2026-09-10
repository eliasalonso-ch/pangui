/**
 * Proveedores.
 *
 * Nacio como tabla de apoyo del formulario de activos (nombre + un contacto) y
 * paso a ser una entidad con datos legales cuando aparecieron las ordenes de
 * compra: el bloque "SEÑORES:" del documento necesita razon social, RUT, giro y
 * direccion.
 *
 * Todo lo nuevo es opcional a proposito. Los proveedores que ya existian solo
 * tienen nombre, y siguen sirviendo para el selector de activos y materiales;
 * exigir RUT habria roto esas filas.
 */
export interface Proveedor {
  id: string;
  workspace_id: string | null;
  nombre: string;

  /** Datos tributarios chilenos, para la cabecera de la orden de compra. */
  rut: string | null;
  giro: string | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;

  contacto: string | null;
  email: string | null;
  telefono: string | null;
  sitio_web: string | null;

  /** Se copia a la OC al crearla ("30 dias", "contado"). */
  condiciones_pago: string | null;
  notas: string | null;
  logo_url: string | null;

  /**
   * Baja logica: un proveedor con historial de compras no se puede borrar sin
   * dejar huerfanas las OCs que le apuntan, asi que se desactiva.
   */
  activo: boolean;

  creado_por: string | null;
  actualizado_por: string | null;
  created_at: string;
  updated_at: string | null;
  creador?: { id: string; nombre: string } | null;
  actualizador?: { id: string; nombre: string } | null;
}

/** Fila de la lista. */
export interface ProveedorListItem
  extends Pick<
    Proveedor,
    "id" | "nombre" | "rut" | "contacto" | "email" | "telefono" | "logo_url" | "activo" | "created_at"
  > {}

/** Lo que el panel de creacion/edicion envia. */
export interface ProveedorForm {
  nombre: string;
  rut?: string | null;
  giro?: string | null;
  direccion?: string | null;
  comuna?: string | null;
  ciudad?: string | null;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  sitio_web?: string | null;
  condiciones_pago?: string | null;
  notas?: string | null;
  logo_url?: string | null;
  activo?: boolean;
}
