"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Pencil, Trash2, X, Info, CheckSquare, AlertCircle,
  ChevronUp, ChevronDown, ClipboardList,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const TIPO_OPTS = [
  { value: "instruccion",  label: "Instrucción",  Icon: Info,         color: "#6B7280" },
  { value: "verificacion", label: "Verificación", Icon: CheckSquare,  color: "#3B82F6" },
  { value: "advertencia",  label: "Advertencia",  Icon: AlertCircle,  color: "#D97706" },
];

function tipoMeta(tipo) {
  return TIPO_OPTS.find((t) => t.value === tipo) ?? TIPO_OPTS[0];
}

const RECURRENCIA_LABEL = {
  ninguna: "Sin recurrencia", diaria: "Diaria", semanal: "Semanal",
  mensual_fecha: "Mensual (por fecha)", mensual_dia: "Mensual (por día)", anual: "Anual",
};

export default function PautasPage() {
  const router = useRouter();

  const [plantaId, setPlantaId] = useState(null);
  const [myId,     setMyId]     = useState(null);
  const [pautas,   setPautas]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading,  setLoading]  = useState(true);

  // Selected pauta for view/edit
  const [selected, setSelected] = useState(null); // pauta object
  const [isDesktop, setIsDesktop] = useState(false);

  // Edit/create panel
  const [panelMode, setPanelMode] = useState(null); // null | 'view' | 'edit' | 'create'
  const [form, setFormState] = useState(emptyForm());
  const [pasos, setPasos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

  function emptyForm() {
    return { nombre: "", descripcion: "", categoria_id: "", tiempo_estimado_h: "", tiempo_estimado_m: "" };
  }
  function setF(key, val) { setFormState((f) => ({ ...f, [key]: val })); }
  function addPaso() { setPasos((p) => [...p, { tipo: "instruccion", contenido: "", _key: Date.now() }]); }
  function setPaso(i, key, val) { setPasos((p) => { const n = [...p]; n[i] = { ...n[i], [key]: val }; return n; }); }
  function removePaso(i) { setPasos((p) => p.filter((_, idx) => idx !== i)); }
  function movePaso(i, dir) {
    setPasos((p) => {
      const n = [...p];
      const j = i + dir;
      if (j < 0 || j >= n.length) return n;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  }

  // Parts for pauta
  const [partes, setPartesState] = useState([]);
  function addParte() { setPartesState((p) => [...p, { nombre: "", cantidad: 1, unidad: "un" }]); }
  function setParte(i, key, val) { setPartesState((p) => { const n = [...p]; n[i] = { ...n[i], [key]: val }; return n; }); }
  function removeParte(i) { setPartesState((p) => p.filter((_, idx) => idx !== i)); }

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);

      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      const effectivePlantaId = perfil?.workspace_id;
      if (!effectivePlantaId) { setLoading(false); return; }
      setPlantaId(effectivePlantaId);

      const [{ data: ps }, { data: cats }] = await Promise.all([
        sb.from("plantillas_procedimiento").select("id, nombre, descripcion, categoria_id, tiempo_estimado, partes_requeridas, created_at").eq("workspace_id", perfil.workspace_id).order("nombre"),
        sb.from("categorias_ot").select("id, nombre").or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`).order("nombre"),
      ]);
      setPautas(ps ?? []);
      setCategorias(cats ?? []);
      setLoading(false);
    }
    init();
  }, []);

  function openCreate() {
    setFormState(emptyForm());
    setPasos([]);
    setPartesState([]);
    setError(null);
    setSelected(null);
    setPanelMode("create");
  }

  async function openEdit(p) {
    setFormState({
      nombre:             p.nombre ?? "",
      descripcion:        p.descripcion ?? "",
      categoria_id:       p.categoria_id ?? "",
      tiempo_estimado_h:  p.tiempo_estimado ? String(Math.floor(p.tiempo_estimado / 60)) : "",
      tiempo_estimado_m:  p.tiempo_estimado ? String(p.tiempo_estimado % 60) : "",
    });
    // Load pasos
    const sb = createClient();
    const { data: ps } = await sb.from("pasos_plantilla").select("*").eq("plantilla_id", p.id).order("orden");
    setPasos((ps ?? []).map((s, i) => ({ ...s, _key: i })));
    // Load partes
    let partesArr = [];
    try {
      partesArr = typeof p.partes_requeridas === "string"
        ? JSON.parse(p.partes_requeridas || "[]")
        : (p.partes_requeridas ?? []);
    } catch {}
    setPartesState(partesArr);
    setSelected(p);
    setError(null);
    setPanelMode("edit");
  }

  async function guardar() {
    if (!form.nombre.trim()) { setError("El nombre de la pauta es requerido."); return; }
    setSaving(true);
    setError(null);
    const sb = createClient();
    const tiempoMin = ((parseInt(form.tiempo_estimado_h) || 0) * 60) + (parseInt(form.tiempo_estimado_m) || 0) || null;
    const payload = {
      workspace_id:      plantaId,
      nombre:            form.nombre.trim(),
      descripcion:       form.descripcion.trim() || null,
      categoria_id:      form.categoria_id || null,
      tiempo_estimado:   tiempoMin,
      partes_requeridas: JSON.stringify(partes),
    };

    let pautaId;
    if (panelMode === "edit" && selected) {
      const { error: err } = await sb.from("plantillas_procedimiento").update(payload).eq("id", selected.id);
      if (err) { setError(err.message); setSaving(false); return; }
      pautaId = selected.id;
    } else {
      const { data, error: err } = await sb.from("plantillas_procedimiento").insert(payload).select("id").single();
      if (err) { setError(err.message); setSaving(false); return; }
      pautaId = data.id;
    }

    // Upsert pasos: delete then re-insert
    await sb.from("pasos_plantilla").delete().eq("plantilla_id", pautaId);
    if (pasos.length > 0) {
      await sb.from("pasos_plantilla").insert(
        pasos.map((s, i) => ({ plantilla_id: pautaId, orden: i + 1, tipo: s.tipo, contenido: s.contenido }))
      );
    }

    // Refresh list
    const { data: fresh } = await sb.from("plantillas_procedimiento")
      .select("id, nombre, descripcion, categoria_id, tiempo_estimado, partes_requeridas, created_at")
      .eq("workspace_id", plantaId).order("nombre");
    setPautas(fresh ?? []);
    setSaving(false);
    setPanelMode(null);
    setSelected(null);
  }

  async function eliminar(p) {
    const sb = createClient();
    await sb.from("pasos_plantilla").delete().eq("plantilla_id", p.id);
    await sb.from("plantillas_procedimiento").delete().eq("id", p.id);
    setPautas((prev) => prev.filter((x) => x.id !== p.id));
    setConfirm(null);
    if (selected?.id === p.id) { setPanelMode(null); setSelected(null); }
  }

  function tiempoFmt(min) {
    if (!min) return null;
    const h = Math.floor(min / 60), m = min % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  const EditPanel = (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>{panelMode === "create" ? "Nueva pauta" : "Editar pauta"}</h2>
        <button className={styles.panelClose} onClick={() => { setPanelMode(null); setSelected(null); }}><X size={18} /></button>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nombre *</label>
          <input className={styles.formInput} placeholder="Ej: Mantención retroexcavadora CAT 320"
            value={form.nombre} onChange={(e) => setF("nombre", e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción</label>
          <textarea className={styles.formTextarea} rows={2} placeholder="Descripción breve del procedimiento…"
            value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} />
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

        {/* Pasos */}
        <div className={styles.formField}>
          <div className={styles.sectionRow}>
            <label className={styles.formLabel}>Pasos del procedimiento</label>
            <button className={styles.addLinkBtn} onClick={addPaso}><Plus size={13} /> Agregar paso</button>
          </div>
          {pasos.length === 0 && (
            <p className={styles.emptyHint}>Agrega los pasos que el técnico debe seguir</p>
          )}
          <div className={styles.pasosList}>
            {pasos.map((s, i) => {
              const meta = tipoMeta(s.tipo);
              return (
                <div key={s._key ?? i} className={styles.pasoRow}>
                  <div className={styles.pasoMoveCol}>
                    <button className={styles.moveBtn} onClick={() => movePaso(i, -1)} disabled={i === 0}><ChevronUp size={12} /></button>
                    <button className={styles.moveBtn} onClick={() => movePaso(i, 1)} disabled={i === pasos.length - 1}><ChevronDown size={12} /></button>
                  </div>
                  <div className={styles.pasoContent}>
                    <div className={styles.pasoTypeRow}>
                      {TIPO_OPTS.map(({ value, label, Icon, color }) => (
                        <button key={value} type="button"
                          className={`${styles.tipoBtn} ${s.tipo === value ? styles.tipoBtnActive : ""}`}
                          style={s.tipo === value ? { color, borderColor: color, background: `${color}15` } : {}}
                          onClick={() => setPaso(i, "tipo", value)}>
                          <Icon size={11} />{label}
                        </button>
                      ))}
                    </div>
                    <textarea className={styles.pasoTextarea} rows={2}
                      placeholder={s.tipo === "advertencia" ? "Ej: Asegúrate de desconectar la corriente antes de proceder" : s.tipo === "verificacion" ? "Ej: Verificar que la presión esté en 80 PSI" : "Ej: Retirar el filtro de aceite y desechar"}
                      value={s.contenido} onChange={(e) => setPaso(i, "contenido", e.target.value)} />
                  </div>
                  <button className={styles.removeBtn} onClick={() => removePaso(i)}><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Partes */}
        <div className={styles.formField}>
          <div className={styles.sectionRow}>
            <label className={styles.formLabel}>Repuestos / materiales</label>
            <button className={styles.addLinkBtn} onClick={addParte}><Plus size={13} /> Agregar</button>
          </div>
          {partes.length > 0 && (
            <div className={styles.partesList}>
              {partes.map((p, i) => (
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

        {error && <p className={styles.formError}>{error}</p>}
      </div>
      <div className={styles.panelFooter}>
        <button className={styles.btnGhost} onClick={() => { setPanelMode(null); setSelected(null); }}>Cancelar</button>
        <button className={styles.btnPrimary} onClick={guardar} disabled={saving}>
          {saving ? "Guardando…" : panelMode === "create" ? "Crear pauta" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );

  if (loading) return <div className={styles.loading}>Cargando…</div>;

  const showPanel = panelMode === "create" || panelMode === "edit";

  // Mobile: full screen form
  if (!isDesktop && showPanel) {
    return <div className={styles.mobileOverlay}>{EditPanel}</div>;
  }

  return (
    <div className={styles.root}>
      {/* Left: list */}
      <div className={styles.listPanel}>
        <div className={styles.listHeader}>
          <div className={styles.listHeaderLeft}>
            <button className={styles.backBtn} onClick={() => router.push("/ordenes")}>
              <ArrowLeft size={16} />
            </button>
            <h1 className={styles.listTitle}>Pautas de mantención</h1>
          </div>
          <button className={styles.btnNueva} onClick={openCreate}>
            <Plus size={15} />
            Nueva pauta
          </button>
        </div>

        {pautas.length === 0 ? (
          <div className={styles.emptyState}>
            <ClipboardList size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
            <p className={styles.emptyTitle}>Sin pautas</p>
            <p className={styles.emptySub}>Crea procedimientos paso a paso para estandarizar el trabajo de tu equipo.</p>
            <button className={styles.btnNueva} onClick={openCreate}><Plus size={14} /> Crear primera pauta</button>
          </div>
        ) : (
          <div className={styles.list}>
            {pautas.map((p) => {
              let partesArr = [];
              try { partesArr = typeof p.partes_requeridas === "string" ? JSON.parse(p.partes_requeridas || "[]") : (p.partes_requeridas ?? []); } catch {}
              return (
                <button key={p.id}
                  className={`${styles.pautaCard} ${selected?.id === p.id ? styles.pautaCardActive : ""}`}
                  onClick={() => openEdit(p)}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardNombre}>{p.nombre}</span>
                    <button className={styles.deleteCardBtn} onClick={(e) => { e.stopPropagation(); setConfirm(p); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {p.descripcion && <p className={styles.cardDesc}>{p.descripcion}</p>}
                  <div className={styles.cardMeta}>
                    {tiempoFmt(p.tiempo_estimado) && <span className={styles.metaPill}>{tiempoFmt(p.tiempo_estimado)}</span>}
                    {partesArr.length > 0 && <span className={styles.metaPill}>{partesArr.length} repuesto{partesArr.length !== 1 ? "s" : ""}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: edit panel (desktop) */}
      {isDesktop && showPanel && (
        <div className={styles.detailPanel}>{EditPanel}</div>
      )}

      {isDesktop && !showPanel && (
        <div className={styles.emptyPanel}>
          <ClipboardList size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
          <p>Selecciona una pauta o crea una nueva</p>
        </div>
      )}

      {/* Confirm delete */}
      {confirm && (
        <div className={styles.overlay} onClick={() => setConfirm(null)}>
          <div className={styles.confirmBox} onClick={(e) => e.stopPropagation()}>
            <p className={styles.confirmTitle}>¿Eliminar pauta?</p>
            <p className={styles.confirmSub}>Se eliminará "<strong>{confirm.nombre}</strong>" y todos sus pasos. Esta acción no se puede deshacer.</p>
            <div className={styles.confirmActions}>
              <button className={styles.btnGhost} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminar(confirm)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
