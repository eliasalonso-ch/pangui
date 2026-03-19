"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./Topbar.module.css";

export default function Topbar() {
  const router  = useRouter();
  const bellRef = useRef(null);

  const [nombre,   setNombre]   = useState("");
  const [userId,   setUserId]   = useState(null);
  const [rol,      setRol]      = useState(null);

  // notifications
  const [notifs,     setNotifs]     = useState([]);
  const [bellOpen,   setBellOpen]   = useState(false);

  const unread = notifs.filter((n) => !n.leida).length;

  // ── Load user + subscribe to notifications ──────────────────
  useEffect(() => {
    let channel;

    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.nombre) setNombre(perfil.nombre);
      if (perfil?.rol)    setRol(perfil.rol);

      // Load recent notifications
      const { data: ns } = await supabase
        .from("notifications")
        .select("*")
        .eq("usuario_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (ns) setNotifs(ns);

      // Real-time subscription
      channel = supabase
        .channel(`notifs-${user.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `usuario_id=eq.${user.id}`,
        }, (payload) => {
          setNotifs((prev) => [payload.new, ...prev].slice(0, 30));
        })
        .subscribe();
    }

    init();
    return () => { if (channel) createClient().removeChannel(channel); };
  }, []);

  // Close bell dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function openBell() {
    setBellOpen((v) => !v);
    // Mark all as read
    if (unread > 0 && userId) {
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ leida: true })
        .eq("usuario_id", userId)
        .eq("leida", false);
      setNotifs((prev) => prev.map((n) => ({ ...n, leida: true })));
    }
  }

  async function clickNotif(n) {
    setBellOpen(false);
    if (n.url) router.push(n.url);
  }

  async function limpiarNotificaciones(e) {
    e.stopPropagation();
    if (!userId) return;
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("usuario_id", userId);
    setNotifs([]);
  }

  function formatNotifTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1)  return "Ahora";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)   return `Hace ${diffH}h`;
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  }

  return (
    <>
      <header className={styles.topbar}>
        {/* Logo */}
        <button
          className={styles.logoBtn}
          onClick={() => { if (rol) router.push(rol === "jefe" ? "/jefe" : "/tecnico"); }}
          aria-label="Ir al inicio"
        >
          <img src="/pangui-logo.svg" className={styles.logoImg} alt="Pangui" fetchPriority="high" width={80} height={80} />
        </button>

        {/* Right side */}
        <div className={styles.right}>
          {nombre && <span className={styles.userName}>{nombre}</span>}

          {/* Refresh */}
          <button
            className={styles.refreshBtn}
            onClick={() => window.location.reload()}
            aria-label="Actualizar"
          >
            ↻
          </button>

          {/* Bell */}
          <div className={styles.bellWrap} ref={bellRef}>
            <button className={styles.bellBtn} onClick={openBell} aria-label="Notificaciones">
              <Bell size={18} />
              {unread > 0 && (
                <span className={styles.bellBadge}>{unread > 9 ? "9+" : unread}</span>
              )}
            </button>

            {bellOpen && (
              <div className={styles.notifPanel}>
                <div className={styles.notifHeader}>
                  <span>
                    Notificaciones
                    {notifs.length > 0 && (
                      <span className={styles.notifCount}>{notifs.length}</span>
                    )}
                  </span>
                  {notifs.length > 0 && (
                    <button className={styles.notifClearBtn} onClick={limpiarNotificaciones}>
                      Limpiar
                    </button>
                  )}
                </div>
                {notifs.length === 0 ? (
                  <p className={styles.notifEmpty}>Sin notificaciones</p>
                ) : (
                  <div className={styles.notifList}>
                    {notifs.map((n) => (
                      <button
                        key={n.id}
                        className={`${styles.notifItem} ${!n.leida ? styles.notifUnread : ""}`}
                        onClick={() => clickNotif(n)}
                      >
                        {n.tipo === "emergencia" && (
                          <span className={styles.notifDot} style={{ background: "#e53e3e" }} />
                        )}
                        {n.tipo !== "emergencia" && (
                          <span className={styles.notifDot} />
                        )}
                        <div className={styles.notifBody}>
                          <span className={styles.notifTitulo}>{n.titulo}</span>
                          {n.mensaje && (
                            <span className={styles.notifMensaje}>{n.mensaje}</span>
                          )}
                          <span className={styles.notifTime}>{formatNotifTime(n.created_at)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

    </>
  );
}
