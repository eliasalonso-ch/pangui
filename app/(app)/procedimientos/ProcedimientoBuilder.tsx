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
  instruccion:       { label: "Instrucción",          icon: <Info size={14} />,          color: "#3B82F6", desc: "Texto informativo para el ejecutor" },
  advertencia:       { label: "Advertencia",           icon: <AlertTriangle size={14} />, color: "#F59E0B", desc: "Alerta de seguridad o riesgo" },
  texto:             { label: "Campo de texto",        icon: <Type size={14} />,          color: "#8B5CF6", desc: "El ejecutor escribe una respuesta de texto" },
  numero:            { label: "Campo numérico",        icon: <Hash size={14} />,          color: "#6366F1", desc: "El ejecutor ingresa un valor numérico" },
  monto:             { label: "Monto ($)",             icon: <DollarSign size={14} />,    color: "#10B981", desc: "El ejecutor ingresa un monto monetario" },
  si_no_na:          { label: "Sí / No / N/A",         icon: <CheckSquare size={14} />,   color: "#14B8A6", desc: "Selección entre Sí, No o No aplica" },
  opcion_multiple:   { label: "Opción múltiple",       icon: <List size={14} />,          color: "#F97316", desc: "El ejecutor elige una opción de una lista" },
  lista_verificacion:{ label: "Lista de verificación", icon: <ListChecks size={14} />,    color: "#EF4444", desc: "El ejecutor marca ítems de una checklist" },
  inspeccion:        { label: "Inspección",            icon: <ClipboardCheck size={14} />,color: "#EC4899", desc: "Resultado pass/fail/N/A por ítem" },
  imagen:            { label: "Imagen / foto",         icon: <Camera size={14} />,        color: "#64748B", desc: "El ejecutor adjunta una fotografía" },
  firma:             { label: "Firma",                 icon: <PenLine size={14} />,       color: "#0EA5E9", desc: "El ejecutor firma con el dedo o mouse" },
};

const TIPO_GROUPS: { label: string; tipos: TipoPasoProc[] }[] = [
  { label: "Bloques informativos", tipos: ["instruccion", "advertencia"] },
  { label: "Campos de entrada",    tipos: ["texto", "numero", "monto"] },
  { label: "Selección",            tipos: ["si_no_na", "opcion_multiple"] },
  { label: "Verificación",         tipos: ["lista_verificacion", "inspeccion"] },
  { label: "Multimedia",           tipos: ["imagen", "firma"] },
];

const MONEDAS = ["CLP", "USD", "EUR", "UF"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPaso(tipo: TipoPasoProc = "instruccion"): PasoFormItem {
  return {
    tempId: Math.random().toString(36).slice(2),
    tipo,
    titulo: "",
    descripcion: "",
    requerido: true,
    unidad: "",
    valor_min: "",
    valor_max: "",
    moneda: "CLP",
    multilinea: false,
    opciones: tipo === "opcion_multiple" || tipo === "lista_verificacion" || tipo === "inspeccion"
      ? ["", ""]
      : [],
    rol_firmante: "",
  };
}

function emptyForm(): ProcedimientoForm {
  return { nombre: "", descripcion: "", categoria: "", bloquea_cierre_ot: false, pasos: [] };
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
        setForm({
          nombre: proc.nombre,
          descripcion: proc.descripcion ?? "",
          categoria: proc.categoria ?? "",
          bloquea_cierre_ot: proc.bloquea_cierre_ot,
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
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
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
            </div>
          </div>

          {/* Steps card */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: "20px 24px" }}>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 5 }}>
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
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${m.color}18`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${m.color}08`; }}
                  >
                    <span style={{ color: m.color, marginTop: 1, flexShrink: 0 }}>{m.icon}</span>
                    <div>
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
  paso, index, total, expanded, onToggle, onChange, onRemove, onMove,
}: {
  paso: PasoFormItem;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PasoFormItem>) => void;
  onRemove: () => void;
  onMove: (dir: 1 | -1) => void;
}) {
  const meta = TIPO_META[paso.tipo];
  const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia";

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
        <span style={{ flex: 1, fontSize: 13, color: paso.titulo ? "#0F172A" : "#94A3B8", fontWeight: paso.titulo ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {paso.titulo || "Sin título"}
        </span>
        <span style={{ fontSize: 11, color: meta.color, background: meta.color + "15", borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
          {meta.label}
        </span>
        {expanded ? <ChevronUp size={14} style={{ color: "#94A3B8", flexShrink: 0 }} /> : <ChevronDown size={14} style={{ color: "#94A3B8", flexShrink: 0 }} />}
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: "14px 14px 16px", borderTop: "1px solid #E2E8F0", background: "#fff" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

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
                  paso.tipo === "instruccion" ? "Ej: Precaución de seguridad" :
                  paso.tipo === "advertencia" ? "Ej: ¡Riesgo eléctrico!" :
                  paso.tipo === "texto" ? "Ej: Observaciones del técnico" :
                  paso.tipo === "numero" ? "Ej: Tensión L1-L2" :
                  paso.tipo === "monto" ? "Ej: Costo de repuesto" :
                  paso.tipo === "si_no_na" ? "Ej: ¿Se realizó la prueba?" :
                  paso.tipo === "opcion_multiple" ? "Ej: Estado general del equipo" :
                  paso.tipo === "lista_verificacion" ? "Ej: Checklist de arranque" :
                  paso.tipo === "inspeccion" ? "Ej: Inspección visual" :
                  paso.tipo === "imagen" ? "Ej: Foto del equipo revisado" :
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
