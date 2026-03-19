"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Package,
  MoreHorizontal,
  Plus,
  LogOut,
  MessageSquare,
  Bell,
  BellOff,
  UserPlus,
  Building2,
  Users,
  CalendarClock,
  CalendarDays,
  ShieldAlert,
  Settings,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { subscribeToPush, savePushSubscription } from "@/lib/push-subscribe";
import { callEdge } from "@/lib/edge";
import styles from "./BottomNav.module.css";


export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notifStatus, setNotifStatus] = useState("unknown"); // 'granted'|'denied'|'default'|'unknown'
  const [plantaId, setPlantaId] = useState(null);
  const [userRol, setUserRol] = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);

  // invite modal
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [inviteForm,   setInviteForm]   = useState({ nombre: "", email: "", password: "", rol: "tecnico" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError,  setInviteError]  = useState(null);
  const [inviteOk,     setInviteOk]     = useState(null);

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id, rol")
        .eq("id", user.id)
        .maybeSingle();
      if (perfil?.planta_id) setPlantaId(perfil.planta_id);
      if (perfil?.rol) setUserRol(perfil.rol);
    }
    loadProfile();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined") {
      setNotifStatus(Notification.permission);
    }
  }, [moreOpen]);

  // ── Invite helpers ───────────────────────────────────────────
  function setField(field, value) {
    setInviteForm((f) => ({ ...f, [field]: value }));
  }

  function abrirInvite() {
    setInviteForm({ nombre: "", email: "", password: "", rol: "tecnico" });
    setInviteError(null);
    setInviteOk(null);
    setMoreOpen(false);
    setInviteOpen(true);
  }

  async function enviarInvitacion() {
    if (!inviteForm.nombre.trim()) { setInviteError("Ingresa el nombre."); return; }
    if (!inviteForm.email.trim())  { setInviteError("Ingresa el email."); return; }
    if (!inviteForm.password.trim() || inviteForm.password.length < 8) {
      setInviteError("La contraseña debe tener al menos 8 caracteres."); return;
    }
    setInviteError(null);
    setInviteSaving(true);

    const res = await callEdge("invitar", {
      nombre:    inviteForm.nombre.trim(),
      email:     inviteForm.email.trim(),
      password:  inviteForm.password,
      rol:       inviteForm.rol,
      planta_id: plantaId,
    });

    const body = await res.json();
    setInviteSaving(false);

    if (!res.ok) { setInviteError(body.error ?? "Error al crear el usuario."); return; }
    setInviteOk({ nombre: inviteForm.nombre.trim(), email: inviteForm.email.trim(), password: inviteForm.password });
  }

  const isJefe = pathname.startsWith("/jefe") ||
    (!pathname.startsWith("/tecnico") && (userRol === "jefe" || userRol === "admin"));
  const base = isJefe ? "/jefe" : "/tecnico";

  function isActive(href) {
    return pathname === href || (href !== base && pathname.startsWith(href));
  }

  async function cerrarSesion() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function darFeedback() {
    window.open("mailto:feedback@pangui.cl?subject=Feedback%20Pangui", "_blank");
    setMoreOpen(false);
  }

  async function toggleNotificaciones() {
    if (notifStatus === "granted") {
      // Can't programmatically revoke — guide user
      alert("Para desactivar las notificaciones, ve a Configuración del navegador → Notificaciones.");
      return;
    }
    if (notifStatus === "denied") {
      alert("Las notificaciones están bloqueadas. Actívalas desde Configuración del navegador → Notificaciones.");
      return;
    }
    // 'default' — request permission
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
    if (permission !== "granted") return;

    try {
      const sub = await subscribeToPush();
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await savePushSubscription(sub, user.id);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  return (
    <>
      {/* ── Más sheet ── */}
      {moreOpen && (
        <div className={styles.overlay} onClick={() => setMoreOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />

            {isJefe && (
              <button className={styles.sheetItem} onClick={() => { setMoreOpen(false); router.push("/jefe/usuarios"); }}>
                <span className={styles.sheetIconWrap}>
                  <Users className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Equipo</span>
                  <span className={styles.sheetSub}>Ver y gestionar miembros</span>
                </div>
              </button>
            )}

            {isJefe && (
              <button className={styles.sheetItem} onClick={() => { setMoreOpen(false); router.push("/jefe/preventivos"); }}>
                <span className={styles.sheetIconWrap}>
                  <CalendarClock className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Preventivos</span>
                  <span className={styles.sheetSub}>Mantenimiento programado</span>
                </div>
              </button>
            )}

            {isJefe && (
              <button className={styles.sheetItem} onClick={() => { setMoreOpen(false); router.push("/jefe/calendario"); }}>
                <span className={styles.sheetIconWrap}>
                  <CalendarDays className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Calendario</span>
                  <span className={styles.sheetSub}>Vista mensual de órdenes</span>
                </div>
              </button>
            )}

            {isJefe && (
              <button className={styles.sheetItem} onClick={() => { setMoreOpen(false); router.push("/jefe/arco"); }}>
                <span className={styles.sheetIconWrap}>
                  <ShieldAlert className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Solicitudes ARCO</span>
                  <span className={styles.sheetSub}>Derechos de datos (Ley 21.719)</span>
                </div>
              </button>
            )}

            {isJefe && (
              <button className={styles.sheetItem} onClick={abrirInvite}>
                <span className={styles.sheetIconWrap}>
                  <UserPlus className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Invitar miembro</span>
                  <span className={styles.sheetSub}>Agregar técnico o jefe</span>
                </div>
              </button>
            )}

            <button className={styles.sheetItem} onClick={darFeedback}>
              <span className={styles.sheetIconWrap}>
                <MessageSquare className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>Dar feedback</span>
                <span className={styles.sheetSub}>Ayúdanos a mejorar</span>
              </div>
            </button>

            {"Notification" in window && (
              <button className={styles.sheetItem} onClick={toggleNotificaciones}>
                <span className={styles.sheetIconWrap}>
                  {notifStatus === "granted"
                    ? <Bell className={styles.sheetIcon} />
                    : <BellOff className={styles.sheetIcon} />}
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Notificaciones</span>
                  <span className={styles.sheetSub}>
                    {notifStatus === "granted"
                      ? "Activadas"
                      : notifStatus === "denied"
                      ? "Bloqueadas"
                      : "Desactivadas — toca para activar"}
                  </span>
                </div>
              </button>
            )}

            <div className={styles.sheetDivider} />

            <button
              className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
              onClick={cerrarSesion}
              disabled={signingOut}
            >
              <span className={styles.sheetIconWrap}>
                <LogOut className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>
                  {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <div className={styles.inviteOverlay} onClick={() => setInviteOpen(false)}>
          <div className={styles.inviteModal} onClick={(e) => e.stopPropagation()}>
            {inviteOk ? (
              <div className={styles.modalSuccess}>
                <p className={styles.modalSuccessTitle}>¡Usuario creado!</p>
                <p className={styles.modalSuccessInfo}>
                  Comparte estas credenciales con <strong>{inviteOk.nombre}</strong>:
                </p>
                <div className={styles.credBox}>
                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Email</span>
                    <span className={styles.credVal}>{inviteOk.email}</span>
                  </div>
                  <div className={styles.credRow}>
                    <span className={styles.credLabel}>Contraseña</span>
                    <span className={styles.credVal}>{inviteOk.password}</span>
                  </div>
                </div>
                <button className={styles.btnPrimary} onClick={() => setInviteOpen(false)}>
                  Listo
                </button>
              </div>
            ) : (
              <>
                <h2 className={styles.modalTitle}>Invitar miembro</h2>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nombre completo</label>
                  <input className={styles.formInput} type="text" placeholder="Ej. Juan Pérez"
                    value={inviteForm.nombre} onChange={(e) => setField("nombre", e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email</label>
                  <input className={styles.formInput} type="email" placeholder="usuario@empresa.cl"
                    value={inviteForm.email} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Contraseña temporal</label>
                  <input className={styles.formInput} type="text" placeholder="Mínimo 8 caracteres"
                    value={inviteForm.password} onChange={(e) => setField("password", e.target.value)} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Rol</label>
                  <select className={styles.formSelect} value={inviteForm.rol}
                    onChange={(e) => setField("rol", e.target.value)}>
                    <option value="tecnico">Técnico</option>
                    <option value="jefe">Jefe de mantención</option>
                  </select>
                </div>

                {inviteError && <p className={styles.formError}>{inviteError}</p>}

                <div className={styles.modalActions}>
                  <button className={styles.btnGhost} onClick={() => setInviteOpen(false)} disabled={inviteSaving}>
                    Cancelar
                  </button>
                  <button className={styles.btnPrimary} onClick={enviarInvitacion} disabled={inviteSaving}>
                    {inviteSaving ? "Creando…" : "Invitar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Nav bar ── */}
      <nav className={styles.nav}>
        {/* Nueva Orden — jefe only */}
        {isJefe && (
          <Link
            href="/jefe/trabajo/nuevo"
            className={`${styles.itemNueva} ${isActive("/jefe/trabajo/nuevo") ? styles.active : ""}`}
          >
            <Plus className={styles.nuevaIcon} />
            <span className={styles.label}>Nueva OT</span>
          </Link>
        )}

        <Link
          href={base}
          className={`${styles.item} ${pathname === base ? styles.active : ""}`}
        >
          <Home className={styles.icon} />
          <span className={styles.label}>Inicio</span>
        </Link>

        {/* Clientes — jefe only */}
        {isJefe && (
          <Link
            href="/jefe/clientes"
            className={`${styles.item} ${isActive("/jefe/clientes") ? styles.active : ""}`}
          >
            <Building2 className={styles.icon} />
            <span className={styles.label}>Clientes</span>
          </Link>
        )}

        <Link
          href={`${base}/inventario`}
          className={`${styles.item} ${isActive(`${base}/inventario`) ? styles.active : ""}`}
        >
          <Package className={styles.icon} />
          <span className={styles.label}>Inventario</span>
        </Link>

        {/* Desktop-only sidebar items */}
        {isDesktop && isJefe && (
          <>
            <Link href="/jefe/usuarios" className={`${styles.item} ${isActive("/jefe/usuarios") ? styles.active : ""}`}>
              <Users className={styles.icon} />
              <span className={styles.label}>Equipo</span>
            </Link>
            <Link href="/jefe/preventivos" className={`${styles.item} ${isActive("/jefe/preventivos") ? styles.active : ""}`}>
              <CalendarClock className={styles.icon} />
              <span className={styles.label}>Preventivos</span>
            </Link>
            <Link href="/jefe/calendario" className={`${styles.item} ${isActive("/jefe/calendario") ? styles.active : ""}`}>
              <CalendarDays className={styles.icon} />
              <span className={styles.label}>Calendario</span>
            </Link>
            <Link href="/jefe/arco" className={`${styles.item} ${isActive("/jefe/arco") ? styles.active : ""}`}>
              <ShieldAlert className={styles.icon} />
              <span className={styles.label}>ARCO</span>
            </Link>
          </>
        )}

        {/* Más — mobile only */}
        {!isDesktop && (
          <button
            className={`${styles.item} ${moreOpen ? styles.active : ""}`}
            onClick={() => setMoreOpen(true)}
          >
            <MoreHorizontal className={styles.icon} />
            <span className={styles.label}>Más</span>
          </button>
        )}

        {/* Settings + Logout — desktop sidebar bottom */}
        {isDesktop && (
          <>
            <Link href="/configuracion" className={`${styles.item} ${isActive("/configuracion") ? styles.active : ""}`}>
              <Settings className={styles.icon} />
              <span className={styles.label}>Configuración</span>
            </Link>
            <button className={`${styles.item} ${styles.itemDanger}`} onClick={cerrarSesion} disabled={signingOut}>
              <LogOut className={styles.icon} />
              <span className={styles.label}>{signingOut ? "Saliendo…" : "Cerrar sesión"}</span>
            </button>
          </>
        )}
      </nav>
    </>
  );
}
