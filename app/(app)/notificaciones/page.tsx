"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Bell, CalendarClock, Check, CheckCheck, Circle,
  ExternalLink, Info, Package, PackageSearch, Search, Trash2, Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import AppLoadingState from "@/components/AppLoadingState";
import { useNotificaciones, type NotificationRow as Notif } from "@/hooks/useNotificaciones";

const TYPE_ICON: Record<string, React.ElementType> = {
  emergencia: AlertTriangle, ot: Wrench, orden: Wrench, asignado: Wrench,
  estado_cambiado: Wrench, completado: CheckCheck, procedimiento_completado: CheckCheck,
  preventivo: CalendarClock, inventario: Package, inventario_stock_bajo: Package,
  solicitud_materiales: PackageSearch, tipo_trabajo_actualizado: Search,
  ot_vencida: AlertTriangle, ot_urgente_sin_asignar: AlertTriangle,
};

const TYPE_COLOR: Record<string, string> = {
  emergencia: "var(--danger)", ot_vencida: "var(--danger)",
  ot_urgente_sin_asignar: "var(--danger)", inventario: "var(--warning)",
  inventario_stock_bajo: "var(--warning)", solicitud_materiales: "var(--warning)",
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

  // Mismo cache que la campana de la topbar y el item del sidebar: marcar leida
  // aca apaga el punto alla sin esperar un evento realtime. Sin `realtime`, el
  // canal unico lo abre AppSidebar.
  const {
    items, unreadCount, loading,
    setRead: setReadById, markAllRead: markAll, remove: removeById, clearAll: clearAllItems,
  } = useNotificaciones(userId);

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data: { user } }) => {
      if (!active) return;
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);
    });
    return () => { active = false; };
  }, [router]);

  const visible = useMemo(() => onlyUnread ? items.filter(item => !item.leida) : items, [items, onlyUnread]);

  function setRead(item: Notif, leida: boolean) {
    setReadById(item.id, leida);
  }

  function markAllRead() {
    markAll();
  }

  function remove(item: Notif) {
    removeById(item.id);
  }

  function clearAll() {
    clearAllItems();
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
            <span style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}><Bell size={17} /></span>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--fg-1)" }}>Bandeja de notificaciones</h2>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--fg-4)" }}>{unreadCount} sin leer · {items.length} en total</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" onClick={() => setOnlyUnread(value => !value)} style={{ height: 32, padding: "0 11px", border: `1px solid ${onlyUnread ? "var(--brand)" : "var(--border)"}`, borderRadius: 7, background: onlyUnread ? "var(--brand-tint)" : "var(--surface-1)", color: onlyUnread ? "var(--brand)" : "var(--fg-3)", font: "inherit", fontSize: 12, cursor: "pointer" }}>Solo no leídas</button>
            {unreadCount > 0 && <button type="button" onClick={markAllRead} style={buttonStyle}><CheckCheck size={14} /> Marcar todas como leídas</button>}
            {items.length > 0 && <button type="button" onClick={clearAll} style={buttonStyle}><Trash2 size={13} /> Limpiar todo</button>}
          </div>
        </div>

        {loading ? (
          <AppLoadingState label="Cargando notificaciones…" minHeight={220} />
        ) : visible.length === 0 ? (
          <div style={{ height: 260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)" }}>
            <CheckCheck size={36} style={{ opacity: .35 }} />
            <span style={{ fontSize: 13 }}>{onlyUnread ? "No tienes notificaciones sin leer" : "No tienes notificaciones"}</span>
          </div>
        ) : visible.map(item => {
          const Icon = TYPE_ICON[item.tipo] ?? Info;
          const color = TYPE_COLOR[item.tipo] ?? "var(--brand)";
          const target = destination(item.url);
          return (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)", background: item.leida ? "var(--surface-1)" : "var(--brand-tint)" }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={16} /></span>
              <button type="button" onClick={() => void open(item)} style={{ minWidth: 0, flex: 1, padding: 0, border: 0, background: "transparent", textAlign: "left", cursor: target ? "pointer" : "default", fontFamily: "inherit" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <strong style={{ color: "var(--fg-1)", fontSize: 13.5, fontWeight: item.leida ? 600 : 700 }}>{item.titulo}</strong>
                  {target?.external && <ExternalLink size={11} color="var(--fg-4)" />}
                </span>
                {item.mensaje && <span style={{ display: "block", marginTop: 2, color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.4 }}>{item.mensaje}</span>}
                <span style={{ display: "block", marginTop: 4, color: "var(--fg-4)", fontSize: 11.5 }}>{relativeTime(item.created_at)}</span>
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <button type="button" onClick={() => void setRead(item, !item.leida)} title={item.leida ? "Marcar como no leída" : "Marcar como leída"} aria-label={item.leida ? "Marcar como no leída" : "Marcar como leída"} className="notif-row-action">{item.leida ? <Circle size={14} /> : <Check size={15} />}</button>
                <button type="button" onClick={() => void remove(item)} title="Eliminar notificación" aria-label="Eliminar notificación" className="notif-row-action"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  height: 32, padding: "0 11px", display: "inline-flex", alignItems: "center", gap: 6,
  border: "1px solid var(--border)", borderRadius: 7, background: "var(--surface-1)",
  color: "var(--fg-3)", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
};
