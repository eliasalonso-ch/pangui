"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * Desplegable de una sola opción (el período), con el aspecto de los
 * desplegables de la app en vez del <select> nativo: misma caja, mismo panel
 * flotante. Alto 40 para quedar parejo con los DatePicker que van al lado.
 * `anchoCompleto`: ocupa el ancho del campo, como los demás de un formulario.
 */
// Alto máximo de la lista: con más opciones, scroll en vez de crecer sin fin.
const LISTA_MAX = 280;

export function Desplegable<T extends string>({ value, opciones, onChange, ariaLabel, anchoCompleto = false, placeholder = "Seleccionar", disabled = false, alto = 40 }: {
  value: T;
  opciones: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  anchoCompleto?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** 34 para ir en una barra de filtros, junto a los chips. */
  alto?: number;
}) {
  const [open, setOpen] = useState(false);
  // Cerca del borde inferior (p. ej. sobre el pie de un formulario) la lista
  // se abre hacia arriba en vez de quedar tapada.
  const [arriba, setArriba] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actual = opciones.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (!open && ref.current) {
            const r = ref.current.getBoundingClientRect();
            const abajo = window.innerHeight - r.bottom;
            setArriba(abajo < LISTA_MAX + 80 && r.top > abajo);
          }
          setOpen(o => !o);
        }}
        style={{
          display: "flex", alignItems: "center", gap: 8, height: alto, padding: "0 12px",
          width: anchoCompleto ? "100%" : undefined, justifyContent: "space-between", textAlign: "left",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`, borderRadius: "var(--r-sm)",
          background: "var(--surface-1)", color: "var(--fg-1)",
          fontSize: 14, fontWeight: 400, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {actual ? actual.label : <span style={{ color: "var(--fg-4)" }}>{placeholder}</span>}
        <ChevronDown size={16} style={{ color: "var(--brand)" }} />
      </button>
      {open && (
        <div role="listbox" style={{
          position: "absolute", right: 0, left: anchoCompleto ? 0 : undefined, zIndex: 200, minWidth: "100%",
          ...(arriba ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
          maxHeight: LISTA_MAX, overflowY: "auto",
          padding: "4px 0", background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "var(--shadow-md)",
        }}>
          {opciones.map(o => {
            const sel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                disabled={o.disabled}
                onClick={() => { onChange(o.value); setOpen(false); }}
                onMouseEnter={e => { if (!sel && !o.disabled) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px",
                  border: "none", textAlign: "left", whiteSpace: "nowrap", fontFamily: "inherit", fontSize: 14,
                  cursor: o.disabled ? "default" : "pointer",
                  background: sel ? "var(--brand-tint)" : "transparent",
                  color: o.disabled ? "var(--fg-4)" : sel ? "var(--brand)" : "var(--fg-1)",
                }}
              >
                <span style={{ flex: 1 }}>{o.label}</span>
                {sel && <Check size={13} style={{ color: "var(--brand)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
