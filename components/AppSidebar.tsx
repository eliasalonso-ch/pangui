"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Bell,
  Users,
  Settings,
  ClipboardList,
  Rocket,
  LogOut,
  ChevronUp,
  LayoutDashboard,
  MapPin,
  BarChart2,
  ClipboardCheck,
  Search,
  PackageSearch,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase";
import { usePermisos } from "@/lib/permisos";
import { ROL_LABEL } from "@/lib/roles";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

interface UserData {
  nombre: string;
  rol: string;
}

function SidebarUserFooter({ user }: { user: UserData | null }) {
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ bottom: 56, left: 64 });
  const avatarRef = useRef<HTMLButtonElement>(null);
  const { collapsed } = useSidebar();
  const router = useRouter();

  function handleOpen() {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setPopupPos({ bottom: window.innerHeight - rect.top + 6, left: rect.right + 8 });
    }
    setOpen(true);
  }

  async function handleLogout() {
    const sb = createClient();
    await sb.auth.signOut();
    window.location.href = "/login";
  }

  function initials(name: string) {
    const p = name.trim().split(/\s+/);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  if (!user) return null;

  const rolLabel = (ROL_LABEL as Record<string, string>)[user.rol] ?? user.rol;

  if (collapsed) {
    return (
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        {open && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={() => setOpen(false)} />
            <div style={{
              position: "fixed",
              bottom: popupPos.bottom,
              left: popupPos.left,
              zIndex: 9999,
              width: 180,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              overflow: "hidden",
            }}>
              <button
                onClick={() => { setOpen(false); router.push("/configuracion"); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#0F172A", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <Settings size={14} />Configuración
              </button>
              <div style={{ height: 1, background: "#E2E8F0", margin: "0 12px" }} />
              <button
                onClick={handleLogout}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#EF4444", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <LogOut size={14} />Cerrar sesión
              </button>
            </div>
          </>
        )}
        <button
          ref={avatarRef}
          onClick={handleOpen}
          title={user.nombre}
          style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, border: "none", cursor: "pointer" }}
        >
          {initials(user.nombre)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}>
            <button
              onClick={() => { setOpen(false); router.push("/configuracion"); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#0F172A", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <Settings size={14} />Configuración
            </button>
            <div style={{ height: 1, background: "#E2E8F0", margin: "0 12px" }} />
            <button
              onClick={handleLogout}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#EF4444", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <LogOut size={14} />Cerrar sesión
            </button>
          </div>
        </>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", transition: "background 0.15s" }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {initials(user.nombre)}
        </span>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.nombre}</div>
          <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rolLabel}</div>
        </div>
        <ChevronUp size={14} style={{ color: "#94A3B8", flexShrink: 0, transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.15s" }} />
      </button>
    </div>
  );
}

const NAV_ITEMS = [
  { href: "/empezando",          icon: Rocket,         label: "Empezando",               onboarding: true  },
  { href: "/inicio",             icon: LayoutDashboard, label: "Inicio"                                    },
  { href: "/ordenes",            icon: ClipboardList,  label: "Órdenes"                                   },
  { href: "/levantamientos",     icon: Search,         label: "Levantamientos"                            },
  { href: "/analitica",          icon: BarChart2,      label: "Analítica",               noMateriales: true},
  { href: "/analitica-materiales", icon: PackageSearch, label: "Analítica de Materiales", skipHoja: true   },
  { href: "/procedimientos",     icon: ClipboardCheck, label: "Procedimientos",          adminOnly: true   },
  { href: "/partes",             icon: Boxes,          label: "Materiales",              inventario: true, skipMateriales: true },
  { href: "/usuarios",           icon: Users,          label: "Equipo",                  adminOnly: true, usuariosOnly: true },
] as const;

export default function AppSidebar() {
  const pathname = usePathname();
  const { collapsed, setCollapsed } = useSidebar();

  const [onboardingDone, setOnboardingDone] = useState(true);
  const [userRol, setUserRol] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [modoRegistro, setModoRegistro] = useState<"ambos" | "materiales" | "hoja">("ambos");
  const [workspaceLogo, setWorkspaceLogo] = useState<string | null | undefined>(undefined);

  const { puedeVer, userRol: permisosRol } = usePermisos();
  const effectiveRol = userRol ?? permisosRol;
  const isAdmin = effectiveRol === "jefe" || effectiveRol === "admin" || effectiveRol === "owner";

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data } = await sb
        .from("usuarios")
        .select("workspace_id, rol, onboarding_done, nombre")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.rol) setUserRol(data.rol);
      setOnboardingDone(data?.onboarding_done ?? false);
      if (data?.nombre && data?.rol) setUserData({ nombre: data.nombre, rol: data.rol });

      if (data?.workspace_id) {
        const { data: wsData } = await sb
          .from("workspaces")
          .select("modo_registro, logo_url")
          .eq("id", data.workspace_id)
          .maybeSingle();
        if (wsData?.modo_registro) setModoRegistro(wsData.modo_registro as "ambos" | "materiales" | "hoja");
        setWorkspaceLogo(wsData?.logo_url ?? null);
      }

      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", user.id)
        .eq("leida", false);
      setUnreadCount(count ?? 0);

      const channel = sb.channel(`sidebar-notif:${user.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `usuario_id=eq.${user.id}` },
          async () => {
            const { count: fresh } = await sb
              .from("notifications")
              .select("id", { count: "exact", head: true })
              .eq("usuario_id", user.id)
              .eq("leida", false);
            setUnreadCount(fresh ?? 0);
          }
        )
        .subscribe();

      return () => { sb.removeChannel(channel); };
    }
    load();
  }, []);

  function isActive(href: string) {
    if (href === "/analitica") return pathname === "/analitica" || (pathname.startsWith("/analitica") && !pathname.startsWith("/analitica-materiales"));
    return pathname === href || pathname.startsWith(href);
  }

  const collapseBtn = (
    <button
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? "Expandir menú" : "Colapsar menú"}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: "100%", height: 36, border: "1px solid #BFDBFE", background: "none",
        cursor: "pointer", color: "#1D4ED8", borderRadius: 6, padding: 0,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#93C5FD"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "#BFDBFE"; }}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        {collapsed ? (
          /* Two bars + arrow pointing right (expand) */
          <>
            <rect x="2" y="4" width="3" height="12" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="7" y="4" width="3" height="12" rx="1" fill="currentColor" opacity="0.5" />
            <path d="M13 7l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          /* Two bars + arrow pointing left (collapse) */
          <>
            <rect x="15" y="4" width="3" height="12" rx="1" fill="currentColor" opacity="0.5" />
            <rect x="10" y="4" width="3" height="12" rx="1" fill="currentColor" opacity="0.5" />
            <path d="M7 7L4 10l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>
    </button>
  );

  return (
    <Sidebar>
      {/* Header: logo */}
      <SidebarHeader>
        <div style={{
          height: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 16px",
          borderBottom: "1px solid #E2E8F0",
        }}>
          {workspaceLogo !== undefined && (
            collapsed ? (
              <img
                src={workspaceLogo ?? "/logo2.svg"}
                alt="Logo"
                style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6 }}
              />
            ) : (
              <img
                src={workspaceLogo ?? "/logo2.svg"}
                alt="Logo"
                style={{ maxHeight: 100, width: "auto", maxWidth: 190, objectFit: "contain" }}
              />
            )
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Collapse toggle */}
        <div style={{ padding: "4px 8px 0" }}>
          {collapseBtn}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!onboardingDone && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/empezando")} tooltip="Empezando">
                    <Link href="/empezando" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <Rocket size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Empezando</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/inicio")} tooltip="Inicio">
                  <Link href="/inicio" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                    <LayoutDashboard size={16} style={{ flexShrink: 0 }} />
                    {!collapsed && <span>Inicio</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ordenes")} tooltip="Órdenes">
                  <Link href="/ordenes" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                    <ClipboardList size={16} style={{ flexShrink: 0 }} />
                    {!collapsed && <span>Órdenes</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/levantamientos")} tooltip="Levantamientos">
                  <Link href="/levantamientos" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                    <Search size={16} style={{ flexShrink: 0 }} />
                    {!collapsed && <span>Levantamientos</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/analitica")} tooltip="Analítica">
                  <Link href="/analitica" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                    <BarChart2 size={16} style={{ flexShrink: 0 }} />
                    {!collapsed && <span>Analítica</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {modoRegistro !== "materiales" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/analitica-materiales")} tooltip="Analítica de Materiales">
                    <Link href="/analitica-materiales" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <PackageSearch size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Analítica de Materiales</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/procedimientos")} tooltip="Procedimientos">
                    <Link href="/procedimientos" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <ClipboardCheck size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Procedimientos</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {puedeVer("inventario") && modoRegistro !== "hoja" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/partes")} tooltip="Materiales">
                    <Link href="/partes" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <Boxes size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Materiales</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && puedeVer("usuarios") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/usuarios")} tooltip="Equipo">
                    <Link href="/usuarios" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <Users size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Equipo</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Cuenta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/notificaciones")} tooltip="Notificaciones">
                  <Link href="/notificaciones" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                      <Bell size={16} />
                      {unreadCount > 0 && (
                        <span style={{ position: "absolute", top: -4, right: -4, width: 8, height: 8, borderRadius: "50%", background: "#EF4444", border: "1.5px solid #fff" }} />
                      )}
                    </span>
                    {!collapsed && <span>Notificaciones</span>}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/ubicaciones")} tooltip="Ubicaciones">
                    <Link href="/ubicaciones" style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10 }}>
                      <MapPin size={16} style={{ flexShrink: 0 }} />
                      {!collapsed && <span>Ubicaciones</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserFooter user={userData} />
      </SidebarFooter>
    </Sidebar>
  );
}
