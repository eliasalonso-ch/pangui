"use client";

/**
 * /usuarios/[id] — member detail.
 *
 * Brings the web app to parity with the mobile member screen
 * (app/(stack)/usuario/[id].tsx), which had several capabilities web lacked:
 * editing the name, picking cargo/oficio from the catalogs, changing the role,
 * and the `solo_asignadas` visibility switch.
 *
 * Permission rules mirror lib/usuarios-baja.ts and the mobile screen:
 *   - Nobody manages themselves.
 *   - Only owner/admin manage anyone; an admin cannot touch another admin or
 *     the owner.
 *   - The owner role is never assignable from this screen.
 *
 * Cargo/oficio are dual-written (id + legacy text) exactly as mobile does, so a
 * member edited on either platform stays consistent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, Check, ChevronRight, Eye, Loader2, Shield, UserCog, Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ROL_LABEL } from "@/lib/roles";
import { puedeGestionarUsuario } from "@/lib/usuarios-baja";

type TabKey = "perfil" | "acceso";

interface Miembro {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  cargo: string | null;
  cargo_id: string | null;
  oficio: string | null;
  oficio_id: string | null;
  solo_asignadas: boolean | null;
  deleted_at: string | null;
  created_at?: string | null;
}

interface CatalogRow { id: string; nombre: string }

/** Assignable roles. `owner` and `requester` are deliberately excluded — same as mobile. */
const ROLES: { value: string; label: string; description: string; icon: React.ElementType }[] = [
  { value: "admin",  label: "Administrador", description: "Acceso completo al sistema.",                    icon: Shield },
  { value: "member", label: "Miembro",       description: "Acceso estándar para trabajar en las órdenes.",  icon: Wrench },
];

export default function MiembroDetallePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const memberId = params?.id;

  const [tab, setTab] = useState<TabKey>("perfil");
  const [miembro, setMiembro] = useState<Miembro | null>(null);
  const [myId, setMyId] = useState("");
  const [myRol, setMyRol] = useState("");
  const [cargos, setCargos] = useState<CatalogRow[]>([]);
  const [oficios, setOficios] = useState<CatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft state — saved explicitly, so a half-typed name is never written.
  const [nombre, setNombre] = useState("");
  const [cargoId, setCargoId] = useState<string | null>(null);
  const [oficioId, setOficioId] = useState<string | null>(null);
  const [rol, setRol] = useState("member");
  const [soloAsignadas, setSoloAsignadas] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      if (!active) return;
      setMyId(user.id);

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id, rol")
        .eq("id", user.id)
        .maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }
      if (!active) return;
      setMyRol(perfil.rol ?? "");

      const [{ data: m }, { data: cgs }, { data: ofs }] = await Promise.all([
        sb.from("usuarios")
          .select("id,nombre,rol,activo,cargo,cargo_id,oficio,oficio_id,solo_asignadas,deleted_at,created_at")
          .eq("id", memberId)
          .eq("workspace_id", perfil.workspace_id)   // scope: never leak across workspaces
          .maybeSingle(),
        sb.from("cargos")
          .select("id, nombre")
          .or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`)
          .eq("activo", true).order("nivel").order("nombre"),
        sb.from("oficios")
          .select("id, nombre")
          .or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`)
          .eq("activo", true).order("nombre"),
      ]);
      if (!active) return;

      if (m) {
        const row = m as Miembro;
        setMiembro(row);
        setNombre(row.nombre ?? "");
        setCargoId(row.cargo_id);
        setOficioId(row.oficio_id);
        setRol(row.rol ?? "member");
        setSoloAsignadas(row.solo_asignadas ?? false);
      }
      setCargos(cgs ?? []);
      setOficios(ofs ?? []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [memberId, router]);

  const isMe = Boolean(miembro && miembro.id === myId);
  const canManage = useMemo(
    () => Boolean(miembro) && puedeGestionarUsuario({ id: myId, rol: myRol }, { id: miembro!.id, rol: miembro!.rol }),
    [miembro, myId, myRol],
  );
  // The owner's role is never editable here, mirroring the mobile guard.
  const canChangeRole = canManage && !isMe && miembro?.rol !== "owner";

  const dirty = Boolean(miembro) && (
    nombre.trim() !== (miembro!.nombre ?? "") ||
    cargoId !== miembro!.cargo_id ||
    oficioId !== miembro!.oficio_id ||
    rol !== miembro!.rol ||
    soloAsignadas !== (miembro!.solo_asignadas ?? false)
  );

  const save = useCallback(async () => {
    if (!miembro || !canManage || !dirty) return;
    setSaving(true);
    setError(null);

    const cargo = cargos.find(c => c.id === cargoId)?.nombre ?? null;
    const oficio = oficios.find(o => o.id === oficioId)?.nombre ?? null;

    // Dual-write id + legacy text, matching the mobile screen so a member edited
    // on either platform keeps both representations in agreement.
    const updates: Record<string, unknown> = {
      nombre: nombre.trim(),
      cargo, cargo_id: cargoId,
      oficio, oficio_id: oficioId,
      solo_asignadas: soloAsignadas,
    };
    if (canChangeRole) updates.rol = rol;

    const { error: saveError } = await createClient()
      .from("usuarios").update(updates).eq("id", miembro.id);

    setSaving(false);
    if (saveError) { setError(saveError.message); return; }

    setMiembro({ ...miembro, ...(updates as Partial<Miembro>) } as Miembro);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [miembro, canManage, canChangeRole, dirty, nombre, cargoId, oficioId, rol, soloAsignadas, cargos, oficios]);

  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 64, color: "var(--fg-4)" }}>
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  if (!miembro) {
    return (
      <div style={{ padding: "32px 24px", maxWidth: 720, margin: "0 auto" }}>
        <p style={{ fontSize: 14, color: "var(--fg-3)" }}>No se encontró este miembro.</p>
        <Link href="/usuarios" style={{ fontSize: 13.5, color: "var(--brand)" }}>Volver a Equipo</Link>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-canvas)", minHeight: "100%" }}>
      <div style={{ padding: "28px 24px 64px", maxWidth: 900, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--fg-3)", marginBottom: 14 }}>
          <Link href="/usuarios" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", textDecoration: "none" }}>
            <ArrowLeft size={14} /> Equipo
          </Link>
          <ChevronRight size={13} style={{ color: "var(--fg-4)" }} />
          <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>{miembro.nombre || "Miembro"}</span>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--fg-1)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          {miembro.nombre || "Sin nombre"}
        </h1>
        <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: 0 }}>
          {(ROL_LABEL as Record<string, string>)[miembro.rol] ?? miembro.rol}
          {miembro.deleted_at ? " · Dado de baja" : miembro.activo ? "" : " · Inactivo"}
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, margin: "18px 0 22px" }}>
          {([["perfil", "Perfil"], ["acceso", "Acceso"]] as const).map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  padding: "7px 15px", borderRadius: 8,
                  border: `1px solid ${active ? "var(--border-strong)" : "transparent"}`,
                  background: active ? "var(--surface-1)" : "transparent",
                  color: active ? "var(--fg-1)" : "var(--fg-3)",
                  fontSize: 13.5, fontWeight: active ? 600 : 500,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {!canManage && (
          <div style={{ display: "flex", gap: 9, padding: "11px 14px", marginBottom: 16, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <UserCog size={15} style={{ flexShrink: 0, marginTop: 1, color: "var(--fg-4)" }} />
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: 0 }}>
              {isMe
                ? "Este es tu propio perfil. Edítalo desde Mi cuenta."
                : "No tienes permiso para editar a este miembro."}
            </p>
          </div>
        )}

        {error && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "11px 14px", borderRadius: 9, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} /> {error}
          </div>
        )}

        {tab === "perfil" && (
          // Same shape as /preferencias-notificaciones: one white section with a
          // header block on top and label/control rows below it.
          <section style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
                <UserCog size={17} />
              </span>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Perfil</h2>
                <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: "3px 0 0" }}>
                  El cargo y el oficio describen la función de esta persona dentro del equipo.
                </p>
              </div>
            </div>

            <Row label="Nombre" hint="Cómo aparece esta persona en las órdenes">
              <input
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                disabled={!canManage}
                placeholder="Nombre completo"
                style={fieldStyle(!canManage)}
              />
            </Row>

            <Row label="Cargo" hint="Su rol dentro del equipo">
              <select value={cargoId ?? ""} onChange={e => setCargoId(e.target.value || null)} disabled={!canManage} style={fieldStyle(!canManage)}>
                <option value="">Sin especificar</option>
                {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </Row>

            <Row label="Oficio" hint="La especialidad con la que trabaja" last>
              <select value={oficioId ?? ""} onChange={e => setOficioId(e.target.value || null)} disabled={!canManage} style={fieldStyle(!canManage)}>
                <option value="">Sin especificar</option>
                {oficios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </Row>
          </section>
        )}

        {tab === "acceso" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <section style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
                  <Shield size={17} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Rol</h2>
                  <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: "3px 0 0" }}>
                    {canChangeRole
                      ? "Define qué puede hacer dentro del espacio de trabajo."
                      : miembro.rol === "owner"
                        ? "El propietario no puede cambiar de rol desde aquí."
                        : "No puedes cambiar el rol de este miembro."}
                  </p>
                </div>
              </div>
              {ROLES.map(({ value, label, description, icon: Icon }) => {
                const active = rol === value;
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!canChangeRole}
                    onClick={() => setRol(value)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "13px 22px", borderTop: "1px solid var(--border)",
                      background: active ? "var(--brand-tint)" : "transparent",
                      cursor: canChangeRole ? "pointer" : "default",
                      textAlign: "left", fontFamily: "inherit", border: "none",
                      borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--border)",
                      opacity: canChangeRole ? 1 : 0.6,
                    }}
                  >
                    <span style={{ width: 30, height: 30, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
                      <Icon size={15} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>{label}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--fg-4)", marginTop: 1 }}>{description}</span>
                    </span>
                    {active && <Check size={16} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </section>

            {/* Visibility only applies to members: admins and owners always see everything. */}
            {rol === "member" && (
              <section style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
                    <Eye size={17} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Visibilidad</h2>
                    <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: "3px 0 0" }}>
                      {soloAsignadas
                        ? "Solo verá las órdenes que tenga asignadas."
                        : "Podrá consultar todas las órdenes del espacio de trabajo."}
                    </p>
                  </div>
                </div>
                <Row label="Solo sus OTs asignadas" hint="Restringe la bandeja a su propio trabajo" last>
                  <Switch checked={soloAsignadas} disabled={!canManage} onChange={setSoloAsignadas} label="Solo sus OTs asignadas" />
                </Row>
              </section>
            )}
          </div>
        )}

        {canManage && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 22 }}>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                height: 38, padding: "0 18px", borderRadius: 8, border: "none",
                background: saved ? "var(--brand)" : dirty ? "var(--brand)" : "var(--surface-hover)",
                color: dirty || saved ? "var(--fg-on-brand)" : "var(--fg-4)",
                fontSize: 14, fontWeight: 500,
                cursor: dirty && !saving ? "pointer" : "default",
                fontFamily: "inherit",
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
              {saving ? "Guardando…" : saved ? "Guardado" : "Guardar cambios"}
            </button>
            {dirty && !saving && (
              <span style={{ fontSize: 12.5, color: "var(--fg-4)" }}>Tienes cambios sin guardar.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function fieldStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 240, height: 36, padding: "0 10px",
    border: "1px solid var(--border)", borderRadius: "var(--r-md)",
    background: disabled ? "var(--surface-hover)" : "var(--surface-1)",
    color: disabled ? "var(--fg-4)" : "var(--fg-1)",
    fontSize: 13.5, fontFamily: "inherit", outline: "none",
  };
}

/**
 * A row inside a section card: label/hint left, control right. Rows are divided
 * by a border rather than being separate cards — same as the notification
 * preferences page.
 */
function Row({ label, hint, children, last = false }: {
  label: string; hint?: string; children: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      padding: "16px 22px",
      borderBottom: last ? "none" : "1px solid var(--border)",
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>{label}</p>
        {hint && <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: "3px 0 0" }}>{hint}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, disabled, label }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string;
}) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 23, padding: 2, flexShrink: 0,
        border: `1px solid ${checked ? "var(--brand)" : "var(--border-strong)"}`,
        borderRadius: 999,
        background: checked ? "var(--brand)" : "var(--surface-hover)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "flex", alignItems: "center",
        transition: "background .15s, border-color .15s",
      }}
    >
      <span style={{
        display: "grid", placeItems: "center", width: 17, height: 17, borderRadius: "50%",
        background: checked ? "#fff" : "var(--fg-4)",
        color: checked ? "var(--brand)" : "transparent",
        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        transform: checked ? "translateX(17px)" : "translateX(0)",
        transition: "transform .15s, background .15s",
      }}>
        {checked && <Check size={11} strokeWidth={3.5} />}
      </span>
    </button>
  );
}
