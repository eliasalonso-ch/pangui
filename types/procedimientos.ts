export type TipoPasoProc =
  | "instruccion"
  | "advertencia"
  | "texto"
  | "numero"
  | "monto"
  | "si_no_na"
  | "opcion_multiple"
  | "lista_verificacion"
  | "inspeccion"
  | "imagen"
  | "firma"
  | "medidor"
  | "archivo"
  | "fecha"
  | "hora"
  | "fecha_hora"
  | "escaneo"
  | "falla_iso14224"
  | "sub_procedimiento"
  | "seccion"
  | "puntuacion";

export type EstadoEjecucion = "pendiente" | "en_curso" | "completado" | "cancelado";

export type CondicionOperador = "eq" | "ne" | "in" | "gt" | "lt" | "gte" | "lte" | "contains";

export interface Procedimiento {
  id: string;
  workspace_id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  activo: boolean;
  bloquea_cierre_ot: boolean;
  auto_adjuntar: boolean;
  // New in 20260521; optional so legacy code that maps partial rows still compiles.
  // DB has defaults: version=1, hereda_a_hijos=false, iso_categoria/puntaje_*=null.
  version?: number;
  iso_categoria?: string | null;
  puntaje_minimo?: number | null;
  puntaje_maximo?: number | null;
  hereda_a_hijos?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  pasos?: ProcedimientoPaso[];
}

export interface ProcedimientoListItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  iso_categoria?: string | null;
  activo: boolean;
  bloquea_cierre_ot: boolean;
  auto_adjuntar: boolean;
  hereda_a_hijos?: boolean;
  version?: number;
  created_at: string;
  pasos_count?: number;
}

export interface ProcedimientoPaso {
  id: string;
  procedimiento_id: string;
  orden: number;
  tipo: TipoPasoProc;
  titulo: string;
  descripcion: string | null;
  requerido: boolean;
  // numero
  unidad: string | null;
  valor_min: number | null;
  valor_max: number | null;
  // monto
  moneda: string;
  // texto
  multilinea: boolean;
  // opcion_multiple | lista_verificacion | inspeccion
  opciones: string[] | null;
  // firma
  rol_firmante: string | null;
  // New in 20260521; optional so legacy code keeps compiling.
  // scoring
  peso?: number;
  // conditional visibility
  condicion_paso_id?: string | null;
  condicion_operador?: CondicionOperador | null;
  condicion_valor?: unknown | null;
  // soft requirements
  requiere_nota_si?: { on: string[] } | null;
  requiere_foto_si?: { on: string[] } | null;
  // corrective action
  genera_correctiva?: boolean;
  correctiva_plantilla?: Record<string, unknown> | null;
  // type-specific
  medidor_id?: string | null;
  iso14224_taxonomia?: string | null;
  sub_procedimiento_id?: string | null;
  multimedia_url?: string | null;
}

export interface ProcedimientoEjecucion {
  id: string;
  procedimiento_id: string;
  orden_id: string;
  iniciado_por: string | null;
  completado_por: string | null;
  estado: EstadoEjecucion;
  iniciado_at: string | null;
  completado_at: string | null;
  created_at: string;
  procedimiento?: Pick<Procedimiento, "id" | "nombre" | "bloquea_cierre_ot"> | null;
  pasos?: ProcedimientoPaso[];
  respuestas?: PasoRespuesta[];
}

export interface PasoRespuesta {
  id: string;
  ejecucion_id: string;
  paso_id: string;
  respondido_por: string | null;
  aprobado: boolean | null;
  valor_medido: number | null;
  valor_texto: string | null;
  valor_json: unknown | null;
  foto_url: string | null;
  firma_svg: string | null;
  firmado_por_id: string | null;
  firmado_nombre: string | null;
  firmado_at: string | null;
  notas: string | null;
  respondido_at: string;
  // New in 20260521; all optional. DB columns are nullable.
  valor_fecha?: string | null;
  archivo_url?: string | null;
  archivo_nombre?: string | null;
  archivo_mime?: string | null;
  escaneo_valor?: string | null;
  escaneo_asset_id?: string | null;
  iso14224_modo?: string | null;
  iso14224_causa?: string | null;
  iso14224_mecanismo?: string | null;
  iso14224_accion?: string | null;
  lectura_anterior?: number | null;
  lectura_delta?: number | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  device_id?: string | null;
  puntaje_obtenido?: number | null;
  revision_paso?: number | null;
  editado_at?: string | null;
  editado_por?: string | null;
  correctiva_ot_id?: string | null;
}

export interface PasoRespuestaHistorial {
  id: string;
  respuesta_id: string;
  workspace_id: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  editado_por: string | null;
  editado_at: string;
}

export interface OTProcedimiento {
  id: string;
  orden_id: string;
  procedimiento_id: string;
  adjuntado_por: string | null;
  adjuntado_at: string;
  hereda_a_hijos?: boolean;
  procedimiento?: (Pick<Procedimiento, "id" | "nombre" | "descripcion" | "bloquea_cierre_ot" | "version" | "iso_categoria" | "puntaje_minimo" | "hereda_a_hijos"> & {
    pasos_count?: number;
    pasos?: ProcedimientoPaso[];
  }) | null;
  ejecucion?: ProcedimientoEjecucion | null;
}

export interface ProcedimientoSubprocedimiento {
  id: string;
  parent_paso_id: string;
  child_procedimiento_id: string;
  orden: number;
  created_at: string;
}

export interface ProcedimientoPlantilla {
  id: string;
  workspace_id: string | null;
  nombre: string;
  descripcion: string | null;
  iso_categoria: string | null;
  pasos_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type WorkspaceTaxonomiaTipo =
  | "iso14224_modo"
  | "iso14224_causa"
  | "iso14224_mecanismo"
  | "iso14224_accion"
  | "iso_categoria"
  | "unidad_medidor";

export interface WorkspaceTaxonomiaValor {
  slug: string;
  etiqueta: string;
  padre_slug?: string;
  orden?: number;
}

export interface WorkspaceTaxonomia {
  id: string;
  workspace_id: string | null;
  tipo: WorkspaceTaxonomiaTipo;
  valores: WorkspaceTaxonomiaValor[];
  updated_at: string;
}

// ── Form builder types ────────────────────────────────────────────────────────

export interface PasoFormItem {
  tempId: string;
  tipo: TipoPasoProc;
  titulo: string;
  descripcion: string;
  requerido: boolean;
  // numero
  unidad: string;
  valor_min: string;
  valor_max: string;
  // monto
  moneda: string;
  // texto
  multilinea: boolean;
  // opcion_multiple | lista_verificacion | inspeccion
  opciones: string[];
  // firma
  rol_firmante: string;
  // New in 20260521; optional so the legacy inline-styled builder keeps
  // compiling. The Phase-3 shadcn rewrite will require these.
  peso?: number;
  condicion_tempid?: string | null;
  condicion_operador?: CondicionOperador | null;
  condicion_valor?: unknown | null;
  requiere_nota_si?: string[];
  requiere_foto_si?: string[];
  genera_correctiva?: boolean;
  correctiva_plantilla?: Record<string, unknown> | null;
  medidor_id?: string | null;
  iso14224_taxonomia?: string | null;
  sub_procedimiento_id?: string | null;
  multimedia_url?: string | null;
}

export interface ProcedimientoForm {
  nombre: string;
  descripcion: string;
  categoria: string;
  iso_categoria?: string;
  bloquea_cierre_ot: boolean;
  auto_adjuntar: boolean;
  hereda_a_hijos?: boolean;
  puntaje_minimo?: number | null;
  pasos: PasoFormItem[];
}

// ── Execution helpers ─────────────────────────────────────────────────────────

export type RespPendiente = {
  aprobado?: boolean | null;
  valor_medido?: number | null;
  valor_texto?: string | null;
  valor_json?: unknown | null;
  foto_url?: string | null;
  firma_svg?: string | null;
  firmado_nombre?: string | null;
  firmado_por_id?: string;
  firmado_at?: string;
  notas?: string | null;
  // new field types
  valor_fecha?: string | null;
  archivo_url?: string | null;
  archivo_nombre?: string | null;
  archivo_mime?: string | null;
  escaneo_valor?: string | null;
  escaneo_asset_id?: string | null;
  iso14224_modo?: string | null;
  iso14224_causa?: string | null;
  iso14224_mecanismo?: string | null;
  iso14224_accion?: string | null;
  lectura_anterior?: number | null;
  lectura_delta?: number | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  device_id?: string | null;
  puntaje_obtenido?: number | null;
  revision_paso?: number | null;
};
