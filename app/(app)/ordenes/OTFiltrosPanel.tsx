"use client";

import { useState, useRef, useEffect } from "react";
import { X, Check, Trash2, User, UserRoundX, Clock, MapPin, Flag, Search, Zap, Plus, Wrench, Building2, Pause, RotateCw, ArrowUp, ArrowDown, AlertTriangle, Minus, type LucideIcon } from "lucide-react";

import type { FiltrosState, Estado, Prioridad, TipoTrabajo, Usuario, Ubicacion, Sociedad } from "@/types/ordenes";
import { FILTER_META, FILTER_ORDER, type FilterKey, type FilterMeta } from "./filter-registry";

// ── Config ────────────────────────────────────────────────────────────────────

// NOTE: `pendiente` is intentionally NOT offered here. It used to be labelled
// "Sin asignar", but the `pendiente` state covers BOTH unassigned and assigned
// OTs, so it let assigned OTs through. The real "Sin asignar" filter is the
// top-level `sinAsignar` toggle, which filters by having no assignees.
// Mismos íconos y tokens de color que OTRow: el filtro tiene que verse igual
// que la fila que va a devolver. Antes eran puntos de color con hex sueltos,
// que ni coincidían con las filas ni respetaban el tema.
const ESTADOS: { value: Estado; label: string; icon: LucideIcon; color: string }[] = [
  { value: "en_espera",   label: "En espera",   icon: Pause,   color: "var(--st-wait-dot)"     },
  { value: "en_curso",    label: "En curso",    icon: RotateCw, color: "var(--st-progress-dot)" },
  { value: "completado",  label: "Completada",  icon: Check,   color: "var(--st-done-dot)"     },
];

const PRIORIDADES: { value: Prioridad; label: string; icon: LucideIcon; color: string }[] = [
  { value: "urgente", label: "Urgente",       icon: AlertTriangle, color: "var(--pr-urgent)" },
  { value: "alta",    label: "Alta",          icon: ArrowUp,       color: "var(--pr-high)"   },
  { value: "media",   label: "Media",         icon: Minus,         color: "var(--pr-medium)" },
  { value: "baja",    label: "Baja",          icon: ArrowDown,     color: "var(--pr-low)"    },
  { value: "ninguna", label: "Sin prioridad", icon: Minus,         color: "var(--fg-4)"      },
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

// ── Piezas compartidas de los dropdowns ───────────────────────────────────────

/** Casilla de selección. Reemplaza la palomita-cuando-activo del diseño viejo:
 *  así el estado NO seleccionado también es visible. */
function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 15, height: 15, flexShrink: 0, borderRadius: 3,
        border: checked ? "none" : "1.5px solid var(--border-strong, var(--border))",
        background: checked ? "var(--brand)" : "var(--surface-0)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {checked && <Check size={11} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
    </span>
  );
}

/** Fila seleccionable de un dropdown: casilla + contenido + fondo si está activa. */
function OptionRow({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      onClick={onClick}
      style={{
        // `minWidth: 0` deja que el texto largo se recorte con elipsis en vez
        // de estirar la fila: sin esto, un nombre de ubicación largo desborda
        // el ancho del dropdown.
        display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0,
        padding: "8px 12px", background: active ? "var(--brand-tint)" : "transparent",
        border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}
    >
      {children}
      <Checkbox checked={active} />
    </button>
  );
}

/**
 * Buscador con los valores elegidos como fichas removibles adentro, igual que
 * en el diseño de referencia. Ver lo seleccionado sin cerrar el dropdown evita
 * el problema del contador solo: "3" no dice *cuáles* tres.
 */
function TokenSearch({ placeholder, value, onChange, tokens, onRemove, onClearAll }: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  tokens: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  return (
    <div style={{ padding: "6px 8px 4px" }}>
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4,
        minHeight: 30, padding: "3px 6px",
        border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)",
      }}>
        <Search size={12} style={{ color: "var(--fg-4)", flexShrink: 0, marginLeft: 2 }} />
        {tokens.map(t => (
          <span
            key={t.key}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 190,
              padding: "2px 4px 2px 7px", borderRadius: 4,
              background: "var(--brand-tint)", color: "var(--brand)",
              fontSize: 11.5, fontWeight: 600,
            }}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
            <button
              type="button"
              onClick={() => onRemove(t.key)}
              aria-label={`Quitar ${t.label}`}
              style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.7 }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          autoFocus
          placeholder={tokens.length ? "" : placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1, minWidth: 70, fontSize: 12.5, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
        />
        {tokens.length > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            aria-label="Quitar todos"
            style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 2, cursor: "pointer", color: "var(--fg-4)" }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Mensaje de lista vacía, para no repetir el mismo div en cada dropdown. */
function SinResultados() {
  return <div style={{ padding: "8px 12px", fontSize: 12, color: "var(--fg-4)" }}>Sin resultados</div>;
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const EMPTY: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  itos: [],
  fechaVencimiento: null, sinAsignar: false, soloAsignados: false,
  deUsuariosDadosDeBaja: false,
};

// ── Dropdown wrapper ──────────────────────────────────────────────────────────

function FilterDropdown({ label, icon, active, count, onClear, onRemove, children }: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  count: number;
  onClear: () => void;
  /** Quita el filtro de la barra (además de vaciarlo). */
  onRemove?: () => void;
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
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 11px",
          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: 7,
          background: active ? "var(--brand-tint)" : "var(--surface-1)",
          color: active ? "var(--brand)" : "var(--fg-2)",
          fontSize: 12.5, fontWeight: active ? 600 : 500,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {/* El ícono va siempre en azul de marca, también cuando el chip está
            inactivo: es lo que identifica al filtro de un vistazo. */}
        <span style={{ display: "flex", color: "var(--brand)" }}>{icon}</span>
        {label}
        {count > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{count}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          minWidth: 280, maxWidth: 360, background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          {/* Dropdown header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {count > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  style={{ fontSize: 11, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                >
                  Limpiar
                </button>
              )}
              {/* Papelera = quitar el filtro de la barra, como en el diseño de
                  referencia. Distinta de "Limpiar", que solo vacía los valores. */}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => { setOpen(false); onRemove(); }}
                  title="Quitar filtro"
                  aria-label="Quitar filtro"
                  style={{ display: "flex", alignItems: "center", color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 2 }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Catálogo "+ Añadir filtro" ────────────────────────────────────────────────

/** Popover buscable con los filtros que todavía no están en la barra. */
function AddFilterMenu({ available, onAdd }: {
  available: FilterMeta[];
  onAdd: (key: FilterKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (available.length === 0) return null;
  const shown = available.filter(m => m.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 5, height: 32, padding: "0 11px",
          border: "1px dashed var(--border)", borderRadius: 7,
          background: "transparent", color: "var(--fg-3)",
          fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <Plus size={15} />
        Añadir filtro
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          minWidth: 240, background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 8px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-0)" }}>
              <Search size={12} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
              <input
                autoFocus
                placeholder="Buscar…"
                value={q}
                onChange={e => setQ(e.target.value)}
                style={{ flex: 1, fontSize: 12.5, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
              />
            </div>
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", padding: "2px 0 6px" }}>
            {shown.map(m => (
              <button
                key={m.key}
                type="button"
                onClick={() => { onAdd(m.key); setOpen(false); setQ(""); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <span style={{ color: "var(--brand)", display: "flex" }}>{FILTER_ICONS[m.key]}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
              </button>
            ))}
            {shown.length === 0 && <SinResultados />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ícono por filtro. Vive acá porque es presentación, no lógica de filtrado. */
const FILTER_ICONS: Record<FilterKey, React.ReactNode> = {
  asignadoIds:      <User size={15} />,
  sinAsignar:       <UserRoundX size={15} />,
  fechaVencimiento: <Clock size={15} />,
  ubicacionIds:     <MapPin size={15} />,
  itos:             <Zap size={15} />,
  prioridades:      <Flag size={15} />,
  estados:          <Check size={15} />,
  tipos:            <Wrench size={15} />,
  sociedadIds:      <Building2 size={15} />,
};

// ── FilterBar (inline toolbar) ────────────────────────────────────────────────

interface FilterBarProps {
  filtros: FiltrosState;
  onChange: (f: FiltrosState) => void;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  sociedades: Sociedad[];
  /** Valores de ITO presentes en el workspace, ya deduplicados y ordenados. */
  itos: string[];
  /** Filtros visibles en la barra, en orden. */
  visibleKeys: FilterKey[];
  onVisibleKeysChange: (keys: FilterKey[]) => void;
}

export function FilterBar({ filtros, onChange, usuarios, ubicaciones, sociedades, itos, visibleKeys, onVisibleKeysChange }: FilterBarProps) {
  const [userSearch, setUserSearch]  = useState("");
  const [ubicSearch, setUbicSearch]  = useState("");
  const [socSearch,  setSocSearch]   = useState("");
  const [itoSearch,  setItoSearch]   = useState("");

  function set(patch: Partial<FiltrosState>) {
    onChange({ ...filtros, ...patch });
  }

  const shown = new Set(visibleKeys);
  const addFilter = (key: FilterKey) => {
    if (shown.has(key)) return;
    onVisibleKeysChange(FILTER_ORDER.filter(k => shown.has(k) || k === key));
  };
  /**
   * Quitar un filtro de la barra TAMBIÉN lo vacía: si se ocultara con valores
   * puestos, seguiría recortando la lista sin ningún control visible que lo
   * explicara — resultados incompletos sin causa aparente.
   */
  const removeFilter = (key: FilterKey) => {
    onChange({ ...filtros, ...FILTER_META[key].clear(filtros) });
    onVisibleKeysChange(visibleKeys.filter(k => k !== key));
  };
  const available = FILTER_ORDER.filter(k => !shown.has(k)).map(k => FILTER_META[k]);

  const totalActive =
    filtros.asignadoIds.length + filtros.ubicacionIds.length +
    filtros.prioridades.length + filtros.estados.length +
    filtros.tipos.length + filtros.sociedadIds.length +
    filtros.itos.length +
    (filtros.fechaVencimiento ? 1 : 0) + (filtros.sinAsignar ? 1 : 0);

  const filteredUsers = usuarios.filter(u => u.nombre.toLowerCase().includes(userSearch.toLowerCase()));
  const filteredUbic  = ubicaciones.filter(u => (u.edificio + (u.detalle ?? "")).toLowerCase().includes(ubicSearch.toLowerCase()));
  const filteredSoc   = sociedades.filter(s => s.nombre.toLowerCase().includes(socSearch.toLowerCase()));
  const filteredItos  = itos.filter(i => i.toLowerCase().includes(itoSearch.toLowerCase()));

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: "1 1 auto", minWidth: 0 }}>

      {/* ── Sin asignar ── */}
      {shown.has("sinAsignar") && (
      <button
        type="button"
        onClick={() => set({ sinAsignar: !filtros.sinAsignar })}
        aria-pressed={filtros.sinAsignar}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 11px",
          border: filtros.sinAsignar ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: 7,
          background: filtros.sinAsignar ? "var(--brand-tint)" : "var(--surface-1)",
          color: filtros.sinAsignar ? "var(--brand)" : "var(--fg-2)",
          fontSize: 12.5, fontWeight: filtros.sinAsignar ? 600 : 500,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", color: "var(--brand)" }}>{FILTER_ICONS.sinAsignar}</span>
        Sin asignar
        {filtros.sinAsignar && <Check size={11} />}
      </button>
      )}

      {/* ── Asignado a ── */}
      {shown.has("asignadoIds") && (
      <FilterDropdown
        label="Asignado a"
        icon={FILTER_ICONS.asignadoIds}
        active={filtros.asignadoIds.length > 0}
        count={filtros.asignadoIds.length}
        onClear={() => set({ asignadoIds: [] })}
        onRemove={() => removeFilter("asignadoIds")}
      >
        <TokenSearch
          placeholder="Buscar usuario…"
          value={userSearch}
          onChange={setUserSearch}
          tokens={filtros.asignadoIds.map(id => ({ key: id, label: usuarios.find(u => u.id === id)?.nombre ?? id }))}
          onRemove={id => set({ asignadoIds: filtros.asignadoIds.filter(x => x !== id) })}
          onClearAll={() => set({ asignadoIds: [] })}
        />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>
          {filteredUsers.map(u => {
            const active = filtros.asignadoIds.includes(u.id);
            return (
              <OptionRow key={u.id} active={active} onClick={() => set({ asignadoIds: toggle(filtros.asignadoIds, u.id) })}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: active ? "var(--brand)" : "var(--surface-hover)", color: active ? "var(--fg-on-brand)" : "var(--fg-2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                  {initials(u.nombre)}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nombre}</span>
              </OptionRow>
            );
          })}
          {filteredUsers.length === 0 && <SinResultados />}
        </div>
      </FilterDropdown>
      )}

      {/* ── De usuarios dados de baja ──
          Solo aparece si el workspace tiene alguno: en la mayoria el boton
          seria ruido permanente. Sirve para encontrar de una vez el trabajo
          que quedo asignado a alguien que ya no esta. */}
      {usuarios.some(u => u.deleted_at) && (
        <button
          type="button"
          onClick={() => set({ deUsuariosDadosDeBaja: !filtros.deUsuariosDadosDeBaja })}
          aria-pressed={filtros.deUsuariosDadosDeBaja}
          title="OTs asignadas a usuarios que fueron dados de baja"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 32, padding: "0 11px",
            border: filtros.deUsuariosDadosDeBaja ? "1.5px solid var(--brand)" : "1px solid var(--border)",
            borderRadius: 7,
            background: filtros.deUsuariosDadosDeBaja ? "var(--brand-tint)" : "var(--surface-1)",
            color: filtros.deUsuariosDadosDeBaja ? "var(--brand)" : "var(--fg-2)",
            fontSize: 12.5, fontWeight: filtros.deUsuariosDadosDeBaja ? 600 : 500,
            cursor: "pointer", fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          <UserRoundX size={15} style={{ color: "var(--brand)" }} />
          Dados de baja
          {filtros.deUsuariosDadosDeBaja && <Check size={11} />}
        </button>
      )}

      {/* ── Fecha de vencimiento ── */}
      {shown.has("fechaVencimiento") && (
      <FilterDropdown
        label="Fecha de vencimiento"
        icon={FILTER_ICONS.fechaVencimiento}
        active={filtros.fechaVencimiento !== null}
        count={filtros.fechaVencimiento ? 1 : 0}
        onClear={() => set({ fechaVencimiento: null })}
        onRemove={() => removeFilter("fechaVencimiento")}
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
      )}

      {/* ── Ubicación ── */}
      {shown.has("ubicacionIds") && (
      <FilterDropdown
        label="Ubicación"
        icon={FILTER_ICONS.ubicacionIds}
        active={filtros.ubicacionIds.length > 0}
        count={filtros.ubicacionIds.length}
        onClear={() => set({ ubicacionIds: [] })}
        onRemove={() => removeFilter("ubicacionIds")}
      >
        <TokenSearch
          placeholder="Buscar ubicación…"
          value={ubicSearch}
          onChange={setUbicSearch}
          tokens={filtros.ubicacionIds.map(id => {
            const u = ubicaciones.find(x => x.id === id);
            return { key: id, label: u ? u.edificio + (u.detalle ? ` · ${u.detalle}` : "") : id };
          })}
          onRemove={id => set({ ubicacionIds: filtros.ubicacionIds.filter(x => x !== id) })}
          onClearAll={() => set({ ubicacionIds: [] })}
        />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>
          {filteredUbic.map(u => (
            <OptionRow key={u.id} active={filtros.ubicacionIds.includes(u.id)} onClick={() => set({ ubicacionIds: toggle(filtros.ubicacionIds, u.id) })}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.edificio + (u.detalle ? ` · ${u.detalle}` : "")}</span>
            </OptionRow>
          ))}
          {filteredUbic.length === 0 && <SinResultados />}
        </div>
      </FilterDropdown>
      )}

      {/* ── ITO ──
          Ademas de estar en la barra, exige que el workspace tenga ITOs: si no,
          el dropdown estaria siempre vacio. */}
      {shown.has("itos") && itos.length > 0 && (
      <FilterDropdown
        label="ITO"
        icon={FILTER_ICONS.itos}
        active={filtros.itos.length > 0}
        count={filtros.itos.length}
        onClear={() => set({ itos: [] })}
        onRemove={() => removeFilter("itos")}
      >
        <TokenSearch
          placeholder="Buscar ITO…"
          value={itoSearch}
          onChange={setItoSearch}
          tokens={filtros.itos.map(i => ({ key: i, label: i }))}
          onRemove={i => set({ itos: filtros.itos.filter(x => x !== i) })}
          onClearAll={() => set({ itos: [] })}
        />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>
          {filteredItos.map(ito => (
            <OptionRow key={ito} active={filtros.itos.includes(ito)} onClick={() => set({ itos: toggle(filtros.itos, ito) })}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ito}</span>
            </OptionRow>
          ))}
          {filteredItos.length === 0 && <SinResultados />}
        </div>
      </FilterDropdown>
      )}

      {/* ── Prioridad ── */}
      {shown.has("prioridades") && (
      <FilterDropdown
        label="Prioridad"
        icon={FILTER_ICONS.prioridades}
        active={filtros.prioridades.length > 0}
        count={filtros.prioridades.length}
        onClear={() => set({ prioridades: [] })}
        onRemove={() => removeFilter("prioridades")}
      >
        <div style={{ padding: "6px 0 8px" }}>
          {PRIORIDADES.map(p => (
            <OptionRow key={p.value} active={filtros.prioridades.includes(p.value)} onClick={() => set({ prioridades: toggle(filtros.prioridades, p.value) })}>
              <p.icon size={15} style={{ color: p.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</span>
            </OptionRow>
          ))}
        </div>
      </FilterDropdown>
      )}

      {/* ── Estado ── */}
      {shown.has("estados") && (
      <FilterDropdown
        label="Estado"
        icon={FILTER_ICONS.estados}
        active={filtros.estados.length > 0}
        count={filtros.estados.length}
        onClear={() => set({ estados: [] })}
        onRemove={() => removeFilter("estados")}
      >
        <div style={{ padding: "6px 0 8px" }}>
          {ESTADOS.map(e => (
            <OptionRow key={e.value} active={filtros.estados.includes(e.value)} onClick={() => set({ estados: toggle(filtros.estados, e.value) })}>
              <e.icon size={15} style={{ color: e.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
            </OptionRow>
          ))}
        </div>
      </FilterDropdown>
      )}

      {/* ── Tipo de trabajo ── */}
      {shown.has("tipos") && (
      <FilterDropdown
        label="Tipo de trabajo"
        icon={FILTER_ICONS.tipos}
        active={filtros.tipos.length > 0}
        count={filtros.tipos.length}
        onClear={() => set({ tipos: [] })}
        onRemove={() => removeFilter("tipos")}
      >
        <div style={{ padding: "6px 0 8px" }}>
          {TIPOS.map(t => (
            <OptionRow key={t.value} active={filtros.tipos.includes(t.value)} onClick={() => set({ tipos: toggle(filtros.tipos, t.value) })}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
            </OptionRow>
          ))}
        </div>
      </FilterDropdown>
      )}

      {/* ── Sociedad ── */}
      {shown.has("sociedadIds") && sociedades.length > 0 && (
        <FilterDropdown
          label="Sociedad"
          icon={FILTER_ICONS.sociedadIds}
          active={filtros.sociedadIds.length > 0}
          count={filtros.sociedadIds.length}
          onClear={() => set({ sociedadIds: [] })}
          onRemove={() => removeFilter("sociedadIds")}
        >
          <TokenSearch
            placeholder="Buscar sociedad…"
            value={socSearch}
            onChange={setSocSearch}
            tokens={filtros.sociedadIds.map(id => ({ key: id, label: sociedades.find(x => x.id === id)?.nombre ?? id }))}
            onRemove={id => set({ sociedadIds: filtros.sociedadIds.filter(x => x !== id) })}
            onClearAll={() => set({ sociedadIds: [] })}
          />
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>
            {filteredSoc.map(s => (
              <OptionRow key={s.id} active={filtros.sociedadIds.includes(s.id)} onClick={() => set({ sociedadIds: toggle(filtros.sociedadIds, s.id) })}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.nombre}</span>
              </OptionRow>
            ))}
            {filteredSoc.length === 0 && <SinResultados />}
          </div>
        </FilterDropdown>
      )}

      {/* ── + Añadir filtro ── */}
      <AddFilterMenu available={available} onAdd={addFilter} />

      {/* ── Limpiar todo ──
          Al final de la fila de chips. Solo aparece cuando hay algo que
          limpiar: un botón de "borrar" siempre visible pero inerte no comunica
          nada. */}
      {totalActive > 0 && (
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY })}
          style={{
            // Sin padding horizontal: el contenedor ya aporta `gap: 6`, y un
            // padding propio se sumaba a ese gap, dejando este botón más
            // separado del último chip que los chips entre sí.
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 32, padding: 0, flexShrink: 0,
            border: "none", background: "none", color: "var(--brand)",
            fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          Limpiar filtros
        </button>
      )}

      </div>

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
