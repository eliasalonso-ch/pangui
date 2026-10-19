"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { MultiSelect, type MultiSelectOption } from "@/components/ordenes/CategoriaMultiSelect";
import { OptionRow, TokenSearch, SinResultados, toggle } from "@/components/filtros/primitivas";

// Selector múltiple sobre un catálogo paginado: 25 filas por página, búsqueda
// en el servidor y scroll infinito dentro del desplegable. Páginas y etiquetas
// quedan en caché de TanStack Query (mismo staleTime que los catálogos de
// lib/queries.ts), así que reabrir el control no vuelve a pedir nada.

const POR_PAGINA = 25;
const STALE = 15 * 60 * 1000;

export type FuenteCatalogo = "categorias" | "activos" | "ubicaciones" | "usuarios_baja";

type Fila = Record<string, any>;

const FUENTES: Record<FuenteCatalogo, {
  tabla: string;
  columnas: string;
  orden: string;
  /** Columnas donde busca el texto. */
  buscar: string[];
  delWorkspace: (q: any, wsId: string) => any;
  opcion: (r: Fila) => MultiSelectOption;
  vacio: string;
}> = {
  categorias: {
    tabla: "categorias_ot", columnas: "id, nombre, icono, color", orden: "nombre", buscar: ["nombre"],
    // Incluye las categorías por defecto (workspace_id null), como useCategorias.
    delWorkspace: (q, ws) => q.or(`workspace_id.eq.${ws},workspace_id.is.null`),
    opcion: r => ({ id: r.id, label: r.nombre, icono: r.icono, color: r.color }),
    vacio: "Sin categorías",
  },
  activos: {
    tabla: "activos", columnas: "id, nombre, numero_serie", orden: "nombre", buscar: ["nombre", "numero_serie"],
    delWorkspace: (q, ws) => q.eq("workspace_id", ws).eq("activo", true),
    opcion: r => ({ id: r.id, label: r.nombre + (r.numero_serie ? ` (${r.numero_serie})` : "") }),
    vacio: "Sin activos",
  },
  ubicaciones: {
    tabla: "ubicaciones", columnas: "id, edificio, detalle", orden: "edificio", buscar: ["edificio", "detalle"],
    delWorkspace: (q, ws) => q.eq("workspace_id", ws),
    opcion: r => ({ id: r.id, label: r.edificio + (r.detalle ? ` · ${r.detalle}` : "") }),
    vacio: "Sin ubicaciones",
  },
  // Visibles por usuarios_select desde 20261019120000 (antes la RLS los ocultaba).
  usuarios_baja: {
    tabla: "usuarios", columnas: "id, nombre", orden: "nombre", buscar: ["nombre"],
    delWorkspace: (q, ws) => q.eq("workspace_id", ws).not("deleted_at", "is", null),
    opcion: r => ({ id: r.id, label: r.nombre }),
    vacio: "Sin usuarios dados de baja",
  },
};

async function fetchPagina(fuente: FuenteCatalogo, wsId: string, busqueda: string, pagina: number) {
  const f = FUENTES[fuente];
  let q = f.delWorkspace(createClient().from(f.tabla).select(f.columnas), wsId);
  if (busqueda) {
    // Entre comillas el valor va literal en el `or` (comas, paréntesis); % y _
    // son comodines de ilike y se escapan. Igual que lib/catalogo-api.ts.
    const patron = busqueda.replace(/[%_\\]/g, m => "\\" + m).replace(/"/g, "");
    q = f.buscar.length === 1
      ? q.ilike(f.buscar[0], `%${patron}%`)
      : q.or(f.buscar.map(c => `${c}.ilike."%${patron}%"`).join(","));
  }
  const desde = pagina * POR_PAGINA;
  // Una fila de más para saber si hay otra página sin pedir el total.
  const { data, error } = await q.order(f.orden).order("id").range(desde, desde + POR_PAGINA);
  if (error) throw error;
  const filas = (data ?? []) as Fila[];
  return { opciones: filas.slice(0, POR_PAGINA).map(f.opcion), hayMas: filas.length > POR_PAGINA };
}

/**
 * Páginas, búsqueda (con debounce) y etiquetas de lo elegido para un catálogo.
 * Lo comparten el selector de Configuración y los filtros de la biblioteca.
 */
function useCatalogo(fuente: FuenteCatalogo, wsId: string | null, value: string[]) {
  const f = FUENTES[fuente];
  const [texto, setTexto] = useState("");
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const paginas = useInfiniteQuery({
    queryKey: ["catalogo-paginado", fuente, wsId, busqueda],
    queryFn: ({ pageParam }) => fetchPagina(fuente, wsId!, busqueda, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => (ultima.hayMas ? todas.length : undefined),
    enabled: !!wsId,
    staleTime: STALE,
    // Mientras llega la búsqueda nueva, se siguen viendo los resultados anteriores.
    placeholderData: keepPreviousData,
  });

  // Etiquetas de lo ya elegido: puede estar en una página que no se cargó.
  const ids = [...value].sort();
  const elegidas = useQuery({
    queryKey: ["catalogo-ids", fuente, ids],
    queryFn: async () => {
      const { data, error } = await createClient().from(f.tabla).select(f.columnas).in("id", ids);
      if (error) throw error;
      return ((data ?? []) as Fila[]).map(f.opcion);
    },
    enabled: ids.length > 0,
    staleTime: STALE,
    placeholderData: keepPreviousData,
  });

  const opciones = paginas.data?.pages.flatMap(p => p.opciones) ?? [];
  return {
    texto, setTexto, opciones,
    seleccionadas: elegidas.data,
    etiqueta: (id: string) => elegidas.data?.find(o => o.id === id)?.label ?? opciones.find(o => o.id === id)?.label ?? "…",
    onFinal: () => { if (paginas.hasNextPage && !paginas.isFetchingNextPage) void paginas.fetchNextPage(); },
    cargando: paginas.isFetching,
    vacio: f.vacio,
  };
}

export default function CatalogoMultiSelect({ fuente, wsId, value, onChange }: {
  fuente: FuenteCatalogo;
  wsId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const c = useCatalogo(fuente, wsId, value);
  return (
    <MultiSelect
      options={c.opciones}
      seleccionadas={c.seleccionadas}
      value={value}
      onChange={onChange}
      onBuscar={c.setTexto}
      onFinal={c.onFinal}
      cargando={c.cargando}
      vacio={c.vacio}
    />
  );
}

/** Contenido de un FilterDropdown: buscador con fichas + opciones paginadas. */
export function CatalogoFiltro({ fuente, wsId, value, onChange, placeholder }: {
  fuente: FuenteCatalogo;
  wsId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const c = useCatalogo(fuente, wsId, value);
  return (
    <>
      <TokenSearch
        placeholder={placeholder}
        value={c.texto}
        onChange={c.setTexto}
        tokens={value.map(id => ({ key: id, label: c.etiqueta(id) }))}
        onRemove={id => onChange(value.filter(x => x !== id))}
        onClearAll={() => onChange([])}
      />
      <div
        onScroll={e => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) c.onFinal();
        }}
        style={{ maxHeight: 320, overflowY: "auto", padding: "2px 0 6px" }}
      >
        {c.opciones.map(o => (
          <OptionRow key={o.id} active={value.includes(o.id)} onClick={() => onChange(toggle(value, o.id))}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
          </OptionRow>
        ))}
        {c.cargando && <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>Cargando…</div>}
        {!c.cargando && c.opciones.length === 0 && <SinResultados />}
      </div>
    </>
  );
}
