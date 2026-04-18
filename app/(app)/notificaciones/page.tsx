"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Bell, Trash2, CheckCheck, AlertTriangle, Info,
  Wrench, CalendarClock, Package, Loader2,
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
};

const TIPO_COLOR: Record<string, string> = {
  emergencia: "#EF4444",
  ot: "#6366F1",
  preventivo: "#3B82F6",
  inventario: "#F59E0B",
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
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
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

      channelRef.current = sb
        .channel(`notifs-page-${user.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public",
          table: "notifications", filter: `usuario_id=eq.${user.id}`,
        }, (payload) => {
          setNotifs(prev => [{ ...payload.new as Notif, leida: true }, ...prev].slice(0, 50));
        })
        .subscribe();
    }
    load();
    return () => {
      if (channelRef.current) createClient().removeChannel(channelRef.current);
    };
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
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#fff" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid #E5E7EB",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={20} style={{ color: "#273D88" }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1E2429", margin: 0, letterSpacing: "-0.3px" }}>
            Notificaciones
          </h1>
          {unread > 0 && (
            <span style={{
              background: "#EF4444", color: "#fff",
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
              background: "none", border: "1px solid #E5E7EB", borderRadius: 6,
              fontSize: 12, color: "#6B7280", cursor: "pointer", fontFamily: "inherit",
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "#9CA3AF" }}>
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: 13 }}>Cargando…</span>
          </div>
        ) : notifs.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 300, gap: 12, color: "#9CA3AF",
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
              const color = TIPO_COLOR[n.tipo] ?? "#6B7280";
              return (
                <div
                  key={n.id}
                  style={{
                    display: "flex", alignItems: "flex-start",
                    borderBottom: "1px solid #F3F4F6",
                    background: n.leida ? "#fff" : "#F8F9FF",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => n.url && router.push(n.url)}
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
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0, lineHeight: 1.4 }}>
                        {n.titulo}
                      </p>
                      {n.mensaje && (
                        <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0", lineHeight: 1.4 }}>
                          {n.mensaje}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
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
                      cursor: "pointer", color: "#D1D5DB",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEF2F2"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#D1D5DB"; e.currentTarget.style.background = "none"; }}
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
