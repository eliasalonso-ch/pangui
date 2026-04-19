"use client"

import * as React from "react"
import { FiltrosState, Estado, Prioridad, TipoTrabajo } from "@/types/ordenes"

type Props = {
  filtros: FiltrosState
  setFiltros: React.Dispatch<React.SetStateAction<FiltrosState>>
}

const ESTADOS: Estado[] = [
  "pendiente",
  "en_espera",
  "en_curso",
  "completado",
]

const PRIORIDADES: Prioridad[] = [
  "ninguna",
  "baja",
  "media",
  "alta",
  "urgente",
]

const TIPOS: TipoTrabajo[] = [
  "reactiva",
  "preventiva",
  "inspeccion",
  "mejora",
]

export default function FilterSheet({ filtros, setFiltros }: Props) {
  // ─── Generic updater ────────────────────────────────────────────────────────
  const updateFiltro = <K extends keyof FiltrosState>(
    key: K,
    value: FiltrosState[K]
  ) => {
    setFiltros((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  // ─── Toggle helpers (arrays) ────────────────────────────────────────────────
  const toggleArrayValue = <T,>(
    key: keyof FiltrosState,
    value: T
  ) => {
    setFiltros((prev) => {
      const current = prev[key] as unknown as T[]
      const exists = current.includes(value)

      return {
        ...prev,
        [key]: exists
          ? current.filter((v) => v !== value)
          : [...current, value],
      }
    })
  }

  // ─── Reset ──────────────────────────────────────────────────────────────────
  const resetFiltros = () => {
    setFiltros({
      estados: [],
      prioridades: [],
      tipos: [],
      asignadoIds: [],
      ubicacionIds: [],
      sociedadIds: [],
      venceHoy: false,
    })
  }

  return (
    <div className="space-y-6 p-4">
      {/* ─── ESTADOS ───────────────────────────────────────── */}
      <div>
        <h3 className="font-semibold mb-2">Estado</h3>
        <div className="flex flex-wrap gap-2">
          {ESTADOS.map((estado) => (
            <button
              key={estado}
              onClick={() => toggleArrayValue("estados", estado)}
              className={`px-3 py-1 rounded border ${
                filtros.estados.includes(estado)
                  ? "bg-black text-white"
                  : "bg-white"
              }`}
            >
              {estado}
            </button>
          ))}
        </div>
      </div>

      {/* ─── PRIORIDADES ───────────────────────────────────── */}
      <div>
        <h3 className="font-semibold mb-2">Prioridad</h3>
        <div className="flex flex-wrap gap-2">
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              onClick={() => toggleArrayValue("prioridades", p)}
              className={`px-3 py-1 rounded border ${
                filtros.prioridades.includes(p)
                  ? "bg-black text-white"
                  : "bg-white"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ─── TIPOS ─────────────────────────────────────────── */}
      <div>
        <h3 className="font-semibold mb-2">Tipo de trabajo</h3>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <button
              key={t}
              onClick={() => toggleArrayValue("tipos", t)}
              className={`px-3 py-1 rounded border ${
                filtros.tipos.includes(t)
                  ? "bg-black text-white"
                  : "bg-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ─── VENCE HOY ─────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={filtros.venceHoy}
          onChange={(e) => updateFiltro("venceHoy", e.target.checked)}
        />
        <label>Vence hoy</label>
      </div>

      {/* ─── DEBUG (optional, remove later) ────────────────── */}
      <pre className="text-xs bg-gray-100 p-2 rounded">
        {JSON.stringify(filtros, null, 2)}
      </pre>

      {/* ─── ACTIONS ───────────────────────────────────────── */}
      <div className="flex gap-2 pt-4">
        <button
          onClick={resetFiltros}
          className="px-4 py-2 border rounded"
        >
          Limpiar
        </button>
      </div>
    </div>
  )
}