"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import {
  X, Pencil, Trash2, Check, Copy, MapPin, Settings2, User, Flag,
  Calendar, Tag, Send, AlertTriangle, Loader2,
  CircleDot, PauseCircle, PlayCircle, CheckCircle2, XCircle,
  ChevronDown, Plus, Image, Building2, Hash,
  Play, Pause, Square, RotateCcw,
  Download, FileText, Sheet, FileDown,
  Package, Search,
  ClipboardCheck, Info, Hash as HashIcon, Camera, PenLine, Shield, CheckSquare,
  Type, DollarSign, List, ListChecks, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LinksDisplay } from "@/components/LinksInput";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  updateOrdenEstado, updateOrdenPrioridad,
  iniciarOrden, pausarOrden, reanudarOrden, completarOrden,
  fetchActividad, addComentario,
  uploadOrdenFoto, addOrdenFoto, removeOrdenFoto,
  parseDescMeta,
} from "@/lib/ordenes-api";
import {
  getOTProcedimientos, attachProcedimiento, detachProcedimiento,
  listProcedimientos, startEjecucion, saveRespuesta, completeEjecucion,
} from "@/lib/procedimientos-api";
import type {
  OrdenTrabajo, ActividadOT, ActividadTipo, Usuario, Estado, Prioridad,
} from "@/types/ordenes";
import type {
  OTProcedimiento, ProcedimientoListItem, ProcedimientoEjecucion,
  PasoRespuesta, TipoPasoProc, ProcedimientoPaso,
} from "@/types/procedimientos";

type PendingResp = Omit<Partial<PasoRespuesta>, "firmado_nombre"> & { firmado_nombre?: string | null };

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADOS: { value: Estado; label: string; icon: React.ComponentType<{ className?: string }>; className: string }[] = [
  { value: "pendiente",   label: "Abierta",     icon: CircleDot,    className: "text-blue-600" },
  { value: "en_espera",   label: "En espera",   icon: PauseCircle,  className: "text-amber-600" },
  { value: "en_curso",    label: "En curso",    icon: PlayCircle,   className: "text-purple-600" },
  { value: "completado",  label: "Completada",  icon: CheckCircle2, className: "text-green-600" },
];

const PRIORIDADES: { value: Prioridad; label: string; color: string }[] = [
  { value: "ninguna", label: "Sin prioridad", color: "text-zinc-400" },
  { value: "baja",    label: "Baja",          color: "text-zinc-500" },
  { value: "media",   label: "Media",         color: "text-blue-600" },
  { value: "alta",    label: "Alta",          color: "text-orange-500" },
  { value: "urgente", label: "Urgente",       color: "text-red-600" },
];

const TIPO_LABEL: Record<string, string> = {
  reactiva: "Reactiva", preventiva: "Preventiva",
  inspeccion: "Inspección", mejora: "Mejora",
};

const ACT_ICON: Record<ActividadTipo, React.ComponentType<{ className?: string }>> = {
  creado:           CircleDot,
  asignado:         User,
  estado_cambiado:  PlayCircle,
  prioridad_cambiada: AlertTriangle,
  editado:          Pencil,
  ubicacion_cambiada: MapPin,
  iniciado:         Play,
  pausado:          Pause,
  reanudado:        RotateCcw,
  completado:       CheckCircle2,
  cancelado:        XCircle,
  comentario:       Send,
};

const ACT_COLOR: Record<ActividadTipo, string> = {
  creado:            "text-indigo-500",
  asignado:          "text-violet-500",
  estado_cambiado:   "text-blue-500",
  prioridad_cambiada:"text-orange-500",
  editado:           "text-zinc-500",
  ubicacion_cambiada:"text-teal-500",
  iniciado:          "text-green-500",
  pausado:           "text-amber-500",
  reanudado:         "text-cyan-500",
  completado:        "text-green-600",
  cancelado:         "text-zinc-400",
  comentario:        "text-blue-500",
};

const ACT_LABEL: Record<ActividadTipo, string> = {
  creado:            "Orden creada",
  asignado:          "Asignado a",
  estado_cambiado:   "Estado cambiado a",
  prioridad_cambiada:"Prioridad cambiada a",
  editado:           "Orden editada",
  ubicacion_cambiada:"Ubicación actualizada",
  iniciado:          "Trabajo iniciado",
  pausado:           "Trabajo pausado",
  reanudado:         "Trabajo reanudado",
  completado:        "Orden completada",
  cancelado:         "Orden cancelada",
  comentario:        "",
};

function fmtTs(ts: string) {
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function fmtSecs(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ── N° OT badge with copy ─────────────────────────────────────────────────────

function NOTBadge({ nOT }: { nOT: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(nOT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      style={{
        display: "inline-flex", alignItems: "center", gap: 3,
        fontSize: 11, fontFamily: "monospace", fontWeight: 600,
        color: "#1E3A8A", background: "none", border: "none", cursor: "pointer", padding: 0,
      }}
    >
      <span>{nOT}</span>
      {copied
        ? <Check size={10} style={{ color: "#16A34A" }} />
        : <Copy size={10} style={{ color: "#C4CDD6" }} />
      }
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orden:          OrdenTrabajo;
  usuarios:       Usuario[];
  myId:           string;
  myRol:          string | null;
  wsId:           string;
  onEdit:         () => void;
  onDelete:       () => void;
  onClose:        () => void;
  onOrdenUpdated: (o: Partial<OrdenTrabajo>) => void;
}

type Tab = "detalle" | "actividad" | "fotos" | "materiales" | "procedimientos";

// ── Parts types ───────────────────────────────────────────────────────────────

interface OrdenParte {
  id: string;
  parte_id: string;
  cantidad: number;
  cantidad_utilizada: number | null;
  parte: {
    nombre: string;
    unidad: string;
    stock_actual: number;
  } | null;
}

interface ParteCatalogo {
  id: string;
  nombre: string;
  unidad: string;
  stock_actual: number;
}

// ── Timer hook ────────────────────────────────────────────────────────────────

function useTimer(orden: OrdenTrabajo) {
  const getElapsed = useCallback(() => {
    const base = orden.tiempo_total_segundos ?? 0;
    if (!orden.en_ejecucion || !orden.iniciado_at) return base;
    const extra = Math.floor((Date.now() - new Date(orden.iniciado_at).getTime()) / 1000);
    return base + extra;
  }, [orden]);

  const [elapsed, setElapsed] = useState(getElapsed);

  useEffect(() => {
    setElapsed(getElapsed());
    if (!orden.en_ejecucion) return;
    const id = setInterval(() => setElapsed(getElapsed()), 1000);
    return () => clearInterval(id);
  }, [orden.en_ejecucion, orden.iniciado_at, orden.tiempo_total_segundos, getElapsed]);

  return elapsed;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OTDetail({
  orden, usuarios, myId, myRol, wsId,
  onEdit, onDelete, onClose, onOrdenUpdated,
}: Props) {
  const [tab, setTab] = useState<Tab>("detalle");
  const [actividad, setActividad] = useState<ActividadOT[]>([]);
  const [loadingAct, setLoadingAct] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const [timerAction, setTimerAction] = useState<"pausar" | "completar" | null>(null);
  const [timerComment, setTimerComment] = useState("");
  const [timerBusy, setTimerBusy] = useState(false);

  const [fotos, setFotos] = useState<string[]>([
    ...(orden.imagen_url ? [orden.imagen_url] : []),
    ...(orden.fotos_urls ?? []),
  ]);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [deletingFoto, setDeletingFoto] = useState<string | null>(null);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState<"pdf" | "csv" | "txt" | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  type ExportField =
    | "n_ot" | "n_serie" | "id" | "titulo" | "estado" | "prioridad" | "tipo_trabajo" | "categoria" | "solicitante" | "hito"
    | "descripcion"
    | "asignados" | "empresa" | "ubicacion" | "lugar"
    | "creada_el" | "fecha_inicio" | "fecha_limite" | "tiempo_trabajado"
    | "materiales"
    | "actividad";

  const EXPORT_FIELDS: { key: ExportField; label: string; group: string }[] = [
    { key: "n_ot",            label: "N° OT",               group: "Información general" },
    { key: "n_serie",         label: "N° de serie / folio", group: "Información general" },
    { key: "id",              label: "ID",                   group: "Información general" },
    { key: "titulo",          label: "Título",               group: "Información general" },
    { key: "estado",          label: "Estado",               group: "Información general" },
    { key: "prioridad",       label: "Prioridad",            group: "Información general" },
    { key: "tipo_trabajo",    label: "Tipo de trabajo",      group: "Información general" },
    { key: "categoria",       label: "Categoría",            group: "Información general" },
    { key: "solicitante",     label: "Solicitante",          group: "Información general" },
    { key: "hito",            label: "Hito",                 group: "Información general" },
    { key: "descripcion",     label: "Descripción",          group: "Información general" },
    { key: "asignados",       label: "Asignados",            group: "Personas y ubicación" },
    { key: "empresa",         label: "Empresa",              group: "Personas y ubicación" },
    { key: "ubicacion",       label: "Ubicación",            group: "Personas y ubicación" },
    { key: "lugar",           label: "Lugar específico",     group: "Personas y ubicación" },
    { key: "creada_el",       label: "Creada el",            group: "Fechas y tiempos" },
    { key: "fecha_inicio",    label: "Fecha inicio",         group: "Fechas y tiempos" },
    { key: "fecha_limite",    label: "Fecha límite",         group: "Fechas y tiempos" },
    { key: "tiempo_trabajado",label: "Tiempo trabajado",     group: "Fechas y tiempos" },
    { key: "materiales",      label: "Materiales / partes",  group: "Otros" },
    { key: "actividad",       label: "Historial de actividad", group: "Otros" },
  ];

  const ALL_FIELDS_ON = Object.fromEntries(EXPORT_FIELDS.map(f => [f.key, true])) as Record<ExportField, boolean>;
  const ALL_FIELDS_OFF = Object.fromEntries(EXPORT_FIELDS.map(f => [f.key, false])) as Record<ExportField, boolean>;

  const [exportConfigOpen, setExportConfigOpen] = useState(false);
  const [exportFields, setExportFields] = useState<Record<ExportField, boolean>>(ALL_FIELDS_ON);

  // ── Procedimientos state ─────────────────────────────────────────────────────
  const [otProcs, setOtProcs] = useState<OTProcedimiento[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [procLibrary, setProcLibrary] = useState<ProcedimientoListItem[]>([]);
  const [loadingProcLib, setLoadingProcLib] = useState(false);
  const [attachingProc, setAttachingProc] = useState<string | null>(null);
  const [detachingProc, setDetachingProc] = useState<string | null>(null);
  const [startingEjec, setStartingEjec] = useState<string | null>(null);
  const [activeEjec, setActiveEjec] = useState<{ ejecucion: ProcedimientoEjecucion; pasos: OTProcedimiento["procedimiento"] | null } | null>(null);
  const [savingResp, setSavingResp] = useState<string | null>(null);
  const [pendingResps, setPendingResps] = useState<Record<string, PendingResp>>({});
  const [completingEjec, setCompletingEjec] = useState(false);

  // ── Partes state ─────────────────────────────────────────────────────────────
  const [ordenPartes, setOrdenPartes] = useState<OrdenParte[]>([]);
  const [loadingPartes, setLoadingPartes] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogo, setCatalogo] = useState<ParteCatalogo[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [addingParte, setAddingParte] = useState(false);
  const [deletingParteId, setDeletingParteId] = useState<string | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualCantidad, setManualCantidad] = useState("1");
  const [manualParteId, setManualParteId] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const elapsed = useTimer(orden);
  const canManage = myRol === "admin" || myRol === "jefe";
  const isActive = orden.estado !== "completado";

  // Sync fotos when orden prop updates (realtime)
  useEffect(() => {
    setFotos([
      ...(orden.imagen_url ? [orden.imagen_url] : []),
      ...(orden.fotos_urls ?? []),
    ]);
  }, [orden.imagen_url, orden.fotos_urls]);

  const actRtRef   = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const procsRtRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const channelKey = useRef(`actividad-${orden.id}-${Math.random().toString(36).slice(2)}`);
  const procsChannelKey = useRef(`ot-procs-web-${orden.id}-${Math.random().toString(36).slice(2)}`);

  // Load + subscribe activity whenever the tab is open
  useEffect(() => {
    if (tab !== "actividad") {
      // Unsubscribe when leaving the tab
      if (actRtRef.current) {
        createClient().removeChannel(actRtRef.current);
        actRtRef.current = null;
      }
      return;
    }

    setLoadingAct(true);
    fetchActividad(orden.id)
      .then(setActividad)
      .catch(() => {})
      .finally(() => setLoadingAct(false));

    // Realtime: prepend new actividad rows as they arrive
    const sb = createClient();
    actRtRef.current = sb
      .channel(channelKey.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "actividad_ot", filter: `orden_id=eq.${orden.id}` },
        async () => {
          // Re-fetch to get joined usuario name
          const fresh = await fetchActividad(orden.id);
          setActividad(fresh);
        },
      )
      .subscribe();

    return () => {
      if (actRtRef.current) {
        sb.removeChannel(actRtRef.current);
        actRtRef.current = null;
      }
    };
  }, [tab, orden.id]);


  // Load procedimientos when tab opens
  useEffect(() => {
    if (tab !== "procedimientos") return;
    if (otProcs.length === 0) {
      setLoadingProcs(true);
      getOTProcedimientos(orden.id)
        .then(data => { setOtProcs(data); setLoadingProcs(false); })
        .catch(() => setLoadingProcs(false));
    }
  }, [tab, orden.id]);

  // Load procedure library (lazy, for attach picker)
  useEffect(() => {
    if (tab !== "procedimientos" || procLibrary.length > 0 || !wsId) return;
    setLoadingProcLib(true);
    listProcedimientos(wsId)
      .then(data => { setProcLibrary(data); setLoadingProcLib(false); })
      .catch(() => setLoadingProcLib(false));
  }, [tab, wsId]);

  // Realtime: keep procedimientos tab in sync when native app or another browser attaches/detaches
  useEffect(() => {
    if (tab !== "procedimientos") {
      if (procsRtRef.current) {
        createClient().removeChannel(procsRtRef.current);
        procsRtRef.current = null;
      }
      return;
    }

    const sb = createClient();
    procsRtRef.current = sb
      .channel(procsChannelKey.current)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ot_procedimientos", filter: `orden_id=eq.${orden.id}` },
        async () => {
          const updated = await getOTProcedimientos(orden.id);
          setOtProcs(updated);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "procedimiento_ejecuciones", filter: `orden_id=eq.${orden.id}` },
        async () => {
          const updated = await getOTProcedimientos(orden.id);
          setOtProcs(updated);
        },
      )
      .subscribe();

    return () => {
      if (procsRtRef.current) {
        sb.removeChannel(procsRtRef.current);
        procsRtRef.current = null;
      }
    };
  }, [tab, orden.id]);

  async function handleAttachProc(procId: string) {
    if (!myId) return;
    setAttachingProc(procId);
    try {
      await attachProcedimiento(orden.id, procId, myId);
      const updated = await getOTProcedimientos(orden.id);
      setOtProcs(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAttachingProc(null);
    }
  }

  async function handleDetachProc(procId: string) {
    setDetachingProc(procId);
    try {
      await detachProcedimiento(orden.id, procId);
      setOtProcs(prev => prev.filter(p => p.procedimiento_id !== procId));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDetachingProc(null);
    }
  }

  async function handleStartEjec(otProc: OTProcedimiento) {
    if (!myId) return;
    setStartingEjec(otProc.procedimiento_id);
    try {
      const ejec = await startEjecucion(otProc.procedimiento_id, orden.id, myId);
      setActiveEjec({ ejecucion: ejec, pasos: otProc.procedimiento ?? null });
      // Seed pending responses from existing answers
      const respMap: Record<string, PendingResp> = {};
      for (const r of ejec.respuestas ?? []) {
        respMap[r.paso_id] = r;
      }
      setPendingResps(respMap);
      // Refresh list
      const updated = await getOTProcedimientos(orden.id);
      setOtProcs(updated);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setStartingEjec(null);
    }
  }

  async function handleSaveResp(pasoId: string, extra?: PendingResp) {
    if (!activeEjec || !myId) return;
    const resp = { ...(pendingResps[pasoId] ?? {}), ...(extra ?? {}) };
    setSavingResp(pasoId);
    try {
      const saved = await saveRespuesta(activeEjec.ejecucion.id, pasoId, myId, {
        aprobado:         resp.aprobado ?? null,
        valor_medido:     resp.valor_medido ?? null,
        valor_texto:      resp.valor_texto ?? null,
        valor_json:       resp.valor_json ?? null,
        foto_url:         resp.foto_url ?? null,
        firma_svg:        resp.firma_svg ?? null,
        firmado_nombre:   resp.firmado_nombre ?? null,
        firmado_por_id:   resp.firmado_por_id ?? undefined,
        firmado_at:       resp.firmado_at ?? undefined,
        notas:            resp.notas ?? null,
      });
      // Merge the saved response back into the ejecucion's respuestas
      setActiveEjec(prev => {
        if (!prev) return prev;
        const existing = prev.ejecucion.respuestas ?? [];
        const idx = existing.findIndex(r => r.paso_id === pasoId);
        const next = idx >= 0
          ? existing.map((r, i) => i === idx ? saved : r)
          : [...existing, saved];
        return { ...prev, ejecucion: { ...prev.ejecucion, respuestas: next } };
      });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingResp(null);
    }
  }

  async function handleCompleteEjec() {
    if (!activeEjec || !myId) return;
    setCompletingEjec(true);
    try {
      await completeEjecucion(activeEjec.ejecucion.id, myId);
      const updated = await getOTProcedimientos(orden.id);
      setOtProcs(updated);
      setActiveEjec(null);
      setPendingResps({});
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCompletingEjec(false);
    }
  }

  // Load orden_partes when tab opens
  useEffect(() => {
    if (tab !== "materiales") return;
    setLoadingPartes(true);
    const sb = createClient();
    sb.from("orden_partes")
      .select("id, parte_id, cantidad, cantidad_utilizada, parte:partes!parte_id(nombre, unidad, stock_actual)")
      .eq("orden_id", orden.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        const normalized = (data ?? []).map((row: any) => ({
          ...row,
          parte: Array.isArray(row.parte) ? (row.parte[0] ?? null) : row.parte,
        }));
        setOrdenPartes(normalized as OrdenParte[]);
        setLoadingPartes(false);
      });
  }, [tab, orden.id]);

  // Load partes catalogue (lazy, once per open)
  useEffect(() => {
    if (tab !== "materiales" || catalogo.length > 0) return;
    setLoadingCatalog(true);
    const sb = createClient();
    sb.from("partes")
      .select("id, nombre, unidad, stock_actual")
      .eq("activo", true)
      .order("nombre", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        setCatalogo((data ?? []) as ParteCatalogo[]);
        setLoadingCatalog(false);
      });
  }, [tab, catalogo.length]);

  async function handleAddParte(parte: ParteCatalogo) {
    // Prevent duplicate
    if (ordenPartes.some(op => op.parte_id === parte.id)) return;
    const cantidad = 1;
    setAddingParte(true);
    const sb = createClient();
    const { data, error } = await sb.from("orden_partes").insert({
      orden_id: orden.id,
      parte_id: parte.id,
      cantidad,
    }).select("id, parte_id, cantidad, cantidad_utilizada").single();

    if (!error && data) {
      setOrdenPartes(prev => [...prev, { ...(data as any), parte }]);
      setCatalogSearch("");
      // Deduct stock
      const stockNuevo = Math.max(0, parte.stock_actual - cantidad);
      await sb.from("partes").update({ stock_actual: stockNuevo }).eq("id", parte.id);
      setCatalogo(prev => prev.map(p => p.id === parte.id ? { ...p, stock_actual: stockNuevo } : p));
    }
    setAddingParte(false);
  }

  async function handleUpdateCantidad(id: string, newCantidad: number) {
    if (newCantidad <= 0) return;
    const prev = ordenPartes.find(op => op.id === id);
    if (!prev) return;
    const diff = newCantidad - prev.cantidad;
    const sb = createClient();
    await sb.from("orden_partes").update({ cantidad: newCantidad }).eq("id", id);
    setOrdenPartes(p => p.map(op => op.id === id ? { ...op, cantidad: newCantidad } : op));
    // Adjust stock by the difference
    if (prev.parte_id) {
      const cat = catalogo.find(c => c.id === prev.parte_id);
      if (cat) {
        const stockNuevo = Math.max(0, cat.stock_actual - diff);
        await sb.from("partes").update({ stock_actual: stockNuevo }).eq("id", prev.parte_id);
        setCatalogo(p => p.map(c => c.id === prev.parte_id ? { ...c, stock_actual: stockNuevo } : c));
      }
    }
  }

  async function handleDeleteParte(id: string) {
    setDeletingParteId(id);
    const op = ordenPartes.find(p => p.id === id);
    const sb = createClient();
    await sb.from("orden_partes").delete().eq("id", id);
    setOrdenPartes(prev => prev.filter(p => p.id !== id));
    // Restore stock
    if (op?.parte_id) {
      const cat = catalogo.find(c => c.id === op.parte_id);
      const stockNuevo = (cat?.stock_actual ?? 0) + op.cantidad;
      await sb.from("partes").update({ stock_actual: stockNuevo }).eq("id", op.parte_id);
      setCatalogo(prev => prev.map(c => c.id === op.parte_id ? { ...c, stock_actual: stockNuevo } : c));
    }
    setDeletingParteId(null);
  }

  const filteredCatalog = catalogSearch.length >= 1
    ? catalogo
        .filter(p => p.nombre.toLowerCase().includes(catalogSearch.toLowerCase()))
        .filter(p => !ordenPartes.some(op => op.parte_id === p.id))
        .slice(0, 8)
    : [];


  const estadoCfg = ESTADOS.find(e => e.value === orden.estado) ?? ESTADOS[0];
  const StatusIcon = estadoCfg.icon;

  const assigned = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  // ── Actions ────────────────────────────────────────────────────────────────

  const changeStatus = async (newEstado: Estado) => {
    await updateOrdenEstado(orden.id, newEstado, myId, wsId && orden.titulo ? {
      titulo: orden.titulo,
      workspaceId: wsId,
      asignadosIds: orden.asignados_ids ?? [],
    } : undefined);
    onOrdenUpdated({ estado: newEstado });
  };

  const changePrioridad = async (p: Prioridad) => {
    await updateOrdenPrioridad(orden.id, p, myId);
    onOrdenUpdated({ prioridad: p });
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    setSending(true);
    try {
      await addComentario(orden.id, myId, text);
      setCommentText("");
      // Switch to actividad tab so the user sees their comment
      // Realtime will update the list automatically if already on that tab
      if (tab !== "actividad") {
        setTab("actividad");
      }
    } finally {
      setSending(false);
    }
  };

  // ── Export helpers ────────────────────────────────────────────────────────

  function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function fmtDate(iso: string | null | undefined) {
    return iso ? iso.slice(0, 10) : "—";
  }
  function fmtDuration(sec: number | null | undefined) {
    if (!sec || sec <= 0) return "—";
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return [h ? `${h}h` : null, m ? `${m}m` : null, s ? `${s}s` : null].filter(Boolean).join(" ");
  }
  function esc(v: unknown) {
    const s = v == null ? "" : String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  async function fetchActividadForExport() {
    try { return await fetchActividad(orden.id); } catch { return []; }
  }

  async function fetchWorkspaceName(): Promise<string> {
    try {
      const sb = createClient();
      const { data } = await sb.from("workspaces").select("nombre").eq("id", wsId).maybeSingle();
      return (data as any)?.nombre ?? "Pangui";
    } catch { return "Pangui"; }
  }

  const exporterName = () => {
    const u = usuarios.find(u => u.id === myId);
    return u?.nombre ?? "Usuario";
  };

  const meta = parseDescMeta(orden.descripcion ?? null);
  const nOT  = meta.nOT ?? `OT-${orden.id.slice(-8).toUpperCase()}`;

  async function handleExportPDF() {
    setExporting("pdf");
    setExportMenuOpen(false);
    try {
      const [act, wsNombre, freshProcs] = await Promise.all([
        fetchActividadForExport(),
        fetchWorkspaceName(),
        getOTProcedimientos(orden.id),
      ]);
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden, actividad: act, usuarios,
          exportadoPor: exporterName(),
          workspaceNombre: wsNombre,
          nOT: meta.nOT,
          partes: [], subOrdenes: [],
          procedimientos: freshProcs,
        }),
      });
      if (!res.ok) throw new Error(`PDF service error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `OT-${nOT}_${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`No se pudo generar el PDF: ${err instanceof Error ? err.message : err}`);
    } finally {
      setExporting(null);
    }
  }

  async function handleExportExcel() {
    setExporting("csv");
    setExportConfigOpen(false);
    try {
      const XLS = (await import("xlsx-js-style")).default;

      const asignadosNames = (orden.asignados_ids ?? [])
        .map(id => usuarios.find(u => u.id === id)?.nombre ?? id)
        .join("; ");

      // ── Style tokens ─────────────────────────────────────────────────────────
      const thin = { style: "thin" as const, color: { rgb: "D1D5DB" } };
      const borders = { top: thin, bottom: thin, left: thin, right: thin };

      const hdrStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" },
        fill: { patternType: "solid" as const, fgColor: { rgb: "1E3A8A" } },
        alignment: { horizontal: "center" as const, vertical: "center" as const, wrapText: true },
        border: borders,
      };
      const cellStyle = {
        font: { sz: 10, name: "Calibri", color: { rgb: "0F172A" } },
        alignment: { vertical: "top" as const, wrapText: true },
        border: borders,
      };
      const cellAltStyle = {
        ...cellStyle,
        fill: { patternType: "solid" as const, fgColor: { rgb: "F8FAFC" } },
      };
      const totalLabelStyle = {
        font: { bold: true, sz: 10, name: "Calibri", color: { rgb: "1E3A8A" } },
        fill: { patternType: "solid" as const, fgColor: { rgb: "EFF6FF" } },
        alignment: { horizontal: "right" as const, vertical: "center" as const },
        border: borders,
      };
      const totalValueStyle = {
        font: { bold: true, sz: 11, name: "Calibri" },
        fill: { patternType: "solid" as const, fgColor: { rgb: "DBEAFE" } },
        alignment: { horizontal: "center" as const, vertical: "center" as const },
        border: borders,
      };

      function applyStyles(ws: any, headers: string[], dataRows: number, colWidths: number[]) {
        headers.forEach((_, ci) => {
          const addr = XLS.utils.encode_cell({ r: 0, c: ci });
          if (!ws[addr]) ws[addr] = { v: headers[ci], t: "s" };
          ws[addr].s = hdrStyle;
        });
        for (let ri = 1; ri <= dataRows; ri++) {
          const s = ri % 2 === 0 ? cellAltStyle : cellStyle;
          headers.forEach((_, ci) => {
            const addr = XLS.utils.encode_cell({ r: ri, c: ci });
            if (!ws[addr]) ws[addr] = { v: "", t: "s" };
            ws[addr].s = s;
          });
        }
        ws["!cols"] = colWidths.map(wch => ({ wch }));
        ws["!rows"] = [{ hpt: 30 }];
      }

      const wb = XLS.utils.book_new();
      const f = exportFields;

      // ── Sheet 1: Resumen (one row, selected fields as columns) ───────────────
      const resCols: { header: string; value: string | number; width: number }[] = [];
      if (f.n_ot)            resCols.push({ header: "N° OT",            value: (orden as any).numero ?? "—",      width: 10 });
      if (f.n_serie)         resCols.push({ header: "N° de serie / folio", value: meta.nOT ?? "—",                width: 20 });
      if (f.id)              resCols.push({ header: "ID",               value: orden.id,                          width: 34 });
      if (f.titulo)          resCols.push({ header: "Título",           value: orden.titulo ?? "—",               width: 36 });
      if (f.estado)          resCols.push({ header: "Estado",           value: orden.estado,                      width: 14 });
      if (f.prioridad)       resCols.push({ header: "Prioridad",        value: orden.prioridad,                   width: 12 });
      if (f.tipo_trabajo)    resCols.push({ header: "Tipo de trabajo",  value: orden.tipo_trabajo ?? "—",         width: 16 });
      if (f.categoria)       resCols.push({ header: "Categoría",        value: (orden as any).categorias_ot?.nombre ?? "—", width: 18 });
      if (f.solicitante)     resCols.push({ header: "Solicitante",      value: meta.solicitante ?? "—",           width: 22 });
      if (f.hito)            resCols.push({ header: "Hito",             value: meta.hito ?? "—",                  width: 18 });
      if (f.descripcion)     resCols.push({ header: "Descripción",      value: meta.descripcion ?? "—",           width: 44 });
      if (f.asignados)       resCols.push({ header: "Asignados",        value: asignadosNames || "—",             width: 28 });
      if (f.empresa)         resCols.push({ header: "Empresa",          value: (orden as any).sociedad?.nombre ?? "—", width: 20 });
      if (f.ubicacion)       resCols.push({ header: "Ubicación",        value: orden.ubicaciones ? [orden.ubicaciones.edificio, orden.ubicaciones.piso].filter(Boolean).join(" · ") : "—", width: 26 });
      if (f.lugar)           resCols.push({ header: "Lugar específico", value: (orden as any).lugar?.nombre ?? "—", width: 20 });
      if (f.creada_el)       resCols.push({ header: "Creada el",        value: orden.created_at ? orden.created_at.slice(0, 19).replace("T", " ") : "—", width: 18 });
      if (f.fecha_inicio)    resCols.push({ header: "Fecha inicio",     value: fmtDate(orden.fecha_inicio),       width: 14 });
      if (f.fecha_limite)    resCols.push({ header: "Fecha límite",     value: fmtDate(orden.fecha_termino),      width: 14 });
      if (f.tiempo_trabajado)resCols.push({ header: "Tiempo trabajado", value: fmtDuration(orden.tiempo_total_segundos), width: 16 });

      if (resCols.length > 0) {
        const wsRes = XLS.utils.aoa_to_sheet([
          resCols.map(c => c.header),
          resCols.map(c => c.value),
        ]);
        applyStyles(wsRes, resCols.map(c => c.header), 1, resCols.map(c => c.width));
        XLS.utils.book_append_sheet(wb, wsRes, "Resumen");
      }

      // ── Sheet 2: Materiales ──────────────────────────────────────────────────
      if (f.materiales) {
        const matH = ["Parte / Material", "Unidad", "Cant. solicitada", "Cant. utilizada"];
        const matRows = ordenPartes.map(op => {
          const p = op.parte as any;
          return [p?.nombre ?? "—", p?.unidad ?? "—", op.cantidad, op.cantidad_utilizada ?? "—"];
        });

        const wsMat = XLS.utils.aoa_to_sheet([matH, ...matRows]);
        applyStyles(wsMat, matH, matRows.length, [32, 12, 16, 16]);

        XLS.utils.book_append_sheet(wb, wsMat, "Materiales");
      }

      // ── Sheet 3: Actividad ───────────────────────────────────────────────────
      if (f.actividad && actividad.length > 0) {
        const actH = ["Fecha y hora", "Usuario", "Tipo", "Comentario / Detalle"];
        const actRows = [...actividad].reverse().map(act => [
          act.created_at ? act.created_at.slice(0, 19).replace("T", " ") : "—",
          (act as any).usuario?.nombre ?? "—",
          act.tipo,
          act.comentario ?? "",
        ]);
        const wsAct = XLS.utils.aoa_to_sheet([actH, ...actRows]);
        applyStyles(wsAct, actH, actRows.length, [20, 22, 18, 50]);
        XLS.utils.book_append_sheet(wb, wsAct, "Actividad");
      }

      // ── Sheet 4: Procedimientos ──────────────────────────────────────────────
      if (otProcs.length > 0) {
        const estadoLabel: Record<string, string> = {
          pendiente: "Pendiente", en_curso: "En curso",
          completado: "Completado", cancelado: "Cancelado",
        };
        const procH = ["Procedimiento", "Obligatorio", "Estado", "Pasos", "Iniciado el", "Completado el", "Paso", "Tipo", "Requerido", "Respuesta"];
        const procRows: (string | number)[][] = [];
        for (const otp of otProcs) {
          const proc = otp.procedimiento;
          if (!proc) continue;
          const ejec = otp.ejecucion;
          const ejecEstado = ejec ? (estadoLabel[ejec.estado] ?? ejec.estado) : "Sin ejecutar";
          const pasos = proc.pasos ?? [];
          const respMap: Record<string, any> = {};
          for (const r of ejec?.respuestas ?? []) respMap[r.paso_id] = r;

          if (pasos.length === 0) {
            procRows.push([
              proc.nombre, proc.bloquea_cierre_ot ? "Sí" : "No",
              ejecEstado, 0,
              ejec?.iniciado_at ? ejec.iniciado_at.slice(0, 19).replace("T", " ") : "—",
              ejec?.completado_at ? ejec.completado_at.slice(0, 19).replace("T", " ") : "—",
              "", "", "", "",
            ]);
          } else {
            pasos.forEach((paso, idx) => {
              const resp = respMap[paso.id];
              let respValue = "—";
              if (resp) {
                if (resp.valor_texto != null) respValue = resp.valor_texto;
                else if (resp.valor_medido != null) respValue = String(resp.valor_medido);
                else if (resp.valor_json != null) {
                  const j = resp.valor_json;
                  if (Array.isArray(j)) respValue = j.filter((v: any) => v?.checked).map((v: any) => v.label).join(", ") || "—";
                  else if (typeof j === "object" && j !== null) respValue = (j as any).value ?? JSON.stringify(j);
                }
                else if (resp.firma_svg) respValue = "Firmado";
                else if (resp.foto_url) respValue = resp.foto_url;
              }
              procRows.push([
                idx === 0 ? proc.nombre : "",
                idx === 0 ? (proc.bloquea_cierre_ot ? "Sí" : "No") : "",
                idx === 0 ? ejecEstado : "",
                idx === 0 ? pasos.length : "",
                idx === 0 ? (ejec?.iniciado_at ? ejec.iniciado_at.slice(0, 19).replace("T", " ") : "—") : "",
                idx === 0 ? (ejec?.completado_at ? ejec.completado_at.slice(0, 19).replace("T", " ") : "—") : "",
                paso.titulo,
                paso.tipo,
                paso.requerido ? "Sí" : "No",
                respValue,
              ]);
            });
          }
        }
        const wsProc = XLS.utils.aoa_to_sheet([procH, ...procRows]);
        applyStyles(wsProc, procH, procRows.length, [36, 12, 14, 8, 20, 20, 32, 18, 10, 40]);
        XLS.utils.book_append_sheet(wb, wsProc, "Procedimientos");
      }

      XLS.writeFile(wb, `OT-${nOT}.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  function handleExportTXT() {
    setExportMenuOpen(false);
    const asignadosNames = (orden.asignados_ids ?? [])
      .map(id => usuarios.find(u => u.id === id)?.nombre ?? id)
      .join(", ");

    const lines = [
      `ORDEN DE TRABAJO`,
      `${"─".repeat(48)}`,
      `N° OT:           ${meta.nOT ?? "—"}`,
      `ID:              ${orden.id}`,
      `Título:          ${orden.titulo ?? "Sin título"}`,
      `Estado:          ${orden.estado}`,
      `Prioridad:       ${orden.prioridad}`,
      `Tipo de trabajo: ${orden.tipo_trabajo ?? "—"}`,
      ``,
      `Descripción:`,
      `  ${meta.descripcion ?? "—"}`,
      ``,
      `Solicitante:     ${meta.solicitante ?? "—"}`,
      `Hito:            ${meta.hito ?? "—"}`,
      ``,
      `Asignados:       ${asignadosNames || "—"}`,
      `Empresa:         ${(orden as any).sociedad?.nombre ?? "—"}`,
      `Ubicación:       ${orden.ubicaciones ? [orden.ubicaciones.edificio, orden.ubicaciones.piso].filter(Boolean).join(" · ") : "—"}`,
      `Lugar:           ${(orden as any).lugar?.nombre ?? "—"}`,
      ``,
      `Fecha inicio:    ${fmtDate(orden.fecha_inicio)}`,
      `Fecha límite:    ${fmtDate(orden.fecha_termino)}`,
      `Tiempo trabajado:${fmtDuration(orden.tiempo_total_segundos)}`,
      `Creada el:       ${orden.created_at ? orden.created_at.slice(0, 19).replace("T", " ") : "—"}`,
      ``,
      `${"─".repeat(48)}`,
      `Exportado con Pangui — ${new Date().toLocaleString("es-CL")}`,
    ];
    downloadBlob(lines.join("\n"), `OT-${nOT}.txt`, "text/plain;charset=utf-8");
  }

  const handleIniciar = async () => {
    setTimerBusy(true);
    try {
      await iniciarOrden(orden.id, myId);
      onOrdenUpdated({ en_ejecucion: true, iniciado_at: new Date().toISOString(), estado: "en_curso" });
    } finally {
      setTimerBusy(false);
    }
  };

  const handleReanudar = async () => {
    setTimerBusy(true);
    try {
      await reanudarOrden(orden.id, myId);
      onOrdenUpdated({ en_ejecucion: true, pausado_at: null, iniciado_at: new Date().toISOString(), estado: "en_curso" });
    } finally {
      setTimerBusy(false);
    }
  };

  const confirmTimerAction = async () => {
    if (!timerAction) return;
    setTimerBusy(true);
    try {
      if (timerAction === "pausar") {
        await pausarOrden(orden.id, myId, timerComment, elapsed);
        onOrdenUpdated({
          en_ejecucion: false,
          pausado_at: new Date().toISOString(),
          tiempo_total_segundos: elapsed,
          estado: "en_espera",
        });
      } else {
        await completarOrden(orden.id, myId, timerComment || undefined, elapsed, wsId && orden.titulo ? {
          titulo: orden.titulo,
          workspaceId: wsId,
          asignadosIds: orden.asignados_ids ?? [],
        } : undefined);
        onOrdenUpdated({
          en_ejecucion: false,
          tiempo_total_segundos: elapsed,
          estado: "completado",
        });
      }
      setTimerAction(null);
      setTimerComment("");
    } finally {
      setTimerBusy(false);
    }
  };

  const handleFotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be picked again
    e.target.value = "";
    setUploadingFoto(true);
    try {
      const url = await uploadOrdenFoto(orden.id, file);
      await addOrdenFoto(orden.id, url);
      setFotos(prev => [...prev, url]);
    } catch {
      // silent — could show a toast here
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleFotoDelete = async (url: string) => {
    setDeletingFoto(url);
    try {
      await removeOrdenFoto(orden.id, url);
      setFotos(prev => prev.filter(u => u !== url));
    } catch {
      // silent
    } finally {
      setDeletingFoto(null);
    }
  };

  // ── Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setLightboxIdx(i => i !== null ? Math.max(0, i - 1) : null);
      if (e.key === "ArrowRight") setLightboxIdx(i => i !== null ? Math.min(fotos.length - 1, i + 1) : null);
      if (e.key === "Escape")     setLightboxIdx(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIdx, fotos.length]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const ESTADO_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
    pendiente:   { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
    en_espera:   { bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
    en_curso:    { bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
    completado:  { bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
  };
  const PRIO_COLOR: Record<string, string> = {
    ninguna: "#9CA3AF", baja: "#9CA3AF", media: "#3B82F6", alta: "#F97316", urgente: "#EF4444",
  };
  const estadoStyle = ESTADO_STYLE[orden.estado] ?? ESTADO_STYLE.pendiente;
  const prioColor   = PRIO_COLOR[orden.prioridad] ?? "#9CA3AF";
  const prioLabel   = PRIORIDADES.find(p => p.value === orden.prioridad)?.label ?? "Sin prioridad";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "#fff" }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", background: "#fff" }}>
        {/* Top bar: status + priority dropdowns + actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", height: 52, gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Status dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button style={{
                  display: "flex", alignItems: "center", gap: 6,
                  height: 30, padding: "0 10px",
                  background: estadoStyle.bg, color: estadoStyle.color,
                  border: `1px solid ${estadoStyle.color}30`, borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: estadoStyle.dot, flexShrink: 0 }} />
                  {estadoCfg.label}
                  <ChevronDown className="size-3" style={{ opacity: 0.6 }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {ESTADOS.map(e => {
                  const Icon = e.icon;
                  return (
                    <DropdownMenuItem key={e.value} onClick={() => changeStatus(e.value)} className={cn("gap-2 text-sm", e.value === orden.estado && "bg-muted")}>
                      <Icon className={cn("size-4 shrink-0", e.className)} />
                      {e.label}
                      {e.value === orden.estado && <Check className="ml-auto size-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button style={{
                  display: "flex", alignItems: "center", gap: 5,
                  height: 30, padding: "0 10px",
                  background: prioColor + "18", color: prioColor,
                  border: `1px solid ${prioColor}30`, borderRadius: 6,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>
                  {prioLabel}
                  <ChevronDown className="size-3" style={{ opacity: 0.6 }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-40">
                {PRIORIDADES.map(p => (
                  <DropdownMenuItem key={p.value} onClick={() => changePrioridad(p.value)} className={cn("gap-2 text-sm", p.value === orden.prioridad && "bg-muted")}>
                    <span className={cn("text-sm font-medium", p.color)}>{p.label}</span>
                    {p.value === orden.prioridad && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>

            {/* Export dropdown */}
            <div ref={exportMenuRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setExportMenuOpen(v => !v)}
                title="Exportar"
                style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#64748B" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
              {exportMenuOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 300,
                  background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.12)", width: 180, overflow: "hidden",
                }}>
                  {[
                    { key: "pdf",  icon: <FileDown size={13} />,  label: "Exportar PDF",        action: handleExportPDF },
                    { key: "csv",  icon: <Sheet size={13} />,     label: "Exportar Excel…",     action: () => { setExportMenuOpen(false); setExportConfigOpen(true); } },
                    { key: "txt",  icon: <FileText size={13} />,  label: "Exportar TXT",        action: handleExportTXT },
                  ].map(item => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={item.action}
                      disabled={!!exporting}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 12px", background: "none", border: "none",
                        cursor: exporting ? "default" : "pointer", fontSize: 13,
                        color: "#0F172A", fontFamily: "inherit", textAlign: "left",
                        opacity: exporting && exporting !== item.key ? 0.5 : 1,
                      }}
                      onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = "#F8FAFC"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                    >
                      <span style={{ color: "#94A3B8" }}>{item.icon}</span>
                      {item.label}
                      {exporting === item.key && <Loader2 size={11} className="animate-spin" style={{ marginLeft: "auto" }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {canManage && (
              <>
                <button
                  type="button" onClick={onEdit}
                  style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#64748B" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  <Pencil size={14} />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#EF4444" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar esta orden?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Eliminar</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            <button
              type="button" onClick={onClose}
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#94A3B8" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "0 16px", gap: 0 }}>
          {(["detalle", "actividad", "fotos", "materiales", "procedimientos"] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                height: 38, padding: "0 14px",
                background: "none", border: "none",
                borderBottom: tab === t ? "2px solid #2563EB" : "2px solid transparent",
                color: tab === t ? "#1D4ED8" : "#94A3B8",
                fontSize: 13, fontWeight: tab === t ? 600 : 500,
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: -1, transition: "color 0.1s", whiteSpace: "nowrap",
              }}
            >
              {t === "detalle" ? "Detalle"
                : t === "actividad" ? "Actividad"
                : t === "fotos" ? `Fotos${fotos.length > 0 ? ` (${fotos.length})` : ""}`
                : t === "materiales" ? `Materiales${ordenPartes.length > 0 ? ` (${ordenPartes.length})` : ""}`
                : `Procedimientos${otProcs.length > 0 ? ` (${otProcs.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

        {/* ── Detalle ── */}
        {tab === "detalle" && (
          <div style={{ padding: "20px 20px 100px" }}>

            {/* N° OT badge */}
            {meta.nOT && <NOTBadge nOT={meta.nOT} />}

            {/* Title */}
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#111827", lineHeight: 1.35, margin: meta.nOT ? "6px 0 0" : "0 0 0" }}>
              {orden.titulo || "Sin título"}
            </h2>

            {/* Description */}
            {meta.descripcion && (
              <div style={{ marginTop: 8, padding: "12px 14px", background: "#F8FAFC", borderRadius: 8, borderLeft: "3px solid #2563EB" }}>
                <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.65, whiteSpace: "pre-wrap", margin: 0 }}>{meta.descripcion}</p>
              </div>
            )}

            {/* Links */}
            {Array.isArray(orden.links) && orden.links.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                  Links
                </div>
                <LinksDisplay links={orden.links} />
              </div>
            )}

            {/* Timer card */}
            {isActive && (
              <div style={{ marginTop: 16, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.07em" }}>Tiempo trabajado</span>
                  <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: "#1E3A8A", tabularNums: true } as React.CSSProperties}>
                    {fmtSecs(elapsed)}
                  </span>
                </div>

                {timerAction ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <textarea
                      rows={2}
                      placeholder={timerAction === "pausar" ? "Motivo de pausa (opcional)…" : "Comentario de cierre (opcional)…"}
                      value={timerComment}
                      onChange={e => setTimerComment(e.target.value)}
                      style={{ width: "100%", fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8, padding: "8px 10px", resize: "none", outline: "none", fontFamily: "inherit", background: "#fff", boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setTimerAction(null); setTimerComment(""); }} disabled={timerBusy}
                        style={{ flex: 1, height: 36, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancelar
                      </button>
                      <button type="button" onClick={confirmTimerAction} disabled={timerBusy}
                        style={{ flex: 1, height: 36, border: "none", borderRadius: 8, background: timerAction === "completar" ? "#16A34A" : "#1E3A8A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        {timerAction === "pausar" ? "Pausar" : "Completar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    {!orden.en_ejecucion ? (
                      <button type="button"
                        onClick={orden.estado === "en_espera" || orden.estado === "en_curso" ? handleReanudar : handleIniciar}
                        disabled={timerBusy}
                        style={{ flex: 1, height: 38, border: "none", borderRadius: 8, background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                        <Play size={14} />
                        {orden.pausado_at ? "Reanudar" : "Iniciar"}
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => setTimerAction("pausar")} disabled={timerBusy}
                          style={{ flex: 1, height: 38, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit", color: "#475569" }}>
                          <Pause size={14} />
                          Pausar
                        </button>
                        <button type="button" onClick={() => setTimerAction("completar")} disabled={timerBusy}
                          style={{ flex: 1, height: 38, border: "none", borderRadius: 8, background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "inherit" }}>
                          <Square size={14} />
                          Completar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Meta fields */}
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px" }}>
              {[
                orden.tipo_trabajo && { label: "Tipo", value: TIPO_LABEL[orden.tipo_trabajo] ?? orden.tipo_trabajo, icon: <Settings2 size={13} /> },
                orden.sociedad?.nombre && { label: "Sociedad", value: orden.sociedad.nombre, icon: <Building2 size={13} /> },
                meta.solicitante && { label: "Solicitante", value: meta.solicitante, icon: <User size={13} /> },
                meta.hito && { label: "Hito", value: meta.hito, icon: <Flag size={13} /> },
                orden.ubicaciones?.edificio && { label: "Ubicación", value: orden.ubicaciones.edificio + (orden.ubicaciones.piso ? ` · ${orden.ubicaciones.piso}` : ""), icon: <MapPin size={13} /> },
                orden.lugar?.nombre && { label: "Lugar específico", value: orden.lugar.nombre, icon: <MapPin size={13} /> },
                orden.activos?.nombre && { label: "Activo", value: orden.activos.nombre, icon: <Settings2 size={13} /> },
                orden.fecha_termino && { label: "Fecha límite", value: new Date(orden.fecha_termino).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }), icon: <Calendar size={13} /> },
                { label: "Creada", value: new Date(orden.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }), icon: <Calendar size={13} /> },
                (orden.tiempo_total_segundos != null && orden.tiempo_total_segundos > 0) && { label: "Tiempo total", value: fmtSecs(orden.tiempo_total_segundos), icon: <RotateCcw size={13} /> },
              ].filter(Boolean).map((field: any) => (
                <div key={field.label}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, marginTop: 0 }}>{field.label}</p>
                  <p style={{ fontSize: 13, color: "#0F172A", margin: 0, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ color: "#94A3B8", flexShrink: 0 }}>{field.icon}</span>
                    {field.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Category */}
            {orden.categorias_ot?.nombre && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
                  background: (orden.categorias_ot.color ?? "#64748B") + "18",
                  color: orden.categorias_ot.color ?? "#64748B",
                }}>
                  {orden.categorias_ot.icono && <span>{orden.categorias_ot.icono}</span>}
                  {orden.categorias_ot.nombre}
                </span>
              </div>
            )}

            {/* Assigned */}
            {assigned.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 0 }}>Asignados</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {assigned.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: "linear-gradient(135deg, #1E3A8A, #2563EB)", color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {initials(u.nombre)}
                      </span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", margin: 0 }}>{u.nombre}</p>
                        <p style={{ fontSize: 11, color: "#94A3B8", margin: 0, textTransform: "capitalize" }}>{u.rol}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creador */}
            {orden.creador?.nombre && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 6 }}>
                <User size={13} style={{ color: "#94A3B8" }} />
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Creado por</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{orden.creador.nombre}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Actividad ── */}
        {tab === "actividad" && (
          <div style={{ padding: "16px 20px" }}>
            {loadingAct ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Loader2 size={18} style={{ color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
              </div>
            ) : actividad.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 8, color: "#9CA3AF" }}>
                <CircleDot size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Sin actividad registrada</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {actividad.map((act, idx) => {
                  const Icon = ACT_ICON[act.tipo] ?? CircleDot;
                  const colorClass = ACT_COLOR[act.tipo] ?? "text-zinc-400";
                  const isComment = act.tipo === "comentario";
                  const label = ACT_LABEL[act.tipo] ?? act.tipo;
                  const resolvedComentario = act.tipo === "asignado" && act.comentario
                    ? act.comentario.split(",").map(id => {
                        const u = usuarios.find(u => u.id === id.trim());
                        return u?.nombre ?? id.trim();
                      }).join(", ")
                    : act.comentario;
                  const isLast = idx === actividad.length - 1;
                  return (
                    <div key={act.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                      {/* Timeline line */}
                      {!isLast && (
                        <div style={{ position: "absolute", left: 15, top: 26, bottom: 0, width: 1, background: "#E2E8F0" }} />
                      )}
                      <div className={cn("mt-1 size-7 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center shrink-0 shadow-sm z-10", colorClass)} style={{ minWidth: 28, minHeight: 28 }}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                          {act.usuario?.nombre && (
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{act.usuario.nombre}</span>
                          )}
                          {!isComment && label && (
                            <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
                          )}
                          <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>{fmtTs(act.created_at)}</span>
                        </div>
                        {resolvedComentario && (
                          <div style={{
                            marginTop: 4, fontSize: 13, lineHeight: 1.6, color: isComment ? "#0F172A" : "#64748B",
                            background: isComment ? "#F8FAFC" : "transparent",
                            padding: isComment ? "8px 10px" : "0",
                            borderRadius: isComment ? 6 : 0,
                            borderLeft: isComment ? "2px solid #2563EB" : "none",
                          }}>
                            {resolvedComentario}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Fotos ── */}
        {tab === "fotos" && (
          <div style={{ padding: "16px 20px 100px" }}>
            {isActive && (
              <>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFotoUpload} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFoto}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "11px 0", marginBottom: 12,
                    border: "1.5px dashed #D1D5DB", borderRadius: 8,
                    background: "#FAFAFA", color: "#6B7280",
                    fontSize: 13, fontWeight: 500, cursor: uploadingFoto ? "default" : "pointer",
                    fontFamily: "inherit", transition: "border-color 0.1s, background 0.1s",
                  }}
                  onMouseEnter={e => { if (!uploadingFoto) { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.color = "#1D4ED8"; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#D1D5DB"; e.currentTarget.style.background = "#FAFAFA"; e.currentTarget.style.color = "#6B7280"; }}
                >
                  {uploadingFoto ? <><Loader2 className="size-4 animate-spin" /> Subiendo…</> : <><Plus size={15} /> Agregar foto</>}
                </button>
              </>
            )}

            {fotos.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 8, color: "#9CA3AF" }}>
                <Image size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Sin fotos adjuntas</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {fotos.map((url, i) => (
                  <div key={url} className="group" style={{ position: "relative", aspectRatio: "1", overflow: "hidden", borderRadius: 6, background: "#F3F4F6" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Foto ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" }} onClick={() => setLightboxIdx(i)} />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setConfirmDeleteFoto(url); }}
                      disabled={deletingFoto === url}
                      className="absolute top-1.5 right-1.5 size-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      {deletingFoto === url ? <Loader2 className="size-3 animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Lightbox */}
            {lightboxIdx !== null && (
              <div className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center" onClick={() => setLightboxIdx(null)}>
                {lightboxIdx > 0 && (
                  <button type="button" onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10">
                    <ChevronDown className="size-5 rotate-90" />
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotos[lightboxIdx]} alt={`Foto ${lightboxIdx + 1}`} className="max-h-[88vh] max-w-[88vw] object-contain select-none rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                {lightboxIdx < fotos.length - 1 && (
                  <button type="button" onClick={e => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 size-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10">
                    <ChevronDown className="size-5 -rotate-90" />
                  </button>
                )}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-xs tabular-nums bg-black/40 px-3 py-1 rounded-full">
                  {lightboxIdx + 1} / {fotos.length}
                </div>
                <div className="absolute top-4 right-4 flex gap-2">
                  {isActive && (
                    <button type="button" onClick={e => { e.stopPropagation(); setConfirmDeleteFoto(fotos[lightboxIdx]); }}
                      className="size-9 rounded-full bg-white/10 hover:bg-red-600/80 text-white flex items-center justify-center transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                  <button type="button" onClick={() => setLightboxIdx(null)}
                    className="size-9 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors">
                    <X size={15} />
                  </button>
                </div>
              </div>
            )}

            {/* Delete confirm */}
            {confirmDeleteFoto && (
              <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setConfirmDeleteFoto(null)}>
                <div style={{ background: "#fff", borderRadius: 10, padding: 20, width: "100%", maxWidth: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", marginBottom: 4, marginTop: 0 }}>¿Eliminar esta foto?</p>
                  <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16, marginTop: 0 }}>Esta acción no se puede deshacer.</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => setConfirmDeleteFoto(null)}
                      style={{ flex: 1, height: 36, border: "1px solid #E5E7EB", borderRadius: 6, background: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                      Cancelar
                    </button>
                    <button type="button" disabled={!!deletingFoto}
                      onClick={async () => {
                        const url = confirmDeleteFoto;
                        setConfirmDeleteFoto(null);
                        if (lightboxIdx !== null && fotos[lightboxIdx] === url) setLightboxIdx(fotos.length > 1 ? Math.max(0, lightboxIdx - 1) : null);
                        await handleFotoDelete(url);
                      }}
                      style={{ flex: 1, height: 36, border: "none", borderRadius: 6, background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      {deletingFoto ? <Loader2 className="size-3.5 animate-spin mx-auto" /> : "Eliminar"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* ── Partes ── */}
        {tab === "materiales" && (
          <div style={{ padding: "16px 20px 100px" }}>


            {/* Search catalogue */}
            {isActive && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Buscar material en inventario…"
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    style={{
                      width: "100%", height: 38, paddingLeft: 32, paddingRight: 12,
                      fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8,
                      background: "#F8FAFC", outline: "none", fontFamily: "inherit",
                      boxSizing: "border-box", color: "#0F172A",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>

                {filteredCatalog.length > 0 && (
                  <div style={{ marginTop: 4, border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden", background: "#fff", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}>
                    {filteredCatalog.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={addingParte}
                        onClick={() => handleAddParte(p)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                          padding: "9px 12px", background: "none", border: "none",
                          borderBottom: "1px solid #F1F5F9", cursor: "pointer",
                          fontFamily: "inherit", textAlign: "left",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >
                        <Package size={14} style={{ color: "#94A3B8", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: p.stock_actual <= 0 ? "#EF4444" : "#94A3B8" }}>
                            {p.unidad} · Stock: {p.stock_actual}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, flexShrink: 0 }}>+ Agregar</span>
                      </button>
                    ))}
                  </div>
                )}
                {loadingCatalog && <div style={{ marginTop: 4, padding: "8px 0", fontSize: 12, color: "#94A3B8" }}>Cargando inventario…</div>}
                {catalogSearch.length >= 1 && filteredCatalog.length === 0 && !loadingCatalog && (
                  <div style={{ marginTop: 4, padding: "8px 0", fontSize: 12, color: "#94A3B8" }}>
                    Sin resultados. Agrega la parte en <a href="/partes" style={{ color: "#2563EB" }}>Inventario</a> primero.
                  </div>
                )}
              </div>
            )}

            {/* Parts list */}
            {loadingPartes ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Loader2 size={18} style={{ color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
              </div>
            ) : ordenPartes.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 8, color: "#9CA3AF" }}>
                <Package size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Sin materiales registrados</p>
                {isActive && <p style={{ fontSize: 12, margin: 0 }}>Busca un material del inventario arriba</p>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 8, padding: "6px 10px", borderBottom: "1px solid #E2E8F0" }}>
                  {["Material", "Cantidad", ""].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                  ))}
                </div>
                {ordenPartes.map(op => (
                  <div key={op.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid #F1F5F9" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{op.parte?.nombre ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{op.parte?.unidad}</div>
                    </div>
                    {isActive ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={op.cantidad}
                        onChange={e => handleUpdateCantidad(op.id, parseFloat(e.target.value) || op.cantidad)}
                        style={{ height: 30, padding: "0 8px", fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 6, outline: "none", fontFamily: "inherit", background: "#fff", width: "100%" }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: "#475569" }}>{op.cantidad}</span>
                    )}
                    {isActive ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteParte(op.id)}
                        disabled={deletingParteId === op.id}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#EF4444" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                      >
                        {deletingParteId === op.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    ) : <span />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Procedimientos ── */}
        {tab === "procedimientos" && (
          <div style={{ padding: "16px 20px 100px" }}>
            {loadingProcs ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <Loader2 size={18} className="animate-spin" style={{ color: "#94A3B8" }} />
              </div>
            ) : (
              <>
                {/* Attached procedures */}
                {otProcs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>
                    <ClipboardCheck size={28} style={{ color: "#CBD5E1", margin: "0 auto 8px" }} />
                    <div>No hay procedimientos adjuntos</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    {otProcs.map(otp => {
                      const proc = otp.procedimiento;
                      const ejec = otp.ejecucion;
                      const isCompleted = ejec?.estado === "completado";
                      const inProgress = ejec?.estado === "en_curso";
                      return (
                        <div key={otp.id} style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>{proc?.nombre ?? "—"}</div>
                              {proc?.descripcion && (
                                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{proc.descripcion}</div>
                              )}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                                <span style={{ fontSize: 11, color: "#94A3B8" }}>{proc?.pasos_count ?? 0} pasos</span>
                                {proc?.bloquea_cierre_ot && (
                                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#F59E0B", fontWeight: 500 }}>
                                    <Shield size={10} />Bloquea cierre
                                  </span>
                                )}
                                {isCompleted && (
                                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#10B981", fontWeight: 600, background: "#ECFDF5", borderRadius: 4, padding: "1px 6px" }}>
                                    <CheckCircle2 size={10} />Completado
                                  </span>
                                )}
                                {inProgress && (
                                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#8B5CF6", fontWeight: 600, background: "#F5F3FF", borderRadius: 4, padding: "1px 6px" }}>
                                    <PlayCircle size={10} />En curso
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {!isCompleted && (
                                <button
                                  onClick={() => handleStartEjec(otp)}
                                  disabled={startingEjec === otp.procedimiento_id}
                                  style={{
                                    height: 30, padding: "0 12px",
                                    background: inProgress ? "#F5F3FF" : "#EFF6FF",
                                    border: `1px solid ${inProgress ? "#8B5CF6" : "#2563EB"}`,
                                    borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
                                    color: inProgress ? "#8B5CF6" : "#2563EB", fontFamily: "inherit",
                                    display: "flex", alignItems: "center", gap: 5,
                                  }}
                                >
                                  {startingEjec === otp.procedimiento_id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                                  {inProgress ? "Continuar" : "Ejecutar"}
                                </button>
                              )}
                              {isCompleted && (
                                <button
                                  onClick={() => handleStartEjec(otp)}
                                  style={{ height: 30, padding: "0 12px", background: "none", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#64748B", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
                                >
                                  <CheckCircle2 size={11} />Ver
                                </button>
                              )}
                              <button
                                onClick={() => handleDetachProc(otp.procedimiento_id)}
                                disabled={detachingProc === otp.procedimiento_id}
                                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#94A3B8" }}
                                onMouseEnter={e => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEF2F2"; }}
                                onMouseLeave={e => { e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.background = "none"; }}
                              >
                                {detachingProc === otp.procedimiento_id ? <Loader2 size={12} className="animate-spin" /> : <X size={13} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Attach picker */}
                {isActive && (
                  <div style={{ borderTop: otProcs.length > 0 ? "1px solid #F1F5F9" : "none", paddingTop: otProcs.length > 0 ? 16 : 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                      Agregar procedimiento
                    </div>
                    {loadingProcLib ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                        <Loader2 size={14} className="animate-spin" style={{ color: "#CBD5E1" }} />
                      </div>
                    ) : procLibrary.filter(p => !otProcs.some(op => op.procedimiento_id === p.id)).length === 0 ? (
                      <div style={{ fontSize: 12.5, color: "#94A3B8", padding: "8px 0" }}>
                        {procLibrary.length === 0 ? "No hay procedimientos en la biblioteca." : "Todos los procedimientos ya están adjuntos."}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {procLibrary.filter(p => !otProcs.some(op => op.procedimiento_id === p.id)).map(p => (
                          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: "1px solid #E2E8F0", borderRadius: 8, background: "#F8FAFC" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{p.nombre}</div>
                              <div style={{ fontSize: 11, color: "#94A3B8" }}>{p.pasos_count} pasos{p.categoria ? ` · ${p.categoria}` : ""}</div>
                            </div>
                            <button
                              onClick={() => handleAttachProc(p.id)}
                              disabled={attachingProc === p.id}
                              style={{ height: 28, padding: "0 10px", background: "#EFF6FF", border: "1px solid #2563EB", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563EB", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}
                            >
                              {attachingProc === p.id ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                              Adjuntar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* ── Execution modal ── */}
      {activeEjec && (
        <ProcEjecucionModal
          ejec={activeEjec.ejecucion}
          proc={activeEjec.pasos}
          pendingResps={pendingResps}
          savingResp={savingResp}
          completingEjec={completingEjec}
          onClose={() => { setActiveEjec(null); setPendingResps({}); }}
          onUpdateResp={(pasoId, patch) => setPendingResps(prev => ({ ...prev, [pasoId]: { ...(prev[pasoId] ?? {}), ...patch } }))}
          onSaveResp={handleSaveResp}
          onComplete={handleCompleteEjec}
        />
      )}

      {/* ── Comment input ── */}
      <div style={{ flexShrink: 0, borderTop: "1px solid #E2E8F0", padding: "12px 16px", background: "#fff" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            style={{
              flex: 1, minHeight: 42, maxHeight: 96, resize: "none",
              fontSize: 13, border: "1px solid #E2E8F0", borderRadius: 8,
              padding: "10px 12px", outline: "none", fontFamily: "inherit",
              background: "#F8FAFC", color: "#0F172A", lineHeight: 1.5,
              transition: "border-color 0.12s, box-shadow 0.12s",
            }}
            placeholder="Agregar comentario…"
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.background = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.boxShadow = "none"; }}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment(); }}
          />
          <button
            type="button"
            onClick={sendComment}
            disabled={!commentText.trim() || sending}
            style={{
              width: 38, height: 38, flexShrink: 0,
              background: commentText.trim() ? "linear-gradient(135deg, #1E3A8A, #2563EB)" : "#E2E8F0",
              border: "none", borderRadius: 8, cursor: commentText.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "opacity 0.15s",
            }}
          >
            {sending ? <Loader2 size={15} style={{ color: "#fff", animation: "spin 1s linear infinite" }} /> : <Send size={15} style={{ color: commentText.trim() ? "#fff" : "#94A3B8" }} />}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 5, marginBottom: 0 }}>Ctrl+Enter para enviar</p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* ── Export config modal ── */}
      {exportConfigOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExportConfigOpen(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 14, width: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.20)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Exportar Excel</div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Selecciona las secciones a incluir</div>
              </div>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#94A3B8" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Fields grouped */}
            <div style={{ padding: "8px 20px 4px", maxHeight: 380, overflowY: "auto" }}>
              {Array.from(new Set(EXPORT_FIELDS.map(f => f.group))).map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, paddingLeft: 10 }}>
                    {group}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    {EXPORT_FIELDS.filter(f => f.group === group).map(field => (
                      <label
                        key={field.key}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F8FAFC"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={exportFields[field.key]}
                          onChange={e => setExportFields(prev => ({ ...prev, [field.key]: e.target.checked }))}
                          style={{ width: 14, height: 14, accentColor: "#2563EB", cursor: "pointer", flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12.5, color: exportFields[field.key] ? "#0F172A" : "#94A3B8" }}>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, borderTop: "1px solid #F1F5F9", paddingTop: 8 }}>
              <button type="button" onClick={() => setExportFields(ALL_FIELDS_ON)}
                style={{ fontSize: 12, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Seleccionar todo
              </button>
              <span style={{ color: "#E2E8F0" }}>·</span>
              <button type="button" onClick={() => setExportFields(ALL_FIELDS_OFF)}
                style={{ fontSize: 12, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Limpiar
              </button>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8" }}>
                {Object.values(exportFields).filter(Boolean).length} seleccionados
              </span>
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 20px 16px", borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 13, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
              >Cancelar</button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!Object.values(exportFields).some(Boolean)}
                style={{
                  height: 36, padding: "0 18px", borderRadius: 8, border: "none",
                  background: Object.values(exportFields).some(Boolean) ? "#2563EB" : "#CBD5E1",
                  fontSize: 13, fontWeight: 600, color: "#fff",
                  cursor: Object.values(exportFields).some(Boolean) ? "pointer" : "default",
                  fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {exporting === "csv" ? <><Loader2 size={13} className="animate-spin" />Exportando…</> : <><Sheet size={13} />Exportar Excel</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Procedure execution modal ─────────────────────────────────────────────────

const EXEC_TIPO_META: Record<TipoPasoProc, { icon: React.ReactNode; color: string }> = {
  instruccion:        { icon: <Info size={13} />,          color: "#3B82F6" },
  advertencia:        { icon: <AlertTriangle size={13} />, color: "#F59E0B" },
  texto:              { icon: <Type size={13} />,          color: "#8B5CF6" },
  numero:             { icon: <HashIcon size={13} />,      color: "#6366F1" },
  monto:              { icon: <DollarSign size={13} />,    color: "#10B981" },
  si_no_na:           { icon: <CheckSquare size={13} />,   color: "#14B8A6" },
  opcion_multiple:    { icon: <List size={13} />,          color: "#F97316" },
  lista_verificacion: { icon: <ListChecks size={13} />,    color: "#EF4444" },
  inspeccion:         { icon: <ClipboardCheck size={13} />,color: "#EC4899" },
  imagen:             { icon: <Camera size={13} />,        color: "#64748B" },
  firma:              { icon: <PenLine size={13} />,       color: "#0EA5E9" },
};

function isAnsweredForType(paso: ProcedimientoPaso, resp: PendingResp | undefined): boolean {
  if (!resp) return false;
  switch (paso.tipo) {
    case "instruccion":
    case "advertencia":
      return true; // presence of any saved resp = acknowledged
    case "texto":          return !!resp.valor_texto;
    case "numero":         return resp.valor_medido != null;
    case "monto":          return resp.valor_medido != null;
    case "si_no_na":       return !!resp.valor_texto;
    case "opcion_multiple":return !!resp.valor_texto;
    case "lista_verificacion": return resp.valor_json != null;
    case "inspeccion":     return resp.valor_json != null;
    case "imagen":         return !!resp.foto_url;
    case "firma":          return !!resp.firma_svg;
    default:               return false;
  }
}

function ReadonlyAnswer({ paso, resp }: { paso: ProcedimientoPaso; resp: PendingResp }) {
  const currency = paso.moneda ?? "CLP";
  switch (paso.tipo) {
    case "texto":
      return <div style={{ fontSize: 12.5, color: "#475569", marginTop: 4, whiteSpace: "pre-wrap" }}>{resp.valor_texto}</div>;
    case "numero":
      return <div style={{ fontSize: 12.5, color: "#475569", marginTop: 4 }}>{resp.valor_medido} {paso.unidad}</div>;
    case "monto":
      return <div style={{ fontSize: 12.5, color: "#475569", marginTop: 4 }}>{currency} {resp.valor_medido?.toLocaleString("es-CL")}</div>;
    case "si_no_na":
    case "opcion_multiple":
      return <div style={{ fontSize: 12.5, color: "#475569", marginTop: 4 }}>{resp.valor_texto}</div>;
    case "lista_verificacion": {
      const checked: string[] = (resp.valor_json as any)?.checked ?? [];
      return <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{checked.length} de {paso.opciones?.length ?? 0} marcados</div>;
    }
    case "inspeccion": {
      const items: { item: string; result: string }[] = (resp.valor_json as any)?.items ?? [];
      const pass = items.filter(i => i.result === "pass").length;
      return <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{pass}/{items.length} pasaron</div>;
    }
    case "imagen":
      return resp.foto_url
        ? <img src={resp.foto_url} alt="foto" style={{ marginTop: 6, maxWidth: 180, borderRadius: 6, border: "1px solid #E2E8F0" }} />
        : null;
    case "firma":
      return resp.firma_svg
        ? <img src={resp.firma_svg} alt="firma" style={{ marginTop: 6, maxWidth: "100%", height: 80, objectFit: "contain", border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC" }} />
        : <div style={{ fontSize: 12.5, color: "#10B981", marginTop: 4 }}>✓ Firmado</div>;
    default:
      return null;
  }
}

function SignatureCanvas({
  existingDataUrl, isSaving, onSave,
}: {
  existingDataUrl?: string | null;
  isSaving: boolean;
  onSave: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [saved, setSaved] = useState(!!existingDataUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#0F172A";
    if (existingDataUrl) {
      const img = new window.Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = existingDataUrl;
      setHasStrokes(true);
      setSaved(true);
    }
  }, []);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      if (e.touches.length === 0) return null;
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    const pos = getPos(e);
    if (!pos) return;
    lastPos.current = pos;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2);
    ctx.fill();
    setSaved(false);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const pos = getPos(e);
    if (!pos) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  }

  function stopDraw() {
    drawing.current = false;
    lastPos.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    setSaved(false);
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
    setSaved(true);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={520}
        height={160}
        style={{
          width: "100%", height: 160, display: "block",
          border: "1px solid #E2E8F0", borderRadius: 8,
          background: "#F8FAFC", cursor: "crosshair", touchAction: "none",
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {!hasStrokes && (
        <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", marginTop: 4 }}>
          Dibuja tu firma con el mouse o dedo
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          onClick={clear}
          style={{ height: 30, padding: "0 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#64748B", fontFamily: "inherit" }}
        >
          Limpiar
        </button>
        <button
          onClick={save}
          disabled={!hasStrokes || isSaving}
          style={{
            height: 30, padding: "0 14px",
            background: hasStrokes ? "#F0F9FF" : "#F8FAFC",
            border: `1px solid ${hasStrokes ? "#0EA5E9" : "#E2E8F0"}`,
            borderRadius: 6, cursor: hasStrokes && !isSaving ? "pointer" : "default",
            fontSize: 12, fontWeight: 600, color: hasStrokes ? "#0369A1" : "#94A3B8",
            fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
            opacity: !hasStrokes ? 0.5 : 1,
          }}
        >
          {isSaving ? <Loader2 size={11} className="animate-spin" /> : <PenLine size={11} />}
          Guardar firma
        </button>
        {saved && !isSaving && (
          <span style={{ fontSize: 12, color: "#10B981", display: "flex", alignItems: "center", gap: 4 }}>
            <Check size={11} /> Guardado
          </span>
        )}
      </div>
    </div>
  );
}

function PasoInput({
  paso, resp, existingResp, isSaving, onUpdate, onSave,
}: {
  paso: ProcedimientoPaso;
  resp: PendingResp;
  existingResp: PendingResp | undefined;
  isSaving: boolean;
  onUpdate: (patch: PendingResp) => void;
  onSave: (extra?: PendingResp) => void;
}) {
  const val = (k: keyof PendingResp) => (resp as any)[k] ?? (existingResp as any)?.[k];
  const inputStyle: React.CSSProperties = {
    width: "100%", height: 32, padding: "0 10px",
    border: "1px solid #E2E8F0", borderRadius: 6,
    fontSize: 13, fontFamily: "inherit", color: "#0F172A",
    background: "#fff", outline: "none", boxSizing: "border-box",
  };
  const saveBtn = (label: string, disabled = false) => (
    <button
      onClick={() => onSave()}
      disabled={isSaving || disabled}
      style={{
        height: 30, padding: "0 14px", background: "#EFF6FF",
        border: "1px solid #2563EB", borderRadius: 6, cursor: disabled || isSaving ? "default" : "pointer",
        fontSize: 12, fontWeight: 600, color: "#2563EB", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 4, opacity: disabled ? 0.5 : 1,
      }}
    >
      {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
      {label}
    </button>
  );

  if (paso.tipo === "instruccion" || paso.tipo === "advertencia") {
    const isAck = !!existingResp;
    const bg = paso.tipo === "instruccion" ? "#EFF6FF" : "#FFFBEB";
    const bc = paso.tipo === "instruccion" ? "#2563EB" : "#F59E0B";
    const tc = paso.tipo === "instruccion" ? "#2563EB" : "#B45309";
    return (
      <button
        onClick={() => onSave({})}
        disabled={isAck || isSaving}
        style={{ height: 28, padding: "0 12px", background: isAck ? "#D1FAE5" : bg, border: `1px solid ${isAck ? "#10B981" : bc}`, borderRadius: 6, cursor: isAck ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: isAck ? "#10B981" : tc, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
      >
        {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        {isAck ? (paso.tipo === "instruccion" ? "Confirmado" : "Leído y entendido") : (paso.tipo === "instruccion" ? "Confirmar lectura" : "Leído y entendido")}
      </button>
    );
  }

  if (paso.tipo === "si_no_na") {
    const cur = val("valor_texto");
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Sí", "No", "N/A"].map(opt => (
          <button
            key={opt}
            onClick={() => onSave({ valor_texto: opt })}
            disabled={isSaving}
            style={{
              height: 30, padding: "0 16px", borderRadius: 6, cursor: "pointer",
              fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
              border: cur === opt ? "1px solid #2563EB" : "1px solid #E2E8F0",
              background: cur === opt ? "#EFF6FF" : "#F8FAFC",
              color: cur === opt ? "#2563EB" : "#64748B",
            }}
          >
            {isSaving && cur === opt ? <Loader2 size={11} className="animate-spin" /> : opt}
          </button>
        ))}
      </div>
    );
  }

  if (paso.tipo === "opcion_multiple") {
    const cur = val("valor_texto");
    const opts = paso.opciones ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {opts.map(opt => (
          <button
            key={opt}
            onClick={() => onSave({ valor_texto: opt })}
            disabled={isSaving}
            style={{
              height: 32, padding: "0 12px", borderRadius: 6, cursor: "pointer",
              fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", textAlign: "left",
              border: cur === opt ? "1px solid #2563EB" : "1px solid #E2E8F0",
              background: cur === opt ? "#EFF6FF" : "#F8FAFC",
              color: cur === opt ? "#2563EB" : "#0F172A",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${cur === opt ? "#2563EB" : "#CBD5E1"}`, background: cur === opt ? "#2563EB" : "transparent", flexShrink: 0 }} />
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (paso.tipo === "lista_verificacion") {
    const checked: string[] = (val("valor_json") as any)?.checked ?? [];
    const opts = paso.opciones ?? [];
    function toggle(opt: string) {
      const next = checked.includes(opt) ? checked.filter(c => c !== opt) : [...checked, opt];
      onSave({ valor_json: { checked: next } });
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {opts.map(opt => {
          const isChecked = checked.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              disabled={isSaving}
              style={{
                height: 32, padding: "0 12px", borderRadius: 6, cursor: "pointer",
                fontSize: 12.5, fontWeight: 500, fontFamily: "inherit", textAlign: "left",
                border: isChecked ? "1px solid #10B981" : "1px solid #E2E8F0",
                background: isChecked ? "#F0FDF4" : "#F8FAFC",
                color: isChecked ? "#059669" : "#0F172A",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isChecked ? "#10B981" : "#CBD5E1"}`, background: isChecked ? "#10B981" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isChecked && <Check size={9} style={{ color: "#fff" }} />}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (paso.tipo === "inspeccion") {
    const items: { item: string; result: "pass" | "fail" | "na" | "" }[] =
      (val("valor_json") as any)?.items ?? (paso.opciones ?? []).map(item => ({ item, result: "" as const }));
    function setResult(item: string, result: "pass" | "fail" | "na") {
      const next = items.map(i => i.item === item ? { ...i, result } : i);
      const allAnswered = next.every(i => i.result !== "");
      onSave({ valor_json: { items: next } });
      if (!allAnswered) return; // don't auto-complete
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map(({ item, result }) => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1, fontSize: 12.5, color: "#0F172A" }}>{item}</span>
            {(["pass", "fail", "na"] as const).map(r => {
              const labels = { pass: "OK", fail: "Falla", na: "N/A" };
              const colors = { pass: "#10B981", fail: "#EF4444", na: "#94A3B8" };
              return (
                <button
                  key={r}
                  onClick={() => setResult(item, r)}
                  disabled={isSaving}
                  style={{
                    height: 26, padding: "0 10px", borderRadius: 5, cursor: "pointer",
                    fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                    border: result === r ? `1px solid ${colors[r]}` : "1px solid #E2E8F0",
                    background: result === r ? colors[r] + "15" : "#F8FAFC",
                    color: result === r ? colors[r] : "#94A3B8",
                  }}
                >
                  {labels[r]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  if (paso.tipo === "texto") {
    const cur: string = val("valor_texto") ?? "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {paso.multilinea ? (
          <textarea
            value={cur}
            onChange={e => onUpdate({ valor_texto: e.target.value })}
            placeholder="Escribe tu respuesta…"
            style={{ ...inputStyle, height: "auto", minHeight: 72, padding: "7px 10px", resize: "vertical", lineHeight: 1.5 }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
          />
        ) : (
          <input
            type="text"
            value={cur}
            onChange={e => onUpdate({ valor_texto: e.target.value })}
            placeholder="Escribe tu respuesta…"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
          />
        )}
        {saveBtn("Guardar", !cur.trim())}
      </div>
    );
  }

  if (paso.tipo === "numero" || paso.tipo === "monto") {
    const cur: string = val("valor_medido") != null ? String(val("valor_medido")) : "";
    const currency = paso.moneda ?? "CLP";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {paso.tipo === "monto" && <span style={{ fontSize: 12.5, fontWeight: 600, color: "#64748B" }}>{currency}</span>}
        <input
          type="number"
          value={cur}
          onChange={e => onUpdate({ valor_medido: parseFloat(e.target.value) ?? undefined })}
          placeholder="0"
          style={{ ...inputStyle, width: 120 }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
        />
        {paso.tipo === "numero" && paso.unidad && <span style={{ fontSize: 12, color: "#64748B" }}>{paso.unidad}</span>}
        {paso.tipo === "numero" && paso.valor_min != null && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>({paso.valor_min} – {paso.valor_max})</span>
        )}
        {saveBtn("OK", !cur)}
      </div>
    );
  }

  if (paso.tipo === "imagen") {
    return (
      <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
        (Subida de imágenes disponible en la app móvil)
      </div>
    );
  }

  if (paso.tipo === "firma") {
    return (
      <div>
        {paso.rol_firmante && (
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 6 }}>
            Firma de: <strong>{paso.rol_firmante}</strong>
          </div>
        )}
        <SignatureCanvas
          existingDataUrl={existingResp?.firma_svg ?? null}
          isSaving={isSaving}
          onSave={dataUrl => onSave({ firma_svg: dataUrl, firmado_at: new Date().toISOString() })}
        />
      </div>
    );
  }

  return null;
}

function ProcEjecucionModal({
  ejec, proc, pendingResps, savingResp, completingEjec,
  onClose, onUpdateResp, onSaveResp, onComplete,
}: {
  ejec: ProcedimientoEjecucion;
  proc: OTProcedimiento["procedimiento"] | null;
  pendingResps: Record<string, PendingResp>;
  savingResp: string | null;
  completingEjec: boolean;
  onClose: () => void;
  onUpdateResp: (pasoId: string, patch: PendingResp) => void;
  onSaveResp: (pasoId: string, extra?: PendingResp) => void;
  onComplete: () => void;
}) {
  const pasos: ProcedimientoPaso[] = (proc?.pasos ?? []);
  const isCompleted = ejec.estado === "completado";

  const savedResps: Record<string, PendingResp> = {};
  for (const r of ejec.respuestas ?? []) savedResps[r.paso_id] = r as PendingResp;

  const allRequired = pasos.filter(p => p.requerido && p.tipo !== "instruccion" && p.tipo !== "advertencia");
  const answeredRequired = allRequired.filter(p => isAnsweredForType(p, savedResps[p.id]));
  const canComplete = answeredRequired.length === allRequired.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15,23,42,0.50)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 580, maxHeight: "92vh", borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column", boxShadow: "0 -8px 40px rgba(0,0,0,0.20)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #E2E8F0", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{proc?.nombre ?? "Procedimiento"}</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>{pasos.length} campo{pasos.length !== 1 ? "s" : ""}</div>
          </div>
          {isCompleted && (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#10B981", background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 6, padding: "3px 10px" }}>
              Completado
            </span>
          )}
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#94A3B8" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 20px" }}>
          {pasos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", fontSize: 13 }}>Sin campos definidos</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pasos.map((paso, idx) => {
                const meta = EXEC_TIPO_META[paso.tipo];
                const saved = savedResps[paso.id];
                const pending = pendingResps[paso.id] ?? {};
                const isSaving = savingResp === paso.id;
                const answered = isAnsweredForType(paso, saved);
                const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia";

                return (
                  <div
                    key={paso.id}
                    style={{
                      border: `1px solid ${answered ? "#D1FAE5" : "#E2E8F0"}`,
                      borderRadius: 10, background: answered ? "#F0FDF4" : "#fff",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "12px 14px" }}>
                      {/* Step header */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: (paso.descripcion || !isInfoOnly) ? 8 : 0 }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                          background: answered ? "#D1FAE5" : meta.color + "15",
                          color: answered ? "#10B981" : meta.color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {answered ? <Check size={13} /> : meta.icon}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A", lineHeight: 1.3 }}>
                            {idx + 1}. {paso.titulo}
                            {!paso.requerido && !isInfoOnly && (
                              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, marginLeft: 6 }}>(opcional)</span>
                            )}
                          </div>
                          {paso.descripcion && (
                            <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.5, marginTop: 3 }}>{paso.descripcion}</div>
                          )}
                        </div>
                      </div>

                      {/* Input or read-only answer */}
                      {isCompleted && saved ? (
                        <div style={{ paddingLeft: 36 }}>
                          <ReadonlyAnswer paso={paso} resp={saved} />
                        </div>
                      ) : !isCompleted ? (
                        <div style={{ paddingLeft: 36 }}>
                          <PasoInput
                            paso={paso}
                            resp={pending}
                            existingResp={saved}
                            isSaving={isSaving}
                            onUpdate={patch => onUpdateResp(paso.id, patch)}
                            onSave={extra => onSaveResp(paso.id, extra)}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isCompleted && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #E2E8F0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F8FAFC" }}>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>
              {answeredRequired.length}/{allRequired.length} campos requeridos completados
            </div>
            <button
              onClick={onComplete}
              disabled={!canComplete || completingEjec}
              style={{
                height: 36, padding: "0 18px",
                background: canComplete ? "linear-gradient(135deg, #10B981, #059669)" : "#E2E8F0",
                border: "none", borderRadius: 8, cursor: canComplete ? "pointer" : "default",
                fontSize: 13, fontWeight: 600, color: canComplete ? "#fff" : "#94A3B8",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {completingEjec ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Completar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
