// ─── Core domain types ────────────────────────────────────────────────────────

export type Estado =
  | "pendiente"
  | "en_espera"
  | "en_curso"
  | "en_revision"
  | "completado"
  | "cancelado";

export type Prioridad = "ninguna" | "baja" | "media" | "alta" | "urgente";

export type TipoTrabajo = "reactiva" | "preventiva" | "inspeccion" | "mejora";

export type Recurrencia = "ninguna" | "diaria" | "semanal" | "quincenal" | "mensual";

export type TipoPaso = "instruccion" | "verificacion" | "advertencia";

export type ActividadTipo =
  | "creado"
  | "asignado"
  | "estado_cambiado"
  | "prioridad_cambiada"
  | "editado"
  | "ubicacion_cambiada"
  | "iniciado"
  | "pausado"
  | "reanudado"
  | "completado"
  | "cancelado"
  | "comentario";

export type RolUsuario = "admin" | "jefe" | "tecnico";

export type Plan = "basic" | "pro" | "enterprise";

export interface ScanResult {
  raw: string;

  // OT-related
  titulo?: string;
  descripcion?: string;
  solicitante?: string;
  numero_meconecta?: string;
  prioridad?: Prioridad;

  // Location-related
  ubicacion?: string;
  lugar?: string;

  // Asset-related
  activo_id?: string;
  activo_nombre?: string;

  // Optional metadata
  tipo?: "activo" | "ubicacion" | "orden" | "qr_libre";
}

// ─── Row types ────────────────────────────────────────────────────────────────

export interface CategoriaOT {
  id: string;
  nombre: string;
  icono: string | null;
  color: string | null;
}

export interface Sociedad {
  id: string;
  workspace_id: string;
  nombre: string;
  activa: boolean;
  imagen_url: string | null;
  created_at: string;
}

export interface Ubicacion {
  id: string;
  edificio: string;
  piso: string | null;
  detalle: string | null;
  activa?: boolean;
  sociedad_id?: string | null;
  sociedades?: Pick<Sociedad, "id" | "nombre"> | null;
}

export interface LugarEspecifico {
  id: string;
  workspace_id: string;
  ubicacion_id: string | null;
  nombre: string;
  activo: boolean;
  created_at: string;
  imagen_url: string | null;
  descripcion: string | null;
  ubicaciones?: Pick<Ubicacion, "id" | "edificio"> | null;
}

export interface Activo {
  id: string;
  nombre: string;
  codigo: string | null;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

export interface PasoProcedimiento {
  id: string;
  plantilla_id: string;
  orden: number;
  tipo: TipoPaso;
  contenido: string;
}

export interface ParteRequerida {
  parte_id: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
}

export interface ActividadOT {
  id: string;
  orden_id: string;
  tipo: ActividadTipo;
  comentario: string | null;
  usuario_id: string | null;
  created_at: string;
  usuario?: Pick<Usuario, "id" | "nombre"> | null;
}

// ─── Main order type ──────────────────────────────────────────────────────────

export interface OrdenTrabajo {
  id: string;
  workspace_id: string | null;
  titulo: string | null;
  descripcion: string;
  estado: Estado;
  prioridad: Prioridad;
  tipo: string;
  tipo_trabajo: TipoTrabajo | null;
  recurrencia: Recurrencia;
  proxima_ejecucion: string | null;
  parent_id: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  creado_por: string | null;
  asignados_ids: string[] | null;
  categoria_id: string | null;
  ubicacion_id: string | null;
  activo_id: string | null;
  lugar_id: string | null;
  sociedad_id: string | null;
  created_at: string;
  updated_at: string | null;
  // Timer fields
  iniciado_at: string | null;
  pausado_at: string | null;
  en_ejecucion: boolean;
  tiempo_total_segundos: number | null;
  // Sequential number per workspace
  numero: number | null;
  // Media
  imagen_url: string | null;
  fotos_urls: string[] | null;
  // Joined relations
  categorias_ot?: CategoriaOT | null;
  ubicaciones?: (Pick<Ubicacion, "id" | "edificio" | "piso" | "sociedad_id"> & { sociedades?: Pick<Sociedad, "nombre"> | null }) | null;
  lugar?: Pick<LugarEspecifico, "id" | "nombre" | "imagen_url"> | null;
  sociedad?: Pick<Sociedad, "id" | "nombre" | "imagen_url"> | null;
  activos?: Pick<Activo, "id" | "nombre" | "codigo"> | null;
  creador?: Pick<Usuario, "id" | "nombre"> | null;
  // Client-only
  _pending?: boolean;
  _pasos?: PasoProcedimiento[];
}

// ─── List item (lighter shape from bandeja query) ─────────────────────────────

export type OrdenListItem = Pick<
  OrdenTrabajo,
  | "id" | "titulo" | "descripcion" | "estado" | "prioridad"
  | "tipo" | "tipo_trabajo" | "fecha_termino" | "recurrencia"
  | "created_at" | "categoria_id" | "ubicacion_id" | "activo_id"
  | "creado_por" | "asignados_ids" | "numero" | "parent_id"
  | "categorias_ot" | "ubicaciones" | "activos"
  | "_pending"
>;

// ─── Form state ───────────────────────────────────────────────────────────────

export interface OTFormState {
  titulo: string;
  descripcion: string;
  tipo_trabajo: TipoTrabajo;
  prioridad: Prioridad;
  estado: Estado;
  ubicacion_id: string;
  lugar_id: string;
  sociedad_id: string;
  activo_id: string;
  categoria_id: string;
  fecha_inicio: string;
  fecha_termino: string;
  tiempo_estimado_h: string;
  tiempo_estimado_m: string;
  recurrencia: Recurrencia;
  plantilla_id: string;
  pasos: PasoProcedimiento[];
  partes: ParteRequerida[];
  nueva_ubicacion: string;
  nuevo_activo: string;
  guardarComoPreventivo: boolean;
  frecuencia_dias: string;
  asignados_ids: string[];
}

// ─── Filter state ─────────────────────────────────────────────────────────────

export interface FiltrosState {
  estados: Estado[];
  prioridades: Prioridad[];
  tipos: TipoTrabajo[];
  asignadoIds: string[];
  ubicacionIds: string[];
  sociedadIds: string[];
  venceHoy: boolean;
}

export type SortOption =
  | "created_at_desc"
  | "fecha_termino_asc"
  | "prioridad_desc"
  | "prioridad_asc"
  | "ubicacion";
