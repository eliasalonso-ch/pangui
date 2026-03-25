"use client";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Settings2, ExternalLink,
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, BadgeCheck, Wifi, Paintbrush, Leaf,
  CheckSquare, FileText, Camera, Play,
  CheckCircle2, Calendar, Loader2, X, ChevronDown, Minus, ChevronUp,
  Circle, PauseCircle, PlayCircle, XCircle, ChevronsRight,
  Trash2, MessageSquare, Send,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import { Button }                          from "@/components/ui/button";
import { Badge }                           from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress }                        from "@/components/ui/progress";
import { Avatar, AvatarFallback }          from "@/components/ui/avatar";
import { Separator }                       from "@/components/ui/separator";
import { Textarea }                        from "@/components/ui/textarea";
import styles from "./page.module.css";

// ─── Module-level constants ───────────────────────────────────────────────────
const LUCIDE_ICONS = {
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, CheckSquare, BadgeCheck, Settings2, Wifi, Paintbrush, Leaf,
};

const ESTADO_CONFIG = {
  pendiente:   { label: "Abierta",   variant: "info",    Icon: Circle       },
  en_espera:   { label: "En espera", variant: "warning",  Icon: PauseCircle  },
  en_curso:    { label: "En curso",  variant: "secondary",Icon: PlayCircle   },
  en_revision: { label: "Revisión",  variant: "secondary",Icon: PlayCircle   },
  completado:  { label: "Completada",variant: "success",  Icon: CheckCircle2 },
  cancelado:   { label: "Cancelada", variant: "muted",    Icon: XCircle      },
};

const PRIORIDAD_CONFIG = {
  ninguna: { label: "Sin prioridad", color: null,       Icon: Minus         },
  baja:    { label: "Baja",          color: "#9CA3AF",  Icon: ChevronDown   },
  media:   { label: "Media",         color: "#3B82F6",  Icon: Minus         },
  alta:    { label: "Alta",          color: "#F97316",  Icon: ChevronUp     },
  urgente: { label: "Urgente",       color: "#EF4444",  Icon: AlertTriangle },
};

const TIPO_TRABAJO_LABEL = { reactiva: "Reactiva", preventiva: "Preventiva", inspeccion: "Inspección", mejora: "Mejora" };

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

// ─── Utilities ────────────────────────────────────────────────────────────────
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

function initials(nombre) {
  return (nombre ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
}

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

// ─── Main component ───────────────────────────────────────────────────────────
export default function OTDetailClient({ id, initialOrden, initialArchivos, initialComentarios, initialPasos, usuarios: initialUsuarios, myId: initialMyId }) {
  const router = useRouter();

  const [orden,        setOrden]        = useState(initialOrden);
  const [pasos,        setPasos]        = useState(initialPasos);
  const [archivos,     setArchivos]     = useState(initialArchivos);
  const [loading,      setLoading]      = useState(false);
  const [myId,         setMyId]         = useState(initialMyId);
  const workspaceIdRef = useRef(initialOrden?.workspace_id ?? null);

  const [timerStart,     setTimerStart]     = useState(null);
  const fotoContextoRef  = useRef(null);
  const fotoEvidenciaRef = useRef(null);
  const [uploadingCtx,   setUploadingCtx]   = useState(false);
  const [uploadingEvd,   setUploadingEvd]   = useState(false);
  const [stepsDone,      setStepsDone]      = useState(new Set());
  const [usuarios,       setUsuarios]       = useState(initialUsuarios);
  const [showCloseSheet, setShowCloseSheet] = useState(false);
  const [completing,     setCompleting]     = useState(false);
  const [lightboxUrl,    setLightboxUrl]    = useState(null);
  const [comentarios,    setComentarios]    = useState(initialComentarios);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [sendingComment,  setSendingComment]  = useState(false);

  // ── Redirect desktop, restore timer/steps ────────────────────────────────────
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      sessionStorage.setItem("pangui_open_ot", id);
      router.replace("/ordenes");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const ts = parseInt(localStorage.getItem(`pangui_start_${id}`));
      if (!isNaN(ts) && ts > 0 && initialOrden?.estado === "en_curso") setTimerStart(ts);
    } catch {}
    if (initialPasos?.length) {
      try {
        const saved = JSON.parse(localStorage.getItem(`pangui_steps_${id}`) || "[]");
        setStepsDone(new Set(saved));
      } catch {}
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime UPDATE ───────────────────────────────────────────────────────────
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`ot-detail-${id}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "ordenes_trabajo",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setOrden(prev => prev ? { ...prev, ...payload.new } : prev);
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const { fotosContexto, fotosEvidencia, otrosArcs } = useMemo(() => ({
    fotosContexto:  archivos.filter(a => a.tipo_mime?.startsWith("image/") && a.tipo === "contexto"),
    fotosEvidencia: archivos.filter(a => a.tipo_mime?.startsWith("image/") && a.tipo !== "contexto"),
    otrosArcs:      archivos.filter(a => !a.tipo_mime?.startsWith("image/")),
  }), [archivos]);

  const otId = useMemo(() =>
    orden
      ? `${orden.tipo === "emergencia" ? "EM" : "OT"}-${new Date(orden.created_at).getFullYear()}-${orden.id.slice(-4).toUpperCase()}`
      : "",
  [orden?.id, orden?.tipo, orden?.created_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const CatIcon = useMemo(() =>
    orden?.categorias_ot ? (LUCIDE_ICONS[orden.categorias_ot.icono] ?? null) : null,
  [orden?.categorias_ot?.icono]); // eslint-disable-line react-hooks/exhaustive-deps

  const enAccion = useMemo(() =>
    ["pendiente", "en_espera", "en_curso", "en_revision"].includes(orden?.estado),
  [orden?.estado]);

  // ── Handlers ──────────────────────────────────────────────────────────────────
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
    let anterior;
    let added = false;
    let ordenTitulo = "";
    setOrden(prev => {
      if (!prev) return prev;
      anterior = prev.asignados_ids ?? [];
      added = !anterior.includes(userId);
      ordenTitulo = prev.titulo ?? "";
      const siguiente = added
        ? [...anterior, userId]
        : anterior.filter(uid => uid !== userId);
      const sb = createClient();
      sb.from("ordenes_trabajo").update({ asignados_ids: siguiente }).eq("id", id)
        .then(({ error }) => {
          if (error) setOrden(p => p ? { ...p, asignados_ids: anterior } : p);
        });
      return { ...prev, asignados_ids: siguiente };
    });
    if (added) {
      callEdge("notificar", {
        usuario_id: userId,
        titulo: "Te han asignado una orden de trabajo",
        mensaje: ordenTitulo || "Nueva asignación",
        url: `/ordenes/${id}`,
      }).catch(() => {});
    }
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
    setOrden(prev => {
      if (!prev) return prev;
      const asignados = (prev.asignados_ids ?? []).filter(uid => uid !== myId);
      if (asignados.length > 0) {
        callEdge("notificar", {
          usuario_ids: asignados,
          titulo: "Orden de trabajo iniciada",
          mensaje: prev.titulo || "Se ha iniciado una orden de trabajo",
          url: `/ordenes/${id}`,
        }).catch(() => {});
      }
      return { ...prev, estado: "en_curso" };
    });
  }, [id, myId]);

  const completarOT = useCallback(async (notas) => {
    setCompleting(true);
    const sb    = createClient();
    const ahora = new Date().toISOString();
    await sb.from("ordenes_trabajo").update({ estado: "completado", completado_en: ahora }).eq("id", id);
    if (notas?.trim() && workspaceIdRef.current && myId) {
      try {
        await sb.from("comentarios_orden").insert({
          orden_id: id, planta_id: workspaceIdRef.current, usuario_id: myId,
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

  const subirFotoCtx = useCallback((f) => subirFoto(f, "contexto"), [subirFoto]);
  const subirFotoEvd = useCallback((f) => subirFoto(f, "evidencia"), [subirFoto]);
  const handleBack      = useCallback(() => router.back(),            [router]);
  const openCloseSheet  = useCallback(() => setShowCloseSheet(true),  []);
  const closeCloseSheet = useCallback(() => setShowCloseSheet(false), []);
  const closeLightbox   = useCallback(() => setLightboxUrl(null),     []);

  const agregarComentario = useCallback(async () => {
    const texto = comentarioTexto.trim();
    if (!texto || !workspaceIdRef.current || !myId) return;
    setSendingComment(true);
    const sb = createClient();
    const { data: nuevo } = await sb.from("comentarios_orden").insert({
      orden_id: id, planta_id: workspaceIdRef.current, usuario_id: myId,
      tipo: "comentario", contenido: texto,
    }).select("id, tipo, contenido, created_at, usuario_id").single();
    if (nuevo) setComentarios(prev => [...prev, nuevo]);
    setComentarioTexto("");
    setSendingComment(false);
  }, [id, myId, comentarioTexto]);

  const eliminarOT = useCallback(async () => {
    if (!window.confirm("¿Eliminar esta orden de trabajo permanentemente? Esta acción no se puede deshacer.")) return;
    const sb = createClient();
    await sb.from("ordenes_trabajo").delete().eq("id", id);
    router.back();
  }, [id, router]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (!orden) return <div className={styles.loading}>OT no encontrada.</div>;

  const estadoCfg   = ESTADO_CONFIG[orden.estado]   ?? ESTADO_CONFIG.pendiente;
  const prioridadCfg = PRIORIDAD_CONFIG[orden.prioridad] ?? PRIORIDAD_CONFIG.ninguna;
  const venc = vencimiento(orden.fecha_termino);

  return (
    <main className={styles.page}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft size={20} />
        </Button>
        <div className={styles.headerCenter}>
          <span className={styles.otId}>{otId}</span>
          {CatIcon && orden.categorias_ot && (
            <Badge variant="outline" style={{ borderColor: orden.categorias_ot.color, color: orden.categorias_ot.color }}>
              <CatIcon size={11} />
              {orden.categorias_ot.nombre}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" asChild>
          <a href={`/ordenes/${orden.id}/edit`}><ExternalLink size={18} /></a>
        </Button>
        <Button variant="ghost" size="icon" onClick={eliminarOT} className="text-destructive hover:text-destructive">
          <Trash2 size={18} />
        </Button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Title + meta badges */}
        <h1 className={styles.titulo}>{orden.titulo || orden.descripcion?.slice(0, 100) || "Sin título"}</h1>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Badge variant={estadoCfg.variant}>
            <estadoCfg.Icon size={11} />
            {estadoCfg.label}
          </Badge>
          {orden.prioridad && orden.prioridad !== "ninguna" && (
            <Badge variant="outline" style={{ borderColor: prioridadCfg.color, color: prioridadCfg.color }}>
              <prioridadCfg.Icon size={11} />
              {prioridadCfg.label}
            </Badge>
          )}
          {orden.tipo_trabajo && (
            <Badge variant="secondary">{TIPO_TRABAJO_LABEL[orden.tipo_trabajo]}</Badge>
          )}
          {venc && (
            <Badge variant={venc.urgent ? "destructive" : "outline"} suppressHydrationWarning>
              <Calendar size={11} />
              {venc.label}
            </Badge>
          )}
        </div>

        <p className={styles.createdAt} suppressHydrationWarning>
          <Calendar size={12} />
          Creada el{" "}
          {new Date(orden.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
          {" a las "}
          {new Date(orden.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
        </p>

        <Separator className="my-4" />

        {/* Fotos del problema */}
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

        {/* Timer banner */}
        {orden.estado === "en_curso" && timerStart && (
          <TimerBanner timerStart={timerStart} tiempoEstimado={orden.tiempo_estimado} />
        )}

        {/* Completed banner */}
        {orden.estado === "completado" && (
          <div className={styles.completadoBanner} suppressHydrationWarning>
            <CheckCircle2 size={16} />
            <span suppressHydrationWarning>
              Completada
              {orden.completado_en && ` · ${new Date(orden.completado_en).toLocaleDateString("es-CL", { day: "numeric", month: "short" })} ${new Date(orden.completado_en).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </div>
        )}

        {/* Estado selector */}
        <EstadoSelector estado={orden.estado} onChange={cambiarEstado} />
        {/* Prioridad selector */}
        <PrioritySelector prioridad={orden.prioridad} onChange={cambiarPrioridad} />

        {/* Responsables */}
        {usuarios.length > 0 && (
          <Responsables
            usuarios={usuarios}
            asignadosIds={orden.asignados_ids}
            onToggle={toggleResponsable}
            onLimpiar={limpiarResponsables}
          />
        )}

        <Separator className="my-4" />

        {/* Descripción */}
        {orden.descripcion && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Descripción</p>
            <p className={styles.sectionText}>{orden.descripcion}</p>
          </div>
        )}

        {/* Datos de solicitud (scanned) */}
        {(orden.numero_meconecta || orden.solicitante || orden.ubicacion_texto || orden.lugar) && (
          <div className={styles.section}>
            <p className={styles.sectionLabel}>Datos de solicitud</p>
            <div className="mt-2 rounded-xl border border-border overflow-hidden">
              {orden.numero_meconecta && (
                <ScanRow label="N° Referencia" value={orden.numero_meconecta} />
              )}
              {orden.solicitante && (
                <ScanRow label="Solicitante" value={orden.solicitante} />
              )}
              {orden.ubicacion_texto && (
                <ScanRow label="Edificio" value={orden.ubicacion_texto} />
              )}
              {orden.lugar && (
                <ScanRow label="Lugar" value={orden.lugar} last />
              )}
            </div>
          </div>
        )}

        {/* Checklist */}
        {pasos.length > 0 && (
          <Checklist
            pasos={pasos}
            plantillaNombre={orden.plantillas_procedimiento?.nombre}
            stepsDone={stepsDone}
            onToggle={toggleStep}
          />
        )}

        {/* Partes requeridas */}
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

        {/* Fotos evidencia */}
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

        {/* Archivos adjuntos */}
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

        {/* Comentarios */}
        <Separator className="mb-4" />
        <div className={styles.comentariosSection}>
          <div className={styles.sectionHeaderRow}>
            <p className={styles.sectionLabel}>
              <MessageSquare size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              Comentarios
              {comentarios.filter(c => c.tipo === "comentario").length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs px-1.5 py-0">
                  {comentarios.filter(c => c.tipo === "comentario").length}
                </Badge>
              )}
            </p>
          </div>
          <div className={styles.comentariosList}>
            {comentarios.map(c => {
              const autor = usuarios.find(u => u.id === c.usuario_id);
              return (
                <div key={c.id} className={`${styles.comentarioItem} ${c.tipo === "sistema" ? styles.comentarioSistema : ""}`}>
                  {c.tipo === "comentario" && (
                    <Avatar className="size-7 shrink-0">
                      <AvatarFallback className="text-[10px]">{initials(autor?.nombre)}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={styles.comentarioContent}>
                    {c.tipo === "comentario" && (
                      <span className={styles.comentarioAutor}>{autor?.nombre ?? "Usuario"}</span>
                    )}
                    <p className={styles.comentarioTexto}>{c.contenido}</p>
                    <span className={styles.comentarioFecha} suppressHydrationWarning>
                      {new Date(c.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                      {" "}
                      {new Date(c.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.comentarioInputRow}>
            <Textarea
              placeholder="Escribe un comentario…"
              rows={2}
              value={comentarioTexto}
              onChange={e => setComentarioTexto(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); agregarComentario(); } }}
              className="resize-none"
            />
            <Button
              variant="default"
              size="icon"
              onClick={agregarComentario}
              disabled={!comentarioTexto.trim() || sendingComment}
            >
              {sendingComment ? <Loader2 size={18} className={styles.spinIcon} /> : <Send size={18} />}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Action bar ─────────────────────────────────────────────────── */}
      {enAccion && (
        <ActionBar
          estado={orden.estado}
          onIniciar={iniciar}
          onOpenCloseSheet={openCloseSheet}
        />
      )}

      {/* ── Lightbox ───────────────────────────────────────────────────── */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={closeLightbox} />}

      {/* ── Close sheet ────────────────────────────────────────────────── */}
      <Sheet open={showCloseSheet} onOpenChange={setShowCloseSheet}>
        <SheetContent side="bottom" className="pb-safe max-h-[80vh] overflow-y-auto">
          <CloseSheetBody onClose={closeCloseSheet} onConfirm={completarOT} completing={completing} />
        </SheetContent>
      </Sheet>
    </main>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScanRow({ label, value, last }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-3 py-2.5 bg-background ${!last ? "border-b border-border" : ""}`}>
      <span className="text-xs text-muted-foreground font-medium shrink-0">{label}</span>
      <span className="text-sm font-semibold text-right">{value}</span>
    </div>
  );
}

const TimerBanner = memo(function TimerBanner({ timerStart, tiempoEstimado }) {
  const [secs, setSecs] = useState(() => Math.floor((Date.now() - timerStart) / 1000));

  useEffect(() => {
    const tick = () => setSecs(Math.floor((Date.now() - timerStart) / 1000));
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
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

const FotoSection = memo(function FotoSection({ titulo, fotos, uploading, inputRef, onAdd, onOpenLightbox, emptyText, wrapperClass }) {
  return (
    <div className={wrapperClass}>
      <div className={styles.sectionHeaderRow}>
        <p className={styles.sectionLabel}>{titulo}</p>
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 size={13} className={styles.spinIcon} /> : <Camera size={13} />}
          {uploading ? "Subiendo…" : "Agregar"}
        </Button>
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
          const cfg = ESTADO_CONFIG[value] ?? ESTADO_CONFIG.pendiente;
          const active = estado === value;
          return (
            <button key={value} type="button"
              className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
              style={active ? (() => {
                const colorMap = { info: { bg:"#EFF6FF",text:"#3B82F6"}, warning:{bg:"#FFFBEB",text:"#D97706"}, secondary:{bg:"#EEF2FF",text:"#6366F1"}, success:{bg:"#F0FDF4",text:"#22C55E"}, muted:{bg:"#F3F4F6",text:"#6B7280"} };
                const c = colorMap[cfg.variant] ?? colorMap.muted;
                return { background: c.bg, color: c.text, borderColor: c.text };
              })() : {}}
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
      <div className="flex flex-wrap gap-2 mt-2">
        <button type="button"
          className={`${styles.assignChip} ${!asignadosIds?.length ? styles.assignChipActive : ""}`}
          onClick={onLimpiar}>
          <Avatar className="size-[22px]">
            <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">–</AvatarFallback>
          </Avatar>
          Sin asignar
        </button>
        {usuarios.map(u => {
          const active = asignadosIds?.includes(u.id);
          return (
            <button key={u.id} type="button"
              className={`${styles.assignChip} ${active ? styles.assignChipActive : ""}`}
              onClick={() => onToggle(u.id)}>
              <Avatar className="size-[22px]">
                <AvatarFallback
                  className="text-[9px] font-bold"
                  style={active
                    ? { background: "var(--accent-1)", color: "#fff" }
                    : { background: "#EEF2FF", color: "var(--accent-1)" }}>
                  {initials(u.nombre)}
                </AvatarFallback>
              </Avatar>
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
        <Badge variant="secondary">{stepsDone.size}/{pasos.length}</Badge>
      </div>
      <Progress value={pct} className="mt-2 mb-3" />
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
        <Button size="full" onClick={onIniciar}>
          <Play size={20} /> Iniciar trabajo
        </Button>
      )}
      {estado === "en_curso" && (
        <Button size="full" variant="success" onClick={onOpenCloseSheet}>
          <CheckCircle2 size={20} /> Completar OT
        </Button>
      )}
      {estado === "en_revision" && (
        <Button size="full" variant="success" onClick={onOpenCloseSheet}>
          <BadgeCheck size={20} /> Aprobar y cerrar
        </Button>
      )}
    </div>
  );
});

const Lightbox = memo(function Lightbox({ url, onClose }) {
  return (
    <div className={styles.lightboxOverlay} onClick={onClose}>
      <Button variant="ghost" size="icon" className={styles.lightboxClose} onClick={onClose}>
        <X size={22} />
      </Button>
      <img src={url} className={styles.lightboxImg} onClick={e => e.stopPropagation()} alt="" />
    </div>
  );
});

// CloseSheet content lives inside the Radix Sheet — owns its own notas state
const CloseSheetBody = memo(function CloseSheetBody({ onClose, onConfirm, completing }) {
  const [notas, setNotas] = useState("");
  return (
    <div className="px-5 pb-6">
      <SheetHeader className="px-0 pt-0 pb-4">
        <SheetTitle>Cerrar orden de trabajo</SheetTitle>
        <Button variant="ghost" size="icon" onClick={onClose} className="-mr-1">
          <X size={18} />
        </Button>
      </SheetHeader>
      <p className="text-sm text-muted-foreground mb-3">
        Agrega notas de lo que hiciste (opcional) y confirma para cerrar la OT.
      </p>
      <Textarea
        placeholder="Ej: Se reemplazó el sello de la bomba. Sistema funcionando con normalidad."
        value={notas}
        onChange={e => setNotas(e.target.value)}
        rows={4}
        autoFocus
        className="mb-4"
      />
      <Button size="full" variant="success" onClick={() => onConfirm(notas)} disabled={completing}>
        {completing ? <Loader2 size={18} className={styles.spinIcon} /> : <CheckCircle2 size={18} />}
        {completing ? "Cerrando…" : "Confirmar y cerrar"}
      </Button>
    </div>
  );
});
