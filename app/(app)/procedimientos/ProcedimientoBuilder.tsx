"use client";

import { useState, useEffect, useRef, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ArrowLeft, Plus, Trash2, Loader2, Save,
  Info, AlertTriangle, Type, Hash, DollarSign,
  CheckSquare, List, ListChecks, ClipboardCheck,
  Camera, PenLine, ChevronDown, ChevronUp, X,
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

const TIPO_GROUPS: { label: string; tipos: TipoPasoProc[] }[] = [
  { label: "Organización",         tipos: ["seccion", "instruccion", "advertencia"] },
  { label: "Campos de entrada",    tipos: ["texto", "numero", "monto", "medidor"] },
  { label: "Fecha y hora",         tipos: ["fecha", "hora", "fecha_hora"] },
  { label: "Selección",            tipos: ["si_no_na", "opcion_multiple"] },
  { label: "Verificación",         tipos: ["lista_verificacion", "inspeccion"] },
  { label: "Multimedia",           tipos: ["imagen", "archivo", "firma"] },
  { label: "Avanzados (ISO)",      tipos: ["escaneo", "falla_iso14224", "sub_procedimiento", "puntuacion"] },
];

const MONEDAS = ["CLP", "USD", "EUR", "UF"];
const UNIDADES_MEDIDOR = ["hr", "km", "mi", "rpm", "psi", "bar", "kPa", "°C", "°F", "litros", "galones", "kWh", "ciclos", "unidades"];
const OPERADORES_CONDICION = [
  { value: "eq",       label: "es igual a" },
  { value: "ne",       label: "no es igual a" },
  { value: "in",       label: "está en" },
  { value: "gt",       label: "es mayor que" },
  { value: "lt",       label: "es menor que" },
  { value: "gte",      label: "es mayor o igual que" },
  { value: "lte",      label: "es menor o igual que" },
  { value: "contains", label: "contiene" },
] as const;

// Which step types can scoring weight be applied to? Mirrors MaintainX: only
// answer-bearing fields, not info blocks or organizers.
const TIPOS_SCORABLES: TipoPasoProc[] = ["si_no_na", "opcion_multiple", "lista_verificacion", "inspeccion"];

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
    hereda_a_hijos: false,
    puntaje_minimo: null,
    pasos: [],
  };
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#64748B", marginBottom: 5, display: "block",
};
function inp(focus = false): React.CSSProperties {
  return {
    width: "100%", height: 36, padding: "0 10px",
    border: `1px solid ${focus ? "#2563EB" : "#E2E8F0"}`,
    borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "#0F172A",
    background: "#fff", outline: "none", boxSizing: "border-box",
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

interface Props { editId?: string }

export default function ProcedimientoBuilder({ editId }: Props) {
  const router = useRouter();
  const [wsId, setWsId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [form, setForm] = useState<ProcedimientoForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [expandedPaso, setExpandedPaso] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    setPickerOpen(false);
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
    if (!form.nombre.trim()) { alert("El nombre es requerido"); return; }
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
        <Loader2 size={20} className="animate-spin" style={{ color: "#94A3B8" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ padding: "16px 32px", borderBottom: "1px solid #E2E8F0", background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/procedimientos")}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#64748B" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", margin: 0 }}>
            {editId ? "Editar procedimiento" : "Nuevo procedimiento"}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 36, padding: "0 16px",
            background: saving ? "#CBD5E1" : "linear-gradient(135deg, #1E3A8A, #2563EB)",
            border: "none", borderRadius: 8, cursor: saving ? "default" : "pointer",
            fontSize: 13, fontWeight: 600, color: "#fff", fontFamily: "inherit",
          }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Metadata card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: "20px 24px" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 16 }}>Información básica</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Nombre del procedimiento *</label>
                <FocusInput
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Revisión de tablero eléctrico"
                  style={{ height: 38 }}
                />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lbl}>Descripción</label>
                <FocusTextarea
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Describe el objetivo de este procedimiento…"
                  style={{ minHeight: 72 }}
                />
              </div>
              <div>
                <label style={lbl}>Categoría</label>
                <FocusInput
                  type="text"
                  value={form.categoria}
                  onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                  placeholder="Ej: Eléctrico, Mecánico…"
                />
              </div>
              <div>
                <label style={lbl}>Categoría ISO</label>
                <select
                  value={form.iso_categoria ?? ""}
                  onChange={e => setForm(f => ({ ...f, iso_categoria: e.target.value || "" }))}
                  style={{ ...inp(), appearance: "auto" }}
                >
                  <option value="">— sin clasificar —</option>
                  <option value="inspeccion">Inspección</option>
                  <option value="mantenimiento">Mantenimiento</option>
                  <option value="seguridad">Seguridad</option>
                  <option value="calibracion">Calibración</option>
                  <option value="calidad">Calidad / 9001</option>
                  <option value="otro">Otro</option>
                </select>
                <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>
                  Usado para sugerencias ISO (no obligatorio).
                </div>
              </div>
              <div>
                <label style={lbl}>Puntaje mínimo</label>
                <FocusInput
                  type="number"
                  min={0}
                  value={form.puntaje_minimo == null ? "" : String(form.puntaje_minimo)}
                  onChange={e => setForm(f => ({ ...f, puntaje_minimo: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="Sin mínimo"
                />
                <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>
                  Suma de pesos requerida para aprobar. Solo aplica con pasos puntuados.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "flex-end", minWidth: 0 }}>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.bloquea_cierre_ot}
                      onChange={e => setForm(f => ({ ...f, bloquea_cierre_ot: e.target.checked }))}
                      style={{ width: 14, height: 14, accentColor: "#2563EB", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>Bloquea cierre de OT</span>
                  </label>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, paddingLeft: 22 }}>
                    La OT no puede completarse hasta ejecutar este procedimiento.
                  </div>
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.auto_adjuntar}
                      onChange={e => setForm(f => ({ ...f, auto_adjuntar: e.target.checked }))}
                      style={{ width: 14, height: 14, accentColor: "#8B5CF6", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>Auto-adjuntar a nuevas OTs</span>
                  </label>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, paddingLeft: 22 }}>
                    Se adjunta automáticamente a cada OT nueva del workspace.
                  </div>
                </div>
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={form.hereda_a_hijos ?? false}
                      onChange={e => setForm(f => ({ ...f, hereda_a_hijos: e.target.checked }))}
                      style={{ width: 14, height: 14, accentColor: "#10B981", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>Heredar a sub-OTs</span>
                  </label>
                  <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3, paddingLeft: 22 }}>
                    Sub-OTs creadas debajo de una OT con este procedimiento lo reciben automáticamente.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Steps card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: "20px 24px", minWidth: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: form.pasos.length > 0 ? 14 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                Campos{" "}
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 400 }}>
                  ({form.pasos.length})
                </span>
              </div>
            </div>

            {form.pasos.length === 0 && !pickerOpen && (
              <div style={{ textAlign: "center", padding: "24px 0 4px", color: "#94A3B8", fontSize: 13 }}>
                Agrega campos usando el botón de abajo
              </div>
            )}

            {form.pasos.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                {form.pasos.map((paso, idx) => (
                  <PasoEditor
                    key={paso.tempId}
                    paso={paso}
                    index={idx}
                    total={form.pasos.length}
                    allPasos={form.pasos}
                    expanded={expandedPaso === paso.tempId}
                    onToggle={() => setExpandedPaso(expandedPaso === paso.tempId ? null : paso.tempId)}
                    onChange={patch => updatePaso(paso.tempId, patch)}
                    onRemove={() => removePaso(paso.tempId)}
                    onMove={dir => movePaso(idx, dir)}
                  />
                ))}
              </div>
            )}

            {pickerOpen ? (
              <TipoPicker onSelect={addPaso} onClose={() => setPickerOpen(false)} />
            ) : (
              <button
                onClick={() => setPickerOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  width: "100%", height: 38, justifyContent: "center",
                  border: "2px dashed #E2E8F0", borderRadius: 8, background: "none",
                  cursor: "pointer", fontSize: 13, color: "#64748B", fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.color = "#2563EB"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#64748B"; }}
              >
                <Plus size={14} />
                Agregar campo
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Tipo Picker ──────────────────────────────────────────────────────────────

function TipoPicker({ onSelect, onClose }: { onSelect: (t: TipoPasoProc) => void; onClose: () => void }) {
  return (
    <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, background: "#F8FAFC", padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "#475569" }}>Selecciona el tipo de campo</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, lineHeight: 0 }}>
          <X size={14} />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {TIPO_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94A3B8", marginBottom: 6 }}>
              {group.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 5 }}>
              {group.tipos.map(tipo => {
                const m = TIPO_META[tipo];
                return (
                  <button
                    key={tipo}
                    onClick={() => onSelect(tipo)}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                      border: `1px solid ${m.color}22`, borderRadius: 8,
                      background: `${m.color}08`, cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit",
                      transition: "background 0.12s",
                      minWidth: 0, overflow: "hidden",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${m.color}18`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${m.color}08`; }}
                  >
                    <span style={{ color: m.color, marginTop: 1, flexShrink: 0 }}>{m.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#0F172A", lineHeight: 1.2 }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, lineHeight: 1.3 }}>{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Paso Editor ──────────────────────────────────────────────────────────────

function PasoEditor({
  paso, index, total, allPasos, expanded, onToggle, onChange, onRemove, onMove,
}: {
  paso: PasoFormItem;
  index: number;
  total: number;
  allPasos: PasoFormItem[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PasoFormItem>) => void;
  onRemove: () => void;
  onMove: (dir: 1 | -1) => void;
}) {
  const meta = TIPO_META[paso.tipo];
  const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia" || paso.tipo === "seccion";
  const isScorable = TIPOS_SCORABLES.includes(paso.tipo);
  // The "requiere_nota_si" / "requiere_foto_si" / "genera_correctiva" controls
  // only make sense for answer-bearing types that have a "fail-like" state.
  const supportsFailGuard = paso.tipo === "si_no_na" || paso.tipo === "inspeccion" || paso.tipo === "opcion_multiple";
  // Steps that can be referenced as a condition source — anything with a
  // distinct answer the user can match against.
  const conditionSources = allPasos
    .filter(p => p.tempId !== paso.tempId)
    .filter(p => p.tipo !== "seccion" && p.tipo !== "instruccion" && p.tipo !== "advertencia" && p.tipo !== "puntuacion");

  return (
    <div style={{
      border: `1px solid ${expanded ? "#CBD5E1" : "#E2E8F0"}`,
      borderRadius: 8, overflow: "hidden",
      boxShadow: expanded ? "0 2px 8px rgba(15,23,42,0.06)" : "none",
    }}>
      {/* Header row */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
          background: expanded ? "#F8FAFC" : "#fff", cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: meta.color + "15", color: meta.color,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {meta.icon}
        </span>
        <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500, flexShrink: 0 }}>{index + 1}.</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: paso.titulo ? "#0F172A" : "#94A3B8", fontWeight: paso.titulo ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {paso.titulo || "Sin título"}
        </span>
        <span style={{ fontSize: 11, color: meta.color, background: meta.color + "15", borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
          {meta.label}
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: "#94A3B8", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "#94A3B8", flexShrink: 0 }} />}
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: "14px 14px 16px", borderTop: "1px solid #E2E8F0", background: "#fff", minWidth: 0 }}>
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
                  paso.tipo === "escaneo" ? "Ej: Escanear código de activo" :
                  paso.tipo === "falla_iso14224" ? "Ej: Registrar modo de falla" :
                  paso.tipo === "sub_procedimiento" ? "Ej: Inspección de compresor" :
                  paso.tipo === "puntuacion" ? "Ej: Puntaje de auditoría" :
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
                  style={{ width: 14, height: 14, accentColor: "#2563EB", cursor: "pointer" }}
                />
                <span style={{ fontSize: 12.5, color: "#475569" }}>Texto multilínea</span>
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
                        padding: "4px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit",
                        border: paso.moneda === m ? "1px solid #2563EB" : "1px solid #E2E8F0",
                        background: paso.moneda === m ? "#EFF6FF" : "#fff",
                        color: paso.moneda === m ? "#2563EB" : "#475569",
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
              <div style={{ fontSize: 12, color: "#64748B" }}>
                El técnico podrá adjuntar un archivo (PDF, docx, etc.) al ejecutar este paso.
              </div>
            )}

            {(paso.tipo === "fecha" || paso.tipo === "hora" || paso.tipo === "fecha_hora") && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Captura una {paso.tipo === "fecha" ? "fecha" : paso.tipo === "hora" ? "hora" : "fecha y hora"} con el reloj del dispositivo.
              </div>
            )}

            {paso.tipo === "escaneo" && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Escanea un código QR o de barras (típicamente vinculado a un activo). En web se puede ingresar manualmente.
              </div>
            )}

            {paso.tipo === "falla_iso14224" && (
              <div style={{ fontSize: 12, color: "#64748B", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "8px 10px" }}>
                Mostrará selectores en cascada de modo / causa / mecanismo / acción ISO 14224.
                La taxonomía se carga desde <code style={{ background: "#fff", padding: "0 4px", borderRadius: 3 }}>workspace_taxonomias</code>.
              </div>
            )}

            {paso.tipo === "sub_procedimiento" && (
              <div>
                <label style={lbl}>Sub-procedimiento embebido</label>
                <div style={{ fontSize: 11.5, color: "#94A3B8" }}>
                  Edita el sub-procedimiento por separado en la biblioteca y referéncialo aquí (selector próximamente).
                </div>
              </div>
            )}

            {paso.tipo === "puntuacion" && (
              <div style={{ fontSize: 12, color: "#64748B" }}>
                Muestra el puntaje acumulado del procedimiento (suma de pesos de pasos ya respondidos). No requiere entrada.
              </div>
            )}

            {/* ── Avanzado: scoring, lógica condicional, guardrails ISO ── */}
            {(isScorable || conditionSources.length > 0 || supportsFailGuard) && (
              <details style={{ borderTop: "1px solid #F1F5F9", paddingTop: 10 }}>
                <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569", outline: "none" }}>
                  Avanzado (ISO)
                </summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>

                  {isScorable && (
                    <div>
                      <label style={lbl}>Peso (puntos)</label>
                      <FocusInput
                        type="number"
                        min={0}
                        value={paso.peso == null ? "" : String(paso.peso)}
                        onChange={e => onChange({ peso: e.target.value === "" ? 0 : Number(e.target.value) })}
                        placeholder="0 = no puntuado"
                        style={{ maxWidth: 160 }}
                      />
                      <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 3 }}>
                        Suma al puntaje total del procedimiento si el paso se aprueba.
                      </div>
                    </div>
                  )}

                  {conditionSources.length > 0 && (
                    <div>
                      <label style={lbl}>Mostrar solo si…</label>
                      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 6 }}>
                        <select
                          value={paso.condicion_tempid ?? ""}
                          onChange={e => onChange({ condicion_tempid: e.target.value || null })}
                          style={{ ...inp(), appearance: "auto" }}
                        >
                          <option value="">— sin condición —</option>
                          {conditionSources.map(p => (
                            <option key={p.tempId} value={p.tempId}>
                              {p.titulo ? `${allPasos.indexOf(p) + 1}. ${p.titulo}` : `Paso ${allPasos.indexOf(p) + 1}`}
                            </option>
                          ))}
                        </select>
                        <select
                          value={paso.condicion_operador ?? ""}
                          onChange={e => onChange({ condicion_operador: (e.target.value || null) as PasoFormItem["condicion_operador"] })}
                          disabled={!paso.condicion_tempid}
                          style={{ ...inp(), appearance: "auto", opacity: paso.condicion_tempid ? 1 : 0.5 }}
                        >
                          <option value="">operador…</option>
                          {OPERADORES_CONDICION.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <FocusInput
                          type="text"
                          value={paso.condicion_valor == null ? "" : String(paso.condicion_valor)}
                          onChange={e => onChange({ condicion_valor: e.target.value || null })}
                          disabled={!paso.condicion_tempid}
                          placeholder="valor (ej: fail)"
                          style={{ opacity: paso.condicion_tempid ? 1 : 0.5 }}
                        />
                      </div>
                    </div>
                  )}

                  {supportsFailGuard && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div>
                        <label style={lbl}>Exigir nota si la respuesta es…</label>
                        <FocusInput
                          type="text"
                          value={paso.requiere_nota_si?.join(", ") ?? ""}
                          onChange={e => onChange({ requiere_nota_si: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="fail, no, poor"
                        />
                      </div>
                      <div>
                        <label style={lbl}>Exigir foto si la respuesta es…</label>
                        <FocusInput
                          type="text"
                          value={paso.requiere_foto_si?.join(", ") ?? ""}
                          onChange={e => onChange({ requiere_foto_si: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
                          placeholder="fail, replace"
                        />
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={paso.genera_correctiva ?? false}
                          onChange={e => onChange({ genera_correctiva: e.target.checked })}
                          style={{ width: 14, height: 14, accentColor: "#DC2626", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 12.5, color: "#475569" }}>Crear OT correctiva automática al fallar</span>
                      </label>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Footer: requerido + move/delete */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4, borderTop: "1px solid #F1F5F9", marginTop: 2 }}>
              {!isInfoOnly ? (
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={paso.requerido}
                    onChange={e => onChange({ requerido: e.target.checked })}
                    style={{ width: 13, height: 13, accentColor: "#2563EB", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 12.5, color: "#475569" }}>Campo requerido</span>
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
  background: "none", border: "1px solid #E2E8F0", borderRadius: 5, cursor: "pointer", color: "#64748B",
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
            <span style={{ fontSize: 12, color: "#94A3B8", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
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
                style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#CBD5E1", padding: 0, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#CBD5E1"; }}
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
          fontSize: 12, color: "#64748B", fontFamily: "inherit",
        }}
        onMouseEnter={e => { e.currentTarget.style.color = "#2563EB"; }}
        onMouseLeave={e => { e.currentTarget.style.color = "#64748B"; }}
      >
        <Plus size={12} />
        Agregar opción (Enter)
      </button>
    </div>
  );
}
