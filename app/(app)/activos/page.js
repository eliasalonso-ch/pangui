"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, X, ChevronRight, Package, MapPin, User,
  Pencil, Trash2, FileText, Image, Upload, QrCode, Printer,
  ChevronDown, Check, AlertTriangle, ShieldAlert, Shield,
  Building2, Calendar, Hash, Tag, Layers, Link2, Wrench,
  ExternalLink, Server, BarChart2, AlertCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";
import { limitesParaPlan } from "@/lib/planes";

// ── Constants ─────────────────────────────────────────────────

const CRITICIDAD_LABEL = { critico: "Crítico", semi_critico: "Semi-crítico", no_critico: "No crítico" };
const CRITICIDAD_COLOR = { critico: "#EF4444", semi_critico: "#F97316", no_critico: "#22C55E" };
const CRITICIDAD_BG    = { critico: "#FEE2E2", semi_critico: "#FFEDD5", no_critico: "#DCFCE7" };

const ESTADO_LABEL = { operativo: "Operativo", en_mantencion: "En mantención", fuera_servicio: "Fuera de servicio" };
const ESTADO_COLOR = { operativo: "#22C55E", en_mantencion: "#F97316", fuera_servicio: "#EF4444" };
const ESTADO_BG    = { operativo: "#DCFCE7", en_mantencion: "#FFEDD5", fuera_servicio: "#FEE2E2" };

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

const emptyActivo = {
  nombre: "", descripcion: "", codigo: "", ubicacion_id: "",
  fabricante_id: "", modelo_id: "", proveedor_id: "",
  responsable_id: "", activo_padre_id: "",
  numero_serie: "", año_fabricacion: "", criticidad: "no_critico",
  codigo_sap: "", fecha_garantia: "", estado: "operativo",
};

// ── Helpers ───────────────────────────────────────────────────

function stockEstado(m) {
  if (!m.stock_minimo) return "ok";
  if (m.stock_actual <= m.stock_minimo) return "critico";
  if (m.stock_actual <= m.stock_minimo * 1.5) return "bajo";
  return "ok";
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

// ── Componente principal ──────────────────────────────────────

export default function ActivosDashboard() {
  const router = useRouter();

  // Auth / plant
  const [plantaId,   setPlantaId]   = useState(null);
  const [myId,       setMyId]       = useState(null);
  const [plan,       setPlan]       = useState(null);
  const [planStatus, setPlanStatus] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);

  // Lists
  const [activos,     setActivos]     = useState([]);
  const [materiales,  setMateriales]  = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [fabricantes, setFabricantes] = useState([]);
  const [modelos,     setModelos]     = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [usuarios,    setUsuarios]    = useState([]);

  // Panel state (activos tab)
  const [selected,     setSelected]     = useState(null);
  const [panelMode,    setPanelMode]    = useState(null); // null | view | create | edit
  const [activoData,   setActivoData]   = useState(null);
  const [activoPartes, setActivoPartes] = useState([]);
  const [loadingPanel, setLoadingPanel] = useState(false);

  // Forms
  const [form,    setForm]    = useState(emptyActivo);
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

  // Search
  const [busqueda,    setBusqueda]    = useState("");
  const [filtroEstado,  setFiltroEstado]  = useState("todos"); // todos|operativo|en_mantencion|fuera_servicio
  const [cambiandoEstado, setCambiandoEstado] = useState(false);

  // Partes picker (in activo form)
  const [partePicker,   setPartePicker]   = useState(false);
  const [parteSearch,   setParteSearch]   = useState("");
  const [partesForm,    setPartesForm]    = useState([]); // [{material_id, nombre, cantidad_recomendada}]

  // Activo confirm delete
  const [activoConfirm, setActivoConfirm] = useState(null);

  // ── Init ─────────────────────────────────────────────────────
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
      const { data: perfil } = await sb.from("usuarios").select("workspace_id, plan, plan_status").eq("id", user.id).maybeSingle();
      const effectivePlantaId = perfil?.workspace_id;
      if (!effectivePlantaId) return;
      setPlantaId(effectivePlantaId);
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);

      const results = await Promise.allSettled([
        sb.from("activos").select("*, ubicaciones(edificio,piso), fabricantes(nombre), modelos(nombre), usuarios!responsable_id(nombre)").eq("workspace_id", perfil.workspace_id).eq("activo", true).order("nombre"),
        sb.from("partes").select("*").eq("workspace_id", perfil.workspace_id).order("nombre"),
        sb.from("ubicaciones").select("id,edificio,piso").eq("workspace_id", perfil.workspace_id).eq("activa", true).order("edificio"),
        sb.from("fabricantes").select("id,nombre,pais").order("nombre"),
        sb.from("modelos").select("id,nombre,fabricante_id").order("nombre"),
        sb.from("proveedores").select("id,nombre,contacto,email,telefono").eq("workspace_id", perfil.workspace_id).order("nombre"),
        sb.from("usuarios").select("id,nombre,rol").eq("workspace_id", perfil.workspace_id).eq("activo", true).order("nombre"),
      ]);

      const val = (r) => r.status === "fulfilled" ? (r.value?.data ?? []) : [];
      setActivos(val(results[0]));
      setMateriales(val(results[1]));
      setUbicaciones(val(results[2]));
      setFabricantes(val(results[3]));
      setModelos(val(results[4]));
      setProveedores(val(results[5]));
      setUsuarios(val(results[6]));
      setLoading(false);
    }
    init();
  }, []);

  // ── Panel: abrir activo ───────────────────────────────────────
  async function abrirActivo(activo) {
    setSelected(activo.id);
    setPanelMode("view");
    setActivoData(activo);
    setLoadingPanel(true);
    const sb = createClient();
    let partes = [];
    try {
      const { data } = await sb.from("activo_materiales")
        .select("id, cantidad_recomendada, partes(id, nombre, codigo, unidad)")
        .eq("activo_id", activo.id).order("created_at");
      partes = data ?? [];
    } catch { /* tabla no creada aún */ }
    setActivoPartes(partes);
    setLoadingPanel(false);
  }

  function abrirCrear() {
    setSelected(null);
    setActivoData(null);
    setForm({ ...emptyActivo });
    setPartesForm([]);
    setImgPreview(null);
    setImgFile(null);
    setAdjFile(null);
    setSaveErr(null);
    setPanelMode("create");
  }

  function abrirEditar(activo) {
    setForm({
      nombre:        activo.nombre ?? "",
      descripcion:   activo.descripcion ?? "",
      codigo:        activo.codigo ?? "",
      ubicacion_id:  activo.ubicacion_id ?? "",
      fabricante_id: activo.fabricante_id ?? "",
      modelo_id:     activo.modelo_id ?? "",
      proveedor_id:  activo.proveedor_id ?? "",
      responsable_id: activo.responsable_id ?? "",
      activo_padre_id: activo.activo_padre_id ?? "",
      numero_serie:  activo.numero_serie ?? "",
      año_fabricacion: activo.año_fabricacion ?? "",
      criticidad:    activo.criticidad ?? "no_critico",
      codigo_sap:    activo.codigo_sap ?? "",
      fecha_garantia: activo.fecha_garantia ?? "",
      estado:        activo.estado || "operativo",
    });
    setImgPreview(activo.imagen_url ?? null);
    setImgFile(null);
    setAdjFile(null);
    setPartesForm(
      (activoPartes ?? []).map((p) => ({
        material_id: p.partes?.id,
        nombre: p.partes?.nombre,
        cantidad_recomendada: p.cantidad_recomendada,
      }))
    );
    setSaveErr(null);
    setPanelMode("edit");
  }

  // ── CRUD activos ──────────────────────────────────────────────
  async function guardarActivo() {
    if (!form.nombre.trim()) { setSaveErr("El nombre del activo es obligatorio."); return; }
    setSaving(true); setSaveErr(null);
    const sb = createClient();

    let imagen_url = activoData?.imagen_url ?? null;
    let archivo_url = activoData?.archivo_url ?? null;
    let archivo_nombre = activoData?.archivo_nombre ?? null;

    // Upload image
    if (imgFile) {
      setUploadingImg(true);
      const compressed = await comprimirImagen(imgFile);
      const path = `${plantaId}/${Date.now()}.jpg`;
      const { error: upErr } = await sb.storage.from("activos-imagenes").upload(path, compressed, { upsert: true });
      if (upErr) { setSaveErr(`Error al subir imagen: ${upErr.message}`); setSaving(false); setUploadingImg(false); return; }
      const { data: { publicUrl } } = sb.storage.from("activos-imagenes").getPublicUrl(path);
      imagen_url = publicUrl;
      setUploadingImg(false);
    }

    // Upload file
    if (adjFile) {
      setUploadingFile(true);
      const ext = adjFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("activos-archivos").upload(path, adjFile, { upsert: true });
      if (upErr) { setSaveErr(`Error al subir archivo: ${upErr.message}`); setSaving(false); setUploadingFile(false); return; }
      const { data: { publicUrl } } = sb.storage.from("activos-archivos").getPublicUrl(path);
      archivo_url = publicUrl;
      archivo_nombre = adjFile.name;
      setUploadingFile(false);
    }

    const payload = {
      nombre:         form.nombre.trim(),
      descripcion:    form.descripcion.trim() || null,
      codigo:         form.codigo.trim() || null,
      ubicacion_id:   form.ubicacion_id || null,
      fabricante_id:  form.fabricante_id || null,
      modelo_id:      form.modelo_id || null,
      proveedor_id:   form.proveedor_id || null,
      responsable_id: form.responsable_id || null,
      activo_padre_id: form.activo_padre_id || null,
      numero_serie:   form.numero_serie.trim() || null,
      año_fabricacion: form.año_fabricacion ? parseInt(form.año_fabricacion) : null,
      criticidad:     form.criticidad || "no_critico",
      codigo_sap:     form.codigo_sap.trim() || null,
      fecha_garantia: form.fecha_garantia || null,
      estado:         form.estado || "operativo",
      imagen_url, archivo_url, archivo_nombre,
    };

    let savedId = activoData?.id;
    if (panelMode === "edit" && activoData?.id) {
      const { error } = await sb.from("activos").update(payload).eq("id", activoData.id);
      if (error) { setSaveErr(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await sb.from("activos").insert({ ...payload, workspace_id: plantaId })
        .select("*, ubicaciones(edificio,piso), fabricantes(nombre), modelos(nombre), usuarios!responsable_id(nombre)")
        .single();
      if (error) { setSaveErr(error.message); setSaving(false); return; }
      savedId = data.id;
      setActivos((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }

    // Sync partes
    await sb.from("activo_materiales").delete().eq("activo_id", savedId);
    if (partesForm.length > 0) {
      await sb.from("activo_materiales").insert(
        partesForm.map((p) => ({ activo_id: savedId, material_id: p.material_id, cantidad_recomendada: p.cantidad_recomendada }))
      );
    }

    // Refresh list entry
    const { data: refreshed } = await sb.from("activos")
      .select("*, ubicaciones(edificio,piso), fabricantes(nombre), modelos(nombre), usuarios!responsable_id(nombre)")
      .eq("id", savedId).single();
    if (refreshed) {
      setActivos((prev) => prev.map((a) => a.id === savedId ? refreshed : a));
      setActivoData(refreshed);
      setActivoPartes(partesForm.map((p) => ({ materiales: { id: p.material_id, nombre: p.nombre }, cantidad_recomendada: p.cantidad_recomendada })));
    }

    setSaving(false);
    setPanelMode("view");
  }

  async function eliminarActivo(activo) {
    const sb = createClient();
    await sb.from("activos").update({ activo: false }).eq("id", activo.id);
    setActivos((prev) => prev.filter((a) => a.id !== activo.id));
    if (selected === activo.id) { setPanelMode(null); setSelected(null); }
    setActivoConfirm(null);
  }

  async function cambiarEstado(activo, nuevoEstado) {
    if (cambiandoEstado) return;
    setCambiandoEstado(true);
    const sb = createClient();
    await sb.from("activos").update({ estado: nuevoEstado }).eq("id", activo.id);
    const updated = { ...activo, estado: nuevoEstado };
    setActivoData(updated);
    setActivos((prev) => prev.map((a) => a.id === activo.id ? updated : a));
    setCambiandoEstado(false);
  }

  // ── Inline create: fabricante, modelo, proveedor ─────────────
  async function crearFabricante(nombre) {
    const sb = createClient();
    const { data } = await sb.from("fabricantes").insert({ nombre }).select().single();
    if (data) { setFabricantes((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre))); return data.id; }
  }

  async function crearModelo(nombre) {
    if (!form.fabricante_id) return null;
    const sb = createClient();
    const { data } = await sb.from("modelos").insert({ nombre, fabricante_id: form.fabricante_id }).select().single();
    if (data) { setModelos((prev) => [...prev, data]); return data.id; }
  }

  async function crearProveedor(nombre) {
    const sb = createClient();
    const { data } = await sb.from("proveedores").insert({ nombre, workspace_id: plantaId }).select().single();
    if (data) { setProveedores((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre))); return data.id; }
  }

  // ── Filtered lists ────────────────────────────────────────────
  const cntFuera      = activos.filter((a) => (a.estado ?? "operativo") === "fuera_servicio").length;
  const cntMantencion = activos.filter((a) => (a.estado ?? "operativo") === "en_mantencion").length;

  const activosFiltrados = activos
    .filter((a) => !busqueda || a.nombre.toLowerCase().includes(busqueda.toLowerCase()) || a.fabricantes?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || a.codigo?.toLowerCase().includes(busqueda.toLowerCase()))
    .filter((a) => filtroEstado === "todos" || (a.estado ?? "operativo") === filtroEstado);

  const modelosFiltrados = modelos.filter((m) => !form.fabricante_id || m.fabricante_id === form.fabricante_id);

  // ── Render ────────────────────────────────────────────────────
  if (loading) return <div className={styles.loadingScreen}>Cargando activos…</div>;

  const limitesActivos   = limitesParaPlan(plan);
  const isBasicActivos   = (plan ?? "basic") === "basic" && planStatus !== "trial";
  const activoLimitReached = isBasicActivos && activos.length >= limitesActivos.activos;

  return (
    <div className={styles.root}>

      <div className={styles.splitLayout}>
          {/* Left: list */}
          <div className={`${styles.listPanel} ${panelMode && isDesktop ? styles.listPanelShrink : ""}`}>
            {isBasicActivos && (
              <div style={{
                background: activoLimitReached ? "#FEF2F2" : "#FFF7ED",
                borderBottom: `1px solid ${activoLimitReached ? "#FECACA" : "#FED7AA"}`,
                padding: "8px 16px", fontSize: 13,
                color: activoLimitReached ? "#B91C1C" : "#92400E",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span>
                  {activoLimitReached
                    ? `Límite alcanzado: ${activos.length} de ${limitesActivos.activos} activos`
                    : `${activos.length} de ${limitesActivos.activos} activos`}
                </span>
                {activoLimitReached && (
                  <a href="/configuracion/suscripcion" style={{ color: "#B91C1C", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>
                    Ver Pro →
                  </a>
                )}
              </div>
            )}
            <div className={styles.listHeader}>
              <h1 className={styles.listTitle}>Activos</h1>
              <button
                className={styles.btnNuevo}
                onClick={activoLimitReached ? () => window.location.href = "/configuracion/suscripcion" : abrirCrear}
                title={activoLimitReached ? "Límite de activos alcanzado — Actualiza a Pro" : undefined}
                style={activoLimitReached ? { opacity: 0.6 } : undefined}
              ><Plus size={15} /><span>Nuevo</span></button>
            </div>
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input className={styles.searchInput} placeholder="Buscar activos…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda("")}><X size={13} /></button>}
            </div>
          {/* Estado filter chips */}
          <div className={styles.filterBar}>
            {[
              { id: "todos",        label: "Todos" },
              { id: "fuera_servicio", label: `Fuera de servicio${cntFuera > 0 ? ` (${cntFuera})` : ""}`,     color: "#EF4444" },
              { id: "en_mantencion",  label: `En mantención${cntMantencion > 0 ? ` (${cntMantencion})` : ""}`, color: "#F97316" },
            ].map(({ id, label, color }) => (
              <button
                key={id}
                className={`${styles.filterChip} ${filtroEstado === id ? styles.filterChipActive : ""}`}
                style={filtroEstado === id && color ? { background: color + "18", color, borderColor: color + "44" } : {}}
                onClick={() => setFiltroEstado(id)}
              >
                {id !== "todos" && <span className={styles.filterDot} style={{ background: color }} />}
                {label}
              </button>
            ))}
          </div>
            <div className={styles.assetList}>
              {activosFiltrados.length === 0 ? (
                <div className={styles.emptyState}>
                  <Server size={40} style={{ opacity: 0.15 }} />
                  <p>{busqueda ? "Sin resultados" : "Aún no hay activos.\nCrea tu primer equipo o máquina."}</p>
                </div>
              ) : (
                activosFiltrados.map((a) => (
                  <button key={a.id}
                    className={`${styles.assetCard} ${selected === a.id ? styles.assetCardActive : ""}`}
                    onClick={() => abrirActivo(a)}>
                    {a.imagen_url
                      ? <img src={a.imagen_url} alt={a.nombre} className={styles.assetThumb} />
                      : <div className={styles.assetThumbPlaceholder}><Package size={20} /></div>}
                    <div className={styles.assetCardInfo}>
                      <div className={styles.assetCardTop}>
                        <span className={styles.assetCardName}>{a.nombre}</span>
                        {a.criticidad && a.criticidad !== "no_critico" && (
                          <span className={styles.criticidadBadge}
                            style={{ background: CRITICIDAD_BG[a.criticidad], color: CRITICIDAD_COLOR[a.criticidad] }}>
                            {CRITICIDAD_LABEL[a.criticidad]}
                          </span>
                        )}
                        {(a.estado ?? "operativo") !== "operativo" && (
                          <span className={styles.estadoBadge}
                            style={{ background: ESTADO_BG[a.estado], color: ESTADO_COLOR[a.estado] }}>
                            {ESTADO_LABEL[a.estado]}
                          </span>
                        )}
                      </div>
                      {(a.fabricantes?.nombre || a.modelos?.nombre) && (
                        <span className={styles.assetCardSub}>
                          {[a.fabricantes?.nombre, a.modelos?.nombre].filter(Boolean).join(" · ")}
                        </span>
                      )}
                      {a.ubicaciones?.edificio && (
                        <span className={styles.assetCardLoc}>
                          <MapPin size={11} />
                          {a.ubicaciones.edificio}{a.ubicaciones.piso ? `, piso ${a.ubicaciones.piso}` : ""}
                        </span>
                      )}
                    </div>
                    {!isDesktop && <ChevronRight size={15} className={styles.assetChevron} />}
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
                  <Server size={48} style={{ opacity: 0.12 }} />
                  <p>Selecciona un activo o crea uno nuevo</p>
                </div>
              )}
              {loadingPanel && panelMode === "view" && (
                <div className={styles.emptyPanel}><p>Cargando…</p></div>
              )}
              {(panelMode === "create" || panelMode === "edit") && (
                <PanelForm
                  mode={panelMode} form={form} setForm={setForm}
                  ubicaciones={ubicaciones} fabricantes={fabricantes}
                  modelosFiltrados={modelosFiltrados} proveedores={proveedores}
                  usuarios={usuarios} activos={activos} activoData={activoData}
                  crearFabricante={crearFabricante} crearModelo={crearModelo}
                  crearProveedor={crearProveedor}
                  imgPreview={imgPreview} setImgPreview={setImgPreview}
                  imgRef={imgRef} fileRef={fileRef}
                  setImgFile={setImgFile} setAdjFile={setAdjFile}
                  adjFile={adjFile}
                  partesForm={partesForm} setPartesForm={setPartesForm}
                  materiales={materiales} parteSearch={parteSearch} setParteSearch={setParteSearch}
                  partePicker={partePicker} setPartePicker={setPartePicker}
                  saving={saving} uploadingImg={uploadingImg} uploadingFile={uploadingFile}
                  saveErr={saveErr}
                  onGuardar={guardarActivo}
                  onCerrar={() => { setPanelMode(activoData ? "view" : null); }}
                />
              )}
              {panelMode === "view" && activoData && !loadingPanel && (
                <PanelVer
                  activo={activoData} partes={activoPartes}
                  plantaId={plantaId}
                  onCambiarEstado={(nuevoEstado) => cambiarEstado(activoData, nuevoEstado)}
                  cambiandoEstado={cambiandoEstado}
                  onEditar={() => abrirEditar(activoData)}
                  onEliminar={() => setActivoConfirm(activoData)}
                  onCerrar={() => { setPanelMode(null); setSelected(null); }}
                />
              )}
            </div>
          )}
        </div>

      {/* ── Confirm delete activo ── */}
      {activoConfirm && (
        <>
          <div className={styles.overlay} onClick={() => setActivoConfirm(null)} />
          <div className={styles.confirmModal}>
            <AlertCircle size={32} style={{ color: "#EF4444", marginBottom: 8 }} />
            <p className={styles.confirmText}>¿Archivar <strong>{activoConfirm.nombre}</strong>?</p>
            <p className={styles.confirmSub}>El activo se desactivará pero no se eliminará de la base de datos.</p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnSecundario} onClick={() => setActivoConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminarActivo(activoConfirm)}>Archivar</button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ── Panel: Ver detalle de activo ──────────────────────────────

function PanelVer({ activo, partes, plantaId, onCambiarEstado, cambiandoEstado, onEditar, onEliminar, onCerrar }) {
  const [otsRecientes, setOtsRecientes] = useState([]);
  useEffect(() => {
    if (!activo?.id) return;
    const sb = createClient();
    sb.from("ordenes_trabajo")
      .select("id,numero,titulo,estado,tipo_trabajo,created_at")
      .eq("activo_id", activo.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setOtsRecientes(data ?? []));
  }, [activo?.id]);

  const qrUrl = typeof window !== "undefined"
    ? `${window.location.origin}/activos/${activo.id}`
    : "";
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrUrl)}`;

  function printQR() {
    const w = window.open("", "_blank", "width=400,height=400");
    w.document.write(`<html><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:24px">
      <h2 style="margin:0 0 8px">${activo.nombre}</h2>
      ${activo.codigo ? `<p style="margin:0 0 16px;color:#666">${activo.codigo}</p>` : ""}
      <img src="${qrImg}" style="width:160px;height:160px" />
      <p style="margin:12px 0 0;font-size:12px;color:#888">${qrUrl}</p>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const crit = activo.criticidad ?? "no_critico";

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelTitle}>{activo.nombre}</span>
          {activo.codigo && <span className={styles.panelSubId}>{activo.codigo}</span>}
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEditar}><Pencil size={15} /></button>
          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onEliminar}><Trash2 size={15} /></button>
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
      </div>

      <div className={styles.panelBody}>
        {/* Image */}
        {activo.imagen_url && (
          <div className={styles.detImgWrap}>
            <img src={activo.imagen_url} alt={activo.nombre} className={styles.detImg} />
          </div>
        )}

        {/* Estado del equipo */}
        <div className={styles.estadoBlock}>
          <p className={styles.estadoBlockLabel}>Estado del equipo</p>
          <div className={styles.estadoToggleRow}>
            {Object.entries(ESTADO_LABEL).map(([key, label]) => {
              const active = (activo.estado ?? "operativo") === key;
              return (
                <button
                  key={key}
                  className={`${styles.estadoToggleBtn} ${active ? styles.estadoToggleBtnActive : ""}`}
                  style={active ? { background: ESTADO_BG[key], color: ESTADO_COLOR[key], borderColor: ESTADO_COLOR[key] + "66" } : {}}
                  onClick={() => !active && onCambiarEstado(key)}
                  disabled={cambiandoEstado}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Criticidad */}
        <span className={styles.criticidadBadgeLg}
          style={{ background: CRITICIDAD_BG[crit], color: CRITICIDAD_COLOR[crit] }}>
          {crit === "critico" ? <AlertTriangle size={13} /> : <Shield size={13} />}
          {CRITICIDAD_LABEL[crit]}
        </span>

        {/* Meta grid */}
        <div className={styles.metaGrid}>
          {activo.ubicaciones?.edificio && <MetaItem icon={MapPin} label="Ubicación" value={`${activo.ubicaciones.edificio}${activo.ubicaciones.piso ? `, piso ${activo.ubicaciones.piso}` : ""}`} />}
          {activo.fabricantes?.nombre    && <MetaItem icon={Building2} label="Fabricante" value={activo.fabricantes.nombre} />}
          {activo.modelos?.nombre        && <MetaItem icon={Tag} label="Modelo" value={activo.modelos.nombre} />}
          {activo.numero_serie           && <MetaItem icon={Hash} label="N° serie" value={activo.numero_serie} />}
          {activo.año_fabricacion        && <MetaItem icon={Calendar} label="Año" value={activo.año_fabricacion} />}
          {activo.codigo_sap             && <MetaItem icon={Layers} label="Código SAP/ERP" value={activo.codigo_sap} />}
          {activo.fecha_garantia         && <MetaItem icon={ShieldAlert} label="Garantía hasta" value={new Date(activo.fecha_garantia).toLocaleDateString("es-CL")} />}
          {activo.usuarios?.nombre       && <MetaItem icon={User} label="Responsable" value={activo.usuarios.nombre} />}
        </div>

        {/* Descripción */}
        {activo.descripcion && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Descripción</p>
            <p className={styles.detText}>{activo.descripcion}</p>
          </div>
        )}

        {/* Archivo adjunto */}
        {activo.archivo_url && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Archivo adjunto</p>
            <a href={activo.archivo_url} target="_blank" rel="noopener noreferrer" className={styles.adjuntoLink}>
              <FileText size={14} /> {activo.archivo_nombre ?? "Ver archivo"}
            </a>
          </div>
        )}

        {/* Partes asociadas */}
        <div className={styles.detSection}>
          <p className={styles.detLabel}>Partes asociadas {partes.length > 0 ? `(${partes.length})` : ""}</p>
          {partes.length === 0 ? (
            <p className={styles.partesVacias}>Sin partes asociadas. Edita el activo para vincular partes del inventario.</p>
          ) : (
            <div className={styles.partesList}>
              {partes.map((p, i) => (
                <div key={i} className={styles.parteViewRow}>
                  <span className={styles.parteNombre}>{p.partes?.nombre ?? "—"}</span>
                  <span className={styles.parteCantidad}>{p.cantidad_recomendada} {p.partes?.unidad ?? ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OTs recientes */}
        {otsRecientes.length > 0 && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Órdenes de trabajo recientes</p>
            <div className={styles.otsList}>
              {otsRecientes.map((ot) => (
                <div key={ot.id} className={styles.otsRow}>
                  <span className={styles.otsNumero}>#{ot.numero ?? "—"}</span>
                  <span className={styles.otsTitulo}>{ot.titulo ?? "Sin título"}</span>
                  <span className={styles.otsEstado} style={{ color: ot.estado === "completada" ? "#22C55E" : ot.estado === "en_progreso" ? "#3B82F6" : "#F97316" }}>
                    {ot.estado === "completada" ? "Completada" : ot.estado === "en_progreso" ? "En progreso" : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QR Code */}
        <div className={styles.qrSection}>
          <p className={styles.detLabel}>Código QR del activo</p>
          <div className={styles.qrWrap}>
            <img src={qrImg} alt="QR" className={styles.qrImg} />
            <div className={styles.qrInfo}>
              <p className={styles.qrDesc}>Escanea para acceder a la ficha de este activo desde cualquier dispositivo.</p>
              <button className={styles.qrPrintBtn} onClick={printQR}>
                <Printer size={14} /> Imprimir QR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaItem({ icon: Icon, label, value }) {
  return (
    <div className={styles.metaItem}>
      <Icon size={13} className={styles.metaIcon} />
      <div>
        <span className={styles.metaKey}>{label}</span>
        <span className={styles.metaVal}>{value}</span>
      </div>
    </div>
  );
}

// ── Panel: Crear / Editar activo ──────────────────────────────

function PanelForm({
  mode, form, setForm, ubicaciones, fabricantes, modelosFiltrados,
  proveedores, usuarios, activos, activoData,
  crearFabricante, crearModelo, crearProveedor,
  imgPreview, setImgPreview, imgRef, fileRef, setImgFile, setAdjFile, adjFile,
  partesForm, setPartesForm, materiales, parteSearch, setParteSearch,
  partePicker, setPartePicker,
  saving, uploadingImg, uploadingFile, saveErr,
  onGuardar, onCerrar,
}) {
  const sf = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{mode === "edit" ? "Editar activo" : "Nuevo activo"}</span>
        <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
      </div>
      <div className={styles.panelBody}>

        {/* Imagen */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Imagen del activo</label>
          <div className={styles.imgUploadArea} onClick={() => imgRef.current?.click()}>
            {imgPreview
              ? <img src={imgPreview} alt="preview" className={styles.imgPreview} />
              : <><Image size={24} style={{ opacity: 0.3 }} /><span className={styles.imgUploadHint}>Haz clic para subir imagen</span></>}
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) { const c = await comprimirImagen(f); setImgFile(c); setImgPreview(URL.createObjectURL(c)); }
            }} />
        </div>

        {/* Nombre */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nombre *</label>
          <input className={styles.formInput} placeholder="Ej: Motor trifásico 4HP" value={form.nombre} onChange={(e) => sf("nombre", e.target.value)} />
        </div>

        {/* Descripción */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción</label>
          <textarea className={styles.formTextarea} rows={2} value={form.descripcion} onChange={(e) => sf("descripcion", e.target.value)} />
        </div>

        {/* Código / Año */}
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Código interno</label>
            <input className={styles.formInput} placeholder="ACT-001" value={form.codigo} onChange={(e) => sf("codigo", e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Año de fabricación</label>
            <input className={styles.formInput} type="number" min="1900" max="2100" placeholder="2020" value={form.año_fabricacion} onChange={(e) => sf("año_fabricacion", e.target.value)} />
          </div>
        </div>

        {/* Ubicación */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Ubicación</label>
          <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => sf("ubicacion_id", e.target.value)}>
            <option value="">Sin ubicación</option>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.edificio}{u.piso ? ` — piso ${u.piso}` : ""}</option>)}
          </select>
        </div>

        {/* Fabricante */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Fabricante</label>
          <ComboCrear label="Fabricante" items={fabricantes} value={form.fabricante_id}
            onChange={(v) => { sf("fabricante_id", v); sf("modelo_id", ""); }}
            onCreate={crearFabricante} placeholder="Seleccionar fabricante…" />
        </div>

        {/* Modelo */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Modelo</label>
          <ComboCrear label="Modelo" items={modelosFiltrados} value={form.modelo_id}
            onChange={(v) => sf("modelo_id", v)}
            onCreate={crearModelo}
            placeholder={form.fabricante_id ? "Seleccionar modelo…" : "Primero selecciona un fabricante"} />
        </div>

        {/* Criticidad */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Criticidad</label>
          <div className={styles.criticidadBtns}>
            {["critico","semi_critico","no_critico"].map((c) => (
              <button key={c} type="button"
                className={`${styles.criticidadBtn} ${form.criticidad === c ? styles.criticidadBtnActive : ""}`}
                style={form.criticidad === c ? { background: CRITICIDAD_BG[c], color: CRITICIDAD_COLOR[c], borderColor: CRITICIDAD_COLOR[c] } : {}}
                onClick={() => sf("criticidad", c)}>
                {CRITICIDAD_LABEL[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Estado */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Estado del equipo</label>
          <select className={styles.formSelect} value={form.estado || "operativo"} onChange={(e) => sf("estado", e.target.value)}>
            <option value="operativo">Operativo</option>
            <option value="en_mantencion">En mantención</option>
            <option value="fuera_servicio">Fuera de servicio</option>
          </select>
        </div>

        {/* N° serie / SAP */}
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Número de serie</label>
            <input className={styles.formInput} value={form.numero_serie} onChange={(e) => sf("numero_serie", e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Código SAP/ERP</label>
            <input className={styles.formInput} value={form.codigo_sap} onChange={(e) => sf("codigo_sap", e.target.value)} />
          </div>
        </div>

        {/* Garantía / Responsable */}
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Garantía hasta</label>
            <input className={styles.formInput} type="date" value={form.fecha_garantia} onChange={(e) => sf("fecha_garantia", e.target.value)} />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Responsable</label>
            <select className={styles.formSelect} value={form.responsable_id} onChange={(e) => sf("responsable_id", e.target.value)}>
              <option value="">Sin asignar</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>

        {/* Proveedor */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Proveedor</label>
          <ComboCrear label="Proveedor" items={proveedores} value={form.proveedor_id}
            onChange={(v) => sf("proveedor_id", v)}
            onCreate={crearProveedor} placeholder="Seleccionar proveedor…" />
        </div>

        {/* Activo padre */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Activo padre (equipo al que pertenece)</label>
          <select className={styles.formSelect} value={form.activo_padre_id} onChange={(e) => sf("activo_padre_id", e.target.value)}>
            <option value="">Sin activo padre</option>
            {activos.filter((a) => a.id !== activoData?.id).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>

        {/* Archivo adjunto */}
        <div className={styles.formField}>
          <label className={styles.formLabel}>Archivo adjunto (PDF, manual, etc.)</label>
          <button type="button" className={styles.adjuntoBtn} onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            {adjFile ? adjFile.name : activoData?.archivo_nombre ?? "Seleccionar archivo"}
          </button>
          <input ref={fileRef} type="file" style={{ display: "none" }}
            onChange={(e) => setAdjFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* Partes asociadas */}
        <div className={styles.formField}>
          <div className={styles.partesHeader2}>
            <label className={styles.formLabel} style={{ margin: 0 }}>Partes asociadas</label>
            <button type="button" className={styles.addParteBtn} onClick={() => setPartePicker((v) => !v)}>
              <Plus size={13} /> Agregar parte
            </button>
          </div>

          {partePicker && (
            <div className={styles.partePickerBox}>
              <input className={styles.parteSearchInput} placeholder="Buscar en inventario…" value={parteSearch}
                onChange={(e) => setParteSearch(e.target.value)} autoFocus />
              <div className={styles.partePickerList}>
                {materiales
                  .filter((m) => !partesForm.find((p) => p.material_id === m.id))
                  .filter((m) => !parteSearch || m.nombre.toLowerCase().includes(parteSearch.toLowerCase()) || m.codigo.toLowerCase().includes(parteSearch.toLowerCase()))
                  .map((m) => (
                    <button key={m.id} className={styles.partePickerItem}
                      onClick={() => {
                        setPartesForm((prev) => [...prev, { material_id: m.id, nombre: m.nombre, cantidad_recomendada: 1, unidad: m.unidad }]);
                        setParteSearch("");
                      }}>
                      <span>{m.nombre}</span>
                      <span className={styles.partePickerCodigo}>{m.codigo}</span>
                    </button>
                  ))}
                {materiales.filter((m) => !partesForm.find((p) => p.material_id === m.id) && (!parteSearch || m.nombre.toLowerCase().includes(parteSearch.toLowerCase()) || m.codigo.toLowerCase().includes(parteSearch.toLowerCase()))).length === 0 && (
                  <p className={styles.partePickerEmpty}>Sin resultados</p>
                )}
              </div>
            </div>
          )}

          {partesForm.length > 0 && (
            <div className={styles.partesFormList}>
              {partesForm.map((p, i) => (
                <div key={p.material_id} className={styles.parteFormRow}>
                  <span className={styles.parteFormNombre}>{p.nombre}</span>
                  <input className={styles.parteFormCantidad} type="number" min="0.01" step="0.01" value={p.cantidad_recomendada}
                    onChange={(e) => setPartesForm((prev) => prev.map((x, j) => j === i ? { ...x, cantidad_recomendada: parseFloat(e.target.value) || 1 } : x))} />
                  <span className={styles.parteFormUnidad}>{p.unidad}</span>
                  <button className={styles.parteFormRemove} onClick={() => setPartesForm((prev) => prev.filter((_, j) => j !== i))}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {saveErr && <p className={styles.formError}>{saveErr}</p>}
      </div>

      <div className={styles.panelFooter}>
        <button className={styles.btnSecundario} onClick={onCerrar}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onGuardar} disabled={saving || uploadingImg || uploadingFile}>
          {saving || uploadingImg || uploadingFile ? "Guardando…" : mode === "edit" ? "Guardar cambios" : "Crear activo"}
        </button>
      </div>
    </div>
  );
}
