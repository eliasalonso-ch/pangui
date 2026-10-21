"use client";

/**
 * Tabla de cambios de estado de un activo (página /activos/[id]/estado).
 *
 * Patrón "Data Table" de shadcn: TanStack Table para filtrar, ordenar y
 * paginar, y la paginación con números de shadcn. Con estilos inline y las
 * variables de la app en vez de los componentes de shadcn, que acá salen rotos
 * (preflight apagado, tokens distintos). Los filtros son los mismos chips de
 * las barras de filtros de la app (components/filtros).
 *
 * Muestra el historial COMPLETO, sin importar el rango del gráfico de arriba.
 * Trabaja en el cliente: los períodos de un activo son decenas (el máximo hoy
 * es 45), ya están en caché (la página los trae una vez) y filtrar ahí es
 * instantáneo.
 *
 * ponytail: todo en memoria. Si un activo llegara a miles de períodos, pasar a
 * paginación en el servidor (`.range()` + filtros en la consulta) con
 * `manualPagination`/`manualFiltering` de TanStack Table.
 */

import { useMemo, useState } from "react";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type ColumnFiltersState, type PaginationState, type SortingState, type Updater,
} from "@tanstack/react-table";
import { Circle, PauseCircle, Wrench } from "lucide-react";
import { BuscadorTabla, EncabezadoTabla, PaginacionTabla } from "@/components/tabla/DataTable";
import { formatDuracion, type EstadoPeriodo } from "@/lib/activo-estado-api";
import { ESTADO_COLOR, ESTADO_LABEL, fmtFecha } from "@/lib/activo-estado-ui";
import { MS_POR_HORA } from "@/lib/eje-tiempo";
import { BarraFiltros, FiltroMultiple } from "@/components/filtros/primitivas";

const INACTIVIDAD_LABEL = { planeado: "Planificada", sin_planear: "Imprevista", ninguna: "—" } as const;
type Inactividad = keyof typeof INACTIVIDAD_LABEL;
const inactividadDe = (p: EstadoPeriodo): Inactividad => p.tipo_inactividad ?? "ninguna";

const POR_PAGINA = 10;

/** Filtro "uno de" para los chips de selección múltiple (vacío = todos). */
const unoDe = (row: { getValue: (id: string) => unknown }, id: string, valores: string[]) =>
  valores.length === 0 || valores.includes(String(row.getValue(id)));

const celda: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" };

export default function HistorialEstadoTabla({ periodos, ahora }: {
  /** Todos los períodos del activo. */
  periodos: EstadoPeriodo[];
  /** Fin de los períodos en curso, para su duración. */
  ahora: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtros, setFiltros] = useState<ColumnFiltersState>([]);
  const [orden, setOrden] = useState<SortingState>([{ id: "inicio", desc: true }]);
  const [pagina, setPagina] = useState<PaginationState>({ pageIndex: 0, pageSize: POR_PAGINA });

  // Filtrar u ordenar vuelve a la primera página. Se hace a mano y no con
  // `autoResetPageIndex`: ese reinicio también salta cuando cambian los datos, y
  // la duración de un período en curso avanza con el reloj de la página.
  const alPrimera = () => setPagina(p => ({ ...p, pageIndex: 0 }));
  const conReinicio = <T,>(set: (u: Updater<T>) => void) => (u: Updater<T>) => { set(u); alPrimera(); };

  const columnas = useMemo<ColumnDef<EstadoPeriodo>[]>(() => [
    {
      id: "estado",
      accessorKey: "estado",
      header: "Estado",
      filterFn: (row, id, v: string[]) => unoDe(row, id, v),
      sortingFn: (a, b) => ESTADO_LABEL[a.original.estado].localeCompare(ESTADO_LABEL[b.original.estado], "es"),
      cell: ({ row }) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, color: "var(--fg-1)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: ESTADO_COLOR[row.original.estado] }} />
          {ESTADO_LABEL[row.original.estado]}
        </span>
      ),
    },
    {
      id: "duracion",
      header: "Duración",
      accessorFn: p => ((p.fin ? new Date(p.fin).getTime() : ahora) - new Date(p.inicio).getTime()) / MS_POR_HORA,
      cell: ({ row, getValue }) => `${formatDuracion(getValue<number>())}${row.original.fin ? "" : " (en curso)"}`,
    },
    {
      id: "inactividad",
      header: "Inactividad",
      accessorFn: inactividadDe,
      filterFn: (row, id, v: string[]) => unoDe(row, id, v),
      cell: ({ getValue }) => INACTIVIDAD_LABEL[getValue<Inactividad>()],
    },
    {
      id: "motivo",
      header: "Motivo",
      // "" = sin motivo (paradas planificadas o anteriores al registro de motivos).
      accessorFn: p => p.motivo_id ?? "",
      filterFn: (row, id, v: string[]) => unoDe(row, id, v),
      sortingFn: (a, b) => (a.original.motivo?.nombre ?? "").localeCompare(b.original.motivo?.nombre ?? "", "es"),
      cell: ({ row }) => row.original.motivo?.nombre ?? "—",
    },
    {
      id: "inicio",
      header: "Desde",
      accessorFn: p => new Date(p.inicio).getTime(),
      cell: ({ row }) => fmtFecha(row.original.inicio),
    },
    {
      id: "fin",
      header: "Hasta",
      // En curso = el más reciente: ordena como "ahora".
      accessorFn: p => (p.fin ? new Date(p.fin).getTime() : ahora),
      cell: ({ row }) => (row.original.fin ? fmtFecha(row.original.fin) : "—"),
    },
    {
      id: "notas",
      header: "Notas",
      accessorFn: p => p.notas ?? "",
      enableSorting: false,
      cell: ({ getValue }) => <span style={{ color: "var(--fg-3)" }}>{getValue<string>() || "—"}</span>,
    },
  ], [ahora]);

  const tabla = useReactTable({
    data: periodos,
    columns: columnas,
    state: { globalFilter: busqueda, columnFilters: filtros, sorting: orden, pagination: pagina },
    onGlobalFilterChange: conReinicio<string>(setBusqueda),
    onColumnFiltersChange: conReinicio<ColumnFiltersState>(setFiltros),
    onSortingChange: conReinicio<SortingState>(setOrden),
    onPaginationChange: setPagina,
    autoResetPageIndex: false,
    // La búsqueda mira lo que se lee en la fila, no los valores crudos.
    globalFilterFn: (row, _id, texto: string) => {
      const t = texto.trim().toLowerCase();
      if (!t) return true;
      const p = row.original;
      return [ESTADO_LABEL[p.estado], INACTIVIDAD_LABEL[inactividadDe(p)], p.motivo?.nombre ?? "", p.notas ?? ""]
        .some(v => v.toLowerCase().includes(t));
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Opciones del chip "Motivo": los que aparecen en el historial (incluye los ya
  // borrados del catálogo: siguen siendo la causa de esas paradas).
  const motivos = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of periodos) if (p.motivo) m.set(p.motivo.id, p.motivo.nombre);
    return [...m].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [periodos]);

  const filtroDe = (id: string) => (filtros.find(f => f.id === id)?.value as string[] | undefined) ?? [];
  const ponerFiltro = (id: string, v: string[]) =>
    tabla.getColumn(id)?.setFilterValue(v.length ? v : undefined);

  const totalPaginas = tabla.getPageCount();
  // Si los datos se achican (p. ej. al refrescar) y la página actual deja de
  // existir, se vuelve a la última (ajuste durante el render, sin efecto).
  if (pagina.pageIndex > 0 && pagina.pageIndex >= totalPaginas) {
    setPagina(p => ({ ...p, pageIndex: Math.max(0, totalPaginas - 1) }));
  }
  const hayFiltros = busqueda.trim() !== "" || filtros.length > 0;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)", overflow: "hidden" }}>
      {/* Barra: búsqueda + filtros, con las piezas de las demás barras. */}
      <BarraFiltros
        hayFiltros={hayFiltros}
        onLimpiar={() => { setBusqueda(""); setFiltros([]); alPrimera(); }}
        style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}
      >
        <BuscadorTabla value={busqueda} onChange={v => tabla.setGlobalFilter(v)} placeholder="Buscar en notas, motivo…" />
        <FiltroMultiple
          label="Estado" icon={<Circle size={16} />} buscable={false}
          opciones={(["operativo", "mantencion", "fuera_servicio"] as const).map(e => ({ id: e, label: ESTADO_LABEL[e] }))}
          seleccion={filtroDe("estado")}
          onChange={v => ponerFiltro("estado", v)}
        />
        <FiltroMultiple
          label="Inactividad" icon={<PauseCircle size={16} />} buscable={false}
          opciones={[{ id: "planeado", label: "Planificada" }, { id: "sin_planear", label: "Imprevista" }, { id: "ninguna", label: "Sin inactividad" }]}
          seleccion={filtroDe("inactividad")}
          onChange={v => ponerFiltro("inactividad", v)}
        />
        {motivos.length > 0 && (
          <FiltroMultiple
            label="Motivo" icon={<Wrench size={16} />}
            opciones={motivos}
            seleccion={filtroDe("motivo")}
            onChange={v => ponerFiltro("motivo", v)}
          />
        )}
      </BarraFiltros>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880 }}>
          <EncabezadoTabla tabla={tabla} />
          <tbody>
            {tabla.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columnas.length} style={{ padding: 32, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>
                  {periodos.length === 0 ? "Este activo todavía no tiene cambios de estado." : "Ningún cambio de estado coincide con los filtros."}
                </td>
              </tr>
            ) : tabla.getRowModel().rows.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                {r.getVisibleCells().map(c => (
                  <td key={c.id} style={celda}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaginacionTabla tabla={tabla} />
    </div>
  );
}
