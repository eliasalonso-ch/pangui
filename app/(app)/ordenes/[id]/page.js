"use client";
/**
 * OT Detail — Mobile
 *
 * Key optimizations applied:
 * 1. TimerBanner owns its own state  → only it re-renders each second (not the whole page)
 * 2. All sub-components are memo()   → skipped when props haven't changed
 * 3. Handlers in useCallback         → stable references so memo'd children don't re-render
 * 4. Filtered arrays in useMemo      → not recomputed on every render
 * 5. Data fetching parallelized      → 2 Promise.all round-trips instead of 5 sequential awaits
 * 6. comprimirImagen is module-level → not recreated on every render
 * 7. notasCierre state lives in CloseSheet → completarOT doesn't depend on it, no churn
 */
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Settings2, ExternalLink,
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, BadgeCheck, Wifi, Paintbrush, Leaf,
  CheckSquare, FileText, Camera, Play,
  CheckCircle2, Calendar, Loader2, X, ChevronDown, Minus, ChevronUp,
  Circle, PauseCircle, PlayCircle, XCircle, ChevronsRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

// ─── Module-level constants — never recreated on render ──────────────────────
const LUCIDE_ICONS = {
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, CheckSquare, BadgeCheck, Settings2, Wifi, Paintbrush, Leaf,
};

const ESTADO_COLOR = {
  pendiente:   { bg: "#EFF6FF", text: "#3B82F6" },
  en_espera:   { bg: "#FFFBEB", text: "#D97706" },
  en_curso:    { bg: "#EEF2FF", text: "#6366F1" },
  en_revision: { bg: "#EEF2FF", text: "#6366F1" },
  completado:  { bg: "#F0FDF4", text: "#22C55E" },
  cancelado:   { bg: "#F3F4F6", text: "#6B7280" },
};

const PRIORIDAD_COLOR = {
  ninguna: null, baja: "#9CA3AF", media: "#3B82F6", alta: "#F97316", urgente: "#EF4444",
};
const PRIORIDAD_LABEL    = { ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente" };
const TIPO_TRABAJO_LABEL = { reactiva: "Reactiva", preventiva: "Preventiva", inspeccion: "Inspección", mejora: "Mejora" };

// Static arrays keep map() from rebuilding the options list on every render
const STATUS_BTNS = [
  { value: "pendiente", label: "Abierta",   Icon: Circle      },
  { value: "en_espera", label: "En espera", Icon: PauseCircle },
  { value: "en_curso",  label: "En curso",  Icon: PlayCircle  },
  { value: "cancelado", label: "Cancelada", Icon: XCircle     },
];
const PRIORITY_BTNS = [
  { value: "baja",    label: "Baja",    Icon: ChevronDown,   color: "#9CA3AF" },
  { value: "media",   label: "Media",   Icon: Minus,         color: "#3B82F6" },
  { value: "alta",    label: "Alta",    Icon: ChevronUp,     color: "#F97316" },
  { value: "urgente", label: "Urgente", Icon: AlertTriangle, color: "#EF4444" },
];

// ─── Module-level utilities — not recreated on render ────────────────────────
function vencimiento(fecha) {
  if (!fecha) return null;
  const diff = Math.ceil((new Date(fecha) - Date.now()) / 86400000);
  if (diff < 0)  return { label: `vencida hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? "s" : ""}`, urgent: true };
  if (diff === 0) return { label: "vence hoy", urgent: true };
  if (diff === 1) return { label: "vence mañana", urgent: true };
  return { label: new Date(fecha).toLocaleDateString("es-CL"), urgent: false };
}

function tiempoFmt(min) {
  if (!min) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtTimer(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Outside the component — not re-created on each render
async function comprimirImagen(file) {
  return new Promise((resolve) => {
    const img    = new Image();
    const blobUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const MAX    = 1200;
      const scale  = img.width > MAX ? MAX / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" })),
        "image/jpeg", 0.82
      );
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file); };
    img.src = blobUrl;
  });
}

// ─── Main page component ──────────────────────────────────────────────────────
export default function OTDetalleMobile() {
  const { id }  = useParams();
  const router  = useRouter();

  const [orden,        setOrden]        = useState(null);
  const [pasos,        setPasos]        = useState([]);
  const [archivos,     setArchivos]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [myId,         setMyId]         = useState(null);
  // Derived from orden.workspace_id — keeping as ref avoids an extra state slot
  // and prevents completarOT from depending on a separate piece of state that
  // changes at load time (which would re-create the callback).
  const workspaceIdRef = useRef(null);

  // Epoch-ms timestamp when the timer was started; stored in localStorage for persistence
  const [timerStart,   setTimerStart]   = useState(null);

  const fotoContextoRef  = useRef(null);
  const fotoEvidenciaRef = useRef(null);
  const [uploadingCtx, setUploadingCtx] = useState(false);
  const [uploadingEvd, setUploadingEvd] = useState(false);

  const [stepsDone,      setStepsDone]      = useState(new Set());
  const [usuarios,       setUsuarios]       = useState([]);
  const [showCloseSheet, setShowCloseSheet] = useState(false);
  const [completing,     setCompleting]     = useState(false);
  const [lightboxUrl,    setLightboxUrl]    = useState(null);

  // ── Data load — 2 parallel round-trips instead of 5 sequential awaits ───────
  useEffect(() => {
    // Redirect desktop to the side-panel version
    if (window.matchMedia("(min-width: 1024px)").matches) {
      sessionStorage.setItem("pangui_open_ot", id);
      router.replace("/ordenes");
      return;
    }

    async function load() {
      const sb = createClient();

      // Round-trip 1: user session + order row + attachments — all independent
      const [
        { data: { user } },
        { data },
        { data: arcs },
      ] = await Promise.all([
        sb.auth.getUser(),
        sb.from("ordenes_trabajo")
          .select("*, categorias_ot(id,nombre,icono,color), ubicaciones(id,edificio,piso,detalle), activos(id,nombre,codigo), plantillas_procedimiento(id,nombre)")
          .eq("id", id).maybeSingle(),
        sb.from("archivos_orden").select("*").eq("orden_id", id).order("created_at"),
      ]);

      setMyId(user?.id ?? null);
      workspaceIdRef.current = data?.workspace_id ?? null;
      setOrden(data);
      setArchivos(arcs ?? []);

      // Round-trip 2: workspace users + checklist steps — both depend on order data
      const [{ data: users }, { data: ps }] = await Promise.all([
        data?.workspace_id
          ? sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", data.workspace_id).order("nombre")
          : Promise.resolve({ data: [] }),
        data?.plantilla_id
          ? sb.from("pasos_plantilla").select("*").eq("plantilla_id", data.plantilla_id).order("orden")
          : Promise.resolve({ data: [] }),
      ]);

      setUsuarios(users ?? []);
      if (ps?.length) {
        setPasos(ps);
        try {
          const saved = JSON.parse(localStorage.getItem(`pangui_steps_${id}`) || "[]");
          setStepsDone(new Set(saved));
        } catch {}
      }

      // Restore running timer
      try {
        const ts = parseInt(localStorage.getItem(`pangui_start_${id}`));
        if (!isNaN(ts) && ts > 0 && data?.estado === "en_curso") setTimerStart(ts);
      } catch {}

      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Memoized derived values — skip recomputation when archivos/orden unchanged
  const { fotosContexto, fotosEvidencia, otrosArcs } = useMemo(() => ({
    fotosContexto:  archivos.filter(a => a.tipo_mime?.startsWith("image/") && a.tipo === "contexto"),
    fotosEvidencia: archivos.filter(a => a.tipo_mime?.startsWith("image/") && a.tipo !== "contexto"),
    otrosArcs:      archivos.filter(a => !a.tipo_mime?.startsWith("image/")),
  }), [archivos]);

  // Depend only on the three primitives used — never change after load.
  // Previously depended on [orden] so it recomputed on every estado/prioridad change.
  const otId = useMemo(() =>
    orden
      ? `${orden.tipo === "emergencia" ? "EM" : "OT"}-${new Date(orden.created_at).getFullYear()}-${orden.id.slice(-4).toUpperCase()}`
      : "",
  [orden?.id, orden?.tipo, orden?.created_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depend on the icono string (primitive) not the whole object.
  const CatIcon = useMemo(() =>
    orden?.categorias_ot ? (LUCIDE_ICONS[orden.categorias_ot.icono] ?? null) : null,
  [orden?.categorias_ot?.icono]); // eslint-disable-line react-hooks/exhaustive-deps

  const enAccion = useMemo(() =>
    ["pendiente", "en_espera", "en_curso", "en_revision"].includes(orden?.estado),
  [orden?.estado]);

  // ── Action handlers — useCallback keeps references stable for memo'd children ─
  const cambiarEstado = useCallback(async (nuevoEstado) => {
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ estado: nuevoEstado }).eq("id", id);
    setOrden(prev => prev ? { ...prev, estado: nuevoEstado } : prev);
  }, [id]);

  const cambiarPrioridad = useCallback(async (nuevaPrioridad) => {
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ prioridad: nuevaPrioridad }).eq("id", id);
    setOrden(prev => prev ? { ...prev, prioridad: nuevaPrioridad } : prev);
  }, [id]);

  const toggleResponsable = useCallback(async (userId) => {
    // Compute next state inside setOrden to avoid stale closure on asignados_ids
    let anterior;
    setOrden(prev => {
      if (!prev) return prev;
      anterior = prev.asignados_ids ?? [];
      const siguiente = anterior.includes(userId)
        ? anterior.filter(uid => uid !== userId)
        : [...anterior, userId];
      const sb = createClient();
      sb.from("ordenes_trabajo").update({ asignados_ids: siguiente }).eq("id", id)
        .then(({ error }) => {
          if (error) setOrden(p => p ? { ...p, asignados_ids: anterior } : p);
        });
      return { ...prev, asignados_ids: siguiente };
    });
  }, [id]);

  const limpiarResponsables = useCallback(() => {
    let anterior;
    setOrden(prev => {
      if (!prev) return prev;
      anterior = prev.asignados_ids ?? [];
      const sb = createClient();
      sb.from("ordenes_trabajo").update({ asignados_ids: [] }).eq("id", id)
        .then(({ error }) => {
          if (error) setOrden(p => p ? { ...p, asignados_ids: anterior } : p);
        });
      return { ...prev, asignados_ids: [] };
    });
  }, [id]);

  const toggleStep = useCallback((pasoId) => {
    setStepsDone(prev => {
      const next = new Set(prev);
      if (next.has(pasoId)) next.delete(pasoId); else next.add(pasoId);
      try { localStorage.setItem(`pangui_steps_${id}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [id]);

  const iniciar = useCallback(async () => {
    const now = Date.now();
    try { localStorage.setItem(`pangui_start_${id}`, now); } catch {}
    setTimerStart(now);
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ estado: "en_curso" }).eq("id", id);
    setOrden(prev => prev ? { ...prev, estado: "en_curso" } : prev);
  }, [id]);

  // notas is passed in from CloseSheet so this callback doesn't depend on
  // notasCierre state → no re-creation on each keystroke → CloseSheet stays stable
  // workspaceId and myId are read via refs/state that only change once at load —
  // using workspaceIdRef removes workspaceId from deps entirely so this callback
  // is created once and never re-created.
  const completarOT = useCallback(async (notas) => {
    setCompleting(true);
    const sb    = createClient();
    const ahora = new Date().toISOString();
    await sb.from("ordenes_trabajo").update({ estado: "completado", completado_en: ahora }).eq("id", id);
    if (notas?.trim() && workspaceIdRef.current && myId) {
      try {
        await sb.from("comentarios_orden").insert({
          orden_id: id, workspace_id: workspaceIdRef.current, usuario_id: myId,
          tipo: "comentario", contenido: `Notas de cierre: ${notas.trim()}`,
        });
      } catch {}
    }
    try { localStorage.removeItem(`pangui_start_${id}`); } catch {}
    setOrden(prev => prev ? { ...prev, estado: "completado", completado_en: ahora } : prev);
    setShowCloseSheet(false);
    setCompleting(false);
  }, [id, myId]);

  const subirFoto = useCallback(async (file, tipo) => {
    const setUpl = tipo === "contexto" ? setUploadingCtx : setUploadingEvd;
    setUpl(true);
    const sb = createClient();
    const compressed = await comprimirImagen(file);
    const path = `${id}/${tipo}_${Date.now()}.jpg`;
    const { error } = await sb.storage.from("archivos-ordenes").upload(path, compressed, { upsert: false, contentType: "image/jpeg" });
    if (!error) {
      const { data: { publicUrl } } = sb.storage.from("archivos-ordenes").getPublicUrl(path);
      const { data: arc } = await sb.from("archivos_orden").insert({
        orden_id: id, nombre: compressed.name, url: publicUrl,
        tipo_mime: "image/jpeg", tipo, tamano_kb: Math.round(compressed.size / 1024),
      }).select().single();
      if (arc) setArchivos(prev => [...prev, arc]);
    }
    setUpl(false);
  }, [id]);

  // Stable per-section wrappers — prevents inline arrow fns in JSX from breaking memo on FotoSection
  const subirFotoCtx = useCallback((f) => subirFoto(f, "contexto"), [subirFoto]);
  const subirFotoEvd = useCallback((f) => subirFoto(f, "evidencia"), [subirFoto]);

  // These four replace inline () => ... in JSX.
  // Without these, every parent re-render passes a new function reference to a
  // memo'd child, defeating memo entirely for Header, ActionBar, Lightbox, CloseSheet.
  const handleBack       = useCallback(() => router.back(),            [router]);
  const openCloseSheet   = useCallback(() => setShowCloseSheet(true),  []);
  const closeCloseSheet  = useCallback(() => setShowCloseSheet(false), []);
  const closeLightbox    = useCallback(() => setLightboxUrl(null),     []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div className={styles.loading}>Cargando…</div>;
  if (!orden)  return <div className={styles.loading}>OT no encontrada.</div>;

  return (
    <main className={styles.page}>
      <Header
        otId={otId}
        categoria={orden.categorias_ot}
        CatIcon={CatIcon}
        ordenId={orden.id}
        onBack={handleBack}
      />

      <div className={styles.body}>
        <h1 className={styles.titulo}>{orden.titulo || orden.descripcion?.slice(0, 100) || "Sin título"}</h1>

        {((orden.prioridad && orden.prioridad !== "ninguna") || orden.tipo_trabajo) && (
          <div className={styles.titleMeta}>
            <span className={styles.titleMetaLabel}>Prioridad:</span>
            {orden.prioridad && orden.prioridad !== "ninguna" && (
              <span className={styles.prioridadBadge} style={{ color: PRIORIDAD_COLOR[orden.prioridad], borderColor: PRIORIDAD_COLOR[orden.prioridad] }}>
                {PRIORIDAD_LABEL[orden.prioridad]}
              </span>
            )}
            {orden.tipo_trabajo && (
              <span className={styles.tipoBadge}>{TIPO_TRABAJO_LABEL[orden.tipo_trabajo]}</span>
            )}
          </div>
        )}

        <p className={styles.createdAt}>
          <Calendar size={12} />
          Creada el{" "}
          {new Date(orden.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
          {" a las "}
          {new Date(orden.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </p>

        <FotoSection
          titulo="Fotos del Problema"
          fotos={fotosContexto}
          uploading={uploadingCtx}
          inputRef={fotoContextoRef}
          onAdd={subirFotoCtx}
          onOpenLightbox={setLightboxUrl}
          emptyText="Sin fotos — documenta el problema antes de empezar"
          wrapperClass={styles.fotosTop}
        />

        {/* TimerBanner is isolated — only it re-renders each second */}
        {orden.estado === "en_curso" && timerStart && (
          <TimerBanner timerStart={timerStart} tiempoEstimado={orden.tiempo_estimado} />
        )}

        {orden.estado === "completado" && (
          <div className={styles.completadoBanner}>
            <CheckCircle2 size={16} />
            <span>
              Completada
              {orden.completado_en && ` · ${new Date(orden.completado_en).toLocaleDateString("es-CL", { day: "numeric", month: "short" })} ${new Date(orden.completado_en).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </div>
        )}

        <EstadoSelector estado={orden.estado} onChange={cambiarEstado} />
        <PrioritySelector prioridad={orden.prioridad} onChange={cambiarPrioridad} />

        {usuarios.length > 0 && (
          <Responsables
            usuarios={usuarios}
            asignadosIds={orden.asignados_ids}
            onToggle={toggleResponsable}
            onLimpiar={limpiarResponsables}
          />
        )}

        {orden.descripcion && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Descripción</p>
            <p className={styles.sectionText}>{orden.descripcion}</p>
          </div>
        )}

        {pasos.length > 0 && (
          <Checklist
            pasos={pasos}
            plantillaNombre={orden.plantillas_procedimiento?.nombre}
            stepsDone={stepsDone}
            onToggle={toggleStep}
          />
        )}

        {Array.isArray(orden.partes_requeridas) && orden.partes_requeridas.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Repuestos requeridos</p>
            {orden.partes_requeridas.map((p, i) => (
              <div key={i} className={styles.parteRow}>
                <span className={styles.parteNombre}>{p.nombre}</span>
                <span className={styles.parteCantidad}>{p.cantidad} {p.unidad}</span>
              </div>
            ))}
          </div>
        )}

        <FotoSection
          titulo="Fotos del trabajo realizado"
          fotos={fotosEvidencia}
          uploading={uploadingEvd}
          inputRef={fotoEvidenciaRef}
          onAdd={subirFotoEvd}
          onOpenLightbox={setLightboxUrl}
          emptyText="Sin fotos — documenta el trabajo al finalizarlo"
          wrapperClass={styles.section}
        />

        {otrosArcs.length > 0 && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Archivos adjuntos</p>
            {otrosArcs.map(a => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className={styles.archivoRow}>
                <FileText size={14} />
                <span>{a.nombre}</span>
                {a.tamano_kb && <span className={styles.archivoSize}>{a.tamano_kb} KB</span>}
              </a>
            ))}
          </div>
        )}
      </div>

      {enAccion && (
        <ActionBar
          estado={orden.estado}
          onIniciar={iniciar}
          onOpenCloseSheet={openCloseSheet}
        />
      )}

      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={closeLightbox} />}

      {showCloseSheet && (
        <CloseSheet
          onClose={closeCloseSheet}
          onConfirm={completarOT}
          completing={completing}
        />
      )}
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
// All wrapped in memo() — React skips the re-render if props are identical

const Header = memo(function Header({ otId, categoria, CatIcon, ordenId, onBack }) {
  return (
    <div className={styles.header}>
      <button className={styles.backBtn} onClick={onBack}><ArrowLeft size={20} /></button>
      <div className={styles.headerCenter}>
        <span className={styles.otId}>{otId}</span>
        {CatIcon && (
          <span className={styles.catLabel} style={{ color: categoria.color }}>
            <CatIcon size={13} />
            {categoria.nombre}
          </span>
        )}
      </div>
      <a href={`/ordenes/${ordenId}/edit`} className={styles.externalLink}><ExternalLink size={18} /></a>
    </div>
  );
});

// Critical isolation: this component owns its own `secs` state.
// The parent's state never changes on each tick → no cascade re-render.
const TimerBanner = memo(function TimerBanner({ timerStart, tiempoEstimado }) {
  const [secs, setSecs] = useState(() => Math.floor((Date.now() - timerStart) / 1000));

  useEffect(() => {
    const tick = () => setSecs(Math.floor((Date.now() - timerStart) / 1000));
    const t = setInterval(tick, 1000);
    return () => clearInterval(t); // cleanup prevents memory leak
  }, [timerStart]);

  return (
    <div className={styles.timerBanner}>
      <div className={styles.timerDot} />
      <span className={styles.timerLabel}>En curso</span>
      <span className={styles.timerCount}>{fmtTimer(secs)}</span>
      {tiempoEstimado && (
        <span className={styles.timerEst}>/ {tiempoFmt(tiempoEstimado)} estimado</span>
      )}
    </div>
  );
});

// Single reusable component for both photo sections (contexto + evidencia)
const FotoSection = memo(function FotoSection({ titulo, fotos, uploading, inputRef, onAdd, onOpenLightbox, emptyText, wrapperClass }) {
  return (
    <div className={wrapperClass}>
      <div className={styles.sectionHeaderRow}>
        <p className={styles.sectionLabel}>{titulo}</p>
        <button className={styles.addFotoBtn} onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={13} className={styles.spinIcon} /> : <Camera size={13} />}
          {uploading ? "Subiendo…" : "Agregar"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file" accept="image/*" capture="environment"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) { onAdd(f); e.target.value = ""; } }}
      />
      {fotos.length > 0 ? (
        <div className={styles.fotoGrid}>
          {fotos.map(a => (
            <button key={a.id} className={styles.fotoThumb} onClick={() => onOpenLightbox(a.url)}>
              <img src={a.url} alt={a.nombre} className={styles.fotoImg} loading="lazy" />
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.emptyFotos}>{emptyText}</p>
      )}
    </div>
  );
});

const EstadoSelector = memo(function EstadoSelector({ estado, onChange }) {
  return (
    <>
      <div className={styles.sectionHeaderRow} style={{ marginBottom: 8 }}>
        <p className={styles.sectionLabel}>Estado</p>
        <span className={styles.scrollHint}><ChevronsRight size={12} /> Desliza</span>
      </div>
      <div className={styles.statusBtnsRow}>
        {STATUS_BTNS.map(({ value, label, Icon }) => {
          const active = estado === value;
          const c = ESTADO_COLOR[value] ?? { bg: "#F3F4F6", text: "#6B7280" };
          return (
            <button key={value} type="button"
              className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
              style={active ? { background: c.bg, color: c.text, borderColor: c.text } : {}}
              onClick={() => onChange(value)}>
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
});

const PrioritySelector = memo(function PrioritySelector({ prioridad, onChange }) {
  return (
    <>
      <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>Prioridad</p>
      <div className={styles.priorityRow}>
        {PRIORITY_BTNS.map(({ value, label, Icon, color }) => {
          const active = prioridad === value;
          return (
            <button key={value} type="button"
              className={`${styles.prioBtn} ${active ? styles.prioBtnActive : ""}`}
              style={active ? { color, borderColor: color, background: `${color}18` } : {}}
              onClick={() => onChange(value)}>
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
});

const Responsables = memo(function Responsables({ usuarios, asignadosIds, onToggle, onLimpiar }) {
  return (
    <div className={styles.section}>
      <p className={styles.sectionLabel}>Responsables</p>
      <div className={styles.assignChipsRow}>
        <button type="button"
          className={`${styles.assignChip} ${!asignadosIds?.length ? styles.assignChipActive : ""}`}
          onClick={onLimpiar}>
          <span className={styles.assignAvatar} style={{ background: "#E5E7EB", color: "#6B7280" }}>–</span>
          Sin asignar
        </button>
        {usuarios.map(u => {
          const initials = u.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
          const active   = asignadosIds?.includes(u.id);
          return (
            <button key={u.id} type="button"
              className={`${styles.assignChip} ${active ? styles.assignChipActive : ""}`}
              onClick={() => onToggle(u.id)}>
              <span className={styles.assignAvatar}
                style={active
                  ? { background: "var(--accent-1)", color: "#fff" }
                  : { background: "#EEF2FF", color: "var(--accent-1)" }}>
                {initials}
              </span>
              {u.nombre.split(" ")[0]}
            </button>
          );
        })}
      </div>
    </div>
  );
});

const Checklist = memo(function Checklist({ pasos, plantillaNombre, stepsDone, onToggle }) {
  const pct = Math.round((stepsDone.size / pasos.length) * 100);
  return (
    <div className={styles.section}>
      <div className={styles.sectionHeaderRow}>
        <p className={styles.sectionLabel}>
          Procedimiento{plantillaNombre ? ` — ${plantillaNombre}` : ""}
        </p>
        <span className={styles.stepsCount}>{stepsDone.size}/{pasos.length}</span>
      </div>
      <div className={styles.stepsProgress}>
        <div className={styles.stepsProgressFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.pasosList}>
        {pasos.map(p => {
          const done = stepsDone.has(p.id);
          return (
            <div key={p.id}
              className={`${styles.pasoItem} ${done ? styles.pasoItemDone : ""}`}
              onClick={() => onToggle(p.id)}>
              <div className={styles.pasoCheckWrap}>
                {done
                  ? <CheckSquare size={20} style={{ color: "var(--accent-1)" }} />
                  : <div className={styles.pasoCheckEmpty} />}
              </div>
              <span className={styles.pasoText}>{p.contenido}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const ActionBar = memo(function ActionBar({ estado, onIniciar, onOpenCloseSheet }) {
  return (
    <div className={styles.actionBar}>
      {(estado === "pendiente" || estado === "en_espera") && (
        <button className={styles.actionBtnPrimary} onClick={onIniciar}>
          <Play size={20} /> Iniciar trabajo
        </button>
      )}
      {estado === "en_curso" && (
        <button className={styles.actionBtnSuccess} onClick={onOpenCloseSheet}>
          <CheckCircle2 size={20} /> Completar OT
        </button>
      )}
      {estado === "en_revision" && (
        <button className={styles.actionBtnSuccess} onClick={onOpenCloseSheet}>
          <BadgeCheck size={20} /> Aprobar y cerrar
        </button>
      )}
    </div>
  );
});

const Lightbox = memo(function Lightbox({ url, onClose }) {
  return (
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <button className={styles.lightboxClose} onClick={onClose}><X size={22} /></button>
      <img src={url} className={styles.lightboxImg} onClick={e => e.stopPropagation()} alt="" />
    </div>
  );
});

// CloseSheet owns notasCierre state — keeps completarOT callback stable
// (no dependency on a frequently-changing state value)
const CloseSheet = memo(function CloseSheet({ onClose, onConfirm, completing }) {
  const [notas, setNotas] = useState("");
  return (
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div className={styles.sheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <div className={styles.sheetHeader}>
          <p className={styles.sheetTitle}>Cerrar orden de trabajo</p>
          <button className={styles.sheetClose} onClick={onClose}><X size={18} /></button>
        </div>
        <p className={styles.sheetHint}>
          Agrega notas de lo que hiciste (opcional) y confirma para cerrar la OT.
        </p>
        <textarea
          className={styles.notasInput}
          placeholder="Ej: Se reemplazó el sello de la bomba. Sistema funcionando con normalidad."
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={4}
          autoFocus
        />
        <button className={styles.actionBtnSuccess} onClick={() => onConfirm(notas)} disabled={completing}>
          {completing ? <Loader2 size={18} className={styles.spinIcon} /> : <CheckCircle2 size={18} />}
          {completing ? "Cerrando…" : "Confirmar y cerrar"}
        </button>
      </div>
    </div>
  );
});
