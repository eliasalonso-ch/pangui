"use client";
"use no memo";

/**
 * Mis pendientes, con el layout del ejemplo "Tasks" de shadcn
 * (ui.shadcn.com/examples/tasks): barra con filtro de texto, filtros por
 * Estado / Prioridad / Cuándo, limpiar y columnas visibles; tabla con
 * selección, orden por columna y menú "…" por fila; pie con filas
 * seleccionadas, filas por página y Página X de Y. Colores y tamaños de la app
 * (piezas de components/tabla y components/filtros; shadcn sin adaptar sale roto).
 *
 * Paginación, filtros, búsqueda y orden van en el SERVIDOR
 * (fetchMisPendientesPagina: .range() + count). Cada combinación queda en el
 * caché de TanStack Query: volver a una página ya vista es instantáneo, la
 * página anterior se mantiene en pantalla mientras llega la nueva
 * (keepPreviousData) y la siguiente se precarga.
 *
 * "use no memo": TanStack Table no es compatible con el React Compiler.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flexRender, getCoreRowModel, useReactTable,
  type ColumnDef, type PaginationState, type RowSelectionState, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { addDays } from "date-fns";
import { CalendarClock, CalendarDays, CircleDot, Flag, MoreHorizontal, Repeat, Settings2 } from "lucide-react";
import { usePermisos } from "@/lib/permisos";
import { esAdmin } from "@/lib/roles";
import { ymdDeFecha } from "@/components/ui/date-time-picker";
import { BuscadorTabla, EncabezadoTabla, PaginacionFilas } from "@/components/tabla/DataTable";
import { BarraFiltros, FiltroMultiple } from "@/components/filtros/primitivas";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuCheckboxItem, DropdownMenuLabel, menuItemStyle, menuLabelStyle, menuSeparatorStyle,
} from "@/components/ui/dropdown-menu";
import ConfirmDeleteModal, { type ConfirmDelete } from "@/components/ConfirmDeleteModal";
import PendienteDialog from "@/components/ordenes/PendienteDialog";
import { EstadoPendienteTag, PrioridadPendienteTag } from "@/components/pendientes/estado-prioridad";
import { etiquetaRecurrencia } from "@/app/(app)/ordenes/RecurrenceControls";
import {
  fetchMisPendientesPagina, cambiarEstadoPendientes, cambiarPrioridadPendientes, posponerPendiente,
  duplicarPendiente, borrarPendientes, etiquetaPendiente, etiquetaAviso, fmtCreado,
  ESTADOS_PENDIENTE, ESTADOS_ABIERTOS, PRIORIDADES_PENDIENTE, GRUPOS_PENDIENTES,
  type ConsultaPendientes, type EstadoPendiente, type GrupoPendiente, type MiPendiente,
  type OrdenPendientes, type PrioridadPendiente,
} from "@/lib/pendientes-api";

const celda: React.CSSProperties = { padding: "10px 16px", fontSize: 14, color: "var(--fg-2)", verticalAlign: "middle" };
const btnBarra: React.CSSProperties = {
  height: 34, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  background: "var(--surface-1)", color: "var(--fg-2)", font: "inherit", fontSize: 14,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
};
const COLUMNA_LABEL: Record<string, string> = {
  ot: "OT", nota: "Pendiente", estado: "Estado", prioridad: "Prioridad", cuando: "Cuándo", creado: "Creado",
};

const nombreOT = (p: MiPendiente) => {
  const o = p.ordenes_trabajo;
  return o?.titulo?.trim() || o?.descripcion?.trim().slice(0, 80) || "OT";
};

/** Casilla nativa con el color de la app; `indeterminate` solo se puede poner por DOM. */
function Casilla({ checked, indeterminate = false, onChange, label }: {
  checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <input type="checkbox" aria-label={label} checked={checked}
      ref={el => { if (el) el.indeterminate = indeterminate; }}
      onChange={e => onChange(e.target.checked)}
      style={{ width: 16, height: 16, accentColor: "var(--brand)", cursor: "pointer", margin: 0 }} />
  );
}

/** Espera a que se deje de escribir para no pedir una página por tecla. */
function useDebounced<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor);
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t); }, [valor, ms]);
  return v;
}

export default function PendientesPage() {
  const qc = useQueryClient();
  const hoy = ymdDeFecha(new Date());

  const [busqueda, setBusqueda] = useState("");
  const busquedaQ = useDebounced(busqueda, 300);
  // Sin filtros al entrar, como el ejemplo: se ve todo.
  const [estados, setEstados] = useState<EstadoPendiente[]>([]);
  const [prioridades, setPrioridades] = useState<PrioridadPendiente[]>([]);
  const [cuando, setCuando] = useState<GrupoPendiente[]>([]);
  const [orden, setOrden] = useState<SortingState>([{ id: "cuando", desc: false }]);
  const [pagina, setPagina] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [seleccion, setSeleccion] = useState<RowSelectionState>({});
  const [columnas, setColumnas] = useState<VisibilityState>({});

  const { userRol } = usePermisos();
  const [editando, setEditando] = useState<MiPendiente | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmDelete | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  // Cambiar filtros u orden vuelve a la primera página.
  const alPrimera = () => setPagina(p => ({ ...p, pageIndex: 0 }));
  useEffect(alPrimera, [busquedaQ]);

  const consulta: ConsultaPendientes = {
    pagina: pagina.pageIndex, porPagina: pagina.pageSize, busqueda: busquedaQ,
    estados, prioridades, cuando,
    orden: orden[0] ? { id: orden[0].id as OrdenPendientes["id"], desc: orden[0].desc } : null,
  };
  const claveDe = (c: ConsultaPendientes) => ["pendientes", "mios", c, hoy] as const;

  const { data, isPending, isFetching, error } = useQuery({
    queryKey: claveDe(consulta),
    queryFn: () => fetchMisPendientesPagina(consulta, hoy),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const filas = data?.filas ?? [];
  const total = data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / pagina.pageSize));

  // Precarga la página siguiente: al avanzar ya está en el caché.
  useEffect(() => {
    if (pagina.pageIndex + 1 >= paginas) return;
    const sig = { ...consulta, pagina: pagina.pageIndex + 1 };
    qc.prefetchQuery({ queryKey: claveDe(sig), queryFn: () => fetchMisPendientesPagina(sig, hoy), staleTime: 30_000 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(consulta), paginas]);

  // Si un filtro o un borrado deja la página actual fuera de rango, a la última.
  if (data && pagina.pageIndex > 0 && pagina.pageIndex >= paginas) {
    setPagina(p => ({ ...p, pageIndex: paginas - 1 }));
  }

  async function correr(fn: () => Promise<unknown>) {
    setFallo(null);
    try {
      await fn();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    } finally {
      // ["pendientes"] refresca todas las páginas del caché y la pestaña de cada
      // OT; la Actividad recibe las líneas que deja el trigger.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["pendientes"] }),
        qc.invalidateQueries({ queryKey: ["actividad"] }),
      ]);
    }
  }

  const pedirBorrado = (ids: string[], titulo: string) => setConfirmar({
    title: titulo,
    description: "No se puede deshacer. Si solo ya no aplica, márcalo como Cancelado.",
    confirmLabel: "Eliminar",
    onConfirm: async () => {
      await borrarPendientes(ids);
      setSeleccion(s => { const n = { ...s }; ids.forEach(id => delete n[id]); return n; });
      await qc.invalidateQueries({ queryKey: ["pendientes"] });
    },
  });

  const defs = useMemo<ColumnDef<MiPendiente>[]>(() => [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Casilla label="Seleccionar esta página"
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onChange={v => table.toggleAllPageRowsSelected(v)} />
      ),
      cell: ({ row }) => (
        <Casilla label={`Seleccionar: ${row.original.nota}`} checked={row.getIsSelected()} onChange={v => row.toggleSelected(v)} />
      ),
    },
    {
      id: "ot",
      header: "OT",
      enableSorting: false,
      cell: ({ row }) => (
        <Link href={`/ordenes?id=${encodeURIComponent(row.original.orden_id)}`} prefetch={false}
          title={nombreOT(row.original)}
          style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--brand)", whiteSpace: "nowrap" }}>
          {row.original.ordenes_trabajo?.numero ? `OT-${row.original.ordenes_trabajo.numero}` : "OT"}
        </Link>
      ),
    },
    {
      id: "nota",
      header: "Pendiente",
      cell: ({ row }) => {
        const rep = etiquetaRecurrencia(row.original.recurrencia, row.original.recurrencia_config);
        return (
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {rep && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0, height: 22, padding: "0 7px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--fg-3)" }}>
                <Repeat size={11} /> {rep}
              </span>
            )}
            <span style={{ color: "var(--fg-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }} title={row.original.nota}>
              {row.original.nota}
            </span>
          </span>
        );
      },
    },
    {
      id: "estado",
      header: "Estado",
      cell: ({ row }) => <EstadoPendienteTag estado={row.original.estado} />,
    },
    {
      id: "prioridad",
      header: "Prioridad",
      cell: ({ row }) => <PrioridadPendienteTag prioridad={row.original.prioridad} />,
    },
    {
      id: "cuando",
      header: "Cuándo",
      cell: ({ row }) => {
        const p = row.original;
        const abierto = ESTADOS_ABIERTOS.includes(p.estado);
        const et = etiquetaPendiente(p.fecha, hoy, p.hora);
        return (
          <span style={{ display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}>
            <span style={{ color: abierto && et.atrasado ? "var(--st-wait-fg)" : "var(--fg-2)" }}>{et.texto}</span>
            {p.aviso_minutos > 0 && <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Aviso {etiquetaAviso(p.aviso_minutos)}</span>}
          </span>
        );
      },
    },
    {
      id: "creado",
      header: "Creado",
      cell: ({ row }) => (
        <span style={{ display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}>
          <span>{row.original.usuario?.nombre ?? "—"}</span>
          <span style={{ fontSize: 12, color: "var(--fg-4)" }}>{fmtCreado(row.original.created_at)}</span>
        </span>
      ),
    },
    {
      id: "acciones",
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: ({ row }) => {
        const p = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Acciones: ${p.nota}`}
                style={{ width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 190, padding: 6 }}>
              <DropdownMenuItem style={menuItemStyle(false)} onSelect={() => setEditando(p)}>Editar</DropdownMenuItem>
              <DropdownMenuItem style={menuItemStyle(false)} onSelect={() => correr(() => duplicarPendiente(p))}>Duplicar</DropdownMenuItem>
              <DropdownMenuItem style={menuItemStyle(false)} onSelect={() => correr(() => posponerPendiente(p.id, ymdDeFecha(addDays(new Date(), 7))))}>Posponer 1 semana</DropdownMenuItem>
              <DropdownMenuSeparator style={menuSeparatorStyle} />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger style={menuItemStyle(false)}>Estado</DropdownMenuSubTrigger>
                <DropdownMenuSubContent style={{ padding: 6, minWidth: 170 }}>
                  <DropdownMenuRadioGroup value={p.estado} onValueChange={v => correr(() => cambiarEstadoPendientes([p.id], v as EstadoPendiente))}>
                    {ESTADOS_PENDIENTE.map(([v]) => (
                      <DropdownMenuRadioItem key={v} value={v} style={menuItemStyle(p.estado === v)}><EstadoPendienteTag estado={v} /></DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger style={menuItemStyle(false)}>Prioridad</DropdownMenuSubTrigger>
                <DropdownMenuSubContent style={{ padding: 6, minWidth: 170 }}>
                  <DropdownMenuRadioGroup value={p.prioridad} onValueChange={v => correr(() => cambiarPrioridadPendientes([p.id], v as PrioridadPendiente))}>
                    {PRIORIDADES_PENDIENTE.map(([v]) => (
                      <DropdownMenuRadioItem key={v} value={v} style={menuItemStyle(p.prioridad === v)}><PrioridadPendienteTag prioridad={v} /></DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator style={menuSeparatorStyle} />
              <DropdownMenuItem style={{ ...menuItemStyle(false), color: "var(--pr-urgent)" }}
                onSelect={() => pedirBorrado([p.id], "¿Eliminar este pendiente?")}>
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [hoy]);

  const tabla = useReactTable({
    data: filas,
    columns: defs,
    getRowId: p => p.id,
    state: { sorting: orden, pagination: pagina, rowSelection: seleccion, columnVisibility: columnas },
    onSortingChange: u => { setOrden(u); alPrimera(); },
    onPaginationChange: setPagina,
    onRowSelectionChange: setSeleccion,
    onColumnVisibilityChange: setColumnas,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    rowCount: total,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  });

  const idsSeleccionados = Object.keys(seleccion).filter(id => seleccion[id]);
  const hayFiltros = busqueda.trim() !== "" || estados.length > 0 || prioridades.length > 0 || cuando.length > 0;
  const conFiltro = <T,>(set: (v: T) => void) => (v: T) => { set(v); alPrimera(); };

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--fg-1)" }}>Mis pendientes</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
            Lo que falta hacer en tus OTs. Los pendientes se crean en la pestaña Pendientes de cada OT.
          </p>
        </div>
        {esAdmin(userRol) && (
          <Link href="/integraciones/google-calendar" prefetch={false} style={{ ...btnBarra, height: 38, textDecoration: "none" }}>
            <CalendarDays size={15} /> Google Calendar
          </Link>
        )}
      </div>

      {fallo && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--st-wait-fg)" }}>{fallo}</p>}

      {/* Sin data-limite-popover: con pocas filas obligaba a los filtros a abrir hacia arriba. */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <BarraFiltros
            hayFiltros={hayFiltros}
            onLimpiar={() => { setBusqueda(""); setEstados([]); setPrioridades([]); setCuando([]); alPrimera(); }}
          >
            <BuscadorTabla value={busqueda} onChange={setBusqueda} placeholder="Filtrar pendientes…" />
            <FiltroMultiple label="Estado" icon={<CircleDot size={16} />} buscable={false}
              opciones={ESTADOS_PENDIENTE.map(([id, label]) => ({ id, label }))}
              seleccion={estados} onChange={conFiltro(v => setEstados(v as EstadoPendiente[]))} />
            <FiltroMultiple label="Prioridad" icon={<Flag size={16} />} buscable={false}
              opciones={PRIORIDADES_PENDIENTE.map(([id, label]) => ({ id, label }))}
              seleccion={prioridades} onChange={conFiltro(v => setPrioridades(v as PrioridadPendiente[]))} />
            <FiltroMultiple label="Cuándo" icon={<CalendarClock size={16} />} buscable={false}
              opciones={GRUPOS_PENDIENTES.map(([id, label]) => ({ id, label }))}
              seleccion={cuando} onChange={conFiltro(v => setCuando(v as GrupoPendiente[]))} />
          </BarraFiltros>

          {idsSeleccionados.length > 0 && (
            <>
              <button type="button" style={btnBarra} onClick={() => correr(async () => {
                await cambiarEstadoPendientes(idsSeleccionados, "hecho");
                setSeleccion({});
              })}>
                Marcar hecho ({idsSeleccionados.length})
              </button>
              <button type="button" style={{ ...btnBarra, color: "var(--pr-urgent)" }}
                onClick={() => pedirBorrado(idsSeleccionados, `¿Eliminar ${idsSeleccionados.length} pendiente(s)?`)}>
                Eliminar
              </button>
            </>
          )}

          {/* "View" del ejemplo: qué columnas se muestran. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" style={btnBarra}><Settings2 size={15} /> Columnas</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" style={{ minWidth: 170, padding: 6 }}>
              <DropdownMenuLabel style={menuLabelStyle}>Columnas visibles</DropdownMenuLabel>
              <DropdownMenuSeparator style={menuSeparatorStyle} />
              {tabla.getAllLeafColumns().filter(c => c.getCanHide()).map(c => (
                <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} style={{ ...menuItemStyle(false), paddingLeft: 30 }}
                  onCheckedChange={v => c.toggleVisibility(!!v)} onSelect={e => e.preventDefault()}>
                  {COLUMNA_LABEL[c.id] ?? c.id}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div style={{ overflowX: "auto", opacity: isFetching && !isPending ? 0.6 : 1, transition: "opacity 0.15s" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <EncabezadoTabla tabla={tabla} />
            <tbody>
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={tabla.getVisibleLeafColumns().length} style={{ padding: 40, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>
                    {isPending ? "Cargando…"
                      : error ? "No se pudieron cargar los pendientes."
                      : hayFiltros ? "Ningún pendiente coincide con los filtros."
                      : "No tienes pendientes. Abre una OT y agrega uno en la pestaña Pendientes."}
                  </td>
                </tr>
              ) : tabla.getRowModel().rows.map(r => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)", background: r.getIsSelected() ? "var(--brand-tint)" : undefined }}>
                  {r.getVisibleCells().map(c => (
                    <td key={c.id} style={{ ...celda, ...(c.column.id === "select" || c.column.id === "acciones" ? { width: 40, paddingRight: 0 } : {}) }}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PaginacionFilas tabla={tabla} seleccionadas={idsSeleccionados.length} />
      </div>

      {editando && (
        <PendienteDialog key={editando.id} ordenId={editando.orden_id} pendiente={editando}
          onClose={() => setEditando(null)}
          onSaved={() => Promise.all([
            qc.invalidateQueries({ queryKey: ["pendientes"] }),
            qc.invalidateQueries({ queryKey: ["actividad", editando.orden_id] }),
          ])} />
      )}
      <ConfirmDeleteModal pending={confirmar} onClose={() => setConfirmar(null)} />
    </div>
  );
}
