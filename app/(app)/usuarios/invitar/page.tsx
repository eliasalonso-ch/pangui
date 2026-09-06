"use client";

/**
 * /usuarios/invitar — dedicated multi-user invite screen.
 *
 * Replaces the single-user invite that lived inside the Equipo side panel. The
 * value of its own route is that an admin can send several invitations in one
 * pass, deep-link to it, and reload without losing the list.
 *
 * Per-row results, not all-or-nothing: `invite-user` takes exactly ONE user per
 * call, so N rows are N sequential calls. Sequential rather than parallel on
 * purpose — the function enforces the plan's billing check and rate limits, and
 * firing them at once would race that check and trip the 429. Each row keeps
 * its own status so a partial send is legible: sent rows lock and the admin
 * retries only what actually failed, which matters because every seat is
 * billable per user.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Loader2, Plus, X, Check, AlertCircle, Send, UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import { ROL_LABEL, esAdmin } from "@/lib/roles";

interface CatalogRow { id: string; nombre: string }

/** Per-row send outcome. Only rows that are not `sent` are touched by a send. */
type RowStatus = "idle" | "sending" | "sent" | "error";

interface InviteRow {
  key: number;
  nombre: string;
  email: string;
  rol: string;
  cargo_id: string;
  oficio_id: string;
  status: RowStatus;
  error: string | null;
}

/**
 * Roles this screen can hand out. `owner` is deliberately absent: it is never
 * assignable from the UI, matching /usuarios/[id]. The list mirrors
 * `allowedRoles` in the invite-user function, which rejects anything else.
 */
const ROLES = [
  { value: "member",    label: ROL_LABEL.member },
  { value: "admin",     label: ROL_LABEL.admin },
  { value: "requester", label: ROL_LABEL.requester },
];

let nextKey = 1;
function blankRow(): InviteRow {
  return {
    key: nextKey++,
    nombre: "", email: "", rol: "member",
    cargo_id: "", oficio_id: "",
    status: "idle", error: null,
  };
}

/**
 * Turns an invite-user failure into something an admin can act on. Kept
 * identical to the Equipo list and to invitationError() in the mobile app so
 * all three explain the same failure the same way — 402 is a billing stop, not
 * something a retry fixes.
 */
function inviteError(status: number, body: { error?: string } | null): string {
  const raw = body?.error;
  if (status === 402) return raw || "Tu plan no permite agregar más usuarios. Revisa Suscripción.";
  if (status === 403) return "No tienes permisos para invitar personas a este espacio de trabajo.";
  if (status === 409) return "Este correo ya está registrado en un espacio de trabajo.";
  if (status === 429) return "Se enviaron demasiadas invitaciones. Espera unos minutos e inténtalo otra vez.";
  return raw || "No se pudo enviar la invitación.";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400,
  color: "var(--fg-4)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 6,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

export default function InvitarUsuariosPage() {
  const router = useRouter();

  const [rows, setRows] = useState<InviteRow[]>([blankRow()]);
  const [cargos, setCargos] = useState<CatalogRow[]>([]);
  const [oficios, setOficios] = useState<CatalogRow[]>([]);
  const [myRol, setMyRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: perfil } = await sb.from("usuarios")
        .select("workspace_id, rol").eq("id", user.id).maybeSingle();

      // Only owner/admin may invite. The edge function enforces this again
      // server-side; this check just avoids showing a form that would 403.
      if (!perfil || !esAdmin(perfil.rol)) { router.replace("/usuarios"); return; }
      setMyRol(perfil.rol);

      // Catalogs are the global rows plus this workspace's own — the same
      // scoping the edge function validates cargo_id/oficio_id against.
      const scope = `workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`;
      const [{ data: cs }, { data: os }] = await Promise.all([
        sb.from("cargos").select("id,nombre").or(scope).eq("activo", true).order("nombre"),
        sb.from("oficios").select("id,nombre").or(scope).eq("activo", true).order("nombre"),
      ]);
      setCargos(cs ?? []);
      setOficios(os ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  const pendingCount = useMemo(() => rows.filter(r => r.status !== "sent").length, [rows]);
  const sentCount    = useMemo(() => rows.filter(r => r.status === "sent").length, [rows]);
  const allSent      = rows.length > 0 && pendingCount === 0;

  function patchRow(key: number, patch: Partial<InviteRow>) {
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows(prev => [...prev, blankRow()]);
  }

  function removeRow(key: number) {
    // Never leave the form with zero rows: fall back to one blank instead.
    setRows(prev => (prev.length === 1 ? [blankRow()] : prev.filter(r => r.key !== key)));
  }

  /**
   * Sends every row that has not already succeeded, one at a time. A row that
   * fails does not stop the rest, so the admin sees exactly which addresses got
   * through and retries only the others.
   */
  async function sendAll() {
    setFormErr(null);

    const targets = rows.filter(r => r.status !== "sent");
    if (targets.length === 0) return;

    // Validate the whole batch first: a half-sent batch is the expensive
    // mistake here, since each accepted invite is a billable seat.
    for (const r of targets) {
      if (!r.nombre.trim()) { setFormErr("Cada invitación necesita un nombre."); return; }
      if (!EMAIL_RE.test(r.email.trim())) {
        setFormErr(`El correo de ${r.nombre.trim() || "un invitado"} no es válido.`);
        return;
      }
    }

    const emails = targets.map(r => r.email.trim().toLowerCase());
    const dup = emails.find((e, i) => emails.indexOf(e) !== i);
    if (dup) { setFormErr(`El correo ${dup} está repetido.`); return; }

    setSending(true);
    for (const r of targets) {
      patchRow(r.key, { status: "sending", error: null });

      const res = await callEdge("invite-user", {
        email: r.email.trim().toLowerCase(),
        nombre: r.nombre.trim(),
        rol: r.rol,
        // Dual-write id + legacy text, matching the mobile invite payload.
        cargo:     cargos.find(c => c.id === r.cargo_id)?.nombre ?? null,
        cargo_id:  r.cargo_id || null,
        oficio:    oficios.find(o => o.id === r.oficio_id)?.nombre ?? null,
        oficio_id: r.oficio_id || null,
      });
      const body = await res.json().catch(() => null);

      if (res.ok) {
        patchRow(r.key, { status: "sent", error: null });
      } else {
        patchRow(r.key, { status: "error", error: inviteError(res.status, body) });
        // 402 is a hard billing stop: every remaining row fails the same way,
        // so stop instead of burning through the rest of the list.
        if (res.status === 402) {
          setFormErr(inviteError(res.status, body));
          break;
        }
      }
    }
    setSending(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 64, color: "var(--fg-3)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 14 }}>Cargando…</span>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-canvas)", minHeight: "100%" }}>
      <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--fg-3)", marginBottom: 14 }}>
          <Link href="/usuarios" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", textDecoration: "none" }}>
            <ArrowLeft size={14} /> Equipo
          </Link>
          <ChevronRight size={13} style={{ color: "var(--fg-4)" }} />
          <span style={{ color: "var(--fg-1)", fontWeight: 400 }}>Invitar usuarios</span>
        </div>

        <h1 style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          Invitar usuarios
        </h1>
        <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 22px" }}>
          Cada persona recibe un correo para crear su propia contraseña. Aparece en el equipo
          de inmediato y puedes asignarle órdenes.
        </p>

        {/* Invite rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r, i) => {
            const locked = r.status === "sent" || r.status === "sending";
            return (
              <div
                key={r.key}
                style={{
                  border: "1px solid var(--border)", borderRadius: 10,
                  background: "var(--surface-1)", padding: 16,
                  opacity: r.status === "sent" ? 0.75 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                    <label style={labelStyle}>Nombre completo</label>
                    <input
                      style={inputStyle}
                      type="text"
                      placeholder="Ej. Juan Pérez"
                      value={r.nombre}
                      disabled={locked}
                      onChange={e => patchRow(r.key, { nombre: e.target.value })}
                    />
                  </div>

                  <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                    <label style={labelStyle}>Correo electrónico</label>
                    <input
                      style={inputStyle}
                      type="email"
                      placeholder="usuario@empresa.cl"
                      value={r.email}
                      disabled={locked}
                      onChange={e => patchRow(r.key, { email: e.target.value })}
                    />
                  </div>

                  <div style={{ flex: "0 1 190px", minWidth: 170 }}>
                    <label style={labelStyle}>Tipo de cuenta</label>
                    <select
                      style={inputStyle}
                      value={r.rol}
                      disabled={locked}
                      onChange={e => patchRow(r.key, { rol: e.target.value })}
                    >
                      {ROLES
                        .filter(role => role.value !== "admin" || esAdmin(myRol))
                        .map(role => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                    </select>
                  </div>

                  {/* Remove. Offset so it lines up with the inputs, not the labels. */}
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    disabled={sending}
                    aria-label={`Quitar invitación ${i + 1}`}
                    title="Quitar"
                    style={{
                      marginTop: 24, width: 36, height: 36, flexShrink: 0,
                      border: "1px solid var(--border)", borderRadius: 6,
                      background: "var(--surface-1)", color: "var(--fg-4)",
                      cursor: sending ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Cargo / oficio are optional, so they sit below the required row. */}
                <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                    <label style={labelStyle}>Cargo</label>
                    <select
                      style={inputStyle}
                      value={r.cargo_id}
                      disabled={locked}
                      onChange={e => patchRow(r.key, { cargo_id: e.target.value })}
                    >
                      <option value="">Sin especificar</option>
                      {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: "1 1 200px", minWidth: 180 }}>
                    <label style={labelStyle}>Oficio</label>
                    <select
                      style={inputStyle}
                      value={r.oficio_id}
                      disabled={locked}
                      onChange={e => patchRow(r.key, { oficio_id: e.target.value })}
                    >
                      <option value="">Sin especificar</option>
                      {oficios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </div>
                </div>

                {/* Per-row outcome */}
                {r.status === "sent" && (
                  <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--success)", margin: "10px 0 0" }}>
                    <Check size={14} /> Invitación enviada a {r.email.trim().toLowerCase()}
                  </p>
                )}
                {r.status === "sending" && (
                  <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-3)", margin: "10px 0 0" }}>
                    <Loader2 size={14} className="animate-spin" /> Enviando…
                  </p>
                )}
                {r.status === "error" && r.error && (
                  <p style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 14, color: "var(--danger)", margin: "10px 0 0" }}>
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {r.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Add another */}
        <button
          type="button"
          onClick={addRow}
          disabled={sending}
          style={{
            marginTop: 12, height: 36, padding: "0 14px",
            display: "inline-flex", alignItems: "center", gap: 7,
            border: "1px solid var(--border)", borderRadius: 8,
            background: "var(--surface-1)", color: "var(--brand)",
            fontSize: 14, fontWeight: 400, fontFamily: "inherit",
            cursor: sending ? "not-allowed" : "pointer",
          }}
        >
          <Plus size={15} /> Añadir otro
        </button>

        {formErr && (
          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--danger)", margin: "16px 0 0" }}>
            <AlertCircle size={14} /> {formErr}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          {!allSent && (
            <button
              type="button"
              onClick={sendAll}
              disabled={sending}
              style={{
                height: 38, padding: "0 18px",
                display: "inline-flex", alignItems: "center", gap: 8,
                border: "none", borderRadius: 8,
                background: "var(--brand)", color: "var(--fg-on-brand)",
                fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                cursor: sending ? "not-allowed" : "pointer",
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {sending
                ? "Enviando…"
                : pendingCount > 1 ? `Enviar ${pendingCount} invitaciones` : "Enviar invitación"}
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push("/usuarios")}
            style={{
              height: 38, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--fg-2)",
              fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            {allSent ? "Volver al equipo" : "Cancelar"}
          </button>

          {sentCount > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--success)" }}>
              <UserPlus size={14} />
              {sentCount === 1 ? "1 invitación enviada" : `${sentCount} invitaciones enviadas`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
