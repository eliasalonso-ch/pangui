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
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
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
  useSidebar,
} from "@/components/ui/sidebar";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Separator } from "@/components/ui/separator";

// ── Types ─────────────────────────────────────
interface InviteForm {
  nombre: string;
  email: string;
  password: string;
  rol: string;
}

interface InviteOk {
  nombre: string;
  email: string;
  password: string;
}

// ── Header ────────────────────────────────────
function SidebarHeaderInner() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        padding: collapsed ? "8px 0 4px" : "12px 8px 4px",
      }}
    >
      {collapsed ? (
        <>
          <img src="/logo.svg" style={{ width: 26 }} />
          <button onClick={toggleSidebar}>
            <ChevronsRight size={16} />
          </button>
        </>
      ) : (
        <div style={{ position: "relative" }}>
          <img src="/logo.svg" style={{ width: "100%", maxHeight: 48 }} />
          <button
            onClick={toggleSidebar}
            style={{ position: "absolute", right: 5, bottom: 5 }}
          >
            <ChevronsLeft size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────
export default function AppSidebar() {
  const pathname = usePathname();
  const channelRef = useRef<any>(null);

  const [plantaId, setPlantaId] = useState<string | null>(null);
  const [userRol, setUserRol] = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(true);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    nombre: "",
    email: "",
    password: "",
    rol: "tecnico",
  });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<InviteOk | null>(null);

  const { puedeVer } = usePermisos();
  const isAdmin = userRol === "jefe" || userRol === "admin";

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data } = await sb
        .from("usuarios")
        .select("workspace_id, rol, onboarding_done")
        .eq("id", user.id)
        .maybeSingle();

      if (data?.workspace_id) setPlantaId(data.workspace_id);
      if (data?.rol) setUserRol(data.rol);
      setOnboardingDone(data?.onboarding_done ?? false);

      channelRef.current = sb.channel("sidebar").subscribe();
    }

    load();
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Sidebar ── */}
      <Sidebar>
        <SidebarHeader>
          <SidebarHeaderInner />
        </SidebarHeader>

        <SidebarContent>
          {/* Main */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {!onboardingDone && (
                  <SidebarMenuItem>
                    <Link href="/empezando">
                      <SidebarMenuButton isActive={isActive("/empezando")}>
                        <Rocket /> Empezando
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )}

                <SidebarMenuItem>
                  <Link href="/ordenes">
                    <SidebarMenuButton isActive={isActive("/ordenes")}>
                      <ClipboardList /> Órdenes
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>

                {puedeVer("inventario") && (
                  <SidebarMenuItem>
                    <Link href="/partes">
                      <SidebarMenuButton isActive={isActive("/partes")}>
                        <Boxes /> Partes
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )}

                {isAdmin && puedeVer("usuarios") && (
                  <SidebarMenuItem>
                    <Link href="/usuarios">
                      <SidebarMenuButton isActive={isActive("/usuarios")}>
                        <Users /> Equipo
                      </SidebarMenuButton>
                    </Link>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Bottom */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Link href="/notificaciones">
                    <SidebarMenuButton isActive={isActive("/notificaciones")}>
                      <Bell /> Notificaciones
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <Link href="/configuracion">
                    <SidebarMenuButton isActive={isActive("/configuracion")}>
                      <Settings /> Configuración
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </>
  );
}