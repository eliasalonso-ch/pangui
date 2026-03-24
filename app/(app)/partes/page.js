"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, X, ChevronRight, Boxes, MapPin, User,
  Pencil, Trash2, FileText, Image, Upload,
  ChevronDown, Check, AlertTriangle, Package,
  Building2, Tag, Link2, AlertCircle, DollarSign,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

// ── Image compression ─────────────────────────────────────────
function comprimirImagen(file, maxPx = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else                 { width  = Math.round(width  * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })), "image/jpeg", quality);
    };
    img.src = url;
  });
}

// ── Helpers ───────────────────────────────────────────────────

function fCLP(n) {
  return `CLP $${Number(n ?? 0).toLocaleString("es-CL")}`;
}

function stockEstado(actual, minimo) {
  if (Number(actual) <= 0) return "critico";
  if (!minimo || Number(minimo) <= 0) return "ok";
  const r = Number(actual) / Number(minimo);
  if (r < 1) return "bajo";
  if (r < 1.5) return "ok";
  return "ok";
}

function StockDot({ actual, minimo }) {
  const estado = stockEstado(actual, minimo);
  const color = estado === "critico" ? "#EF4444" : estado === "bajo" ? "#F97316" : "#22C55E";
  return <span className={styles.stockDot} style={{ background: color }} />;
}

// ── Combobox con opción "Crear nuevo" ─────────────────────────
function ComboCrear({ label, items, value, onChange, onCreate, placeholder = "Buscar o crear…", renderItem = (i) => i.nombre }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = items.find((i) => i.id === value);
  const filtered = items.filter((i) => i.nombre?.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className={styles.combo} ref={ref}>
      <button type="button" className={styles.comboTrigger} onClick={() => setOpen((v) => !v)}>
        <span>{selected ? renderItem(selected) : <span className={styles.comboPlaceholder}>{placeholder}</span>}</span>
        <ChevronDown size={14} className={styles.comboChevron} />
      </button>
      {open && (
        <div className={styles.comboDropdown}>
          <input
            autoFocus
            className={styles.comboSearch}
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className={styles.comboList}>
            {value && (
              <button className={styles.comboItem} onClick={() => { onChange(""); setOpen(false); }}>
                <X size={12} /> <span>Limpiar selección</span>
              </button>
            )}
            {filtered.map((i) => (
              <button key={i.id} className={`${styles.comboItem} ${i.id === value ? styles.comboItemActive : ""}`}
                onClick={() => { onChange(i.id); setOpen(false); setQuery(""); }}>
                {i.id === value && <Check size={12} />}
                <span>{renderItem(i)}</span>
              </button>
            ))}
            {filtered.length === 0 && query && !creating && (
              <p className={styles.comboEmpty}>Sin resultados para "{query}"</p>
            )}
          </div>
          {!creating ? (
            <button className={styles.comboCrearBtn} onClick={() => { setCreating(true); setNewName(query); }}>
              <Plus size={13} /> Crear "{query || "nuevo"}"
            </button>
          ) : (
            <div className={styles.comboCrearRow}>
              <input
                autoFocus
                className={styles.comboCrearInput}
                placeholder={`Nombre del nuevo ${label.toLowerCase()}`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    const id = await onCreate(newName.trim());
                    if (id) { onChange(id); setOpen(false); setQuery(""); setCreating(false); setNewName(""); }
                  }
                  if (e.key === "Escape") setCreating(false);
                }}
              />
              <button className={styles.comboCrearOk} onClick={async () => {
                if (!newName.trim()) return;
                const id = await onCreate(newName.trim());
                if (id) { onChange(id); setOpen(false); setQuery(""); setCreating(false); setNewName(""); }
              }}>Crear</button>
              <button className={styles.comboCrearCancel} onClick={() => setCreating(false)}><X size={13} /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty form ─────────────────────────────────────────────────
const emptyParte = {
  nombre: "", descripcion: "", codigo: "",
  tipo_parte_id: "", precio_unitario: "",
  ubicacion_id: "", stock_actual: "", stock_minimo: "",
  activo_id: "", grupo_responsable: "", proveedor_id: "",
};

// ── Componente principal ──────────────────────────────────────

export default function PartesPage() {
  const router = useRouter();

  const [plantaId,    setPlantaId]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [isDesktop,   setIsDesktop]   = useState(false);

  // Lists
  const [partes,      setPartes]      = useState([]);
  const [tiposParte,  setTiposParte]  = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [activos,     setActivos]     = useState([]);
  const [proveedores, setProveedores] = useState([]);

  // Panel state
  const [selected,     setSelected]     = useState(null);
  const [panelMode,    setPanelMode]    = useState(null); // null | view | create | edit
  const [parteData,    setParteData]    = useState(null);
  const [loadingPanel, setLoadingPanel] = useState(false);

  // Form
  const [form,    setForm]    = useState(emptyParte);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  // File uploads
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const imgRef  = useRef(null);
  const fileRef = useRef(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [adjFile,    setAdjFile]    = useState(null);

  // Search / filter
  const [busqueda,    setBusqueda]    = useState("");
  const [filtroStock, setFiltroStock] = useState("todos"); // todos|agotado|bajo|ok
  const [ajustando,   setAjustando]   = useState(false);

  // Confirm delete
  const [parteConfirm, setParteConfirm] = useState(null);

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  const cargarPartes = useCallback(async (pId) => {
    const sb = createClient();
    const { data } = await sb
      .from("partes")
      .select("*, tipos_parte(nombre), ubicaciones(edificio,piso), activos(nombre,codigo), proveedores(nombre)")
      .eq("workspace_id", pId)
      .eq("activo", true)
      .order("nombre");
    setPartes(data ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      const pId = perfil?.workspace_id;
      if (!pId) return;
      setPlantaId(pId);

      const val = (r) => r.status === "fulfilled" ? (r.value?.data ?? []) : [];

      const results = await Promise.allSettled([
        sb.from("partes").select("*, tipos_parte(nombre), ubicaciones(edificio,piso), activos(nombre,codigo), proveedores(nombre)").eq("workspace_id", pId).eq("activo", true).order("nombre"),
        sb.from("tipos_parte").select("id,nombre").order("nombre"),
        sb.from("ubicaciones").select("id,edificio,piso").eq("workspace_id", pId).eq("activa", true).order("edificio"),
        sb.from("activos").select("id,nombre,codigo").eq("workspace_id", pId).eq("activo", true).order("nombre"),
        sb.from("proveedores").select("id,nombre").eq("workspace_id", pId).order("nombre"),
      ]);

      setPartes(val(results[0]));
      setTiposParte(val(results[1]));
      setUbicaciones(val(results[2]));
      setActivos(val(results[3]));
      setProveedores(val(results[4]));
      setLoading(false);
    }
    init();
  }, []);

  // ── Inline create helpers ─────────────────────────────────────
  async function crearTipoParte(nombre) {
    const sb = createClient();
    const { data } = await sb.from("tipos_parte").insert({ nombre }).select("id").maybeSingle();
    if (data?.id) {
      setTiposParte((p) => [...p, { id: data.id, nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      return data.id;
    }
    return null;
  }

  async function crearProveedor(nombre) {
    if (!plantaId) return null;
    const sb = createClient();
    const { data } = await sb.from("proveedores").insert({ nombre, workspace_id: plantaId }).select("id").maybeSingle();
    if (data?.id) {
      setProveedores((p) => [...p, { id: data.id, nombre }].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      return data.id;
    }
    return null;
  }

  // ── Panel open ────────────────────────────────────────────────
  function abrirParte(parte) {
    setSelected(parte.id);
    setPanelMode("view");
    setParteData(parte);
  }

  function abrirCrear() {
    setSelected(null);
    setParteData(null);
    setForm({ ...emptyParte });
    setImgPreview(null);
    setImgFile(null);
    setAdjFile(null);
    setSaveErr(null);
    setPanelMode("create");
  }

  function abrirEditar(parte) {
    setParteData(parte);
    setForm({
      nombre:           parte.nombre ?? "",
      descripcion:      parte.descripcion ?? "",
      codigo:           parte.codigo ?? "",
      tipo_parte_id:    parte.tipo_parte_id ?? "",
      precio_unitario:  parte.precio_unitario ?? "",
      ubicacion_id:     parte.ubicacion_id ?? "",
      stock_actual:     parte.stock_actual ?? "",
      stock_minimo:     parte.stock_minimo ?? "",
      activo_id:        parte.activo_id ?? "",
      grupo_responsable: parte.grupo_responsable ?? "",
      proveedor_id:     parte.proveedor_id ?? "",
    });
    setImgPreview(parte.imagen_url ?? null);
    setImgFile(null);
    setAdjFile(null);
    setSaveErr(null);
    setPanelMode("edit");
  }

  // ── Save ──────────────────────────────────────────────────────
  async function guardarParte() {
    if (!form.nombre.trim()) { setSaveErr("El nombre es obligatorio."); return; }
    setSaving(true);
    setSaveErr(null);
    const sb = createClient();

    let imagen_url = parteData?.imagen_url ?? null;
    let archivo_url = parteData?.archivo_url ?? null;
    let archivo_nombre = parteData?.archivo_nombre ?? null;

    // Upload image
    if (imgFile) {
      setUploadingImg(true);
      const ext = imgFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { data: up, error: upErr } = await sb.storage.from("partes-imagenes").upload(path, imgFile, { upsert: true });
      if (upErr) { setSaveErr(`Error al subir imagen: ${upErr.message}`); setSaving(false); setUploadingImg(false); return; }
      if (up?.path) {
        const { data: pub } = sb.storage.from("partes-imagenes").getPublicUrl(up.path);
        imagen_url = pub?.publicUrl ?? null;
      }
      setUploadingImg(false);
    }

    // Upload file
    if (adjFile) {
      setUploadingFile(true);
      const ext = adjFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { data: up, error: upErr } = await sb.storage.from("partes-archivos").upload(path, adjFile, { upsert: true });
      if (upErr) { setSaveErr(`Error al subir archivo: ${upErr.message}`); setSaving(false); setUploadingFile(false); return; }
      if (up?.path) {
        const { data: pub } = sb.storage.from("partes-archivos").getPublicUrl(up.path);
        archivo_url = pub?.publicUrl ?? null;
        archivo_nombre = adjFile.name;
      }
      setUploadingFile(false);
    }

    const payload = {
      nombre:           form.nombre.trim(),
      descripcion:      form.descripcion.trim() || null,
      codigo:           form.codigo.trim() || null,
      tipo_parte_id:    form.tipo_parte_id || null,
      precio_unitario:  parseFloat(form.precio_unitario) || 0,
      ubicacion_id:     form.ubicacion_id || null,
      stock_actual:     parseFloat(form.stock_actual) || 0,
      stock_minimo:     parseFloat(form.stock_minimo) || 0,
      activo_id:        form.activo_id || null,
      grupo_responsable: form.grupo_responsable.trim() || null,
      proveedor_id:     form.proveedor_id || null,
      imagen_url,
      archivo_url,
      archivo_nombre,
    };

    let err = null;
    if (panelMode === "create") {
      const r = await sb.from("partes").insert({ ...payload, workspace_id: plantaId });
      err = r.error;
    } else {
      const r = await sb.from("partes").update(payload).eq("id", parteData.id);
      err = r.error;
    }

    setSaving(false);
    if (err) { setSaveErr("Error al guardar. Intenta de nuevo."); return; }

    await cargarPartes(plantaId);
    setPanelMode(null);
    setSelected(null);
    setParteData(null);
  }

  // ── Delete ────────────────────────────────────────────────────
  async function eliminarParte(parte) {
    const sb = createClient();
    await sb.from("partes").update({ activo: false }).eq("id", parte.id);
    setParteConfirm(null);
    setPanelMode(null);
    setSelected(null);
    setParteData(null);
    await cargarPartes(plantaId);
  }

  // ── Quick stock adjust ────────────────────────────────────────
  async function ajustarStock(parte, delta) {
    if (ajustando) return;
    setAjustando(true);
    const sb = createClient();
    const nuevo = Math.max(0, Number(parte.stock_actual ?? 0) + delta);
    await sb.from("partes").update({ stock_actual: nuevo }).eq("id", parte.id);
    const updated = { ...parte, stock_actual: nuevo };
    setParteData(updated);
    setPartes((prev) => prev.map((p) => p.id === parte.id ? updated : p));
    setAjustando(false);
  }

  // ── Filtered list ─────────────────────────────────────────────
  const STOCK_FILTRO = {
    agotado: (p) => stockEstado(p.stock_actual, p.stock_minimo) === "critico",
    bajo:    (p) => stockEstado(p.stock_actual, p.stock_minimo) === "bajo",
    ok:      (p) => stockEstado(p.stock_actual, p.stock_minimo) === "ok",
  };
  const cntAgotado = partes.filter(STOCK_FILTRO.agotado).length;
  const cntBajo    = partes.filter(STOCK_FILTRO.bajo).length;

  const partesFiltradas = partes
    .filter((p) => !busqueda || p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo?.toLowerCase().includes(busqueda.toLowerCase()))
    .filter((p) => filtroStock === "todos" || STOCK_FILTRO[filtroStock]?.(p));

  // ── Render ────────────────────────────────────────────────────
  if (loading) return <div className={styles.loadingScreen}>Cargando bodega…</div>;

  return (
    <div className={styles.root}>
      <div className={styles.splitLayout}>

        {/* Left: list — hidden on mobile when panel is open */}
        <div className={`${styles.listPanel} ${panelMode !== null && !isDesktop ? styles.listPanelHidden : ""}`}>
          <div className={styles.listHeader}>
            <h1 className={styles.listTitle}>Partes</h1>
            <button className={styles.btnNuevo} onClick={abrirCrear}>
              <Plus size={14} /> Nueva parte
            </button>
          </div>

          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Buscar por nombre o código…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button className={styles.searchClear} onClick={() => setBusqueda("")} aria-label="Limpiar">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Stock filter chips */}
          <div className={styles.filterBar}>
            {[
              { id: "todos",   label: "Todas" },
              { id: "agotado", label: `Agotadas${cntAgotado > 0 ? ` (${cntAgotado})` : ""}`, color: "#EF4444" },
              { id: "bajo",    label: `Stock bajo${cntBajo > 0 ? ` (${cntBajo})` : ""}`,     color: "#F97316" },
            ].map(({ id, label, color }) => (
              <button
                key={id}
                className={`${styles.filterChip} ${filtroStock === id ? styles.filterChipActive : ""}`}
                style={filtroStock === id && color ? { background: color + "18", color, borderColor: color + "44" } : {}}
                onClick={() => setFiltroStock(id)}
              >
                {id !== "todos" && <span className={styles.filterDot} style={{ background: color }} />}
                {label}
              </button>
            ))}
          </div>

          <div className={styles.parteList}>
            {partesFiltradas.length === 0 ? (
              <div className={styles.emptyState}>
                <Boxes size={40} style={{ opacity: 0.12 }} />
                <p>{busqueda ? `Sin repuestos que coincidan con "${busqueda}".` : filtroStock !== "todos" ? "Sin repuestos en esta categoría." : "No hay repuestos registrados.\nAgrega el primer repuesto a la bodega."}</p>
              </div>
            ) : (
              partesFiltradas.map((p) => (
                <button
                  key={p.id}
                  className={`${styles.parteCard} ${selected === p.id ? styles.parteCardActive : ""}`}
                  onClick={() => abrirParte(p)}
                >
                  {p.imagen_url ? (
                    <img src={p.imagen_url} alt={p.nombre} className={styles.parteThumb} />
                  ) : (
                    <div className={styles.parteThumbPlaceholder}>
                      <Boxes size={20} />
                    </div>
                  )}
                  <div className={styles.parteCardInfo}>
                    <div className={styles.parteCardTop}>
                      <span className={styles.parteCardName}>{p.nombre}</span>
                    </div>
                    {p.tipos_parte?.nombre && (
                      <span className={styles.tipoBadge}>{p.tipos_parte.nombre}</span>
                    )}
                    <div className={styles.parteCardMeta}>
                      {p.codigo && <span className={styles.parteCardCodigo}>{p.codigo}</span>}
                      <span className={styles.stockCount}>
                        <StockDot actual={p.stock_actual} minimo={p.stock_minimo} />
                        {Number(p.stock_actual ?? 0).toLocaleString("es-CL")} {p.unidad ?? "uds"}
                      </span>
                    </div>
                  </div>
                  {!isDesktop && <ChevronRight size={15} className={styles.parteChevron} />}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: panel — desktop inline, mobile full-screen overlay */}
        {(isDesktop || panelMode !== null) && (
          <div className={panelMode !== null && !isDesktop ? styles.mobileOverlay : styles.detailPanel}>
            {panelMode === null && (
              <div className={styles.emptyPanel}>
                <Boxes size={48} style={{ opacity: 0.12 }} />
                <p>Selecciona una parte o crea una nueva</p>
              </div>
            )}
            {loadingPanel && panelMode === "view" && (
              <div className={styles.emptyPanel}><p>Cargando…</p></div>
            )}
            {panelMode === "view" && parteData && !loadingPanel && (
              <PanelVer
                parte={parteData}
                ajustando={ajustando}
                onAjustarStock={(delta) => ajustarStock(parteData, delta)}
                onEditar={() => abrirEditar(parteData)}
                onEliminar={() => setParteConfirm(parteData)}
                onCerrar={() => { setPanelMode(null); setSelected(null); }}
              />
            )}
            {(panelMode === "create" || panelMode === "edit") && (
              <PanelForm
                mode={panelMode}
                form={form} setForm={setForm}
                tiposParte={tiposParte} ubicaciones={ubicaciones}
                activos={activos} proveedores={proveedores}
                crearTipoParte={crearTipoParte} crearProveedor={crearProveedor}
                imgPreview={imgPreview} setImgPreview={setImgPreview}
                imgRef={imgRef} fileRef={fileRef}
                setImgFile={setImgFile} setAdjFile={setAdjFile}
                adjFile={adjFile}
                saving={saving} uploadingImg={uploadingImg} uploadingFile={uploadingFile}
                saveErr={saveErr}
                parteData={parteData}
                onGuardar={guardarParte}
                onCerrar={() => { setPanelMode(parteData ? "view" : null); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Confirm delete */}
      {parteConfirm && (
        <>
          <div className={styles.overlay} onClick={() => setParteConfirm(null)} />
          <div className={styles.confirmModal}>
            <AlertCircle size={32} style={{ color: "#EF4444", marginBottom: 8 }} />
            <p className={styles.confirmText}>¿Archivar <strong>{parteConfirm.nombre}</strong>?</p>
            <p className={styles.confirmSub}>La parte se desactivará pero no se eliminará de la base de datos.</p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnSecundario} onClick={() => setParteConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminarParte(parteConfirm)}>Archivar</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Panel Ver ─────────────────────────────────────────────────

function PanelVer({ parte, ajustando, onAjustarStock, onEditar, onEliminar, onCerrar }) {
  const stockOk = stockEstado(parte.stock_actual, parte.stock_minimo);
  const stockColor = stockOk === "critico" ? "#EF4444" : stockOk === "bajo" ? "#F97316" : "#22C55E";
  const stockLabel = stockOk === "critico" ? "Agotada" : stockOk === "bajo" ? "Existencias bajas" : "En existencia";
  const unidad = parte.unidad ?? "uds";

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelTitle}>{parte.nombre}</span>
          {parte.codigo && <span className={styles.panelSubId}>{parte.codigo}</span>}
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEditar}><Pencil size={15} /></button>
          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onEliminar}><Trash2 size={15} /></button>
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {parte.imagen_url && (
          <div className={styles.detImgWrap}>
            <img src={parte.imagen_url} alt={parte.nombre} className={styles.detImg} />
          </div>
        )}

        {/* Stock status + quick adjust */}
        <div className={styles.stockBlock}>
          <span className={styles.stockBadgeLg} style={{ background: stockColor + "20", color: stockColor }}>
            <span className={styles.stockDotLg} style={{ background: stockColor }} />
            {stockLabel}
          </span>
          <div className={styles.stockAjuste}>
            <button className={styles.stockAjusteBtn} onClick={() => onAjustarStock(-1)} disabled={ajustando || Number(parte.stock_actual) <= 0}>−</button>
            <span className={styles.stockAjusteNum}>
              {Number(parte.stock_actual ?? 0).toLocaleString("es-CL")} <span className={styles.stockAjusteUnidad}>{unidad}</span>
            </span>
            <button className={styles.stockAjusteBtn} onClick={() => onAjustarStock(1)} disabled={ajustando}>+</button>
          </div>
          {parte.stock_minimo > 0 && (
            <p className={styles.stockMinLabel}>Mínimo bodega: {Number(parte.stock_minimo).toLocaleString("es-CL")} {unidad}</p>
          )}
        </div>

        {/* Meta grid */}
        <div className={styles.metaGrid}>
          {parte.tipos_parte?.nombre && <MetaItem icon={Tag} label="Tipo de repuesto" value={parte.tipos_parte.nombre} />}
          {parte.precio_unitario > 0 && <MetaItem icon={DollarSign} label="Costo unitario" value={fCLP(parte.precio_unitario)} />}
          {parte.ubicaciones?.edificio && <MetaItem icon={MapPin} label="Ubicación en bodega" value={`${parte.ubicaciones.edificio}${parte.ubicaciones.piso ? `, piso ${parte.ubicaciones.piso}` : ""}`} />}
          {parte.activos?.nombre && <MetaItem icon={Link2} label="Equipo asociado" value={parte.activos.nombre + (parte.activos.codigo ? ` (${parte.activos.codigo})` : "")} />}
          {parte.proveedores?.nombre && <MetaItem icon={Building2} label="Proveedor" value={parte.proveedores.nombre} />}
          {parte.grupo_responsable && <MetaItem icon={User} label="Área responsable" value={parte.grupo_responsable} />}
        </div>

        {/* Descripción */}
        {parte.descripcion && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Descripción</p>
            <p className={styles.detText}>{parte.descripcion}</p>
          </div>
        )}

        {/* Archivo adjunto */}
        {parte.archivo_url && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Archivo adjunto</p>
            <a href={parte.archivo_url} target="_blank" rel="noopener noreferrer" className={styles.adjuntoLink}>
              <FileText size={14} />
              {parte.archivo_nombre ?? "Ver archivo"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }) {
  return (
    <div className={styles.metaItem}>
      <Icon size={14} className={styles.metaIcon} />
      <div>
        <span className={styles.metaKey}>{label}</span>
        <span className={styles.metaVal}>{value}</span>
      </div>
    </div>
  );
}

// ── Panel Form ────────────────────────────────────────────────

function PanelForm({
  mode, form, setForm,
  tiposParte, ubicaciones, activos, proveedores,
  crearTipoParte, crearProveedor,
  imgPreview, setImgPreview, imgRef, fileRef,
  setImgFile, setAdjFile, adjFile,
  saving, uploadingImg, uploadingFile,
  saveErr, parteData,
  onGuardar, onCerrar,
}) {
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleImg(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const compressed = await comprimirImagen(f);
    setImgFile(compressed);
    setImgPreview(URL.createObjectURL(compressed));
  }

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAdjFile(f);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelTitle}>{mode === "create" ? "Nueva parte" : "Editar parte"}</span>
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {/* Imagen */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Imagen</label>
          <div className={styles.imgUploadArea} onClick={() => imgRef.current?.click()}>
            {imgPreview ? (
              <img src={imgPreview} alt="preview" className={styles.imgPreview} />
            ) : (
              <>
                <Image size={24} style={{ opacity: 0.3 }} />
                <span className={styles.imgUploadHint}>Toca para subir imagen</span>
              </>
            )}
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImg} />
        </div>

        {/* Nombre */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nombre *</label>
          <input className={styles.formInput} placeholder="Ej: Rodamiento SKF 6205" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </div>

        {/* Descripción */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción</label>
          <textarea className={styles.formTextarea} placeholder="Descripción breve de la parte…" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
        </div>

        {/* Código interno */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Código interno</label>
          <input className={styles.formInput} placeholder="Ej: ROD-001" value={form.codigo} onChange={(e) => set("codigo", e.target.value)} />
        </div>

        {/* Tipo de parte */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Tipo de parte</label>
          <ComboCrear
            label="tipo de parte"
            items={tiposParte}
            value={form.tipo_parte_id}
            onChange={(v) => set("tipo_parte_id", v)}
            onCreate={crearTipoParte}
            placeholder="Seleccionar tipo…"
          />
        </div>

        {/* Costo unitario */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Costo unitario (CLP $)</label>
          <div className={styles.inputPrefixWrap}>
            <span className={styles.inputPrefix}>CLP $</span>
            <input
              className={`${styles.formInput} ${styles.inputWithPrefix}`}
              type="number" min="0" step="1" placeholder="0"
              value={form.precio_unitario}
              onChange={(e) => set("precio_unitario", e.target.value)}
            />
          </div>
        </div>

        {/* Ubicación */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Ubicación en bodega</label>
          <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => set("ubicacion_id", e.target.value)}>
            <option value="">— Sin ubicación —</option>
            {ubicaciones.map((u) => (
              <option key={u.id} value={u.id}>{u.edificio}{u.piso ? `, piso ${u.piso}` : ""}</option>
            ))}
          </select>
        </div>

        {/* Stock actual + mínimo */}
        <div className={`${styles.formField} ${styles.fieldRow2}`}>
          <div>
            <label className={styles.formLabel}>Unidades en existencia</label>
            <input className={styles.formInput} type="number" min="0" step="1" placeholder="0" value={form.stock_actual} onChange={(e) => set("stock_actual", e.target.value)} />
          </div>
          <div>
            <label className={styles.formLabel}>Unidades mínimas</label>
            <input className={styles.formInput} type="number" min="0" step="1" placeholder="0" value={form.stock_minimo} onChange={(e) => set("stock_minimo", e.target.value)} />
          </div>
        </div>

        {/* Activo */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Activo al que pertenece</label>
          <select className={styles.formSelect} value={form.activo_id} onChange={(e) => set("activo_id", e.target.value)}>
            <option value="">— Ninguno —</option>
            {activos.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}{a.codigo ? ` (${a.codigo})` : ""}</option>
            ))}
          </select>
        </div>

        {/* Grupo responsable */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Área responsable</label>
          <input className={styles.formInput} placeholder="Ej: Área eléctrica" value={form.grupo_responsable} onChange={(e) => set("grupo_responsable", e.target.value)} />
        </div>

        {/* Proveedor */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Proveedor</label>
          <ComboCrear
            label="proveedor"
            items={proveedores}
            value={form.proveedor_id}
            onChange={(v) => set("proveedor_id", v)}
            onCreate={crearProveedor}
            placeholder="Seleccionar proveedor…"
          />
        </div>

        {/* Archivo adjunto */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Archivo adjunto</label>
          <button type="button" className={styles.adjuntoBtn} onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            {adjFile ? adjFile.name : parteData?.archivo_nombre ?? "Subir archivo (PDF, imagen…)"}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style={{ display: "none" }} onChange={handleFile} />
        </div>

        {saveErr && <p className={styles.formError}>{saveErr}</p>}
      </div>

      <div className={styles.panelFooter}>
        <button className={styles.btnSecundario} onClick={onCerrar} disabled={saving}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onGuardar} disabled={saving || uploadingImg || uploadingFile}>
          {saving || uploadingImg || uploadingFile ? "Guardando…" : mode === "create" ? "Crear parte" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
