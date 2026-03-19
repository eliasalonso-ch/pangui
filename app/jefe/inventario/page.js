"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

// ── Constants ─────────────────────────────────────────────────

const CATEGORIAS = [
  "Iluminación", "Control eléctrico", "Cableado",
  "Accesorios", "Protección", "Otro",
];
const UNIDADES = ["un", "mt", "kg", "rollo", "lt", "caja"];

// ── Helpers ───────────────────────────────────────────────────

function fNum(n)   { return Number(n ?? 0).toLocaleString("es-CL"); }
function fPrecio(n){ return `$${Number(n ?? 0).toLocaleString("es-CL")}`; }
function fFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function stockEstado(actual, minimo) {
  if (Number(actual) <= 0)                 return "critico";
  if (minimo <= 0)                         return "verde";
  const r = Number(actual) / Number(minimo);
  if (r < 0.2)  return "rojo";
  if (r < 1)    return "amarillo";
  return "verde";
}

// ── StockBar ──────────────────────────────────────────────────

function StockBar({ actual, minimo }) {
  const estado = stockEstado(actual, minimo);
  const ref = minimo > 0 ? minimo * 2 : Math.max(Number(actual), 1) * 2;
  const pct = Math.min(100, (Number(actual) / ref) * 100);
  const cls = {
    verde: styles.stockVerde, amarillo: styles.stockAmarillo,
    rojo: styles.stockRojo,   critico: styles.stockRojo,
  }[estado];
  return (
    <div className={styles.stockBarWrap}>
      <div className={`${styles.stockBar} ${cls}`} style={{ width: `${Math.max(pct, 2)}%` }} />
    </div>
  );
}

// ── MaterialCard ──────────────────────────────────────────────

function MaterialCard({ mat, expanded, onToggle, onUpdated, plantaId }) {
  const estado   = stockEstado(mat.stock_actual, mat.stock_minimo);
  const esBajo   = estado !== "verde";
  const esCrit   = estado === "critico" || estado === "rojo";

  const [movsMini, setMovsMini] = useState([]);
  const [editVals, setEditVals] = useState({
    stock_minimo:    mat.stock_minimo,
    precio_unitario: mat.precio_unitario,
    ubicacion_bodega: mat.ubicacion_bodega ?? "",
  });
  const [cantInput, setCantInput] = useState("");
  const [notaInput, setNotaInput] = useState("");
  const [saving, setSaving]       = useState(false);
  const [movError, setMovError]   = useState(null);

  // Sync edit values if mat prop changes (e.g. after save + reload)
  useEffect(() => {
    setEditVals({
      stock_minimo:    mat.stock_minimo,
      precio_unitario: mat.precio_unitario,
      ubicacion_bodega: mat.ubicacion_bodega ?? "",
    });
  }, [mat.stock_minimo, mat.precio_unitario, mat.ubicacion_bodega]);

  // Load last 5 movements when expanded
  useEffect(() => {
    if (!expanded) return;
    async function load() {
      const supabase = createClient();
      const { data } = await supabase
        .from("movimientos_stock")
        .select("*, usuarios(nombre)")
        .eq("material_id", mat.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setMovsMini(data);
    }
    load();
  }, [expanded, mat.id]);

  async function guardarEdicion() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("materiales").update({
      stock_minimo:    Number(editVals.stock_minimo)    || 0,
      precio_unitario: Number(editVals.precio_unitario) || 0,
      ubicacion_bodega: editVals.ubicacion_bodega.trim() || null,
    }).eq("id", mat.id);
    setSaving(false);
    onUpdated();
  }

  async function insertarMovimiento(tipo) {
    const cant = parseFloat(cantInput);
    if (!cant || cant <= 0) { setMovError("Ingresa una cantidad válida."); return; }
    setMovError(null);
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("movimientos_stock").insert({
      material_id: mat.id,
      tipo,
      cantidad:   cant,
      nota:       notaInput.trim() || null,
      usuario_id: user.id,
    });
    setCantInput("");
    setNotaInput("");
    setSaving(false);
    onUpdated();

    // Alert jefes if stock dropped below minimum after egreso or ajuste
    if (plantaId && (tipo === "egreso" || tipo === "ajuste")) {
      const supabase2 = createClient();
      const { data: updated } = await supabase2
        .from("materiales")
        .select("stock_actual, stock_minimo, nombre")
        .eq("id", mat.id)
        .maybeSingle();
      if (updated && updated.stock_minimo > 0 && updated.stock_actual <= updated.stock_minimo) {
        const critico = updated.stock_actual <= 0;
        fetch("/api/notificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planta_id_jefe: plantaId,
            titulo: critico ? "⚠️ Sin stock" : "⚠️ Stock bajo",
            mensaje: `${updated.nombre}: ${updated.stock_actual} unidades (mín. ${updated.stock_minimo})`,
            tipo: "orden",
            url: "/jefe/inventario",
          }),
        }).catch(() => {});
      }
    }

    // Refresh mini-list
    const { data } = await supabase
      .from("movimientos_stock")
      .select("*, usuarios(nombre)")
      .eq("material_id", mat.id)
      .order("created_at", { ascending: false })
      .limit(5);
    if (data) setMovsMini(data);
  }

  const numCls = {
    verde: styles.stockNumVerde, amarillo: styles.stockNumAmarillo,
    rojo:  styles.stockNumRojo,  critico:  styles.stockNumRojo,
  }[estado];

  return (
    <div className={`${styles.matCard} ${esCrit ? styles.matCardCritico : esBajo ? styles.matCardBajo : ""}`}>
      {/* Header row (always visible, clickable) */}
      <div
        className={styles.matCardHeader}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && onToggle()}
      >
        <div className={styles.matCardLeft}>
          <div className={styles.matTopRow}>
            <span className={styles.matNombre}>{mat.nombre}</span>
            <span className={styles.matCodigo}>{mat.codigo}</span>
          </div>
          {mat.categoria && (
            <span className={styles.matCategoria}>{mat.categoria}</span>
          )}
          <StockBar actual={mat.stock_actual} minimo={mat.stock_minimo} />
          <div className={styles.matStockInfo}>
            <span className={numCls}>
              {fNum(mat.stock_actual)} {mat.unidad}
            </span>
            <span className={styles.matStockMin}>
              mín {fNum(mat.stock_minimo)} {mat.unidad}
            </span>
            {mat.ubicacion_bodega && (
              <span className={styles.matUbicacion}>{mat.ubicacion_bodega}</span>
            )}
          </div>
        </div>
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}>
          ›
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className={styles.expandContent}>

          {/* Edit fields */}
          <div className={styles.editGrid}>
            <div className={styles.editField}>
              <label className={styles.editLabel}>Stock mínimo</label>
              <input
                className={styles.editInput}
                type="number" min="0" step="any"
                value={editVals.stock_minimo}
                onChange={(e) => setEditVals(v => ({ ...v, stock_minimo: e.target.value }))}
              />
            </div>
            <div className={styles.editField}>
              <label className={styles.editLabel}>Precio unitario</label>
              <input
                className={styles.editInput}
                type="number" min="0" step="any"
                value={editVals.precio_unitario}
                onChange={(e) => setEditVals(v => ({ ...v, precio_unitario: e.target.value }))}
              />
            </div>
            <div className={`${styles.editField} ${styles.editFieldFull}`}>
              <label className={styles.editLabel}>Ubicación bodega</label>
              <input
                className={styles.editInput}
                type="text" placeholder="Ej: Estante A1"
                value={editVals.ubicacion_bodega}
                onChange={(e) => setEditVals(v => ({ ...v, ubicacion_bodega: e.target.value }))}
              />
            </div>
          </div>
          <button
            className={styles.btnGuardar}
            onClick={guardarEdicion}
            disabled={saving}
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>

          {/* Ingreso / Ajuste */}
          <div className={styles.movForm}>
            <div className={styles.movFormRow}>
              <input
                className={`${styles.editInput} ${styles.movCantInput}`}
                type="number" min="0" step="any" placeholder="Cantidad"
                value={cantInput}
                onChange={(e) => setCantInput(e.target.value)}
              />
              <input
                className={`${styles.editInput} ${styles.movNotaInput}`}
                type="text" placeholder="Nota (opcional)"
                value={notaInput}
                onChange={(e) => setNotaInput(e.target.value)}
              />
            </div>
            {movError && <p className={styles.movError}>{movError}</p>}
            <div className={styles.movBtns}>
              <button
                className={styles.btnIngreso}
                onClick={() => insertarMovimiento("ingreso")}
                disabled={saving}
              >
                + Ingreso
              </button>
              <button
                className={styles.btnAjuste}
                onClick={() => insertarMovimiento("ajuste")}
                disabled={saving}
              >
                ⟳ Ajustar
              </button>
            </div>
          </div>

          {/* Last 5 movements */}
          {movsMini.length > 0 && (
            <div className={styles.movMini}>
              <p className={styles.movMiniTitle}>Últimos movimientos</p>
              {movsMini.map((mv) => (
                <div key={mv.id} className={styles.movMiniRow}>
                  <span className={
                    mv.tipo === "ingreso" ? styles.movPos :
                    mv.tipo === "egreso"  ? styles.movNeg :
                    styles.movAdj
                  }>
                    {mv.tipo === "ingreso" ? "+" : mv.tipo === "egreso" ? "−" : "="}
                    {fNum(mv.cantidad)} {mat.unidad}
                  </span>
                  <span className={styles.movMiniMeta}>
                    {mv.tipo} · {mv.usuarios?.nombre ?? "—"} · {fFecha(mv.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── AgregarForm ───────────────────────────────────────────────

const FORM_INIT = {
  codigo: "", nombre: "", descripcion: "",
  categoria: CATEGORIAS[0], unidad: "un",
  stock_inicial: "", stock_minimo: "",
  precio_unitario: "", ubicacion_bodega: "", tags: "",
};

function AgregarForm({ plantaId, onCreado, onCerrar }) {
  const [form, setForm]   = useState(FORM_INIT);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function guardar(e) {
    e.preventDefault();
    if (!form.codigo.trim()) { setError("El código es obligatorio."); return; }
    if (!form.nombre.trim()) { setError("El nombre es obligatorio."); return; }
    setError(null);
    setSaving(true);
    const supabase = createClient();
    const { error: err } = await supabase.from("materiales").insert({
      planta_id:       plantaId,
      codigo:          form.codigo.trim().toUpperCase(),
      nombre:          form.nombre.trim(),
      descripcion:     form.descripcion.trim() || null,
      categoria:       form.categoria,
      unidad:          form.unidad,
      stock_actual:    parseFloat(form.stock_inicial)    || 0,
      stock_minimo:    parseFloat(form.stock_minimo)     || 0,
      precio_unitario: parseFloat(form.precio_unitario)  || 0,
      ubicacion_bodega: form.ubicacion_bodega.trim()     || null,
      tags: form.tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean),
    });
    if (err) {
      setError(
        err.code === "23505"
          ? "Ya existe un material con ese código en esta planta."
          : "Error al guardar. Intenta de nuevo."
      );
      setSaving(false);
      return;
    }
    onCreado();
  }

  return (
    <div
      className={styles.formOverlay}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className={styles.formCard}>
        <div className={styles.formHeader}>
          <h2 className={styles.formTitle}>Agregar material</h2>
          <button className={styles.formClose} onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <form className={styles.formBody} onSubmit={guardar}>
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Código *</label>
              <input
                className={styles.formInput}
                placeholder="Ej: ML-050"
                value={form.codigo}
                onChange={(e) => set("codigo", e.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Nombre *</label>
              <input
                className={styles.formInput}
                placeholder="Nombre del material"
                value={form.nombre}
                onChange={(e) => set("nombre", e.target.value)}
              />
            </div>
            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label className={styles.formLabel}>Descripción</label>
              <input
                className={styles.formInput}
                placeholder="Descripción breve (opcional)"
                value={form.descripcion}
                onChange={(e) => set("descripcion", e.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Categoría</label>
              <select
                className={styles.formSelect}
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value)}
              >
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Unidad</label>
              <select
                className={styles.formSelect}
                value={form.unidad}
                onChange={(e) => set("unidad", e.target.value)}
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Stock inicial</label>
              <input
                className={styles.formInput}
                type="number" min="0" step="any" placeholder="0"
                value={form.stock_inicial}
                onChange={(e) => set("stock_inicial", e.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Stock mínimo</label>
              <input
                className={styles.formInput}
                type="number" min="0" step="any" placeholder="0"
                value={form.stock_minimo}
                onChange={(e) => set("stock_minimo", e.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Precio unitario ($)</label>
              <input
                className={styles.formInput}
                type="number" min="0" step="any" placeholder="0"
                value={form.precio_unitario}
                onChange={(e) => set("precio_unitario", e.target.value)}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Ubicación bodega</label>
              <input
                className={styles.formInput}
                placeholder="Ej: Estante A1"
                value={form.ubicacion_bodega}
                onChange={(e) => set("ubicacion_bodega", e.target.value)}
              />
            </div>
            <div className={`${styles.formField} ${styles.formFieldFull}`}>
              <label className={styles.formLabel}>
                Tags <span className={styles.formHint}>(separados por coma)</span>
              </label>
              <input
                className={styles.formInput}
                placeholder="led, 18w, tubo"
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
              />
            </div>
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnGhost} onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? "Guardando…" : "Agregar material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function JefeInventarioPage() {
  const router = useRouter();

  const [plantaId, setPlantaId]           = useState(null);
  const [tab, setTab]                     = useState("stock");
  const [materiales, setMateriales]       = useState([]);
  const [movimientos, setMovimientos]     = useState([]);
  const [cargando, setCargando]           = useState(true);
  const [expandedId, setExpandedId]       = useState(null);
  const [showAgregar, setShowAgregar]     = useState(false);
  const [busqueda, setBusqueda]           = useState("");
  const [busResults, setBusResults]       = useState(null);
  const [filtroMovDesde, setFiltroMovDesde] = useState("");
  const [filtroMovHasta, setFiltroMovHasta] = useState("");
  const [filtroMovTipo, setFiltroMovTipo]   = useState("todos");
  const busTimer = useRef(null);

  // ── Loaders ────────────────────────────────────────────────

  const cargarMateriales = useCallback(async (pId) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("materiales")
      .select("*")
      .eq("planta_id", pId)
      .eq("activo", true)
      .order("nombre");
    if (data) setMateriales(data);
  }, []);

  const cargarMovimientos = useCallback(async (desde, hasta, tipo) => {
    const supabase = createClient();
    let q = supabase
      .from("movimientos_stock")
      .select("*, materiales(codigo, nombre, unidad), usuarios(nombre)")
      .gte("created_at", `${desde}T00:00:00`)
      .lte("created_at", `${hasta}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (tipo !== "todos") q = q.eq("tipo", tipo);
    const { data } = await q;
    if (data) setMovimientos(data);
  }, []);

  // ── Init ──────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("planta_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!perfil) { router.push("/login"); return; }

      const pId = perfil.planta_id;
      setPlantaId(pId);

      const hoy    = new Date();
      const hace30 = new Date();
      hace30.setDate(hoy.getDate() - 30);
      const desde = hace30.toISOString().split("T")[0];
      const hasta = hoy.toISOString().split("T")[0];
      setFiltroMovDesde(desde);
      setFiltroMovHasta(hasta);

      await Promise.all([
        cargarMateriales(pId),
        cargarMovimientos(desde, hasta, "todos"),
      ]);
      setCargando(false);
    }
    init();
  }, [router, cargarMateriales, cargarMovimientos]);

  // ── Debounced search ───────────────────────────────────────

  function handleBusqueda(texto) {
    setBusqueda(texto);
    clearTimeout(busTimer.current);
    if (!texto.trim()) { setBusResults(null); return; }
    busTimer.current = setTimeout(async () => {
      if (!plantaId) return;
      const supabase = createClient();
      const { data } = await supabase.rpc("buscar_materiales", {
        planta: plantaId,
        query:  texto.trim(),
      });
      setBusResults(data ?? []);
    }, 300);
  }

  // ── Derived data ───────────────────────────────────────────

  const alertas = useMemo(
    () => materiales.filter(m => Number(m.stock_actual) <= Number(m.stock_minimo)),
    [materiales],
  );

  const materialesOrdenados = useMemo(() => {
    if (busResults !== null) return busResults;
    const bajos = materiales.filter(m => Number(m.stock_actual) <= Number(m.stock_minimo));
    const ok    = materiales.filter(m => Number(m.stock_actual)  > Number(m.stock_minimo));
    return [...bajos, ...ok];
  }, [materiales, busResults]);

  const kpis = useMemo(() => ({
    total:      materiales.length,
    bajos:      alertas.length,
    valorTotal: materiales.reduce(
      (s, m) => s + Number(m.stock_actual) * Number(m.precio_unitario), 0
    ),
  }), [materiales, alertas]);

  function aplicarFiltros() {
    cargarMovimientos(filtroMovDesde, filtroMovHasta, filtroMovTipo);
  }

  function onUpdated() {
    if (plantaId) cargarMateriales(plantaId);
  }

  // ── Render ─────────────────────────────────────────────────

  if (cargando) return <p className={styles.cargando}>Cargando inventario…</p>;

  return (
    <>
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "stock" ? styles.tabActive : ""}`}
          onClick={() => setTab("stock")}
        >
          Stock
        </button>
        <button
          className={`${styles.tab} ${tab === "alertas" ? styles.tabActive : ""}`}
          onClick={() => setTab("alertas")}
        >
          Alertas
          {alertas.length > 0 && (
            <span className={styles.tabBadge}>{alertas.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === "movimientos" ? styles.tabActive : ""}`}
          onClick={() => setTab("movimientos")}
        >
          Movimientos
        </button>
      </div>

      <div className={styles.body}>

        {/* ── TAB STOCK ── */}
        {tab === "stock" && (
          <>
            {/* KPIs */}
            <div className={styles.kpiRow}>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Total items</div>
                <div className={styles.kpiVal}>{kpis.total}</div>
              </div>
              <div className={`${styles.kpi} ${kpis.bajos > 0 ? styles.kpiAlerta : ""}`}>
                <div className={styles.kpiLabel}>Stock bajo</div>
                <div className={`${styles.kpiVal} ${kpis.bajos > 0 ? styles.kpiValAlerta : ""}`}>
                  {kpis.bajos}
                </div>
              </div>
              <div className={styles.kpi}>
                <div className={styles.kpiLabel}>Valor bodega</div>
                <div className={styles.kpiValSm}>{fPrecio(kpis.valorTotal)}</div>
              </div>
            </div>

            {/* Search */}
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </span>
              <input
                className={styles.searchInput}
                placeholder="Buscar por nombre, código o tag…"
                value={busqueda}
                onChange={(e) => handleBusqueda(e.target.value)}
              />
              {busqueda && (
                <button
                  className={styles.searchClear}
                  onClick={() => { setBusqueda(""); setBusResults(null); }}
                  aria-label="Limpiar búsqueda"
                >
                  ×
                </button>
              )}
            </div>

            {/* Material list */}
            {materialesOrdenados.length === 0 ? (
              <p className={styles.empty}>
                {busResults !== null
                  ? "Sin resultados para esa búsqueda."
                  : "No hay materiales en el inventario."}
              </p>
            ) : (
              <div className={styles.matList}>
                {materialesOrdenados.map(mat => (
                  <MaterialCard
                    key={mat.id}
                    mat={mat}
                    expanded={expandedId === mat.id}
                    onToggle={() => setExpandedId(expandedId === mat.id ? null : mat.id)}
                    onUpdated={onUpdated}
                    plantaId={plantaId}
                  />
                ))}
              </div>
            )}

            <button className={styles.fab} onClick={() => setShowAgregar(true)}>
              + Material
            </button>
          </>
        )}

        {/* ── TAB ALERTAS ── */}
        {tab === "alertas" && (
          <>
            {alertas.length === 0 ? (
              <p className={styles.empty}>No hay materiales con stock bajo. ✓</p>
            ) : (
              <div className={styles.alertaList}>
                {alertas.map(m => {
                  const esCrit = Number(m.stock_actual) <= 0;
                  const ultimoEgreso = movimientos.find(
                    mv => mv.material_id === m.id && mv.tipo === "egreso"
                  );
                  return (
                    <div
                      key={m.id}
                      className={`${styles.alertaCard} ${esCrit ? styles.alertaCardCritico : ""}`}
                    >
                      <div className={styles.alertaTop}>
                        <div className={styles.alertaNames}>
                          <span className={styles.matNombre}>{m.nombre}</span>
                          <span className={styles.matCodigo}>{m.codigo}</span>
                        </div>
                        <span className={`${styles.alertaBadge} ${esCrit ? styles.alertaBadgeCritico : styles.alertaBadgeBajo}`}>
                          {esCrit ? "Crítico" : "Bajo"}
                        </span>
                      </div>
                      <div className={styles.alertaStock}>
                        <span className={esCrit ? styles.stockNumRojo : styles.stockNumAmarillo}>
                          {fNum(m.stock_actual)} {m.unidad} en stock
                        </span>
                        <span className={styles.matStockMin}>
                          mín {fNum(m.stock_minimo)} {m.unidad}
                        </span>
                      </div>
                      {ultimoEgreso && (
                        <p className={styles.alertaUso}>
                          Último uso: {fFecha(ultimoEgreso.created_at)}
                          {ultimoEgreso.usuarios?.nombre
                            ? ` — ${ultimoEgreso.usuarios.nombre}`
                            : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── TAB MOVIMIENTOS ── */}
        {tab === "movimientos" && (
          <>
            <div className={styles.filtros}>
              <div className={styles.filtroGroup}>
                <label>Desde</label>
                <input
                  type="date"
                  value={filtroMovDesde}
                  onChange={(e) => setFiltroMovDesde(e.target.value)}
                />
              </div>
              <div className={styles.filtroGroup}>
                <label>Hasta</label>
                <input
                  type="date"
                  value={filtroMovHasta}
                  onChange={(e) => setFiltroMovHasta(e.target.value)}
                />
              </div>
              <div className={styles.filtroGroup}>
                <label>Tipo</label>
                <select
                  value={filtroMovTipo}
                  onChange={(e) => setFiltroMovTipo(e.target.value)}
                >
                  <option value="todos">Todos</option>
                  <option value="ingreso">Ingreso</option>
                  <option value="egreso">Egreso</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>
              <div className={styles.filtroGroup}>
                <label>&nbsp;</label>
                <button className={styles.btnFiltrar} onClick={aplicarFiltros}>
                  Aplicar
                </button>
              </div>
            </div>

            {movimientos.length === 0 ? (
              <p className={styles.empty}>No hay movimientos en este período.</p>
            ) : (
              <div className={styles.movList}>
                {movimientos.map(mv => (
                  <div key={mv.id} className={styles.movRow}>
                    <div className={styles.movLeft}>
                      <span className={styles.movNombre}>
                        {mv.materiales?.nombre ?? "—"}
                      </span>
                      <div className={styles.movMeta}>
                        {mv.materiales?.codigo && (
                          <span className={styles.matCodigo}>{mv.materiales.codigo}</span>
                        )}
                        {mv.usuarios?.nombre && (
                          <span>{mv.usuarios.nombre}</span>
                        )}
                        {mv.orden_id && (
                          <span className={styles.movOrdenTag}>OT</span>
                        )}
                        <span>{fFecha(mv.created_at)}</span>
                      </div>
                    </div>
                    <div className={styles.movRight}>
                      <span className={
                        mv.tipo === "ingreso" ? styles.movPos :
                        mv.tipo === "egreso"  ? styles.movNeg :
                        styles.movAdj
                      }>
                        {mv.tipo === "ingreso" ? "+" : mv.tipo === "egreso" ? "−" : "="}
                        {fNum(mv.cantidad)}{" "}
                        {mv.materiales?.unidad ?? ""}
                      </span>
                      <span className={styles.movTipoTag}>{mv.tipo}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>

      {showAgregar && plantaId && (
        <AgregarForm
          plantaId={plantaId}
          onCreado={() => {
            setShowAgregar(false);
            cargarMateriales(plantaId);
          }}
          onCerrar={() => setShowAgregar(false)}
        />
      )}
    </>
  );
}
