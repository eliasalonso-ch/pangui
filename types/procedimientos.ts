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
  | "firma";

export type EstadoEjecucion = "pendiente" | "en_curso" | "completado" | "cancelado";

export interface Procedimiento {
  id: string;
  workspace_id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  activo: boolean;
  bloquea_cierre_ot: boolean;
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
  activo: boolean;
  bloquea_cierre_ot: boolean;
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
  // verificacion legacy / si_no_na via aprobado
  aprobado: boolean | null;
  // numero / monto
  valor_medido: number | null;
  // texto / opcion_multiple / si_no_na
  valor_texto: string | null;
  // lista_verificacion: { checked: string[] }
  // inspeccion: { items: { item: string; result: 'pass'|'fail'|'na' }[] }
  valor_json: unknown | null;
  // foto
  foto_url: string | null;
  // firma
  firma_svg: string | null;
  firmado_por_id: string | null;
  firmado_nombre: string | null;
  firmado_at: string | null;
  notas: string | null;
  respondido_at: string;
}

export interface OTProcedimiento {
  id: string;
  orden_id: string;
  procedimiento_id: string;
  adjuntado_por: string | null;
  adjuntado_at: string;
  procedimiento?: (Pick<Procedimiento, "id" | "nombre" | "descripcion" | "bloquea_cierre_ot"> & {
    pasos_count?: number;
    pasos?: ProcedimientoPaso[];
  }) | null;
  ejecucion?: ProcedimientoEjecucion | null;
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
}

export interface ProcedimientoForm {
  nombre: string;
  descripcion: string;
  categoria: string;
  bloquea_cierre_ot: boolean;
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
};
