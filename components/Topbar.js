"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Settings, Sun, Moon, Monitor } from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./Topbar.module.css";

// Theme: "system" | "light" | "dark"
const THEME_KEY = "pangui_theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: "Sistema", light: "Claro", dark: "Oscuro" };

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "system") {
    html.removeAttribute("data-theme");
    localStorage.removeItem(THEME_KEY);
  } else {
    html.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
}

export default function Topbar() {
  const router = useRouter();
  const bellRef = useRef(null);

  const [nombre, setNombre] = useState("");
  const [userId, setUserId] = useState(null);
  const [rol, setRol] = useState(null);
  const [theme, setTheme] = useState("system");
  const [trialDays, setTrialDays] = useState(null); // null = no trial banner

  // notifications
  const [notifs, setNotifs] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);

  const unread = notifs.filter((n) => !n.leida).length;

  // ── Read saved theme on mount ────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next);
  }

  // ── Load user + subscribe to notifications ──────────────────
  useEffect(() => {
    let channel;

    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("nombre, rol, planta_id, plan, plan_status, trial_end, plantas(nombre)")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.nombre) setNombre(perfil.nombre);
      if (perfil?.rol) setRol(perfil.rol);

      // Trial countdown banner (only for jefe/admin in trial)
      if (perfil?.plan_status === "trial" && perfil?.trial_end) {
        const days = Math.max(0, Math.ceil((new Date(perfil.trial_end) - Date.now()) / 86400000));
        if (days >= 0) setTrialDays(days);
      }

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
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `usuario_id=eq.${user.id}`,
          },
          (payload) => {
            setNotifs((prev) => [payload.new, ...prev].slice(0, 30));
          },
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) createClient().removeChannel(channel);
    };
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
    if (diffMin < 1) return "Ahora";
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Hace ${diffH}h`;
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
  }

  return (
    <>
      {/* Trial countdown banner */}
      {trialDays !== null && rol !== "tecnico" && (
        <div style={{
          background: trialDays <= 5 ? "#b91c1c" : "var(--accent-1)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          textAlign: "center",
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}>
          {trialDays === 0
            ? "⚠️ Tu período de prueba terminó hoy."
            : `⏳ Prueba gratuita: ${trialDays} días restantes.`}
          <a href="/jefe/suscripcion" style={{
            color: "#fff",
            fontWeight: 700,
            textDecoration: "underline",
            fontSize: 12,
          }}>
            Ver planes →
          </a>
        </div>
      )}
      <header className={styles.topbar}>
        {/* Logo */}
        <button
          className={styles.logoBtn}
          onClick={() => {
            if (rol) router.push(rol === "jefe" ? "/jefe" : "/tecnico");
          }}
          aria-label="Ir al inicio"
        >
          <img
            src="/pangui-logo.svg"
            className={styles.logoImg}
            alt="Pangui"
            fetchPriority="high"
            width={80}
            height={80}
          />
        </button>

        {/* Right side */}
        <div className={styles.right}>
          {/* Settings */}
          <button
            className={styles.refreshBtn}
            onClick={() => router.push("/configuracion")}
            aria-label="Configuración"
          >
            <Settings size={16} />
          </button>

          {/* Theme toggle */}
          {(() => {
            const Icon = THEME_ICON[theme];
            return (
              <button
                className={styles.refreshBtn}
                onClick={toggleTheme}
                aria-label={`Tema: ${THEME_LABEL[theme]}`}
                title={`Tema: ${THEME_LABEL[theme]}`}
              >
                <Icon size={16} />
              </button>
            );
          })()}

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
            <button
              className={styles.bellBtn}
              onClick={openBell}
              aria-label="Notificaciones"
            >
              <Bell size={18} />
              {unread > 0 && (
                <span className={styles.bellBadge}>
                  {unread > 9 ? "9+" : unread}
                </span>
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
                    <button
                      className={styles.notifClearBtn}
                      onClick={limpiarNotificaciones}
                    >
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
                          <span
                            className={styles.notifDot}
                            style={{ background: "#e53e3e" }}
                          />
                        )}
                        {n.tipo !== "emergencia" && (
                          <span className={styles.notifDot} />
                        )}
                        <div className={styles.notifBody}>
                          <span className={styles.notifTitulo}>{n.titulo}</span>
                          {n.mensaje && (
                            <span className={styles.notifMensaje}>
                              {n.mensaje}
                            </span>
                          )}
                          <span className={styles.notifTime}>
                            {formatNotifTime(n.created_at)}
                          </span>
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
