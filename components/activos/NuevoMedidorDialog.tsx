"use client";

/**
 * Alta de un medidor sobre un activo.
 *
 * Los dos tipos comparten TODO menos dos campos: el automatizado recibe un
 * token para que su gateway publique, y el manual una frecuencia de ronda. Los
 * umbrales son los mismos para ambos —la máquina no se rompe distinto según
 * quién anotó el número—, así que el formulario no los separa.
 *
 * Al crear un automatizado se muestra el token una vez en pantalla, con el
 * `curl` armado: es el momento en que la persona tiene el gateway delante, y
 * mandarla a buscarlo después a otra pantalla es donde se abandona la
 * configuración.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Copy, Loader2, User, Wifi, X } from "lucide-react";
import SearchSelect from "@/components/activos/SearchSelect";
import { createMedidor, type Medidor, type TipoMedidor } from "@/lib/medidores-api";

/**
 * Unidades sugeridas, agrupadas por magnitud.
 *
 * Es un catálogo de sugerencias, no una lista cerrada: `SearchSelect` deja
 * escribir la que no esté (`onCreate`), porque cada planta tiene las suyas y
 * una lista fija obligaría a tocar el código por cada unidad nueva. Por eso la
 * columna `unidad` es texto libre en la base.
 */
const UNIDADES: { grupo: string; unidades: string[] }[] = [
  { grupo: "Vibración", unidades: ["mm/s", "µm", "g"] },
  { grupo: "Eléctrico", unidades: ["A", "V", "kW", "kWh", "Hz", "cos φ"] },
  { grupo: "Temperatura", unidades: ["°C", "°F", "K"] },
  { grupo: "Presión", unidades: ["bar", "psi", "kPa", "mca"] },
  { grupo: "Caudal", unidades: ["L/min", "m³/h", "L/s"] },
  { grupo: "Rotación", unidades: ["rpm", "rad/s"] },
  { grupo: "Uso", unidades: ["horas", "ciclos", "km", "unidades"] },
  { grupo: "Nivel", unidades: ["%", "m", "cm", "L", "m³"] },
];

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

/** Multiplicadores a días, que es como se guarda la frecuencia. */
const UNIDAD_FRECUENCIA: Record<string, number> = { dias: 1, semanas: 7, meses: 30 };

export interface NuevoMedidorDialogProps {
  workspaceId: string;
  activoId: string;
  ubicacionId?: string | null;
  onClose: () => void;
  onCreado: (medidor: Medidor) => void;
}

export default function NuevoMedidorDialog({
  workspaceId, activoId, ubicacionId, onClose, onCreado,
}: NuevoMedidorDialogProps) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoMedidor>("automatizado");
  const [descripcion, setDescripcion] = useState("");
  const [unidad, setUnidad] = useState("");
  /** Unidades escritas a mano en esta sesión, para que queden elegibles. */
  const [unidadesExtra, setUnidadesExtra] = useState<string[]>([]);
  const [advertencia, setAdvertencia] = useState("");
  const [alarma, setAlarma] = useState("");
  const [frecuencia, setFrecuencia] = useState("");
  const [unidadFrecuencia, setUnidadFrecuencia] = useState("dias");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Cuando queda seteado, el diálogo pasa a mostrar el token recién generado. */
  const [creado, setCreado] = useState<Medidor | null>(null);
  const [copiado, setCopiado] = useState(false);

  // Esc cierra, como el resto de los diálogos.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  const opcionesUnidad = useMemo(() => [
    ...UNIDADES.flatMap(g => g.unidades.map(u => ({ id: u, label: u, sub: g.grupo }))),
    ...unidadesExtra.map(u => ({ id: u, label: u, sub: "Personalizada" })),
  ], [unidadesExtra]);

  async function guardar() {
    setErr(null);

    if (!nombre.trim()) { setErr("Indica el nombre del medidor."); return; }
    if (!unidad.trim()) { setErr("Indica la unidad de medida."); return; }

    // Se valida acá y no solo en la base para poder decir cuál de los dos está
    // mal: la constraint devuelve el nombre de la restricción, no una frase.
    const adv = advertencia.trim() === "" ? null : Number(advertencia);
    const alm = alarma.trim() === "" ? null : Number(alarma);
    if (adv != null && !Number.isFinite(adv)) { setErr("El umbral de advertencia no es un número."); return; }
    if (alm != null && !Number.isFinite(alm)) { setErr("El umbral de alarma no es un número."); return; }
    if (adv != null && alm != null && alm <= adv) {
      setErr("La alarma tiene que ser mayor que la advertencia.");
      return;
    }

    let dias: number | null = null;
    if (tipo === "manual" && frecuencia.trim() !== "") {
      const n = Number(frecuencia);
      if (!Number.isFinite(n) || n <= 0) { setErr("La frecuencia tiene que ser un número mayor que cero."); return; }
      dias = Math.round(n * UNIDAD_FRECUENCIA[unidadFrecuencia]);
    }

    setBusy(true);
    try {
      const medidor = await createMedidor({
        workspaceId,
        nombre,
        tipo,
        unidad,
        descripcion,
        activoId,
        ubicacionId: ubicacionId ?? null,
        advertencia: adv,
        critico: alm,
        frecuenciaDias: dias,
      });
      onCreado(medidor);

      // El manual no tiene nada más que mostrar; el automatizado sí: su token.
      if (medidor.tipo === "automatizado") setCreado(medidor);
      else onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo crear el medidor.");
    } finally {
      setBusy(false);
    }
  }

  const curl = creado
    ? `curl -X POST ${typeof window !== "undefined" ? window.location.origin : ""}/api/medidores/lecturas \\
  -H 'Authorization: Bearer ${creado.token}' \\
  -H 'Content-Type: application/json' \\
  -d '{"valor": 7.8}'`
    : "";

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles el token igual está a la vista para
      // seleccionarlo a mano; no vale la pena un error por esto.
    }
  }

  // Portal sobre document.body, NO opcional: este diálogo se monta dentro de la
  // ficha del activo, que cuelga de una barra `position:relative; zIndex:100`.
  // Eso es un contexto de apilamiento, así que acá dentro el zIndex 500 solo
  // compite contra sus hermanos y la barra le queda encima — el mismo problema
  // que ya tenía el visor de fotos (ver el comentario en ActivosBandeja).
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
        width: "100%", maxWidth: 520, maxHeight: "calc(100vh - 48px)",
        background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "var(--shadow-lg)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
            {creado ? "Medidor creado" : "Nuevo medidor"}
          </h2>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* ── Paso 2: el token, una vez creado ─────────────────────────── */}
        {creado ? (
          <>
            <div style={{ padding: 20, display: "grid", gap: 16, overflowY: "auto" }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-2)", lineHeight: 1.5 }}>
                <strong style={{ fontWeight: 500 }}>{creado.nombre}</strong> ya está listo para recibir
                lecturas. Configura el equipo con este token:
              </p>

              <div>
                <label style={labelStyle}>Token del medidor</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input readOnly value={creado.token ?? ""} style={{ ...inputStyle, fontFamily: "ui-monospace, monospace" }} />
                  <button type="button" onClick={() => copiar(creado.token ?? "")}
                    style={{ height: 38, padding: "0 12px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                    {copiado ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Ejemplo de envío</label>
                <pre style={{
                  margin: 0, padding: 12, background: "var(--surface-2)",
                  border: "1px solid var(--border)", borderRadius: 8,
                  fontSize: 13, lineHeight: 1.6, color: "var(--fg-2)",
                  overflowX: "auto", whiteSpace: "pre", fontFamily: "ui-monospace, monospace",
                }}>{curl}</pre>
              </div>

              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                El token queda disponible en la ficha del medidor, así que puedes volver a
                copiarlo cuando configures el equipo.
              </p>
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={onClose}
                style={{ height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8, border: "1px solid var(--brand)", background: "var(--brand)", color: "var(--fg-on-brand)", cursor: "pointer" }}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── Paso 1: el formulario ──────────────────────────────────── */}
            <div style={{ padding: 20, display: "grid", gap: 16, overflowY: "auto" }}>
              <div>
                <label style={labelStyle}>Nombre</label>
                <input type="text" value={nombre} disabled={busy} style={inputStyle} autoFocus
                  placeholder="Ej. Vibración descanso lado acople"
                  onChange={e => setNombre(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Tipo de medidor</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {([
                    { v: "manual" as const, icon: <User size={14} />, label: "Manual", sub: "Lo carga una persona" },
                    { v: "automatizado" as const, icon: <Wifi size={14} />, label: "Automatizado", sub: "Lo publica un equipo" },
                  ]).map(op => (
                    <button key={op.v} type="button" disabled={busy}
                      onClick={() => setTipo(op.v)}
                      style={{
                        flex: 1, padding: "10px 12px", textAlign: "left", cursor: busy ? "default" : "pointer",
                        borderRadius: 8, fontFamily: "inherit",
                        border: `1px solid ${tipo === op.v ? "var(--brand)" : "var(--border)"}`,
                        background: tipo === op.v ? "var(--brand)11" : "var(--surface-1)",
                        color: tipo === op.v ? "var(--brand)" : "var(--fg-2)",
                      }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                        {op.icon}{op.label}
                      </span>
                      <span style={{ display: "block", marginTop: 2, fontSize: 14, color: "var(--fg-4)" }}>
                        {op.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>Descripción (opcional)</label>
                <input type="text" value={descripcion} disabled={busy} style={inputStyle}
                  placeholder="Dónde está montado, qué mide"
                  onChange={e => setDescripcion(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Unidad de medida</label>
                <SearchSelect
                  placeholder="Busca o escribe la unidad…"
                  emptyLabel="Sin unidad"
                  value={unidad}
                  options={opcionesUnidad}
                  onChange={setUnidad}
                  disabled={busy}
                  createLabel="Usar"
                  onCreate={async (texto) => {
                    const u = texto.trim();
                    setUnidadesExtra(prev => prev.includes(u) ? prev : [...prev, u]);
                    return u;
                  }}
                />
              </div>

              {/* La ronda solo aplica al manual: un gateway publica al ritmo que
                  decide su firmware, no al que se ponga acá. */}
              {tipo === "manual" && (
                <div>
                  <label style={labelStyle}>Frecuencia de lectura (opcional)</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input type="number" min="1" value={frecuencia} disabled={busy}
                      style={{ ...inputStyle, width: 110 }} placeholder="Cada"
                      onChange={e => setFrecuencia(e.target.value)} />
                    <select value={unidadFrecuencia} disabled={busy} style={{ ...inputStyle, flex: 1 }}
                      onChange={e => setUnidadFrecuencia(e.target.value)}>
                      <option value="dias">Días</option>
                      <option value="semanas">Semanas</option>
                      <option value="meses">Meses</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <label style={{ ...labelStyle, marginBottom: 2 }}>Ajustes de umbral</label>
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                  Al superar la alarma, Pangui abre una OT de emergencia sobre este activo.
                  Déjalos vacíos si el medidor solo registra.
                </p>

                <div style={{ display: "grid", gap: 10 }}>
                  {([
                    { label: "Advertencia", value: advertencia, set: setAdvertencia, color: "#F59E0B" },
                    { label: "Alarma", value: alarma, set: setAlarma, color: "#EF4444" },
                  ]).map(u => (
                    <div key={u.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, width: 120, flexShrink: 0, fontSize: 14, color: "var(--fg-2)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: u.color }} />
                        {u.label}
                      </span>
                      <div style={{ position: "relative", flex: 1 }}>
                        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>≥</span>
                        <input type="number" value={u.value} disabled={busy}
                          style={{ ...inputStyle, paddingLeft: 28, paddingRight: unidad ? 52 : 12 }}
                          placeholder="Establecer valor…"
                          onChange={e => u.set(e.target.value)} />
                        {unidad && (
                          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                            {unidad}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

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
              <button type="button" onClick={guardar} disabled={busy}
                style={{
                  height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8,
                  border: `1px solid ${busy ? "var(--border)" : "var(--brand)"}`,
                  background: busy ? "var(--surface-2)" : "var(--brand)",
                  color: busy ? "var(--fg-4)" : "var(--fg-on-brand)",
                  cursor: busy ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                {busy && <Loader2 size={13} className="animate-spin" />}
                {busy ? "Creando…" : "Crear"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
