"use client";

/**
 * Carga de una lectura a mano.
 *
 * Es lo que le faltaba al medidor manual para servir de algo: `registrarLectura`
 * existía en la API desde el primer día y no la llamaba nadie, así que un medidor
 * `manual` se podía crear y después no se podía usar.
 *
 * Editar no es un UPDATE: una lectura es un hecho medido, no un campo, y la
 * tabla no tiene esa policy. Corregir entra por acá con `reemplaza`, y el orden
 * importa — primero se guarda la nueva y RECIÉN AHÍ se borra la vieja, para que
 * cerrar el diálogo a medio camino no cueste la lectura. Además el trigger que
 * abre la OT mira el INSERT, así que el valor corregido se evalúa de verdad.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Camera, Loader2, X } from "lucide-react";
import {
  cumpleIntervalo, deleteLectura, faltaParaIntervalo, nivelDeLectura, registrarLectura,
  type MedidorConUltima, type NivelLectura,
} from "@/lib/medidores-api";
import { uploadToR2 } from "@/lib/r2";

const NIVEL_COLOR: Record<NivelLectura, string> = {
  normal: "#10B981",
  advertencia: "#F59E0B",
  critico: "#EF4444",
};

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

/**
 * `datetime-local` quiere la hora LOCAL sin zona, y `toISOString()` devuelve UTC.
 * Usarlo directo corre la hora por el offset de Santiago — el mismo bug de fechas
 * que ya apareció en otras pantallas.
 */
function paraInputLocal(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export interface RegistrarLecturaDialogProps {
  medidor: MedidorConUltima;
  workspaceId: string;
  onClose: () => void;
  onRegistrada: (valor: number) => void;
  /** Valor con el que abre el campo, al corregir una lectura existente. */
  valorInicial?: string;
  /**
   * Id de la lectura que esta reemplaza, al corregir.
   *
   * Se borra DESPUES de que la nueva quedo guardada, nunca antes: borrar
   * primero dejaba al usuario sin la lectura si cerraba el dialogo sin
   * guardar. Si el borrado falla quedan las dos, que es el lado correcto en el
   * que equivocarse.
   */
  reemplaza?: string;
}

export default function RegistrarLecturaDialog({
  medidor, workspaceId, onClose, onRegistrada, valorInicial, reemplaza,
}: RegistrarLecturaDialogProps) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [cuando, setCuando] = useState(() => paraInputLocal(new Date()));
  const [foto, setFoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  // El object URL se revoca al cambiar de foto o al cerrar: sin esto cada
  // selección deja un blob colgado en memoria.
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.preview); }, [foto]);

  const n = valor.trim() === "" ? null : Number(valor);
  const valido = n != null && Number.isFinite(n);

  /**
   * Aviso en vivo de en qué franja va a caer el número, antes de guardar.
   *
   * Es lo que evita la sorpresa: quien anota 9.2 en la ronda ve ahí mismo que eso
   * abre una OT de emergencia, en vez de enterarse después por una notificación.
   */
  const aviso = useMemo(() => {
    if (!valido) return null;
    const nivel = nivelDeLectura(n, medidor);
    if (nivel === "critico") {
      return { color: NIVEL_COLOR.critico, texto: "Supera la alarma: se abrirá una OT de emergencia sobre este activo." };
    }
    if (nivel === "advertencia") {
      return { color: NIVEL_COLOR.advertencia, texto: "Supera la advertencia. No abre OT, pero queda marcado en el gráfico." };
    }
    // El intervalo de uso solo aplica si el valor avanzó lo suficiente desde el
    // último disparo. `cumpleIntervalo` es el espejo exacto del trigger.
    if (medidor.intervalo_ot != null) {
      if (cumpleIntervalo(n, medidor)) {
        return { color: NIVEL_COLOR.advertencia, texto: `Se cumple el intervalo de ${medidor.intervalo_ot} ${medidor.unidad}: se abrirá una OT preventiva.` };
      }
      return {
        color: "var(--fg-4)",
        texto: `Faltan ${faltaParaIntervalo(n, medidor)} ${medidor.unidad} para el próximo mantenimiento.`,
      };
    }
    return null;
  }, [valido, n, medidor]);

  // Retroceso de un contador acumulado: no es un error (se pudo reemplazar el
  // instrumento) pero casi siempre es un tipeo, así que se avisa sin bloquear.
  const retrocede = valido && medidor.intervalo_ot != null && medidor.ultima != null
    && n < medidor.ultima.valor;

  async function guardar() {
    setErr(null);
    if (!valido) { setErr("Indica el valor de la lectura."); return; }

    const ts = new Date(cuando);
    if (!Number.isFinite(ts.getTime())) { setErr("La fecha de la lectura no es válida."); return; }
    if (ts.getTime() > Date.now() + 60_000) { setErr("La lectura no puede quedar en el futuro."); return; }

    setBusy(true);
    try {
      // Mismo camino que el resto de las fotos de la app: `uploadToR2` normaliza
      // la imagen y sube por presign, para que las llaves no salgan del servidor.
      const fotoUrl = foto ? await uploadToR2(foto.file, "medidores") : null;

      await registrarLectura({
        medidorId: medidor.id,
        workspaceId,
        valor: n,
        ts,
        fotoUrl,
      });

      // Recien ahora se borra la que se esta corrigiendo. Si falla el borrado
      // quedan las dos: se ven en el historial y se elimina la sobrante a mano,
      // que es preferible a perder la lectura buena.
      if (reemplaza) {
        try {
          await deleteLectura(reemplaza);
        } catch {
          // El diálogo se queda abierto con el aviso: cerrarlo dejaría el
          // mensaje sin leer y al usuario sin saber que hay una lectura de más.
          setErr("Se guardó la lectura nueva, pero la anterior no se pudo eliminar y quedó en el historial. Bórrala desde ahí.");
          onRegistrada(n);
          return;
        }
      }

      onRegistrada(n);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar la lectura.");
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 460, maxHeight: "calc(100vh - 48px)",
        background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "var(--shadow-lg)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
            Registrar lectura · {medidor.nombre}
          </h2>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 16, overflowY: "auto" }}>
          {medidor.ultima && (
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>
              Última lectura: <span style={{ color: "var(--fg-2)", fontVariantNumeric: "tabular-nums" }}>
                {medidor.ultima.valor} {medidor.unidad}
              </span> el {new Date(medidor.ultima.ts).toLocaleString("es-CL", {
                day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}

          <div>
            <label style={labelStyle}>Valor</label>
            <div style={{ position: "relative" }}>
              <input
                type="number" inputMode="decimal" step="any" value={valor} disabled={busy} autoFocus
                style={{ ...inputStyle, paddingRight: 56, fontSize: 18, fontVariantNumeric: "tabular-nums" }}
                placeholder="0"
                onChange={e => setValor(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !busy) void guardar(); }}
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                {medidor.unidad}
              </span>
            </div>
          </div>

          {/* Fechar hacia atrás: nadie está frente al sistema en el momento
              exacto de la medición en terreno. */}
          <div>
            <label style={labelStyle}>Fecha y hora de la medición</label>
            <input type="datetime-local" value={cuando} disabled={busy} style={inputStyle}
              max={paraInputLocal(new Date())}
              onChange={e => setCuando(e.target.value)} />
          </div>

          <div>
            <label style={labelStyle}>Foto del instrumento (opcional)</label>
            <input
              ref={fileRef} type="file" accept="image/*" capture="environment" hidden
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) setFoto({ file: f, preview: URL.createObjectURL(f) });
              }}
            />
            {foto ? (
              <div style={{ position: "relative", width: "fit-content" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.preview} alt="Lectura" style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)", display: "block" }} />
                <button type="button" onClick={() => setFoto(null)} disabled={busy}
                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 999, border: "none", background: "rgba(15,23,42,0.7)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
                style={{ height: 38, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8, border: "1px dashed var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 14, fontFamily: "inherit", color: "var(--fg-3)", cursor: "pointer" }}>
                <Camera size={14} /> Adjuntar foto
              </button>
            )}
          </div>

          {retrocede && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0, fontSize: 14, color: "#F59E0B", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
              El valor es menor que la lectura anterior. Revisa el número si este contador solo debería subir.
            </p>
          )}

          {aviso && (
            <p style={{ margin: 0, fontSize: 14, color: aviso.color, lineHeight: 1.5 }}>
              {aviso.texto}
            </p>
          )}

          {err && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0, fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {err}
            </p>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", cursor: busy ? "default" : "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={busy || !valido}
            style={{
              height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8,
              border: `1px solid ${busy || !valido ? "var(--border)" : "var(--brand)"}`,
              background: busy || !valido ? "var(--surface-2)" : "var(--brand)",
              color: busy || !valido ? "var(--fg-4)" : "var(--fg-on-brand)",
              cursor: busy || !valido ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
