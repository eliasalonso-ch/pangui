"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  BellDot,
  CalendarClock,
  Check,
  CheckCheck,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  Info,
  Loader2,
  MessageSquare,
  Package,
  PackageSearch,
  Search,
  Square,
  SquareCheckBig,
  Trash2,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-user";
import { useNotificaciones, type NotificationRow } from "@/hooks/useNotificaciones";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";

const TYPE_ICON: Record<string, typeof Info> = {
  emergencia: AlertTriangle,
  ot: Wrench,
  orden: Wrench,
  asignado: Wrench,
  estado_cambiado: Wrench,
  completado: CheckCheck,
  procedimiento_completado: CheckCheck,
  preventivo: CalendarClock,
  inventario: Package,
  inventario_stock_bajo: Package,
  solicitud_materiales: PackageSearch,
  tipo_trabajo_actualizado: Search,
  // Overdue / stalled / unassigned OTs — these are nags, not news.
  ot_vencida: AlertTriangle,
  ot_urgente_sin_asignar: AlertTriangle,
  ot_abierta_sin_progreso: Clock,
  ot_sin_asignar: UserPlus,
  comentario: MessageSquare,
  archivo_ot: FileText,
  // MeConecta (UdeC portal) — links out to an external site.
  meconecta: ExternalLink,
};

/**
 * Where a notification should take you.
 *
 * `external` links (the MeConecta portal) open in a new tab instead of being
 * pushed through the router — previously these were returned as null and the
 * notification was silently unclickable.
 */
interface Destination {
  href: string;
  external: boolean;
}

function destination(url: string | null): Destination | null {
  if (!url) return null;
  if (url.startsWith("/ordenes?")) return { href: url, external: false };
  const order = url.match(/(?:^|\/)orden(?:es)?\/([0-9a-f-]{36})/i);
  if (order?.[1]) return { href: `/ordenes?id=${encodeURIComponent(order[1])}`, external: false };
  const material = url.match(/(?:^|\/)parte(?:s)?\/([0-9a-f-]{36})/i);
  if (material?.[1]) return { href: `/partes?material=${encodeURIComponent(material[1])}`, external: false };
  if (url.startsWith("/")) return { href: url, external: false };
  // Absolute http(s) URLs are legitimate destinations (MeConecta). Anything
  // else — javascript:, data:, mailto: — is refused rather than navigated to.
  if (/^https?:\/\//i.test(url)) return { href: url, external: true };
  return null;
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} día${days === 1 ? "" : "s"}`;
  return new Date(value).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

export default function NotificationMenu() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Modo seleccion, igual que en la bandeja. Se apaga al cerrar el menu: dejar
  // una seleccion viva en un dropdown cerrado no tiene forma de verse.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  // El fetch, el realtime y las mutaciones viven en useNotificaciones: este
  // menu y el item del sidebar comparten cache, asi que borrar algo aca apaga
  // el punto del sidebar en el mismo render. El canal realtime unico lo abre
  // AppSidebar, que esta siempre montado.
  //
  // `enabled: open` -- la campana vive en la topbar de toda la app, asi que sin
  // esto cada navegacion pagaba una pagina de filas que nadie estaba mirando.
  // El badge no depende de la lista: sale del contador, que es una query aparte
  // y se pide igual. `onlyUnread` viaja a la query porque con paginacion filtrar
  // despues de traer la pagina mostraria 3 de 30 y un scroll que no carga nada.
  const {
    items: notifications, unreadCount, loading,
    setRead, markAllRead: markAll,
    hasNextPage, isFetchingNextPage, fetchNextPage,
    setReadMany, removeMany,
  } = useNotificaciones(userId, { onlyUnread, enabled: open });

  useEffect(() => {
    let active = true;
    void getAuthUser().then((user) => {
      if (active && user) setUserId(user.id);
    });
    return () => { active = false; };
  }, []);

  // Cerrar el menu descarta la seleccion: reabrirlo con casillas marcadas de
  // una sesion anterior es una trampa, sobre todo con Eliminar a un clic.
  useEffect(() => {
    if (!open) exitSelecting();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Esc closes the menu — it traps focus visually, so it needs a keyboard exit.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Relative timestamps ("Hace 3 min") are derived at render time, so an open
  // menu would freeze them. Re-render once a minute while it is visible.
  const [, setNow] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  /**
   * Ya no hay tope de 40: el menu scrollea igual que la bandeja. El filtro de
   * no leidas viene aplicado por el servidor (va en la queryKey), asi que aca
   * no queda nada que recortar.
   */
  const visible = notifications;

  /**
   * Scroll infinito dentro del desplegable.
   *
   * El `root` es el contenedor con overflow, NO el viewport: el centinela vive
   * dentro de una caja de 480px de alto que scrollea sola, y con el root por
   * defecto el observer lo daria por visible apenas se abre el menu (esta en
   * pantalla, solo que fuera del scroll de su caja) y pediria todas las paginas
   * de una.
   *
   * Los dos refs son callback refs porque los nodos aparecen y desaparecen con
   * `open` y con `hasNextPage`: con useRef el efecto correria antes de que el
   * nodo existiera y no volveria a correr al montarse.
   */
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollNode || !sentinelNode || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) fetchNextPage(); },
      { root: scrollNode, rootMargin: "200px" },
    );
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [scrollNode, sentinelNode, hasNextPage, fetchNextPage]);

  function markAllRead() {
    markAll();
  }

  // ── Seleccion ────────────────────────────────────────────────────────────
  // Misma mecanica que la bandeja: las acciones por fila se fueron y ahora
  // viven en la barra, aplicadas a lo seleccionado.

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function exitSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

  /** Solo las filas visibles: el menu corta en 40 y no puede prometer mas. */
  const selectedIds = useMemo(
    () => visible.filter((item) => selected.has(item.id)).map((item) => item.id),
    [visible, selected],
  );
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.id)));
  }

  const selectedAllRead =
    selectedIds.length > 0 &&
    selectedIds.every((id) => visible.find((item) => item.id === id)?.leida);

  function applyRead() {
    setReadMany(selectedIds, !selectedAllRead);
    exitSelecting();
  }

  function applyDelete() {
    removeMany(selectedIds);
    exitSelecting();
    setConfirming(false);
  }

  function openNotification(item: NotificationRow) {
    const target = destination(item.url);
    if (!item.leida) setRead(item.id, true);
    setOpen(false);
    if (!target) return;
    if (target.external) {
      // noopener/noreferrer: the portal must not get a handle on this window.
      window.open(target.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(target.href);
    }
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={unreadCount ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={open}
        style={{ position: "relative", width: 34, height: 34, display: "grid", placeItems: "center", border: 0, borderRadius: "50%", background: open ? "var(--surface-hover)" : "transparent", color: "var(--fg-3)", cursor: "pointer" }}
      >
        {/* BellDot draws the dot as part of the glyph. The icon's only <circle>
            IS the dot (the bell body and clapper are <path>s), so recolouring
            circles alone paints the dot red and leaves the bell inheriting the
            surrounding colour — legible in both themes. */}
        {unreadCount > 0 ? <BellDot size={19} className="notif-bell-dot" /> : <Bell size={19} />}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 520, maxWidth: "calc(100vw - 32px)", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", overflow: "hidden", color: "var(--fg-1)" }}>
          <div style={{ minHeight: 58, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 14, fontWeight: 400 }}>Notificaciones</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontSize: 14, fontWeight: 400, cursor: "pointer" }}>
              <span>Solo no leídas</span>
              {/* The "off" track used var(--surface-3), which is not defined in
                  either theme — it resolved to transparent and the switch was
                  invisible until enabled. Real token + border so the control is
                  always visible, and the knob keeps a shadow to read as raised. */}
              <button
                type="button"
                role="switch"
                aria-checked={onlyUnread}
                onClick={() => setOnlyUnread((value) => !value)}
                style={{
                  width: 32, height: 19, padding: 2, flexShrink: 0,
                  border: `1px solid ${onlyUnread ? "var(--brand)" : "var(--border-strong)"}`,
                  borderRadius: 999,
                  background: onlyUnread ? "var(--brand)" : "var(--surface-hover)",
                  cursor: "pointer",
                  transition: "background .15s, border-color .15s",
                }}
              >
                <span style={{ display: "block", width: 13, height: 13, borderRadius: "50%", background: onlyUnread ? "#fff" : "var(--fg-4)", boxShadow: "0 1px 2px rgba(0,0,0,.2)", transform: onlyUnread ? "translateX(13px)" : "translateX(0)", transition: "transform .15s, background .15s" }} />
              </button>
            </label>
          </div>
          <div style={{ minHeight: 42, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid var(--border)", color: "var(--fg-4)", fontSize: 14, fontWeight: 400 }}>
            {selecting ? (
              <>
                <span>{selectedIds.length} seleccionada{selectedIds.length === 1 ? "" : "s"}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {visible.length > 0 && (
                    <button type="button" onClick={toggleSelectAll} style={linkButtonStyle}>
                      {allSelected ? <Square size={16} /> : <SquareCheckBig size={16} />}
                      {allSelected ? "Ninguna" : "Todas"}
                    </button>
                  )}
                  {selectedIds.length > 0 && (
                    <>
                      <button type="button" onClick={applyRead} style={linkButtonStyle}>
                        {selectedAllRead ? <Circle size={16} /> : <Check size={16} />}
                        {selectedAllRead ? "No leídas" : "Leídas"}
                      </button>
                      <button type="button" onClick={() => setConfirming(true)} style={{ ...linkButtonStyle, color: "var(--danger)" }}>
                        <Trash2 size={16} /> Eliminar
                      </button>
                    </>
                  )}
                  <button type="button" onClick={exitSelecting} style={linkButtonStyle}><X size={16} /> Cancelar</button>
                </span>
              </>
            ) : (
              <>
                <span>Recientes</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {visible.length > 0 && (
                    <button type="button" onClick={() => setSelecting(true)} style={linkButtonStyle}>
                      <SquareCheckBig size={16} /> Seleccionar
                    </button>
                  )}
                  {unreadCount > 0 && <button type="button" onClick={markAllRead} style={linkButtonStyle}>Marcar todas como leídas</button>}
                </span>
              </>
            )}
          </div>
          <div ref={setScrollNode} style={{ maxHeight: 480, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>Cargando…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: "38px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, color: "var(--fg-4)", textAlign: "center" }}>
                <CheckCheck size={30} style={{ opacity: .45 }} />
                <span style={{ fontSize: 14 }}>{onlyUnread ? "No tienes notificaciones sin leer" : "No tienes notificaciones"}</span>
              </div>
            ) : visible.map((item) => {
              const Icon = TYPE_ICON[item.tipo] ?? Info;
              const target = destination(item.url);
              const isSelected = selected.has(item.id);
              return (
                // A row, not a <button>: it holds its own action buttons, and
                // nesting interactive elements inside a button is invalid HTML.
                <div
                  key={item.id}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", background: isSelected ? "var(--surface-hover)" : item.leida ? "var(--surface-1)" : "var(--brand-tint)", color: "var(--fg-1)" }}
                >
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

                  <button
                    type="button"
                    onClick={() => selecting ? toggleSelected(item.id) : void openNotification(item)}
                    style={{ minWidth: 0, flex: 1, display: "block", padding: 0, border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "left", cursor: selecting || target ? "pointer" : "default" }}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 400 }}>{item.titulo}</strong>
                      {target?.external && <ExternalLink size={12} style={{ flexShrink: 0, color: "var(--fg-4)" }} />}
                      <span style={{ flexShrink: 0, color: "var(--fg-4)", fontSize: 14, fontWeight: 400 }}>{relativeTime(item.created_at)}</span>
                    </span>
                    {item.mensaje && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3, color: "var(--fg-3)", fontSize: 14, fontWeight: 400, lineHeight: 1.4 }}>{item.mensaje}</span>}
                  </button>

                  {!item.leida && <span aria-label="Sin leer" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: "50%", background: "var(--brand)" }} />}
                </div>
              );
            })}
            {/* Centinela: solo se pinta si queda algo por traer, si no el
                observer se quedaria observando un nodo que nunca carga. */}
            {hasNextPage && (
              <div ref={setSentinelNode} style={{ padding: 14, display: "flex", justifyContent: "center" }}>
                {isFetchingNextPage && <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mismo dialogo que OTDetail. Vive fuera del `open &&` del menu para
          que cerrar el menu no lo desmonte a media confirmacion. */}
      <ConfirmDeleteModal
        pending={!confirming ? null : {
          title: "¿Eliminar las notificaciones seleccionadas?",
          description: `Se eliminará${selectedIds.length === 1 ? "" : "n"} ${selectedIds.length} notificación${selectedIds.length === 1 ? "" : "es"}. Esta acción no se puede deshacer.`,
          confirmLabel: "Eliminar",
          onConfirm: applyDelete,
        }}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}

/** Acciones de la barra del menu: texto plano, sin caja, a 14/400. */
const linkButtonStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  border: 0, background: "transparent", color: "var(--brand)",
  cursor: "pointer", font: "inherit", fontSize: 14, fontWeight: 400,
};
