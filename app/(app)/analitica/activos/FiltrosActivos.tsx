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

// Vive en components/ porque también lo usan los formularios de OT.
export { Desplegable } from "@/components/Desplegable";
