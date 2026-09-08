"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Borrador del plan mientras se arma, compartido entre /planes/crear y
 * /planes/crear/plantilla.
 *
 * La plantilla es una pantalla aparte, así que el plan a medio llenar tiene que
 * sobrevivir el ida y vuelta. Vive en un provider montado en el layout de
 * /planes/crear: ese layout envuelve ambas rutas, entonces navegar entre ellas
 * no lo desmonta y el estado se conserva sin serializar nada.
 *
 * No se persiste en la base ni en sessionStorage a propósito: esto es un
 * borrador de minutos, no una sesión. Recargar la página lo pierde, que es el
 * mismo comportamiento que tiene hoy el formulario de crear OT.
 */

export interface PlantillaOT {
  titulo: string;
  descripcion: string;
  categoria_id: string;
  prioridad: string;
  asignados_ids: string[];
  tiempo_h: string;
  tiempo_m: string;
  /** Procedimientos que se adjuntan a cada OT generada. */
  procedimiento_ids: string[];
  /** Imágenes y archivos de referencia (planos, manuales). */
  adjuntos: { url: string; nombre: string; tipo?: string | null }[];
  /** Insumos del catálogo que consume cada mantención, con su cantidad. */
  materiales: { parte_id: string; cantidad: number }[];
  /** Proveedor preferido para la orden de compra. */
  proveedor_id: string;
  /** Marca si el usuario llegó a guardar la plantilla, para el resumen. */
  definida: boolean;
}

export const PLANTILLA_VACIA: PlantillaOT = {
  titulo: "",
  descripcion: "",
  categoria_id: "",
  prioridad: "ninguna",
  asignados_ids: [],
  tiempo_h: "",
  tiempo_m: "",
  procedimiento_ids: [],
  adjuntos: [],
  materiales: [],
  proveedor_id: "",
  definida: false,
};

/**
 * Los campos del plan que hay que conservar al ir a la plantilla y volver.
 * Se guardan como strings tal cual los tiene el formulario: el borrador refleja
 * lo escrito, no un plan válido, así que no se normaliza nada todavía.
 */
export interface PlanDraft {
  nombre: string;
  activoId: string | null;
  recurrencia: string;
  intervalo: number;
  diasSemana: number[];
  diaSemanal: number;
  diaDelMes: number;
  ordinalSemana: number;
  diaOrdinal: number;
  fechaInicio: string;
  fechaFin: string;
  horaVencimiento: string;
  diasApertura: number;
  diasAviso: number;
  horizonteNum: number;
  horizonteUnidad: "dias" | "semanas" | "meses";
}

export const DRAFT_VACIO: PlanDraft = {
  nombre: "",
  activoId: null,
  recurrencia: "",
  intervalo: 1,
  diasSemana: [0, 1, 2, 3, 4, 5, 6],
  diaSemanal: 1,
  diaDelMes: 1,
  ordinalSemana: 1,
  diaOrdinal: 1,
  fechaInicio: "",
  fechaFin: "",
  horaVencimiento: "",
  diasApertura: 1,
  diasAviso: 30,
  horizonteNum: 12,
  horizonteUnidad: "meses",
};

interface Ctx {
  draft: PlanDraft;
  setDraft: (patch: Partial<PlanDraft>) => void;
  plantilla: PlantillaOT;
  setPlantilla: (p: PlantillaOT) => void;
  reset: () => void;
  /**
   * Id del plan que se está editando, o null si es uno nuevo. Lo fija
   * `cargarDesde`; es lo que decide si "Guardar" crea o actualiza.
   */
  editandoId: string | null;
  /** Vuelca un plan existente al borrador para editarlo con el mismo formulario. */
  cargarDesde: (id: string, draft: PlanDraft, plantilla: PlantillaOT) => void;
}

const PlanDraftContext = createContext<Ctx | null>(null);

export function PlanDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<PlanDraft>(DRAFT_VACIO);
  const [plantilla, setPlantilla] = useState<PlantillaOT>(PLANTILLA_VACIA);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  function setDraft(patch: Partial<PlanDraft>) {
    setDraftState(prev => ({ ...prev, ...patch }));
  }

  function reset() {
    setDraftState(DRAFT_VACIO);
    setPlantilla(PLANTILLA_VACIA);
    setEditandoId(null);
  }

  function cargarDesde(id: string, d: PlanDraft, p: PlantillaOT) {
    setDraftState(d);
    setPlantilla(p);
    setEditandoId(id);
  }

  return (
    <PlanDraftContext.Provider value={{
      draft, setDraft, plantilla, setPlantilla, reset, editandoId, cargarDesde,
    }}>
      {children}
    </PlanDraftContext.Provider>
  );
}

export function usePlanDraft(): Ctx {
  const ctx = useContext(PlanDraftContext);
  if (!ctx) throw new Error("usePlanDraft debe usarse dentro de PlanDraftProvider");
  return ctx;
}
