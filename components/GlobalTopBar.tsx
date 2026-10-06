"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BellRing, Box, Calendar, Check, ChevronDown, ChevronRight, CircleUserRound, CreditCard, Inbox, Kanban, Link2,
  List, LogOut, MapPin, MapPinned, Monitor, Moon, SlidersHorizontal, Sun,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-user";
import { getPerfilUsuario } from "@/lib/perfil-usuario";
import NotificationMenu from "@/components/NotificationMenu";
import { useTopBarActions, useTopBarVistaActual } from "@/components/TopBarActions";

type ThemePref = "light" | "auto" | "dark";

function applyTheme(preference: ThemePref) {
  localStorage.setItem("pangui_theme", preference);
  const resolved = preference === "auto"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", preference);
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === "dark" ? "#0B1220" : "#F7F8FA";
  window.dispatchEvent(new StorageEvent("storage", { key: "pangui_theme", newValue: preference }));
}

const THEMES: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "auto", label: "Sistema", icon: Monitor },
  { value: "dark", label: "Oscuro", icon: Moon },
];

// A crumb is plain text unless it carries an href, in which case it links back
// to that parent page (the last crumb is the current page and never links).
// A crumb with `menu` is a dropdown of sibling pages (shadcn Breadcrumb
// "Dropdown" pattern): it replaces the Lista/Calendario/Kanban segmented
// control that used to sit above Órdenes.
// Cada opción navega (`href`, vistas que son rutas) o llama a la página
// (`onSelect`, vistas que son estado; ver useTopBarVista).
type MenuItem = { label: string; icon?: React.ReactNode; href?: string; onSelect?: () => void };
type MenuCrumb = { label: string; menu: MenuItem[] };
type Crumb = string | { label: string; href: string } | MenuCrumb;

const VISTAS_ORDENES = [
  { label: "Lista", href: "/ordenes/lista", icon: <List size={16} /> },
  { label: "Calendario", href: "/ordenes/calendario", icon: <Calendar size={16} /> },
  { label: "Kanban", href: "/ordenes/kanban", icon: <Kanban size={16} /> },
];
// Reemplazan los controles segmentados que había sobre cada sección.
const VISTAS_ACTIVOS = [
  { label: "Activos", href: "/activos/activos", icon: <Box size={16} /> },
  { label: "Ubicaciones", href: "/activos/ubicaciones", icon: <MapPin size={16} /> },
];
const VISTAS_UBICACIONES = [
  { label: "Ubicaciones", href: "/ubicaciones/ubicaciones", icon: <MapPin size={16} /> },
  { label: "Lugares específicos", href: "/ubicaciones/lugares", icon: <MapPinned size={16} /> },
  { label: "Asociaciones", href: "/ubicaciones/asociaciones", icon: <Link2 size={16} /> },
];
const VISTAS_NOTIFICACIONES = [
  { label: "Bandeja", href: "/notificaciones/bandeja", icon: <Inbox size={16} /> },
  { label: "Preferencias", href: "/notificaciones/preferencias", icon: <SlidersHorizontal size={16} /> },
  { label: "Reglas de alerta", href: "/notificaciones/reglas-alerta", icon: <BellRing size={16} /> },
];

/** Crumb desplegable si `pathname` es una de las vistas; si no, null. */
function vistaDe(pathname: string, vistas: { label: string; href: string; icon: React.ReactNode }[]): MenuCrumb | null {
  const v = vistas.find(x => pathname === x.href);
  return v ? { label: v.label, menu: vistas } : null;
}

function pageTrail(pathname: string): Crumb[] {
  if (pathname.startsWith("/suscripcion")) return ["Cuenta", "Suscripción"];
  if (pathname.startsWith("/mi-cuenta")) return ["Cuenta", "Mi cuenta"];
  if (pathname.startsWith("/espacio-trabajo")) return ["Cuenta", "Espacio de trabajo"];
  if (pathname.startsWith("/integraciones/meconecta")) return ["Cuenta", { label: "Integraciones", href: "/integraciones" }, "MeConecta"];
  if (pathname.startsWith("/integraciones")) return ["Cuenta", "Integraciones"];
  if (pathname.startsWith("/preferencias-notificaciones")) return ["Cuenta", "Notificaciones"];
  // These must precede `/ordenes`: a bare prefix would otherwise label
  // `/ordenes-compra` as work orders.
  // El primer crumb es el grupo de la barra lateral donde vive la página.
  if (pathname.startsWith("/ordenes-compra")) return ["Gestión", "Órdenes de compra"];
  if (pathname.startsWith("/proveedores")) return ["Gestión", "Proveedores"];
  if (pathname.startsWith("/ordenes/crear")) return ["Operaciones", "Órdenes", "Nueva orden"];
  // Las vistas van antes que el detalle: /ordenes/lista también calza con /ordenes/<id>.
  const vista = VISTAS_ORDENES.find(v => pathname === v.href);
  if (vista) return ["Operaciones", "Órdenes", { label: vista.label, menu: VISTAS_ORDENES }];
  if (/^\/ordenes\/[^/]+$/.test(pathname)) return ["Operaciones", { label: "Órdenes", href: "/ordenes/lista" }, "Detalle de OT"];
  if (pathname.startsWith("/ordenes")) return ["Operaciones", "Órdenes"];
  // Las rutas más específicas primero: startsWith("/planes") atraparía también
  // a /planes/crear si fuera antes.
  if (pathname.startsWith("/planes/crear/plantilla")) return ["Operaciones", "Planes de mantención", "Plantilla"];
  // "Editar" y "Nuevo" comparten ruta y solo los distingue `?editar=`, que
  // aquí no llega: una etiqueta neutra es preferible a afirmar "Nuevo plan"
  // sobre uno que se está editando.
  if (pathname.startsWith("/planes/crear")) return ["Operaciones", "Planes de mantención", "Formulario"];
  if (pathname.startsWith("/planes")) return ["Operaciones", "Planes de mantención"];
  const vActivos = vistaDe(pathname, VISTAS_ACTIVOS);
  if (vActivos) return ["Operaciones", vActivos];
  if (pathname.startsWith("/activos/")) return ["Operaciones", { label: "Activos", href: "/activos/activos" }, "Detalle"];
  if (pathname.startsWith("/activos")) return ["Operaciones", "Activos"];
  if (pathname.startsWith("/partes")) return ["Operaciones", "Materiales"];
  if (pathname === "/procedimientos/nueva") return ["Operaciones", { label: "Procedimientos", href: "/procedimientos" }, "Nuevo"];
  if (pathname.endsWith("/editar") && pathname.startsWith("/procedimientos/")) return ["Operaciones", { label: "Procedimientos", href: "/procedimientos" }, "Editar"];
  if (pathname.startsWith("/procedimientos")) return ["Operaciones", "Procedimientos"];
  if (pathname.startsWith("/analitica/ordenes")) return ["Operaciones", "Analítica", "Órdenes"];
  if (pathname.startsWith("/analitica/activos")) return ["Operaciones", "Analítica", "Activos"];
  if (pathname.startsWith("/analitica")) return ["Operaciones", "Analítica"];
  if (pathname.startsWith("/usuarios")) return ["Operaciones", "Equipo"];
  const vUbic = vistaDe(pathname, VISTAS_UBICACIONES);
  if (vUbic) return ["Gestión", vUbic];
  if (pathname.startsWith("/ubicaciones/mapa")) return ["Gestión", { label: "Ubicaciones", href: "/ubicaciones/ubicaciones" }, "Mapa"];
  if (pathname.startsWith("/ubicaciones")) return ["Gestión", "Ubicaciones"];
  const vNotif = vistaDe(pathname, VISTAS_NOTIFICACIONES);
  if (vNotif) return ["Operaciones", "Notificaciones", vNotif];
  if (pathname.startsWith("/notificaciones")) return ["Operaciones", "Notificaciones"];
  if (pathname.startsWith("/medidores")) return ["Condición", "Medidores"];
  if (pathname.startsWith("/automatizaciones")) return ["Condición", "Automatizaciones"];
  if (pathname.startsWith("/categorias")) return ["Gestión", "Categorías"];
  if (pathname.startsWith("/itos")) return ["Gestión", "ITOs"];
  if (pathname.startsWith("/requisitos")) return ["Gestión", "Requisitos de OTs"];
  if (pathname.startsWith("/papelera")) return ["Gestión", "Papelera"];
  return ["Operaciones", "Inicio"];
}

export default function GlobalTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [theme, setTheme] = useState<ThemePref>("auto");
  const vistaPagina = useTopBarVistaActual();
  const trailBase = pageTrail(pathname);
  const trail: Crumb[] = vistaPagina
    ? [...(vistaPagina.reemplazaUltimo ? trailBase.slice(0, -1) : trailBase), { label: vistaPagina.label, menu: vistaPagina.opciones }]
    : trailBase;
  const topBarActions = useTopBarActions();

  useEffect(() => {
    setTheme((localStorage.getItem("pangui_theme") as ThemePref | null) ?? "auto");
    void getAuthUser().then(async (user) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const perfil = await getPerfilUsuario();
      setName(perfil?.nombre ?? "");
      setRole(perfil?.rol ?? "");
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    // Chrome, so it uses --sidebar-bg (the canvas tone) rather than --surface-1.
    // Cards in the content area stay pure white and remain the elements that
    // read as sitting on top.
    <header style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)", position: "relative", zIndex: 100 }}>
      <nav aria-label="Ubicación actual" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--fg-2)" }}>
        {trail.map((crumb, index) => {
          const label = typeof crumb === "string" ? crumb : crumb.label;
          const last = index === trail.length - 1;
          const textStyle = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: 400, color: last ? "var(--fg-1)" : "var(--fg-3)" } as const;
          return (
            <span key={`${label}-${index}`} style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
              {index > 0 && <ChevronRight size={14} color="var(--fg-4)" />}
              {typeof crumb !== "string" && "menu" in crumb ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Vista: ${label}. Cambiar vista`}
                      style={{
                        ...textStyle, display: "inline-flex", alignItems: "center", gap: 4,
                        height: 30, padding: "0 6px", margin: "0 -6px",
                        border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {label}
                      <ChevronDown size={14} color="var(--fg-3)" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" style={{ minWidth: 200, padding: 6 }}>
                    {crumb.menu.map(item => {
                      const actual = item.label === label;
                      const itemStyle = { fontSize: 14, padding: "9px 12px", gap: 10, borderRadius: 6, color: actual ? "var(--brand)" : "var(--fg-1)", cursor: "pointer" };
                      const icono = <span style={{ display: "flex", color: actual ? "var(--brand)" : "var(--fg-3)" }}>{item.icon}</span>;
                      return item.href ? (
                        <DropdownMenuItem key={item.label} asChild style={itemStyle}>
                          <Link href={item.href} scroll={false} aria-current={actual ? "page" : undefined} style={{ textDecoration: "none" }}>
                            {icono}
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem key={item.label} onSelect={item.onSelect} aria-current={actual ? "page" : undefined} style={itemStyle}>
                          {icono}
                          {item.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : typeof crumb !== "string" && !last ? (
                <Link
                  href={"href" in crumb ? crumb.href : "#"}
                  prefetch={false}
                  style={{ ...textStyle, textDecoration: "none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg-1)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-3)"; }}
                >
                  {label}
                </Link>
              ) : (
                <span style={textStyle}>{label}</span>
              )}
            </span>
          );
        })}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {/* Page-contributed icon buttons (see TopBarActions), left of the bell. */}
        {topBarActions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.label}
            aria-label={action.label}
            style={{
              width: 34, height: 34, borderRadius: "50%", border: "none",
              background: "transparent",
              color: action.disabled ? "var(--fg-4)" : "var(--fg-3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: action.disabled ? "not-allowed" : "pointer",
              opacity: action.disabled ? 0.5 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => { if (!action.disabled) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--fg-1)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = action.disabled ? "var(--fg-4)" : "var(--fg-3)"; }}
          >
            {action.icon}
          </button>
        ))}
        <NotificationMenu />
        <div ref={menuRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Opciones de perfil"
          aria-expanded={open}
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "transparent", color: "var(--fg-3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
        >
          <CircleUserRound size={20} />
        </button>

        {open && (
          <div style={{ position: "absolute", top: 42, right: 0, zIndex: 1, width: 250, padding: 6, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", color: "var(--fg-1)" }}>
            <button type="button" onClick={() => { setOpen(false); router.push("/mi-cuenta"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px", border: 0, borderRadius: 8, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <CircleUserRound size={17} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Mi cuenta"}</span>
                {email && <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>}
              </span>
            </button>

            {role === "owner" && (
              <button type="button" onClick={() => { setOpen(false); router.push("/suscripcion"); }} style={{ width: "100%", minHeight: 38, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: 0, borderRadius: 8, background: "transparent", color: "var(--fg-1)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
                <CreditCard size={16} color="var(--fg-3)" />
                Suscripción
              </button>
            )}

            <div style={{ height: 1, margin: "4px 8px", background: "var(--divider)" }} />
            <div style={{ padding: "7px 10px 5px", fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>Apariencia</div>
            {THEMES.map((option) => {
              const Icon = option.icon;
              return (
                <button key={option.value} type="button" onClick={() => { setTheme(option.value); applyTheme(option.value); }} style={{ width: "100%", minHeight: 36, display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: 0, borderRadius: 8, background: theme === option.value ? "var(--surface-hover)" : "transparent", color: "var(--fg-1)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
                  <Icon size={16} color="var(--fg-3)" />
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {theme === option.value && <Check size={15} color="var(--brand)" />}
                </button>
              );
            })}

            <div style={{ height: 1, margin: "4px 8px", background: "var(--divider)" }} />
            <button type="button" onClick={signOut} style={{ width: "100%", minHeight: 38, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: 0, borderRadius: 8, background: "transparent", color: "var(--danger)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, textAlign: "left" }}>
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  );
}
