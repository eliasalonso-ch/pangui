"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Bell, Trash2, CheckCheck, AlertTriangle, Info,
  Wrench, CalendarClock, Package, Loader2,
  PackageSearch, Search,
} from "lucide-react";

interface Notif {
  id: string;
  tipo: string;
  titulo: string;
  mensaje?: string;
  leida: boolean;
  url?: string;
  created_at: string;
}

const TIPO_ICON: Record<string, React.ElementType> = {
  emergencia: AlertTriangle,
  ot: Wrench,
  preventivo: CalendarClock,
  inventario: Package,
  solicitud_materiales: PackageSearch,
  tipo_trabajo_actualizado: Search,
};

const TIPO_COLOR: Record<string, string> = {
  emergencia: "var(--danger)",
  ot: "var(--brand)",
  preventivo: "var(--brand)",
  inventario: "var(--warning)",
  solicitud_materiales: "var(--warning)",
  tipo_trabajo_actualizado: "var(--brand)",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 1) return "Ahora";
  if (diff < 60) return `Hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `Hace ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `Hace ${days} día${days !== 1 ? "s" : ""}`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export default function NotificacionesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUserId(user.id);

      const { data } = await sb
        .from("notifications")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifs(data ?? []);
      setLoading(false);

      await sb.from("notifications").update({ leida: true })
        .eq("usuario_id", user.id).eq("leida", false);
      setNotifs(prev => prev.map(n => ({ ...n, leida: true })));
    }
    load();
  }, [router]);

  async function eliminar(id: string) {
    const sb = createClient();
    await sb.from("notifications").delete().eq("id", id);
    setNotifs(prev => prev.filter(n => n.id !== id));
  }

  async function limpiarTodo() {
    if (!userId) return;
    const sb = createClient();
    await sb.from("notifications").delete().eq("usuario_id", userId);
    setNotifs([]);
  }

  const unread = notifs.filter(n => !n.leida).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "var(--surface-0)" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface-1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={20} style={{ color: "var(--brand)" }} />
          {unread > 0 && (
            <span style={{
              background: "var(--danger)", color: "var(--fg-on-brand)",
              fontSize: 11, fontWeight: 700,
              borderRadius: 10, padding: "1px 7px",
              lineHeight: "18px",
            }}>
              {unread}
            </span>
          )}
        </div>
        {notifs.length > 0 && (
          <button
            type="button"
            onClick={limpiarTodo}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              height: 30, padding: "0 12px",
              background: "none", border: "1px solid var(--border)", borderRadius: 6,
              fontSize: 12, color: "var(--fg-3)", cursor: "pointer", fontFamily: "inherit",
            }}
          >
            <Trash2 size={13} />
            Limpiar todo
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "var(--fg-4)" }}>
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Cargando…</span>
          </div>
        ) : notifs.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 300, gap: 12, color: "var(--fg-4)",
          }}>
            <CheckCheck size={40} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 14, margin: 0, textAlign: "center", lineHeight: 1.6 }}>
              Todo al día.<br />No tienes notificaciones pendientes.
            </p>
          </div>
        ) : (
          <div>
            {notifs.map(n => {
              const Icon = TIPO_ICON[n.tipo] ?? Info;
              const color = TIPO_COLOR[n.tipo] ?? "var(--fg-3)";
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex", alignItems: "flex-start",
                    borderBottom: "1px solid var(--border)",
                    background: n.leida ? "var(--surface-1)" : "var(--brand-tint)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.url) return;
                      const match = n.url.match(/\/orden\/([^/]+)/);
                      if (match) router.push(`/ordenes?id=${match[1]}`);
                      else router.push(n.url);
                    }}
                    style={{
                      flex: 1, display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "14px 20px",
                      background: "none", border: "none",
                      cursor: n.url ? "pointer" : "default",
                      fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${color}18`, color,
                    }}>
                      <Icon size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", margin: 0, lineHeight: 1.4 }}>
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "2px 0 0", lineHeight: 1.4 }}>
                          {n.mensaje}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: "var(--fg-4)", margin: "4px 0 0" }}>
                        {formatTime(n.created_at)}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => eliminar(n.id)}
                    title="Eliminar"
                    style={{
                      width: 36, height: 36, margin: "10px 12px 10px 0", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "none", border: "none", borderRadius: 6,
                      cursor: "pointer", color: "var(--fg-4)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "var(--danger-bg)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-4)"; e.currentTarget.style.background = "none"; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
