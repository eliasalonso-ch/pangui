"use client";

import { useEffect, useState } from "react";
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
} from "@/components/ui/sidebar";

interface UserData {
  nombre: string;
  rol: string;
}

function SidebarUserFooter({ user }: { user: UserData | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

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
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "#0F172A",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <Settings size={14} />
              Configuración
            </button>
            <div style={{ height: 1, background: "#E2E8F0", margin: "0 12px" }} />
            <button
              onClick={handleLogout}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 500,
                color: "#EF4444",
                fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <LogOut size={14} />
              Cerrar sesión
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          background: "none",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
          color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(user.nombre)}
        </span>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.nombre}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rolLabel}
          </div>
        </div>
        <ChevronUp size={14} style={{ color: "#94A3B8", flexShrink: 0, transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.15s" }} />
      </button>
    </div>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();

  const [onboardingDone, setOnboardingDone] = useState(true);
  const [userRol, setUserRol] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [modoRegistro, setModoRegistro] = useState<"ambos" | "materiales" | "hoja">("ambos");

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
          .select("modo_registro")
          .eq("id", data.workspace_id)
          .maybeSingle();
        if (wsData?.modo_registro) setModoRegistro(wsData.modo_registro as "ambos" | "materiales" | "hoja");
      }

      const { count } = await sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("usuario_id", user.id)
        .eq("leida", false);
      setUnreadCount(count ?? 0);

      // Realtime: update badge when a new notification arrives or is read
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
    return pathname === href || pathname.startsWith(href);
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div style={{
          height: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 16px",
          borderBottom: "1px solid #E2E8F0",
        }}>
          <img src="/logo2.svg" alt="Pangui" style={{ width: "auto", maxWidth: 200, }} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!onboardingDone && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/empezando")}>
                    <Link href="/empezando"><Rocket size={16} /><span>Empezando</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/inicio")}>
                  <Link href="/inicio"><LayoutDashboard size={16} /><span>Inicio</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ordenes")}>
                  <Link href="/ordenes"><ClipboardList size={16} /><span>Órdenes</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/levantamientos")}>
                  <Link href="/levantamientos"><Search size={16} /><span>Levantamientos</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/analitica") && !isActive("/analitica-materiales")}>
                  <Link href="/analitica"><BarChart2 size={16} /><span>Analítica</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {modoRegistro !== "materiales" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/analitica-materiales")}>
                    <Link href="/analitica-materiales"><PackageSearch size={16} /><span>Analítica de Materiales</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/procedimientos")}>
                    <Link href="/procedimientos"><ClipboardCheck size={16} /><span>Procedimientos</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {puedeVer("inventario") && modoRegistro !== "hoja" && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/partes")}>
                    <Link href="/partes"><Boxes size={16} /><span>Materiales</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && puedeVer("usuarios") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/usuarios")}>
                    <Link href="/usuarios"><Users size={16} /><span>Equipo</span></Link>
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
                <SidebarMenuButton asChild isActive={isActive("/notificaciones")}>
                  <Link href="/notificaciones">
                    <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                      <Bell size={16} />
                      {unreadCount > 0 && (
                        <span style={{
                          position: "absolute",
                          top: -4,
                          right: -4,
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "#EF4444",
                          border: "1.5px solid #fff",
                        }} />
                      )}
                    </span>
                    <span>Notificaciones</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/ubicaciones")}>
                    <Link href="/ubicaciones"><MapPin size={16} /><span>Ubicaciones</span></Link>
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
