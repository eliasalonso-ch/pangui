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
import type {
  OrdenTrabajo, ActividadOT, ActividadTipo, Usuario, Estado, Prioridad,
} from "@/types/ordenes";

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

type Tab = "detalle" | "actividad" | "fotos" | "materiales";

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

  const actRtRef  = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const channelKey = useRef(`actividad-${orden.id}-${Math.random().toString(36).slice(2)}`);

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
      const [act, wsNombre] = await Promise.all([fetchActividadForExport(), fetchWorkspaceName()]);
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden, actividad: act, usuarios,
          exportadoPor: exporterName(),
          workspaceNombre: wsNombre,
          nOT: meta.nOT,
          partes: [], subOrdenes: [],
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
          {(["detalle", "actividad", "fotos", "materiales"] as Tab[]).map(t => (
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
                marginBottom: -1, transition: "color 0.1s",
              }}
            >
              {t === "detalle" ? "Detalle"
                : t === "actividad" ? "Actividad"
                : t === "fotos" ? `Fotos${fotos.length > 0 ? ` (${fotos.length})` : ""}`
                : `Materiales${ordenPartes.length > 0 ? ` (${ordenPartes.length})` : ""}`}
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
                        {act.comentario && (
                          <div style={{
                            marginTop: 4, fontSize: 13, lineHeight: 1.6, color: isComment ? "#0F172A" : "#64748B",
                            background: isComment ? "#F8FAFC" : "transparent",
                            padding: isComment ? "8px 10px" : "0",
                            borderRadius: isComment ? 6 : 0,
                            borderLeft: isComment ? "2px solid #2563EB" : "none",
                          }}>
                            {act.comentario}
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

      </div>

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
