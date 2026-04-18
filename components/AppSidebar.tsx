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
} from "lucide-react";

import { createClient } from "@/lib/supabase";
import { usePermisos } from "@/lib/permisos";
import { ROL_LABEL } from "@/lib/roles";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

interface UserData {
  nombre: string;
  rol: string;
}

function SidebarUserFooter({ user }: { user: UserData | null }) {
  const [open, setOpen] = useState(false);

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
            border: "1px solid #E5E7EB",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
            overflow: "hidden",
          }}>
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
                color: "#DC2626",
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
          borderRadius: 6,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#273D88", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {initials(user.nombre)}
        </span>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1E2429", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.nombre}
          </div>
          <div style={{ fontSize: 11, color: "#8594A3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rolLabel}
          </div>
        </div>
        <ChevronUp size={14} style={{ color: "#8594A3", flexShrink: 0, transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.15s" }} />
      </button>
    </div>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const channelRef = useRef<any>(null);

  const [onboardingDone, setOnboardingDone] = useState(true);
  const [userRol, setUserRol] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);

  const { puedeVer } = usePermisos();
  const isAdmin = userRol === "jefe" || userRol === "admin";

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

      channelRef.current = sb.channel("sidebar").subscribe();
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
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 14px",
          borderBottom: "1px solid #E5E7EB",
        }}>
          <img src="/logo2.svg" alt="Pangui" style={{ height: 24, width: "auto", maxWidth: 130 }} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {!onboardingDone && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/empezando")}>
                    <Link href="/empezando"><Rocket /><span>Empezando</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/inicio")}>
                  <Link href="/inicio"><LayoutDashboard /><span>Inicio</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/ordenes")}>
                  <Link href="/ordenes"><ClipboardList /><span>Órdenes</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {puedeVer("inventario") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/partes")}>
                    <Link href="/partes"><Boxes /><span>Partes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {isAdmin && puedeVer("usuarios") && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/usuarios")}>
                    <Link href="/usuarios"><Users /><span>Equipo</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/notificaciones")}>
                  <Link href="/notificaciones"><Bell /><span>Notificaciones</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive("/configuracion")}>
                  <Link href="/configuracion"><Settings /><span>Configuración</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div style={{ borderTop: "1px solid #E5E7EB", padding: "8px" }}>
        <SidebarUserFooter user={userData} />
      </div>
    </Sidebar>
  );
}
