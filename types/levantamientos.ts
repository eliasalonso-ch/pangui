// ─── Levantamientos (Site Assessments) ───────────────────────────────────────

export type EstadoLevantamiento =
  | "creado"
  | "en_terreno"
  | "en_revision"
  | "aprobado"
  | "no_viable"
  | "requiere_info";

export type TipoItemLevantamiento =
  | "texto"
  | "numero"
  | "si_no"
  | "opcion"
  | "medicion";

export type ActividadLevantamientoTipo =
  | "creado"
  | "asignado"
  | "estado_cambiado"
  | "enviado_revision"
  | "aprobado"
  | "no_viable"
  | "requiere_info"
  | "ot_creada"
  | "comentario";

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface LevantamientoItem {
  id: string;
  seccion_id: string;
  campo: string;
  tipo: TipoItemLevantamiento;
  valor_texto: string | null;
  valor_numero: number | null;
  valor_bool: boolean | null;
  unidad: string | null;
  orden_display: number;
  created_at: string;
}

export interface LevantamientoSeccion {
  id: string;
  levantamiento_id: string;
  titulo: string;
  orden_display: number;
  created_at: string;
  items: LevantamientoItem[];
}

export interface LevantamientoFotoItem {
  id: string;
  grupo_id: string;
  url: string;
  orden_display: number;
  created_at: string;
}

export interface LevantamientoFotoGrupo {
  id: string;
  levantamiento_id: string;
  workspace_id: string;
  titulo: string;
  descripcion: string;
  orden_display: number;
  created_by: string | null;
  created_at: string;
  items?: LevantamientoFotoItem[];
}

export interface LevantamientoActividad {
  id: string;
  levantamiento_id: string;
  tipo: ActividadLevantamientoTipo;
  comentario: string | null;
  usuario_id: string | null;
  created_at: string;
  usuario?: { id: string; nombre: string } | null;
}

export interface Levantamiento {
  id: string;
  workspace_id: string;
  titulo: string;
  descripcion: string | null;
  numero: number | null;
  estado: EstadoLevantamiento;
  sociedad_id: string | null;
  ubicacion_id: string | null;
  lugar: string | null;
  creado_por: string | null;
  asignado_a: string | null;
  resultado_notas: string | null;
  orden_id: string | null;
  created_at: string;
  updated_at: string | null;
  enviado_revision_at: string | null;
  revisado_at: string | null;
  // Joined
  ubicaciones?: { id: string; edificio: string; piso: string | null; sociedad_id: string | null; sociedades?: { nombre: string } | null } | null;
  sociedad?: { id: string; nombre: string } | null;
  creador?: { id: string; nombre: string } | null;
  asignado?: { id: string; nombre: string } | null;
}

export interface LevantamientoDetalle extends Levantamiento {
  secciones: LevantamientoSeccion[];
  foto_grupos: LevantamientoFotoGrupo[];
  actividad: LevantamientoActividad[];
}

// ── Estado display config ─────────────────────────────────────────────────────

export const ESTADO_LEV_CONFIG: Record<EstadoLevantamiento, { label: string; bg: string; color: string; dot: string }> = {
  creado:         { label: "Creado",          bg: "#F8FAFC", color: "#64748B", dot: "#94A3B8" },
  en_terreno:     { label: "En terreno",      bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_revision:    { label: "En revisión",     bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  aprobado:       { label: "Aprobado",        bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  no_viable:      { label: "No viable",       bg: "#FEF2F2", color: "#DC2626", dot: "#EF4444" },
  requiere_info:  { label: "Requiere info",   bg: "#FDF4FF", color: "#7C3AED", dot: "#A855F7" },
};
