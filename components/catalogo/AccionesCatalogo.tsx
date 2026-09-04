"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil, MoreVertical, Trash2 } from "lucide-react";

/**
 * Botones "Editar" + menú ⋮ de la ficha de un catálogo.
 *
 * Copia el tratamiento del encabezado de `OTDetail`: botón sólido de marca de
 * 34px con el lápiz, y a su derecha el ⋮ contorneado del mismo alto, con
 * "Eliminar" adentro. Se comparte entre Categorías e ITOs para que estén en el
 * mismo lugar y se vean igual en ambas.
 */
export default function AccionesCatalogo({ puedeEditar, puedeEliminar, onEdit, onDelete }: {
  puedeEditar: boolean;
  puedeEliminar: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!puedeEditar && !puedeEliminar) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      {puedeEditar && (
        <button
          type="button"
          onClick={onEdit}
          style={{
            flexShrink: 0, height: 36, padding: "0 14px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            background: "var(--brand)", border: "1px solid var(--brand)",
            borderRadius: "var(--r-sm)", cursor: "pointer",
            color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, fontFamily: "inherit",
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
          onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
        >
          <Pencil size={14} />
          Editar
        </button>
      )}

      {puedeEliminar && (
        <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setAbierto(v => !v)}
            title="Más acciones"
            aria-label="Más acciones"
            style={{
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-1)", padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
          >
            <MoreVertical size={16} />
          </button>
          {abierto && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-sm)", width: 190, overflow: "hidden",
            }}>
              <button
                type="button"
                onClick={() => { setAbierto(false); onDelete(); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", background: "none", border: "none", cursor: "pointer",
                  fontSize: 14, fontWeight: 400, color: "var(--danger)", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <Trash2 size={14} />
                Eliminar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
