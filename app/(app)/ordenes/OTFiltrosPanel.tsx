"use client";

import { useState, useRef, useEffect } from "react";
import { X, Check, RotateCcw, User, Clock, MapPin, Flag, Plus, ChevronDown, Search } from "lucide-react";
import type { FiltrosState, Estado, Prioridad, TipoTrabajo, Usuario, Ubicacion, Sociedad } from "@/types/ordenes";

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADOS: { value: Estado; label: string; color: string }[] = [
  { value: "pendiente",   label: "Sin asignar", color: "#3B82F6" },
  { value: "en_espera",   label: "En espera",   color: "#F59E0B" },
  { value: "en_curso",    label: "En curso",    color: "#8B5CF6" },
  { value: "completado",  label: "Completada",  color: "#10B981" },
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
  { value: "emergencia", label: "Emergencia" },
  { value: "presupuesto", label: "Presupuesto" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const EMPTY: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  fechaVencimiento: null, sinAsignar: false, soloAsignados: false,
};

// ── Dropdown wrapper ──────────────────────────────────────────────────────────

function FilterDropdown({ label, icon, active, count, onClear, children }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          height: 28, padding: "0 10px",
          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: 6,
          background: active ? "var(--brand-tint)" : "var(--surface-1)",
          color: active ? "var(--brand)" : "var(--fg-2)",
          fontSize: 12, fontWeight: active ? 600 : 500,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {icon}
        {label}
        {count > 0
          ? <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{count}</span>
          : <ChevronDown size={11} style={{ opacity: 0.5 }} />
        }
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          minWidth: 220, background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          {/* Dropdown header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
            {count > 0 && (
              <button
                type="button"
                onClick={onClear}
                style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                <RotateCcw size={10} />
                Limpiar
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

// ── FilterBar (inline toolbar) ────────────────────────────────────────────────

interface FilterBarProps {
  filtros: FiltrosState;
  onChange: (f: FiltrosState) => void;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  sociedades: Sociedad[];
}

export function FilterBar({ filtros, onChange, usuarios, ubicaciones, sociedades }: FilterBarProps) {
  const [extraOpen, setExtraOpen] = useState(false);
  const extraRef = useRef<HTMLDivElement>(null);

  const [userSearch, setUserSearch]  = useState("");
  const [ubicSearch, setUbicSearch]  = useState("");
  const [socSearch,  setSocSearch]   = useState("");

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (extraRef.current && !extraRef.current.contains(e.target as Node)) setExtraOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function set(patch: Partial<FiltrosState>) {
    onChange({ ...filtros, ...patch });
  }

  const totalActive =
    filtros.asignadoIds.length + filtros.ubicacionIds.length +
    filtros.prioridades.length + filtros.estados.length +
    filtros.tipos.length + filtros.sociedadIds.length +
    (filtros.fechaVencimiento ? 1 : 0) + (filtros.sinAsignar ? 1 : 0);

  const extraCount =
    filtros.estados.length + filtros.tipos.length + filtros.sociedadIds.length +
    (filtros.sinAsignar ? 1 : 0);

  const filteredUsers = usuarios.filter(u => u.nombre.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredUbic  = ubicaciones.filter(u => (u.edificio + (u.detalle ?? "")).toLowerCase().includes(ubicSearch.toLowerCase()));
  const filteredSoc   = sociedades.filter(s => s.nombre.toLowerCase().includes(socSearch.toLowerCase()));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>

      {/* ── Asignado a ── */}
      <FilterDropdown
        label="Asignado a"
        icon={<User size={12} />}
        active={filtros.asignadoIds.length > 0}
        count={filtros.asignadoIds.length}
        onClear={() => set({ asignadoIds: [] })}
      >
        <div style={{ padding: "6px 8px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
            <Search size={12} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
            <input
              autoFocus
              placeholder="Buscar usuario…"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              style={{ flex: 1, fontSize: 12.5, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", padding: "2px 0 6px" }}>
          {filteredUsers.map(u => {
            const active = filtros.asignadoIds.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => set({ asignadoIds: toggle(filtros.asignadoIds, u.id) })}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? "var(--brand)" : "var(--surface-hover)", color: active ? "var(--fg-on-brand)" : "var(--fg-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                  {initials(u.nombre)}
                </span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", textAlign: "left" }}>{u.nombre}</span>
                {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
              </button>
            );
          })}
          {filteredUsers.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-4)" }}>Sin resultados</div>}
        </div>
      </FilterDropdown>

      {/* ── Fecha de vencimiento ── */}
      <FilterDropdown
        label="Fecha de vencimiento"
        icon={<Clock size={12} />}
        active={filtros.fechaVencimiento !== null}
        count={filtros.fechaVencimiento ? 1 : 0}
        onClear={() => set({ fechaVencimiento: null })}
      >
        <div style={{ padding: "6px 0 8px" }}>
          {([
            { value: "hoy",       label: "Hoy" },
            { value: "manana",    label: "Mañana" },
            { value: "7dias",     label: "Próximos 7 días" },
            { value: "30dias",    label: "Próximos 30 días" },
            { value: "este_mes",  label: "Este mes" },
            { value: "vencidas",  label: "Vencidas" },
          ] as const).map(opt => {
            const active = filtros.fechaVencimiento === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => set({ fechaVencimiento: active ? null : opt.value })}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ fontSize: 13, color: "var(--fg-1)", flex: 1, textAlign: "left" }}>{opt.label}</span>
                {active && <Check size={12} style={{ color: "var(--brand)" }} />}
              </button>
            );
          })}
        </div>
      </FilterDropdown>

      {/* ── Ubicación ── */}
      <FilterDropdown
        label="Ubicación"
        icon={<MapPin size={12} />}
        active={filtros.ubicacionIds.length > 0}
        count={filtros.ubicacionIds.length}
        onClear={() => set({ ubicacionIds: [] })}
      >
        <div style={{ padding: "6px 8px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
            <Search size={12} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
            <input
              autoFocus
              placeholder="Buscar ubicación…"
              value={ubicSearch}
              onChange={e => setUbicSearch(e.target.value)}
              style={{ flex: 1, fontSize: 12.5, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
            />
          </div>
        </div>
        <div style={{ maxHeight: 220, overflowY: "auto", padding: "2px 0 6px" }}>
          {filteredUbic.map(u => {
            const active = filtros.ubicacionIds.includes(u.id);
            const label = u.edificio + (u.detalle ? ` · ${u.detalle}` : "");
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => set({ ubicacionIds: toggle(filtros.ubicacionIds, u.id) })}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", textAlign: "left" }}>{label}</span>
                {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
              </button>
            );
          })}
          {filteredUbic.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-4)" }}>Sin resultados</div>}
        </div>
      </FilterDropdown>

      {/* ── Prioridad ── */}
      <FilterDropdown
        label="Prioridad"
        icon={<Flag size={12} />}
        active={filtros.prioridades.length > 0}
        count={filtros.prioridades.length}
        onClear={() => set({ prioridades: [] })}
      >
        <div style={{ padding: "6px 0 8px" }}>
          {PRIORIDADES.map(p => {
            const active = filtros.prioridades.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => set({ prioridades: toggle(filtros.prioridades, p.value) })}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", textAlign: "left" }}>{p.label}</span>
                {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      </FilterDropdown>

      {/* ── + Añadir filtro ── */}
      <div ref={extraRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setExtraOpen(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            height: 28, padding: "0 10px",
            border: extraCount > 0 ? "1.5px solid var(--brand)" : "1px dashed var(--border)",
            borderRadius: 6,
            background: extraCount > 0 ? "var(--brand-tint)" : "var(--surface-1)",
            color: extraCount > 0 ? "var(--brand)" : "var(--fg-3)",
            fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Plus size={12} />
          Añadir filtro
          {extraCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {extraCount}
            </span>
          )}
        </button>

        {extraOpen && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
            width: 260, background: "var(--surface-1)",
            border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "var(--shadow-md)", overflow: "hidden",
          }}>

            {/* Estado */}
            <div style={{ padding: "8px 12px 4px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Estado</span>
                {filtros.estados.length > 0 && (
                  <button type="button" onClick={() => set({ estados: [] })} style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Limpiar</button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingBottom: 8 }}>
                {ESTADOS.map(e => {
                  const active = filtros.estados.includes(e.value);
                  return (
                    <button
                      key={e.value}
                      type="button"
                      onClick={() => set({ estados: toggle(filtros.estados, e.value) })}
                      style={{ height: 24, padding: "0 8px", border: active ? `1.5px solid ${e.color}` : "1px solid var(--border)", borderRadius: 4, background: active ? e.color + "20" : "var(--surface-1)", color: active ? e.color : "var(--fg-2)", fontSize: 11.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      {active && <Check size={9} />}{e.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tipo de trabajo */}
            <div style={{ padding: "8px 12px 4px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tipo de trabajo</span>
                {filtros.tipos.length > 0 && (
                  <button type="button" onClick={() => set({ tipos: [] })} style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Limpiar</button>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingBottom: 8 }}>
                {TIPOS.map(t => {
                  const active = filtros.tipos.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => set({ tipos: toggle(filtros.tipos, t.value) })}
                      style={{ height: 24, padding: "0 8px", border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)", borderRadius: 4, background: active ? "var(--brand-tint)" : "var(--surface-1)", color: active ? "var(--brand)" : "var(--fg-2)", fontSize: 11.5, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      {active && <Check size={9} />}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sociedad */}
            {sociedades.length > 0 && (
              <div style={{ padding: "8px 12px 4px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Sociedad</span>
                  {filtros.sociedadIds.length > 0 && (
                    <button type="button" onClick={() => set({ sociedadIds: [] })} style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Limpiar</button>
                  )}
                </div>
                <div style={{ padding: "2px 0", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)", marginBottom: 4 }}>
                    <Search size={11} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                    <input
                      placeholder="Buscar sociedad…"
                      value={socSearch}
                      onChange={e => setSocSearch(e.target.value)}
                      style={{ flex: 1, fontSize: 12, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
                    />
                  </div>
                  {filteredSoc.map(s => {
                    const active = filtros.sociedadIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => set({ sociedadIds: toggle(filtros.sociedadIds, s.id) })}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 4px", background: active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", borderRadius: 4, fontFamily: "inherit" }}
                      >
                        <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", textAlign: "left" }}>{s.nombre}</span>
                        {active && <Check size={12} style={{ color: "var(--brand)" }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Otros */}
            <div style={{ padding: "8px 12px 8px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>Otros</span>
              {[
                { key: "sinAsignar", label: "Sin asignar", active: filtros.sinAsignar },
              ].map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => set({ [opt.key]: !opt.active } as Partial<FiltrosState>)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 4px", background: opt.active ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", borderRadius: 4, fontFamily: "inherit" }}
                >
                  <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)", textAlign: "left" }}>{opt.label}</span>
                  {opt.active && <Check size={12} style={{ color: "var(--brand)" }} />}
                </button>
              ))}
            </div>

          </div>
        )}
      </div>

      {/* Clear all */}
      {totalActive > 0 && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY })}
          style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", border: "none", background: "none", color: "var(--fg-4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; }}
        >
          <X size={11} />
          Limpiar todo
        </button>
      )}

    </div>
  );
}

// ── Legacy panel (kept for potential reuse) ───────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
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
              border: active ? "1.5px solid " + (o.color ?? "var(--brand)") : "1px solid var(--border)",
              borderRadius: 4,
              background: active ? (o.color ? o.color + "20" : "var(--brand-tint)") : "var(--surface-1)",
              color: active ? (o.color ?? "var(--brand)") : "var(--fg-2)",
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

interface Props {
  filtros:    FiltrosState;
  onChange:   (f: FiltrosState) => void;
  onClose:    () => void;
  usuarios:   Usuario[];
  ubicaciones:Ubicacion[];
  sociedades: Sociedad[];
}

export default function OTFiltrosPanel({ filtros, onChange, onClose, usuarios, ubicaciones, sociedades }: Props) {
  function set(patch: Partial<FiltrosState>) {
    onChange({ ...filtros, ...patch });
  }

  const activeCount = [
    filtros.estados.length, filtros.prioridades.length, filtros.tipos.length,
    filtros.asignadoIds.length, filtros.ubicacionIds.length, filtros.sociedadIds.length,
    filtros.fechaVencimiento ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-1)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 48, borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>Filtros</span>
          {activeCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "1px 7px", background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: 10 }}>{activeCount}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {activeCount > 0 && (
            <button type="button" onClick={() => onChange({ ...EMPTY })} style={{ display: "flex", alignItems: "center", gap: 4, height: 28, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface-1)", color: "var(--fg-3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              <RotateCcw size={11} />Limpiar
            </button>
          )}
          <button type="button" onClick={onClose} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: 4, background: "var(--surface-1)", cursor: "pointer", color: "var(--fg-3)" }}>
            <X size={13} />
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>
        <Section label="Estado"><ChipGroup options={ESTADOS} selected={filtros.estados} onToggle={v => set({ estados: toggle(filtros.estados, v) })} /></Section>
        <Section label="Prioridad"><ChipGroup options={PRIORIDADES} selected={filtros.prioridades} onToggle={v => set({ prioridades: toggle(filtros.prioridades, v) })} /></Section>
        <Section label="Tipo de trabajo"><ChipGroup options={TIPOS} selected={filtros.tipos} onToggle={v => set({ tipos: toggle(filtros.tipos, v) })} /></Section>
        <Section label="Fecha de vencimiento">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {([
              { value: "hoy", label: "Hoy" },
              { value: "manana", label: "Mañana" },
              { value: "7dias", label: "7 días" },
              { value: "30dias", label: "30 días" },
              { value: "este_mes", label: "Este mes" },
              { value: "vencidas", label: "Vencidas" },
            ] as const).map(opt => {
              const active = filtros.fechaVencimiento === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => set({ fechaVencimiento: active ? null : opt.value })} style={{ height: 26, padding: "0 9px", border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)", borderRadius: 4, background: active ? "var(--brand-tint)" : "var(--surface-1)", color: active ? "var(--brand)" : "var(--fg-2)", fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                  {active && <Check size={10} />}{opt.label}
                </button>
              );
            })}
          </div>
        </Section>
        {usuarios.length > 0 && (
          <Section label="Asignado a">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {usuarios.map(u => {
                const active = filtros.asignadoIds.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => set({ asignadoIds: toggle(filtros.asignadoIds, u.id) })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 4, background: active ? "var(--brand-tint)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: active ? "var(--brand)" : "var(--surface-hover)", color: active ? "var(--fg-on-brand)" : "var(--fg-3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{initials(u.nombre)}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)" }}>{u.nombre}</span>
                    {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}
        {ubicaciones.length > 0 && (
          <Section label="Ubicación">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {ubicaciones.map(u => {
                const active = filtros.ubicacionIds.includes(u.id);
                const label = u.edificio + (u.detalle ? ` · ${u.detalle}` : "");
                return (
                  <button key={u.id} type="button" onClick={() => set({ ubicacionIds: toggle(filtros.ubicacionIds, u.id) })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 4, background: active ? "var(--brand-tint)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)" }}>{label}</span>
                    {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          </Section>
        )}
        {sociedades.length > 0 && (
          <Section label="Sociedad">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {sociedades.map(s => {
                const active = filtros.sociedadIds.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => set({ sociedadIds: toggle(filtros.sociedadIds, s.id) })} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 4, background: active ? "var(--brand-tint)" : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ flex: 1, fontSize: 12.5, color: "var(--fg-1)" }}>{s.nombre}</span>
                    {active && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
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
