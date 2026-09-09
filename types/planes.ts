import type { Recurrencia, RecurrenciaConfig } from "@/types/ordenes";

/**
 * La recurrencia de un plan es la de una OT menos "ninguna": un plan sin
 * repetición no es un plan, es una OT suelta. El tipo se deriva en vez de
 * redeclararse para que agregar una periodicidad en types/ordenes.ts la traiga
 * aquí sola.
 */
/**
 * Un plan usa un subconjunto del vocabulario de recurrencia de las OTs.
 *
 * Fuera quedan "ninguna" (un plan sin repetición no es un plan), "quincenal"
 * (un caso particular de "cada N semanas") y "personalizada" (nació para los
 * presets del móvil; en un plan solo agrega una forma más de decir "cada N
 * días"). Menos opciones que digan lo mismo hacen el selector más claro.
 */
export type RecurrenciaPlan = Exclude<
  Recurrencia,
  "ninguna" | "quincenal" | "personalizada"
>;

export type EstadoOcurrencia =
  /** Fecha declarada, todavía lejos. */
  | "programada"
  /** Ya se avisó (dias_aviso_previo). Aquí colgará la orden de compra. */
  | "avisada"
  /** Ya existe la OT que la ejecuta. */
  | "generada"
  | "completada"
  /** Se decidió no ejecutarla; conserva el registro de que estaba planificada. */
  | "omitida";

export interface PlanMantencion {
  id: string;
  workspace_id: string;
  /** Correlativo por workspace: el "#12" que la gente lee y busca. */
  numero: number | null;
  nombre: string;
  descripcion: string | null;
  activo_id: string;

  recurrencia: RecurrenciaPlan;
  recurrencia_config: RecurrenciaConfig | null;

  /** Primer vencimiento de la serie. */
  fecha_inicio: string;
  fecha_fin: string | null;
  /** Hora de vencimiento ("09:00"), o null si vence el día sin hora. */
  hora_vencimiento: string | null;

  /** Días entre la apertura de la OT y el vencimiento. */
  dias_apertura_previa: number;
  /** Días antes del vencimiento en que se avisa (y se prepara la compra). */
  dias_aviso_previo: number;
  /** Con cuánta antelación se materializan las ocurrencias futuras. */
  horizonte_dias: number;

  /** Título de la OT generada; null = usa el nombre del plan. */
  titulo_ot: string | null;
  descripcion_ot: string | null;
  categoria_id: string | null;
  ubicacion_id: string | null;
  /**
   * Siempre "preventiva": un plan genera trabajo planificado por definición, y
   * dejarlo variar corrompía los KPIs de preventivo vs. correctivo. La base lo
   * fuerza con un CHECK; el campo se conserva porque la OT generada lo necesita.
   */
  tipo_trabajo: string | null;
  prioridad: string | null;
  /** Proveedor preferido para la orden de compra. */
  proveedor_id: string | null;
  imagen_url: string | null;
  adjuntos: PlanAdjunto[];
  asignados_ids: string[];
  procedimiento_ids: string[];
  duracion_estimada_horas: number | null;

  activo: boolean;
  creado_por: string | null;
  actualizado_por?: string | null;
  created_at: string;
  updated_at: string;
  /** Auditoria: quien creo y quien toco por ultima vez el plan. */
  creador?: { id: string; nombre: string } | null;
  actualizador?: { id: string; nombre: string } | null;
}

/** Fila de la lista: el plan más lo que se necesita para leerlo de un vistazo. */
export interface PlanListItem
  extends Pick<
    PlanMantencion,
    | "id" | "numero" | "nombre" | "descripcion" | "activo_id" | "recurrencia"
    | "recurrencia_config" | "fecha_inicio" | "fecha_fin" | "activo"
    | "dias_aviso_previo" | "created_at"
  > {
  activo_nombre: string | null;
  activo_imagen: string | null;
  activo_serie: string | null;
  /** Vencimiento de la próxima ocurrencia pendiente. */
  proxima_fecha: string | null;
}

/** Archivo adjunto del plan. Mismo formato que activos.adjuntos. */
export interface PlanAdjunto {
  url: string;
  nombre: string;
  tipo?: string | null;
}

/** Un material del catálogo con la cantidad que consume cada mantención. */
export interface PlanMaterialForm {
  parte_id: string;
  cantidad: number;
}

export interface PlanMaterial extends PlanMaterialForm {
  id: string;
  plan_id: string;
  nombre: string;
  unidad: string | null;
  stock_actual: number | null;
  imagen_url: string | null;
}

export interface PlanOcurrencia {
  id: string;
  plan_id: string;
  workspace_id: string;
  /** Cuándo vence. */
  fecha_programada: string;
  /** Cuándo se abre la OT. */
  fecha_apertura: string;
  iteracion: number;
  estado: EstadoOcurrencia;
  orden_id: string | null;
  avisada_at: string | null;
  generada_at: string | null;
  created_at: string;
}

/** Lo que la pantalla de creación envía. */
export interface PlanForm {
  nombre: string;
  descripcion?: string | null;
  activo_id: string;
  recurrencia: RecurrenciaPlan;
  recurrencia_config?: RecurrenciaConfig | null;
  fecha_inicio: string;
  fecha_fin?: string | null;
  hora_vencimiento?: string | null;
  dias_apertura_previa?: number;
  dias_aviso_previo?: number;
  horizonte_dias?: number;
  titulo_ot?: string | null;
  descripcion_ot?: string | null;
  categoria_id?: string | null;
  ubicacion_id?: string | null;
  tipo_trabajo?: string | null;
  prioridad?: string | null;
  proveedor_id?: string | null;
  imagen_url?: string | null;
  adjuntos?: PlanAdjunto[];
  /** Materiales del plan. Se guardan aparte, en plan_materiales. */
  materiales?: PlanMaterialForm[];
  asignados_ids?: string[];
  procedimiento_ids?: string[];
  duracion_estimada_horas?: number | null;
}

/** Etiquetas del selector. Mismo vocabulario que las OTs. */
export const RECURRENCIA_PLAN_LABELS: Record<RecurrenciaPlan, string> = {
  diaria: "Diario",
  semanal: "Semanal",
  mensual: "Mensual",
  mensual_fecha: "Mensualmente por fecha",
  mensual_dia: "Mensualmente por día de la semana",
  anual: "Anual",
};
