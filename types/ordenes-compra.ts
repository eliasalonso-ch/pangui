import type { Proveedor } from "@/types/proveedores";

/**
 * Estados de una orden de compra.
 *
 * El flujo sigue el de MaintainX porque es el que espera quien ya usa un CMMS:
 * alguien la pide, un administrador la aprueba, recien ahi se le manda al
 * proveedor, y se va cerrando a medida que llega la mercaderia.
 *
 * `recibida_parcial` existe porque los proveedores despachan por partes; sin
 * ese estado habria que elegir entre mentir ("completada" con la mitad) o
 * dejarla abierta sin señal de que ya llego algo.
 */
export type EstadoOrdenCompra =
  /** Se esta armando. Todavia puede no tener proveedor. */
  | "borrador"
  /** Pedida. Es donde nace la que genera el plan de mantencion. */
  | "pendiente_aprobacion"
  /** Aprobada: ya se puede enviar al proveedor. */
  | "aprobada"
  | "enviada"
  | "recibida_parcial"
  | "completada"
  | "rechazada"
  | "cancelada";

/** De donde salio la orden. */
export type OrigenOrdenCompra = "manual" | "plan_mantencion";

export interface OrdenCompra {
  id: string;
  workspace_id: string;
  /** Correlativo por workspace: el "#12" que la gente lee y busca. */
  numero: number | null;
  /**
   * Numero propio de la empresa ("OC-2026-014"). Cuando existe manda en el PDF:
   * muchas arrastran su nomenclatura y necesitan escribirla tal cual.
   */
  numero_manual: string | null;

  proveedor_id: string | null;
  estado: EstadoOrdenCompra;
  origen: OrigenOrdenCompra;

  /** Trazabilidad hacia el plan que la genero. */
  plan_id: string | null;
  plan_ocurrencia_id: string | null;
  orden_trabajo_id: string | null;

  fecha_emision: string;
  fecha_entrega_esperada: string | null;
  direccion_despacho: string | null;
  condiciones_pago: string | null;
  moneda: string;

  /** Montos en CLP entero. Ver calcularTotales en lib/ordenes-compra-api.ts. */
  neto: number;
  descuento: number;
  otros_costos: number;
  iva: number;
  total: number;

  observaciones: string | null;
  adjuntos: OrdenCompraAdjunto[];

  /**
   * Respaldo de la cotizacion del proveedor. Una OC declara "precios acordados"
   * y tiene valor legal en Chile; esto deja por escrito de donde salieron.
   */
  cotizacion_numero: string | null;
  cotizacion_fecha: string | null;
  /**
   * Alguien reviso los precios contra el proveedor.
   *
   * Las OCs del plan nacen en false porque sus precios vienen del catalogo
   * interno (`partes.precio_unitario`), no de una cotizacion.
   */
  precios_confirmados: boolean;

  aprobada_at: string | null;
  aprobada_por: string | null;
  rechazada_motivo: string | null;

  enviada_at: string | null;
  enviada_por: string | null;
  enviada_a_email: string | null;

  creado_por: string | null;
  actualizado_por: string | null;
  created_at: string;
  updated_at: string;

  proveedor?: Pick<Proveedor, "id" | "nombre" | "rut" | "email" | "contacto" | "telefono"> | null;
  creador?: { id: string; nombre: string } | null;
  actualizador?: { id: string; nombre: string } | null;
}

/** Fila de la lista. */
export interface OrdenCompraListItem
  extends Pick<
    OrdenCompra,
    | "id" | "numero" | "numero_manual" | "estado" | "origen" | "total"
    | "fecha_emision" | "fecha_entrega_esperada" | "created_at"
  > {
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  /** Cuantas lineas trae, para no cargarlas en la lista. */
  lineas_count: number;
  /**
   * Partes del catalogo que toca esta OC, para el filtro por material. Viene
   * de la misma consulta agrupada que cuenta las lineas, no de un embed.
   */
  parte_ids: string[];
}

export interface OrdenCompraAdjunto {
  url: string;
  nombre: string;
  tipo?: string | null;
}

/**
 * Una linea del documento.
 *
 * `parte_id` es opcional: una OC tambien compra cosas fuera del catalogo (un
 * flete, un servicio de maestranza). Sin parte_id la linea vale igual, solo que
 * al recibirla no mueve stock porque no hay que mover.
 *
 * descripcion/codigo/unidad se copian del catalogo al crear la linea en vez de
 * leerse por join: el documento tiene que seguir diciendo lo mismo dentro de un
 * año, aunque despues se renombre la parte o cambie su precio.
 */
export interface OrdenCompraLineaForm {
  parte_id?: string | null;
  descripcion: string;
  codigo?: string | null;
  unidad?: string;
  cantidad: number;
  precio_unitario: number;
  descuento?: number;
}

export interface OrdenCompraLinea extends OrdenCompraLineaForm {
  id: string;
  orden_compra_id: string;
  unidad: string;
  descuento: number;
  total: number;
  cantidad_recibida: number;
  orden: number;
  /** Stock actual de la parte, para avisar al recibir. */
  stock_actual?: number | null;
}

/** Lo que la pantalla de creacion envia. */
export interface OrdenCompraForm {
  proveedor_id?: string | null;
  numero_manual?: string | null;
  fecha_emision?: string;
  fecha_entrega_esperada?: string | null;
  direccion_despacho?: string | null;
  condiciones_pago?: string | null;
  descuento?: number;
  otros_costos?: number;
  observaciones?: string | null;
  cotizacion_numero?: string | null;
  cotizacion_fecha?: string | null;
  precios_confirmados?: boolean;
  adjuntos?: OrdenCompraAdjunto[];
  /** Lineas. Se guardan aparte, en ordenes_compra_lineas. */
  lineas?: OrdenCompraLineaForm[];
}

export const ESTADO_OC_LABELS: Record<EstadoOrdenCompra, string> = {
  borrador: "Borrador",
  pendiente_aprobacion: "Por aprobar",
  aprobada: "Aprobada",
  enviada: "Enviada",
  recibida_parcial: "Recibida parcial",
  completada: "Completada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

/** Color del badge de estado. Usa los tokens de la app, no hex sueltos. */
export const ESTADO_OC_COLOR: Record<EstadoOrdenCompra, string> = {
  borrador: "var(--fg-3)",
  pendiente_aprobacion: "var(--warning)",
  aprobada: "var(--brand)",
  enviada: "var(--brand)",
  recibida_parcial: "var(--warning)",
  completada: "var(--success)",
  rechazada: "var(--danger)",
  cancelada: "var(--fg-3)",
};
