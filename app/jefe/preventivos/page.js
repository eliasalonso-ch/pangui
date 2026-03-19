"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
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

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PreventivosPage() {
  const router = useRouter();
  const [preventivos, setPreventivos] = useState([]);
  const [ubicaciones,  setUbicaciones]  = useState([]);
  const [tecnicos,     setTecnicos]     = useState([]);
  const [clientes,     setClientes]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [plantaId,     setPlantaId]     = useState(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem,  setEditItem]  = useState(null); // null = create
  const [form,      setForm]      = useState(emptyForm());
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState(null);

  // Confirm delete
  const [delItem, setDelItem] = useState(null);

  function emptyForm() {
    return {
      descripcion:      "",
      ubicacion_id:     "",
      tecnico_id:       "",
      cliente_id:       "",
      frecuencia_dias:  30,
      proxima_fecha:    "",
      activo:           true,
    };
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      let perfil = getPerfilCache(user.id);
      if (!perfil) {
        const { data } = await supabase.from("usuarios").select("planta_id, rol, nombre").eq("id", user.id).maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }
      if (!perfil?.planta_id) return;
      setPlantaId(perfil.planta_id);

      const [{ data: prevs }, { data: ubics }, { data: tecns }, { data: clis }] = await Promise.all([
        supabase
          .from("preventivos")
          .select("*, ubicaciones(edificio, piso, detalle), tecnicos:usuarios(nombre), clientes(nombre)")
          .eq("planta_id", perfil.planta_id)
          .order("proxima_fecha", { ascending: true }),
        supabase.from("ubicaciones").select("id, edificio, piso, detalle").eq("planta_id", perfil.planta_id).eq("activa", true).order("edificio"),
        supabase.from("usuarios").select("id, nombre").eq("planta_id", perfil.planta_id).eq("rol", "tecnico").order("nombre"),
        supabase.from("clientes").select("id, nombre").eq("planta_id", perfil.planta_id).eq("activo", true).order("nombre"),
      ]);

      setPreventivos(prevs ?? []);
      setUbicaciones(ubics ?? []);
      setTecnicos(tecns ?? []);
      setClientes(clis ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  function openCreate() {
    setEditItem(null);
    setForm(emptyForm());
    setFormErr(null);
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditItem(p);
    setForm({
      descripcion:     p.descripcion ?? "",
      ubicacion_id:    p.ubicacion_id ?? "",
      tecnico_id:      p.tecnico_id ?? "",
      cliente_id:      p.cliente_id ?? "",
      frecuencia_dias: p.frecuencia_dias ?? 30,
      proxima_fecha:   p.proxima_fecha ? p.proxima_fecha.slice(0, 10) : "",
      activo:          p.activo ?? true,
    });
    setFormErr(null);
    setModalOpen(true);
  }

  async function guardar() {
    if (!form.descripcion.trim()) { setFormErr("Ingresa una descripción."); return; }
    if (!form.proxima_fecha)      { setFormErr("Selecciona la próxima fecha."); return; }
    setFormErr(null);
    setSaving(true);

    const supabase = createClient();
    const payload = {
      planta_id:       plantaId,
      descripcion:     form.descripcion.trim(),
      ubicacion_id:    form.ubicacion_id  || null,
      tecnico_id:      form.tecnico_id    || null,
      cliente_id:      form.cliente_id    || null,
      frecuencia_dias: Number(form.frecuencia_dias),
      proxima_fecha:   form.proxima_fecha,
      activo:          form.activo,
    };

    if (editItem) {
      const { error } = await supabase.from("preventivos").update(payload).eq("id", editItem.id);
      if (error) { setFormErr(error.message); setSaving(false); return; }
      setPreventivos((prev) => prev.map((p) => p.id === editItem.id ? { ...p, ...payload } : p));
    } else {
      const { data, error } = await supabase.from("preventivos").insert(payload).select("*, ubicaciones(edificio, piso, detalle), tecnicos:usuarios(nombre), clientes(nombre)").single();
      if (error) { setFormErr(error.message); setSaving(false); return; }
      setPreventivos((prev) => [...prev, data]);
    }

    setSaving(false);
    setModalOpen(false);
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

  const activos   = preventivos.filter((p) => p.activo !== false);
  const inactivos = preventivos.filter((p) => p.activo === false);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>Mantenimiento Preventivo</h1>
        <button className={styles.addBtn} onClick={openCreate}>
          <Plus size={18} />
          <span>Nuevo</span>
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando…</p>
      ) : preventivos.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Sin mantenimientos preventivos</p>
          <p className={styles.emptySub}>Crea plantillas para generar órdenes automáticamente según frecuencia.</p>
          <button className={styles.addBtn} onClick={openCreate}><Plus size={16} /> Crear primera plantilla</button>
        </div>
      ) : (
        <>
          {activos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Activos · {activos.length}</h2>
              <div className={styles.list}>
                {activos.map((p) => <PrevCard key={p.id} p={p} onEdit={openEdit} onToggle={toggleActivo} onDelete={() => setDelItem(p)} />)}
              </div>
            </section>
          )}
          {inactivos.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Pausados · {inactivos.length}</h2>
              <div className={styles.list}>
                {inactivos.map((p) => <PrevCard key={p.id} p={p} onEdit={openEdit} onToggle={toggleActivo} onDelete={() => setDelItem(p)} />)}
              </div>
            </section>
          )}
        </>
      )}

      {/* Create/edit modal */}
      {modalOpen && (
        <div className={styles.overlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editItem ? "Editar plantilla" : "Nueva plantilla"}</h2>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Descripción *</label>
              <textarea
                className={styles.formTextarea}
                placeholder="Ej. Revisión mensual de sistema HVAC"
                rows={3}
                value={form.descripcion}
                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              />
            </div>

            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Frecuencia</label>
                <select className={styles.formSelect} value={form.frecuencia_dias}
                  onChange={(e) => setForm((f) => ({ ...f, frecuencia_dias: Number(e.target.value) }))}>
                  {Object.entries(FREQ_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Próxima fecha *</label>
                <input type="date" className={styles.formInput} value={form.proxima_fecha}
                  onChange={(e) => setForm((f) => ({ ...f, proxima_fecha: e.target.value }))} />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Ubicación</label>
              <select className={styles.formSelect} value={form.ubicacion_id}
                onChange={(e) => setForm((f) => ({ ...f, ubicacion_id: e.target.value }))}>
                <option value="">Sin ubicación</option>
                {ubicaciones.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.edificio}{u.piso ? `, piso ${u.piso}` : ""}{u.detalle ? ` · ${u.detalle}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Técnico asignado</label>
              <select className={styles.formSelect} value={form.tecnico_id}
                onChange={(e) => setForm((f) => ({ ...f, tecnico_id: e.target.value }))}>
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Cliente</label>
              <select className={styles.formSelect} value={form.cliente_id}
                onChange={(e) => setForm((f) => ({ ...f, cliente_id: e.target.value }))}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>

            {formErr && <p className={styles.formError}>{formErr}</p>}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
              <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
                {saving ? "Guardando…" : editItem ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {delItem && (
        <div className={styles.overlay} onClick={() => setDelItem(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>¿Eliminar plantilla?</p>
            <p className={styles.confirmSub}>
              Se eliminará "<strong>{delItem.descripcion}</strong>". Las órdenes ya creadas no se eliminarán.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setDelItem(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminar(delItem)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function PrevCard({ p, onEdit, onToggle, onDelete }) {
  const isActive = p.activo !== false;
  const freqLabel = FREQ_LABEL[p.frecuencia_dias] ?? `Cada ${p.frecuencia_dias} días`;
  const ubic = p.ubicaciones
    ? `${p.ubicaciones.edificio}${p.ubicaciones.piso ? `, piso ${p.ubicaciones.piso}` : ""}`
    : null;

  const nextDate = p.proxima_fecha ? new Date(p.proxima_fecha + "T00:00:00") : null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const isOverdue = nextDate && nextDate < hoy;
  const isDueSoon = nextDate && !isOverdue && (nextDate - hoy) / 86400000 <= 3;

  return (
    <div className={`${styles.card} ${!isActive ? styles.cardInactive : ""}`}>
      <div className={styles.cardTop}>
        <span className={styles.cardDesc}>{p.descripcion}</span>
        <div className={styles.cardActions}>
          <button className={styles.cardBtn} onClick={() => onToggle(p)}>
            {isActive ? <ToggleRight size={18} color="#22c55e" /> : <ToggleLeft size={18} />}
          </button>
          <button className={styles.cardBtn} onClick={() => onEdit(p)}>
            <Pencil size={15} />
          </button>
          <button className={`${styles.cardBtn} ${styles.cardBtnDanger}`} onClick={onDelete}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>{freqLabel}</span>
        {ubic && <span className={styles.metaItem}>{ubic}</span>}
        {p.tecnicos?.nombre && <span className={styles.metaItem}>👤 {p.tecnicos.nombre}</span>}
        {p.clientes?.nombre && <span className={styles.metaItem}>🏢 {p.clientes.nombre}</span>}
      </div>

      <div className={styles.cardNext}>
        <span className={`${styles.nextLabel} ${isOverdue ? styles.nextOverdue : isDueSoon ? styles.nextSoon : ""}`}>
          {isOverdue ? "⚠️ Vencida" : isDueSoon ? "⏰ Próxima" : "Próxima"}{" — "}
          {fmtDate(p.proxima_fecha)}
        </span>
      </div>
    </div>
  );
}
