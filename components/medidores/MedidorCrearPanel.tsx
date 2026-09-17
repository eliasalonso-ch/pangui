"use client";

/**
 * Alta de un medidor, como panel.
 *
 * Antes era un diálogo modal sobre `document.body`. El formulario tiene nombre,
 * activo, tipo, unidad, ronda, dos umbrales y el mantenimiento por uso: eso no
 * cabe cómodo en una ventana flotante, y al crear un automatizado hay un segundo
 * paso (el token y el `curl`) que obligaba a hacer scroll dentro del modal.
 *
 * Misma estructura que OTCrearPanel: header de 64px, cuerpo con scroll, footer
 * pegado abajo con Cancelar / Crear. Ocupa el panel derecho del master-detail,
 * donde si no iría el detalle.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Copy, Loader2, User, Wifi } from "lucide-react";
import SearchSelect from "@/components/activos/SearchSelect";
import { createClient } from "@/lib/supabase";
import {
  createMedidor, updateMedidor,
  type Medidor, type MedidorConUltima, type TipoMedidor,
} from "@/lib/medidores-api";

/**
 * Unidades sugeridas, agrupadas por magnitud.
 *
 * Catálogo de sugerencias, no lista cerrada: `SearchSelect` deja escribir la que
 * no esté, porque cada planta tiene las suyas y una lista fija obligaría a tocar
 * el código por cada unidad nueva. Por eso `unidad` es texto libre en la base.
 *
 * SE GUARDA EL NOMBRE, NO EL SÍMBOLO:
 * La unidad se muestra tal cual al lado del número en toda la app ("9 Amperios",
 * "Alarma sobre 80 Celsius"), y el que lee esa ficha no es siempre el que
 * configuró el medidor. "9 A" obliga a adivinar; "9 Amperios" no. El símbolo
 * queda solo para buscar. Espejo de `features/medidores/reglas.ts` en la móvil.
 */
const UNIDADES: { grupo: string; unidades: { nombre: string; simbolo: string }[] }[] = [
  { grupo: "Vibración", unidades: [
    { nombre: "Milímetros por segundo", simbolo: "mm/s" },
    { nombre: "Micrómetros", simbolo: "µm" },
    { nombre: "G", simbolo: "g" },
  ] },
  { grupo: "Eléctrico", unidades: [
    { nombre: "Amperios", simbolo: "A" },
    { nombre: "Voltios", simbolo: "V" },
    { nombre: "Kilovatios", simbolo: "kW" },
    { nombre: "Kilovatios hora", simbolo: "kWh" },
    { nombre: "Hercios", simbolo: "Hz" },
    { nombre: "Factor de potencia", simbolo: "cos φ" },
  ] },
  { grupo: "Temperatura", unidades: [
    { nombre: "Celsius", simbolo: "°C" },
    { nombre: "Fahrenheit", simbolo: "°F" },
    { nombre: "Kelvin", simbolo: "K" },
  ] },
  { grupo: "Presión", unidades: [
    { nombre: "Bar", simbolo: "bar" },
    { nombre: "PSI", simbolo: "psi" },
    { nombre: "Kilopascales", simbolo: "kPa" },
    { nombre: "Metros de columna de agua", simbolo: "mca" },
  ] },
  { grupo: "Caudal", unidades: [
    { nombre: "Litros por minuto", simbolo: "L/min" },
    { nombre: "Metros cúbicos por hora", simbolo: "m³/h" },
    { nombre: "Litros por segundo", simbolo: "L/s" },
  ] },
  { grupo: "Rotación", unidades: [
    { nombre: "Revoluciones por minuto", simbolo: "rpm" },
    { nombre: "Radianes por segundo", simbolo: "rad/s" },
  ] },
  { grupo: "Uso", unidades: [
    { nombre: "Horas", simbolo: "h" },
    { nombre: "Ciclos", simbolo: "ciclos" },
    { nombre: "Kilómetros", simbolo: "km" },
    { nombre: "Unidades", simbolo: "un" },
  ] },
  { grupo: "Nivel", unidades: [
    { nombre: "Porcentaje", simbolo: "%" },
    { nombre: "Metros", simbolo: "m" },
    { nombre: "Centímetros", simbolo: "cm" },
    { nombre: "Litros", simbolo: "L" },
    { nombre: "Metros cúbicos", simbolo: "m³" },
  ] },
];

/** Multiplicadores a días, que es como se guarda la frecuencia. */
const UNIDAD_FRECUENCIA: Record<string, number> = { dias: 1, semanas: 7, meses: 30 };

/** Fila cruda de `activos` para el selector. */
interface ActivoOpcion {
  id: string;
  nombre: string | null;
  numero_serie: string | null;
  ubicacion_id: string | null;
}

/** Fila cruda de `ubicaciones`: no hay columna `nombre`, se arma el rótulo. */
interface UbicacionFila {
  id: string;
  edificio: string | null;
  detalle: string | null;
}

/** Opción del selector de activo, con su ubicación para poder heredarla. */
interface OpcionActivo {
  id: string;
  label: string;
  sub?: string;
  ubicacion_id: string | null;
}

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};
const seccion: React.CSSProperties = {
  borderTop: "1px solid var(--border)", paddingTop: 20, marginTop: 4,
};

export interface MedidorCrearPanelProps {
  workspaceId: string;
  /** Activo dado por el contexto (ficha de un activo). Sin esto se elige acá. */
  activoId?: string | null;
  ubicacionId?: string | null;
  /**
   * Medidor existente: el panel pasa a modo edición.
   *
   * Mismo componente y no uno aparte porque los campos son los mismos; dos
   * formularios con los mismos diez campos se separan en cuanto alguien toca
   * uno. Lo que cambia es qué está bloqueado: `tipo` y `unidad` no se editan
   * (cambiarlos reinterpretaría toda la serie histórica).
   */
  medidor?: MedidorConUltima | null;
  onClose: () => void;
  onCreado: (medidor: Medidor) => void;
}

export default function MedidorCrearPanel({
  workspaceId, activoId, ubicacionId, medidor: inicial, onClose, onCreado,
}: MedidorCrearPanelProps) {
  const editando = !!inicial;

  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoMedidor>(inicial?.tipo ?? "manual");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [unidad, setUnidad] = useState(inicial?.unidad ?? "");
  const [unidadesExtra, setUnidadesExtra] = useState<string[]>(
    inicial?.unidad ? [inicial.unidad] : [],
  );
  const [advertencia, setAdvertencia] = useState(inicial?.advertencia?.toString() ?? "");
  const [alarma, setAlarma] = useState(inicial?.critico?.toString() ?? "");
  // La frecuencia se guarda en días; al editar se muestra tal cual en días para
  // no adivinar si "14" se escribió como 2 semanas o como 14 días.
  const [frecuencia, setFrecuencia] = useState(inicial?.frecuencia_dias?.toString() ?? "");
  const [unidadFrecuencia, setUnidadFrecuencia] = useState("dias");
  const [intervalo, setIntervalo] = useState(inicial?.intervalo_ot?.toString() ?? "");
  const [lecturaInicial, setLecturaInicial] = useState(inicial?.ultimo_disparo_ot?.toString() ?? "");

  /**
   * Activo seleccionado.
   *
   * En edición sale del medidor: el panel recibe `medidor` y NO `activoId` (ese
   * prop es el contexto de la ficha de un activo), así que sembrarlo solo desde
   * `activoId` dejaba el selector vacío aunque el medidor ya tuviera activo.
   */
  const [activoElegido, setActivoElegido] = useState<string>(
    activoId ?? inicial?.activo_id ?? "",
  );
  const [activos, setActivos] = useState<OpcionActivo[]>([]);

  /**
   * Ubicación del medidor.
   *
   * Al elegir un activo se hereda la suya —es lo que pasa el 100% de las veces
   * en los datos reales— pero queda editable: un medidor puede estar montado en
   * otra parte que la máquina a la que mide (un sensor en la sala eléctrica que
   * vigila un motor en planta). Y SIN activo la ubicación es lo único que ubica
   * al medidor: el consumo eléctrico de un edificio no cuelga de ninguna
   * máquina, y ese es justamente el caso que justifica la columna.
   */
  const [ubicacionElegida, setUbicacionElegida] = useState<string>(
    inicial?.ubicacion_id ?? ubicacionId ?? "",
  );
  const [ubicaciones, setUbicaciones] = useState<{ id: string; label: string }[]>([]);
  /** Se apaga en cuanto el usuario elige una ubicación a mano. */
  const [heredaUbicacion, setHeredaUbicacion] = useState(!inicial?.ubicacion_id);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Cuando queda seteado, el panel pasa a mostrar el token recién generado. */
  const [creado, setCreado] = useState<Medidor | null>(null);
  const [copiado, setCopiado] = useState(false);

  /**
   * Catálogos de activos y ubicaciones.
   *
   * Los dos en una sola pasada: son dos consultas chicas y separarlas en dos
   * efectos solo duplica el manejo de cancelación.
   *
   * `numero_serie` y no `codigo`: `activos` no tiene columna `codigo`, y pedirla
   * hacía fallar la consulta entera —por eso el selector salía vacío—.
   */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const sb = createClient();
      const [act, ubi] = await Promise.all([
        activoId ? Promise.resolve({ data: null }) : sb
          .from("activos")
          .select("id, nombre, numero_serie, ubicacion_id")
          .eq("workspace_id", workspaceId)
          .eq("activo", true)
          .order("nombre", { ascending: true })
          .limit(500),
        sb
          .from("ubicaciones")
          .select("id, edificio, detalle")
          .eq("workspace_id", workspaceId)
          .eq("activa", true)
          .order("edificio", { ascending: true })
          .limit(500),
      ]);
      if (!vivo) return;

      setActivos(((act.data ?? []) as ActivoOpcion[]).map(a => ({
        id: a.id,
        label: a.nombre ?? "Sin nombre",
        sub: a.numero_serie ?? undefined,
        ubicacion_id: a.ubicacion_id,
      })));

      setUbicaciones(((ubi.data ?? []) as UbicacionFila[]).map(u => ({
        id: u.id,
        // Mismo rótulo "edificio · detalle" que usa el resto de la app.
        label: [u.edificio, u.detalle].filter(Boolean).join(" · ") || "Sin nombre",
      })));
    })();
    return () => { vivo = false; };
  }, [activoId, workspaceId]);

  /**
   * Elegir un activo arrastra su ubicación.
   *
   * Va en el manejador y no en un efecto: es una consecuencia directa de lo que
   * el usuario acaba de hacer, no una sincronización con nada externo. Si ya
   * eligió una ubicación a mano (`heredaUbicacion` en false) no se le pisa.
   */
  function elegirActivo(id: string) {
    setActivoElegido(id);
    if (!heredaUbicacion) return;
    const act = activos.find(a => a.id === id);
    if (act?.ubicacion_id) setUbicacionElegida(act.ubicacion_id);
  }

  // El id y el label son el NOMBRE: es lo que se guarda en `unidad` y lo que se
  // muestra después al lado del número. El símbolo va en `sub`, que este
  // SearchSelect además busca —así quien teclea "A" o "°C" encuentra la suya.
  const opcionesUnidad = useMemo(() => [
    ...UNIDADES.flatMap(g => g.unidades.map(u => ({
      id: u.nombre,
      label: u.nombre,
      sub: u.simbolo === u.nombre ? g.grupo : `${g.grupo} · ${u.simbolo}`,
    }))),
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
      setErr("La alarma tiene que ser mayor que la advertencia."); return;
    }

    let dias: number | null = null;
    if (tipo === "manual" && frecuencia.trim() !== "") {
      const n = Number(frecuencia);
      if (!Number.isFinite(n) || n <= 0) { setErr("La frecuencia tiene que ser un número mayor que cero."); return; }
      dias = Math.round(n * UNIDAD_FRECUENCIA[unidadFrecuencia]);
    }

    const intv = intervalo.trim() === "" ? null : Number(intervalo);
    if (intv != null && (!Number.isFinite(intv) || intv <= 0)) {
      setErr("El intervalo de mantenimiento tiene que ser un número mayor que cero."); return;
    }
    const ancla = lecturaInicial.trim() === "" ? null : Number(lecturaInicial);
    if (ancla != null && !Number.isFinite(ancla)) { setErr("La lectura actual no es un número."); return; }

    setBusy(true);
    try {
      if (inicial) {
        // `tipo` y `unidad` no se tocan: cambiarlos reinterpretaría toda la
        // serie histórica (200 "horas" no son 200 "mm/s").
        const actualizado = await updateMedidor(inicial.id, {
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
          advertencia: adv,
          critico: alm,
          frecuencia_dias: dias,
          intervalo_ot: intv,
          ultimo_disparo_ot: ancla,
          // El activo también se puede reasignar: sin esto el selector dejaba
          // cambiarlo y al guardar no pasaba nada.
          activo_id: activoElegido || null,
          ubicacion_id: ubicacionElegida || null,
        });
        onCreado(actualizado);
        onClose();
        return;
      }

      const medidor = await createMedidor({
        workspaceId,
        nombre,
        tipo,
        unidad,
        descripcion,
        // Sin activo el medidor grafica igual; lo que no puede hacer es abrir
        // una OT (no habría a qué asociarla) — ver el trigger.
        activoId: activoId ?? activoElegido ?? null,
        ubicacionId: ubicacionElegida || null,
        advertencia: adv,
        critico: alm,
        frecuenciaDias: dias,
        intervaloOt: intv,
        lecturaInicial: ancla,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Header de 64px, igual que OTCrearPanel. */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          {creado ? "Medidor creado" : editando ? "Editar medidor" : "Nuevo medidor"}
        </h2>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 28px" }}>
        {creado ? (
          /* ── Paso 2: el token ──────────────────────────────────────────── */
          <div style={{ display: "grid", gap: 18, maxWidth: 620 }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-2)", lineHeight: 1.6 }}>
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
                margin: 0, padding: 14, background: "var(--surface-2)",
                border: "1px solid var(--border)", borderRadius: 8,
                fontSize: 13, lineHeight: 1.7, color: "var(--fg-2)",
                overflowX: "auto", whiteSpace: "pre", fontFamily: "ui-monospace, monospace",
              }}>{curl}</pre>
            </div>

            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.6 }}>
              El token queda disponible en la ficha del medidor, así que puedes volver a
              copiarlo cuando configures el equipo.
            </p>
          </div>
        ) : (
          /* ── Paso 1: el formulario ─────────────────────────────────────── */
          <div style={{ display: "grid", gap: 18, maxWidth: 620 }}>
            <div>
              <label style={labelStyle}>Nombre</label>
              <input type="text" value={nombre} disabled={busy} style={inputStyle} autoFocus
                placeholder="Ej. Vibración descanso lado acople"
                onChange={e => setNombre(e.target.value)} />
            </div>

            {!activoId && (
              <div>
                <label style={labelStyle}>Activo</label>
                <SearchSelect
                  placeholder="Busca el activo…"
                  emptyLabel="Sin activo"
                  value={activoElegido}
                  options={activos}
                  onChange={elegirActivo}
                  disabled={busy}
                />
                <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                  Sin activo el medidor registra y grafica, pero no puede abrir órdenes de trabajo.
                </p>
              </div>
            )}

            {/* Ubicación: se hereda del activo pero se puede cambiar, y sin
                activo es lo único que ubica al medidor (el consumo de un
                edificio no cuelga de ninguna máquina). */}
            <div>
              <label style={labelStyle}>Ubicación</label>
              <SearchSelect
                placeholder="Busca la ubicación…"
                emptyLabel="Sin ubicación"
                value={ubicacionElegida}
                options={ubicaciones}
                onChange={id => { setUbicacionElegida(id); setHeredaUbicacion(false); }}
                disabled={busy}
              />
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                {heredaUbicacion && activoElegido
                  ? "Se toma la del activo. Puedes cambiarla si el medidor está montado en otra parte."
                  : "Dónde está montado el medidor."}
              </p>
            </div>

            <div>
              <label style={labelStyle}>Tipo de medidor</label>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { v: "manual" as const, icon: <User size={14} />, label: "Manual", sub: "Lo carga una persona" },
                  { v: "automatizado" as const, icon: <Wifi size={14} />, label: "Automatizado", sub: "Lo publica un equipo" },
                ]).map(op => (
                  <button key={op.v} type="button" disabled={busy || editando}
                    onClick={() => setTipo(op.v)}
                    style={{
                      flex: 1, padding: "10px 12px", textAlign: "left", cursor: busy ? "default" : "pointer",
                      borderRadius: 8, fontFamily: "inherit",
                      border: `1px solid ${tipo === op.v ? "var(--brand)" : "var(--border)"}`,
                      background: tipo === op.v ? "var(--brand-tint)" : "var(--surface-1)",
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
                disabled={busy || editando}
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

            <div style={seccion}>
              <label style={{ ...labelStyle, marginBottom: 2 }}>Ajustes de umbral</label>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                Al superar la advertencia, Pangui avisa al equipo. Al superar la alarma,
                además abre una OT de emergencia sobre este activo. Avisa una sola vez por
                cruce: mientras el medidor siga arriba no vuelve a insistir, y recién
                vuelve a avisar si baja un 5% bajo el umbral y sube de nuevo.
                Déjalos vacíos si el medidor solo registra.
              </p>

              <div style={{ display: "grid", gap: 10 }}>
                {([
                  { label: "Advertencia", value: advertencia, set: setAdvertencia, color: "var(--warning)" },
                  { label: "Alarma", value: alarma, set: setAlarma, color: "var(--danger)" },
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

            {/* Mantenimiento por uso acumulado: el umbral de arriba vigila una
                magnitud instantánea (vibró 9 mm/s = está mal AHORA); esto cuenta
                uso (cada 250 horas toca servicio, aunque todo esté perfecto). */}
            <div style={seccion}>
              <label style={{ ...labelStyle, marginBottom: 2 }}>Mantenimiento por uso (opcional)</label>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                Para contadores que solo suben —horómetro, odómetro, ciclos—. Pangui abre
                una OT preventiva cada vez que el contador avanza este tanto.
              </p>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 120, flexShrink: 0, fontSize: 14, color: "var(--fg-2)" }}>Cada</span>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input type="number" min="0" step="any" value={intervalo} disabled={busy}
                      style={{ ...inputStyle, paddingRight: unidad ? 52 : 12 }}
                      placeholder="Ej. 250"
                      onChange={e => setIntervalo(e.target.value)} />
                    {unidad && (
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                        {unidad}
                      </span>
                    )}
                  </div>
                </div>

                {/* Sin esto, un horómetro que ya marca 1.240 h dispararía la OT
                    en la primera lectura porque la cuenta arrancaría en 0. */}
                {intervalo.trim() !== "" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 120, flexShrink: 0, fontSize: 14, color: "var(--fg-2)" }}>Va en</span>
                    <div style={{ position: "relative", flex: 1 }}>
                      <input type="number" step="any" value={lecturaInicial} disabled={busy}
                        style={{ ...inputStyle, paddingRight: unidad ? 52 : 12 }}
                        placeholder="Lectura actual del contador"
                        onChange={e => setLecturaInicial(e.target.value)} />
                      {unidad && (
                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                          {unidad}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer pegado abajo, igual que OTCrearPanel. */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface-canvas)", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          {err && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--danger)" }}>
              <AlertCircle size={14} /> {err}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {creado ? (
            <button type="button" onClick={onClose}
              style={{
                height: 40, padding: "0 24px", border: "none", borderRadius: 8,
                background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                color: "var(--fg-on-brand)", fontSize: 14, fontFamily: "inherit", cursor: "pointer",
                boxShadow: "0 2px 6px rgba(37,99,235,0.25)",
              }}>
              Listo
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy}
                style={{
                  height: 40, padding: "0 18px",
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--surface-1)", color: "var(--fg-2)",
                  fontSize: 14, fontWeight: 400, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                }}>
                Cancelar
              </button>
              <button type="button" onClick={guardar} disabled={busy}
                style={{
                  height: 40, padding: "0 24px", border: "none", borderRadius: 8,
                  background: busy ? "var(--fg-3)" : "linear-gradient(135deg, var(--brand-active), var(--brand))",
                  color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400,
                  cursor: busy ? "default" : "pointer",
                  display: "flex", alignItems: "center", gap: 7, fontFamily: "inherit",
                  boxShadow: busy ? "none" : "0 2px 6px rgba(37,99,235,0.25)",
                }}>
                {busy && <Loader2 size={13} className="animate-spin" />}
                {editando ? "Guardar" : "Crear"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
