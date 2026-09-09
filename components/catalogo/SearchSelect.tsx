"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Desplegable buscable: buscador arriba y lista con scroll propio.
 *
 * Reemplaza al <select> nativo, que ni filtra ni pagina — con catalogos de
 * cientos de filas (473 lugares hoy) no habia forma de encontrar una sin
 * recorrer la lista del sistema. Es el mismo control que usa el panel de
 * activos en todos sus pickers.
 *
 * La lista se dibuja de a `pageSize`: el centinela del final pide la siguiente
 * tanda al entrar en pantalla. Los datos ya estan en memoria, asi que esto no
 * agrega peticiones — solo evita pintar cientos de filas de una.
 */
export default function SearchSelect({
  placeholder, value, options, onChange, disabled,
  emptyLabel = "Sin asignar", pageSize = 20,
}: {
  placeholder: string;
  value: string;
  options: { id: string; label: string; sub?: string }[];
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  /** Filas por tanda. La siguiente se dibuja al llegar al final del scroll. */
  pageSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Igual que en el mapa: la tanda se guarda junto a la clave (busqueda +
  // abierto/cerrado) para volver a la primera sin un efecto que llame setState.
  const [paged, setPaged] = useState({ key: "", n: 1 });
  const ref = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase()) ||
    (o.sub ?? "").toLowerCase().includes(query.toLowerCase())
  );
  const pageKey = `${query}|${open}`;
  const page = paged.key === pageKey ? paged.n : 1;
  const shown = filtered.slice(0, pageSize * page);
  const hasMore = filtered.length > shown.length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || !open) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setPaged(p => ({ key: pageKey, n: (p.key === pageKey ? p.n : 1) + 1 }));
        }
      },
      { root: node.parentElement, rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, open, pageKey]);

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
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 14, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
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
            {shown.map(o => (
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
            {hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
