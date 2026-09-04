"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ArrowLeft, Plus, Trash2, Loader2, Save,
  Info, AlertTriangle, Type, Hash, DollarSign,
  CheckSquare, List, ListChecks, ClipboardCheck,
  Camera, PenLine, ChevronDown, ChevronUp, X, GripVertical,
} from "lucide-react";
import {
  createProcedimiento, updateProcedimiento, getProcedimiento,
} from "@/lib/procedimientos-api";
import type { ProcedimientoForm, PasoFormItem, TipoPasoProc } from "@/types/procedimientos";

// ─── Tipo metadata ────────────────────────────────────────────────────────────

const TIPO_META: Record<TipoPasoProc, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  instruccion:       { label: "Instrucción",          icon: <Info size={14} />,          color: "#3B82F6", desc: "Texto informativo" },
  advertencia:       { label: "Advertencia",           icon: <AlertTriangle size={14} />, color: "#F59E0B", desc: "Alerta de seguridad" },
  texto:             { label: "Campo de texto",        icon: <Type size={14} />,          color: "#8B5CF6", desc: "Respuesta libre de texto" },
  numero:            { label: "Campo numérico",        icon: <Hash size={14} />,          color: "#6366F1", desc: "Valor numérico con unidad" },
  monto:             { label: "Monto ($)",             icon: <DollarSign size={14} />,    color: "#10B981", desc: "Monto monetario" },
  si_no_na:          { label: "Sí / No / N/A",         icon: <CheckSquare size={14} />,   color: "#14B8A6", desc: "Selección Sí, No o N/A" },
  opcion_multiple:   { label: "Opción múltiple",       icon: <List size={14} />,          color: "#F97316", desc: "Elige una de varias opciones" },
  lista_verificacion:{ label: "Lista de verificación", icon: <ListChecks size={14} />,    color: "#EF4444", desc: "Checklist de ítems" },
  inspeccion:        { label: "Inspección",            icon: <ClipboardCheck size={14} />,color: "#EC4899", desc: "Pass / Fail / N/A por ítem" },
  imagen:            { label: "Imagen / foto",         icon: <Camera size={14} />,        color: "#64748B", desc: "Adjunta una fotografía" },
  firma:             { label: "Firma",                 icon: <PenLine size={14} />,       color: "#0EA5E9", desc: "Firma digital" },
  // New tipos (full editor lands in the Phase-3 rewrite; stubbed here so legacy code compiles).
  medidor:           { label: "Lectura de medidor",    icon: <Hash size={14} />,          color: "#6366F1", desc: "Lectura con unidad y delta" },
  archivo:           { label: "Archivo adjunto",       icon: <Camera size={14} />,        color: "#64748B", desc: "Archivo / documento" },
  fecha:             { label: "Fecha",                 icon: <Type size={14} />,          color: "#6366F1", desc: "Selector de fecha" },
  hora:              { label: "Hora",                  icon: <Type size={14} />,          color: "#6366F1", desc: "Selector de hora" },
  fecha_hora:        { label: "Fecha y hora",          icon: <Type size={14} />,          color: "#6366F1", desc: "Selector de fecha y hora" },
  escaneo:           { label: "Escaneo / código QR",   icon: <List size={14} />,          color: "#F97316", desc: "Escaneo de código de barras o QR" },
  falla_iso14224:    { label: "Falla ISO 14224",       icon: <AlertTriangle size={14} />, color: "#EF4444", desc: "Codificación de falla ISO 14224" },
  sub_procedimiento: { label: "Sub-procedimiento",     icon: <ClipboardCheck size={14} />,color: "#EC4899", desc: "Procedimiento reutilizable embebido" },
  seccion:           { label: "Sección",               icon: <Info size={14} />,          color: "#94A3B8", desc: "Encabezado organizador" },
  puntuacion:        { label: "Puntuación",            icon: <CheckSquare size={14} />,   color: "#14B8A6", desc: "Puntaje calculado" },
};

// Espeja GALLERY en la app móvil (features/procedimientos/paso-tipos.ts).
// escaneo, falla_iso14224 y puntuacion existen en el tipo pero no se ofrecen:
// el técnico nunca los ve en el teléfono, así que crearlos desde la web dejaba
// pasos que la app no sabe renderizar. sub_procedimiento también queda fuera,
// igual que en móvil.
const TIPO_GROUPS: { label: string; tipos: TipoPasoProc[] }[] = [
  { label: "Texto y números", tipos: ["instruccion", "texto", "numero", "monto", "medidor"] },
  { label: "Fechas",          tipos: ["fecha", "hora", "fecha_hora"] },
  { label: "Selección",       tipos: ["si_no_na", "opcion_multiple", "lista_verificacion", "inspeccion"] },
  { label: "Multimedia",      tipos: ["imagen", "archivo", "firma"] },
  { label: "Organización",    tipos: ["seccion", "advertencia"] },
];

const MONEDAS = ["CLP", "USD", "EUR", "UF"];
const UNIDADES_MEDIDOR = ["hr", "km", "mi", "rpm", "psi", "bar", "kPa", "°C", "°F", "litros", "galones", "kWh", "ciclos", "unidades"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPaso(tipo: TipoPasoProc = "instruccion"): PasoFormItem {
  return {
    tempId: Math.random().toString(36).slice(2),
    tipo,
    titulo: "",
    descripcion: "",
    requerido: tipo !== "seccion" && tipo !== "instruccion" && tipo !== "advertencia" && tipo !== "puntuacion",
    unidad: "",
    valor_min: "",
    valor_max: "",
    moneda: "CLP",
    multilinea: false,
    opciones: tipo === "opcion_multiple" || tipo === "lista_verificacion" || tipo === "inspeccion"
      ? ["", ""]
      : [],
    rol_firmante: "",
    // New optional fields — start unset, user opts in.
    peso: 0,
    condicion_tempid: null,
    condicion_operador: null,
    condicion_valor: null,
    requiere_nota_si: [],
    requiere_foto_si: [],
    genera_correctiva: false,
    correctiva_plantilla: null,
    medidor_id: null,
    iso14224_taxonomia: null,
    sub_procedimiento_id: null,
    multimedia_url: null,
  };
}

function emptyForm(): ProcedimientoForm {
  return {
    nombre: "",
    descripcion: "",
    categoria: "",
    iso_categoria: "",
    bloquea_cierre_ot: false,
    auto_adjuntar: false,
    bloquea_inicio: false,
    notificar_al_completar: false,
    hereda_a_hijos: false,
    puntaje_minimo: null,
    pasos: [],
  };
}

// Comportamiento del procedimiento. Mismos textos que la hoja de Ajustes en
// móvil (app/(tabs)/procedimientos/ajustes.tsx) para que ambas plataformas
// describan las reglas igual.
const COMPORTAMIENTO_ROWS: {
  key: "bloquea_inicio" | "bloquea_cierre_ot" | "auto_adjuntar" | "notificar_al_completar" | "hereda_a_hijos";
  label: string;
  hint: string;
}[] = [
  {
    key: "bloquea_inicio",
    label: "Obligatorio antes de iniciar",
    hint: "Debe completarse antes de poder iniciar la OT. Se adjunta a cada OT nueva.",
  },
  {
    key: "bloquea_cierre_ot",
    label: "Obligatorio para cerrar OT",
    hint: "La OT no puede completarse hasta ejecutar este procedimiento.",
  },
  {
    key: "auto_adjuntar",
    label: "Auto-adjuntar a nuevas OTs",
    hint: "Se adjunta automáticamente a cada OT nueva del espacio de trabajo.",
  },
  {
    key: "notificar_al_completar",
    label: "Avisar al completar",
    hint: "Notifica a los usuarios configurados en Reglas de Alerta.",
  },
  {
    key: "hereda_a_hijos",
    label: "Heredar a sub-OTs",
    hint: "Sub-OTs creadas debajo de una OT con este procedimiento lo reciben automáticamente.",
  },
];

/** Una tarjeta por ajuste — misma forma que SettingCard en Configuración. */
function ProcSettingCard({
  label, hint, children, align = "center",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  align?: "center" | "start";
}) {
  return (
    <div style={{
      display: "flex", alignItems: align === "start" ? "flex-start" : "center",
      justifyContent: "space-between", gap: 20,
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>{label}</p>
        {hint && <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "4px 0 0", lineHeight: 1.45 }}>{hint}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {children}
      </div>
    </div>
  );
}

/** Switch estilo iOS, igual que el panel de detalle. */
function ProcSwitch({
  checked, onChange, label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 25, flexShrink: 0, padding: 2,
        borderRadius: 999, border: "none",
        background: checked ? "var(--brand)" : "var(--border-strong)",
        cursor: "pointer", transition: "background 0.18s",
        display: "flex", alignItems: "center",
      }}
    >
      <span style={{
        width: 21, height: 21, borderRadius: "50%", background: "var(--surface-1)",
        transform: checked ? "translateX(17px)" : "translateX(0)",
        transition: "transform 0.18s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--fg-3)", marginBottom: 5, display: "block",
};
function inp(focus = false): React.CSSProperties {
  return {
    width: "100%", height: 36, padding: "0 10px",
    border: `1px solid ${focus ? "var(--brand)" : "var(--border)"}`,
    borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
    background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
    boxShadow: focus ? "0 0 0 3px rgba(37,99,235,0.10)" : "none",
  };
}

const FocusInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function FocusInput({ style, onFocus, onBlur, ...props }, ref) {
    const [focused, setFocused] = useState(false);
    return (
      <input
        {...props}
        ref={ref}
        style={{ ...inp(focused), ...style }}
        onFocus={e => { setFocused(true); onFocus?.(e); }}
        onBlur={e => { setFocused(false); onBlur?.(e); }}
      />
    );
  },
);

function FocusTextarea({ style, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{
        ...inp(focused),
        height: "auto", minHeight: 60, padding: "7px 10px",
        resize: "vertical", lineHeight: 1.5, ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  editId?: string;
  /** Vienen del diálogo de "nuevo procedimiento" (app/procedimientos/nueva). */
  initialNombre?: string;
  initialDescripcion?: string;
}

type BuilderTab = "campos" | "configuracion";

export default function ProcedimientoBuilder({ editId, initialNombre, initialDescripcion }: Props) {
  const router = useRouter();
  const [wsId, setWsId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [form, setForm] = useState<ProcedimientoForm>(() => ({
    ...emptyForm(),
    nombre: initialNombre ?? "",
    descripcion: initialDescripcion ?? "",
  }));
  const [tab, setTab] = useState<BuilderTab>("campos");
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [expandedPaso, setExpandedPaso] = useState<string | null>(null);
  const [dragTempId, setDragTempId] = useState<string | null>(null);
  const [dragOverTempId, setDragOverTempId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      setWsId(data?.workspace_id ?? null);
      setMyId(user.id);
      if (editId) {
        const proc = await getProcedimiento(editId);
        // Build the draft. We map paso.id → tempId so condicion_paso_id (a
        // server UUID) can be reverse-mapped to condicion_tempid for the
        // draft form. Two-pass: first build a paso.id → tempId index, then
        // map each paso through it.
        const idToTempId = new Map<string, string>();
        (proc.pasos ?? []).forEach(p => idToTempId.set(p.id, p.id));
        setForm({
          nombre: proc.nombre,
          descripcion: proc.descripcion ?? "",
          categoria: proc.categoria ?? "",
          iso_categoria: proc.iso_categoria ?? "",
          bloquea_cierre_ot: proc.bloquea_cierre_ot,
          auto_adjuntar: proc.auto_adjuntar,
          bloquea_inicio: proc.bloquea_inicio ?? false,
          notificar_al_completar: proc.notificar_al_completar ?? false,
          hereda_a_hijos: proc.hereda_a_hijos ?? false,
          puntaje_minimo: proc.puntaje_minimo ?? null,
          pasos: (proc.pasos ?? []).map(p => ({
            tempId: p.id,
            tipo: p.tipo,
            titulo: p.titulo,
            descripcion: p.descripcion ?? "",
            requerido: p.requerido,
            unidad: p.unidad ?? "",
            valor_min: p.valor_min != null ? String(p.valor_min) : "",
            valor_max: p.valor_max != null ? String(p.valor_max) : "",
            moneda: p.moneda ?? "CLP",
            multilinea: p.multilinea ?? false,
            opciones: p.opciones ?? [],
            rol_firmante: p.rol_firmante ?? "",
            peso: p.peso ?? 0,
            condicion_tempid: p.condicion_paso_id ? (idToTempId.get(p.condicion_paso_id) ?? null) : null,
            condicion_operador: p.condicion_operador ?? null,
            condicion_valor: p.condicion_valor ?? null,
            requiere_nota_si: p.requiere_nota_si?.on ?? [],
            requiere_foto_si: p.requiere_foto_si?.on ?? [],
            genera_correctiva: p.genera_correctiva ?? false,
            correctiva_plantilla: p.correctiva_plantilla ?? null,
            medidor_id: p.medidor_id ?? null,
            iso14224_taxonomia: p.iso14224_taxonomia ?? null,
            sub_procedimiento_id: p.sub_procedimiento_id ?? null,
            multimedia_url: p.multimedia_url ?? null,
          })),
        });
        setLoadingEdit(false);
      }
    }
    load();
  }, [editId]);

  function updatePaso(tempId: string, patch: Partial<PasoFormItem>) {
    setForm(f => ({ ...f, pasos: f.pasos.map(p => p.tempId === tempId ? { ...p, ...patch } : p) }));
  }

  function removePaso(tempId: string) {
    setForm(f => ({ ...f, pasos: f.pasos.filter(p => p.tempId !== tempId) }));
    if (expandedPaso === tempId) setExpandedPaso(null);
  }

  function addPaso(tipo: TipoPasoProc) {
    const np = emptyPaso(tipo);
    setForm(f => ({ ...f, pasos: [...f.pasos, np] }));
    setExpandedPaso(np.tempId);
  }

  /** Mueve el campo arrastrado a la posición del campo sobre el que se soltó. */
  function dropPaso(targetTempId: string) {
    const from = form.pasos.findIndex(p => p.tempId === dragTempId);
    const to = form.pasos.findIndex(p => p.tempId === targetTempId);
    setDragTempId(null);
    setDragOverTempId(null);
    if (from < 0 || to < 0 || from === to) return;
    setForm(f => {
      const next = [...f.pasos];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...f, pasos: next };
    });
  }

  function movePaso(from: number, dir: 1 | -1) {
    const to = from + dir;
    if (to < 0 || to >= form.pasos.length) return;
    const arr = [...form.pasos];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setForm(f => ({ ...f, pasos: arr }));
  }

  async function handleSave() {
    // El nombre vive en la pestaña Configuración: si falta, hay que llevar al
    // usuario ahí o el error apunta a un campo que no está viendo.
    if (!form.nombre.trim()) { setTab("configuracion"); alert("El nombre es requerido"); return; }
    if (form.pasos.some(p => !p.titulo.trim())) { alert("Todos los pasos deben tener título"); return; }
    if (!wsId || !myId) return;
    setSaving(true);
    try {
      if (editId) await updateProcedimiento(editId, form);
      else await createProcedimiento(wsId, myId, form);
      router.push("/procedimientos");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loadingEdit) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Fila de título: back + nombre del procedimiento + acción principal. */}
      <div style={{
        padding: "12px 24px", background: "var(--surface-canvas)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <button
            onClick={() => router.push("/procedimientos")}
            aria-label="Volver a la biblioteca"
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)", flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{
            fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {form.nombre || (editId ? "Editar procedimiento" : "Nuevo procedimiento")}
          </h1>
        </div>

        {/* En Campos la acción es avanzar a Configuración; guardar es el paso
            final y vive en esa pestaña. */}
        {tab === "campos" ? (
          <button
            onClick={() => setTab("configuracion")}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              height: 36, padding: "0 18px",
              background: "var(--brand)", border: "none", borderRadius: 8, cursor: "pointer",
              fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit",
            }}
          >
            Continuar
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              height: 36, padding: "0 16px",
              background: saving ? "var(--border-strong)" : "var(--brand)",
              border: "none", borderRadius: 8, cursor: saving ? "default" : "pointer",
              fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit",
            }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Guardando…" : editId ? "Guardar" : "Crear procedimiento"}
          </button>
        )}
      </div>

      {/* Segmented control — mismo componente visual que las vistas de Órdenes. */}
      <div style={{ flexShrink: 0, padding: "0 24px 9px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <nav
          aria-label="Secciones del procedimiento"
          style={{ display: "inline-flex", overflow: "hidden", border: "1px solid var(--divider)", borderRadius: 9, background: "var(--color-kumo-recessed)" }}
        >
          {([["campos", "Campos del procedimiento"], ["configuracion", "Configuración"]] as const).map(([key, label]) => {
            const selected = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={selected ? "page" : undefined}
                style={{
                  minHeight: 34, padding: "0 11px", display: "inline-flex", alignItems: "center",
                  background: selected ? "var(--surface-1)" : "transparent",
                  border: selected ? "1px solid var(--border)" : "1px solid transparent",
                  borderRadius: selected ? 7 : 0,
                  boxShadow: selected ? "var(--shadow-sm)" : "none",
                  color: selected ? "var(--fg-1)" : "var(--fg-3)",
                  fontSize: 14, fontWeight: 400,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: tab === "campos" ? 1040 : 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Metadata card — pestaña Configuración */}
          {tab === "configuracion" && (
          <>
            {/* Una tarjeta por ajuste, igual que Mi cuenta y Espacio de trabajo. */}
            <ProcSettingCard label="Nombre del procedimiento" hint="Cómo aparece en la biblioteca y en la OT">
              <FocusInput
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Revisión de tablero eléctrico"
                style={{ width: 260, height: 38 }}
              />
            </ProcSettingCard>

            <ProcSettingCard label="Descripción" hint="Qué hay que hacer y con qué objetivo" align="start">
              <FocusTextarea
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Describe el objetivo de este procedimiento…"
                style={{ width: 260, minHeight: 72 }}
              />
            </ProcSettingCard>

            {/* Comportamiento — mismos textos que la hoja de Ajustes en móvil. */}
            {COMPORTAMIENTO_ROWS.map(row => (
              <ProcSettingCard key={row.key} label={row.label} hint={row.hint}>
                <ProcSwitch
                  checked={Boolean(form[row.key])}
                  onChange={v => setForm(f => ({ ...f, [row.key]: v }))}
                  label={row.label}
                />
              </ProcSettingCard>
            ))}
          </>
          )}

          {/* Campos — encabezado + tarjetas, con la paleta flotante a la
              derecha (patrón MaintainX): agregar un campo no empuja el
              contenido ni obliga a bajar hasta un botón al final. */}
          {tab === "campos" && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>

            <div style={{ flex: 1, minWidth: 0 }}>
              {form.pasos.length === 0 ? (
                <div style={{
                  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12,
                  padding: "40px 24px", textAlign: "center", color: "var(--fg-4)", fontSize: 14,
                }}>
                  Agrega tu primer campo desde el panel de la derecha.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {form.pasos.map((paso, idx) => (
                    <PasoEditor
                      key={paso.tempId}
                      paso={paso}
                      index={idx}
                      total={form.pasos.length}
                      expanded={expandedPaso === paso.tempId}
                      onToggle={() => setExpandedPaso(expandedPaso === paso.tempId ? null : paso.tempId)}
                      onChange={patch => updatePaso(paso.tempId, patch)}
                      onRemove={() => removePaso(paso.tempId)}
                      onMove={dir => movePaso(idx, dir)}
                      onDragStart={() => setDragTempId(paso.tempId)}
                      onDragOver={() => setDragOverTempId(paso.tempId)}
                      onDrop={() => dropPaso(paso.tempId)}
                      dragging={dragTempId === paso.tempId}
                      dragOver={dragOverTempId === paso.tempId && dragTempId !== paso.tempId}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 14, fontSize: 14, color: "var(--fg-4)" }}>
                Recuento de campos: {form.pasos.length}
              </div>
            </div>

            {/* Paleta */}
            <div style={{
              width: 190, flexShrink: 0, position: "sticky", top: 0,
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "14px 12px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            }}>
              <div style={{
                fontSize: 14, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.07em",
                color: "var(--fg-4)", textAlign: "center", marginBottom: 12,
              }}>
                Campo nuevo
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {TIPO_GROUPS.map(group => (
                  <div key={group.label}>
                    <div style={{
                      fontSize: 14, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.07em",
                      color: "var(--fg-4)", margin: "8px 0 4px", paddingLeft: 6,
                    }}>
                      {group.label}
                    </div>
                    {group.tipos.map(tipo => {
                      const m = TIPO_META[tipo];
                      return (
                        <button
                          key={tipo}
                          onClick={() => addPaso(tipo)}
                          title={m.desc}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, width: "100%",
                            padding: "7px 8px", border: "none", borderRadius: 8,
                            background: "none", cursor: "pointer", textAlign: "left",
                            fontFamily: "inherit", fontSize: 14, color: "var(--fg-1)",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                        >
                          <span style={{ color: m.color, display: "flex", flexShrink: 0 }}>{m.icon}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {m.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Tipo Picker ──────────────────────────────────────────────────────────────

/**
 * Cómo se verá el campo para el técnico. Se muestra en la tarjeta colapsada
 * para que el autor entienda qué está armando sin abrir la configuración.
 */
function FieldPreview({ paso }: { paso: PasoFormItem }) {
  const box: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 8,
    background: "var(--surface-0)", padding: "10px 12px",
    fontSize: 14, color: "var(--fg-4)",
  };

  if (paso.tipo === "seccion" || paso.tipo === "instruccion" || paso.tipo === "advertencia") {
    return (
      <div style={{ fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
        {paso.descripcion || (paso.tipo === "seccion" ? "Encabezado de sección" : "Texto informativo para el técnico")}
      </div>
    );
  }

  if (paso.tipo === "si_no_na") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {["Sí", "No", "N/A"].map(o => (
          <span key={o} style={{ ...box, padding: "6px 14px", fontSize: 14 }}>{o}</span>
        ))}
      </div>
    );
  }

  if (paso.tipo === "opcion_multiple" || paso.tipo === "lista_verificacion" || paso.tipo === "inspeccion") {
    const opts = (paso.opciones ?? []).filter(Boolean);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {(opts.length ? opts : ["Opción 1", "Opción 2"]).slice(0, 4).map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-3)" }}>
            <span style={{
              width: 14, height: 14, flexShrink: 0,
              border: "1px solid var(--border-strong)",
              borderRadius: paso.tipo === "opcion_multiple" ? "50%" : 4,
            }} />
            {o}
          </div>
        ))}
      </div>
    );
  }

  if (paso.tipo === "imagen" || paso.tipo === "archivo") {
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", gap: 8 }}>
        {paso.tipo === "imagen" ? <Camera size={14} /> : <Info size={14} />}
        {paso.tipo === "imagen" ? "Se adjuntará una foto" : "Se adjuntará un archivo"}
      </div>
    );
  }

  if (paso.tipo === "firma") {
    return <div style={{ ...box, height: 46, display: "flex", alignItems: "center" }}>Firma del cliente</div>;
  }

  if (paso.tipo === "texto") {
    return <div style={{ ...box, minHeight: paso.multilinea ? 56 : 36 }}>El texto se ingresará aquí</div>;
  }

  const numericHint =
    paso.tipo === "numero"  ? (paso.unidad ? `Valor en ${paso.unidad}` : "Valor numérico") :
    paso.tipo === "monto"   ? `Monto en ${paso.moneda || "CLP"}` :
    paso.tipo === "medidor" ? (paso.unidad ? `Lectura en ${paso.unidad}` : "Lectura del medidor") :
    paso.tipo === "fecha"   ? "dd-mm-aaaa" :
    paso.tipo === "hora"    ? "--:--" :
    paso.tipo === "fecha_hora" ? "dd-mm-aaaa --:--" :
    "Respuesta del técnico";

  return <div style={box}>{numericHint}</div>;
}

function PasoEditor({
  paso, index, total, expanded, onToggle, onChange, onRemove, onMove,
  onDragStart, onDragOver, onDrop, dragging, dragOver,
}: {
  paso: PasoFormItem;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PasoFormItem>) => void;
  onRemove: () => void;
  onMove: (dir: 1 | -1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}) {
  const meta = TIPO_META[paso.tipo];
  const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia" || paso.tipo === "seccion";
  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      style={{
        border: `1px solid ${expanded ? "var(--brand)" : dragOver ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 10, overflow: "hidden",
        opacity: dragging ? 0.45 : 1,
        boxShadow: expanded ? "0 2px 8px rgba(15,23,42,0.08)" : "none",
        transition: "border-color 0.12s, opacity 0.12s",
      }}>
      {/* Colapsado: vista previa de cómo verá el campo el técnico, con el
          asa de arrastre a la izquierda. Al seleccionarlo aparece la
          configuración (patrón MaintainX). */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px",
          background: "var(--surface-1)", cursor: "pointer", userSelect: "none",
        }}
      >
        <span
          draggable
          onDragStart={e => { e.stopPropagation(); onDragStart(); }}
          onClick={e => e.stopPropagation()}
          title="Arrastra para reordenar"
          style={{
            flexShrink: 0, marginTop: 2, cursor: "grab", color: "var(--fg-4)",
            display: "flex", alignItems: "center", lineHeight: 0, padding: "2px 1px",
          }}
        >
          <GripVertical size={15} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 14, fontWeight: 400,
              color: paso.titulo ? "var(--fg-1)" : "var(--fg-4)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {paso.titulo || meta.label}
            </span>
            {paso.requerido && !isInfoOnly && (
              <span style={{ fontSize: 14, color: "var(--danger)" }}>*</span>
            )}
            <span style={{ marginLeft: "auto", color: meta.color, display: "flex", flexShrink: 0 }}>
              {meta.icon}
            </span>
          </div>
          <FieldPreview paso={paso} />
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: "14px 14px 16px", borderTop: "1px solid var(--border)", background: "var(--surface-1)", minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

            {/* Title */}
            <div>
              <label style={{ ...lbl }}>
                {isInfoOnly ? "Título del bloque *" : "Etiqueta del campo *"}
              </label>
              <FocusInput
                type="text"
                value={paso.titulo}
                onChange={e => onChange({ titulo: e.target.value })}
                placeholder={
                  paso.tipo === "seccion" ? "Ej: Verificación previa" :
                  paso.tipo === "instruccion" ? "Ej: Precaución de seguridad" :
                  paso.tipo === "advertencia" ? "Ej: ¡Riesgo eléctrico!" :
                  paso.tipo === "texto" ? "Ej: Observaciones del técnico" :
                  paso.tipo === "numero" ? "Ej: Tensión L1-L2" :
                  paso.tipo === "monto" ? "Ej: Costo de repuesto" :
                  paso.tipo === "medidor" ? "Ej: Horómetro del motor" :
                  paso.tipo === "fecha" ? "Ej: Fecha de calibración" :
                  paso.tipo === "hora" ? "Ej: Hora de arranque" :
                  paso.tipo === "fecha_hora" ? "Ej: Inicio del ensayo" :
                  paso.tipo === "si_no_na" ? "Ej: ¿Se realizó la prueba?" :
                  paso.tipo === "opcion_multiple" ? "Ej: Estado general del equipo" :
                  paso.tipo === "lista_verificacion" ? "Ej: Checklist de arranque" :
                  paso.tipo === "inspeccion" ? "Ej: Inspección visual" :
                  paso.tipo === "imagen" ? "Ej: Foto del equipo revisado" :
                  paso.tipo === "archivo" ? "Ej: Adjuntar reporte PDF" :
                  paso.tipo === "sub_procedimiento" ? "Ej: Inspección de compresor" :
                  "Ej: Firma del supervisor"
                }
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ ...lbl }}>
                {isInfoOnly ? "Contenido / texto" : "Descripción / instrucción"}
              </label>
              <FocusTextarea
                value={paso.descripcion}
                onChange={e => onChange({ descripcion: e.target.value })}
                placeholder={
                  isInfoOnly
                    ? "Escribe aquí el contenido informativo o la advertencia…"
                    : "Instrucciones adicionales para el ejecutor (opcional)…"
                }
              />
            </div>

            {/* Tipo-specific config */}
            {paso.tipo === "texto" && (
              <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={paso.multilinea}
                  onChange={e => onChange({ multilinea: e.target.checked })}
                  style={{ width: 14, height: 14, accentColor: "var(--brand)", cursor: "pointer" }}
                />
                <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Texto multilínea</span>
              </label>
            )}

            {paso.tipo === "numero" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={lbl}>Unidad</label>
                  <FocusInput type="text" value={paso.unidad} onChange={e => onChange({ unidad: e.target.value })} placeholder="V, A, °C, rpm…" />
                </div>
                <div>
                  <label style={lbl}>Mín (opcional)</label>
                  <FocusInput type="number" value={paso.valor_min} onChange={e => onChange({ valor_min: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>Máx (opcional)</label>
                  <FocusInput type="number" value={paso.valor_max} onChange={e => onChange({ valor_max: e.target.value })} placeholder="100" />
                </div>
              </div>
            )}

            {paso.tipo === "monto" && (
              <div>
                <label style={lbl}>Moneda</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {MONEDAS.map(m => (
                    <button
                      key={m}
                      onClick={() => onChange({ moneda: m })}
                      style={{
                        padding: "4px 12px", borderRadius: 6, fontSize: 14, fontWeight: 400,
                        cursor: "pointer", fontFamily: "inherit",
                        border: paso.moneda === m ? "1px solid var(--brand)" : "1px solid var(--border)",
                        background: paso.moneda === m ? "#EFF6FF" : "var(--surface-1)",
                        color: paso.moneda === m ? "var(--brand)" : "var(--fg-2)",
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(paso.tipo === "opcion_multiple" || paso.tipo === "lista_verificacion" || paso.tipo === "inspeccion") && (
              <OpcionesEditor
                tipo={paso.tipo}
                opciones={paso.opciones}
                onChange={opciones => onChange({ opciones })}
              />
            )}

            {paso.tipo === "firma" && (
              <div>
                <label style={lbl}>Rol del firmante (opcional)</label>
                <FocusInput
                  type="text"
                  value={paso.rol_firmante}
                  onChange={e => onChange({ rol_firmante: e.target.value })}
                  placeholder="Ej: Cliente, Supervisor, Inspector…"
                />
              </div>
            )}

            {paso.tipo === "medidor" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <label style={lbl}>Unidad *</label>
                  <select
                    value={paso.unidad}
                    onChange={e => onChange({ unidad: e.target.value })}
                    style={{ ...inp(), appearance: "auto" }}
                  >
                    <option value="">— elegir —</option>
                    {UNIDADES_MEDIDOR.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Mín aceptable</label>
                  <FocusInput type="number" value={paso.valor_min} onChange={e => onChange({ valor_min: e.target.value })} placeholder="—" />
                </div>
                <div>
                  <label style={lbl}>Máx aceptable</label>
                  <FocusInput type="number" value={paso.valor_max} onChange={e => onChange({ valor_max: e.target.value })} placeholder="—" />
                </div>
              </div>
            )}

            {(paso.tipo === "archivo") && (
              <div style={{ fontSize: 14, color: "var(--fg-3)" }}>
                El técnico podrá adjuntar un archivo (PDF, docx, etc.) al ejecutar este paso.
              </div>
            )}

            {(paso.tipo === "fecha" || paso.tipo === "hora" || paso.tipo === "fecha_hora") && (
              <div style={{ fontSize: 14, color: "var(--fg-3)" }}>
                Captura una {paso.tipo === "fecha" ? "fecha" : paso.tipo === "hora" ? "hora" : "fecha y hora"} con el reloj del dispositivo.
              </div>
            )}





            {/* Footer: requerido + move/delete */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid var(--border)", marginTop: 2 }}>
              {!isInfoOnly ? (
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={paso.requerido}
                    onChange={e => onChange({ requerido: e.target.checked })}
                    style={{ width: 13, height: 13, accentColor: "var(--brand)", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Campo requerido</span>
                </label>
              ) : <span />}
              <div style={{ display: "flex", gap: 4 }}>
                {index > 0 && (
                  <button onClick={() => onMove(-1)} style={iconBtn}>
                    <ChevronUp size={12} />
                  </button>
                )}
                {index < total - 1 && (
                  <button onClick={() => onMove(1)} style={iconBtn}>
                    <ChevronDown size={12} />
                  </button>
                )}
                <button onClick={onRemove} style={{ ...iconBtn, borderColor: "#FEE2E2", color: "#EF4444" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "1px solid var(--border)", borderRadius: 5, cursor: "pointer", color: "var(--fg-3)",
};

// ─── Opciones editor (for opcion_multiple, lista_verificacion, inspeccion) ───

function OpcionesEditor({
  tipo, opciones, onChange,
}: {
  tipo: TipoPasoProc;
  opciones: string[];
  onChange: (v: string[]) => void;
}) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const label =
    tipo === "opcion_multiple" ? "Opciones de selección" :
    tipo === "lista_verificacion" ? "Ítems de la lista" :
    "Ítems a inspeccionar";

  const placeholder =
    tipo === "opcion_multiple" ? "Opción…" :
    tipo === "lista_verificacion" ? "Ítem a verificar…" :
    "Ítem a inspeccionar…";

  function update(i: number, val: string) {
    const next = [...opciones];
    next[i] = val;
    onChange(next);
  }
  function add() {
    onChange([...opciones, ""]);
    setTimeout(() => inputRefs.current[opciones.length]?.focus(), 30);
  }
  function remove(i: number) {
    onChange(opciones.filter((_, j) => j !== i));
  }
  function handleKey(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Enter") { e.preventDefault(); add(); }
    if (e.key === "Backspace" && opciones[i] === "" && opciones.length > 1) {
      e.preventDefault();
      remove(i);
      setTimeout(() => inputRefs.current[Math.max(0, i - 1)]?.focus(), 30);
    }
  }

  return (
    <div>
      <label style={lbl}>{label}</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {opciones.map((op, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "var(--fg-4)", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
            <FocusInput
              type="text"
              value={op}
              onChange={e => update(i, e.target.value)}
              onKeyDown={e => handleKey(e, i)}
              placeholder={placeholder}
              ref={el => { inputRefs.current[i] = el; }}
              style={{ flex: 1 }}
            />
            {opciones.length > 1 && (
              <button
                onClick={() => remove(i)}
                style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--border-strong)", padding: 0, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--border-strong)"; }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={add}
        style={{
          marginTop: 6, display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none", cursor: "pointer", padding: "2px 0",
          fontSize: 14, color: "var(--fg-3)", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "var(--brand)"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "var(--fg-3)"; }}
      >
        <Plus size={12} />
        Agregar opción (Enter)
      </button>
    </div>
  );
}
