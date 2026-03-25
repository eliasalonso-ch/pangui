"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, Repeat, ClipboardCheck,
  ChevronDown, ChevronUp, Minus, AlertTriangle,
  CircleDot, PauseCircle, PlayCircle, ListPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const ESTADO_COLOR = {
  pendiente: { bg: "#EFF6FF", text: "#3B82F6" },
  en_espera: { bg: "#FFFBEB", text: "#D97706" },
  en_curso:  { bg: "#EEF2FF", text: "#6366F1" },
};
const TIPO_TRABAJO_LABEL = { reactiva: "Reactiva", preventiva: "Preventiva", inspeccion: "Inspección", mejora: "Mejora" };
const RECURRENCIA_LABEL = {
  ninguna: "Sin recurrencia", diaria: "Diaria", semanal: "Semanal",
  mensual_fecha: "Mensual (por fecha)", mensual_dia: "Mensual (por día)", anual: "Anual",
};

const PRIORIDADES = [
  { value: "baja",    label: "Baja",    Icon: ChevronDown,   color: "#9CA3AF" },
  { value: "media",   label: "Media",   Icon: Minus,         color: "#3B82F6" },
  { value: "alta",    label: "Alta",    Icon: ChevronUp,     color: "#F97316" },
  { value: "urgente", label: "Urgente", Icon: AlertTriangle, color: "#EF4444" },
];
const ESTADOS = [
  { value: "pendiente", label: "Abierta",   Icon: CircleDot },
  { value: "en_espera", label: "En espera", Icon: PauseCircle },
  { value: "en_curso",  label: "En curso",  Icon: PlayCircle },
];

export default function EditOrden() {
  const { id }  = useParams();
  const router  = useRouter();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);
  const [plantaId, setPlantaId] = useState(null);
  const [myId,     setMyId]     = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const [ubicaciones, setUbicaciones] = useState([]);
  const [activos,     setActivos]     = useState([]);
  const [categorias,  setCategorias]  = useState([]);
  const [plantillas,  setPlantillas]  = useState([]);
  const [showNuevUbic,   setShowNuevUbic]   = useState(false);
  const [showNuevActivo, setShowNuevActivo] = useState(false);

  const [form, setForm] = useState({
    titulo: "", descripcion: "", tipo_trabajo: "reactiva",
    prioridad: "media", estado: "pendiente",
    ubicacion_id: "", activo_id: "", categoria_id: "",
    fecha_inicio: "", fecha_termino: "",
    tiempo_estimado_h: "", tiempo_estimado_m: "",
    recurrencia: "ninguna", plantilla_id: "",
    partes: [],
    nueva_ubicacion: "", nuevo_activo: "",
  });

  function setF(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);

      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) return;
      setPlantaId(perfil.workspace_id);

      const [
        { data: orden },
        { data: ubics },
        { data: acts },
        { data: cats },
        { data: plans },
      ] = await Promise.all([
        sb.from("ordenes_trabajo").select("*").eq("id", id).maybeSingle(),
        sb.from("ubicaciones").select("id, edificio, piso, detalle").eq("workspace_id", perfil.workspace_id).eq("activa", true),
        sb.from("activos").select("id, nombre, codigo").eq("workspace_id", perfil.workspace_id).eq("activo", true),
        sb.from("categorias_ot").select("id, nombre").or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`).order("nombre"),
        sb.from("plantillas_procedimiento").select("id, nombre").eq("workspace_id", perfil.workspace_id).order("nombre"),
      ]);

      if (!orden) { router.push("/ordenes"); return; }

      setUbicaciones(ubics ?? []);
      setActivos(acts ?? []);
      setCategorias(cats ?? []);
      setPlantillas(plans ?? []);

      const minTotal = orden.tiempo_estimado ?? 0;
      const partes = Array.isArray(orden.partes_requeridas) ? orden.partes_requeridas
        : (typeof orden.partes_requeridas === "string" ? JSON.parse(orden.partes_requeridas || "[]") : []);

      setForm({
        titulo:            orden.titulo ?? "",
        descripcion:       orden.descripcion ?? "",
        tipo_trabajo:      orden.tipo_trabajo ?? "reactiva",
        prioridad:         orden.prioridad ?? "media",
        estado:            orden.estado ?? "pendiente",
        ubicacion_id:      orden.ubicacion_id ?? "",
        activo_id:         orden.activo_id ?? "",
        categoria_id:      orden.categoria_id ?? "",
        fecha_inicio:      orden.fecha_inicio ? orden.fecha_inicio.slice(0, 10) : "",
        fecha_termino:     orden.fecha_termino ? orden.fecha_termino.slice(0, 10) : "",
        tiempo_estimado_h: minTotal ? String(Math.floor(minTotal / 60)) : "",
        tiempo_estimado_m: minTotal ? String(minTotal % 60) : "",
        recurrencia:       orden.recurrencia ?? "ninguna",
        plantilla_id:      orden.plantilla_id ?? "",
        partes,
        nueva_ubicacion: "",
        nuevo_activo: "",
      });

      // Auto-expand details if any secondary field has a non-default value
      const hasDetails = orden.ubicacion_id || orden.activo_id || orden.fecha_inicio ||
        orden.fecha_termino || orden.tiempo_estimado || orden.recurrencia !== "ninguna" ||
        orden.plantilla_id || partes.length > 0;
      if (hasDetails) setShowDetails(true);

      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function crearUbicacion() {
    const nombre = form.nueva_ubicacion.trim();
    if (!nombre) return;
    const sb = createClient();
    const { data } = await sb.from("ubicaciones").insert({ workspace_id: plantaId, edificio: nombre, activa: true }).select("id, edificio, piso, detalle").single();
    if (data) { setUbicaciones(p => [...p, data]); setF("ubicacion_id", data.id); setF("nueva_ubicacion", ""); setShowNuevUbic(false); }
  }

  async function crearActivo() {
    const nombre = form.nuevo_activo.trim();
    if (!nombre) return;
    const sb = createClient();
    const { data } = await sb.from("activos").insert({ workspace_id: plantaId, nombre, activo: true }).select("id, nombre, codigo").single();
    if (data) { setActivos(p => [...p, data]); setF("activo_id", data.id); setF("nuevo_activo", ""); setShowNuevActivo(false); }
  }

  function addParte() { setF("partes", [...form.partes, { nombre: "", cantidad: 1, unidad: "un" }]); }
  function setParte(i, key, val) { setF("partes", form.partes.map((p, idx) => idx === i ? { ...p, [key]: val } : p)); }
  function removeParte(i) { setF("partes", form.partes.filter((_, idx) => idx !== i)); }

  async function guardar() {
    if (!form.titulo.trim()) { setError("Escribe un título para la orden."); return; }
    setSaving(true);
    setError(null);
    const sb = createClient();
    const tiempoMin = ((parseInt(form.tiempo_estimado_h) || 0) * 60) + (parseInt(form.tiempo_estimado_m) || 0) || null;

    const { error: updateError } = await sb.from("ordenes_trabajo").update({
      titulo:            form.titulo.trim() || null,
      descripcion:       form.descripcion.trim(),
      tipo_trabajo:      form.tipo_trabajo || null,
      estado:            form.estado,
      prioridad:         form.prioridad,
      ubicacion_id:      form.ubicacion_id || null,
      activo_id:         form.activo_id || null,
      categoria_id:      form.categoria_id || null,
      fecha_inicio:      form.fecha_inicio || null,
      fecha_termino:     form.fecha_termino || null,
      tiempo_estimado:   tiempoMin,
      recurrencia:       form.recurrencia,
      plantilla_id:      form.plantilla_id || null,
      partes_requeridas: JSON.stringify(form.partes),
    }).eq("id", id);

    if (updateError) { setError(updateError.message); setSaving(false); return; }

    try {
      await sb.from("comentarios_orden").insert({
        orden_id: id, planta_id: plantaId, usuario_id: myId, tipo: "sistema", contenido: "Orden editada",
      });
    } catch { /* graceful */ }

    router.push(`/ordenes/${id}`);
  }

  if (loading) return <div className={styles.loading}>Cargando…</div>;

  return (
    <main className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.headerTitle}>Editar orden</h1>
      </div>

      <div className={styles.body}>

        {/* ── Título ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Título</p>
          <input
            className={styles.titleInput}
            placeholder="Ej: Cambio de luminarias pasillo 3"
            value={form.titulo}
            onChange={(e) => setF("titulo", e.target.value)}
          />
        </div>

        {/* ── Estado ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Estado</p>
          <div className={styles.statusBtnsRow}>
            {ESTADOS.map(({ value, label, Icon }) => {
              const col = ESTADO_COLOR[value] ?? { bg: "#F3F4F6", text: "#6B7280" };
              const active = form.estado === value;
              return (
                <button key={value} type="button"
                  className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
                  style={active ? { background: col.bg, color: col.text, borderColor: col.text } : {}}
                  onClick={() => setF("estado", value)}>
                  <Icon size={15} /><span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Prioridad ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Prioridad</p>
          <div className={styles.priorityRow}>
            {PRIORIDADES.map(({ value, label, Icon, color }) => {
              const active = form.prioridad === value;
              return (
                <button key={value} type="button"
                  className={`${styles.prioBtn} ${active ? styles.prioBtnActive : ""}`}
                  style={active ? { color, borderColor: color, background: `${color}18` } : {}}
                  onClick={() => setF("prioridad", value)}>
                  <Icon size={15} />
                  <span className={styles.prioBtnLabel}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Categoría ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Categoría</p>
          <select className={styles.formSelect} value={form.categoria_id} onChange={(e) => setF("categoria_id", e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        {/* ── Descripción ── */}
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Descripción</p>
          <textarea className={styles.formTextarea} rows={3}
            placeholder="Describe el trabajo a realizar…"
            value={form.descripcion}
            onChange={(e) => setF("descripcion", e.target.value)} />
        </div>

        {/* ── Más detalles toggle ── */}
        <button
          type="button"
          className={styles.detailsToggle}
          onClick={() => setShowDetails(v => !v)}
        >
          <ListPlus size={16} />
          <span>{showDetails ? "Ocultar detalles adicionales" : "Más detalles"}</span>
          {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showDetails && (
          <div className={styles.detailsSection}>

            {/* Tipo de trabajo */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Tipo de trabajo</p>
              <div className={styles.pillToggle}>
                {["reactiva","preventiva","inspeccion","mejora"].map((t) => (
                  <button key={t} type="button"
                    className={`${styles.pillToggleBtn} ${form.tipo_trabajo === t ? styles.pillToggleBtnActive : ""}`}
                    onClick={() => setF("tipo_trabajo", t)}>
                    {TIPO_TRABAJO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Ubicación */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Ubicación</p>
              <div className={styles.fieldWithAction}>
                <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => setF("ubicacion_id", e.target.value)}>
                  <option value="">Sin ubicación</option>
                  {ubicaciones.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.edificio}{u.piso ? ` · Piso ${u.piso}` : ""}{u.detalle ? ` · ${u.detalle}` : ""}
                    </option>
                  ))}
                </select>
                <button className={styles.addInlineBtn} onClick={() => setShowNuevUbic(v => !v)} title="Nueva ubicación">
                  <Plus size={14} />
                </button>
              </div>
              {showNuevUbic && (
                <div className={styles.inlineAddRow}>
                  <input className={styles.formInput} placeholder="Nombre de la ubicación"
                    value={form.nueva_ubicacion} onChange={(e) => setF("nueva_ubicacion", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && crearUbicacion()} />
                  <button className={styles.btnSm} onClick={crearUbicacion}>Agregar</button>
                </div>
              )}
            </div>

            {/* Activo */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Activo / Equipo</p>
              <div className={styles.fieldWithAction}>
                <select className={styles.formSelect} value={form.activo_id} onChange={(e) => setF("activo_id", e.target.value)}>
                  <option value="">Sin activo</option>
                  {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.codigo ? ` (${a.codigo})` : ""}</option>)}
                </select>
                <button className={styles.addInlineBtn} onClick={() => setShowNuevActivo(v => !v)} title="Nuevo activo">
                  <Plus size={14} />
                </button>
              </div>
              {showNuevActivo && (
                <div className={styles.inlineAddRow}>
                  <input className={styles.formInput} placeholder="Nombre del equipo o activo"
                    value={form.nuevo_activo} onChange={(e) => setF("nuevo_activo", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && crearActivo()} />
                  <button className={styles.btnSm} onClick={crearActivo}>Agregar</button>
                </div>
              )}
            </div>

            {/* Fechas */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Fechas</p>
              <div className={styles.dateRow}>
                <div className={styles.dateField}>
                  <span className={styles.dateLabel}>Inicio</span>
                  <input type="date" className={styles.formInput}
                    value={form.fecha_inicio} onChange={(e) => setF("fecha_inicio", e.target.value)} />
                </div>
                <div className={styles.dateField}>
                  <span className={styles.dateLabel}>Límite</span>
                  <input type="date" className={styles.formInput}
                    value={form.fecha_termino} onChange={(e) => setF("fecha_termino", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Tiempo estimado */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}>Tiempo estimado</p>
              <div className={styles.tiempoRow}>
                <input type="number" min="0" className={styles.formInputSm} placeholder="0"
                  value={form.tiempo_estimado_h} onChange={(e) => setF("tiempo_estimado_h", e.target.value)} />
                <span className={styles.tiempoUnit}>h</span>
                <input type="number" min="0" max="59" className={styles.formInputSm} placeholder="0"
                  value={form.tiempo_estimado_m} onChange={(e) => setF("tiempo_estimado_m", e.target.value)} />
                <span className={styles.tiempoUnit}>min</span>
              </div>
            </div>

            {/* Recurrencia */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}><Repeat size={12} style={{ marginRight: 5, verticalAlign: "middle" }} />Recurrencia</p>
              <select className={styles.formSelect} value={form.recurrencia} onChange={(e) => setF("recurrencia", e.target.value)}>
                {Object.entries(RECURRENCIA_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Plantilla */}
            <div className={styles.section}>
              <p className={styles.sectionLabel}><ClipboardCheck size={12} style={{ marginRight: 5, verticalAlign: "middle" }} />Plantilla de procedimiento</p>
              <select className={styles.formSelect} value={form.plantilla_id} onChange={(e) => setF("plantilla_id", e.target.value)}>
                <option value="">Sin plantilla</option>
                {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>

            {/* Repuestos */}
            <div className={styles.section}>
              <div className={styles.sectionHeaderRow}>
                <p className={styles.sectionLabel}>Repuestos requeridos</p>
                <button className={styles.addLinkBtn} onClick={addParte}><Plus size={13} /> Agregar</button>
              </div>
              {form.partes.length > 0 && (
                <div className={styles.partesList}>
                  {form.partes.map((p, i) => (
                    <div key={i} className={styles.parteRow}>
                      <input className={styles.formInputFlex} placeholder="Nombre del repuesto"
                        value={p.nombre} onChange={(e) => setParte(i, "nombre", e.target.value)} />
                      <input type="number" min="1" className={styles.formInputSm2}
                        value={p.cantidad} onChange={(e) => setParte(i, "cantidad", e.target.value)} />
                      <select className={styles.formSelectSm} value={p.unidad} onChange={(e) => setParte(i, "unidad", e.target.value)}>
                        <option value="un">un</option>
                        <option value="kg">kg</option>
                        <option value="m">m</option>
                        <option value="lt">lt</option>
                        <option value="caja">caja</option>
                      </select>
                      <button className={styles.removeBtn} onClick={() => removeParte(i)}><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {error && <p className={styles.formError}>{error}</p>}

      </div>

      {/* Sticky footer */}
      <div className={styles.actionBar}>
        <button className={styles.btnGhost} onClick={() => router.back()} disabled={saving}>
          Cancelar
        </button>
        <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </main>
  );
}
