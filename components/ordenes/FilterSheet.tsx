"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type {
  FiltrosState,
  SortOption,
  Prioridad,
  TipoTrabajo,
  Usuario,
  Ubicacion,
  Activo,
  CategoriaOT,
} from "@/types/ordenes";

// ─── Props ────────────────────────────────────────────────────────────────────

interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filtros: FiltrosState;
  setFiltros: (f: FiltrosState) => void;
  sortBy: SortOption;
  setSortBy: (s: SortOption) => void;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  activos: Activo[];
  categorias: CategoriaOT[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countActiveFilters(filtros: FiltrosState): number {
  let n = 0;
  if (filtros.asignado_a.length) n++;
  if (filtros.prioridad.length) n++;
  if (filtros.ubicacion_id.length) n++;
  if (filtros.activo_id.length) n++;
  if (filtros.categoria_id.length) n++;
  if (filtros.tipo_trabajo.length) n++;
  if (filtros.fecha_termino_desde) n++;
  if (filtros.fecha_termino_hasta) n++;
  if (filtros.created_desde) n++;
  if (filtros.created_hasta) n++;
  return n;
}

const EMPTY_FILTROS: FiltrosState = {
  asignado_a: [],
  prioridad: [],
  ubicacion_id: [],
  activo_id: [],
  categoria_id: [],
  tipo_trabajo: [],
  fecha_termino_desde: "",
  fecha_termino_hasta: "",
  created_desde: "",
  created_hasta: "",
};

function initials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        {label}
      </p>
      {children}
    </div>
  );
}

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeStyle?: React.CSSProperties;
}

function Chip({ active, onClick, children, activeStyle }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-none cursor-pointer transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border bg-background text-foreground hover:bg-muted",
      ].join(" ")}
      style={active && activeStyle ? activeStyle : undefined}
    >
      {children}
    </button>
  );
}

// ─── Sort options ─────────────────────────────────────────────────────────────

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "created_at_desc",   label: "Más reciente" },
  { value: "fecha_termino_asc", label: "Fecha límite ↑" },
  { value: "prioridad_desc",    label: "Prioridad ↓" },
  { value: "prioridad_asc",     label: "Prioridad ↑" },
  { value: "ubicacion",         label: "Ubicación" },
];

// ─── Priority options ─────────────────────────────────────────────────────────

const PRIORIDAD_OPTIONS: { value: Prioridad; label: string; color: string; bg: string }[] = [
  { value: "urgente", label: "Urgente", color: "#ef4444", bg: "#fee2e2" },
  { value: "alta",    label: "Alta",    color: "#f97316", bg: "#ffedd5" },
  { value: "media",   label: "Media",   color: "#3b82f6", bg: "#dbeafe" },
  { value: "baja",    label: "Baja",    color: "#a1a1aa", bg: "#f4f4f5" },
  { value: "ninguna", label: "Sin prioridad", color: "#71717a", bg: "#f4f4f5" },
];

// ─── Tipo trabajo options ─────────────────────────────────────────────────────

const TIPO_TRABAJO_OPTIONS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",    label: "Reactiva" },
  { value: "preventiva",  label: "Preventiva" },
  { value: "inspeccion",  label: "Inspección" },
  { value: "mejora",      label: "Mejora" },
];

// ─── Toggle helper ────────────────────────────────────────────────────────────

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FilterSheet({
  open,
  onOpenChange,
  filtros,
  setFiltros,
  sortBy,
  setSortBy,
  usuarios,
  ubicaciones,
  activos,
  categorias,
}: FilterSheetProps) {
  const activeCount = countActiveFilters(filtros);

  function update<K extends keyof FiltrosState>(key: K, value: FiltrosState[K]) {
    setFiltros({ ...filtros, [key]: value });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[92dvh] flex flex-col p-0 rounded-none"
      >
        {/* Header */}
        <SheetHeader className="flex-row items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <SheetTitle className="text-base font-semibold">
            Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
          </SheetTitle>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFiltros(EMPTY_FILTROS)}
              className="text-primary text-sm font-medium hover:underline"
            >
              Limpiar todo
            </button>
          )}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-4 py-2 pb-safe">

          {/* Sort */}
          <Section label="Ordenar por">
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  active={sortBy === opt.value}
                  onClick={() => setSortBy(opt.value)}
                >
                  {opt.label}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Priority */}
          <Section label="Prioridad">
            <div className="flex flex-wrap gap-2">
              {PRIORIDAD_OPTIONS.map((opt) => {
                const isActive = filtros.prioridad.includes(opt.value);
                return (
                  <Chip
                    key={opt.value}
                    active={isActive}
                    onClick={() =>
                      update("prioridad", toggleInArray(filtros.prioridad, opt.value))
                    }
                    activeStyle={{ backgroundColor: opt.bg, color: opt.color, borderColor: opt.color }}
                  >
                    {opt.label}
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Responsable */}
          {usuarios.length > 0 && (
            <Section label="Responsable">
              <div className="flex flex-wrap gap-2">
                {usuarios.map((u) => {
                  const isActive = filtros.asignado_a.includes(u.id);
                  return (
                    <Chip
                      key={u.id}
                      active={isActive}
                      onClick={() =>
                        update("asignado_a", toggleInArray(filtros.asignado_a, u.id))
                      }
                    >
                      <span className="inline-flex items-center justify-center size-4 rounded-none bg-muted text-muted-foreground text-[9px] font-bold border border-current/20">
                        {initials(u.nombre)}
                      </span>
                      {u.nombre}
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Tipo de trabajo */}
          <Section label="Tipo de trabajo">
            <div className="flex flex-wrap gap-2">
              {TIPO_TRABAJO_OPTIONS.map((opt) => {
                const isActive = filtros.tipo_trabajo.includes(opt.value);
                return (
                  <Chip
                    key={opt.value}
                    active={isActive}
                    onClick={() =>
                      update("tipo_trabajo", toggleInArray(filtros.tipo_trabajo, opt.value))
                    }
                  >
                    {opt.label}
                  </Chip>
                );
              })}
            </div>
          </Section>

          {/* Ubicación */}
          {ubicaciones.length > 0 && (
            <Section label="Ubicación">
              <div className="flex flex-wrap gap-2">
                {ubicaciones.map((ub) => {
                  const isActive = filtros.ubicacion_id.includes(ub.id);
                  return (
                    <Chip
                      key={ub.id}
                      active={isActive}
                      onClick={() =>
                        update("ubicacion_id", toggleInArray(filtros.ubicacion_id, ub.id))
                      }
                    >
                      {ub.edificio}
                      {ub.piso ? ` — ${ub.piso}` : ""}
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Activo / Equipo */}
          {activos.length > 0 && (
            <Section label="Activo / Equipo">
              <div className="flex flex-wrap gap-2">
                {activos.map((ac) => {
                  const isActive = filtros.activo_id.includes(ac.id);
                  return (
                    <Chip
                      key={ac.id}
                      active={isActive}
                      onClick={() =>
                        update("activo_id", toggleInArray(filtros.activo_id, ac.id))
                      }
                    >
                      {ac.nombre}
                      {ac.codigo ? ` (${ac.codigo})` : ""}
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Categoría */}
          {categorias.length > 0 && (
            <Section label="Categoría">
              <div className="flex flex-wrap gap-2">
                {categorias.map((cat) => {
                  const isActive = filtros.categoria_id.includes(cat.id);
                  return (
                    <Chip
                      key={cat.id}
                      active={isActive}
                      onClick={() =>
                        update("categoria_id", toggleInArray(filtros.categoria_id, cat.id))
                      }
                      activeStyle={
                        cat.color
                          ? {
                              backgroundColor: cat.color + "22",
                              color: cat.color,
                              borderColor: cat.color,
                            }
                          : undefined
                      }
                    >
                      {cat.icono && <span>{cat.icono}</span>}
                      {cat.nombre}
                    </Chip>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Fecha de creación */}
          <Section label="Fecha de creación">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={filtros.created_desde}
                  onChange={(e) => update("created_desde", e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-none outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={filtros.created_hasta}
                  onChange={(e) => update("created_hasta", e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-none outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </Section>

          {/* Fecha límite */}
          <Section label="Fecha límite">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input
                  type="date"
                  value={filtros.fecha_termino_desde}
                  onChange={(e) => update("fecha_termino_desde", e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-none outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input
                  type="date"
                  value={filtros.fecha_termino_hasta}
                  onChange={(e) => update("fecha_termino_hasta", e.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-none outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-border">
          <Button
            className="h-12 w-full rounded-none"
            onClick={() => onOpenChange(false)}
          >
            Ver resultados
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default FilterSheet;
