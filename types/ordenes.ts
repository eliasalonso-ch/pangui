// ─── Core domain types ────────────────────────────────────────────────────────

export interface OTLink {
  url: string;
  label?: string;
  nombre?: string;
  tipo?: "link" | "archivo";
}

export type Estado =
  | "pendiente"
  | "en_espera"
  | "en_curso"
  | "completado";

export type Prioridad = "ninguna" | "baja" | "media" | "alta" | "urgente";

export type TipoTrabajo = "reactiva" | "preventiva" | "emergencia" | "levantamiento" | "presupuesto";

export type ClasificacionOT = "levantamiento" | "ejecucion";

export type Recurrencia = "ninguna" | "diaria" | "semanal" | "quincenal" | "mensual" | "anual";

export interface RecurrenciaConfig {
  interval?: number | null;
  unit?: "day" | "week" | "month" | "year" | null;
  weekdays?: number[] | null;
  month_day?: number | null;
  end_date?: string | null;
}

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
  | "comentario"
  | "fotos_grupo_subidas";

// DB role taxonomy (post role-system rewrite). `jefe`/`tecnico` are legacy
// aliases kept only so old rows/string comparisons don't break; new data uses
// owner/admin/member/requester. See lib/roles.js for the canonical predicates.
export type RolUsuario = "owner" | "admin" | "member" | "requester" | "jefe" | "tecnico";

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
  rut?: string | null;
  contacto_nombre?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  direccion?: string | null;
  contrato_ref?: string | null;
  contrato_inicio?: string | null;
  contrato_termino?: string | null;
  brand_color?: string | null;
  notas?: string | null;
}

export interface Ubicacion {
  id: string;
  edificio: string;
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

export type AssetCriticality = "critico" | "semi_critico" | "no_critico";

export interface AssetAttachment {
  url: string;
  nombre: string;
  tipo?: "foto" | "manual" | "archivo" | "link";
  mime?: string | null;
  size?: number | null;
  uploaded_at?: string;
}

export type AssetStatus = "operativo" | "fuera_servicio" | "mantencion" | "baja";

export interface Fabricante {
  id: string;
  nombre: string;
  pais: string | null;
  created_at: string;
}

export interface Modelo {
  id: string;
  fabricante_id: string | null;
  nombre: string;
  created_at: string;
  fabricante?: Pick<Fabricante, "id" | "nombre"> | null;
}

export interface Proveedor {
  id: string;
  workspace_id: string | null;
  nombre: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  created_at: string;
}

export interface Activo {
  id: string;
  workspace_id?: string | null;
  nombre: string;
  descripcion?: string | null;
  imagen_url?: string | null;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  fabricante_id?: string | null;
  modelo_id?: string | null;
  proveedor_id?: string | null;
  responsable_id?: string | null;
  activo_padre_id?: string | null;
  criticidad?: AssetCriticality | null;
  numero_serie?: string | null;
  año_fabricacion?: number | null;
  estado?: AssetStatus | string | null;
  fecha_garantia?: string | null;
  archivo_url?: string | null;
  archivo_nombre?: string | null;
  adjuntos?: AssetAttachment[];
  activo?: boolean;
  created_at?: string;
  ubicacion?: Pick<Ubicacion, "id" | "edificio" | "detalle"> | null;
  lugar?: Pick<LugarEspecifico, "id" | "nombre"> | null;
  sociedad?: Pick<Sociedad, "id" | "nombre" | "imagen_url"> | null;
  fabricante?: Pick<Fabricante, "id" | "nombre"> | null;
  modelo?: Pick<Modelo, "id" | "nombre"> | null;
  proveedor?: Pick<Proveedor, "id" | "nombre"> | null;
  responsable?: Pick<Usuario, "id" | "nombre"> | null;
  parent?: Pick<Activo, "id" | "nombre"> | null;
}

export interface Usuario {
  id: string;
  nombre: string;
  rol: RolUsuario;
}

export interface ActividadOT {
  id: string;
  orden_id: string;
  tipo: ActividadTipo;
  comentario: string | null;
  foto_url: string | null;
  audio_url: string | null;
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
  clasificacion: ClasificacionOT | null;
  recurrencia: Recurrencia;
  recurrencia_config?: RecurrenciaConfig | null;
  proxima_ejecucion: string | null;
  recurrencia_origen_id?: string | null;
  recurrencia_iteracion?: number | null;
  parent_id: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  creado_por: string | null;
  asignados_ids: string[] | null;
  categoria_id: string | null;
  categoria_ids: string[] | null;
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
  // Dedicated metadata columns (previously encoded inside descripcion)
  n_serie: string | null;
  solicitante: string | null;
  solicitante_telefono: string | null;
  solicitante_email: string | null;
  hito: string | null;
  presupuesto: string | null;
  // Sequential number per workspace
  numero: number | null;
  // Constraints
  requiere_materiales: boolean;
  requiere_hoja: boolean;
  requiere_fotos: boolean;
  // Media
  imagen_url: string | null;
  fotos_urls: string[] | null;
  links: OTLink[] | null;
  // Joined relations
  categorias_ot?: CategoriaOT | null;
  ubicaciones?: (Pick<Ubicacion, "id" | "edificio" | "detalle" | "sociedad_id"> & { sociedades?: Pick<Sociedad, "nombre"> | null }) | null;
  lugar?: Pick<LugarEspecifico, "id" | "nombre" | "imagen_url"> | null;
  sociedad?: Pick<Sociedad, "id" | "nombre" | "imagen_url"> | null;
  activos?: Pick<Activo, "id" | "nombre"> | null;
  creador?: Pick<Usuario, "id" | "nombre"> | null;
  // Client-only
  _pending?: boolean;
}

// ─── List item (lighter shape from bandeja query) ─────────────────────────────

export type OrdenListItem = Pick<
  OrdenTrabajo,
  | "id" | "titulo" | "descripcion" | "estado" | "prioridad"
  | "tipo" | "tipo_trabajo" | "clasificacion" | "fecha_inicio" | "fecha_termino" | "recurrencia" | "recurrencia_config"
  | "created_at" | "categoria_id" | "ubicacion_id" | "activo_id"
  | "creado_por" | "asignados_ids" | "numero" | "parent_id"
  | "n_serie" | "solicitante" | "hito"
  | "categorias_ot" | "ubicaciones" | "activos"
  | "_pending"
> & Partial<Pick<OrdenTrabajo, "proxima_ejecucion" | "recurrencia_origen_id" | "recurrencia_iteracion">>;


// ─── Filter state ─────────────────────────────────────────────────────────────

export interface FiltrosState {
  estados: Estado[];
  prioridades: Prioridad[];
  tipos: TipoTrabajo[];
  asignadoIds: string[];
  ubicacionIds: string[];
  sociedadIds: string[];
  fechaVencimiento: "hoy" | "manana" | "7dias" | "30dias" | "este_mes" | "vencidas" | null;
  sinAsignar: boolean;
  soloAsignados: boolean;
}

export type SortOption =
  | "created_at_desc"
  | "fecha_termino_asc"
  | "prioridad_desc"
  | "prioridad_asc"
  | "ubicacion";
