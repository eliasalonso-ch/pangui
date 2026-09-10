"use client";

import { useState, useEffect, useRef } from "react";
import { X, Check, Trash2, Search, Plus } from "lucide-react";

/**
 * Piezas compartidas de la barra de filtros.
 *
 * Vivian dentro de OTFiltrosPanel, privadas: solo `FilterBar` se exportaba, y
 * esa esta amarrada a los tipos de OT (FiltrosState, Estado, Prioridad), asi
 * que /ordenes-compra y /proveedores no podian reusar nada sin copiar los
 * dropdowns enteros. Aca no hay dominio: cada pantalla arma su registro de
 * filtros y usa estas piezas para dibujarlo.
 *
 * Las decisiones de diseno se conservan tal cual estaban, con sus razones:
 * la casilla que tambien muestra el estado NO seleccionado, las fichas dentro
 * del buscador, y el icono siempre azul aunque el chip este inactivo.
 */

/** Casilla de selección. Reemplaza la palomita-cuando-activo del diseño viejo:
 *  así el estado NO seleccionado también es visible. */
export function Checkbox({ checked }: { checked: boolean }) {
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
export function OptionRow({ active, onClick, children }: {
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
export function TokenSearch({ placeholder, value, onChange, tokens, onRemove, onClearAll }: {
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
              fontSize: 14, fontWeight: 400,
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
          style={{ flex: 1, minWidth: 70, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
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
export function SinResultados() {
  return <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>;
}

/**
 * Contenedor con scroll de las opciones.
 *
 * Sin virtualizar y a proposito: el tope de alto mas el buscador es lo que hace
 * usable una lista larga, y es lo que ya usa /ordenes. Meter una ventana
 * virtual aca seria complejidad sin problema que resolver — las listas mas
 * largas (materiales, proveedores) son cientos de filas, no miles.
 */
export function OptionList({ children }: { children: React.ReactNode }) {
  return <div style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>{children}</div>;
}

// ── Dropdown wrapper ──────────────────────────────────────────────────────────

export function FilterDropdown({ label, icon, active, count, onClear, onRemove, children }: {
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
          height: 34, padding: "0 11px",
          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          background: active ? "var(--brand-tint)" : "var(--surface-1)",
          color: active ? "var(--brand)" : "var(--fg-2)",
          fontSize: 14, fontWeight: 400,
          cursor: "pointer", fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        {/* El ícono va siempre en azul de marca, también cuando el chip está
            inactivo: es lo que identifica al filtro de un vistazo. */}
        <span style={{ display: "flex", color: "var(--brand)" }}>{icon}</span>
        {label}
        {count > 0 && (
          <span style={{ fontSize: 14, fontWeight: 400, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{count}</span>
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
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", letterSpacing: "0.01em" }}>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {count > 0 && (
                <button
                  type="button"
                  onClick={onClear}
                  style={{ fontSize: 14, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
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
export function AddFilterMenu<K extends string>({ available, icons, onAdd }: {
  available: { key: K; label: string }[];
  icons: Record<K, React.ReactNode>;
  onAdd: (key: K) => void;
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
          display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px",
          border: "1px dashed var(--border)", borderRadius: "var(--r-sm)",
          background: "transparent", color: "var(--fg-3)",
          fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <Plus size={16} />
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
                style={{ flex: 1, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit" }}
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
                <span style={{ color: "var(--brand)", display: "flex" }}>{icons[m.key]}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
              </button>
            ))}
            {shown.length === 0 && <SinResultados />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Alterna un valor en un array de seleccionados. */
export function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}
