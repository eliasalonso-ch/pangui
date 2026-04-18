"use client";

import { X, Check, RotateCcw } from "lucide-react";
import type { FiltrosState, Estado, Prioridad, TipoTrabajo, Usuario, Ubicacion, Sociedad } from "@/types/ordenes";

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADOS: { value: Estado; label: string; color: string }[] = [
  { value: "pendiente",   label: "Abierta",     color: "#3B82F6" },
  { value: "en_espera",   label: "En espera",   color: "#F59E0B" },
  { value: "en_curso",    label: "En curso",    color: "#8B5CF6" },
  { value: "en_revision", label: "En revisión", color: "#06B6D4" },
  { value: "completado",  label: "Completada",  color: "#10B981" },
  { value: "cancelado",   label: "Cancelada",   color: "#6B7280" },
];

const PRIORIDADES: { value: Prioridad; label: string; color: string }[] = [
  { value: "urgente", label: "Urgente", color: "#EF4444" },
  { value: "alta",    label: "Alta",    color: "#F97316" },
  { value: "media",   label: "Media",   color: "#3B82F6" },
  { value: "baja",    label: "Baja",    color: "#9CA3AF" },
  { value: "ninguna", label: "Sin prioridad", color: "#9CA3AF" },
];

const TIPOS: { value: TipoTrabajo; label: string }[] = [
  { value: "reactiva",   label: "Reactiva" },
  { value: "preventiva", label: "Preventiva" },
  { value: "inspeccion", label: "Inspección" },
  { value: "mejora",     label: "Mejora" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid #F3F4F6", paddingBottom: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#8594A3", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipGroup<T extends string>({
  options, selected, onToggle,
}: {
  options: { value: T; label: string; color?: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {options.map(o => {
        const active = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(o.value)}
            style={{
              height: 26, padding: "0 9px",
              border: active ? "1.5px solid " + (o.color ?? "#273D88") : "1px solid #E5E7EB",
              borderRadius: 4,
              background: active ? (o.color ?? "#273D88") + "15" : "#fff",
              color: active ? (o.color ?? "#273D88") : "#4D5A66",
              fontSize: 12, fontWeight: active ? 600 : 400,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              transition: "all 0.1s", fontFamily: "inherit",
            }}
          >
            {active && <Check size={10} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  filtros:    FiltrosState;
  onChange:   (f: FiltrosState) => void;
  onClose:    () => void;
  usuarios:   Usuario[];
  ubicaciones:Ubicacion[];
  sociedades: Sociedad[];
}

// ── Component ─────────────────────────────────────────────────────────────────

const EMPTY: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  venceHoy: false,
};

function hasFilters(f: FiltrosState) {
  return (
    f.estados.length > 0 || f.prioridades.length > 0 || f.tipos.length > 0 ||
    f.asignadoIds.length > 0 || f.ubicacionIds.length > 0 || f.sociedadIds.length > 0 ||
    f.venceHoy
  );
}

export default function OTFiltrosPanel({ filtros, onChange, onClose, usuarios, ubicaciones, sociedades }: Props) {
  function set(patch: Partial<FiltrosState>) {
    onChange({ ...filtros, ...patch });
  }

  const activeCount = [
    filtros.estados.length, filtros.prioridades.length, filtros.tipos.length,
    filtros.asignadoIds.length, filtros.ubicacionIds.length, filtros.sociedadIds.length,
    filtros.venceHoy ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 48, borderBottom: "1px solid #E5E7EB", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1E2429" }}>Filtros</span>
          {activeCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", background: "#273D88", color: "#fff", borderRadius: 10 }}>
              {activeCount}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {hasFilters(filtros) && (
            <button
              type="button"
              onClick={() => onChange({ ...EMPTY })}
              style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", border: "1px solid #E5E7EB", borderRadius: 4, background: "#fff", color: "#677888", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              <RotateCcw size={11} />
              Limpiar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #E5E7EB", borderRadius: 4, background: "#fff", cursor: "pointer", color: "#677888" }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>

        {/* Estado */}
        <Section label="Estado">
          <ChipGroup
            options={ESTADOS}
            selected={filtros.estados}
            onToggle={v => set({ estados: toggle(filtros.estados, v) })}
          />
        </Section>

        {/* Prioridad */}
        <Section label="Prioridad">
          <ChipGroup
            options={PRIORIDADES}
            selected={filtros.prioridades}
            onToggle={v => set({ prioridades: toggle(filtros.prioridades, v) })}
          />
        </Section>

        {/* Tipo */}
        <Section label="Tipo de trabajo">
          <ChipGroup
            options={TIPOS}
            selected={filtros.tipos}
            onToggle={v => set({ tipos: toggle(filtros.tipos, v) })}
          />
        </Section>

        {/* Vence hoy */}
        <Section label="Fecha">
          <button
            type="button"
            onClick={() => set({ venceHoy: !filtros.venceHoy })}
            style={{
              height: 26, padding: "0 9px",
              border: filtros.venceHoy ? "1.5px solid #F97316" : "1px solid #E5E7EB",
              borderRadius: 4,
              background: filtros.venceHoy ? "#F9731615" : "#fff",
              color: filtros.venceHoy ? "#F97316" : "#4D5A66",
              fontSize: 12, fontWeight: filtros.venceHoy ? 600 : 400,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              transition: "all 0.1s", fontFamily: "inherit",
            }}
          >
            {filtros.venceHoy && <Check size={10} />}
            Vence hoy
          </button>
        </Section>

        {/* Asignado a */}
        {usuarios.length > 0 && (
          <Section label="Asignado a">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {usuarios.map(u => {
                const active = filtros.asignadoIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => set({ asignadoIds: toggle(filtros.asignadoIds, u.id) })}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", border: "none", borderRadius: 4,
                      background: active ? "#EEF1FB" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: "50%",
                      background: active ? "#273D88" : "#F3F4F6",
                      color: active ? "#fff" : "#677888",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials(u.nombre)}
                    </span>
                    <span style={{ flex: 1, fontSize: 12.5, color: "#1E2429" }}>{u.nombre}</span>
                    {active && <Check size={12} style={{ color: "#273D88", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Ubicación */}
        {ubicaciones.length > 0 && (
          <Section label="Ubicación">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {ubicaciones.map(u => {
                const active = filtros.ubicacionIds.includes(u.id);
                const label = u.edificio + (u.piso ? ` · ${u.piso}` : "");
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => set({ ubicacionIds: toggle(filtros.ubicacionIds, u.id) })}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", border: "none", borderRadius: 4,
                      background: active ? "#EEF1FB" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5, color: "#1E2429" }}>{label}</span>
                    {active && <Check size={12} style={{ color: "#273D88", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Sociedad */}
        {sociedades.length > 0 && (
          <Section label="Sociedad">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sociedades.map(s => {
                const active = filtros.sociedadIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => set({ sociedadIds: toggle(filtros.sociedadIds, s.id) })}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 8px", border: "none", borderRadius: 4,
                      background: active ? "#EEF1FB" : "transparent",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5, color: "#1E2429" }}>{s.nombre}</span>
                    {active && <Check size={12} style={{ color: "#273D88", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

      </div>
    </div>
  );
}
