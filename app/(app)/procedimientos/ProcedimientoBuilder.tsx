"use client";

import { useState, useEffect, useRef, forwardRef, Fragment, useId } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Plus, Trash2, Loader2, Save,
  Info, AlertTriangle, Type, Hash, DollarSign,
  CheckSquare, List, ListChecks, ClipboardCheck,
  Camera, PenLine, ChevronDown, ChevronUp, X, GripVertical,
  CirclePlus, Rows2, EllipsisVertical, Check, Eye, Pencil, Settings, Calendar, Clock, CalendarClock, Paperclip, Gauge,
} from "lucide-react";
import {
  createProcedimiento, updateProcedimiento, getProcedimiento,
} from "@/lib/procedimientos-api";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProcedimientoForm, PasoFormItem, TipoPasoProc } from "@/types/procedimientos";
import Link from "next/link";
import { SearchSelect } from "@/components/ot/OTFormFields";
import { fetchMedidores, type MedidorConUltima } from "@/lib/medidores-api";
import { DatePicker, TimePicker, DateTimePicker } from "@/components/ui/date-time-picker";
import { useTopBarVista } from "@/components/TopBarActions";
import { Attachment, AttachmentDropzone, tipoArchivo, tamanoArchivo } from "@/components/ui/attachment";

// ─── Tipo metadata ────────────────────────────────────────────────────────────

// desc: qué hace el campo y cómo lo usa el técnico; se muestra en el ícono ⓘ
// de cada tarjeta. Basado en TIPOS de la app móvil (paso-tipos.ts).
const TIPO_META: Record<TipoPasoProc, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  instruccion:       { label: "Instrucción",          icon: <Info size={14} />,          color: "#3B82F6", desc: "Muestra una indicación o explicación. El técnico la lee y toca «Confirmar lectura»; no pide otra respuesta." },
  advertencia:       { label: "Advertencia",           icon: <AlertTriangle size={14} />, color: "#F59E0B", desc: "Resalta una precaución o riesgo de seguridad. El técnico la marca como «Leído y entendido»." },
  texto:             { label: "Campo de texto",        icon: <Type size={14} />,          color: "#8B5CF6", desc: "El técnico escribe una respuesta libre, como una observación o un comentario." },
  numero:            { label: "Campo numérico",        icon: <Hash size={14} />,          color: "#6366F1", desc: "El técnico ingresa un valor numérico. Puedes definir la unidad y un rango mínimo y máximo." },
  monto:             { label: "Monto ($)",             icon: <DollarSign size={14} />,    color: "#10B981", desc: "El técnico registra un valor en dinero, en la moneda que elijas. Por ejemplo, el costo de un repuesto." },
  si_no_na:          { label: "Sí / No / N/A",         icon: <CheckSquare size={14} />,   color: "#14B8A6", desc: "El técnico responde Sí, No o No aplica. Ideal para verificaciones rápidas." },
  opcion_multiple:   { label: "Opción múltiple",       icon: <List size={14} />,          color: "#F97316", desc: "El técnico elige una sola opción de la lista que defines." },
  lista_verificacion:{ label: "Checklist",             icon: <ListChecks size={14} />,    color: "#EF4444", desc: "Una lista de ítems donde el técnico marca todos los que correspondan; puede marcar varios." },
  inspeccion:        { label: "Inspección",            icon: <ClipboardCheck size={14} />,color: "#EC4899", desc: "El técnico evalúa cada ítem por separado como Aprobado, Alerta o Falla." },
  imagen:            { label: "Imagen / foto",         icon: <Camera size={14} />,        color: "#F43F5E", desc: "El técnico toma o adjunta una o más fotos como evidencia del trabajo." },
  firma:             { label: "Firma",                 icon: <PenLine size={14} />,       color: "#0EA5E9", desc: "Captura una firma en pantalla para dejar constancia de conformidad." },
  // New tipos (full editor lands in the Phase-3 rewrite; stubbed here so legacy code compiles).
  medidor:           { label: "Lectura de medidor",    icon: <Gauge size={14} />,         color: "#84CC16", desc: "El técnico anota la lectura de un instrumento o medidor (horómetro, presión, temperatura…) en la unidad que definas." },
  archivo:           { label: "Archivo adjunto",       icon: <Paperclip size={14} />,     color: "#78716C", desc: "El técnico adjunta un documento, como un certificado o un informe en PDF." },
  fecha:             { label: "Fecha",                 icon: <Calendar size={14} />,      color: "#06B6D4", desc: "El técnico selecciona una fecha desde un calendario." },
  hora:              { label: "Hora",                  icon: <Clock size={14} />,         color: "#A855F7", desc: "El técnico selecciona una hora del día." },
  fecha_hora:        { label: "Fecha y hora",          icon: <CalendarClock size={14} />, color: "#D946EF", desc: "El técnico selecciona fecha y hora juntas, útil para registrar un momento exacto." },
  escaneo:           { label: "Escaneo / código QR",   icon: <List size={14} />,          color: "#EAB308", desc: "Escaneo de código de barras o QR" },
  falla_iso14224:    { label: "Falla ISO 14224",       icon: <AlertTriangle size={14} />, color: "#DC2626", desc: "Codificación de falla ISO 14224" },
  sub_procedimiento: { label: "Sub-procedimiento",     icon: <ClipboardCheck size={14} />,color: "#DB2777", desc: "Procedimiento reutilizable embebido" },
  seccion:           { label: "Sección",               icon: <Rows2 size={14} />,         color: "#94A3B8", desc: "Título que agrupa los campos que siguen. No pide respuesta." },
  puntuacion:        { label: "Puntuación",            icon: <CheckSquare size={14} />,   color: "#22C55E", desc: "Puntaje calculado" },
};

// Espeja GALLERY en la app móvil (features/procedimientos/paso-tipos.ts).
// escaneo, falla_iso14224 y puntuacion existen en el tipo pero no se ofrecen:
// el técnico nunca los ve en el teléfono, así que crearlos desde la web dejaba
// pasos que la app no sabe renderizar. sub_procedimiento también queda fuera,
// igual que en móvil. Mismo orden que las secciones de GALLERY, sin títulos.
// La sección no está: se crea desde la paleta y se dibuja como grupo.
const TIPOS_OFRECIDOS: TipoPasoProc[] = [
  "instruccion", "texto", "numero", "monto", "medidor",
  "fecha", "hora", "fecha_hora",
  "si_no_na", "opcion_multiple", "lista_verificacion", "inspeccion",
  "imagen", "archivo", "firma",
  "advertencia",
];

/**
 * Los pasos son una lista plana: una sección agrupa los pasos que la siguen
 * hasta la próxima sección. Así lo entienden también la ejecución en móvil y
 * en OTDetail, que muestran la sección como un título entre pasos.
 * ponytail: sin marcador de fin, un campo no puede quedar después de una
 * sección sin pertenecer a ella; agregar seccion_id al paso si hace falta.
 */
function agruparPorSeccion(pasos: PasoFormItem[]) {
  const grupos: { seccion: PasoFormItem | null; numero: number; items: { paso: PasoFormItem; idx: number }[] }[] = [];
  let numero = 0;
  pasos.forEach((paso, idx) => {
    if (paso.tipo === "seccion") grupos.push({ seccion: paso, numero: ++numero, items: [] });
    else {
      if (!grupos.length) grupos.push({ seccion: null, numero: 0, items: [] });
      grupos[grupos.length - 1].items.push({ paso, idx });
    }
  });
  return grupos;
}

// Paleta lateral: solo dos bloques. El tipo exacto se elige después con el
// selector dentro de cada tarjeta (patrón MaintainX).
const PALETA: { tipo: TipoPasoProc; label: string; icon: React.ReactNode; color: string }[] = [
  { tipo: "texto",       label: "Campo",      icon: <CirclePlus size={20} />, color: "#10B981" },
  { tipo: "seccion",     label: "Sección",    icon: <Rows2 size={20} />,      color: "var(--brand)" },
];

const MONEDAS = ["CLP", "USD", "EUR", "UF"];

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
    opciones: tipo === "opcion_multiple" ? [""]
      : tipo === "lista_verificacion" || tipo === "inspeccion" ? ["", ""]
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

/**
 * Cambia el tipo de un paso. Conserva lo que escribió el autor (título,
 * descripción) y su condición de visibilidad; el resto vuelve al default del
 * tipo nuevo, si no las opciones de un checklist se guardarían en un campo
 * de texto (procedimientos-api las persiste sin mirar el tipo).
 */
function cambiarTipo(paso: PasoFormItem, tipo: TipoPasoProc): PasoFormItem {
  const next = emptyPaso(tipo);
  return {
    ...next,
    // Entre tipos con opciones (múltiple ↔ checklist ↔ inspección) se conservan.
    opciones: next.opciones.length && paso.opciones.length ? paso.opciones : next.opciones,
    tempId: paso.tempId,
    titulo: paso.titulo,
    descripcion: paso.descripcion,
    condicion_tempid: paso.condicion_tempid,
    condicion_operador: paso.condicion_operador,
    condicion_valor: paso.condicion_valor,
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

/** Tarjeta de ajuste con texto libre: ayuda arriba, campo a lo ancho debajo. */
function TextoSettingCard({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}>
      <p style={{ fontSize: 14, color: "var(--fg-3)", margin: 0, lineHeight: 1.45 }}>{hint}</p>
      {children}
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

function inp(focus = false): React.CSSProperties {
  return {
    width: "100%", height: 36, padding: "0 10px",
    border: `1px solid ${focus ? "var(--brand)" : "var(--border)"}`,
    borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
    background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
    boxShadow: "none",
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
    // Un procedimiento nuevo abre con un campo de texto listo para editar.
    pasos: editId ? [] : [emptyPaso("texto")],
  }));
  const [tab, setTab] = useState<BuilderTab>("campos");
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [expandedPaso, setExpandedPaso] = useState<string | null>(() => form.pasos[0]?.tempId ?? null);
  const [dragTempId, setDragTempId] = useState<string | null>(null);
  const [dragOverTempId, setDragOverTempId] = useState<string | null>(null);
  const [medidores, setMedidores] = useState<MedidorConUltima[]>([]);

  // Campos / Configuración como último crumb del breadcrumb (antes, control
  // segmentado sobre el editor).
  useTopBarVista({
    label: tab === "campos" ? "Campos del procedimiento" : "Configuración",
    opciones: [
      { label: "Campos del procedimiento", icon: <ListChecks size={16} />, onSelect: () => setTab("campos") },
      { label: "Configuración", icon: <Settings size={16} />, onSelect: () => setTab("configuracion") },
    ],
  }, [tab]);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      setWsId(data?.workspace_id ?? null);
      setMyId(user.id);
      // Catálogo para el paso "Medidor": se elige uno existente de /medidores.
      if (data?.workspace_id) fetchMedidores(data.workspace_id).then(setMedidores).catch(() => setMedidores([]));
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
    // Una sección nace con su primer campo adentro, listo para editar.
    if (tipo === "seccion") {
      const n = form.pasos.filter(p => p.tipo === "seccion").length + 1;
      const sec = { ...emptyPaso("seccion"), titulo: `Sección ${n}` };
      const campo = emptyPaso("texto");
      setForm(f => ({ ...f, pasos: [...f.pasos, sec, campo] }));
      setExpandedPaso(campo.tempId);
      return;
    }
    const np = emptyPaso(tipo);
    setForm(f => ({ ...f, pasos: [...f.pasos, np] }));
    setExpandedPaso(np.tempId);
  }

  /** Inserta una copia justo debajo del original y la deja abierta. */
  function duplicarPaso(tempId: string) {
    const i = form.pasos.findIndex(p => p.tempId === tempId);
    if (i < 0) return;
    const copia = { ...form.pasos[i], opciones: [...form.pasos[i].opciones], tempId: Math.random().toString(36).slice(2) };
    setForm(f => {
      const next = [...f.pasos];
      next.splice(i + 1, 0, copia);
      return { ...f, pasos: next };
    });
    setExpandedPaso(copia.tempId);
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
    // Sin medidor vinculado la lectura queda suelta en la respuesta y nunca
    // llega a la serie del medidor (fn_paso_respuesta_a_lectura la ignora).
    if (form.pasos.some(p => p.tipo === "medidor" && !p.medidor_id)) {
      alert("Cada paso de lectura de medidor debe tener un medidor seleccionado. Si aún no existe, créalo primero en Medidores.");
      return;
    }
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

      {/* Acción principal. La pestaña (Campos / Configuración) y volver a la
          biblioteca viven en el breadcrumb del GlobalTopBar. */}
      <div style={{
        padding: "12px 24px", background: "var(--surface-canvas)", flexShrink: 0,
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16,
      }}>

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

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: tab === "campos" ? 1040 : 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Metadata card — pestaña Configuración */}
          {tab === "configuracion" && (
          <>
            {/* Una tarjeta por ajuste, igual que Mi cuenta y Espacio de trabajo. */}
            {/* Nombre y descripción: el título va dentro del campo (placeholder)
                y el campo, a lo ancho debajo de la ayuda; no al costado. */}
            <TextoSettingCard hint="Cómo aparece en la biblioteca y en la OT.">
              <FocusInput
                type="text"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del procedimiento"
                aria-label="Nombre del procedimiento"
                style={{ height: 38 }}
              />
            </TextoSettingCard>

            <TextoSettingCard hint="Qué hay que hacer y con qué objetivo.">
              <FocusTextarea
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Descripción"
                aria-label="Descripción del procedimiento"
                style={{ minHeight: 88 }}
              />
            </TextoSettingCard>

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
                  {agruparPorSeccion(form.pasos).map(g => {
                    const campos = g.items.map(({ paso, idx }) => (
                      <PasoEditor
                        key={paso.tempId}
                        paso={paso}
                        index={idx}
                        total={form.pasos.length}
                        expanded={expandedPaso === paso.tempId}
                        onToggle={() => setExpandedPaso(expandedPaso === paso.tempId ? null : paso.tempId)}
                        onChange={patch => updatePaso(paso.tempId, patch)}
                        onRemove={() => removePaso(paso.tempId)}
                        onDuplicate={() => duplicarPaso(paso.tempId)}
                        medidores={medidores}
                        onMove={dir => movePaso(idx, dir)}
                        onDragStart={() => setDragTempId(paso.tempId)}
                        onDragOver={() => setDragOverTempId(paso.tempId)}
                        onDrop={() => dropPaso(paso.tempId)}
                        dragging={dragTempId === paso.tempId}
                        dragOver={dragOverTempId === paso.tempId && dragTempId !== paso.tempId}
                      />
                    ));
                    if (!g.seccion) return <Fragment key="sin-seccion">{campos}</Fragment>;
                    const sec = g.seccion;
                    return (
                      <SeccionBloque
                        key={sec.tempId}
                        titulo={sec.titulo}
                        descripcion={sec.descripcion}
                        placeholder={`Sección ${g.numero}`}
                        onTitulo={titulo => updatePaso(sec.tempId, { titulo })}
                        onDescripcion={descripcion => updatePaso(sec.tempId, { descripcion })}
                        onRemove={() => removePaso(sec.tempId)}
                      >
                        {campos}
                      </SeccionBloque>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paleta */}
            <div style={{
              width: 92, flexShrink: 0, position: "sticky", top: 0,
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "12px 6px",
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4,
            }}>
              <div style={{ fontSize: 12, color: "var(--fg-4)", textAlign: "center", marginBottom: 4 }}>
                Nuevo
              </div>
              {PALETA.map(p => (
                <button
                  key={p.tipo}
                  onClick={() => addPaso(p.tipo)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: "10px 4px", border: "none", borderRadius: 8,
                    background: "none", cursor: "pointer",
                    fontFamily: "inherit", fontSize: 13, color: "var(--fg-1)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ color: p.color, display: "flex" }}>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Tipo Picker ──────────────────────────────────────────────────────────────

// Mismos tres resultados y colores que PasoInput en OTDetail.tsx.
const RESULTADOS_INSPECCION = [
  { key: "pass", label: "APROBADO", color: "var(--success)" },
  { key: "na",   label: "ALERTA",   color: "var(--warning)" },
  { key: "fail", label: "FALLA",    color: "var(--danger)" },
];

/**
 * Cómo verá el campo el técnico. Copia los estilos de PasoInput (y de
 * NumericInputField, PasoImagenField y SignatureCanvas) en
 * app/(app)/ordenes/OTDetail.tsx, que es la ejecución real en la web: si
 * cambia allá, cambiar aquí.
 *
 * `interactivo` (tarjeta abierta): se puede escribir, marcar y elegir para
 * probar el campo, pero todo vive en estado local y nunca se guarda: al salir
 * o guardar el procedimiento desaparece. En la tarjeta cerrada es solo dibujo
 * (`inert`), porque un clic ahí abre la tarjeta.
 */
function FieldPreview({ paso, interactivo = false }: { paso: PasoFormItem; interactivo?: boolean }) {
  const [texto, setTexto] = useState("");
  const [nombreFirmante, setNombreFirmante] = useState("");
  const [eleccion, setEleccion] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [resultados, setResultados] = useState<Record<string, string>>({});
  const [leido, setLeido] = useState(false);
  const [fechaPrev, setFechaPrev] = useState<Date | undefined>(undefined);
  const [archivoPrev, setArchivoPrev] = useState<File | null>(null);

  const input: React.CSSProperties = {
    width: "100%", height: 40, padding: "0 12px",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)",
    fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)", outline: "none", boxSizing: "border-box",
  };
  const focoAzul = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--brand)"; },
    onBlur: (e: React.FocusEvent<HTMLElement>) => { e.currentTarget.style.borderColor = "var(--border)"; },
  };
  const boton: React.CSSProperties = { fontFamily: "inherit", cursor: "pointer" };
  const fila = (items: { key: string; label: string; color: string }[], actual: string | null | undefined, elegir: (k: string) => void) => (
    <div style={{ display: "flex", gap: 10 }}>
      {items.map(o => {
        const activo = actual === o.key;
        return (
          <button key={o.key} type="button" onClick={() => elegir(o.key)} style={{
            ...boton, flex: 1, minWidth: 0, minHeight: 42, padding: "0 10px", borderRadius: "var(--r-sm)",
            fontSize: 14, color: o.color,
            border: `1px solid ${activo ? o.color : "var(--border)"}`,
            background: activo ? `color-mix(in srgb, ${o.color} 9%, var(--surface-1))` : "var(--surface-1)",
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
  // Sin acción: el técnico sube la foto en la OT, no aquí.
  const zonaImagen = (
    <button type="button" style={{
      ...boton, width: "100%", minHeight: 96, padding: "16px 12px",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
      border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-canvas)",
      fontSize: 14, color: "var(--brand)",
    }}>
      <Camera size={20} />
      Agregar Imágenes/Archivos
    </button>
  );
  const opciones = () => {
    const opts = (paso.opciones ?? []).filter(Boolean);
    const lista = opts.length ? opts : (paso.opciones?.length ? paso.opciones : [""]).map((_, i) => `Opción ${i + 1}`);
    return interactivo ? lista : lista.slice(0, 4);
  };
  const rango = paso.valor_min !== "" && paso.valor_max !== "" ? `(${paso.valor_min} – ${paso.valor_max})` : null;

  let contenido: React.ReactNode;
  switch (paso.tipo) {
    case "seccion":
      contenido = <div style={{ fontSize: 14, color: "var(--fg-3)" }}>{paso.descripcion || "Encabezado de sección"}</div>;
      break;

    case "instruccion":
    case "advertencia": {
      // Mismo botón que PasoInput (y que móvil): a lo ancho, gris hasta
      // confirmar, del color del tipo una vez confirmado.
      const esInstr = paso.tipo === "instruccion";
      const color = TIPO_META[paso.tipo].color;
      contenido = (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!interactivo && paso.descripcion && <div style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.5 }}>{paso.descripcion}</div>}
          <button type="button" onClick={() => setLeido(v => !v)} style={{
            ...boton, width: "100%", minHeight: 42, padding: "0 16px", borderRadius: "var(--r-sm)",
            border: `1px solid ${leido ? color : "var(--border)"}`, background: "var(--surface-1)",
            fontSize: 14, letterSpacing: "0.02em", color: leido ? color : "var(--fg-3)",
          }}>
            {leido ? (esInstr ? "CONFIRMADO" : "LEÍDO") : (esInstr ? "CONFIRMAR LECTURA" : "LEÍDO Y ENTENDIDO")}
          </button>
        </div>
      );
      break;
    }

    case "texto":
      contenido = paso.multilinea
        ? <textarea value={texto} onChange={e => setTexto(e.target.value)} placeholder="Introducir texto" {...focoAzul}
            style={{ ...input, height: "auto", minHeight: 72, padding: "7px 10px", resize: "vertical", lineHeight: 1.5 }} />
        : <input type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Introducir texto" {...focoAzul} style={input} />;
      break;

    case "numero":
    case "monto":
    case "medidor": {
      // Un solo campo con moneda/unidad/rango DENTRO del borde, como NumericInputField.
      const campo = (
        <label style={{ ...input, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", cursor: "text" }}>
          {paso.tipo === "monto" && <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>{paso.moneda || "CLP"}</span>}
          <input
            type="text"
            inputMode="decimal"
            value={texto}
            onChange={e => setTexto(e.target.value.replace(/[^0-9.,-]/g, ""))}
            placeholder={paso.tipo === "monto" ? "Introducir importe" : paso.tipo === "medidor" ? "Lectura" : "Introducir número"}
            onFocus={e => { e.currentTarget.parentElement!.style.borderColor = "var(--brand)"; }}
            onBlur={e => { e.currentTarget.parentElement!.style.borderColor = "var(--border)"; }}
            style={{ flex: 1, minWidth: 0, height: "100%", padding: 0, border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)" }}
          />
          {paso.tipo !== "monto" && paso.unidad && <span style={{ color: "var(--fg-3)", flexShrink: 0 }}>{paso.unidad}</span>}
          {paso.tipo !== "monto" && rango && <span style={{ color: "var(--fg-4)", flexShrink: 0 }}>{rango}</span>}
        </label>
      );
      contenido = paso.tipo === "medidor"
        ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{campo}{zonaImagen}</div>
        : campo;
      break;
    }

    case "fecha":
    case "hora":
    case "fecha_hora":
      // Mismos selectores shadcn que PasoInput en OTDetail.
      contenido = paso.tipo === "fecha"
        ? <DatePicker value={fechaPrev} onChange={setFechaPrev} />
        : paso.tipo === "hora"
          ? <TimePicker value={texto} onChange={setTexto} />
          : <DateTimePicker value={fechaPrev} onChange={setFechaPrev} />;
      break;

    case "si_no_na":
      contenido = fila(["Sí", "No", "N/A"].map(label => ({ key: label, label, color: "var(--brand)" })), eleccion, setEleccion);
      break;

    case "opcion_multiple":
    case "lista_verificacion": {
      const radio = paso.tipo === "opcion_multiple";
      contenido = (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {opciones().map((o, i) => {
            const key = `${i}`;
            const activo = radio ? eleccion === key : marcados.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => radio
                  ? setEleccion(key)
                  : setMarcados(m => m.includes(key) ? m.filter(k => k !== key) : [...m, key])}
                style={{
                  ...boton, minHeight: 34, padding: "4px 2px", display: "flex", alignItems: "center", gap: 10,
                  border: "none", background: "transparent", textAlign: "left", fontSize: 14, color: "var(--fg-1)",
                }}
              >
                {radio ? (
                  <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: "50%", border: `1.5px solid ${activo ? "var(--brand)" : "var(--border-strong)"}`, display: "grid", placeItems: "center", boxSizing: "border-box" }}>
                    {activo && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--brand)" }} />}
                  </span>
                ) : (
                  <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 3, border: `1.5px solid ${activo ? "var(--brand)" : "var(--border-strong)"}`, background: activo ? "var(--brand)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                    {activo && <Check size={12} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
                  </span>
                )}
                {o}
              </button>
            );
          })}
        </div>
      );
      break;
    }

    case "inspeccion":
      contenido = (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(interactivo ? opciones() : opciones().slice(0, 3)).map((item, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10 }}>
              <span style={{ fontSize: 14, color: "var(--fg-1)" }}>{item}</span>
              {fila(RESULTADOS_INSPECCION, resultados[i], k => setResultados(r => ({ ...r, [i]: k })))}
            </div>
          ))}
        </div>
      );
      break;

    case "imagen":
      contenido = zonaImagen;
      break;

    case "archivo":
      // Mismo adjunto que PasoArchivoField en OTDetail. En la vista previa el
      // archivo elegido solo se muestra (tipo · tamaño); nada se sube.
      contenido = (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {archivoPrev && (
            <Attachment
              nombre={archivoPrev.name}
              mime={archivoPrev.type}
              descripcion={[tipoArchivo(archivoPrev.name, archivoPrev.type), tamanoArchivo(archivoPrev.size)].filter(Boolean).join(" · ")}
              onRemove={() => setArchivoPrev(null)}
            />
          )}
          <AttachmentDropzone label={archivoPrev ? "Reemplazar archivo" : "Adjuntar archivo"} onFile={setArchivoPrev} />
        </div>
      );
      break;

    case "firma": {
      const externo = !!paso.rol_firmante && paso.rol_firmante !== "tecnico";
      contenido = (
        <div>
          {externo && (
            <input type="text" value={nombreFirmante} onChange={e => setNombreFirmante(e.target.value)}
              placeholder="Nombre de quien firma" {...focoAzul} style={{ ...input, marginBottom: 8 }} />
          )}
          <button type="button" style={{
            ...boton, width: "100%", minHeight: 96, display: "grid", placeItems: "center",
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-0)",
            fontSize: 14, color: "var(--brand)",
          }}>
            Haz clic aquí para firmar
          </button>
        </div>
      );
      break;
    }

    default:
      contenido = <input type="text" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Respuesta del técnico" {...focoAzul} style={input} />;
  }

  return interactivo ? <div>{contenido}</div> : <div inert>{contenido}</div>;
}

/**
 * Sección: línea de tiempo a la izquierda (ícono → línea → rombo) y sus campos
 * a la derecha, con el título editable en el lugar (patrón MaintainX).
 * Eliminarla borra solo el encabezado: sus campos pasan al grupo anterior.
 */
/** Línea de tiempo vertical: ícono en círculo → línea → rombo. */
function Riel({ icon, size = 32, apagado = false }: { icon: React.ReactNode; size?: number; apagado?: boolean }) {
  // `apagado`: gris claro (sección en reposo); oscuro al editarla.
  const color = apagado ? "var(--border-strong)" : "var(--fg-3)";
  return (
    <div style={{ width: size, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: color, color: apagado ? "var(--fg-3)" : "var(--surface-1)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s",
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, width: 2, minHeight: 12, background: color }} />
      <span style={{ width: 8, height: 8, flexShrink: 0, background: color, transform: "rotate(45deg)", marginTop: -4 }} />
    </div>
  );
}

/**
 * Sección (patrón MaintainX). En reposo: título en negrita y la descripción
 * como texto; al pasar el mouse aparece un lápiz. Al hacer clic en el título o
 * el lápiz se edita: título con línea debajo y descripción en un cuadro. Se
 * sale de la edición cuando el foco deja la sección.
 */
function SeccionBloque({ titulo, descripcion, placeholder, onTitulo, onDescripcion, onRemove, children }: {
  titulo: string;
  descripcion: string;
  placeholder: string;
  onTitulo: (titulo: string) => void;
  onDescripcion: (descripcion: string) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
      <Riel icon={<Rows2 size={15} />} apagado={!editando} />

      <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setEditando(false); }}
          style={{ marginBottom: 12 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 38 }}>
            {editando ? (
              <input
                autoFocus
                value={titulo}
                onChange={e => onTitulo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder={placeholder}
                aria-label="Título de la sección"
                style={{
                  flex: 1, minWidth: 0, height: 38, padding: 0,
                  fontSize: 18, fontWeight: 500, color: "var(--fg-1)", fontFamily: "inherit",
                  background: "transparent", border: "none", borderBottom: "1px solid var(--brand)",
                  borderRadius: 0, outline: "none",
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  style={{
                    minWidth: 0, padding: 0, background: "none", border: "none", cursor: "text",
                    fontFamily: "inherit", fontSize: 18, fontWeight: 600, textAlign: "left",
                    color: titulo ? "var(--fg-1)" : "var(--fg-4)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {titulo || placeholder}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  aria-label="Editar sección"
                  style={{
                    ...footerBtn, width: 28, height: 28,
                    // Visible al pasar el mouse; por teclado aparece al enfocarlo.
                    opacity: hover ? 1 : 0,
                  }}
                  onFocus={e => { e.currentTarget.style.opacity = "1"; }}
                  onBlur={e => { if (!hover) e.currentTarget.style.opacity = "0"; }}
                >
                  <Pencil size={15} />
                </button>
              </>
            )}
            {/* Espaciador solo en reposo: editando, el input (flex 1) ocupa
                todo el ancho y su línea azul llega hasta el menú. */}
            {!editando && <span style={{ flex: 1 }} />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" style={{ ...footerBtn, color: "var(--fg-2)" }} aria-label="Opciones de la sección">
                  <EllipsisVertical size={16} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onRemove} style={{ fontSize: 14, color: "var(--danger)" }}>
                  Eliminar sección
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Descripción opcional: el técnico la ve bajo el título de la
              sección (móvil y OTDetail ya la muestran). */}
          {editando ? (
            <FocusTextarea
              value={descripcion}
              onChange={e => onDescripcion(e.target.value)}
              placeholder="Agregar una descripción (opcional)"
              aria-label="Descripción de la sección"
              style={{ minHeight: 56, marginTop: 12 }}
            />
          ) : descripcion ? (
            <p style={{ fontSize: 14, color: "var(--fg-2)", margin: "4px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{descripcion}</p>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Selector de tipo con ícono. Mismo aspecto que SearchSelect
 * (components/ot/OTFormFields.tsx) pero sin búsqueda ni "Sin asignar": un
 * paso siempre tiene tipo y la lista es corta.
 */
function TipoSelect({ value, onChange }: { value: TipoPasoProc; onChange: (t: TipoPasoProc) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Abierto al final de un formulario con scroll, el panel quedaba bajo el
  // borde: se lleva a la vista (solo lo necesario; si ya se ve, no se mueve).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);
  const meta = TIPO_META[value];
  // Un paso legacy con un tipo fuera de la galería conserva su opción.
  const tipos = TIPOS_OFRECIDOS.includes(value) ? TIPOS_OFRECIDOS : [value, ...TIPOS_OFRECIDOS];

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const iconChip = (t: TipoPasoProc) => (
    <span style={{
      width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: TIPO_META[t].color,
      background: `color-mix(in srgb, ${TIPO_META[t].color} 14%, transparent)`,
    }}>
      {TIPO_META[t].icon}
    </span>
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          ...inp(open), display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer", textAlign: "left",
        }}
      >
        {iconChip(value)}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.label}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>

      {open && (
        <div ref={panelRef} role="listbox" className="scroll-visible" style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 50,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", maxHeight: 280, overflowY: "auto", padding: "4px 0",
        }}>
          {tipos.map(t => {
            const selected = t === value;
            return (
              <button
                key={t}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { if (!selected) onChange(t); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                  padding: "7px 12px", fontSize: 14, color: "var(--fg-1)", fontFamily: "inherit",
                  background: selected ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "transparent"; }}
              >
                {iconChip(t)}
                <span style={{ flex: 1 }}>{TIPO_META[t].label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PasoEditor({
  paso, index, total, expanded, onToggle, onChange, onRemove, onDuplicate, medidores, onMove,
  onDragStart, onDragOver, onDrop, dragging, dragOver,
}: {
  paso: PasoFormItem;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<PasoFormItem>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  medidores: MedidorConUltima[];
  onMove: (dir: 1 | -1) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  dragging: boolean;
  dragOver: boolean;
}) {
  const meta = TIPO_META[paso.tipo];
  const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia" || paso.tipo === "seccion";
  const cardRef = useRef<HTMLDivElement>(null);
  const [conDescripcion, setConDescripcion] = useState(false);
  const mostrarDescripcion = conDescripcion || !!paso.descripcion;

  // Abierta, la tarjeta no muestra la vista previa (que era donde se hacía
  // clic para cerrarla): se cierra al hacer clic fuera de ella. El menú ⋮
  // se renderiza en un portal fuera de la tarjeta, así que no cuenta.
  useEffect(() => {
    if (!expanded) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Element;
      if (cardRef.current?.contains(t) || t.closest?.('[role="menu"]')) return;
      // Un clic en la barra de scroll del contenedor también es un mousedown
      // "afuera": cae más allá del área de contenido (clientWidth/Height) del
      // elemento. Arrastrar el scroll no debe cerrar la tarjeta.
      // Solo en elementos que de verdad scrollean: un <span> en línea tiene
      // clientWidth 0 y si no, cualquier clic sobre texto contaría como barra.
      if (
        t instanceof HTMLElement && t.clientWidth > 0 &&
        ((t.scrollHeight > t.clientHeight && e.offsetX >= t.clientWidth) ||
         (t.scrollWidth > t.clientWidth && e.offsetY >= t.clientHeight))
      ) return;
      onToggle();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [expanded, onToggle]);

  return (
    <div
      ref={cardRef}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDrop={e => { e.preventDefault(); onDrop(); }}
      style={{
        border: `1px solid ${expanded ? "var(--brand)" : dragOver ? "var(--brand)" : "var(--border)"}`,
        borderRadius: 10, background: "var(--surface-1)",
        opacity: dragging ? 0.45 : 1,
        boxShadow: "none",
        transition: "border-color 0.12s, opacity 0.12s",
      }}>
      {/* Colapsado: vista previa de cómo verá el campo el técnico, con el
          asa de arrastre a la izquierda. Al seleccionarlo aparece la
          configuración en su lugar (patrón MaintainX). */}
      {!expanded && (
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 16px",
          cursor: "pointer", userSelect: "none",
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
            {/* Wrap a 2 líneas en vez de truncar: los títulos de pauta real
                ("Cable de poder y conectores en buen estado") no caben en una
                sola y el ellipsis escondía justo la parte que los distingue. */}
            <span style={{
              fontSize: 14, fontWeight: 400, lineHeight: 1.35,
              color: paso.titulo ? "var(--fg-1)" : "var(--fg-4)",
              overflow: "hidden", overflowWrap: "anywhere",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {paso.titulo || meta.label}
            </span>
            {paso.requerido && paso.tipo !== "seccion" && (
              <span style={{ fontSize: 14, color: "var(--danger)" }}>*</span>
            )}
            <span style={{ marginLeft: "auto", color: meta.color, display: "flex", flexShrink: 0 }}>
              {meta.icon}
            </span>
          </div>
          <FieldPreview paso={paso} />
        </div>
      </div>
      )}

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: "14px 14px 16px", minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>

            {/* Title + tipo */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
             <div style={{ minWidth: 0 }}>
              <FocusInput
                type="text"
                value={paso.titulo}
                onChange={e => onChange({ titulo: e.target.value })}
                placeholder={isInfoOnly ? "Título del bloque" : "Nombre del campo"}
              />
             </div>
             <div style={{ minWidth: 0 }}>
              <TipoSelect value={paso.tipo} onChange={t => onChange(cambiarTipo(paso, t))} />
             </div>
            </div>

            {/* Description — opcional en todos los tipos: se abre desde el menú ⋮
                (o aparece sola si el paso ya trae una). */}
            {mostrarDescripcion && (
            <div>
              <FocusTextarea
                value={paso.descripcion}
                onChange={e => onChange({ descripcion: e.target.value })}
                placeholder={
                  isInfoOnly
                    ? "Contenido / texto informativo para el técnico…"
                    : "Descripción / instrucción (opcional)…"
                }
              />
            </div>
            )}

            {/* Tipo-specific config */}

            {paso.tipo === "numero" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div>
                  <FocusInput type="text" value={paso.unidad} onChange={e => onChange({ unidad: e.target.value })} placeholder="Unidad (V, A, °C…)" />
                </div>
                <div>
                  <FocusInput type="number" value={paso.valor_min} onChange={e => onChange({ valor_min: e.target.value })} placeholder="Mín (opcional)" />
                </div>
                <div>
                  <FocusInput type="number" value={paso.valor_max} onChange={e => onChange({ valor_max: e.target.value })} placeholder="Máx (opcional)" />
                </div>
              </div>
            )}

            {paso.tipo === "monto" && (
              <div>
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


            {/* Medidor: se elige uno de /medidores, no se define aquí. La
                unidad, los umbrales y las OTs que dispara viven en el medidor;
                el paso solo copia la unidad para mostrarla al técnico. */}
            {paso.tipo === "medidor" && (
              medidores.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
                  No hay medidores en este espacio de trabajo.{" "}
                  <Link href="/medidores" style={{ color: "var(--brand)", textDecoration: "none" }}>Créalo en Medidores</Link>
                  {" "}y luego selecciónalo aquí.
                </div>
              ) : (
                <SearchSelect
                  placeholder="Selecciona un medidor *"
                  value={paso.medidor_id ?? ""}
                  options={medidores.map(m => ({
                    id: m.id,
                    label: `${[m.nombre, m.activo_nombre].filter(Boolean).join(" · ")} (${m.unidad})`,
                  }))}
                  onChange={id => {
                    const m = medidores.find(x => x.id === id);
                    onChange({
                      medidor_id: m?.id ?? null,
                      unidad: m?.unidad ?? "",
                      titulo: paso.titulo || m?.nombre || "",
                    });
                  }}
                />
              )
            )}






            {/* Vista previa al final: primero se configura el campo, después se
                ve cómo le quedará al técnico (igual que en la tarjeta cerrada). */}
            {/* Sección propia con la misma línea de tiempo que las secciones. */}
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <Riel icon={<Eye size={16} />} size={28} />
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, paddingBottom: 6 }}>
                <div style={{ minHeight: 28, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>Vista previa</div>
                  <div style={{ fontSize: 14, lineHeight: 1.45, color: "var(--fg-3)" }}>
                    Así verá este campo el técnico en la OT. Puedes probarlo: lo que escribas o marques aquí no se guarda.
                  </div>
                </div>
                <FieldPreview paso={paso} interactivo />
              </div>
            </div>

            {/* Footer (patrón MaintainX): acciones a la derecha · divisor ·
                Requerido + menú ⋮. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
              {/* Ajuste propio del tipo, a la izquierda. */}
              {paso.tipo === "texto" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: "auto" }}>
                  <ProcSwitch checked={paso.multilinea} onChange={v => onChange({ multilinea: v })} label="Texto multilínea" />
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Texto multilínea</span>
                </div>
              )}
              {index > 0 && (
                <button type="button" onClick={() => onMove(-1)} style={footerBtn} title="Subir" aria-label="Subir">
                  <ChevronUp size={16} />
                </button>
              )}
              {index < total - 1 && (
                <button type="button" onClick={() => onMove(1)} style={footerBtn} title="Bajar" aria-label="Bajar">
                  <ChevronDown size={16} />
                </button>
              )}
              <AyudaTipo tipo={paso.tipo} />
              <button type="button" onClick={onRemove} style={footerBtn} title="Eliminar" aria-label="Eliminar">
                <Trash2 size={16} />
              </button>
              <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 6px" }} />
              {/* Requerido también en instrucción/advertencia: obliga a confirmar lectura. */}
              {paso.tipo !== "seccion" && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 2 }}>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Requerido</span>
                  <ProcSwitch checked={paso.requerido} onChange={v => onChange({ requerido: v })} label="Campo requerido" />
                </div>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" style={{ ...footerBtn, color: "var(--fg-2)" }} aria-label="Más opciones">
                    <EllipsisVertical size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {!mostrarDescripcion ? (
                    <DropdownMenuItem onSelect={() => setConDescripcion(true)} style={{ fontSize: 14 }}>
                      Agregar descripción
                    </DropdownMenuItem>
                  ) : (
                    // Borra el texto: si no, la descripción reaparecería sola
                    // (se muestra siempre que el paso traiga una).
                    <DropdownMenuItem
                      onSelect={() => { onChange({ descripcion: "" }); setConDescripcion(false); }}
                      style={{ fontSize: 14 }}
                    >
                      Quitar descripción
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={onDuplicate} style={{ fontSize: 14 }}>
                    Duplicar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ⓘ del pie de la tarjeta: al pasar el mouse (o enfocar con teclado) explica
 * qué hace el tipo y cómo lo usa el técnico. Vive dentro de la tarjeta, sin
 * portal, para no gatillar el cierre por clic afuera.
 */
function AyudaTipo({ tipo }: { tipo: TipoPasoProc }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const m = TIPO_META[tipo];
  return (
    <span
      style={{ position: "relative", display: "flex" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        style={footerBtn}
        aria-label={`Qué hace: ${m.label}`}
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Info size={16} />
      </button>
      {open && (
        <span id={id} role="tooltip" style={{
          // Hacia abajo: hacia arriba lo recortaba el contenedor con scroll
          // cuando la tarjeta estaba arriba de todo.
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 260,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", padding: "10px 12px",
          fontSize: 13, lineHeight: 1.45, color: "var(--fg-2)", textAlign: "left",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>
            <span style={{ display: "flex", color: m.color }}>{m.icon}</span>
            {m.label}
          </span>
          {m.desc}
        </span>
      )}
    </span>
  );
}

const footerBtn: React.CSSProperties = {
  width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--brand)",
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
          fontSize: 14, color: "var(--brand)", fontFamily: "inherit",
        }}
      >
        <Plus size={12} />
        Agregar opción (Enter)
      </button>
    </div>
  );
}
