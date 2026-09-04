"use client";

// Selector de catálogo con búsqueda y creación en línea.
//
// Unifica lo que antes eran LocationSelect y LugarSelect, definidos dentro de
// OTCrearPanel: los dos eran el mismo desplegable de ~90 líneas y solo cambiaban
// el placeholder, la tabla y el payload del insert. Ahora el mismo componente
// sirve a ubicaciones, lugares, sociedades y activos, y lo usan tanto el panel
// de creación como el de edición.

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase";

export interface CatalogoOption {
  id: string;
  label: string;
  sub?: string;
}

interface Props<T> {
  value: string;
  options: CatalogoOption[];
  onChange: (id: string) => void;
  /** Tabla destino del insert. */
  table: string;
  /** Columnas que devuelve el insert, para construir la fila nueva. */
  returning: string;
  /**
   * Fila a insertar a partir del texto escrito. Recibe el nombre ya recortado
   * para que cada catálogo decida su propia columna (`edificio` vs `nombre`).
   */
  buildRow: (nombre: string) => Record<string, unknown>;
  onCreated: (row: T) => void;
  placeholder: string;
  /** Texto del botón cuando no hay nada seleccionado. */
  emptyLabel: string;
  /** Permite apagar la creación (p. ej. si falta elegir la ubicación padre). */
  canCreate?: boolean;
}

export default function CatalogoSelect<T>({
  value,
  options,
  onChange,
  table,
  returning,
  buildRow,
  onCreated,
  placeholder,
  emptyLabel,
  canCreate = true,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(query.toLowerCase()),
  );
  const exactMatch = options.some(
    (o) => o.label.toLowerCase() === query.toLowerCase().trim(),
  );
  const showCreate = canCreate && query.trim().length > 1 && !exactMatch;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function handleCreate() {
    const nombre = query.trim();
    if (!nombre) return;
    setCreating(true);
    setError(null);
    try {
      const sb = createClient();
      // A diferencia de los selectores originales, el error del insert se
      // muestra: antes un fallo de RLS o de red no dejaba rastro en la UI.
      const { data, error: insertError } = await sb
        .from(table)
        .insert(buildRow(nombre))
        .select(returning)
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }
      if (data) {
        // `table` y `returning` son dinámicos, así que el cliente no puede
        // inferir la forma de la fila: se normaliza aquí.
        const row = data as unknown as T & { id: string };
        onCreated(row);
        onChange(row.id);
        setQuery("");
        setOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setQuery("");
          setError(null);
        }}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 14, color: selected ? "var(--fg-1)" : "var(--fg-4)", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : emptyLabel}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: "100%", height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14, outline: "none", color: "var(--fg-1)", fontFamily: "inherit", background: "var(--surface-1)" }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 14, color: "var(--fg-4)", background: !value ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              Sin asignar
            </button>
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "10px 12px", fontSize: 14, background: value === o.id ? "var(--brand-tint)" : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}
              >
                {value === o.id && <Check size={11} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "var(--fg-1)" }}>{o.label}</div>
                  {o.sub && <div style={{ fontSize: 14, color: "var(--fg-4)" }}>{o.sub}</div>}
                </div>
              </button>
            ))}
            {showCreate && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 12px", fontSize: 14, fontWeight: 400, background: "var(--brand-tint)", color: "var(--brand)", border: "none", borderTop: "1px solid var(--border)", cursor: creating ? "default" : "pointer", fontFamily: "inherit" }}
              >
                {creating ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Crear &quot;{query.trim()}&quot;
              </button>
            )}
            {error && (
              <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--danger)", borderTop: "1px solid var(--border)" }}>
                {error}
              </div>
            )}
            {filtered.length === 0 && !showCreate && !error && (
              <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
