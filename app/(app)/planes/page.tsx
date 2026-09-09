"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Wrench, Plus, Search, Loader2, Box, CalendarClock, RotateCw, FileText,
  ClockFading, MoreVertical, Trash2,
} from "lucide-react";
import { listPlanes, archivePlan, deletePlan, PLANES_PAGE_SIZE } from "@/lib/planes-api";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { RECURRENCIA_PLAN_LABELS, type PlanListItem } from "@/types/planes";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import PlanDetalle from "./PlanDetalle";

/**
 * Listado de planes de mantención.
 *
 * La columna que importa es "Próxima": un plan existe para responder cuándo
 * viene lo siguiente, así que esa fecha va en la fila y no escondida en un
 * detalle. Los planes que ya entraron en su ventana de aviso se marcan, porque
 * son los que necesitan preparación (conseguir los insumos) antes de la fecha.
 */
/**
 * Ocultar el ítem del sidebar no alcanza: la URL se puede escribir a mano, así
 * que el gate de plan se aplica también aquí. Mismo patrón que /partes.
 */
export default function PlanesPage() {
  const suscripcion = useSuscripcion();

  if (suscripcion.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.planes_mantencion) {
    return (
      <UpgradePrompt
        variant="card"
        title="Los planes de mantención están disponibles en Pro"
        description="Sube tu plan para programar mantenciones con meses de anticipación y prepararlas antes de que venzan."
        upgradeTo="Pro"
      />
    );
  }
  return <PlanesPageInner />;
}

function PlanesPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [archivando, setArchivando] = useState<string | null>(null);

  // `?id=` abre el panel directo: es a donde vuelve el formulario después de
  // crear, así que el plan recién hecho se muestra sin buscarlo en la lista.
  //
  // Se lee en un efecto y no en el useState inicial porque el servidor no ve
  // el query param: sembrarlo en el estado inicial hacía que el HTML del
  // servidor (sin panel) no coincidiera con el del cliente (con panel), y React
  // descartaba el árbol con un error de hidratación.
  const searchParams = useSearchParams();
  const [abiertoId, setAbiertoId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) setAbiertoId(id);
    // Solo al montar: después de eso el panel lo gobiernan abrir() y cerrar(),
    // que ya escriben la URL con replaceState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrir(id: string) {
    setAbiertoId(id);
    // replace y no push: el panel es un estado de esta pantalla, no un destino
    // propio; "atrás" debe salir de /planes, no cerrar el panel.
    window.history.replaceState(null, "", `/planes?id=${id}`);
  }

  function cerrar() {
    setAbiertoId(null);
    window.history.replaceState(null, "", "/planes");
  }

  /**
   * Lista paginada y cacheada.
   *
   * De a 20: cargar todos los planes de un workspace con cientos de equipos
   * traía filas que nadie iba a mirar. El cache de TanStack (staleTime global
   * de 5 min) evita además re-pedirlos al volver desde el detalle.
   *
   * `maxPages` acota el refetch: sin él, volver a montar la lista después de
   * scrollear re-pide TODAS las páginas una por una.
   */
  const query = useInfiniteQuery({
    queryKey: ["planes", "lista"],
    queryFn: ({ pageParam }) => listPlanes(false, pageParam as number),
    initialPageParam: 0,
    // Una página incompleta significa que no hay más: no hace falta un count().
    getNextPageParam: (ultima, todas) =>
      ultima.length < PLANES_PAGE_SIZE ? undefined : todas.length * PLANES_PAGE_SIZE,
    maxPages: 10,
  });

  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const loading = query.isLoading;
  const error = query.error ? (query.error as Error).message : null;

  /** Quita un plan del cache sin volver a pedir la lista. */
  function quitarDelCache(id: string) {
    queryClient.setQueryData<{ pages: PlanListItem[][]; pageParams: unknown[] }>(
      ["planes", "lista"],
      prev => prev && {
        ...prev,
        // Se recorren las páginas en vez del array plano: el cache guarda
        // { pages, pageParams } y aplastarlo rompería la paginación.
        pages: prev.pages.map(p => p.filter(x => x.id !== id)),
      },
    );
  }

  // Centinela para cargar la página siguiente al llegar al final.
  const sentinelaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelaRef.current;
    if (!el || !query.hasNextPage) return;
    const obs = new IntersectionObserver(
      entradas => { if (entradas[0]?.isIntersecting) query.fetchNextPage(); },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [query.hasNextPage, query.fetchNextPage, items.length]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    // Buscar por número: "#12" y "12" llegan al mismo plan. Es coincidencia
    // exacta y no `includes`, porque buscar "1" debe dar el plan 1, no el 1, el
    // 12 y el 21.
    const soloDigitos = q.replace(/^#/, "");
    const esNumero = /^\d+$/.test(soloDigitos);

    return items.filter(p =>
      (esNumero && p.numero === Number(soloDigitos)) ||
      p.nombre.toLowerCase().includes(q) ||
      (p.activo_nombre ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  async function handleEliminar(p: PlanListItem) {
    // Confirmación explícita y con el nombre: a diferencia de pausar, esto no
    // se deshace. Se aclara que las OTs ya creadas se conservan, que es la duda
    // razonable al borrar un plan que lleva tiempo corriendo.
    const ok = confirm(
      `¿Eliminar el plan “${p.nombre}”?\n\n` +
      "Se borrarán sus fechas programadas. Las órdenes de trabajo que ya generó " +
      "se conservan.\n\nEsta acción no se puede deshacer."
    );
    if (!ok) return;
    try {
      await deletePlan(p.id);
      quitarDelCache(p.id);
      if (abiertoId === p.id) cerrar();
    } catch (e: any) {
      alert(e?.message ?? "No se pudo eliminar el plan.");
    }
  }

  async function handleArchivar(p: PlanListItem) {
    if (!confirm(`¿Pausar el plan “${p.nombre}”? Dejará de generar órdenes.`)) return;
    setArchivando(p.id);
    try {
      await archivePlan(p.id);
      quitarDelCache(p.id);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo pausar el plan.");
    } finally {
      setArchivando(null);
    }
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* Barra de herramientas.
          Misma construcción que la de Órdenes (OrdenesBandeja): tono canvas
          porque es chrome —no una superficie de contenido—, controles de 38px
          y el buscador con el ícono absoluto. Sin título ni ícono: la ruta ya
          la dice la miga de arriba, repetirla solo gasta la fila. */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          padding: "9px 20px", minHeight: 56, gap: 8, flexWrap: "wrap",
        }}>
          <div style={{ position: "relative", maxWidth: 280, minWidth: 220, flex: "1 1 220px" }}>
            <Search size={14} style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--fg-4)", pointerEvents: "none",
            }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar plan o activo"
              style={{
                paddingLeft: 34, paddingRight: 10,
                height: 38, width: "100%",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                background: "var(--surface-1)", outline: "none", fontFamily: "inherit",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
          </div>

          <button
            onClick={() => router.push("/planes/crear")}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 16px", height: 38,
              background: "var(--brand)", color: "var(--fg-on-brand)",
              border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 400,
              cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap", flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo plan
          </button>
        </div>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{
          flex: "0 0 510px", minWidth: 0, overflowY: "auto", padding: 10,
          borderRight: "1px solid var(--border)",
        }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--fg-4)" }} />
          </div>
        ) : error ? (
          <p style={{ fontSize: 14, color: "var(--danger, #b42318)" }}>{error}</p>
        ) : filtrados.length === 0 ? (
          <EmptyState hayBusqueda={search.trim().length > 0} onCrear={() => router.push("/planes/crear")} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 1100 }}>
            {filtrados.map(p => (
              <PlanCard
                key={p.id}
                plan={p}
                seleccionado={abiertoId === p.id}
                onAbrir={() => abrir(p.id)}
              />
            ))}

            {/* Centinela: al entrar en viewport pide la página siguiente. No se
                monta mientras hay búsqueda activa porque el filtro es local y
                traer más páginas no cambiaría lo que se ve. */}
            {query.hasNextPage && !search.trim() && (
              <div ref={sentinelaRef} style={{ height: 1 }} />
            )}
            {query.isFetchingNextPage && (
              <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
              </div>
            )}
          </div>
        )}
        </div>
        {abiertoId ? (
          <PlanDetalle
            embedded
            id={abiertoId}
            onClose={cerrar}
            onArchivar={() => {
              const p = items.find(x => x.id === abiertoId);
              if (p) { cerrar(); handleArchivar(p); }
            }}
            onEditar={() => router.push(`/planes/crear?editar=${abiertoId}`)}
            onEliminar={() => {
              const p = items.find(x => x.id === abiertoId);
              if (p) handleEliminar(p);
            }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--surface-canvas)" }}>
            <span style={{ width: 64, height: 64, borderRadius: 14, background: "var(--surface-hover)", color: "var(--fg-4)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <FileText size={28} strokeWidth={1.5} />
            </span>
            <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>Selecciona un plan</p>
            <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "4px 0 0" }}>El detalle aparecerá aquí</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Misma composición de tarjetas individuales usada en la bandeja de OT. */
function PlanCard({ plan, seleccionado, onAbrir }: {
  plan: PlanListItem;
  seleccionado: boolean;
  onAbrir: () => void;
}) {
  const frecuencia = RECURRENCIA_PLAN_LABELS[plan.recurrencia] ?? plan.recurrencia;

  return (
    <article
      onClick={onAbrir}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
      style={{
        // `gap` fijo en vez de `space-between`: con space-between el sobrante de
        // la altura mínima se repartía entre los elementos, así que cada tarjeta
        // separaba distinto según cuánto contenido tuviera. Sin minHeight la
        // tarjeta mide lo que mide su contenido y todas respiran igual.
        boxSizing: "border-box", display: "flex", flexDirection: "column",
        gap: 8, padding: "12px 14px",
        background: seleccionado ? "var(--brand-tint)" : "var(--surface-1)",
        border: `1px solid ${seleccionado ? "var(--brand)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)", boxShadow: seleccionado ? "inset 3px 0 0 0 var(--brand)" : "none",
        transition: "background var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease)", cursor: "pointer",
      }}
      onMouseEnter={e => { if (!seleccionado) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!seleccionado) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      {/* Solo el título: Pausar y Eliminar viven en el panel de detalle, que
          es donde se opera sobre un plan ya elegido. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {plan.nombre}
        </span>
      </div>

      {/* El activo: es de lo que trata el plan, y con la miniatura se reconoce
          sin leer. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        {plan.activo_imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={plan.activo_imagen}
            alt=""
            style={{
              width: 28, height: 28, borderRadius: "var(--r-sm)",
              objectFit: "cover", background: "var(--surface-hover)", flexShrink: 0,
            }}
          />
        ) : (
          <span style={{
            width: 28, height: 28, borderRadius: "var(--r-sm)",
            background: "var(--brand-tint)", color: "var(--brand)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Box size={15} />
          </span>
        )}
        <span style={{
          minWidth: 0, fontSize: 14, color: "var(--fg-1)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {plan.activo_nombre ?? "Sin activo asociado"}
        </span>
        {/* El numero de plan viaja con el activo en vez de ocupar una fila
            propia: es un dato corto y de referencia. */}
        {plan.numero != null && (
          <span style={{ fontSize: 14, color: "var(--fg-4)", flexShrink: 0, marginLeft: "auto" }}>
            #{plan.numero}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <PlanBadge icon={<RotateCw size={14} color="var(--brand)" strokeWidth={2.25} />}>
          {frecuencia}
        </PlanBadge>
        <ProximaFecha fecha={plan.proxima_fecha} diasAviso={plan.dias_aviso_previo} />
      </div>
    </article>
  );
}

function PlanBadge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, minHeight: 22, padding: "0 8px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontWeight: 400, whiteSpace: "nowrap" }}>
      {icon}
      {children}
    </span>
  );
}

/**
 * La fecha, y si ya entró en la ventana de aviso, cuántos días faltan.
 * Ese resalte es el punto del módulo: avisar con tiempo de comprar los insumos.
 */
function ProximaFecha({ fecha, diasAviso }: { fecha: string | null; diasAviso: number }) {
  if (!fecha) {
    return <span style={{ color: "var(--fg-4)" }}>Sin próxima fecha</span>;
  }

  // Fechas 'date' de Postgres: se parten a mano para no pasar por el parser de
  // Date, que interpreta "2026-10-01" como UTC y puede restar un día.
  const [y, m, d] = fecha.split("-").map(Number);
  const venc = new Date(y, m - 1, d);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
  const enVentana = dias >= 0 && dias <= diasAviso;

  return (
    <span style={{
      display: "flex", alignItems: "center", gap: 6,
      color: enVentana ? "var(--brand)" : "var(--fg-2)",
      fontWeight: enVentana ? 500 : 400,
    }}>
      {enVentana && <CalendarClock size={14} style={{ flexShrink: 0 }} />}
      {/* La fecha sola no decia de que fecha se trataba (¿creado?, ¿vence?).
          "Próxima" es la que menos texto necesita para quedar claro: es cuando
          el plan vuelve a generar una OT. */}
      <span style={{ color: "var(--fg-4)", fontWeight: 400 }}>Próxima:</span>
      {venc.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
      {enVentana && (
        <span style={{ fontSize: 14, color: "var(--fg-3)", fontWeight: 400 }}>
          ({dias === 0 ? "hoy" : `en ${dias} d`})
        </span>
      )}
    </span>
  );
}

function EmptyState({ hayBusqueda, onCrear }: { hayBusqueda: boolean; onCrear: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "70px 20px", textAlign: "center",
    }}>
      <span style={{
        width: 92, height: 92, borderRadius: "50%",
        background: "var(--brand-tint)", color: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
      }}>
        <Wrench size={38} strokeWidth={1.4} />
      </span>
      <p style={{ fontSize: 14, color: "var(--fg-1)", fontWeight: 500, margin: 0 }}>
        {hayBusqueda ? "Ningún plan coincide con la búsqueda" : "Todavía no hay planes de mantención"}
      </p>
      {!hayBusqueda && (
        <>
          <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "8px 0 20px", maxWidth: 430 }}>
            Un plan declara por adelantado cuándo hay que mantener un activo, y avisa
            con anticipación para preparar la mantención.
          </p>
          <button
            onClick={onCrear}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 17px", borderRadius: 8, border: "none",
              background: "var(--brand)", color: "#fff",
              fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            <Plus size={15} />
            Crear el primero
          </button>
        </>
      )}
    </div>
  );
}
