"use client";
"use no memo";

/**
 * Piezas del patrón "Data Table" de shadcn (TanStack Table + paginación con
 * números), compartidas por las tablas de la app: historial de estado de un
 * activo y activos de la analítica. Estilos inline con las variables de la app:
 * los componentes de shadcn salen rotos acá (preflight apagado, tokens distintos).
 *
 * "use no memo": TanStack Table v8 no es compatible con el React Compiler.
 * `useReactTable` devuelve siempre la misma instancia; el compiler se salta
 * solo el componente que la llama, pero memoizaba estos hijos por esa
 * referencia y quedaban congelados en el primer render (flecha de orden y
 * página activa sin cambiar). Todo componente que RECIBA la `tabla` necesita
 * esta directiva.
 */

import { flexRender, type Table } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

/**
 * Páginas a mostrar, al estilo de la paginación de shadcn: primera, última, la
 * actual con sus vecinas, y "…" en los saltos. Índices desde 0.
 */
export function paginasVisibles(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const set = new Set([0, total - 1, actual - 1, actual, actual + 1].filter(i => i >= 0 && i < total));
  const orden = [...set].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  orden.forEach((p, i) => {
    if (i > 0 && p - orden[i - 1] > 1) out.push("…");
    out.push(p);
  });
  return out;
}

/** Buscador de la barra de una tabla (34 px, como los chips de filtro). */
export function BuscadorTabla({ value, onChange, placeholder, ancho = 240 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ancho?: number;
}) {
  return (
    <div style={{ position: "relative", width: ancho }}>
      <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", height: 34, padding: `0 ${value ? 28 : 10}px 0 32px`, boxSizing: "border-box",
          border: "1px solid var(--border)", borderRadius: "var(--r-sm)", outline: "none",
          background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit",
        }}
        onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
        onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
      />
      {value && (
        <button type="button" aria-label="Limpiar búsqueda" onClick={() => onChange("")}
          style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * Encabezado con orden por columna (clic: asc → desc → sin orden). `derecha`:
 * ids de columnas numéricas, alineadas a la derecha como sus celdas.
 */
export function EncabezadoTabla<T>({ tabla, derecha = [] }: { tabla: Table<T>; derecha?: string[] }) {
  return (
    <thead>
      {tabla.getHeaderGroups().map(g => (
        <tr key={g.id} style={{ background: "var(--surface-2)" }}>
          {g.headers.map(h => {
            const dir = h.column.getIsSorted();
            const Icono = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
            const alDerecha = derecha.includes(h.column.id);
            return (
              <th key={h.id}
                style={{ padding: "10px 16px", textAlign: alDerecha ? "right" : "left", fontSize: 14, fontWeight: 400, color: "var(--fg-4)", whiteSpace: "nowrap" }}
                aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}>
                {h.column.getCanSort() ? (
                  <button type="button" onClick={h.column.getToggleSortingHandler()}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: 0, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: dir ? "var(--fg-1)" : "var(--fg-4)", flexDirection: alDerecha ? "row-reverse" : "row" }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    <Icono size={13} style={{ color: dir ? "var(--brand)" : "var(--fg-4)" }} />
                  </button>
                ) : flexRender(h.column.columnDef.header, h.getContext())}
              </th>
            );
          })}
        </tr>
      ))}
    </thead>
  );
}

/** Pie con "1–10 de 45" y la paginación de shadcn: Anterior · 1 … 4 5 6 … 12 · Siguiente. */
export function PaginacionTabla<T>({ tabla }: { tabla: Table<T> }) {
  const { pageIndex, pageSize } = tabla.getState().pagination;
  const total = tabla.getFilteredRowModel().rows.length;
  const paginas = tabla.getPageCount();
  if (total === 0) return null;
  const desde = pageIndex * pageSize;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 16px", borderTop: "1px solid var(--border)" }}>
      <span style={{ fontSize: 14, color: "var(--fg-4)" }}>
        {desde + 1}–{Math.min(desde + pageSize, total)} de {total}
      </span>
      {paginas > 1 && (
        <nav aria-label="Paginación" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <BotonPagina onClick={() => tabla.previousPage()} disabled={!tabla.getCanPreviousPage()} aria-label="Página anterior">
            <ChevronLeft size={15} /> Anterior
          </BotonPagina>
          {paginasVisibles(pageIndex, paginas).map((p, i) => p === "…" ? (
            <span key={`e${i}`} aria-hidden="true" style={{ width: 32, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>…</span>
          ) : (
            <BotonPagina key={p} activa={p === pageIndex} onClick={() => tabla.setPageIndex(p)}
              aria-label={`Página ${p + 1}`} aria-current={p === pageIndex ? "page" : undefined}>
              {p + 1}
            </BotonPagina>
          ))}
          <BotonPagina onClick={() => tabla.nextPage()} disabled={!tabla.getCanNextPage()} aria-label="Página siguiente">
            Siguiente <ChevronRight size={15} />
          </BotonPagina>
        </nav>
      )}
    </div>
  );
}

function BotonPagina({ activa = false, disabled, children, ...props }: {
  activa?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
        minWidth: 32, height: 32, padding: "0 8px", borderRadius: "var(--r-sm)",
        border: activa ? "1px solid var(--border)" : "1px solid transparent",
        background: activa ? "var(--surface-1)" : "transparent",
        color: disabled ? "var(--fg-4)" : activa ? "var(--brand)" : "var(--fg-2)",
        fontSize: 14, fontFamily: "inherit", cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!disabled && !activa) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!activa) e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}
