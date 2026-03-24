"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Package,
  Boxes,
  MoreHorizontal,
  MessageSquare,
  TrendingUpDown,
  Bell,
  BellOff,
  UserPlus,
  Building2,
  Users,
  CalendarClock,
  Server,
  ShieldAlert,
  ShieldCheck,
  Settings,
  ClipboardList,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  HelpCircle,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { subscribeToPush, savePushSubscription } from "@/lib/push-subscribe";
import { callEdge } from "@/lib/edge";
import { usePermisos } from "@/lib/permisos";
import { ROL_LABEL } from "@/lib/roles";
import styles from "./BottomNav.module.css";

const SIDEBAR_KEY = "pangui_sidebar_collapsed";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const channelRef = useRef(null);

  const [moreOpen,    setMoreOpen]    = useState(false);
  const [plantaId,    setPlantaId]    = useState(null);
  const [userRol,     setUserRol]     = useState(null);
  const [plan,        setPlan]        = useState(null);
  const [planStatus,  setPlanStatus]  = useState(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifStatus, setNotifStatus] = useState("unknown");
  const [collapsed, setCollapsed] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(true);

  // invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "tecnico",
  });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState(null);
  const [inviteOk, setInviteOk] = useState(null);

  // Load saved sidebar state
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);


  useEffect(() => {
    async function loadProfile() {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id, rol, onboarding_done, plan, plan_status")
        .eq("id", user.id)
        .maybeSingle();
      if (perfil?.workspace_id) setPlantaId(perfil.workspace_id);
      if (perfil?.rol) setUserRol(perfil.rol);
      setOnboardingDone(perfil?.onboarding_done ?? false);
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);

      // Unread count
      const { count } = await sb
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("usuario_id", user.id)
        .eq("leida", false);
      setNotifUnread(count ?? 0);

      // Real-time
      channelRef.current = sb
        .channel(`notif-nav-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `usuario_id=eq.${user.id}`,
          },
          () => setNotifUnread((p) => p + 1),
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `usuario_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.new?.leida) setNotifUnread((p) => Math.max(0, p - 1));
          },
        )
        .subscribe();
    }
    loadProfile();
    return () => {
      if (channelRef.current) createClient().removeChannel(channelRef.current);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    if (typeof Notification !== "undefined")
      setNotifStatus(Notification.permission);
  }, [moreOpen]);

  function setField(k, v) {
    setInviteForm((f) => ({ ...f, [k]: v }));
  }

  function abrirInvite() {
    setInviteForm({ nombre: "", email: "", password: "", rol: "tecnico" });
    setInviteError(null);
    setInviteOk(null);
    setMoreOpen(false);
    setInviteOpen(true);
  }

  async function enviarInvitacion() {
    if (!inviteForm.nombre.trim()) {
      setInviteError("Ingresa el nombre.");
      return;
    }
    if (!inviteForm.email.trim()) {
      setInviteError("Ingresa el email.");
      return;
    }
    if (inviteForm.password.length < 8) {
      setInviteError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setInviteError(null);
    setInviteSaving(true);
    const res = await callEdge("invitar", {
      nombre: inviteForm.nombre.trim(),
      email: inviteForm.email.trim(),
      password: inviteForm.password,
      rol: inviteForm.rol,
      workspace_id: plantaId,
    });
    const body = await res.json();
    setInviteSaving(false);
    if (!res.ok) {
      setInviteError(body.error ?? "Error al crear el usuario.");
      return;
    }
    setInviteOk({
      nombre: inviteForm.nombre.trim(),
      email: inviteForm.email.trim(),
      password: inviteForm.password,
    });
  }

  async function toggleNotificaciones() {
    if (notifStatus === "granted") {
      alert(
        "Para desactivar, ve a Configuración del navegador → Notificaciones.",
      );
      return;
    }
    if (notifStatus === "denied") {
      alert(
        "Las notificaciones están bloqueadas. Actívalas desde Configuración del navegador.",
      );
      return;
    }
    const permission = await Notification.requestPermission();
    setNotifStatus(permission);
    if (permission !== "granted") return;
    try {
      const sub = await subscribeToPush();
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (user) await savePushSubscription(sub, user.id);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  function darFeedback() {
    setMoreOpen(false);
    router.push("/configuracion/feedback");
  }

  const isAdmin    = userRol === "jefe" || userRol === "admin";
  const isBasicNav = (plan ?? "basic") === "basic" && planStatus !== "trial";
  const base = "/datos";
  const { puedeVer } = usePermisos();
  function isActive(href) {
    return pathname === href || (href !== base && pathname.startsWith(href));
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {}
    // Also update the CSS variable so sidebarMain adjusts
    document.documentElement.style.setProperty(
      "--sidebar-width",
      next ? "64px" : "220px",
    );
  }

  // Sync sidebar width var on mount
  useEffect(() => {
    if (isDesktop) {
      document.documentElement.style.setProperty(
        "--sidebar-width",
        collapsed ? "64px" : "220px",
      );
    }
  }, [isDesktop, collapsed]);


  return (
    <>
      {/* ── Más sheet (mobile) ── */}
      {moreOpen && (
        <div className={styles.overlay} onClick={() => setMoreOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />

            {isAdmin && puedeVer("usuarios") && (
              <button
                className={styles.sheetItem}
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/usuarios");
                }}
              >
                <span className={styles.sheetIconWrap}>
                  <Users className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Equipo</span>
                  <span className={styles.sheetSub}>
                    Ver y gestionar miembros
                  </span>
                </div>
              </button>
            )}
            {isAdmin && puedeVer("preventivos") && (
              <button
                className={styles.sheetItem}
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/preventivos");
                }}
              >
                <span className={styles.sheetIconWrap}>
                  <CalendarClock className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>
                    Preventivos{isBasicNav && " 🔒"}
                  </span>
                  <span className={styles.sheetSub}>
                    {isBasicNav ? "Disponible en Plan Pro" : "Mantenimiento programado"}
                  </span>
                </div>
              </button>
            )}
            {isAdmin && puedeVer("normativa") && (
              <button
                className={styles.sheetItem}
                onClick={() => {
                  setMoreOpen(false);
                  router.push("/normativa");
                }}
              >
                <span className={styles.sheetIconWrap}>
                  <ShieldCheck className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>
                    Normativa{isBasicNav && " 🔒"}
                  </span>
                  <span className={styles.sheetSub}>
                    {isBasicNav ? "Disponible en Plan Pro" : "DS 594, Ley 16.744, DS 44"}
                  </span>
                </div>
              </button>
            )}
            {isAdmin && (
              <button className={styles.sheetItem} onClick={abrirInvite}>
                <span className={styles.sheetIconWrap}>
                  <UserPlus className={styles.sheetIcon} />
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Invitar miembro</span>
                  <span className={styles.sheetSub}>
                    Agregar miembro al equipo
                  </span>
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
              <button
                className={styles.sheetItem}
                onClick={toggleNotificaciones}
              >
                <span className={styles.sheetIconWrap}>
                  {notifStatus === "granted" ? (
                    <Bell className={styles.sheetIcon} />
                  ) : (
                    <BellOff className={styles.sheetIcon} />
                  )}
                </span>
                <div className={styles.sheetText}>
                  <span className={styles.sheetTitle}>Notificaciones push</span>
                  <span className={styles.sheetSub}>
                    {notifStatus === "granted"
                      ? "Activadas"
                      : notifStatus === "denied"
                        ? "Bloqueadas"
                        : "Toca para activar"}
                  </span>
                </div>
              </button>
            )}
            <div className={styles.sheetDivider} />
            <button
              className={styles.sheetItem}
              onClick={() => {
                setMoreOpen(false);
                router.push("/ayuda");
              }}
            >
              <span className={styles.sheetIconWrap}>
                <HelpCircle className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>Ayuda</span>
                <span className={styles.sheetSub}>Centro de ayuda</span>
              </div>
            </button>
            <button
              className={styles.sheetItem}
              onClick={() => {
                setMoreOpen(false);
                router.push("/configuracion");
              }}
            >
              <span className={styles.sheetIconWrap}>
                <Settings className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>Configuración</span>
                <span className={styles.sheetSub}>Cuenta y preferencias</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Invite modal ── */}
      {inviteOpen && (
        <div
          className={styles.inviteOverlay}
          onClick={() => setInviteOpen(false)}
        >
          <div
            className={styles.inviteModal}
            onClick={(e) => e.stopPropagation()}
          >
            {inviteOk ? (
              <div className={styles.modalSuccess}>
                <p className={styles.modalSuccessTitle}>¡Usuario creado!</p>
                <p className={styles.modalSuccessInfo}>
                  Comparte estas credenciales con{" "}
                  <strong>{inviteOk.nombre}</strong>:
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
                <button
                  className={styles.btnPrimary}
                  onClick={() => setInviteOpen(false)}
                >
                  Listo
                </button>
              </div>
            ) : (
              <>
                <h2 className={styles.modalTitle}>Invitar miembro</h2>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nombre completo</label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Ej. Juan Pérez"
                    value={inviteForm.nombre}
                    onChange={(e) => setField("nombre", e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email</label>
                  <input
                    className={styles.formInput}
                    type="email"
                    placeholder="usuario@empresa.cl"
                    value={inviteForm.email}
                    onChange={(e) => setField("email", e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Contraseña temporal
                  </label>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Mínimo 8 caracteres"
                    value={inviteForm.password}
                    onChange={(e) => setField("password", e.target.value)}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Rol</label>
                  <select
                    className={styles.formSelect}
                    value={inviteForm.rol}
                    onChange={(e) => setField("rol", e.target.value)}
                  >
                    <option value="tecnico">{ROL_LABEL.tecnico}</option>
                    <option value="jefe">{ROL_LABEL.jefe}</option>
                    {userRol === "admin" && <option value="admin">{ROL_LABEL.admin}</option>}
                  </select>
                </div>
                {inviteError && (
                  <p className={styles.formError}>{inviteError}</p>
                )}
                <div className={styles.modalActions}>
                  <button
                    className={styles.btnGhost}
                    onClick={() => setInviteOpen(false)}
                    disabled={inviteSaving}
                  >
                    Cancelar
                  </button>
                  <button
                    className={styles.btnPrimary}
                    onClick={enviarInvitacion}
                    disabled={inviteSaving}
                  >
                    {inviteSaving ? "Creando…" : "Invitar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav
        className={`${styles.nav} ${isDesktop && collapsed ? styles.navCollapsed : ""}`}
      >
        {/* Logo header — expanded: logo + full-height collapse btn */}
        {isDesktop && !collapsed && (
          <div className={styles.sidebarLogoArea}>
            <span className={styles.sidebarLogoWrap}>
              <img
                src="/pangui-logo-inv.svg"
                alt="Pangui"
                className={styles.sidebarLogoImg}
              />
            </span>
            <button
              className={styles.collapseBtn}
              onClick={toggleCollapse}
              title="Contraer barra lateral"
            >
              <PanelLeftClose size={20} />
            </button>
          </div>
        )}

        {/* Collapsed — small logo centered, click to expand */}
        {isDesktop && collapsed && (
          <button
            className={styles.sidebarLogoCollapsed}
            onClick={toggleCollapse}
            title="Expandir barra lateral"
          >
            <img
              src="/pangui-logo-inv.svg"
              alt="Pangui"
              className={styles.sidebarLogoImgSm}
            />
          </button>
        )}

        {/* Empezando — onboarding, hidden when complete */}
        {!onboardingDone && (
          <Link
            href="/empezando"
            className={`${styles.item} ${isActive("/empezando") ? styles.active : ""}`}
          >
            <Rocket className={styles.icon} />
            <span className={styles.label}>Empezando</span>
          </Link>
        )}

        {/* Órdenes — visible a todos los usuarios */}
        <Link
          href="/ordenes"
          className={`${styles.itemNueva} ${isActive("/ordenes") ? styles.active : ""}`}
        >
          <ClipboardList className={styles.nuevaIcon} />
          <span className={styles.label}>Órdenes</span>
        </Link>

        <Link
          href={base}
          className={`${styles.item} ${pathname === base ? styles.active : ""}`}
        >
          <TrendingUpDown className={styles.icon} />
          <span className={styles.label}>Métricas</span>
        </Link>

        {isAdmin && puedeVer("activos") && (
          <Link
            href="/activos"
            className={`${styles.item} ${isActive("/activos") ? styles.active : ""}`}
          >
            <Server className={styles.icon} />
            <span className={styles.label}>Activos</span>
          </Link>
        )}

        {puedeVer("inventario") && (
          <Link
            href={`/partes`}
            className={`${styles.item} ${isActive(`/partes`) ? styles.active : ""}`}
          >
            <Boxes className={styles.icon} />
            <span className={styles.label}>Partes</span>
          </Link>
        )}

        {/* Desktop-only sidebar items */}
        {isDesktop && isAdmin && (
          <>
            {puedeVer("usuarios") && (
              <Link
                href="/usuarios"
                className={`${styles.item} ${isActive("/usuarios") ? styles.active : ""}`}
              >
                <Users className={styles.icon} />
                <span className={styles.label}>Equipo</span>
              </Link>
            )}
            {puedeVer("preventivos") && (
              <Link
                href="/preventivos"
                className={`${styles.item} ${isActive("/preventivos") ? styles.active : ""}`}
              >
                <CalendarClock className={styles.icon} />
                <span className={styles.label}>Preventivos</span>
                {isBasicNav && <Lock size={11} style={{ marginLeft: "auto", opacity: 0.5 }} />}
              </Link>
            )}
            {puedeVer("normativa") && (
              <Link
                href="/normativa"
                className={`${styles.item} ${isActive("/normativa") ? styles.active : ""}`}
              >
                <ShieldCheck className={styles.icon} />
                <span className={styles.label}>Normativa</span>
                {isBasicNav && <Lock size={11} style={{ marginLeft: "auto", opacity: 0.5 }} />}
              </Link>
            )}
          </>
        )}

        {/* Notifications — mobile: in nav bar */}
        {!isDesktop && (
          <Link
            href={`/notificaciones`}
            className={`${styles.item} ${isActive(`/notificaciones`) ? styles.active : ""}`}
          >
            <span className={styles.bellWrap}>
              <Bell className={styles.icon} />
              {notifUnread > 0 && (
                <span className={styles.notifDot}>
                  {notifUnread > 9 ? "9+" : notifUnread}
                </span>
              )}
            </span>
            <span className={styles.label}>Avisos</span>
          </Link>
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

        {/* Desktop sidebar bottom section */}
        {isDesktop && (
          <>
            <div className={styles.sidebarSpacer} />
            <Link
              href={`/notificaciones`}
              className={`${styles.item} ${isActive(`/notificaciones`) ? styles.active : ""}`}
            >
              <span className={styles.bellWrap}>
                <Bell className={styles.icon} />
                {notifUnread > 0 && (
                  <span className={styles.notifDot}>
                    {notifUnread > 9 ? "9+" : notifUnread}
                  </span>
                )}
              </span>
              <span className={styles.label}>Notificaciones</span>
            </Link>
            <Link
              href="/ayuda"
              className={`${styles.item} ${isActive("/ayuda") ? styles.active : ""}`}
            >
              <HelpCircle className={styles.icon} />
              <span className={styles.label}>Ayuda</span>
            </Link>
            <Link
              href="/configuracion"
              className={`${styles.item} ${isActive("/configuracion") ? styles.active : ""}`}
            >
              <Settings className={styles.icon} />
              <span className={styles.label}>Configuración</span>
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
