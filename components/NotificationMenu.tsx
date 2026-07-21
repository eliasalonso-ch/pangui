"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCheck,
  Info,
  Package,
  PackageSearch,
  Search,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface NotificationRow {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  leida: boolean | null;
  url: string | null;
  created_at: string;
}

const TYPE_ICON: Record<string, typeof Info> = {
  emergencia: AlertTriangle,
  ot: Wrench,
  asignado: Wrench,
  estado_cambiado: Wrench,
  completado: CheckCheck,
  procedimiento_completado: CheckCheck,
  preventivo: CalendarClock,
  inventario: Package,
  inventario_stock_bajo: Package,
  solicitud_materiales: PackageSearch,
  tipo_trabajo_actualizado: Search,
};

const TYPE_COLOR: Record<string, string> = {
  emergencia: "var(--danger)",
  inventario: "var(--warning)",
  inventario_stock_bajo: "var(--warning)",
  solicitud_materiales: "var(--warning)",
};

function destination(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/ordenes?")) return url;
  const order = url.match(/(?:^|\/)orden(?:es)?\/([0-9a-f-]{36})/i);
  if (order?.[1]) return `/ordenes?id=${encodeURIComponent(order[1])}`;
  const material = url.match(/(?:^|\/)parte(?:s)?\/([0-9a-f-]{36})/i);
  if (material?.[1]) return `/partes?material=${encodeURIComponent(material[1])}`;
  return url.startsWith("/") ? url : null;
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
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  useEffect(() => {
    let active = true;
    let channel: RealtimeChannel | null = null;
    const sb = createClient();

    void sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data } = await sb
        .from("notifications")
        .select("id,tipo,titulo,mensaje,leida,url,created_at")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(40);
      if (!active) return;
      setNotifications((data ?? []) as NotificationRow[]);
      setLoading(false);

      channel = sb
        .channel(`topbar-notifications:${user.id}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `usuario_id=eq.${user.id}` }, (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((current) => [row, ...current.filter((item) => item.id !== row.id)].slice(0, 40));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `usuario_id=eq.${user.id}` }, (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((current) => current.map((item) => item.id === row.id ? row : item));
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications", filter: `usuario_id=eq.${user.id}` }, (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (id) setNotifications((current) => current.filter((item) => item.id !== id));
        })
        .subscribe();
    });

    return () => {
      active = false;
      if (channel) void sb.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.leida).length;
  const visible = useMemo(
    () => onlyUnread ? notifications.filter((item) => !item.leida) : notifications,
    [notifications, onlyUnread],
  );

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    setNotifications((current) => current.map((item) => ({ ...item, leida: true })));
    await createClient().from("notifications").update({ leida: true }).eq("usuario_id", userId).or("leida.eq.false,leida.is.null");
  }

  async function openNotification(item: NotificationRow) {
    const target = destination(item.url);
    if (!item.leida) {
      setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, leida: true } : row));
      await createClient().from("notifications").update({ leida: true }).eq("id", item.id).eq("usuario_id", userId ?? "");
    }
    setOpen(false);
    if (target) router.push(target);
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
        <Bell size={19} />
        {unreadCount > 0 && <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", border: "1.5px solid var(--surface-1)" }} />}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 42, right: 0, width: 410, maxWidth: "calc(100vw - 32px)", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", overflow: "hidden", color: "var(--fg-1)" }}>
          <div style={{ minHeight: 58, padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 17 }}>Notificaciones</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--brand)", fontSize: 12, cursor: "pointer" }}>
              <button type="button" role="switch" aria-checked={onlyUnread} onClick={() => setOnlyUnread((value) => !value)} style={{ width: 30, height: 18, padding: 2, border: 0, borderRadius: 999, background: onlyUnread ? "var(--brand)" : "var(--surface-3)", cursor: "pointer" }}>
                <span style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "white", transform: onlyUnread ? "translateX(12px)" : "translateX(0)", transition: "transform .15s" }} />
              </button>
              Solo no leídas
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
              return (
                <button key={item.id} type="button" onClick={() => void openNotification(item)} style={{ position: "relative", width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 16px", border: 0, borderBottom: "1px solid var(--border)", background: item.leida ? "var(--surface-1)" : "var(--brand-tint)", color: "var(--fg-1)", fontFamily: "inherit", textAlign: "left", cursor: target ? "pointer" : "default" }}>
                  <span style={{ width: 36, height: 36, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={17} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <strong style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: item.leida ? 600 : 700 }}>{item.titulo}</strong>
                      <span style={{ flexShrink: 0, color: "var(--fg-4)", fontSize: 11 }}>{relativeTime(item.created_at)}</span>
                    </span>
                    {item.mensaje && <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginTop: 3, color: "var(--fg-3)", fontSize: 12, lineHeight: 1.4 }}>{item.mensaje}</span>}
                  </span>
                  {!item.leida && <span aria-label="Sin leer" style={{ width: 8, height: 8, marginTop: 14, flexShrink: 0, borderRadius: "50%", background: "var(--brand)" }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
