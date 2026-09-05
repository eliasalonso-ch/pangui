"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bell, CalendarClock, Check, CheckCheck, Circle,
  ExternalLink, Info, Loader2, Package, PackageSearch, Search, Square,
  SquareCheckBig, Trash2, Wrench, X,
} from "lucide-react";
import { getAuthUser } from "@/lib/auth-user";
import AppLoadingState from "@/components/AppLoadingState";
import { NOTIFICACIONES_PAGE_SIZE, useNotificaciones, type NotificationRow as Notif } from "@/hooks/useNotificaciones";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";

const TYPE_ICON: Record<string, React.ElementType> = {
  emergencia: AlertTriangle, ot: Wrench, orden: Wrench, asignado: Wrench,
  estado_cambiado: Wrench, completado: CheckCheck, procedimiento_completado: CheckCheck,
  preventivo: CalendarClock, inventario: Package, inventario_stock_bajo: Package,
  solicitud_materiales: PackageSearch, tipo_trabajo_actualizado: Search,
  ot_vencida: AlertTriangle, ot_urgente_sin_asignar: AlertTriangle,
};

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} día${days === 1 ? "" : "s"}`;
  return new Date(value).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function destination(url: string | null) {
  if (!url) return null;
  const order = url.match(/(?:^|\/)orden(?:es)?\/([0-9a-f-]{36})/i);
  if (order?.[1]) return { href: `/ordenes?id=${encodeURIComponent(order[1])}`, external: false };
  if (url.startsWith("/")) return { href: url, external: false };
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  return null;
}

export default function NotificacionesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  // Modo seleccion: apagado por defecto. `selected` solo tiene sentido con
  // `selecting` encendido, pero se guarda aparte para poder vaciarlo al salir.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Confirmacion de los dos borrados. Ninguno se puede deshacer -- no hay
   * papelera ni undo -- asi que los dos pasan por un modal. Marcar como leida
   * no: es reversible con el mismo boton.
   */
  const [confirming, setConfirming] = useState<null | "seleccion" | "todo">(null);

  // Mismo cache que la campana de la topbar y el item del sidebar: marcar leida
  // aca apaga el punto alla sin esperar un evento realtime. El canal realtime
  // unico lo abre AppSidebar.
  //
  // `onlyUnread` va a la query, no a un filter() local. Con paginacion filtrar
  // en el cliente romperia el scroll: una pagina de 30 con 3 sin leer pintaria
  // 3 filas y el sentinel nunca volveria a entrar en viewport.
  const {
    items, unreadCount, loading,
    hasNextPage, isFetchingNextPage, fetchNextPage,
    setRead: setReadById, markAllRead: markAll, clearAll: clearAllItems,
    setReadMany, removeMany,
  } = useNotificaciones(userId, { onlyUnread });

  useEffect(() => {
    let active = true;
    // getAuthUser() y no createClient().auth.getUser(): el primero comparte una
    // sola consulta entre todos los consumidores, el segundo va a la red cada
    // vez y de paso pide el access token, que puede disparar un refresh.
    void getAuthUser().then((user) => {
      if (!active) return;
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
    });
    return () => { active = false; };
  }, [router]);

  // El filtro ya viene aplicado desde el servidor.
  const visible = items;

  /**
   * Scroll infinito. `rootMargin` dispara la carga 300px antes de que el
   * centinela sea visible, asi que la pagina siguiente suele estar lista antes
   * de que el usuario llegue al fondo. Mismo patron que /ubicaciones.
   */
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) fetchNextPage(); },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  function setRead(item: Notif, leida: boolean) {
    setReadById(item.id, leida);
  }

  function markAllRead() {
    markAll();
  }

  function clearAll() {
    clearAllItems();
  }

  // ── Seleccion ────────────────────────────────────────────────────────────

  function toggleSelected(id: string) {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  /**
   * Solo cuentan las filas cargadas. "Seleccionar todo" no puede abarcar lo que
   * todavia no se ha traido: prometeria borrar cosas que el usuario no vio.
   */
  const selectedIds = useMemo(
    () => visible.filter(item => selected.has(item.id)).map(item => item.id),
    [visible, selected],
  );
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map(item => item.id)));
  }

  /**
   * Si todas las seleccionadas ya estan leidas, el boton las marca como NO
   * leidas. Con una mezcla, marcarlas como leidas es lo que se espera.
   */
  const selectedAllRead =
    selectedIds.length > 0 &&
    selectedIds.every(id => visible.find(item => item.id === id)?.leida);

  function applyRead() {
    setReadMany(selectedIds, !selectedAllRead);
    exitSelecting();
  }

  function applyDelete() {
    removeMany(selectedIds);
    exitSelecting();
    setConfirming(null);
  }

  function applyClearAll() {
    clearAll();
    exitSelecting();
    setConfirming(null);
  }

  function open(item: Notif) {
    const target = destination(item.url);
    if (!item.leida) setRead(item, true);
    if (!target) return;
    if (target.external) window.open(target.href, "_blank", "noopener,noreferrer");
    else router.push(target.href);
  }

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>
      <section style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
        <div style={{ minHeight: 66, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)" }}><Bell size={16} /></span>
            <div>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Bandeja de notificaciones</h2>
              <p style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{unreadCount} sin leer</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* En modo seleccion la barra cambia entera: las acciones globales
                ("todas", "limpiar todo") conviven mal con una seleccion, y las
                de la seleccion ocupan su lugar. */}
            {selecting ? (
              <>
                <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>
                  {selectedIds.length} seleccionada{selectedIds.length === 1 ? "" : "s"}
                </span>
                {visible.length > 0 && (
                  <button type="button" onClick={toggleSelectAll} style={buttonStyle}>
                    {allSelected ? <Square size={16} /> : <SquareCheckBig size={16} />}
                    {allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                  </button>
                )}
                {selectedIds.length > 0 && (
                  <>
                    <button type="button" onClick={applyRead} style={buttonStyle}>
                      {selectedAllRead ? <Circle size={16} /> : <Check size={16} />}
                      {selectedAllRead ? "Marcar como no leídas" : "Marcar como leídas"}
                    </button>
                    <button type="button" onClick={() => setConfirming("seleccion")} style={dangerButtonStyle}>
                      <Trash2 size={16} /> Eliminar
                    </button>
                  </>
                )}
                <button type="button" onClick={exitSelecting} style={buttonStyle}><X size={16} /> Cancelar</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setOnlyUnread(value => !value)} style={{ height: 32, padding: "0 11px", border: `1px solid ${onlyUnread ? "var(--brand)" : "var(--border)"}`, borderRadius: 7, background: onlyUnread ? "var(--brand-tint)" : "var(--surface-1)", color: onlyUnread ? "var(--brand)" : "var(--fg-3)", font: "inherit", fontSize: 14, fontWeight: 400, cursor: "pointer" }}>Solo no leídas</button>
                {visible.length > 0 && <button type="button" onClick={() => setSelecting(true)} style={buttonStyle}><SquareCheckBig size={16} /> Seleccionar</button>}
                {unreadCount > 0 && <button type="button" onClick={markAllRead} style={buttonStyle}><CheckCheck size={16} /> Marcar todas como leídas</button>}
                {visible.length > 0 && <button type="button" onClick={() => setConfirming("todo")} style={buttonStyle}><Trash2 size={16} color="var(--danger)" /> Limpiar todo</button>}
              </>
            )}
          </div>
        </div>

        {loading ? (
          <AppLoadingState label="Cargando notificaciones…" minHeight={220} />
        ) : visible.length === 0 ? (
          <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)" }}>
            <CheckCheck size={36} style={{ opacity: .35 }} />
            <span style={{ fontSize: 14, fontWeight: 400 }}>{onlyUnread ? "No tienes notificaciones sin leer" : "No tienes notificaciones"}</span>
          </div>
        ) : (<>
          {visible.map(item => {
          const Icon = TYPE_ICON[item.tipo] ?? Info;
          const target = destination(item.url);
          const isSelected = selected.has(item.id);
          return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)", background: isSelected ? "var(--surface-hover)" : item.leida ? "var(--surface-1)" : "var(--brand-tint)" }}>
              {/* La casilla va ANTES del icono, y solo existe en modo seleccion. */}
              {selecting && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(item.id)}
                  aria-label={`Seleccionar ${item.titulo}`}
                  style={{ width: 16, height: 16, flexShrink: 0, accentColor: "var(--brand)", cursor: "pointer" }}
                />
              )}
              <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)" }}><Icon size={16} /></span>
              {/* Seleccionando, la fila entera alterna la casilla en vez de
                  navegar: abrir una OT a media seleccion pierde el trabajo. */}
              <button type="button" onClick={() => selecting ? toggleSelected(item.id) : void open(item)} style={{ minWidth: 0, flex: 1, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: selecting || target ? "pointer" : "default", fontFamily: "inherit" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <strong style={{ color: "var(--fg-1)", fontSize: 14, fontWeight: 400 }}>{item.titulo}</strong>
                  {target?.external && <ExternalLink size={12} color="var(--fg-4)" />}
                </span>
                {item.mensaje && <span style={{ display: "block", marginTop: 2, color: "var(--fg-3)", fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>{item.mensaje}</span>}
                <span style={{ display: "block", marginTop: 4, color: "var(--fg-4)", fontSize: 14, fontWeight: 400 }}>{relativeTime(item.created_at)}</span>
              </button>
            </div>
          );
          })}
          {/* Centinela: entra en viewport 300px antes del fondo y pide la
              pagina siguiente. Solo se pinta si queda algo por traer, si no
              el observer se re-suscribiria para siempre sobre un nodo muerto. */}
          {hasNextPage && (
            <div ref={sentinelRef} style={{ padding: 16, display: "flex", justifyContent: "center" }}>
              {isFetchingNextPage && <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />}
            </div>
          )}
          {!hasNextPage && visible.length > NOTIFICACIONES_PAGE_SIZE && (
            <div style={{ padding: "14px 16px 20px", textAlign: "center", fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>
              {visible.length} en total
            </div>
          )}
        </>)}
      </section>

      {/* Mismo dialogo que usa OTDetail para borrar una OT. No es el
          AlertDialog de shadcn a proposito: ese pinta su overlay con z-50 y la
          topbar es zIndex 100, asi que la barra superior se quedaba iluminada
          por encima del fondo oscuro. */}
      <ConfirmDeleteModal
        pending={confirming === null ? null : confirming === "todo" ? {
          title: "¿Limpiar todas las notificaciones?",
          description: "Se eliminarán todas tus notificaciones, incluidas las que aún no se han cargado en pantalla. Esta acción no se puede deshacer.",
          confirmLabel: "Eliminar",
          onConfirm: applyClearAll,
        } : {
          title: "¿Eliminar las notificaciones seleccionadas?",
          description: `Se eliminará${selectedIds.length === 1 ? "" : "n"} ${selectedIds.length} notificación${selectedIds.length === 1 ? "" : "es"}. Esta acción no se puede deshacer.`,
          confirmLabel: "Eliminar",
          onConfirm: applyDelete,
        }}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}

/** Eliminar es destructivo y no se puede deshacer: se marca en rojo. */
const dangerButtonStyle: React.CSSProperties = {
  height: 32, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6,
  border: "1px solid color-mix(in srgb, var(--danger) 45%, transparent)", borderRadius: 7,
  background: "color-mix(in srgb, var(--danger) 10%, transparent)",
  color: "var(--danger)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  height: 32, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6,
  border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface-1)",
  color: "var(--fg-3)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit",
};
