"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Boxes,
  Bell,
  Users,
  Settings,
  ClipboardList,
  Rocket,
  Lock,
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
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

// ── Types ────────────────────────────────────────────────────────
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

// ── Header ───────────────────────────────────────────────────────
function SidebarHeaderInner() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: collapsed ? "center" : "stretch",
      padding: collapsed ? "8px 0 4px" : "12px 8px 4px",
    }}>
      {collapsed ? (
        <>
          <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src="/logo.svg" alt="Pangui" style={{ width: 26, height: 26, objectFit: "contain" }} />
          </div>
          <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button
              onClick={toggleSidebar}
              title="Expandir menú"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 26, height: 26,
                border: "1px solid #E5E7EB", borderRadius: 4,
                background: "#fff", cursor: "pointer", color: "#677888",
                transition: "border-color 0.1s, color 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#273D88"; e.currentTarget.style.color = "#273D88"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#677888"; }}
            >
              <ChevronsRight size={14} strokeWidth={1.75} />
            </button>
          </div>
        </>
      ) : (
        <div style={{
          position: "relative",
          padding: "8px 10px 10px",
          border: "1px solid #E5E7EB",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
        }}>
          <img
            src="/logo.svg"
            alt="Pangui"
            style={{ width: "100%", height: "auto", maxHeight: 48, objectFit: "contain" }}
          />
          <button
            onClick={toggleSidebar}
            title="Colapsar menú"
            style={{
              position: "absolute", right: 5, bottom: 5,
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 20, height: 20,
              border: "1px solid #E5E7EB", borderRadius: 3,
              background: "#fff", cursor: "pointer", color: "#677888",
              transition: "border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#273D88"; e.currentTarget.style.color = "#273D88"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.color = "#677888"; }}
          >
            <ChevronsLeft size={12} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Form styles (inline so no CSS module needed) ─────────────────
const formLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.07em", color: "#4D5A66",
};
const formInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1px solid #E5E7EB",
  borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#1E2429",
  background: "#fff", outline: "none", boxSizing: "border-box",
};
const btnPrimary: React.CSSProperties = {
  flex: 1, padding: 10, background: "#273D88", color: "#fff",
  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
  fontFamily: "inherit", cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  flex: 1, padding: 10, background: "none", border: "1px solid #E5E7EB",
  borderRadius: 6, fontSize: 13, fontWeight: 500, fontFamily: "inherit",
  color: "#4D5A66", cursor: "pointer",
};

// ── Main component ───────────────────────────────────────────────
export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const channelRef = useRef<ReturnType<typeof createClient>["channel"] extends (...args: any[]) => infer R ? R : never>(null);

  const [plantaId,      setPlantaId]      = useState<string | null>(null);
  const [userRol,       setUserRol]       = useState<string | null>(null);
  const [onboardingDone, setOnboardingDone] = useState(true);

  // invite modal
  const [inviteOpen,   setInviteOpen]   = useState(false);
  const [inviteForm,   setInviteForm]   = useState<InviteForm>({ nombre: "", email: "", password: "", rol: "tecnico" });
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError,  setInviteError]  = useState<string | null>(null);
  const [inviteOk,     setInviteOk]     = useState<InviteOk | null>(null);

  useEffect(() => {
    async function loadProfile() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id, rol, onboarding_done, plan, plan_status")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.workspace_id) setPlantaId(perfil.workspace_id);
      if (perfil?.rol) setUserRol(perfil.rol);
      setOnboardingDone(perfil?.onboarding_done ?? false);
      channelRef.current = sb.channel(`sidebar-${user.id}`).subscribe();
    }
    loadProfile();
    return () => {
      if (channelRef.current) createClient().removeChannel(channelRef.current);
    };
  }, []);

  function setField(k: keyof InviteForm, v: string) {
    setInviteForm(f => ({ ...f, [k]: v }));
  }

  function abrirInvite() {
    setInviteForm({ nombre: "", email: "", password: "", rol: "tecnico" });
    setInviteError(null);
    setInviteOk(null);
    setInviteOpen(true);
  }

  async function enviarInvitacion() {
    if (!inviteForm.nombre.trim()) { setInviteError("Ingresa el nombre."); return; }
    if (!inviteForm.email.trim())  { setInviteError("Ingresa el email."); return; }
    if (inviteForm.password.length < 8) { setInviteError("La contraseña debe tener al menos 8 caracteres."); return; }
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
    if (!res.ok) { setInviteError(body.error ?? "Error al crear el usuario."); return; }
    setInviteOk({ nombre: inviteForm.nombre.trim(), email: inviteForm.email.trim(), password: inviteForm.password });
  }

  const isAdmin = userRol === "jefe" || userRol === "admin";
  const { puedeVer } = usePermisos();

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Invite modal ── */}
      <Dialog open={inviteOpen} onOpenChange={o => { if (!o) setInviteOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{inviteOk ? "¡Usuario creado!" : "Invitar miembro"}</DialogTitle>
          </DialogHeader>

          {inviteOk ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Comparte estas credenciales con <strong className="text-foreground">{inviteOk.nombre}</strong>:
              </p>
              <div className="flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</span>
                  <span className="font-medium text-foreground">{inviteOk.email}</span>
                </div>
                <Separator />
                <div className="flex justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contraseña</span>
                  <span className="font-medium text-foreground">{inviteOk.password}</span>
                </div>
              </div>
              <button
                className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
                onClick={() => setInviteOpen(false)}
              >
                Listo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {(["nombre", "email", "password"] as const).map(field => (
                <div key={field} className="flex flex-col gap-1.5">
                  <label style={formLabel}>
                    {field === "nombre" ? "Nombre completo" : field === "email" ? "Email" : "Contraseña temporal"}
                  </label>
                  <input
                    style={formInput}
                    type={field === "email" ? "email" : "text"}
                    placeholder={field === "nombre" ? "Ej. Juan Pérez" : field === "email" ? "usuario@empresa.cl" : "Mínimo 8 caracteres"}
                    value={inviteForm[field]}
                    onChange={e => setField(field, e.target.value)}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <label style={formLabel}>Rol</label>
                <select style={formInput} value={inviteForm.rol} onChange={e => setField("rol", e.target.value)}>
                  <option value="tecnico">{ROL_LABEL.tecnico}</option>
                  <option value="jefe">{ROL_LABEL.jefe}</option>
                  {userRol === "admin" && <option value="admin">{ROL_LABEL.admin}</option>}
                </select>
              </div>
              {inviteError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{inviteError}</p>
              )}
              <div className="flex gap-3">
                <button style={{ ...btnGhost, opacity: inviteSaving ? 0.5 : 1 }} onClick={() => setInviteOpen(false)} disabled={inviteSaving}>
                  Cancelar
                </button>
                <button style={{ ...btnPrimary, opacity: inviteSaving ? 0.5 : 1 }} onClick={enviarInvitacion} disabled={inviteSaving}>
                  {inviteSaving ? "Creando…" : "Invitar"}
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Sidebar ── */}
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarHeaderInner />
        </SidebarHeader>

        <SidebarContent>
          {/* Main nav */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {!onboardingDone && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/empezando")} tooltip="Empezando">
                      <Link href="/empezando"><Rocket /><span>Empezando</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/ordenes")} tooltip="Órdenes">
                    <Link href="/ordenes"><ClipboardList /><span>Órdenes</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {puedeVer("inventario") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/partes")} tooltip="Partes">
                      <Link href="/partes"><Boxes /><span>Partes</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isAdmin && puedeVer("usuarios") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/usuarios")} tooltip="Equipo">
                      <Link href="/usuarios"><Users /><span>Equipo</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Bottom utility items */}
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/notificaciones")} tooltip="Notificaciones">
                    <Link href="/notificaciones"><Bell /><span>Notificaciones</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton onClick={abrirInvite} tooltip="Invitar miembro">
                      <Users /><span>Invitar miembro</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )} */}
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/configuracion")} tooltip="Configuración">
                    <Link href="/configuracion"><Settings /><span>Configuración</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </>
  );
}
