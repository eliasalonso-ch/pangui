"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache, clearPerfilCache } from "@/lib/perfil-cache";
import Topbar from "@/components/Topbar";
import styles from "./page.module.css";

export default function ConfiguracionPage() {
  const router = useRouter();

  // Account info
  const [nombre,   setNombre]   = useState("");
  const [email,    setEmail]    = useState("");
  const [rol,      setRol]      = useState("");
  const [planta,   setPlanta]   = useState("");
  const [userId,   setUserId]   = useState(null);
  const [cargando, setCargando] = useState(true);

  // Password change
  const [nuevaPassword,    setNuevaPassword]    = useState("");
  const [confirmPassword,  setConfirmPassword]  = useState("");
  const [pwError,          setPwError]          = useState("");
  const [pwSuccess,        setPwSuccess]        = useState(false);
  const [pwLoading,        setPwLoading]        = useState(false);

  // Name change
  const [nombreEdit,    setNombreEdit]    = useState("");
  const [nombreLoading, setNombreLoading] = useState(false);
  const [nombreSuccess, setNombreSuccess] = useState(false);

  // Notification state
  const [notifPerm, setNotifPerm] = useState(null);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      setUserId(user.id);
      setEmail(user.email ?? "");

      let perfil = getPerfilCache(user.id);
      if (!perfil) {
        const { data } = await supabase
          .from("usuarios")
          .select("nombre, rol, planta_id, plantas(nombre)")
          .eq("id", user.id)
          .maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }

      if (perfil) {
        setNombre(perfil.nombre ?? "");
        setNombreEdit(perfil.nombre ?? "");
        setRol(perfil.rol ?? "");
        setPlanta(perfil.plantas?.nombre ?? "");
      }

      if (typeof Notification !== "undefined") {
        setNotifPerm(Notification.permission);
      }

      setCargando(false);
    }
    init();
  }, [router]);

  async function guardarNombre(e) {
    e.preventDefault();
    if (!nombreEdit.trim() || nombreEdit.trim() === nombre) return;
    setNombreLoading(true);
    setNombreSuccess(false);
    const supabase = createClient();
    await supabase.from("usuarios").update({ nombre: nombreEdit.trim() }).eq("id", userId);
    setNombre(nombreEdit.trim());
    clearPerfilCache();
    setNombreSuccess(true);
    setNombreLoading(false);
    setTimeout(() => setNombreSuccess(false), 3000);
  }

  async function cambiarPassword(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);

    if (nuevaPassword.length < 6) {
      setPwError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (nuevaPassword !== confirmPassword) {
      setPwError("Las contraseñas no coinciden.");
      return;
    }

    setPwLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess(true);
      setNuevaPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 4000);
    }
  }

  async function cerrarSesion() {
    clearPerfilCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function activarNotificaciones() {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    if (perm === "granted") {
      try {
        const { subscribeToPush, savePushSubscription } = await import("@/lib/push-subscribe");
        const sub = await subscribeToPush();
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await savePushSubscription(sub, user.id);
      } catch (err) {
        console.error("Push subscription failed:", err);
      }
    }
  }

  const ROL_LABEL = { jefe: "Administrador", tecnico: "Técnico", admin: "Super Admin" };

  if (cargando) {
    return (
      <>
        <Topbar />
        <div className={styles.cargando}>Cargando…</div>
      </>
    );
  }

  return (
    <>
      <Topbar />
      <main className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Configuración</h1>

          {/* ── Cuenta ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Cuenta</h2>

            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Correo</span>
              <span className={styles.infoValue}>{email}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Rol</span>
              <span className={`${styles.rolBadge} ${styles["rol_" + rol]}`}>
                {ROL_LABEL[rol] ?? rol}
              </span>
            </div>
            {planta && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Empresa</span>
                <span className={styles.infoValue}>{planta}</span>
              </div>
            )}

            <form onSubmit={guardarNombre} className={styles.form}>
              <label className={styles.label}>Nombre</label>
              <div className={styles.inputRow}>
                <input
                  className={styles.input}
                  value={nombreEdit}
                  onChange={(e) => { setNombreEdit(e.target.value); setNombreSuccess(false); }}
                  placeholder="Tu nombre"
                  maxLength={80}
                />
                <button
                  className={styles.btnSecondary}
                  type="submit"
                  disabled={nombreLoading || nombreEdit.trim() === nombre}
                >
                  {nombreLoading ? "…" : "Guardar"}
                </button>
              </div>
              {nombreSuccess && <p className={styles.successMsg}>Nombre actualizado ✓</p>}
            </form>
          </section>

          {/* ── Seguridad ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Seguridad</h2>
            <form onSubmit={cambiarPassword} className={styles.form}>
              <label className={styles.label}>Nueva contraseña</label>
              <input
                className={styles.input}
                type="password"
                value={nuevaPassword}
                onChange={(e) => { setNuevaPassword(e.target.value); setPwError(""); setPwSuccess(false); }}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <label className={styles.label} style={{ marginTop: 12 }}>Confirmar contraseña</label>
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPwError(""); setPwSuccess(false); }}
                placeholder="Repite la contraseña"
                autoComplete="new-password"
              />
              {pwError   && <p className={styles.errorMsg}>{pwError}</p>}
              {pwSuccess && <p className={styles.successMsg}>Contraseña actualizada ✓</p>}
              <button
                className={styles.btnPrimary}
                type="submit"
                disabled={pwLoading || !nuevaPassword}
                style={{ marginTop: 16 }}
              >
                {pwLoading ? "Actualizando…" : "Cambiar contraseña"}
              </button>
            </form>
          </section>

          {/* ── Notificaciones ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Notificaciones</h2>

            {notifPerm === null && (
              <p className={styles.infoText}>Tu navegador no soporta notificaciones push.</p>
            )}

            {notifPerm === "granted" && (
              <div className={styles.notifStatus}>
                <span className={styles.notifDotGreen} />
                <span>Notificaciones activadas</span>
              </div>
            )}

            {notifPerm === "default" && (
              <>
                <div className={styles.notifStatus}>
                  <span className={styles.notifDotGray} />
                  <span>No has permitido las notificaciones aún</span>
                </div>
                <button className={styles.btnPrimary} onClick={activarNotificaciones} style={{ marginTop: 12 }}>
                  Activar notificaciones
                </button>
              </>
            )}

            {notifPerm === "denied" && (
              <>
                <div className={styles.notifStatus}>
                  <span className={styles.notifDotRed} />
                  <span>Notificaciones bloqueadas</span>
                </div>
                <p className={styles.infoText}>
                  {isIOS
                    ? "Para activarlas: Ajustes → Pangui → Notificaciones → Permitir"
                    : "Para activarlas: haz clic en el candado de la barra de dirección → Notificaciones → Permitir"}
                </p>
              </>
            )}
          </section>

          {/* ── Sesión ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Sesión</h2>
            <button className={styles.btnDanger} onClick={cerrarSesion}>
              Cerrar sesión
            </button>
          </section>
        </div>
      </main>
    </>
  );
}
