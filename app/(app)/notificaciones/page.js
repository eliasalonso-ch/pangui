"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trash2, CheckCheck, AlertTriangle, Info, Wrench, CalendarClock, Package } from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const TIPO_ICON = {
  emergencia:  AlertTriangle,
  ot:          Wrench,
  preventivo:  CalendarClock,
  inventario:  Package,
};
const TIPO_COLOR = {
  emergencia:  "#EF4444",
  ot:          "#6366F1",
  preventivo:  "#3B82F6",
  inventario:  "#F59E0B",
};

function formatTime(iso) {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1)  return "Ahora";
  if (diff < 60) return `Hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `Hace ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7)  return `Hace ${days} día${days !== 1 ? "s" : ""}`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

export default function NotificacionesPage() {
  const router     = useRouter();
  const channelRef = useRef(null);

  const [userId, setUserId] = useState(null);
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);

      const { data } = await sb
        .from("notifications")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifs(data ?? []);
      setLoading(false);

      // Mark all as read
      await sb.from("notifications").update({ leida: true }).eq("usuario_id", user.id).eq("leida", false);
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));

      // Real-time
      channelRef.current = sb
        .channel(`notifs-page-${user.id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "notifications",
          filter: `usuario_id=eq.${user.id}`,
        }, (payload) => setNotifs((prev) => [{ ...payload.new, leida: true }, ...prev].slice(0, 50)))
        .subscribe();
    }
    load();
    return () => { if (channelRef.current) createClient().removeChannel(channelRef.current); };
  }, []);

  async function eliminar(id) {
    const sb = createClient();
    await sb.from("notifications").delete().eq("id", id);
    setNotifs((prev) => prev.filter((n) => n.id !== id));
  }

  async function limpiarTodo() {
    if (!userId) return;
    const sb = createClient();
    await sb.from("notifications").delete().eq("usuario_id", userId);
    setNotifs([]);
  }

  function clickNotif(n) {
    if (n.url) router.push(n.url);
  }

  const unread = notifs.filter((n) => !n.leida).length;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Bell size={20} className={styles.headerIcon} />
          <h1 className={styles.title}>Notificaciones</h1>
          {unread > 0 && <span className={styles.unreadBadge}>{unread}</span>}
        </div>
        {notifs.length > 0 && (
          <button className={styles.clearBtn} onClick={limpiarTodo}>
            <Trash2 size={14} />
            <span>Limpiar todo</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.empty}>Cargando…</div>
      ) : notifs.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCheck size={40} style={{ opacity: 0.2 }} />
          <p>Todo al día.<br />No tienes notificaciones pendientes.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {notifs.map((n) => {
            const Icon  = TIPO_ICON[n.tipo] ?? Info;
            const color = TIPO_COLOR[n.tipo] ?? "#6B7280";
            return (
              <div key={n.id} className={`${styles.notifRow} ${!n.leida ? styles.notifUnread : ""}`}>
                <button className={styles.notifMain} onClick={() => clickNotif(n)}>
                  <span className={styles.notifIconWrap} style={{ background: `${color}18`, color }}>
                    <Icon size={16} />
                  </span>
                  <div className={styles.notifBody}>
                    <span className={styles.notifTitulo}>{n.titulo}</span>
                    {n.mensaje && <span className={styles.notifMensaje}>{n.mensaje}</span>}
                    <span className={styles.notifTime}>{formatTime(n.created_at)}</span>
                  </div>
                </button>
                <button className={styles.deleteBtn} onClick={() => eliminar(n.id)} title="Eliminar">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
