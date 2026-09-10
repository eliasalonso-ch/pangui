"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeepLinkId } from "@/lib/use-deep-link-id";
import { createClient } from "@/lib/supabase";
import { Plus, Search, X, Loader2, ShoppingCart } from "lucide-react";
import { formatearCLP } from "@/lib/tributario";
import {
  listOrdenesCompra, getOrdenCompra, listLineas,
  createOrdenCompra, updateOrdenCompra, OC_PAGE_SIZE,
} from "@/lib/ordenes-compra-api";
import { listProveedores } from "@/lib/proveedores-api";
import { usePartesCatalogo } from "@/lib/queries";
import OCDetalle from "./OCDetalle";
import OCForm from "./OCForm";
import { OCFiltrosBar } from "./OCFiltrosBar";
import { EmptyState, EmptyDetail } from "@/components/EmptyState";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import {
  EMPTY_FILTROS_OC, FILTER_ORDER_OC, FILTER_META_OC,
  contarFiltrosOC, initialFilterKeysOC, filterKeysStorageKeyOC,
  type FiltrosOC, type FilterKeyOC,
} from "./filter-registry";
import { aplicarFiltrosOC, aplicarBusquedaOC } from "./filter-predicate";
import { ESTADO_OC_LABELS, ESTADO_OC_COLOR } from "@/types/ordenes-compra";
import type {
  OrdenCompra, OrdenCompraForm, OrdenCompraLineaForm, OrdenCompraListItem,
} from "@/types/ordenes-compra";

export default function OrdenesCompraPage() {
  const suscripcion = useSuscripcion();
  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  // El item del sidebar ya se oculta, pero un enlace guardado entraría igual:
  // la ruta se defiende sola.
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.ordenes_compra) {
    return (
      <UpgradePrompt
        variant="card"
        title="Las órdenes de compra están disponibles en Pro"
        description="Sube tu plan para emitir órdenes de compra a tus proveedores y seguir su recepción."
        upgradeTo="Pro"
      />
    );
  }
  return <OrdenesCompraPageInner />;
}

function OrdenesCompraPageInner() {
  const queryClient = useQueryClient();
  const [wsId, setWsId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<OrdenCompra | null>(null);
  const [lineasDetalle, setLineasDetalle] = useState<OrdenCompraLineaForm[]>([]);
  const [search, setSearch] = useState("");
  const { selectedId, open, close } = useDeepLinkId("/ordenes-compra");
  const [modo, setModo] = useState<"ver" | "crear" | "editar">("ver");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosOC>(EMPTY_FILTROS_OC);
  const [visibleKeys, setVisibleKeys] = useState<FilterKeyOC[]>(() => initialFilterKeysOC(null));

  useEffect(() => {
    let active = true;
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!active) return;
      setWsId(data?.workspace_id ?? null);
      setRol(data?.rol ?? null);
    }
    load();
    return () => { active = false; };
  }, []);

  /**
   * Que chips arrancan en la barra, por workspace.
   *
   * Se lee en un efecto y no en el useState inicial porque el servidor no ve
   * localStorage: sembrarlo en el estado inicial hacia que el HTML del servidor
   * y el del cliente no coincidieran. Mismo patron que la bandeja de OT.
   */
  useEffect(() => {
    if (!wsId) return;
    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem(filterKeysStorageKeyOC(wsId));
      if (raw) saved = JSON.parse(raw) as string[];
    } catch {
      // localStorage puede estar bloqueado (ventana privada). Los chips por
      // defecto son una preferencia, no datos: si no se puede leer, se usan
      // los de siempre y no pasa nada.
    }
    const activos = FILTER_ORDER_OC.filter(k => FILTER_META_OC[k].count(filtros) > 0);
    setVisibleKeys(initialFilterKeysOC(saved, activos));
    // Solo al resolver el workspace: despues los gobierna la barra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId]);

  function cambiarVisibleKeys(keys: FilterKeyOC[]) {
    setVisibleKeys(keys);
    if (!wsId) return;
    try {
      localStorage.setItem(filterKeysStorageKeyOC(wsId), JSON.stringify(keys));
    } catch {
      // Ver arriba: no poder guardar la preferencia no rompe el filtrado.
    }
  }

  /**
   * Lista paginada y cacheada.
   *
   * Antes esto llamaba a `listOrdenesCompra()` sin argumentos, y como la API
   * pagina de a 20 por defecto, la lista se quedaba topada en las 20 ordenes
   * mas nuevas para siempre. Peor: la busqueda filtra sobre lo cargado, asi que
   * buscar la orden #25 devolvia "Sin resultados" con la orden existiendo.
   *
   * `maxPages` acota el refetch: sin el, volver a montar la lista despues de
   * scrollear re-pide TODAS las paginas una por una.
   */
  const query = useInfiniteQuery({
    queryKey: ["ordenes-compra", "lista"],
    queryFn: ({ pageParam }) => listOrdenesCompra(pageParam as number),
    initialPageParam: 0,
    // Una pagina incompleta significa que no hay mas: no hace falta un count().
    getNextPageParam: (ultima, todas) =>
      ultima.length < OC_PAGE_SIZE ? undefined : todas.length * OC_PAGE_SIZE,
    maxPages: 10,
  });

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const loading = query.isLoading;
  const listError = query.error ? (query.error as Error).message : null;

  /** Opciones del filtro por proveedor. Sin paginar, igual que /proveedores. */
  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores", "lista", false],
    queryFn: () => listProveedores(false),
    staleTime: 15 * 60 * 1000,
  });

  /** Opciones del filtro por material: el catalogo ya cacheado 15 min. */
  const { data: partes = [] } = usePartesCatalogo();

  useEffect(() => {
    let active = true;
    if (!selectedId) { setDetalle(null); return; }
    getOrdenCompra(selectedId)
      .then(oc => { if (active) setDetalle(oc); })
      .catch(e => setError((e as Error).message));
    return () => { active = false; };
  }, [selectedId]);

  const isAdmin = rol === "admin" || rol === "owner";

  const filtered = useMemo(
    () => aplicarBusquedaOC(aplicarFiltrosOC(items, filtros), search),
    [items, filtros, search],
  );

  const hayFiltros = contarFiltrosOC(filtros) > 0;
  const hayBusqueda = search.trim().length > 0;

  // Mantiene el detalle util desde el primer render de una lista con datos.
  useEffect(() => {
    if (modo === "ver" && filtered.length > 0 && !filtered.some(oc => oc.id === selectedId)) {
      open(filtered[0].id);
    }
  }, [filtered, selectedId, modo, open]);

  /**
   * Centinela de scroll infinito.
   *
   * No se monta con busqueda o filtros activos: los dos son locales sobre lo
   * cargado, asi que traer mas paginas no cambiaria lo que se ve.
   */
  const sentinelaRef = useRef<HTMLDivElement | null>(null);
  const puedeCargarMas = query.hasNextPage && !hayBusqueda && !hayFiltros;
  useEffect(() => {
    const el = sentinelaRef.current;
    if (!el || !puedeCargarMas) return;
    const obs = new IntersectionObserver(
      entradas => { if (entradas[0]?.isIntersecting) query.fetchNextPage(); },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [puedeCargarMas, query.fetchNextPage, items.length]);

  async function recargar() {
    await queryClient.invalidateQueries({ queryKey: ["ordenes-compra", "lista"] });
  }

  async function abrirEdicion() {
    if (!detalle) return;
    const l = await listLineas(detalle.id);
    setLineasDetalle(l.map(x => ({
      parte_id: x.parte_id, descripcion: x.descripcion, codigo: x.codigo,
      unidad: x.unidad, cantidad: x.cantidad,
      precio_unitario: x.precio_unitario, descuento: x.descuento,
    })));
    setModo("editar");
  }

  async function handleCreate(v: OrdenCompraForm) {
    setGuardando(true); setError(null);
    try {
      const nueva = await createOrdenCompra(v);
      await recargar();
      open(nueva.id);
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally { setGuardando(false); }
  }

  async function handleUpdate(v: OrdenCompraForm) {
    if (!detalle) return;
    setGuardando(true); setError(null);
    try {
      await updateOrdenCompra(detalle.id, v);
      setDetalle(await getOrdenCompra(detalle.id));
      await recargar();
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally { setGuardando(false); }
  }

  async function refrescarDetalle() {
    if (!detalle) return;
    setDetalle(await getOrdenCompra(detalle.id));
    await recargar();
  }

  const errorVisible = error ?? listError;

  return (
    // Tono canvas en la raiz: sin esto el panel derecho quedaba blanco puro y
    // las tarjetas blancas de la izquierda perdian su borde contra el fondo.
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>

      {/* Barra de herramientas. Misma construccion que /planes y /ordenes:
          tono canvas porque es chrome —no una superficie de contenido— y
          controles de 38px. */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gridTemplateRows: "38px 32px", alignItems: "start", padding: "9px 20px", minHeight: 96, columnGap: 12, rowGap: 8 }}>
          <div style={{ display: "contents" }}>
          <div style={{ position: "relative", width: 320, maxWidth: "100%", gridColumn: 2, gridRow: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar por número o proveedor…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", height: 38, paddingLeft: 34, paddingRight: search ? 32 : 10,
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 14, fontWeight: 400,
                background: "var(--surface-1)", outline: "none", fontFamily: "inherit", color: "var(--fg-1)",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Limpiar búsqueda"
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ gridColumn: 1, gridRow: 2 }}>
          <OCFiltrosBar
            filtros={filtros}
            onChange={setFiltros}
            proveedores={proveedores}
            materiales={partes}
            visibleKeys={visibleKeys}
            onVisibleKeysChange={cambiarVisibleKeys}
          />
          </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => { setModo("crear"); close(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px",
                background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit", whiteSpace: "nowrap", gridColumn: 3, gridRow: 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
            >
              <Plus size={16} strokeWidth={2} />
              Nueva orden
            </button>
          )}
        </div>
      </div>

      {errorVisible && (
        <div style={{ flexShrink: 0, padding: "8px 16px", fontSize: 14, background: "var(--danger-bg)", color: "var(--danger)", borderBottom: "1px solid var(--border)" }}>
          {errorVisible}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        <div style={{
          width: 380, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart size={38} strokeWidth={1.4} />}
              title={
                hayBusqueda || hayFiltros
                  ? "Ninguna orden coincide con la búsqueda"
                  : "Todavía no hay órdenes de compra"
              }
              description="Una orden de compra registra lo que se le pide a un proveedor y se va cerrando a medida que llega la mercadería. Se crean a mano, o solas desde un plan de mantención con materiales."
              onCreate={isAdmin ? () => { setModo("crear"); close(); } : undefined}
              createLabel="Crear la primera"
              hasSearch={hayBusqueda || hayFiltros}
            />
          ) : (
            <>
              {filtered.map(oc => (
                <button
                  key={oc.id}
                  onClick={() => { open(oc.id); setModo("ver"); }}
                  onMouseEnter={e => { if (selectedId !== oc.id) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (selectedId !== oc.id) e.currentTarget.style.background = "var(--surface-1)"; }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                    padding: "12px 14px", borderRadius: "var(--r-lg)", cursor: "pointer",
                    border: "1px solid " + (selectedId === oc.id ? "var(--brand)" : "var(--border)"),
                    background: selectedId === oc.id ? "var(--row-selected)" : "var(--surface-1)",
                    // Seleccion con acento de 3px y borde de 1px, para que el
                    // contenido no se corra al seleccionar. Igual que OTRow.
                    boxShadow: selectedId === oc.id ? "inset 3px 0 0 0 var(--brand)" : "none",
                    fontFamily: "inherit", flexShrink: 0,
                  }}
                >
                  <span style={{
                    width: 32, height: 32, borderRadius: "var(--r-md)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "var(--brand-tint)", color: "var(--brand)",
                  }}>
                    <ShoppingCart size={16} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, color: "var(--fg-1)" }}>
                        {oc.numero_manual || (oc.numero != null ? `#${oc.numero}` : "—")}
                      </span>
                      <span style={{ fontSize: 14, color: ESTADO_OC_COLOR[oc.estado] }}>
                        {ESTADO_OC_LABELS[oc.estado]}
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {oc.proveedor_nombre ?? "Sin proveedor"} · {oc.lineas_count} ítem{oc.lineas_count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span style={{ fontSize: 14, color: "var(--fg-1)", flexShrink: 0 }}>
                    {formatearCLP(oc.total)}
                  </span>
                </button>
              ))}

              {puedeCargarMas && <div ref={sentinelaRef} style={{ height: 1 }} />}
              {query.isFetchingNextPage && (
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", background: "var(--surface-canvas)" }}>
          {modo === "crear" ? (
            <OCForm
              wsId={wsId}
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleCreate}
            />
          ) : modo === "editar" && detalle ? (
            <OCForm
              key={detalle.id}
              inicial={detalle}
              lineasIniciales={lineasDetalle}
              wsId={wsId}
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleUpdate}
            />
          ) : detalle ? (
            <OCDetalle
              oc={detalle}
              isAdmin={isAdmin}
              onEdit={abrirEdicion}
              onCambio={refrescarDetalle}
            />
          ) : (
            <EmptyDetail
              icon={<ShoppingCart size={28} strokeWidth={1.5} />}
              title="Selecciona una orden de compra"
            />
          )}
        </div>
      </div>
    </div>
  );
}
