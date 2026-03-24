"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Zap, Clock, ChevronDown, Minus, ChevronUp, AlertTriangle,
  ClipboardCheck, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import PlanGate from "@/components/PlanGate";
import styles from "./page.module.css";

const FREQ_LABEL = {
  7:   "Cada semana",
  14:  "Cada 2 semanas",
  30:  "Mensual",
  60:  "Cada 2 meses",
  90:  "Trimestral",
  180: "Semestral",
  365: "Anual",
};

const TIPO_TRABAJO_LABEL = {
  reactiva:   "Reactiva",
  preventiva: "Preventiva",
  inspeccion: "Inspección",
  mejora:     "Mejora",
};

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts + "T00:00:00").toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function daysDiff(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha + "T00:00:00");
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.ceil((d - hoy) / 86400000);
}

function emptyForm() {
  return {
    titulo:           "",
    descripcion:      "",
    ubicacion_id:     "",
    activo_id:        "",
    categoria_id:     "",
    tipo_trabajo:     "preventiva",
    prioridad:        "media",
    tiempo_estimado_h: "",
    tiempo_estimado_m: "",
    frecuencia_dias:  30,
    proxima_fecha:    "",
    pauta_id:         "",
    partes:           [],
    activo:           true,
  };
}

export default function PreventivosPage() {
  const router = useRouter();
  const [preventivos, setPreventivos] = useState([]);
  const [ubicaciones,  setUbicaciones]  = useState([]);
  const [activos,      setActivos]      = useState([]);
  const [categorias,   setCategorias]   = useState([]);
  const [pautas,       setPautas]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [plantaId,     setPlantaId]     = useState(null);
  const [myId,         setMyId]         = useState(null);
  const [plan,         setPlan]         = useState(null);
  const [planStatus,   setPlanStatus]   = useState(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editItem,  setEditItem]  = useState(null);
  const [form,      setFormState] = useState(emptyForm());
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState(null);
  const [partes,    setPartesState] = useState([]);

  const [delItem,   setDelItem]   = useState(null);
  const [genSuccess, setGenSuccess] = useState(null); // { id, titulo }

  function setF(key, val) { setFormState((f) => ({ ...f, [key]: val })); }
  function addParte() { setPartesState((p) => [...p, { nombre: "", cantidad: 1, unidad: "un" }]); }
  function setParte(i, key, val) { setPartesState((p) => { const n = [...p]; n[i] = { ...n[i], [key]: val }; return n; }); }
  function removeParte(i) { setPartesState((p) => p.filter((_, idx) => idx !== i)); }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);

      let perfil = getPerfilCache(user.id);
      if (!perfil || !perfil.workspace_id) {
        const { data } = await supabase.from("usuarios").select("workspace_id, rol, nombre, plan, plan_status").eq("id", user.id).maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);
      const pid = perfil?.workspace_id;
      if (!pid) return;
      setPlantaId(pid);

      const results = await Promise.allSettled([
        supabase.from("preventivos")
          .select("*, ubicaciones(edificio, piso), activos(nombre,codigo)")
          .eq("workspace_id", pid).order("proxima_fecha", { ascending: true }),
        supabase.from("ubicaciones").select("id, edificio, piso, detalle").eq("workspace_id", pid).eq("activa", true).order("edificio"),
        supabase.from("activos").select("id, nombre, codigo").eq("workspace_id", pid).eq("activo", true).order("nombre"),
        supabase.from("categorias_ot").select("id, nombre").or(`workspace_id.is.null,workspace_id.eq.${pid}`).order("nombre"),
        supabase.from("plantillas_procedimiento").select("id, nombre").eq("workspace_id", pid).order("nombre"),
      ]);

      const val = (r) => r.status === "fulfilled" ? r.value?.data : null;
      setPreventivos(val(results[0]) ?? []);
      setUbicaciones(val(results[1]) ?? []);
      setActivos(val(results[2]) ?? []);
      setCategorias(val(results[3]) ?? []);
      setPautas(val(results[4]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function openCreate() {
    setEditItem(null);
    setFormState(emptyForm());
    setPartesState([]);
    setFormErr(null);
    setPanelOpen(true);
  }

  function openEdit(p) {
    setEditItem(p);
    let partesArr = [];
    try { partesArr = typeof p.partes_requeridas === "string" ? JSON.parse(p.partes_requeridas || "[]") : (p.partes_requeridas ?? []); } catch {}
    setFormState({
      titulo:            p.titulo ?? "",
      descripcion:       p.descripcion ?? "",
      ubicacion_id:      p.ubicacion_id ?? "",
      activo_id:         p.activo_id ?? "",
      categoria_id:      p.categoria_id ?? "",
      tipo_trabajo:      p.tipo_trabajo ?? "preventiva",
      prioridad:         p.prioridad ?? "media",
      tiempo_estimado_h: p.tiempo_estimado ? String(Math.floor(p.tiempo_estimado / 60)) : "",
      tiempo_estimado_m: p.tiempo_estimado ? String(p.tiempo_estimado % 60) : "",
      frecuencia_dias:   p.frecuencia_dias ?? 30,
      proxima_fecha:     p.proxima_fecha ? p.proxima_fecha.slice(0, 10) : "",
      pauta_id:          p.pauta_id ?? "",
      partes:            [],
      activo:            p.activo ?? true,
    });
    setPartesState(partesArr);
    setFormErr(null);
    setPanelOpen(true);
  }

  async function guardar() {
    if (!form.descripcion.trim() && !form.titulo.trim()) { setFormErr("Agrega un título o descripción."); return; }
    if (!form.proxima_fecha) { setFormErr("Selecciona la próxima fecha."); return; }
    setFormErr(null);
    setSaving(true);
    const supabase = createClient();
    const tiempoMin = ((parseInt(form.tiempo_estimado_h) || 0) * 60) + (parseInt(form.tiempo_estimado_m) || 0) || null;
    const payload = {
      workspace_id:      plantaId,
      titulo:            form.titulo.trim() || null,
      descripcion:       form.descripcion.trim(),
      ubicacion_id:      form.ubicacion_id || null,
      activo_id:         form.activo_id || null,
      categoria_id:      form.categoria_id || null,
      tipo_trabajo:      form.tipo_trabajo || null,
      prioridad:         form.prioridad,
      tiempo_estimado:   tiempoMin,
      frecuencia_dias:   Number(form.frecuencia_dias),
      proxima_fecha:     form.proxima_fecha,
      pauta_id:          form.pauta_id || null,
      partes_requeridas: JSON.stringify(partes),
      activo:            form.activo,
    };

    if (editItem) {
      const { error } = await supabase.from("preventivos").update(payload).eq("id", editItem.id);
      if (error) { setFormErr(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("preventivos").insert(payload);
      if (error) { setFormErr(error.message); setSaving(false); return; }
    }

    // Refresh
    const { data: fresh } = await supabase.from("preventivos")
      .select("*, ubicaciones(edificio, piso), activos(nombre,codigo)")
      .eq("workspace_id", plantaId).order("proxima_fecha", { ascending: true });
    setPreventivos(fresh ?? []);
    setSaving(false);
    setPanelOpen(false);
  }

  async function toggleActivo(p) {
    const supabase = createClient();
    const newVal = !p.activo;
    await supabase.from("preventivos").update({ activo: newVal }).eq("id", p.id);
    setPreventivos((prev) => prev.map((x) => x.id === p.id ? { ...x, activo: newVal } : x));
  }

  async function eliminar(p) {
    const supabase = createClient();
    await supabase.from("preventivos").delete().eq("id", p.id);
    setPreventivos((prev) => prev.filter((x) => x.id !== p.id));
    setDelItem(null);
  }

  async function generarOT(p) {
    const supabase = createClient();
    const tiempoMin = p.tiempo_estimado ?? null;
    const { data: nueva, error } = await supabase.from("ordenes_trabajo").insert({
      workspace_id:      plantaId,
      titulo:            p.titulo || null,
      descripcion:       p.descripcion,
      tipo:              "solicitud",
      tipo_trabajo:      p.tipo_trabajo || "preventiva",
      estado:            "pendiente",
      prioridad:         p.prioridad ?? "media",
      ubicacion_id:      p.ubicacion_id || null,
      categoria_id:      p.categoria_id || null,
      tiempo_estimado:   tiempoMin,
      plantilla_id:      p.pauta_id || null,
      partes_requeridas: p.partes_requeridas ?? "[]",
      recurrencia:       "ninguna",
    }).select("id").single();

    if (error || !nueva) return;

    // Log actividad
    try {
      await supabase.from("comentarios_orden").insert({
        orden_id: nueva.id, workspace_id: plantaId, usuario_id: myId,
        tipo: "creacion", contenido: `OT generada desde preventivo: ${p.titulo || p.descripcion}`,
      });
    } catch {}

    // Update proxima_fecha
    const hoy = new Date();
    const proxima = new Date(hoy);
    proxima.setDate(hoy.getDate() + (p.frecuencia_dias ?? 30));
    await supabase.from("preventivos").update({ proxima_fecha: proxima.toISOString().slice(0, 10) }).eq("id", p.id);
    setPreventivos((prev) => prev.map((x) => x.id === p.id ? { ...x, proxima_fecha: proxima.toISOString().slice(0, 10) } : x));

    setGenSuccess({ id: nueva.id, titulo: p.titulo || p.descripcion });
  }

  const activos_list   = preventivos.filter((p) => p.activo !== false);   // eslint-disable-line no-shadow
  const inactivos_list = preventivos.filter((p) => p.activo === false);

  const FormPanel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{editItem ? "Editar preventivo" : "Nuevo preventivo"}</h2>
        <button className={styles.panelClose} onClick={() => setPanelOpen(false)}><X size={18} /></button>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Título</label>
          <input className={styles.formInput} placeholder="Ej: Mantención mensual compresor"
            value={form.titulo} onChange={(e) => setF("titulo", e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción *</label>
          <textarea className={styles.formTextarea} rows={2} placeholder="Describe el trabajo a realizar…"
            value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} />
        </div>

        {/* Tipo trabajo */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Tipo de trabajo</label>
          <div className={styles.pillToggle}>
            {["reactiva","preventiva","inspeccion","mejora"].map((t) => (
              <button key={t} className={`${styles.pillToggleBtn} ${form.tipo_trabajo === t ? styles.pillToggleBtnActive : ""}`}
                onClick={() => setF("tipo_trabajo", t)}>
                {TIPO_TRABAJO_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Prioridad */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Prioridad</label>
          <div className={styles.prioGrid}>
            {[
              { value: "baja",    label: "Baja",    Icon: ChevronDown,   color: "#9CA3AF" },
              { value: "media",   label: "Media",   Icon: Minus,         color: "#3B82F6" },
              { value: "alta",    label: "Alta",    Icon: ChevronUp,     color: "#F97316" },
              { value: "urgente", label: "Urgente", Icon: AlertTriangle, color: "#EF4444" },
            ].map(({ value, label, Icon, color }) => {
              const active = form.prioridad === value;
              return (
                <button key={value} type="button"
                  className={`${styles.prioBtn} ${active ? styles.prioBtnActive : ""}`}
                  style={active ? { color, borderColor: color, background: `${color}18` } : {}}
                  onClick={() => setF("prioridad", value)}>
                  <Icon size={13} /><span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Frecuencia</label>
            <select className={styles.formSelect} value={form.frecuencia_dias}
              onChange={(e) => setF("frecuencia_dias", Number(e.target.value))}>
              {Object.entries(FREQ_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Próxima fecha *</label>
            <input type="date" className={styles.formInput} value={form.proxima_fecha}
              onChange={(e) => setF("proxima_fecha", e.target.value)} />
          </div>
        </div>

        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Categoría</label>
            <select className={styles.formSelect} value={form.categoria_id} onChange={(e) => setF("categoria_id", e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Tiempo estimado</label>
            <div className={styles.tiempoRow}>
              <input type="number" min="0" className={styles.formInputSm} placeholder="0"
                value={form.tiempo_estimado_h} onChange={(e) => setF("tiempo_estimado_h", e.target.value)} />
              <span className={styles.tiempoUnit}>h</span>
              <input type="number" min="0" max="59" className={styles.formInputSm} placeholder="0"
                value={form.tiempo_estimado_m} onChange={(e) => setF("tiempo_estimado_m", e.target.value)} />
              <span className={styles.tiempoUnit}>min</span>
            </div>
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Ubicación</label>
          <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => setF("ubicacion_id", e.target.value)}>
            <option value="">Sin ubicación</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.edificio}{u.piso ? `, piso ${u.piso}` : ""}</option>
            ))}
          </select>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Activo</label>
          <select className={styles.formSelect} value={form.activo_id} onChange={(e) => setF("activo_id", e.target.value)}>
            <option value="">Sin activo</option>
            {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.codigo ? ` (${a.codigo})` : ""}</option>)}
          </select>
        </div>

        {/* Pauta */}
        <div className={styles.formField}>
          <label className={styles.formLabel}><ClipboardCheck size={11} style={{ marginRight: 4 }} />Pauta de mantención</label>
          <select className={styles.formSelect} value={form.pauta_id} onChange={(e) => setF("pauta_id", e.target.value)}>
            <option value="">Sin pauta</option>
            {pautas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>

        {/* Repuestos */}
        <div className={styles.formField}>
          <div className={styles.sectionRow}>
            <label className={styles.formLabel}>Repuestos / materiales</label>
            <button className={styles.addLinkBtn} onClick={addParte}><Plus size={13} /> Agregar</button>
          </div>
          {partes.length > 0 && (
            <div className={styles.partesList}>
              {partes.map((p, i) => (
                <div key={i} className={styles.parteRow}>
                  <input className={styles.formInputFlex} placeholder="Nombre"
                    value={p.nombre} onChange={(e) => setParte(i, "nombre", e.target.value)} />
                  <input type="number" min="1" className={styles.formInputSm2}
                    value={p.cantidad} onChange={(e) => setParte(i, "cantidad", e.target.value)} />
                  <select className={styles.formSelectSm} value={p.unidad} onChange={(e) => setParte(i, "unidad", e.target.value)}>
                    <option value="un">un</option><option value="kg">kg</option>
                    <option value="m">m</option><option value="lt">lt</option><option value="caja">caja</option>
                  </select>
                  <button className={styles.removeBtn} onClick={() => removeParte(i)}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {formErr && <p className={styles.formError}>{formErr}</p>}
      </div>
      <div className={styles.panelFooter}>
        <button className={styles.btnGhost} onClick={() => setPanelOpen(false)} disabled={saving}>Cancelar</button>
        <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
          {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear"}
        </button>
      </div>
    </div>
  );

  return (
    <PlanGate
      plan={plan}
      planStatus={planStatus}
      feature="preventivos"
      title="Mantenimiento Preventivo"
      description="Automatiza el mantenimiento de tus equipos. Pangui genera órdenes de trabajo automáticamente según la frecuencia que definas."
      bullets={[
        "Programas de mantenimiento por frecuencia (diaria, semanal, mensual...)",
        "Generación automática de OT en la fecha programada",
        "Vincula activos, ubicaciones y materiales requeridos",
        "Historial completo de mantenimientos realizados",
      ]}
    >
    <div className={styles.root}>
      {/* List */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <h1 className={styles.listTitle}>Mantención Preventiva</h1>
          <button className={styles.btnNueva} onClick={openCreate}>
            <Plus size={15} /> Nuevo
          </button>
        </div>

        {loading ? (
          <p className={styles.empty}>Cargando…</p>
        ) : preventivos.length === 0 ? (
          <div className={styles.emptyState}>
            <ClipboardCheck size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p className={styles.emptyTitle}>Sin preventivos</p>
            <p className={styles.emptySub}>Crea plantillas para generar órdenes de trabajo automáticamente según frecuencia.</p>
            <button className={styles.btnNueva} onClick={openCreate}><Plus size={14} /> Crear primera plantilla</button>
          </div>
        ) : (
          <div className={styles.list}>
            {activos_list.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionTitle}>Activos · {activos_list.length}</p>
                {activos_list.map((p) => (
                  <PrevCard key={p.id} p={p}
                    onEdit={() => openEdit(p)}
                    onToggle={() => toggleActivo(p)}
                    onDelete={() => setDelItem(p)}
                    onGenerar={() => generarOT(p)}
                  />
                ))}
              </div>
            )}
            {inactivos_list.length > 0 && (
              <div className={styles.section}>
                <p className={styles.sectionTitle}>Pausados · {inactivos_list.length}</p>
                {inactivos_list.map((p) => (
                  <PrevCard key={p.id} p={p}
                    onEdit={() => openEdit(p)}
                    onToggle={() => toggleActivo(p)}
                    onDelete={() => setDelItem(p)}
                    onGenerar={() => generarOT(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel: form (desktop) */}
      {panelOpen && (
        <div className={styles.detailPanel}>{FormPanel}</div>
      )}
      {!panelOpen && (
        <div className={styles.emptyPanel}>
          <ClipboardCheck size={40} style={{ opacity: 0.15, marginBottom: 12 }} />
          <p>Selecciona un preventivo o crea uno nuevo</p>
        </div>
      )}

      {/* Mobile overlay */}
      {panelOpen && (
        <div className={styles.mobileOverlay}>{FormPanel}</div>
      )}

      {/* Confirm delete */}
      {delItem && (
        <div className={styles.overlay} onClick={() => setDelItem(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>¿Eliminar preventivo?</p>
            <p className={styles.confirmSub}>Se eliminará "<strong>{delItem.titulo || delItem.descripcion}</strong>". Las órdenes ya creadas no se eliminarán.</p>
            <div className={styles.confirmActions}>
              <button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminar(delItem)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate success toast */}
      {genSuccess && (
        <div className={styles.toast}>
          <span>✅ OT creada: <strong>{genSuccess.titulo}</strong></span>
          <button className={styles.toastLink} onClick={() => router.push(`/ordenes/${genSuccess.id}`)}>Ver OT →</button>
          <button className={styles.toastClose} onClick={() => setGenSuccess(null)}><X size={14} /></button>
        </div>
      )}
    </div>
    </PlanGate>
  );
}

function PrevCard({ p, onEdit, onToggle, onDelete, onGenerar }) {
  const isActive = p.activo !== false;
  const freqLabel = FREQ_LABEL[p.frecuencia_dias] ?? `Cada ${p.frecuencia_dias} días`;
  const diff = daysDiff(p.proxima_fecha);
  const isOverdue = diff !== null && diff < 0;
  const isDueSoon = diff !== null && !isOverdue && diff <= 7;
  const [genLoading, setGenLoading] = useState(false);

  async function handleGenerar(e) {
    e.stopPropagation();
    setGenLoading(true);
    await onGenerar();
    setGenLoading(false);
  }

  return (
    <div className={`${styles.card} ${!isActive ? styles.cardInactive : ""} ${isOverdue ? styles.cardOverdue : ""}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardInfo}>
          {p.titulo && <span className={styles.cardTitulo}>{p.titulo}</span>}
          <span className={styles.cardDesc}>{p.descripcion}</span>
        </div>
        <div className={styles.cardActions}>
          <button className={`${styles.cardBtn} ${styles.cardBtnGenerar}`}
            onClick={handleGenerar} disabled={genLoading} title="Generar OT ahora">
            <Zap size={14} />
            <span>{genLoading ? "…" : "Generar OT"}</span>
          </button>
          <button className={styles.cardBtn} onClick={(e) => { e.stopPropagation(); onToggle(); }} title={isActive ? "Pausar" : "Activar"}>
            {isActive ? <ToggleRight size={18} color="#22c55e" /> : <ToggleLeft size={18} />}
          </button>
          <button className={styles.cardBtn} onClick={(e) => { e.stopPropagation(); onEdit(); }}>
            <Pencil size={14} />
          </button>
          <button className={`${styles.cardBtn} ${styles.cardBtnDanger}`} onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}><Clock size={11} /> {freqLabel}</span>
        {p.ubicaciones && (
          <span className={styles.metaItem}>{p.ubicaciones.edificio}{p.ubicaciones.piso ? `, piso ${p.ubicaciones.piso}` : ""}</span>
        )}
        {p.activos?.nombre && <span className={styles.metaItem}>⚙️ {p.activos.nombre}{p.activos.codigo ? ` (${p.activos.codigo})` : ""}</span>}
      </div>

      <div className={styles.cardNext}>
        <span className={`${styles.nextBadge} ${isOverdue ? styles.nextBadgeOverdue : isDueSoon ? styles.nextBadgeSoon : styles.nextBadgeOk}`}>
          {isOverdue ? "🔴 Vencida" : isDueSoon ? "🟡 Próxima" : "🟢 Al día"}
        </span>
        <span className={styles.nextDate}>{fmtDate(p.proxima_fecha)}</span>
      </div>
    </div>
  );
}
