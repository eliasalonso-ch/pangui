"use client";

/**
 * Selector con buscador, con opción de crear lo que no existe.
 *
 * Vivía dentro de ActivosBandeja, que era su único consumidor. Al necesitar el
 * mismo control en el diálogo de cambio de estado —para elegir el motivo de una
 * parada— se extrajo acá en vez de escribir un segundo desplegable: dos
 * implementaciones del mismo control se separan en cuanto alguien toca una.
 *
 * Si recibe `onCreate`, lo que se escribe y no existe se puede dar de alta desde
 * el mismo desplegable. Sin eso, buscar algo que no está es un callejón sin
 * salida: hay que irse a otra pantalla a crearlo y volver.
 *
 * `onCreate` devuelve el id de la fila nueva para poder seleccionarla al toque.
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";

export interface SearchSelectOption {
  id: string;
  label: string;
  sub?: string;
}

export default function SearchSelect({
  placeholder, value, options, onChange, disabled,
  emptyLabel = "Sin asignar", onCreate, createLabel,
}: {
  placeholder: string;
  value: string;
  options: SearchSelectOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  onCreate?: (nombre: string) => Promise<string>;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sub ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const q = query.trim();
  // Un nombre repetido choca con el indice unico (por scope, case-insensitive),
  // asi que con coincidencia exacta no se ofrece crear: seria un 23505 seguro.
  const exactExists = options.some(o => o.label.trim().toLowerCase() === q.toLowerCase());
  const canCreate = Boolean(onCreate) && q.length > 0 && !exactExists;

  async function handleCreate() {
    if (!onCreate || !q || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = await onCreate(q);
      onChange(id);
      setOpen(false);
      setQuery("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (disabled) return; setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14, color: selected ? "var(--fg-1)" : "var(--fg-4)",
          cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", opacity: disabled ? 0.6 : 1,
          fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 600,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder={onCreate ? "Buscar o crear…" : "Buscar…"}
              value={query}
              onChange={e => { setQuery(e.target.value); setCreateError(null); }}
              onKeyDown={e => {
                if (e.key !== "Enter" || !canCreate) return;
                // El desplegable puede vivir dentro de un <form>: sin esto,
                // Enter enviaria el formulario en vez de crear el catalogo.
                e.preventDefault();
                void handleCreate();
              }}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 14, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", fontSize: 14, color: "var(--fg-4)",
                background: !value ? "var(--brand-tint)" : "transparent",
                border: "none", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {emptyLabel}
            </button>
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 14,
                  background: value === o.id ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 14, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && !canCreate && (
              <div style={{ padding: "8px 10px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", padding: "10px 12px", fontSize: 14,
                  background: "transparent", border: "none",
                  borderTop: filtered.length > 0 ? "1px solid var(--border)" : "none",
                  cursor: creating ? "wait" : "pointer", fontFamily: "inherit",
                  textAlign: "left", color: "var(--brand)",
                }}
              >
                {creating
                  ? <Loader2 size={12} style={{ flexShrink: 0, animation: "spin 1s linear infinite" }} />
                  : <Plus size={12} style={{ flexShrink: 0 }} />}
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {createLabel ?? "Crear"} “{q}”
                </span>
              </button>
            )}
            {createError && (
              <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--danger)" }}>{createError}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
