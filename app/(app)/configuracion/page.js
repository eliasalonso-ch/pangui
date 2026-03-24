"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache, clearPerfilCache } from "@/lib/perfil-cache";
import { ROL_LABEL, esAdmin, esElevado } from "@/lib/roles";
import {
  Building2, Users, CreditCard, Bell, BellOff,
  Lock, User, MessageSquare, LogOut, ChevronRight,
  Save, FileText,
} from "lucide-react";
import styles from "./page.module.css";

export default function ConfiguracionPage() {
  const router = useRouter();

  // Profile
  const [userId, setUserId]     = useState(null);
  const [nombre, setNombre]     = useState("");
  const [email, setEmail]       = useState("");
  const [rol, setRol]           = useState("");
  const [planta, setPlanta]     = useState("");
  const [plantaId, setPlantaId] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Plant edit (admin only)
  const [plantaNombre, setPlantaNombre]     = useState("");
  const [plantaSector, setPlantaSector]     = useState("");
  const [plantaRegion, setPlantaRegion]     = useState("");
  const [plantaLoading, setPlantaLoading]   = useState(false);
  const [plantaSuccess, setPlantaSuccess]   = useState(false);

  // Name edit
  const [nombreEdit, setNombreEdit]       = useState("");
  const [nombreLoading, setNombreLoading] = useState(false);
  const [nombreSuccess, setNombreSuccess] = useState(false);

  // Password
  const [nuevaPassword, setNuevaPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwError, setPwError]       = useState("");
  const [pwSuccess, setPwSuccess]   = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);

  // Notifications
  const [notifPerm, setNotifPerm] = useState(null);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  // User counts for team card
  const [teamCount, setTeamCount] = useState(null);

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
          .select("nombre, rol, workspace_id, workspaces(nombre, sector, region)")
          .eq("id", user.id)
          .maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }

      if (perfil) {
        setNombre(perfil.nombre ?? "");
        setNombreEdit(perfil.nombre ?? "");
        setRol(perfil.rol ?? "");
        setPlanta(perfil.workspaces?.nombre ?? "");
        setPlantaId(perfil.workspace_id ?? null);
        setPlantaNombre(perfil.workspaces?.nombre ?? "");
        setPlantaSector(perfil.workspaces?.sector ?? "");
        setPlantaRegion(perfil.workspaces?.region ?? "");

        // Fetch team count for elevated users
        if (esElevado(perfil.rol) && perfil.workspace_id) {
          const { count } = await supabase
            .from("usuarios")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", perfil.workspace_id)
            .eq("activo", true);
          setTeamCount(count ?? 0);
        }
      }

      if (typeof Notification !== "undefined") {
        setNotifPerm(Notification.permission);
      }

      setCargando(false);
    }
    init();
  }, [router]);

  // ── Handlers ──

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

  async function guardarPlanta(e) {
    e.preventDefault();
    if (!plantaId) return;
    setPlantaLoading(true);
    setPlantaSuccess(false);
    const supabase = createClient();
    await supabase.from("workspaces").update({
      nombre: plantaNombre.trim(),
      sector: plantaSector.trim() || null,
      region: plantaRegion.trim() || null,
    }).eq("id", plantaId);
    clearPerfilCache();
    setPlanta(plantaNombre.trim());
    setPlantaSuccess(true);
    setPlantaLoading(false);
    setTimeout(() => setPlantaSuccess(false), 3000);
  }

  async function cambiarPassword(e) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    if (nuevaPassword.length < 6) { setPwError("La contraseña debe tener al menos 6 caracteres."); return; }
    if (nuevaPassword !== confirmPassword) { setPwError("Las contraseñas no coinciden."); return; }

    setPwLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: nuevaPassword });
    setPwLoading(false);
    if (error) { setPwError(error.message); }
    else {
      setPwSuccess(true);
      setNuevaPassword("");
      setConfirmPassword("");
      setTimeout(() => setPwSuccess(false), 4000);
    }
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

  async function cerrarSesion() {
    clearPerfilCache();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (cargando) {
    return <div className={styles.cargando}>Cargando…</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}>Configuración</h1>

        {/* ── Empresa / Planta (admin only) ── */}
        {esAdmin(rol) && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <Building2 size={18} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Empresa / Planta</h2>
            </div>
            <form onSubmit={guardarPlanta} className={styles.form}>
              <label className={styles.label}>Nombre de la empresa</label>
              <input
                className={styles.input}
                value={plantaNombre}
                onChange={(e) => { setPlantaNombre(e.target.value); setPlantaSuccess(false); }}
                placeholder="Nombre de tu empresa"
                maxLength={120}
              />
              <label className={styles.label} style={{ marginTop: 12 }}>Sector</label>
              <input
                className={styles.input}
                value={plantaSector}
                onChange={(e) => { setPlantaSector(e.target.value); setPlantaSuccess(false); }}
                placeholder="Ej. Alimentos, Minería, etc."
                maxLength={80}
              />
              <label className={styles.label} style={{ marginTop: 12 }}>Región</label>
              <input
                className={styles.input}
                value={plantaRegion}
                onChange={(e) => { setPlantaRegion(e.target.value); setPlantaSuccess(false); }}
                placeholder="Ej. Metropolitana"
                maxLength={80}
              />
              {plantaSuccess && <p className={styles.successMsg}>Datos actualizados</p>}
              <button
                className={styles.btnPrimary}
                type="submit"
                disabled={plantaLoading}
                style={{ marginTop: 16 }}
              >
                {plantaLoading ? "Guardando…" : "Guardar cambios"}
              </button>
            </form>
          </section>
        )}

        {/* ── Equipo (admin, jefe) ── */}
        {esElevado(rol) && (
          <Link href="/usuarios" className={styles.linkCard}>
            <div className={styles.linkCardLeft}>
              <Users size={20} className={styles.linkCardIcon} />
              <div>
                <span className={styles.linkCardTitle}>Equipo</span>
                <span className={styles.linkCardSub}>
                  {teamCount !== null ? `${teamCount} miembros activos` : "Gestionar miembros"}
                </span>
              </div>
            </div>
            <ChevronRight size={18} className={styles.linkCardArrow} />
          </Link>
        )}

        {/* ── Suscripción (admin, jefe) ── */}
        {esElevado(rol) && (
          <Link href="/configuracion/suscripcion" className={styles.linkCard}>
            <div className={styles.linkCardLeft}>
              <CreditCard size={20} className={styles.linkCardIcon} />
              <div>
                <span className={styles.linkCardTitle}>Suscripción</span>
                <span className={styles.linkCardSub}>Gestionar plan y pagos</span>
              </div>
            </div>
            <ChevronRight size={18} className={styles.linkCardArrow} />
          </Link>
        )}

        {/* ── Notificaciones ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Bell size={18} className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Notificaciones</h2>
          </div>

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

        {/* ── Seguridad ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <Lock size={18} className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Seguridad</h2>
          </div>
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
            {pwError && <p className={styles.errorMsg}>{pwError}</p>}
            {pwSuccess && <p className={styles.successMsg}>Contraseña actualizada</p>}
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

        {/* ── Cuenta ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <User size={18} className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Cuenta</h2>
          </div>

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
            {nombreSuccess && <p className={styles.successMsg}>Nombre actualizado</p>}
          </form>
        </section>

        {/* ── Feedback ── */}
        <Link href="/configuracion/feedback" className={styles.linkCard}>
          <div className={styles.linkCardLeft}>
            <MessageSquare size={20} className={styles.linkCardIcon} />
            <div>
              <span className={styles.linkCardTitle}>Feedback</span>
              <span className={styles.linkCardSub}>Enviar sugerencias o reportar problemas</span>
            </div>
          </div>
          <ChevronRight size={18} className={styles.linkCardArrow} />
        </Link>

        {/* ── Legal ── */}
        <Link href="/privacidad" className={styles.linkCard}>
          <div className={styles.linkCardLeft}>
            <FileText size={20} className={styles.linkCardIcon} />
            <div>
              <span className={styles.linkCardTitle}>Privacidad</span>
              <span className={styles.linkCardSub}>Política de privacidad y datos</span>
            </div>
          </div>
          <ChevronRight size={18} className={styles.linkCardArrow} />
        </Link>
        <Link href="/terminos" className={styles.linkCard}>
          <div className={styles.linkCardLeft}>
            <FileText size={20} className={styles.linkCardIcon} />
            <div>
              <span className={styles.linkCardTitle}>Términos y condiciones</span>
              <span className={styles.linkCardSub}>Condiciones de uso del servicio</span>
            </div>
          </div>
          <ChevronRight size={18} className={styles.linkCardArrow} />
        </Link>
        {/* ── Sesión ── */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <LogOut size={18} className={styles.sectionIcon} />
            <h2 className={styles.sectionTitle}>Sesión</h2>
          </div>
          <button className={styles.btnDanger} onClick={cerrarSesion}>
            Cerrar sesión
          </button>
        </section>
      </div>
    </div>
  );
}
