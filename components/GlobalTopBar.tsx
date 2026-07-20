"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronRight, CircleUserRound, CreditCard, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase";

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

function pageTrail(pathname: string): string[] {
  if (pathname.startsWith("/suscripcion")) return ["Cuenta", "Facturación"];
  if (pathname.startsWith("/mi-cuenta")) return ["Cuenta", "Mi cuenta"];
  if (pathname.startsWith("/espacio-trabajo")) return ["Cuenta", "Espacio de trabajo"];
  if (pathname.startsWith("/preferencias-notificaciones")) return ["Cuenta", "Preferencias de notificaciones"];
  if (pathname.startsWith("/ordenes/crear")) return ["Órdenes", "Nueva orden"];
  if (pathname.startsWith("/ordenes")) return ["Órdenes"];
  if (pathname.startsWith("/activos")) return ["Activos"];
  if (pathname.startsWith("/partes")) return ["Materiales"];
  if (pathname.startsWith("/procedimientos")) return ["Procedimientos"];
  if (pathname.startsWith("/analitica-materiales")) return ["Analítica de materiales"];
  if (pathname.startsWith("/analitica")) return ["Analítica"];
  if (pathname.startsWith("/usuarios")) return ["Equipo"];
  if (pathname.startsWith("/ubicaciones")) return ["Ubicaciones"];
  if (pathname.startsWith("/notificaciones")) return ["Notificaciones"];
  if (pathname.startsWith("/requisitos")) return ["Requisitos de OTs"];
  if (pathname.startsWith("/reglas-alerta")) return ["Reglas de alerta"];
  if (pathname.startsWith("/papelera")) return ["Papelera"];
  return ["Inicio"];
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
  const trail = pageTrail(pathname);

  useEffect(() => {
    setTheme((localStorage.getItem("pangui_theme") as ThemePref | null) ?? "auto");
    const sb = createClient();
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await sb.from("usuarios").select("nombre, rol").eq("id", user.id).maybeSingle();
      setName(data?.nombre ?? "");
      setRole(data?.rol ?? "");
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
    <header style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 18px", background: "var(--surface-1)", borderBottom: "1px solid var(--border)", position: "relative", zIndex: 100 }}>
      <nav aria-label="Ubicación actual" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--fg-2)" }}>
        {trail.map((label, index) => (
          <span key={`${label}-${index}`} style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
            {index > 0 && <ChevronRight size={14} color="var(--fg-4)" />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, fontWeight: index === trail.length - 1 ? 600 : 400, color: index === trail.length - 1 ? "var(--fg-1)" : "var(--fg-3)" }}>{label}</span>
          </span>
        ))}
      </nav>
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
          <div style={{ position: "absolute", top: 42, right: 0, width: 250, padding: 6, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-lg)", color: "var(--fg-1)" }}>
            <button type="button" onClick={() => { setOpen(false); router.push("/mi-cuenta"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px", border: 0, borderRadius: 8, background: "transparent", color: "inherit", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <CircleUserRound size={17} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name || "Mi cuenta"}</span>
                {email && <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>}
              </span>
            </button>

            {role === "owner" && (
              <button type="button" onClick={() => { setOpen(false); router.push("/suscripcion"); }} style={{ width: "100%", minHeight: 38, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: 0, borderRadius: 8, background: "transparent", color: "var(--fg-1)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }}>
                <CreditCard size={16} color="var(--fg-3)" />
                Facturación
              </button>
            )}

            <div style={{ height: 1, margin: "4px 8px", background: "var(--divider)" }} />
            <div style={{ padding: "7px 10px 5px", fontSize: 11, fontWeight: 600, color: "var(--fg-4)" }}>Apariencia</div>
            {THEMES.map((option) => {
              const Icon = option.icon;
              return (
                <button key={option.value} type="button" onClick={() => { setTheme(option.value); applyTheme(option.value); }} style={{ width: "100%", minHeight: 36, display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: 0, borderRadius: 8, background: theme === option.value ? "var(--surface-hover)" : "transparent", color: "var(--fg-1)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }}>
                  <Icon size={16} color="var(--fg-3)" />
                  <span style={{ flex: 1 }}>{option.label}</span>
                  {theme === option.value && <Check size={15} color="var(--brand)" />}
                </button>
              );
            })}

            <div style={{ height: 1, margin: "4px 8px", background: "var(--divider)" }} />
            <button type="button" onClick={signOut} style={{ width: "100%", minHeight: 38, display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: 0, borderRadius: 8, background: "transparent", color: "var(--danger)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, textAlign: "left" }}>
              <LogOut size={16} />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
