"use client";

/**
 * Constructor de una automatización: Activador → Condiciones → Acciones.
 *
 * Mismo armazón que el resto de los paneles (`PanelCatalogo`), porque esto
 * ocupa el panel derecho del master-detail y no un modal: entre disparadores,
 * los campos de la OT y los dos frenos, el formulario es largo.
 *
 * v1 ofrece una sola acción, `crear_ot`. El enum de la base acepta cuatro, pero
 * el motor solo implementa esta, así que el constructor no la deja elegir:
 * ofrecer una acción que no hace nada es peor que no ofrecerla.
 */

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import SearchSelect from "@/components/activos/SearchSelect";
import AssigneeSelect from "@/components/ordenes/AssigneeSelect";
import CategoriaMultiSelect from "@/components/ordenes/CategoriaMultiSelect";
import {
  FieldRow, inputStyle, textareaStyle, seccionDetalle, tituloInputStyle, PanelCatalogo,
} from "@/components/catalogo/PanelCatalogo";
import {
  createAutomatizacion, updateAutomatizacion, OPERADORES, MODOS,
  type AutomatizacionCompleta, type ConfigCrearOT,
  type OperadorTrigger, type ModoTrigger,
} from "@/lib/automatizaciones-api";
import type { MedidorConUltima } from "@/lib/medidores-api";
import type { CategoriaOT, Usuario } from "@/types/ordenes";

/** Las cinco de Pangui. La referencia muestra cuatro; manda Pangui. */
const PRIORIDADES: { value: string; label: string; activeColor: string }[] = [
  { value: "ninguna", label: "Ninguna", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",    activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",   activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",    activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente", activeColor: "var(--danger)" },
];

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 500, color: "var(--fg-1)", marginBottom: 10, display: "block",
};

/** Fila del editor de disparadores. Los números viven como texto: un input
 *  vacío no es 0, y `Number("")` sí lo es. */
interface TriggerForm {
  medidor_id: string;
  operador: OperadorTrigger;
  valor: string;
  valor_hasta: string;
  modo: ModoTrigger;
  modo_n: string;
}

const TRIGGER_VACIO: TriggerForm = {
  medidor_id: "", operador: "mayor_igual", valor: "",
  valor_hasta: "", modo: "una_lectura", modo_n: "2",
};

export interface AutomatizacionCrearPanelProps {
  wsId: string;
  /** `null` = alta. Con valor, el panel edita ese conjunto completo. */
  inicial: AutomatizacionCompleta | null;
  medidores: MedidorConUltima[];
  activos: { id: string; label: string; sub?: string }[];
  ubicaciones: { id: string; label: string }[];
  usuarios: Usuario[];
  categorias: CategoriaOT[];
  onClose: () => void;
  onGuardada: () => void;
}

export default function AutomatizacionCrearPanel({
  wsId, inicial, medidores, activos, ubicaciones, usuarios, categorias, onClose, onGuardada,
}: AutomatizacionCrearPanelProps) {
  const accionInicial = inicial?.acciones[0];
  const configInicial: ConfigCrearOT = accionInicial?.config ?? {};

  const [nombre, setNombre] = useState(inicial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");

  const [triggers, setTriggers] = useState<TriggerForm[]>(() =>
    inicial && inicial.triggers.length > 0
      ? inicial.triggers.map(t => ({
          medidor_id: t.medidor_id,
          operador: t.operador,
          valor: String(t.valor),
          valor_hasta: t.valor_hasta != null ? String(t.valor_hasta) : "",
          modo: t.modo,
          modo_n: String(t.modo_n ?? 2),
        }))
      : [TRIGGER_VACIO],
  );

  // Campos de la OT que la acción deja preparada.
  const [titulo, setTitulo] = useState(configInicial.titulo ?? "");
  const [descOT, setDescOT] = useState(configInicial.descripcion ?? "");
  const [ubicacionId, setUbicacionId] = useState(configInicial.ubicacion_id ?? "");
  const [activoId, setActivoId] = useState(configInicial.activo_id ?? "");
  const [asignados, setAsignados] = useState<string[]>(configInicial.asignados_ids ?? []);
  const [categoriaIds, setCategoriaIds] = useState<string[]>(configInicial.categoria_ids ?? []);
  const [horas, setHoras] = useState(
    configInicial.tiempo_estimado ? String(Math.floor(configInicial.tiempo_estimado / 60)) : "",
  );
  const [minutos, setMinutos] = useState(
    configInicial.tiempo_estimado ? String(configInicial.tiempo_estimado % 60) : "",
  );
  const [prioridad, setPrioridad] = useState(configInicial.prioridad ?? "ninguna");

  // Los dos frenos. Sin el retrigger, una condición sostenida abre una OT por
  // cada lectura del gateway.
  const [soloSiCerrada, setSoloSiCerrada] = useState(accionInicial?.solo_si_anterior_cerrada ?? false);
  const [retrigger, setRetrigger] = useState(String(accionInicial?.retrigger_minutos ?? 5));

  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const opcionesMedidor = useMemo(() => medidores.map(m => ({
    id: m.id,
    label: `${m.nombre}${m.activo_nombre ? ` · ${m.activo_nombre}` : ""}`,
    sub: m.unidad || undefined,
  })), [medidores]);

  function setTrigger(i: number, patch: Partial<TriggerForm>) {
    setTriggers(prev => prev.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  async function guardar() {
    setErr(null);
    if (!nombre.trim()) return setErr("Ponle un nombre a la automatización.");
    if (triggers.some(t => !t.medidor_id)) return setErr("Elige el medidor de cada disparador.");
    if (triggers.some(t => t.valor.trim() === "" || !Number.isFinite(Number(t.valor))))
      return setErr("El valor del disparador tiene que ser un número.");
    // Mismo chequeo que la constraint `automatizacion_triggers_hasta_solo_en_entre`.
    // Los dos existen a propósito: la constraint es la garantía, esto es la
    // frase legible.
    if (triggers.some(t => t.operador === "entre" && !(Number(t.valor_hasta) > Number(t.valor))))
      return setErr("En un rango, el segundo valor tiene que ser mayor que el primero.");
    if (!titulo.trim()) return setErr("La orden de trabajo necesita un título.");

    const tiempoEstimado = (Number(horas) || 0) * 60 + (Number(minutos) || 0);

    const config: ConfigCrearOT = {
      titulo: titulo.trim(),
      descripcion: descOT.trim() || undefined,
      ubicacion_id: ubicacionId || null,
      activo_id: activoId || null,
      asignados_ids: asignados,
      categoria_ids: categoriaIds,
      // 0 se guarda como null: "sin estimación" y "estimado en cero" no son lo mismo.
      tiempo_estimado: tiempoEstimado > 0 ? tiempoEstimado : null,
      prioridad,
    };

    const input = {
      nombre,
      descripcion,
      triggers: triggers.map(t => ({
        medidor_id: t.medidor_id,
        operador: t.operador,
        valor: Number(t.valor),
        valor_hasta: t.valor_hasta.trim() === "" ? null : Number(t.valor_hasta),
        modo: t.modo,
        modo_n: Number(t.modo_n) || 2,
      })),
      acciones: [{
        tipo: "crear_ot" as const,
        config,
        retrigger_minutos: Number(retrigger) || 0,
        solo_si_anterior_cerrada: soloSiCerrada,
      }],
    };

    setGuardando(true);
    try {
      if (inicial) await updateAutomatizacion(inicial.id, input);
      else await createAutomatizacion(wsId, input);
      onGuardada();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar automatización" : "Nueva automatización"}
      guardando={guardando}
      puedeGuardar={true}
      error={err}
      textoGuardar={inicial ? "Guardar" : "Crear"}
      onCancel={onClose}
      onSubmit={() => { void guardar(); }}
    >
      <input
        placeholder="Nombre de la automatización"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        style={tituloInputStyle(nombre)}
      />
      <textarea
        placeholder="Descripción (opcional)"
        value={descripcion ?? ""}
        onChange={e => setDescripcion(e.target.value)}
        rows={2}
        style={{ ...textareaStyle, marginTop: 14 }}
      />

      {/* Activador */}
      <div style={seccionDetalle}>
        <label style={labelStyle}>Activador</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {triggers.map((t, i) => {
            const unidad = medidores.find(m => m.id === t.medidor_id)?.unidad ?? "";
            const modo = MODOS.find(m => m.value === t.modo);
            return (
              <div key={i} style={{
                border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                padding: 14, background: "var(--surface-1)",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SearchSelect
                      placeholder="Elige un medidor…"
                      value={t.medidor_id}
                      options={opcionesMedidor}
                      onChange={id => setTrigger(i, { medidor_id: id })}
                      emptyLabel="Sin medidor"
                    />
                  </div>
                  {/* Solo desde el segundo: el primero no se puede quitar, una
                      automatización sin disparador no se ejecuta nunca. */}
                  {i > 0 && (
                    <button
                      type="button"
                      aria-label="Quitar disparador"
                      onClick={() => setTriggers(prev => prev.filter((_, j) => j !== i))}
                      style={{
                        width: 36, height: 36, flexShrink: 0, display: "flex",
                        alignItems: "center", justifyContent: "center",
                        background: "var(--surface-1)", border: "1px solid var(--border)",
                        borderRadius: "var(--r-md)", cursor: "pointer", color: "var(--danger)",
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={t.operador}
                    onChange={e => setTrigger(i, { operador: e.target.value as OperadorTrigger })}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  >
                    {OPERADORES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{ position: "relative", width: 140, flexShrink: 0 }}>
                    <input
                      type="number"
                      value={t.valor}
                      onChange={e => setTrigger(i, { valor: e.target.value })}
                      placeholder="Valor"
                      style={{ ...inputStyle, paddingRight: unidad ? 52 : 10 }}
                    />
                    {unidad && (
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                        {unidad}
                      </span>
                    )}
                  </div>
                  {t.operador === "entre" && (
                    <div style={{ position: "relative", width: 140, flexShrink: 0 }}>
                      <input
                        type="number"
                        value={t.valor_hasta}
                        onChange={e => setTrigger(i, { valor_hasta: e.target.value })}
                        placeholder="Hasta"
                        style={{ ...inputStyle, paddingRight: unidad ? 52 : 10 }}
                      />
                      {unidad && (
                        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)" }}>
                          {unidad}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={t.modo}
                    onChange={e => setTrigger(i, { modo: e.target.value as ModoTrigger })}
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  >
                    {MODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  {t.modo === "lecturas_multiples" && (
                    <input
                      type="number"
                      min={2}
                      value={t.modo_n}
                      onChange={e => setTrigger(i, { modo_n: e.target.value })}
                      style={{ ...inputStyle, width: 100, flexShrink: 0 }}
                    />
                  )}
                </div>
                {modo && (
                  <span style={{ fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>{modo.ayuda}</span>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setTriggers(prev => [...prev, TRIGGER_VACIO])}
          style={{
            marginTop: 12, background: "none", border: "none", padding: 0,
            cursor: "pointer", fontSize: 14, color: "var(--brand)", fontFamily: "inherit",
          }}
        >
          + Añadir disparador
        </button>
      </div>

      {/* Condiciones: la v1 no trae editor. Se deja el bloque a la vista para
          que la ausencia sea explícita y no parezca que falta cargar algo. */}
      <div style={seccionDetalle}>
        <label style={labelStyle}>Condiciones</label>
        <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
          Por ahora la automatización se ejecuta siempre que el disparador se cumple.
        </p>
      </div>

      {/* Acciones */}
      <div style={seccionDetalle}>
        <label style={labelStyle}>Acciones</label>
        <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--fg-2)" }}>Crear una orden de trabajo</p>

        <FieldRow label="Título">
          <input
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="¿Qué trabajo hay que hacer?"
            style={inputStyle}
          />
        </FieldRow>

        <FieldRow label="Descripción">
          <textarea
            value={descOT}
            onChange={e => setDescOT(e.target.value)}
            rows={3}
            style={textareaStyle}
          />
        </FieldRow>

        <FieldRow label="Ubicación">
          <SearchSelect
            placeholder="Elige una ubicación…"
            value={ubicacionId ?? ""}
            options={ubicaciones}
            onChange={setUbicacionId}
            emptyLabel="Sin ubicación"
          />
        </FieldRow>

        <FieldRow label="Activo">
          <SearchSelect
            placeholder="Elige un activo…"
            value={activoId ?? ""}
            options={activos}
            onChange={setActivoId}
            emptyLabel="Sin activo"
          />
        </FieldRow>

        <FieldRow label="Asignar a">
          <AssigneeSelect usuarios={usuarios} value={asignados} onChange={setAsignados} />
        </FieldRow>

        <FieldRow label="Tiempo estimado">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number" min={0} value={horas} onChange={e => setHoras(e.target.value)}
              placeholder="0" style={{ ...inputStyle, width: 90 }}
            />
            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>Horas</span>
            <input
              type="number" min={0} value={minutos} onChange={e => setMinutos(e.target.value)}
              placeholder="0" style={{ ...inputStyle, width: 90 }}
            />
            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>Minutos</span>
          </div>
        </FieldRow>

        <FieldRow label="Prioridad">
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {PRIORIDADES.map((p, i) => {
              const active = prioridad === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPrioridad(p.value)}
                  style={{
                    height: 38, padding: "0 16px",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                    background: active ? "var(--surface-hover)" : "var(--surface-1)",
                    fontSize: 14, fontWeight: 400,
                    color: active ? p.activeColor : "var(--fg-2)",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </FieldRow>

        {categorias.length > 0 && (
          <FieldRow label="Categorías">
            <CategoriaMultiSelect categorias={categorias} value={categoriaIds} onChange={setCategoriaIds} />
          </FieldRow>
        )}

        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-2)" }}>
            <input type="checkbox" checked={soloSiCerrada}
              onChange={e => setSoloSiCerrada(e.target.checked)} />
            Crear sólo si la orden de trabajo anterior de esta automatización está cerrada
          </label>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-2)" }}>
              Ejecutar como máximo una vez cada
              <input
                type="number" min={0} value={retrigger}
                onChange={e => setRetrigger(e.target.value)}
                style={{ ...inputStyle, width: 90 }}
              />
              minutos
            </label>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
              Evita que una condición sostenida abra una orden por cada lectura.
            </p>
          </div>
        </div>
      </div>
    </PanelCatalogo>
  );
}
