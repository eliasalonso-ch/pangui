"use client";

/**
 * Panel de conexión Google Calendar (columna derecha de
 * /integraciones/google-calendar). Mismo formato que ConexionMeconectaPanel.
 *
 * Conectar lleva a /api/google/auth (OAuth). Al volver, el owner/admin elige
 * el calendario; desde ahí la edge function gcal-sync escribe un evento por
 * cada pendiente abierto del workspace.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EstadoBadge } from "@/components/integraciones/Logos";
import { Desplegable } from "@/components/Desplegable";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import {
  leerConexionGoogle, estadoGoogle, listarCalendariosGoogle, elegirCalendarioGoogle, desconectarGoogle,
  MENSAJE_VUELTA, type CalendarioGoogle,
} from "@/lib/google-calendar-conexion";

// Mismos botones que ConexionMeconectaPanel.
const btn = (primario: boolean): CSSProperties => ({
  height: 38, width: "100%", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500, cursor: "pointer",
  border: primario ? "none" : "1px solid var(--border-strong)",
  background: primario ? "var(--brand)" : "var(--surface-1)",
  color: primario ? "var(--fg-on-brand)" : "var(--fg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none",
  fontFamily: "inherit",
});

export default function ConexionGoogleCalendarPanel({ vuelta }: {
  /** Resultado de la vuelta de Google (?calendario=…). */
  vuelta?: string;
}) {
  const qc = useQueryClient();
  const { data: conexion, isPending } = useQuery({ queryKey: ["calendario-google"], queryFn: leerConexionGoogle });
  const [eligiendo, setEligiendo] = useState(false);
  const [calendarios, setCalendarios] = useState<CalendarioGoogle[] | null>(null);
  const [elegido, setElegido] = useState("");
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(vuelta ? MENSAJE_VUELTA[vuelta] ?? null : null);

  const revocado = conexion?.estado === "revocado";
  const mostrarSelector = !!conexion && !revocado && (!conexion.calendar_id || eligiendo);

  // Al abrir el selector, trae los calendarios de la cuenta donde se puede escribir.
  useEffect(() => {
    if (!mostrarSelector || calendarios) return;
    listarCalendariosGoogle().then(async r => {
      if ("revocado" in r) { await qc.invalidateQueries({ queryKey: ["calendario-google"] }); return; }
      setCalendarios(r.calendarios);
      const actual = r.calendarios.find(c => c.id === conexion?.calendar_id);
      setElegido((actual ?? r.calendarios.find(c => !c.principal) ?? r.calendarios[0])?.id ?? "");
    }).catch(e => setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudieron leer los calendarios" }));
  }, [mostrarSelector, calendarios, conexion?.calendar_id, qc]);

  async function correr(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setAviso(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["calendario-google"] });
      if (ok) setAviso({ ok: true, texto: ok });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }

  const usarCalendario = () => correr(async () => {
    const c = calendarios?.find(x => x.id === elegido);
    if (!c) throw new Error("Elige un calendario");
    await elegirCalendarioGoogle(c);
    setEligiendo(false);
  }, "Listo: los pendientes se escriben en ese calendario en el próximo minuto.");

  const { estado, label } = estadoGoogle(conexion ?? null);

  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Conexión</p>
        {!isPending && <EstadoBadge estado={estado} label={label} />}
      </div>

      {isPending ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 80, color: "var(--fg-3)" }}><Loader2 size={18} className="animate-spin" /></div>
      ) : conexion ? (
        <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 14 }}>
          <div><dt style={{ color: "var(--fg-3)" }}>Conectado como</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.google_email}</dd></div>
          {conexion.calendar_id && !eligiendo && (
            <div><dt style={{ color: "var(--fg-3)" }}>Calendario</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.calendar_nombre}</dd></div>
          )}
          {revocado && (
            <div><dt style={{ color: "var(--fg-3)" }}>Estado</dt><dd style={{ margin: 0, color: "var(--danger)" }}>Google dejó de aceptar la conexión: los pendientes no están llegando al calendario.</dd></div>
          )}
          {!revocado && conexion.ultimo_error && (
            <div><dt style={{ color: "var(--fg-3)" }}>Último error</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{conexion.ultimo_error}</dd></div>
          )}
        </dl>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>
          Conecta una cuenta de Google y elige el calendario donde quieres ver los pendientes de tus OTs.
        </p>
      )}

      {mostrarSelector && (
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <span style={{ color: "var(--fg-3)" }}>¿En qué calendario?</span>
          {!calendarios ? (
            <span style={{ color: "var(--fg-4)" }}>Trayendo tus calendarios…</span>
          ) : calendarios.length === 0 ? (
            <span style={{ color: "var(--fg-2)", lineHeight: 1.5 }}>Esta cuenta no tiene calendarios donde pueda escribir. Pide permiso para «Hacer cambios en eventos».</span>
          ) : (
            <>
              <Desplegable ariaLabel="Calendario" anchoCompleto alto={38} value={elegido} onChange={setElegido}
                opciones={calendarios.map(c => ({ value: c.id, label: c.principal ? `${c.nombre} (principal)` : c.nombre }))} />
              <button type="button" style={btn(true)} disabled={busy || !elegido} onClick={usarCalendario}>
                {busy && <Loader2 size={15} className="animate-spin" />} Usar este calendario
              </button>
              {conexion?.calendar_id && (
                <>
                  <button type="button" style={btn(false)} onClick={() => setEligiendo(false)}>Cancelar</button>
                  <span style={{ fontSize: 13, color: "var(--fg-4)", lineHeight: 1.5 }}>
                    Los eventos ya creados en «{conexion.calendar_nombre}» se quedan ahí; los pendientes se crean de nuevo en el calendario nuevo.
                  </span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? "var(--success)" : "var(--danger)" }}>{aviso.texto}</p>
      )}

      {!isPending && !mostrarSelector && (
        <div style={{ display: "grid", gap: 8 }}>
          {!conexion || revocado ? (
            <a href="/api/google/auth" style={btn(true)}>{revocado ? "Reconectar" : "Conectar con Google"}</a>
          ) : (
            <>
              <button type="button" style={btn(false)} onClick={() => setEligiendo(true)}>Cambiar calendario</button>
              <a href="/api/google/auth" style={btn(false)}>Conectar otra cuenta</a>
            </>
          )}
          {conexion && (
            <button type="button" onClick={() => setConfirmarBaja(true)} style={{ ...btn(false), border: "none", background: "transparent", color: "var(--danger)" }}>
              Desconectar
            </button>
          )}
        </div>
      )}

      <ConfirmDeleteModal
        pending={confirmarBaja ? {
          title: "¿Desconectar Google Calendar?",
          description: "Pangui deja de escribir en el calendario y Google revoca el acceso. Los eventos ya creados se quedan en el calendario.",
          confirmLabel: "Desconectar",
          onConfirm: async () => {
            await desconectarGoogle();
            setCalendarios(null);
            await qc.invalidateQueries({ queryKey: ["calendario-google"] });
          },
        } : null}
        onClose={() => setConfirmarBaja(false)}
      />
    </div>
  );
}
