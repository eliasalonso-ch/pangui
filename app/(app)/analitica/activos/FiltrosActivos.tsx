"use client";

/**
 * Filtros de la analítica de activos, con las MISMAS piezas que /ordenes
 * (components/filtros/primitivas): chip con ícono azul, selección múltiple con
 * casillas y lo elegido como fichas dentro del buscador.
 *
 * Las opciones de cada filtro (salvo criticidad, que son tres fijas) no se
 * cargan de una vez: una universidad tiene miles de activos. Se piden a
 * `analitica_activos_opciones` de a 50, buscando en la base, solo cuando se abre
 * el filtro, y la siguiente página llega al acercarse al final de la lista.
 * TanStack las guarda por filtro + búsqueda: reabrir el filtro no consulta.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import {
  FilterDropdown, OptionRow, SinResultados, TokenSearch, toggle,
} from "@/components/filtros/primitivas";

export interface Opcion { value: string; label: string }

export type TipoOpcion = "activo" | "ubicacion" | "modelo" | "sociedad" | "responsable";

const PAGINA = 50;

/** Filtro con opciones remotas: búsqueda en la base + scroll infinito. */
export function FiltroRemoto({ label, icon, tipo, workspaceId, seleccion, onChange }: {
  label: string;
  icon: React.ReactNode;
  tipo: TipoOpcion;
  workspaceId: string;
  /** Lo elegido, con su etiqueta: las fichas no dependen de qué página está cargada. */
  seleccion: Opcion[];
  onChange: (sel: Opcion[]) => void;
}) {
  return (
    <FilterDropdown
      label={label}
      icon={icon}
      active={seleccion.length > 0}
      count={seleccion.length}
      onClear={() => onChange([])}
    >
      {/* Solo existe con el dropdown abierto: la consulta parte al abrir. */}
      <ListaRemota tipo={tipo} workspaceId={workspaceId} label={label} seleccion={seleccion} onChange={onChange} />
    </FilterDropdown>
  );
}

function ListaRemota({ tipo, workspaceId, label, seleccion, onChange }: {
  tipo: TipoOpcion;
  workspaceId: string;
  label: string;
  seleccion: Opcion[];
  onChange: (sel: Opcion[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // Una consulta por pausa al escribir, no una por tecla.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const q = useInfiniteQuery({
    queryKey: ["analitica-activos-opciones", workspaceId, tipo, busqueda],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Opcion[]> => {
      const { data, error } = await createClient().rpc("analitica_activos_opciones", {
        p_tipo: tipo, p_busqueda: busqueda || null, p_offset: pageParam, p_limit: PAGINA,
      });
      if (error) throw error;
      return data as Opcion[];
    },
    // Una página incompleta es la última.
    getNextPageParam: (ultima, todas) => (ultima.length < PAGINA ? undefined : todas.length * PAGINA),
  });
  const opciones = q.data?.pages.flat() ?? [];
  const elegidos = new Set(seleccion.map(s => s.value));

  const alScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80 && q.hasNextPage && !q.isFetchingNextPage) {
      void q.fetchNextPage();
    }
  };

  const alternar = (o: Opcion) =>
    onChange(elegidos.has(o.value) ? seleccion.filter(s => s.value !== o.value) : [...seleccion, o]);

  return (
    <>
      <TokenSearch
        placeholder={`Buscar ${label.toLowerCase()}…`}
        value={texto}
        onChange={setTexto}
        tokens={seleccion.map(s => ({ key: s.value, label: s.label }))}
        onRemove={v => onChange(seleccion.filter(s => s.value !== v))}
        onClearAll={() => onChange([])}
      />
      {/* Mismo alto y padding que OptionList, con onScroll para la página siguiente. */}
      <div onScroll={alScroll} style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}>
        {opciones.map(o => (
          <OptionRow key={o.value} active={elegidos.has(o.value)} onClick={() => alternar(o)}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
          </OptionRow>
        ))}
        {(q.isLoading || q.isFetchingNextPage) && (
          <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>Cargando…</div>
        )}
        {q.isError && (
          <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>No se pudieron cargar las opciones.</div>
        )}
        {!q.isLoading && !q.isError && opciones.length === 0 && <SinResultados />}
      </div>
    </>
  );
}

/** Filtro de opciones fijas y pocas (criticidad): sin buscador. */
export function FiltroFijo({ label, icon, opciones, seleccion, onChange }: {
  label: string;
  icon: React.ReactNode;
  opciones: Opcion[];
  seleccion: string[];
  onChange: (sel: string[]) => void;
}) {
  return (
    <FilterDropdown label={label} icon={icon} active={seleccion.length > 0} count={seleccion.length} onClear={() => onChange([])}>
      <div style={{ padding: "6px 0 8px" }}>
        {opciones.map(o => (
          <OptionRow key={o.value} active={seleccion.includes(o.value)} onClick={() => onChange(toggle(seleccion, o.value))}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)" }}>{o.label}</span>
          </OptionRow>
        ))}
      </div>
    </FilterDropdown>
  );
}

/**
 * Desplegable de una sola opción (el período), con el aspecto de los
 * desplegables de la app en vez del <select> nativo: misma caja, mismo panel
 * flotante. Alto 40 para quedar parejo con los DatePicker que van al lado.
 */
export function Desplegable<T extends string>({ value, opciones, onChange, ariaLabel }: {
  value: T;
  opciones: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
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
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 12px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`, borderRadius: "var(--r-sm)",
          background: "var(--surface-1)", color: "var(--fg-1)",
          fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        {actual?.label}
        <ChevronDown size={15} style={{ color: "var(--brand)" }} />
      </button>
      {open && (
        <div role="listbox" style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 200, minWidth: "100%",
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
