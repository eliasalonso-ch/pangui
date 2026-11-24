"use client";

/**
 * Link .ics personal de solo lectura (calendario_feeds + edge function
 * pendientes-ics): la alternativa sin conectar una cuenta, para Apple Calendar,
 * Outlook o quien no use Google. Va como sección en /integraciones/google-calendar.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { leerTokenFeed, crearTokenFeed, regenerarTokenFeed, urlFeed } from "@/lib/google-calendar-conexion";

const btn: React.CSSProperties = {
  height: 38, padding: "0 14px", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
  background: "var(--surface-1)", color: "var(--fg-1)", font: "inherit", fontSize: 14, fontWeight: 500,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
};

export default function LinkCalendarioIcs() {
  const qc = useQueryClient();
  const { data: token, isPending } = useQuery({ queryKey: ["calendario-feed"], queryFn: leerTokenFeed });
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [confirmarNuevo, setConfirmarNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function correr(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["calendario-feed"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
      setConfirmarNuevo(false);
    }
  }

  async function copiar(url: string) {
    await navigator.clipboard.writeText(url);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const url = token ? urlFeed(token) : null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p style={{ margin: 0 }}>
        Si no quieres conectar una cuenta, o usas Apple Calendar u Outlook, puedes suscribirte con un link a tus
        pendientes. Es de solo lectura y el calendario lo actualiza cada cierto tiempo (Google, cada varias horas).
        <b> Quien tenga tu link ve tus pendientes.</b>
      </p>

      {isPending ? null : !url ? (
        <button type="button" disabled={busy} onClick={() => correr(crearTokenFeed)} style={{ ...btn, justifySelf: "start" }}>
          {busy ? "Creando…" : "Crear link del calendario"}
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={url} aria-label="Link del calendario" onFocus={e => e.currentTarget.select()}
              style={{ flex: 1, minWidth: 0, height: 38, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-2)", fontFamily: "var(--font-mono)", fontSize: 12 }} />
            <button type="button" style={btn} onClick={() => copiar(url)}>
              {copiado ? <><Check size={15} /> Copiado</> : <><Copy size={15} /> Copiar</>}
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6, listStyle: "disc" }}>
            <li><span style={{ color: "var(--fg-1)", fontWeight: 500 }}>Google Calendar.</span> En «Otros calendarios», <b>+</b> → «Desde URL» y pega el link.</li>
            <li><span style={{ color: "var(--fg-1)", fontWeight: 500 }}>Apple Calendar.</span> <a href={url.replace(/^https:/, "webcal:")} style={{ color: "var(--brand)" }}>Abrir en Calendario</a>.</li>
            <li><span style={{ color: "var(--fg-1)", fontWeight: 500 }}>Outlook.</span> «Agregar calendario» → «Suscribirse desde la web» y pega el link.</li>
          </ul>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {confirmarNuevo ? (
              <>
                <span>Tu link actual deja de funcionar.</span>
                <button type="button" disabled={busy} onClick={() => correr(() => regenerarTokenFeed(token!))}
                  style={{ ...btn, color: "var(--danger)", borderColor: "var(--danger)" }}>
                  {busy ? "Generando…" : "Sí, generar link nuevo"}
                </button>
                <button type="button" style={btn} onClick={() => setConfirmarNuevo(false)}>Cancelar</button>
              </>
            ) : (
              <button type="button" style={btn} onClick={() => setConfirmarNuevo(true)}>Generar link nuevo</button>
            )}
          </div>
        </>
      )}
      {error && <p role="alert" style={{ margin: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>}
    </div>
  );
}
