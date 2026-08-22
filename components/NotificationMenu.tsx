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
  MessageSquare,
  Package,
  PackageSearch,
  Search,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useNotificaciones, type NotificationRow } from "@/hooks/useNotificaciones";

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

const TYPE_COLOR: Record<string, string> = {
  emergencia: "var(--danger)",
  ot_vencida: "var(--danger)",
  ot_urgente_sin_asignar: "var(--danger)",
  ot_abierta_sin_progreso: "var(--warning)",
  ot_sin_asignar: "var(--warning)",
  inventario: "var(--warning)",
  inventario_stock_bajo: "var(--warning)",
  solicitud_materiales: "var(--warning)",
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
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // El fetch, el realtime y las mutaciones viven en useNotificaciones: este
  // menu y el item del sidebar comparten cache, asi que borrar algo aca apaga
  // el punto del sidebar en el mismo render. Sin `realtime` -- el canal unico
  // lo abre AppSidebar, que esta siempre montado.
  const { items: notifications, unreadCount, loading, setRead, markAllRead: markAll, remove } =
    useNotificaciones(userId);

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data: { user } }) => {
      if (active && user) setUserId(user.id);
    });
    return () => { active = false; };
  }, []);

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
   * El menu desplegable es una vista corta: el cache compartido guarda 100
   * filas (lo que necesita la bandeja) pero aca se muestran las 40 mas
   * recientes, como antes de unificar el estado.
   */
  const visible = useMemo(() => {
    const source = onlyUnread ? notifications.filter((item) => !item.leida) : notifications;
    return source.slice(0, 40);
  }, [notifications, onlyUnread]);

  function markAllRead() {
    markAll();
  }

  /** Per-item read toggle — lets you re-flag something to deal with later. */
  function toggleRead(item: NotificationRow) {
    setRead(item.id, !item.leida);
  }

  /** Removes a single notification. The realtime DELETE handler is idempotent. */
  function dismiss(item: NotificationRow) {
    remove(item.id);
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
        <div style={{ position: "absolute", top: 42, right: 0, width: 410, maxWidth: "calc(100vw - 32px)", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", overflow: "hidden", color: "var(--fg-1)" }}>
          <div style={{ minHeight: 58, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 17 }}>Notificaciones</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontSize: 12, cursor: "pointer" }}>
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
          <div style={{ minHeight: 42, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", color: "var(--fg-4)", fontSize: 12 }}>
            <span>Recientes</span>
            {unreadCount > 0 && <button type="button" onClick={markAllRead} style={{ border: 0, background: "transparent", color: "var(--brand)", cursor: "pointer", font: "inherit", fontWeight: 500 }}>Marcar todas como leídas</button>}
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>Cargando…</div>
            ) : visible.length === 0 ? (
              <div style={{ padding: "38px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, color: "var(--fg-4)", textAlign: "center" }}>
                <CheckCheck size={30} style={{ opacity: .45 }} />
                <span style={{ fontSize: 13 }}>{onlyUnread ? "No tienes notificaciones sin leer" : "No tienes notificaciones"}</span>
              </div>
            ) : visible.map((item) => {
              const Icon = TYPE_ICON[item.tipo] ?? Info;
              const color = TYPE_COLOR[item.tipo] ?? "var(--brand)";
              const target = destination(item.url);
              const isHovered = hoveredId === item.id;
              return (
                // A row, not a <button>: it holds its own action buttons, and
                // nesting interactive elements inside a button is invalid HTML.
                <div
                  key={item.id}
                  onMouseEnter={() => setHoveredId(item.id)}
                  onMouseLeave={() => setHoveredId((current) => current === item.id ? null : current)}
                  style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", borderBottom: "1px solid var(--border)", background: item.leida ? "var(--surface-1)" : "var(--brand-tint)", color: "var(--fg-1)" }}
                >
                  <span style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={17} /></span>

                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    style={{ minWidth: 0, flex: 1, display: "block", padding: 0, border: 0, background: "transparent", color: "inherit", font: "inherit", textAlign: "left", cursor: target ? "pointer" : "default" }}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: item.leida ? 600 : 700 }}>{item.titulo}</strong>
                      {target?.external && <ExternalLink size={11} style={{ flexShrink: 0, color: "var(--fg-4)" }} />}
                      <span style={{ flexShrink: 0, color: "var(--fg-4)", fontSize: 11 }}>{relativeTime(item.created_at)}</span>
                    </span>
                    {item.mensaje && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3, color: "var(--fg-3)", fontSize: 12, lineHeight: 1.4 }}>{item.mensaje}</span>}
                  </button>

                  {/* Row actions. Revealed on hover, but always reachable by
                      keyboard — hiding them with display:none would drop them
                      out of the tab order entirely. */}
                  <span className="notif-row-actions" style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, marginTop: 1, opacity: isHovered ? 1 : 0, transition: "opacity .12s" }}>
                    <button
                      type="button"
                      onClick={() => void toggleRead(item)}
                      title={item.leida ? "Marcar como no leída" : "Marcar como leída"}
                      aria-label={item.leida ? "Marcar como no leída" : "Marcar como leída"}
                      className="notif-row-action"
                      onFocus={() => setHoveredId(item.id)}
                    >
                      {item.leida ? <Circle size={13} /> : <Check size={15} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void dismiss(item)}
                      title="Eliminar notificación"
                      aria-label="Eliminar notificación"
                      className="notif-row-action"
                      onFocus={() => setHoveredId(item.id)}
                    >
                      <X size={15} />
                    </button>
                  </span>

                  {!item.leida && !isHovered && <span aria-label="Sin leer" style={{ position: "absolute", right: 16, top: 18, width: 8, height: 8, borderRadius: "50%", background: "var(--brand)" }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
