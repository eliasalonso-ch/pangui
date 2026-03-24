"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// Redirect to the new Pautas page
export default function PlantillasRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/ordenes/crear/pautas"); }, []);
  return null;
}
/* Legacy code below — kept for reference but unreachable */
function _Legacy() {
import {
  ArrowLeft, Plus, Pencil, Trash2, ClipboardList,
  Info, CheckSquare, AlertCircle, GripVertical, X,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const TIPO_OPTS = [
  { value: "instruccion", label: "Instrucción", Icon: Info,         color: "#6B7280" },
  { value: "verificacion", label: "Verificación", Icon: CheckSquare, color: "#3B82F6" },
  { value: "advertencia",  label: "Advertencia",  Icon: AlertCircle, color: "#D97706" },
];

function tipoMeta(tipo) {
  return TIPO_OPTS.find((t) => t.value === tipo) ?? TIPO_OPTS[0];
}

export default function PlantillasPage() {
  const router = useRouter();
  const [plantaId,    setPlantaId]    = useState(null);
  const [plantillas,  setPlantillas]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expandedId,  setExpandedId]  = useState(null);
  const [pasosByTpl,  setPasosByTpl]  = useState({});

  // Modal state
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState({ nombre: "", descripcion: "" });
  const [pasos,       setPasos]       = useState([]); // { tipo, contenido, _key }
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState(null);

  // Confirm delete
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      const effectivePlantaId = perfil?.workspace_id;
      if (!effectivePlantaId) return;
      setPlantaId(effectivePlantaId);

      const { data } = await sb
        .from("plantillas_procedimiento")
        .select("id, nombre, descripcion, created_at")
        .eq("workspace_id", perfil.workspace_id)
        .order("nombre");
      setPlantillas(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  async function cargarPasos(plantillaId) {
    if (pasosByTpl[plantillaId]) return;
    const sb = createClient();
    const { data } = await sb
      .from("pasos_plantilla")
      .select("*")
      .eq("plantilla_id", plantillaId)
      .order("orden");
    setPasosByTpl((prev) => ({ ...prev, [plantillaId]: data ?? [] }));
  }

  function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      cargarPasos(id);
    }
  }

  // ── Open create modal ──────────────────────────────────────────
  function abrirCrear() {
    setForm({ nombre: "", descripcion: "" });
    setPasos([{ tipo: "instruccion", contenido: "", _key: Date.now() }]);
    setEditId(null);
    setError(null);
    setModalOpen(true);
  }

  // ── Open edit modal ────────────────────────────────────────────
  async function abrirEditar(tpl) {
    setForm({ nombre: tpl.nombre, descripcion: tpl.descripcion ?? "" });
    setEditId(tpl.id);
    setError(null);

    // Load steps
    let steps = pasosByTpl[tpl.id];
    if (!steps) {
      const sb = createClient();
      const { data } = await sb
        .from("pasos_plantilla")
        .select("*")
        .eq("plantilla_id", tpl.id)
        .order("orden");
      steps = data ?? [];
      setPasosByTpl((prev) => ({ ...prev, [tpl.id]: steps }));
    }
    setPasos(steps.map((s) => ({ ...s, _key: s.id })));
    setModalOpen(true);
  }

  // ── Paso helpers ───────────────────────────────────────────────
  function agregarPaso() {
    setPasos((prev) => [...prev, { tipo: "instruccion", contenido: "", _key: Date.now() + Math.random() }]);
  }

  function eliminarPaso(key) {
    setPasos((prev) => prev.filter((p) => p._key !== key));
  }

  function updatePaso(key, field, value) {
    setPasos((prev) => prev.map((p) => p._key === key ? { ...p, [field]: value } : p));
  }

  function moverPaso(key, dir) {
    setPasos((prev) => {
      const idx = prev.findIndex((p) => p._key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  // ── Save ───────────────────────────────────────────────────────
  async function guardar() {
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    const pasosValidos = pasos.filter((p) => p.contenido.trim());
    if (pasosValidos.length === 0) { setError("Agrega al menos un paso."); return; }

    setSaving(true); setError(null);
    const sb = createClient();

    let tplId = editId;

    if (editId) {
      const { error: e } = await sb
        .from("plantillas_procedimiento")
        .update({ nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null })
        .eq("id", editId);
      if (e) { setError(e.message); setSaving(false); return; }

      // Replace all steps
      await sb.from("pasos_plantilla").delete().eq("plantilla_id", editId);
    } else {
      const { data, error: e } = await sb
        .from("plantillas_procedimiento")
        .insert({ nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, workspace_id: plantaId })
        .select("id")
        .single();
      if (e) { setError(e.message); setSaving(false); return; }
      tplId = data.id;
    }

    const pasosInsert = pasosValidos.map((p, i) => ({
      plantilla_id: tplId,
      orden: i + 1,
      tipo: p.tipo,
      contenido: p.contenido.trim(),
    }));
    const { error: ep } = await sb.from("pasos_plantilla").insert(pasosInsert);
    if (ep) { setError(ep.message); setSaving(false); return; }

    // Update local state
    const newPasos = pasosInsert.map((p, i) => ({ ...p, id: `temp-${i}`, _key: `temp-${i}` }));
    setPasosByTpl((prev) => ({ ...prev, [tplId]: newPasos }));

    if (editId) {
      setPlantillas((prev) =>
        prev.map((t) => t.id === editId ? { ...t, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null } : t)
      );
    } else {
      setPlantillas((prev) => [...prev, {
        id: tplId,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || null,
        created_at: new Date().toISOString(),
      }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }

    setSaving(false);
    setModalOpen(false);
  }

  // ── Delete ─────────────────────────────────────────────────────
  async function eliminar(tpl) {
    const sb = createClient();
    const { error: e } = await sb.from("plantillas_procedimiento").delete().eq("id", tpl.id);
    if (!e) {
      setPlantillas((prev) => prev.filter((t) => t.id !== tpl.id));
      setPasosByTpl((prev) => { const copy = { ...prev }; delete copy[tpl.id]; return copy; });
    }
    setConfirm(null);
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}><ArrowLeft size={20} /></button>
        <h1 className={styles.title}>Plantillas de procedimiento</h1>
        <button className={styles.addBtn} onClick={abrirCrear}><Plus size={16} /><span>Nueva</span></button>
      </div>

      {loading ? (
        <div className={styles.empty}>Cargando plantillas…</div>
      ) : plantillas.length === 0 ? (
        <div className={styles.emptyState}>
          <ClipboardList size={40} style={{ opacity: 0.2 }} />
          <p>No hay plantillas.<br />Crea tu primer procedimiento.</p>
          <button className={styles.addBtn} onClick={abrirCrear}><Plus size={14} /> Nueva plantilla</button>
        </div>
      ) : (
        <div className={styles.list}>
          {plantillas.map((tpl) => {
            const isExpanded = expandedId === tpl.id;
            const steps = pasosByTpl[tpl.id] ?? [];
            return (
              <div key={tpl.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <div className={styles.cardIcon}><ClipboardList size={18} /></div>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName}>{tpl.nombre}</span>
                    {tpl.descripcion && <span className={styles.cardDesc}>{tpl.descripcion}</span>}
                  </div>
                  <div className={styles.cardActions}>
                    <button className={styles.iconBtn} onClick={() => abrirEditar(tpl)}><Pencil size={15} /></button>
                    <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setConfirm(tpl)}>
                      <Trash2 size={15} />
                    </button>
                    <button className={styles.iconBtn} onClick={() => toggleExpand(tpl.id)}>
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className={styles.stepsPanel}>
                    {steps.length === 0 ? (
                      <span className={styles.stepsEmpty}>Sin pasos cargados.</span>
                    ) : (
                      steps.map((s, i) => {
                        const meta = tipoMeta(s.tipo);
                        const Icon = meta.Icon;
                        return (
                          <div key={s.id ?? i} className={styles.stepRow}>
                            <span className={styles.stepNum}>{i + 1}</span>
                            <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
                            <span className={styles.stepText}>{s.contenido}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal crear/editar ── */}
      {modalOpen && (
        <div className={styles.overlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editId ? "Editar plantilla" : "Nueva plantilla"}</h2>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Nombre *</label>
              <input className={styles.formInput} placeholder="Ej: Revisión mensual bomba"
                value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Descripción</label>
              <input className={styles.formInput} placeholder="Descripción opcional"
                value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
            </div>

            <div className={styles.pasosSection}>
              <div className={styles.pasosSectionHeader}>
                <span className={styles.pasosLabel}>Pasos del procedimiento</span>
                <button className={styles.addPasoBtn} onClick={agregarPaso}><Plus size={14} /> Agregar paso</button>
              </div>

              <div className={styles.pasosList}>
                {pasos.map((p, i) => {
                  const meta = tipoMeta(p.tipo);
                  const Icon = meta.Icon;
                  return (
                    <div key={p._key} className={styles.pasoEditRow}>
                      <div className={styles.pasoEditLeft}>
                        <span className={styles.pasoEditNum}>{i + 1}</span>
                        <div className={styles.pasoMoveCol}>
                          <button className={styles.moveBtn} onClick={() => moverPaso(p._key, -1)} disabled={i === 0}>
                            <ChevronUp size={12} />
                          </button>
                          <button className={styles.moveBtn} onClick={() => moverPaso(p._key, 1)} disabled={i === pasos.length - 1}>
                            <ChevronDown size={12} />
                          </button>
                        </div>
                      </div>

                      <div className={styles.pasoEditBody}>
                        <div className={styles.pasoTypeRow}>
                          {TIPO_OPTS.map((opt) => (
                            <button
                              key={opt.value}
                              className={`${styles.tipoBtn} ${p.tipo === opt.value ? styles.tipoBtnActive : ""}`}
                              style={p.tipo === opt.value ? { borderColor: opt.color, color: opt.color } : {}}
                              onClick={() => updatePaso(p._key, "tipo", opt.value)}
                            >
                              <opt.Icon size={11} />
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          className={styles.pasoInput}
                          rows={2}
                          placeholder="Descripción del paso…"
                          value={p.contenido}
                          onChange={(e) => updatePaso(p._key, "contenido", e.target.value)}
                        />
                      </div>

                      <button className={styles.deletePasoBtn} onClick={() => eliminarPaso(p._key)}>
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {error && <p className={styles.formError}>{error}</p>}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
                {saving ? "Guardando…" : editId ? "Guardar" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>¿Eliminar plantilla?</p>
            <p className={styles.confirmSub}>
              Se eliminará <strong>{confirm.nombre}</strong> y todos sus pasos. Esta acción no se puede deshacer.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminar(confirm)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
} // end _Legacy
