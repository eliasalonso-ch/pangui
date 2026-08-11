"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { uploadToR2 } from "@/lib/r2";
import HojaSpreadsheet from "@/components/HojaSpreadsheet";
import { createHoja } from "@/lib/hojas-api";
import { notifySolicitudMateriales } from "@/lib/notificar";
import {
  X, Pencil, Trash2, Check, Copy, MapPin, Settings2, User, Flag,
  Calendar, Tag, Send, AlertTriangle, Loader2,
  CircleDot, PauseCircle, PlayCircle, CheckCircle2, XCircle,
  ChevronDown, ChevronLeft, ChevronRight, Plus, Image, Building2, Hash,
  Play, Pause, Square, RotateCcw,
  FileText, Sheet, FileDown, MoreVertical, Upload, Download,
  Package, Search,
  ClipboardCheck, Info, Hash as HashIcon, Camera, PenLine, Shield, CheckSquare,
  Type, DollarSign, List, ListChecks, AlertCircle, ImagePlus, FolderOpen,
  Lock, LockOpen, Mic, MicOff, Volume2, GitBranch, Wrench, Link as LinkIcon,
  Phone, Mail, Circle,
  Minus, ArrowUp, ArrowDown, RotateCw, UserRoundX, UserRoundCheck,
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
  updateOrdenEstado, updateOrdenPrioridad, updateOrden,
  iniciarOrden, pausarOrden, reanudarOrden, completarOrden,
  fetchActividad, addComentario,
  uploadOrdenFoto, addOrdenFoto, removeOrdenFoto,
  parseDescMeta, fetchOrden, fetchSubOrdenes, createSubOrden,
} from "@/lib/ordenes-api";
import type { ForceClose } from "@/lib/ordenes-api";
import { analytics } from "@/lib/analytics";
import {
  fetchFotoGrupos, createFotoGrupo, updateFotoGrupo, deleteFotoGrupo,
  uploadAndAddFotoToGrupo, removeFotoFromGrupo, toggleFotoGrupoLocked,
} from "@/lib/foto-grupos-api";
import type { FotoGrupo } from "@/lib/foto-grupos-api";
import { FotosGaleria } from "./FotosGaleria";
import { optimizedImageUrl } from "@/lib/image-cdn";
import {
  getOTProcedimientos,
  startEjecucion, saveRespuesta, completeEjecucion, maybeTriggerCorrectiva,
} from "@/lib/procedimientos-api";
import type {
  OrdenTrabajo, ActividadOT, ActividadTipo, Usuario, Estado, Prioridad,
} from "@/types/ordenes";
import { notifyClasificacionCambiada } from "@/lib/notificar";
import { esElevado, esAdmin } from "@/lib/roles";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";
import type {
  OTProcedimiento, ProcedimientoEjecucion,
  PasoRespuesta, TipoPasoProc, ProcedimientoPaso,
} from "@/types/procedimientos";

type PendingResp = Omit<Partial<PasoRespuesta>, "firmado_nombre"> & { firmado_nombre?: string | null };
type PauseReason = "acceso" | "materiales" | "reprogramar" | "otro";

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADOS: { value: Estado; label: string; icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>; className: string }[] = [
  { value: "pendiente",   label: "Sin asignar", icon: UserRoundX, className: "text-blue-600" },
  { value: "en_espera",   label: "En espera",   icon: Pause,      className: "text-amber-600" },
  { value: "en_curso",    label: "En curso",    icon: RotateCw,   className: "text-purple-600" },
  { value: "completado",  label: "Completada",  icon: Check,      className: "text-green-600" },
];

const PRIORIDADES: { value: Prioridad; label: string; color: string }[] = [
  { value: "ninguna", label: "Sin prioridad", color: "text-zinc-400" },
  { value: "baja",    label: "Baja",          color: "text-zinc-500" },
  { value: "media",   label: "Media",         color: "text-blue-600" },
  { value: "alta",    label: "Alta",          color: "text-orange-500" },
  { value: "urgente", label: "Urgente",       color: "text-red-600" },
];

// La dirección de la flecha comunica la intensidad y el color la refuerza:
// verde → azul → naranja → rojo.
type BadgeIcon = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; style?: React.CSSProperties }>;

// Color por estado, usado en los botones del selector. `pendiente` no está
// acá: sin asignados es neutro y con asignados toma el azul de "En curso".
const ESTADO_ACCENT: Record<string, string> = {
  en_espera:  "var(--st-wait-dot)",
  en_curso:   "var(--st-progress-dot)",
  completado: "var(--st-done-dot)",
};

const PRIO_ICON: Record<string, BadgeIcon> = {
  ninguna: Minus,
  baja:    ArrowDown,
  media:   Minus,
  alta:    ArrowUp,
  urgente: AlertTriangle,
};

const PRIO_COLOR_SOLID: Record<string, string> = {
  ninguna: "var(--fg-3)",
  baja:    "var(--success)",
  media:   "var(--brand)",
  alta:    "var(--pr-high)",
  urgente: "var(--pr-urgent)",
};

/** Ícono de la etiqueta: glifo de contorno en el color del estado, sin
 *  disco ni relleno. Mismo tratamiento que en OTRow. */
function SolidIcon({ icon: Icon, color, size = 15 }: { icon: BadgeIcon; color: string; size?: number }) {
  return <Icon size={size} color={color} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />;
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono sólido como único portador del color. Mismo patrón que OTRow. */
function DetailBadge({
  icon: Icon,
  iconColor,
  children,
}: {
  icon?: BadgeIcon;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 9px",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--r-sm)",
      background: "transparent",
      color: "var(--fg-1)",
      fontWeight: 400,
      whiteSpace: "nowrap",
    }}>
      {Icon && <SolidIcon icon={Icon} color={iconColor ?? "var(--fg-3)"} />}
      {children}
    </span>
  );
}

const TIPO_LABEL: Record<string, string> = {
  reactiva: "Reactiva", preventiva: "Preventiva",
  emergencia: "Emergencia",
  presupuesto: "Presupuesto", levantamiento: "Levantamiento",
};

const ACT_ICON: Record<ActividadTipo, React.ComponentType<{ className?: string }>> = {
  creado:               CircleDot,
  asignado:             User,
  estado_cambiado:      PlayCircle,
  prioridad_cambiada:   AlertTriangle,
  editado:              Pencil,
  ubicacion_cambiada:   MapPin,
  iniciado:             Play,
  pausado:              Pause,
  reanudado:            RotateCcw,
  completado:           CheckCircle2,
  cancelado:            XCircle,
  comentario:           Send,
  fotos_grupo_subidas:  Image,
};

const ACT_COLOR: Record<ActividadTipo, string> = {
  creado:               "text-indigo-500",
  asignado:             "text-violet-500",
  estado_cambiado:      "text-blue-500",
  prioridad_cambiada:   "text-orange-500",
  editado:              "text-zinc-500",
  ubicacion_cambiada:   "text-teal-500",
  iniciado:             "text-green-500",
  pausado:              "text-amber-500",
  reanudado:            "text-cyan-500",
  completado:           "text-green-600",
  cancelado:            "text-zinc-400",
  comentario:           "text-blue-500",
  fotos_grupo_subidas:  "text-sky-500",
};

const ACT_LABEL: Record<ActividadTipo, string> = {
  creado:               "Orden creada",
  asignado:             "Asignado a",
  estado_cambiado:      "Estado cambiado a",
  prioridad_cambiada:   "Prioridad cambiada a",
  editado:              "Orden editada",
  ubicacion_cambiada:   "Ubicación actualizada",
  iniciado:             "Trabajo iniciado",
  pausado:              "Trabajo pausado",
  reanudado:            "Trabajo reanudado",
  completado:           "Orden completada",
  cancelado:            "Orden cancelada",
  comentario:           "",
  fotos_grupo_subidas:  "Fotos subidas al grupo",
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

function fmtFechaLocal(value: string): string {
  const ymd = value.slice(0, 10).split("-");
  if (ymd.length !== 3) return value;
  const [y, m, d] = ymd.map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function initials(n: string) {
  const p = n.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ── N° OT badge with copy ─────────────────────────────────────────────────────

function CopyOTUrlButton({ ordenId }: { ordenId: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = `${window.location.origin}/ordenes?id=${encodeURIComponent(ordenId)}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "URL copiada" : "Copiar URL de la OT"}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        verticalAlign: "middle", marginLeft: 8,
        padding: 0, background: "none", border: "none",
        cursor: "pointer", color: "var(--brand)",
      }}
    >
      {copied ? <Check size={22} /> : <LinkIcon size={22} />}
    </button>
  );
}

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
        display: "inline-flex", alignItems: "center", gap: 6,
        marginBottom: 16,
        fontSize: 14, fontFamily: "inherit", fontWeight: 500,
        color: "var(--fg-1)", background: "none", border: "none", cursor: "pointer", padding: 0,
      }}
    >
      <span>{nOT}</span>
      {copied
        ? <Check size={16} style={{ color: "var(--brand)" }} />
        : <Copy size={16} style={{ color: "var(--brand)" }} />
      }
    </button>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

function SubOrdenesSection({
  subOrdenes,
  isLoading,
  canCreate,
  isCreating,
  newTitle,
  onTitleChange,
  onCreate,
  onOpen,
}: {
  subOrdenes: OrdenTrabajo[];
  isLoading: boolean;
  canCreate: boolean;
  isCreating: boolean;
  newTitle: string;
  onTitleChange: (value: string) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  const completed = subOrdenes.filter((sub) => sub.estado === "completado").length;
  const total = subOrdenes.length;

  return (
    <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--border)", maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 9, background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <GitBranch size={17} />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--fg-1)" }}>Sub-OTs</p>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--fg-4)" }}>
            {total > 0 ? `${completed}/${total} completadas` : "Crea una sub-OT por equipo, sala o tarea."}
          </p>
        </div>
      </div>

      {canCreate && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            value={newTitle}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="Nueva sub-OT..."
            style={{
              flex: 1, minWidth: 0, height: 40, padding: "0 12px",
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              background: "var(--surface-1)", color: "var(--fg-1)",
              fontSize: 13, outline: "none", fontFamily: "inherit",
            }}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                onCreate();
              }
            }}
          />
          <button
            type="button"
            onClick={onCreate}
            disabled={!newTitle.trim() || isCreating}
            style={{
              height: 40, padding: "0 16px", border: "none",
              borderRadius: "var(--r-sm)",
              background: newTitle.trim() && !isCreating ? "var(--brand)" : "var(--border-strong)",
              color: "var(--fg-on-brand)", fontSize: 12, fontWeight: 700,
              cursor: newTitle.trim() && !isCreating ? "pointer" : "default",
              display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
            }}
          >
            {isCreating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={13} />}
            Agregar
          </button>
        </div>
      )}

      {isLoading && total === 0 ? (
        <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", gap: 8, fontSize: 12 }}>
          <Loader2 size={14} className="animate-spin" />
          Cargando sub-OTs...
        </div>
      ) : total === 0 ? (
        <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-2)", fontSize: 13, lineHeight: 1.65 }}>
          Las sub-OTs funcionan como OTs completas, pero quedan agrupadas bajo esta orden principal.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {subOrdenes.map((sub) => {
            const done = sub.estado === "completado";
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => onOpen(sub.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "14px 16px", borderRadius: "var(--r-md)",
                  border: `1px solid ${done ? "var(--success)" : "var(--border)"}`,
                  background: done ? "var(--success-bg)" : "var(--surface-0)",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 8, background: done ? "var(--success)" : "var(--brand-tint)", color: done ? "var(--fg-on-brand)" : "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {done ? <Check size={14} /> : <Wrench size={14} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sub.titulo ?? "Sub-OT sin título"}
                  </span>
                  <span style={{ display: "block", marginTop: 2, fontSize: 12, color: "var(--fg-4)" }}>
                    {sub.estado === "pendiente" && (sub.asignados_ids ?? []).length > 0
                      ? "Asignada"
                      : ESTADOS.find(e => e.value === sub.estado)?.label ?? sub.estado}
                  </span>
                </span>
                <ChevronDown size={14} style={{ color: "var(--fg-4)", transform: "rotate(-90deg)" }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ConfirmDeleteModal ────────────────────────────────────────────────────────
// Shared confirmation popup for any destructive action. MaintainX-style: X in
// the top-right, a centered question, and stacked full-width buttons — a red
// "Confirmar" over a borderless "Cancelar". Guards against accidental clicks.

interface ConfirmDelete {
  /** The thing being deleted, interpolated into the default question (e.g. a
   *  name). Ignored when `title` is provided. */
  label?: string;
  /** Overrides the auto-generated question, e.g. "Eliminar esta orden?". */
  title?: string;
  /** Optional secondary warning line under the title. */
  description?: string;
  /** Confirm button text. Defaults to "Confirmar". */
  confirmLabel?: string;
  /** Runs on confirm. May be async. If it throws, the message is shown in the
   *  modal and the dialog stays open (so the user can retry). */
  onConfirm: () => void | Promise<void>;
}

function ConfirmDeleteModal({ pending, onClose }: {
  pending: ConfirmDelete | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset the inline error whenever a new confirmation is opened/closed.
  useEffect(() => { setError(null); }, [pending]);
  if (!pending) return null;

  const close = () => { if (!busy) onClose(); };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await pending.onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const title = pending.title ?? `¿Seguro que quieres eliminar “${pending.label ?? "esto"}”?`;

  return (
    <div
      role="presentation"
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-lg, 12px)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: busy ? "default" : "pointer", color: "var(--fg-3)" }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "4px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--fg-1)", lineHeight: 1.4 }}>
              {title}
            </h3>
            {pending.description && (
              <p style={{ margin: 0, fontSize: 13, color: "var(--fg-3)", lineHeight: 1.5 }}>
                {pending.description}
              </p>
            )}
          </div>
          {error && (
            <div style={{ padding: "10px 12px", border: "1px solid var(--danger)", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={run}
              style={{
                height: 44, width: "100%", border: "none", borderRadius: 8,
                background: "var(--danger)", color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: busy ? 0.75 : 1,
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {pending.confirmLabel ?? "Confirmar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                height: 44, width: "100%", border: "none", borderRadius: 8,
                background: "transparent", color: "var(--brand-fg)", fontSize: 14, fontWeight: 600,
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Props {
  orden:          OrdenTrabajo;
  usuarios:       Usuario[];
  myId:           string;
  myRol:          string | null;
  wsId:           string;
  onEdit:         () => void;
  onDelete:       () => void | Promise<void>;
  onClose:        () => void;
  onOrdenUpdated: (o: Partial<OrdenTrabajo>) => void;
  onOpenOrden?:   (id: string) => void;
  // Show an X button in the sticky header. Off by default (list view has its
  // own close affordances); on for calendar/kanban modal overlays.
  showCloseButton?: boolean;
  showBackButton?: boolean;
  // Per-user "marcar como leída/vista" state + toggle (owned by the parent list).
  isMarcada?:       boolean;
  onToggleMarcada?: (id: string, next: boolean) => void;
}

type Tab = "detalle" | "actividad" | "fotos" | "materiales" | "hoja";

/** Título de la barra compacta dentro de cada pestaña. */
const TAB_TITLE: Record<Tab, string> = {
  detalle:        "Detalle",
  actividad:      "Actividad",
  fotos:          "Fotos",
  materiales:     "Materiales",
  hoja:           "Hoja de cálculo",
};

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
  onEdit, onDelete, onClose, onOrdenUpdated, onOpenOrden,
  showCloseButton = false, showBackButton = false,
  isMarcada, onToggleMarcada,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("detalle");
  const [actividad, setActividad] = useState<ActividadOT[]>([]);
  const [loadingAct, setLoadingAct] = useState(false);
  // Latest "pausado" actividad row, fetched eagerly when the OT is in espera so
  // the detail tab can show the pause reason (incl. "Reprogramar: <date>"
  // emitted by the mobile PauseSheet) without waiting for the Actividad tab.
  const [latestPause, setLatestPause] = useState<{ comentario: string | null; created_at: string } | null>(null);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [timerAction, setTimerAction] = useState<"pausar" | "completar" | null>(null);
  const [timerComment, setTimerComment] = useState("");
  const [timerBusy, setTimerBusy] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState<PauseReason | null>(null);
  const [pauseComment, setPauseComment] = useState("");
  const [pauseDate, setPauseDate] = useState("");
  const [pendingMaterialRequestSheetId, setPendingMaterialRequestSheetId] = useState<string | null>(null);
  const materialRequestPauseBusyRef = useRef(false);

  // Close-gate dialog. `missing` is what the OT still owes; `resume` is the close
  // the user was attempting, replayed with an override once they justify it.
  const [gate, setGate] = useState<{
    missing: string[];
    resume: (forceClose?: ForceClose) => Promise<void>;
  } | null>(null);
  const [gateReason, setGateReason] = useState("");
  const [gateBusy, setGateBusy] = useState(false);

  // Autosave feedback. Procedure steps save on change/blur with no Save button,
  // so the toast is the only signal that the write landed.
  const [saveToast, setSaveToast] = useState<"saving" | "saved" | "error" | null>(null);
  const saveToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSaveToast = useCallback((state: "saving" | "saved" | "error") => {
    if (saveToastTimer.current) clearTimeout(saveToastTimer.current);
    setSaveToast(state);
    if (state !== "saving") {
      saveToastTimer.current = setTimeout(() => setSaveToast(null), state === "error" ? 4000 : 1800);
    }
  }, []);
  useEffect(() => () => { if (saveToastTimer.current) clearTimeout(saveToastTimer.current); }, []);

  const [fotos, setFotos] = useState<string[]>([
    ...(orden.imagen_url ? [orden.imagen_url] : []),
    ...(orden.fotos_urls ?? []),
  ]);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingAdjuntos, setUploadingAdjuntos] = useState(false);
  const adjuntosInputRef = useRef<HTMLInputElement | null>(null);
  const [deletingFoto, setDeletingFoto] = useState<string | null>(null);
  const [confirmDeleteFoto, setConfirmDeleteFoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Foto grupos ──────────────────────────────────────────────────────────────
  const [fotoGrupos, setFotoGrupos] = useState<FotoGrupo[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(false);
  const [gruposLoaded, setGruposLoaded] = useState(false);
  const [uploadingGrupoId, setUploadingGrupoId] = useState<string | null>(null);
  const [editingGrupoId, setEditingGrupoId] = useState<string | null>(null);
  const [creatingGrupo, setCreatingGrupo] = useState(false);
  const [lightboxGrupo, setLightboxGrupo] = useState<{ urls: string[]; idx: number } | null>(null);

  const [exporting, setExporting] = useState<"pdf" | "csv" | "txt" | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  type ExportField =
    | "n_ot" | "n_serie" | "id" | "titulo" | "estado" | "prioridad" | "tipo_trabajo" | "categoria" | "solicitante" | "hito"
    | "descripcion"
    | "asignados" | "empresa" | "ubicacion" | "lugar"
    | "creada_el" | "fecha_inicio" | "fecha_limite" | "tiempo_trabajado"
    | "materiales"
    | "hoja_calculo"
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
    { key: "hito",            label: "ITO",                  group: "Información general" },
    { key: "descripcion",     label: "Descripción",          group: "Información general" },
    { key: "asignados",       label: "Asignados",            group: "Personas y ubicación" },
    { key: "empresa",         label: "Empresa",              group: "Personas y ubicación" },
    { key: "ubicacion",       label: "Ubicación",            group: "Personas y ubicación" },
    { key: "lugar",           label: "Lugar específico",     group: "Personas y ubicación" },
    { key: "creada_el",       label: "Creada el",            group: "Fechas y tiempos" },
    { key: "fecha_inicio",    label: "Fecha inicio",         group: "Fechas y tiempos" },
    { key: "fecha_limite",    label: "Fecha límite",         group: "Fechas y tiempos" },
    { key: "tiempo_trabajado",label: "Tiempo trabajado",     group: "Fechas y tiempos" },
    { key: "materiales",      label: "Materiales / partes",      group: "Otros" },
    { key: "hoja_calculo",    label: "Hoja de cálculo",          group: "Otros" },
    { key: "actividad",       label: "Historial de actividad",   group: "Otros" },
  ];

  const ALL_FIELDS_ON = Object.fromEntries(EXPORT_FIELDS.map(f => [f.key, true])) as Record<ExportField, boolean>;
  const ALL_FIELDS_OFF = Object.fromEntries(EXPORT_FIELDS.map(f => [f.key, false])) as Record<ExportField, boolean>;

  const [exportConfigOpen, setExportConfigOpen] = useState(false);
  const [exportFields, setExportFields] = useState<Record<ExportField, boolean>>(ALL_FIELDS_ON);

  // ── PDF export field config ────────────────────────────────────────────────
  // Keep this field set aligned with the mobile generator's PDF_SECTION_FIELDS
  // (pangui-native-stable/hooks/useOrdenExport.ts) so both platforms drive the
  // shared PDF service identically. `fotos_grupos` is web-only (hoja photo
  // groups); everything else mirrors mobile, including `activo`.
  type PdfField =
    | "solicitante" | "hito" | "fechas"
    | "descripcion" | "asignados" | "imagenes" | "fotos_grupos" | "ubicacion" | "activo"
    | "materiales" | "tiempo" | "procedimientos" | "historial" | "firma";

  const PDF_FIELDS: { key: PdfField; label: string; group: string }[] = [
    { key: "solicitante",   label: "Solicitante",       group: "Información general" },
    { key: "hito",          label: "ITO",               group: "Información general" },
    { key: "fechas",        label: "Fechas (inicio/límite)", group: "Información general" },
    { key: "descripcion",   label: "Descripción",       group: "Contenido" },
    { key: "asignados",     label: "Asignados",         group: "Contenido" },
    { key: "imagenes",      label: "Imágenes",          group: "Contenido" },
    { key: "fotos_grupos",  label: "Grupos de fotos",   group: "Contenido" },
    { key: "ubicacion",     label: "Ubicación",         group: "Contenido" },
    { key: "activo",        label: "Activo",            group: "Contenido" },
    { key: "materiales",    label: "Materiales",        group: "Seguimiento" },
    { key: "tiempo",        label: "Tiempo trabajado",  group: "Seguimiento" },
    { key: "procedimientos",label: "Procedimientos",    group: "Seguimiento" },
    { key: "historial",     label: "Historial",         group: "Seguimiento" },
    { key: "firma",         label: "Bloque de firma",   group: "Seguimiento" },
  ];

  const ALL_PDF_ON  = Object.fromEntries(PDF_FIELDS.map(f => [f.key, true]))  as Record<PdfField, boolean>;
  const ALL_PDF_OFF = Object.fromEntries(PDF_FIELDS.map(f => [f.key, false])) as Record<PdfField, boolean>;

  const [pdfConfigOpen, setPdfConfigOpen] = useState(false);
  const [pdfFields, setPdfFields] = useState<Record<PdfField, boolean>>(ALL_PDF_ON);

  // ── Procedimientos state ─────────────────────────────────────────────────────
  const [otProcs, setOtProcs] = useState<OTProcedimiento[]>([]);
  const [loadingProcs, setLoadingProcs] = useState(false);
  // Pending destructive action awaiting confirmation (shared across the tab —
  // procedures, photo groups, individual photos, materials). Guards accidental clicks.
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
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

  // ── Clasificacion ────────────────────────────────────────────────────────────
  const [clasificacion, setClasificacion] = useState(orden.clasificacion ?? null);
  const [changingClasif, setChangingClasif] = useState(false);

  // ── Requiere toggles ─────────────────────────────────────────────────────────
  const [requiereMateriales, setRequiereMateriales] = useState(orden.requiere_materiales ?? false);
  const [requiereHoja, setRequiereHoja] = useState(orden.requiere_hoja ?? false);
  const [requiereFotos, setRequiereFotos] = useState(orden.requiere_fotos ?? false);
  const [togglingMat, setTogglingMat] = useState(false);
  const [togglingHoja, setTogglingHoja] = useState(false);
  const [togglingFotos, setTogglingFotos] = useState(false);
  const [fotosObligatoriasTodas, setFotosObligatoriasTodas] = useState(false);

  // Fetch workspace-level flags once on mount
  const [modoRegistro, setModoRegistro] = useState<"ambos" | "materiales" | "hoja">("ambos");
  const [subOrdenes, setSubOrdenes] = useState<OrdenTrabajo[]>([]);
  const [loadingSubOrdenes, setLoadingSubOrdenes] = useState(false);
  const [creatingSubOrden, setCreatingSubOrden] = useState(false);
  const [newSubOrdenTitle, setNewSubOrdenTitle] = useState("");
  const [parentOrden, setParentOrden] = useState<OrdenTrabajo | null>(null);
  useEffect(() => {
    if (!wsId) return;
    const sb = createClient();
    sb.from("workspaces")
      .select("fotos_obligatorias_todas, modo_registro")
      .eq("id", wsId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.fotos_obligatorias_todas) setFotosObligatoriasTodas(true);
        if (data?.modo_registro) setModoRegistro(data.modo_registro as "ambos" | "materiales" | "hoja");
      });
  }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggleRequiereMateriales() {
    const next = !requiereMateriales;
    setRequiereMateriales(next);
    setTogglingMat(true);
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ requiere_materiales: next }).eq("id", orden.id);
    setTogglingMat(false);
    onOrdenUpdated({ requiere_materiales: next });
  }

  async function handleToggleRequiereHoja() {
    const next = !requiereHoja;
    setRequiereHoja(next);
    setTogglingHoja(true);
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ requiere_hoja: next }).eq("id", orden.id);
    setTogglingHoja(false);
    onOrdenUpdated({ requiere_hoja: next });
  }

  async function handleToggleRequiereFotos() {
    const next = !requiereFotos;
    setRequiereFotos(next);
    setTogglingFotos(true);
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ requiere_fotos: next }).eq("id", orden.id);
    setTogglingFotos(false);
    onOrdenUpdated({ requiere_fotos: next });
  }

  async function handleApproveClasificacion() {
    setChangingClasif(true);
    const sb = createClient();
    await sb.from("ordenes_trabajo").update({ clasificacion: "ejecucion" }).eq("id", orden.id);
    setClasificacion("ejecucion");
    onOrdenUpdated({ clasificacion: "ejecucion" });
    notifyClasificacionCambiada({ workspaceId: wsId, ordenId: orden.id, titulo: orden.titulo ?? "", clasificacion: "ejecucion" });
    setChangingClasif(false);
  }

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
  // Edit / content-management access mirrors the RLS UPDATE policy (owner/admin/member).
  const canManage = esElevado(myRol);
  // Delete is restricted further than edit: the RLS DELETE policy only allows
  // owner/admin, so gate the delete affordance with esAdmin to avoid showing a
  // button that the database will reject.
  const canDelete = esAdmin(myRol);
  const canManageFotos = esAdmin(myRol);
  // Closing an OT with unmet requisitos is an owner/admin escape hatch. This only
  // controls the affordance — the RPC and the photo trigger re-check the role.
  const canForceClose = esAdmin(myRol);
  const canUploadFotos = canManageFotos || (orden.asignados_ids ?? []).includes(myId);
  // Filling in procedure steps mirrors the photo rule: whoever is actually doing
  // the work (the assignees) plus owner/admin. A completed OT is read-only.
  const canFillProcs = orden.estado !== "completado"
    && (esAdmin(myRol) || (orden.asignados_ids ?? []).includes(myId));
  const isActive = orden.estado !== "completado";


  // Sync fotos when orden prop updates (realtime)
  useEffect(() => {
    setFotos([
      ...(orden.imagen_url ? [orden.imagen_url] : []),
      ...(orden.fotos_urls ?? []),
    ]);
  }, [orden.imagen_url, orden.fotos_urls]);

  useEffect(() => { setClasificacion(orden.clasificacion ?? null); }, [orden.clasificacion]);

  const openOrden = useCallback((id: string) => {
    if (onOpenOrden) onOpenOrden(id);
    else router.push(`/ordenes?id=${encodeURIComponent(id)}`);
  }, [onOpenOrden, router]);

  useEffect(() => {
    if (orden.parent_id) {
      setSubOrdenes([]);
      setLoadingSubOrdenes(false);
      fetchOrden(orden.parent_id)
        .then(setParentOrden)
        .catch(() => setParentOrden(null));
      return;
    }

    setParentOrden(null);
    let cancelled = false;
    setLoadingSubOrdenes(true);
    fetchSubOrdenes(orden.id)
      .then((rows) => { if (!cancelled) setSubOrdenes(rows); })
      .catch(() => { if (!cancelled) setSubOrdenes([]); })
      .finally(() => { if (!cancelled) setLoadingSubOrdenes(false); });

    // Skipped while the tab is hidden: this panel stays open all day in an ops
    // tool, and polling a backgrounded tab spends egress for nothing. The next
    // tick after the user comes back catches up.
    //
    // Sub-OTs are only created from this panel, by this user — `handleCreateSubOrden`
    // refetches on its own. The poll exists to catch a colleague adding one, so
    // 30s is far tighter than it needs to be; 2 minutes is still well inside
    // "I didn't notice a delay" for an event that is already rare.
    const pollId = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const rows = await fetchSubOrdenes(orden.id);
        if (!cancelled) setSubOrdenes(rows);
      } catch {
        // ignore transient errors
      }
    }, 120_000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [orden.id, orden.parent_id]);

  async function handleCreateSubOrden() {
    const title = newSubOrdenTitle.trim();
    if (!title || orden.parent_id) return;
    setCreatingSubOrden(true);
    try {
      const sub = await createSubOrden(orden.id, title, orden);
      setSubOrdenes(prev => [...prev, sub]);
      setNewSubOrdenTitle("");
      openOrden(sub.id);
    } catch (e: any) {
      alert(e?.message ?? "No se pudo crear la sub-OT.");
    } finally {
      setCreatingSubOrden(false);
    }
  }

  // Fetch the most recent pausado row whenever the OT is in espera. Cheap
  // single-row query, runs once per estado change. We don't poll — the next
  // pausa will trigger a refresh when the user pauses/resumes locally.
  useEffect(() => {
    if (orden.estado !== "en_espera") { setLatestPause(null); return; }
    let cancelled = false;
    const sb = createClient();
    sb.from("actividad_ot")
      .select("comentario, created_at")
      .eq("orden_id", orden.id)
      .eq("tipo", "pausado")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setLatestPause(data ?? null); });
    return () => { cancelled = true; };
  }, [orden.id, orden.estado, orden.pausado_at]);

  // Load activity immediately so its dashboard count and timeline are ready
  // before the user opens the section. Poll only while it is visible.
  useEffect(() => {
    setLoadingAct(true);
    fetchActividad(orden.id)
      .then(setActividad)
      .catch(() => {})
      .finally(() => setLoadingAct(false));

    if (tab !== "actividad") return;

    const pollId = setInterval(async () => {
      try {
        const fresh = await fetchActividad(orden.id);
        setActividad(fresh);
      } catch {
        // ignore transient errors
      }
    }, 30_000);

    return () => clearInterval(pollId);
  }, [tab, orden.id]);


  // Load attached procedures immediately so counts and content do not wait for
  // the first click on the section.
  useEffect(() => {
    if (otProcs.length === 0) {
      setLoadingProcs(true);
      getOTProcedimientos(orden.id)
        .then(data => { setOtProcs(data); setLoadingProcs(false); })
        .catch(() => setLoadingProcs(false));
    }
  }, [orden.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El botón flotante solo tiene sentido si la sección está fuera de pantalla.
  useEffect(() => {
    const el = procSectionRef.current;
    const root = detalleScrollRef.current;
    if (tab !== "detalle" || !el || !root || otProcs.length === 0) {
      setProcFueraDeVista(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setProcFueraDeVista(!entry.isIntersecting),
      { root, threshold: 0.08 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, otProcs.length, loadingProcs]);

  // Poll procedimientos every 60s while Detalles is open
  useEffect(() => {
    if (tab !== "detalle") return;

    const pollId = setInterval(async () => {
      try {
        const updated = await getOTProcedimientos(orden.id);
        setOtProcs(updated);
      } catch {
        // ignore transient errors
      }
    }, 60_000);

    return () => clearInterval(pollId);
  }, [tab, orden.id]);

  /**
   * Ensures the given attached procedure has an ejecución, creating one on first
   * write. Mirrors mobile, which starts the ejecución when the screen opens —
   * here the first edit is the trigger, so merely viewing a procedure doesn't
   * mark it as started.
   */
  async function ensureEjecucion(otProc: OTProcedimiento): Promise<ProcedimientoEjecucion | null> {
    if (otProc.ejecucion) return otProc.ejecucion;
    if (!myId) return null;
    const ejec = await startEjecucion(otProc.procedimiento_id, orden.id, myId);
    setOtProcs(prev => prev.map(otp =>
      otp.procedimiento_id === otProc.procedimiento_id ? { ...otp, ejecucion: ejec } : otp,
    ));
    return ejec;
  }

  /**
   * Saves one step's answer. `ejecucionId` is explicit so this serves both the
   * modal and the inline card editor; `pasos` is the owning procedure's step
   * list, needed to resolve genera_correctiva.
   */
  async function saveRespForEjecucion(
    ejecucionId: string,
    pasos: ProcedimientoPaso[],
    pasoId: string,
    extra?: PendingResp,
  ) {
    if (!myId) return;
    const resp = { ...(pendingResps[pasoId] ?? {}), ...(extra ?? {}) };
    setSavingResp(pasoId);
    showSaveToast("saving");
    try {
      const saved = await saveRespuesta(ejecucionId, pasoId, myId, {
        aprobado:         resp.aprobado ?? null,
        valor_medido:     resp.valor_medido ?? null,
        valor_texto:      resp.valor_texto ?? null,
        valor_json:       resp.valor_json ?? null,
        foto_url:         resp.foto_url ?? null,
        firma_svg:        resp.firma_svg ?? null,
        firmado_nombre:   resp.firmado_nombre ?? null,
        firmado_por_id:   resp.firmado_por_id ?? undefined,
        // Explicit null must survive: it is how a cleared signature is recorded.
        // `?? undefined` would drop the key and leave the old timestamp behind.
        // Explicit null must survive: it is how a cleared signature wipes the
        // timestamp. `?? undefined` would drop the key and keep the old value.
        firmado_at:         resp.firmado_at === null ? null : (resp.firmado_at ?? undefined),
        notas:              resp.notas ?? null,
        valor_fecha:        resp.valor_fecha ?? null,
        archivo_url:        resp.archivo_url ?? null,
        archivo_nombre:     resp.archivo_nombre ?? null,
        archivo_mime:       resp.archivo_mime ?? null,
        lectura_anterior:   resp.lectura_anterior ?? null,
        lectura_delta:      resp.lectura_delta ?? null,
        geo_lat:            resp.geo_lat ?? null,
        geo_lng:            resp.geo_lng ?? null,
        device_id:          resp.device_id ?? null,
        revision_paso:      resp.revision_paso ?? null,
      });
      const mergeResp = (existing: typeof saved[]) => {
        const idx = existing.findIndex(r => r.paso_id === pasoId);
        return idx >= 0
          ? existing.map((r, i) => i === idx ? saved : r)
          : [...existing, saved];
      };

      // Merge the saved response back into the ejecucion's respuestas
      setActiveEjec(prev => {
        if (!prev || prev.ejecucion.id !== ejecucionId) return prev;
        return { ...prev, ejecucion: { ...prev.ejecucion, respuestas: mergeResp(prev.ejecucion.respuestas ?? []) } };
      });
      // The inline card reads from otProcs, so it needs the same merge to show
      // the new answer without a refetch.
      setOtProcs(prev => prev.map(otp =>
        otp.ejecucion?.id === ejecucionId
          ? { ...otp, ejecucion: { ...otp.ejecucion, respuestas: mergeResp(otp.ejecucion.respuestas ?? []) } }
          : otp,
      ));

      // If this paso auto-creates a corrective sub-OT on fail, fire the RPC.
      // Idempotent — server skips when already triggered.
      const paso = pasos.find((p: ProcedimientoPaso) => p.id === pasoId);
      if (paso?.genera_correctiva) {
        maybeTriggerCorrectiva({
          respuestaId: saved.id,
          paso,
          answer: { ...resp, firmado_por_id: resp.firmado_por_id ?? undefined } as any,
        }).catch(() => {
          // Best-effort: corrective failure shouldn't block the user.
        });
      }
      showSaveToast("saved");
    } catch (e: any) {
      // The toast reports the failure — an alert() per keystroke-blur would be
      // unbearable now that saving is automatic.
      showSaveToast("error");
      console.error("[procedimiento] no se pudo guardar la respuesta", e);
    } finally {
      setSavingResp(null);
    }
  }

  function handleSaveResp(pasoId: string, extra?: PendingResp) {
    if (!activeEjec) return;
    return saveRespForEjecucion(
      activeEjec.ejecucion.id,
      (activeEjec.pasos?.pasos ?? []) as ProcedimientoPaso[],
      pasoId,
      extra,
    );
  }

  /** Inline card editing: create the ejecución on demand, then save the answer. */
  async function handleInlineSaveResp(otProc: OTProcedimiento, pasoId: string, extra?: PendingResp) {
    try {
      const ejec = await ensureEjecucion(otProc);
      if (!ejec) return;
      await saveRespForEjecucion(
        ejec.id,
        (otProc.procedimiento?.pasos ?? []) as ProcedimientoPaso[],
        pasoId,
        extra,
      );
    } catch (e: any) {
      alert(e.message);
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

  // Eagerly load materials for the summary and section.
  useEffect(() => {
    if (ordenPartes.length > 0) return;
    const sb = createClient();
    sb.from("orden_partes")
      .select("id, parte_id, cantidad, cantidad_utilizada, parte:partes!parte_id(nombre, unidad, stock_actual)")
      .eq("orden_id", orden.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!data?.length) return;
        const normalized = (data ?? []).map((row: any) => ({
          ...row,
          parte: Array.isArray(row.parte) ? (row.parte[0] ?? null) : row.parte,
        }));
        setOrdenPartes(normalized as OrdenParte[]);
      });
  }, [orden.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load photo groups immediately for the summary and gallery.
  useEffect(() => {
    if (gruposLoaded) return;
    setLoadingGrupos(true);
    fetchFotoGrupos(orden.id)
      .then(data => { setFotoGrupos(data); setGruposLoaded(true); })
      .finally(() => setLoadingGrupos(false));
  }, [orden.id, gruposLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // The gallery owns the create-album form (title/description/type), so the
  // values arrive as arguments instead of being read from component state.
  async function handleCreateGrupoWith(titulo: string, descripcion: string, tipo: "referencia" | "evidencia") {
    if (!titulo.trim() || !wsId) return;
    setCreatingGrupo(true);
    try {
      const grupo = await createFotoGrupo(orden.id, wsId, myId, titulo.trim(), descripcion.trim(), fotoGrupos.length, tipo);
      setFotoGrupos(prev => [...prev, { ...grupo, items: [] }]);
    } finally {
      setCreatingGrupo(false);
    }
  }

  async function handleDeleteGrupo(grupoId: string) {
    await deleteFotoGrupo(grupoId);
    setFotoGrupos(prev => prev.filter(g => g.id !== grupoId));
  }

  async function handleToggleGrupoLocked(grupoId: string, locked: boolean) {
    setFotoGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, locked } : g));
    try {
      await toggleFotoGrupoLocked(grupoId, locked);
    } catch {
      setFotoGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, locked: !locked } : g));
    }
  }

  async function handleSaveGrupoEdit(grupoId: string, titulo: string, descripcion: string) {
    await updateFotoGrupo(grupoId, { titulo, descripcion });
    setFotoGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, titulo, descripcion } : g));
    setEditingGrupoId(null);
  }

  async function handleChangeGrupoTipo(grupoId: string, tipo: "referencia" | "evidencia") {
    setFotoGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, tipo } : g));
    try {
      await updateFotoGrupo(grupoId, { tipo });
    } catch {
      setFotoGrupos(prev => prev.map(g => g.id === grupoId ? { ...g, tipo: tipo === "referencia" ? "evidencia" : "referencia" } : g));
    }
  }

  async function handleUploadToGrupo(grupoId: string, file: File) {
    setUploadingGrupoId(grupoId);
    try {
      const item = await uploadAndAddFotoToGrupo(
        orden.id,
        grupoId,
        file,
        fotoGrupos.find(g => g.id === grupoId)?.items?.length ?? 0,
      );
      setFotoGrupos(prev => prev.map(g =>
        g.id === grupoId ? { ...g, items: [...(g.items ?? []), item] } : g
      ));
    } finally {
      setUploadingGrupoId(null);
    }
  }

  async function handleRemoveFromGrupo(grupoId: string, itemId: string, url: string) {
    await removeFotoFromGrupo(itemId, url);
    setFotoGrupos(prev => prev.map(g =>
      g.id === grupoId ? { ...g, items: (g.items ?? []).filter(i => i.id !== itemId) } : g
    ));
  }

  // Bulk delete from the gallery's marquee/Ctrl+A selection. Deletions run
  // sequentially (each is its own row + R2 object) and the local state is
  // updated once at the end so the grid doesn't reflow per photo.
  async function handleRemoveManyFromGrupos(items: { grupoId: string; itemId: string; url: string }[]) {
    const removed: { grupoId: string; itemId: string }[] = [];
    for (const it of items) {
      try {
        await removeFotoFromGrupo(it.itemId, it.url);
        removed.push({ grupoId: it.grupoId, itemId: it.itemId });
      } catch {
        // Keep going: one failure shouldn't strand the rest of the batch.
      }
    }
    if (removed.length === 0) return;
    setFotoGrupos(prev => prev.map(g => {
      const ids = new Set(removed.filter(r => r.grupoId === g.id).map(r => r.itemId));
      return ids.size === 0 ? g : { ...g, items: (g.items ?? []).filter(i => !ids.has(i.id)) };
    }));
  }

  // Load orden_partes when tab opens
  const reloadOrdenPartes = useCallback(() => {
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
  }, [orden.id]);

  useEffect(() => {
    if (tab !== "materiales") return;
    reloadOrdenPartes();
  }, [tab, reloadOrdenPartes]);

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

    if (error || !data) {
      alert(error?.message ?? "No se pudo agregar el material.");
      setAddingParte(false);
      return;
    }
    setOrdenPartes(prev => [...prev, { ...(data as any), parte }]);
    setCatalogSearch("");
    // Deduct stock atomically in the DB (avoids the lost-update race between
    // concurrent web/mobile edits). Use the returned value as the source of truth.
    const { data: stockNuevo, error: stockErr } = await sb.rpc("ajustar_stock_parte", {
      p_parte_id: parte.id,
      p_delta: -cantidad,
    });
    if (stockErr) {
      alert("El material se agregó, pero no se pudo descontar el stock: " + stockErr.message);
    } else if (stockNuevo !== null && stockNuevo !== undefined) {
      setCatalogo(prev => prev.map(p => p.id === parte.id ? { ...p, stock_actual: stockNuevo as number } : p));
    }
    setAddingParte(false);
  }

  async function handleUpdateCantidad(id: string, newCantidad: number) {
    if (newCantidad <= 0) return;
    const prev = ordenPartes.find(op => op.id === id);
    if (!prev) return;
    const diff = newCantidad - prev.cantidad;
    const sb = createClient();
    const { error: cantErr } = await sb.from("orden_partes").update({ cantidad: newCantidad }).eq("id", id);
    if (cantErr) {
      alert("No se pudo actualizar la cantidad: " + cantErr.message);
      return;
    }
    setOrdenPartes(p => p.map(op => op.id === id ? { ...op, cantidad: newCantidad } : op));
    // Adjust stock atomically by the difference (more consumed => stock down).
    if (prev.parte_id && diff !== 0) {
      const { data: stockNuevo, error: stockErr } = await sb.rpc("ajustar_stock_parte", {
        p_parte_id: prev.parte_id,
        p_delta: -diff,
      });
      if (stockErr) {
        alert("La cantidad se actualizó, pero no se pudo ajustar el stock: " + stockErr.message);
      } else if (stockNuevo !== null && stockNuevo !== undefined) {
        setCatalogo(p => p.map(c => c.id === prev.parte_id ? { ...c, stock_actual: stockNuevo as number } : c));
      }
    }
  }

  async function handleDeleteParte(id: string) {
    setDeletingParteId(id);
    const op = ordenPartes.find(p => p.id === id);
    const sb = createClient();
    const { error: delErr } = await sb.from("orden_partes").delete().eq("id", id);
    if (delErr) {
      alert("No se pudo eliminar el material: " + delErr.message);
      setDeletingParteId(null);
      return;
    }
    setOrdenPartes(prev => prev.filter(p => p.id !== id));
    // Restore stock atomically (the consumed quantity goes back to inventory).
    if (op?.parte_id) {
      const { data: stockNuevo, error: stockErr } = await sb.rpc("ajustar_stock_parte", {
        p_parte_id: op.parte_id,
        p_delta: op.cantidad,
      });
      if (stockErr) {
        alert("El material se eliminó, pero no se pudo restaurar el stock: " + stockErr.message);
      } else if (stockNuevo !== null && stockNuevo !== undefined) {
        setCatalogo(prev => prev.map(c => c.id === op.parte_id ? { ...c, stock_actual: stockNuevo as number } : c));
      }
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

  /**
   * Mirrors the server's close-gate so the UI can explain what is missing before
   * the OT is sent, instead of surfacing a raw RPC error. Returns every unmet
   * requisito rather than the first one, so an admin deciding whether to force
   * the close sees the full picture in one pass.
   *
   * This is an explanation, not the enforcement. The gates that matter live in
   * transition_work_order_v1 and the enforce_ot_photo_completion trigger.
   */
  const checkCompletionRequirements = async (): Promise<string[]> => {
    const missing: string[] = [];

    // Blocking procedures. The server treats bloquea_inicio as close-blocking
    // too, so an OT that was force-started can't be quietly closed around it.
    const pendingProcs = otProcs.filter(otp =>
      (otp.procedimiento?.bloquea_cierre_ot || otp.procedimiento?.bloquea_inicio) &&
      otp.ejecucion?.estado !== "completado",
    );
    for (const otp of pendingProcs) {
      missing.push(`Procedimiento obligatorio sin completar: ${otp.procedimiento?.nombre ?? "sin nombre"}.`);
    }

    // If the workspace currently disables a module via modo_registro, don't
    // enforce its close-gate even if the OT row still has the flag set
    // (the OT may pre-date the workspace mode change).
    if (requiereMateriales && modoRegistro !== "hoja" && ordenPartes.length === 0) {
      missing.push("Esta OT requiere al menos un material registrado. Ve a la pestaña Materiales y agrega los materiales utilizados.");
    }
    if (requiereHoja && modoRegistro !== "materiales") {
      missing.push("Esta OT requiere que completes la hoja de cálculo. Ve a la pestaña Hoja de cálculo.");
    }
    if (requiereFotos || fotosObligatoriasTodas) {
      // Always verify fresh server data. Local or stale UI state must never
      // satisfy a mandatory-photo close gate.
      let currentGrupos: FotoGrupo[];
      try {
        currentGrupos = await fetchFotoGrupos(orden.id);
        setFotoGrupos(currentGrupos);
        setGruposLoaded(true);
      } catch {
        missing.push("No se pudieron verificar las fotos. Revisa tu conexión e inténtalo nuevamente antes de cerrar la OT.");
        return missing;
      }
      const hasAnyFoto = fotos.length > 0 || currentGrupos.some(g => g.tipo === "evidencia" && (g.items?.length ?? 0) > 0);
      if (!hasAnyFoto) {
        missing.push("Esta OT requiere al menos una foto de evidencia. Ve a la pestaña Fotos y sube las fotos del trabajo.");
      }
    }
    return missing;
  };

  /**
   * Single entry point for every close. Runs the requisitos check first: if the
   * OT is clear, `close` runs immediately; if not, the gate dialog explains what
   * is missing and — for owner/admin only — offers to replay `close` with a
   * justified override.
   */
  const closeWithRequirements = async (close: (forceClose?: ForceClose) => Promise<void>) => {
    const missing = await checkCompletionRequirements();
    if (missing.length === 0) {
      await close();
      return;
    }
    setGateReason("");
    setGate({ missing, resume: close });
  };

  const confirmForceClose = async () => {
    const reason = gateReason.trim();
    if (!gate || !canForceClose || !reason) return;
    setGateBusy(true);
    try {
      await gate.resume({ reason });
      setGate(null);
      setGateReason("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo forzar el cierre de la OT.");
    } finally {
      setGateBusy(false);
    }
  };

  const changeStatus = async (
    newEstado: Estado,
    forceClose?: ForceClose,
    // The gate dialog reports failures itself, so it needs the error rather than
    // an alert() fired from in here.
    rethrow = false,
  ): Promise<boolean> => {
    try {
      await updateOrdenEstado(orden.id, newEstado, myId, wsId && orden.titulo ? {
        titulo: orden.titulo,
        workspaceId: wsId,
        asignadosIds: orden.asignados_ids ?? [],
      } : undefined, forceClose);
      onOrdenUpdated({ estado: newEstado });
      return true;
    } catch (err) {
      if (rethrow) throw err;
      alert(err instanceof Error ? err.message : "No se pudo cambiar el estado de la OT.");
      return false;
    }
  };

  const changePrioridad = async (p: Prioridad) => {
    await updateOrdenPrioridad(orden.id, p, myId);
    onOrdenUpdated({ prioridad: p });
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!text && !pendingAudio) return;
    setSending(true);
    try {
      let audioUrl: string | null = null;
      if (pendingAudio) {
        // Upload blob to R2 via presigned URL
        const { data: { session } } = await createClient().auth.getSession();
        const token = session?.access_token;
        const presignRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/r2-presign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ ext: "m4a", folder: `ordenes/${orden.id}/actividad` }),
        });
        if (presignRes.ok) {
          const { uploadUrl, publicUrl } = await presignRes.json();
          await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "audio/mp4" }, body: pendingAudio.blob });
          audioUrl = publicUrl;
        }
        URL.revokeObjectURL(pendingAudio.url);
        setPendingAudio(null);
      }
      await addComentario(orden.id, myId, text, audioUrl);
      setCommentText("");
      if (tab !== "actividad") setTab("actividad");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar el comentario.";
      alert(message);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
      recordingChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setPendingAudio({ blob, url });
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordingElapsed(0);
      recordingIntervalRef.current = setInterval(() => setRecordingElapsed(e => e + 1), 1000);
    } catch {
      alert("No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  function fmtRecDuration(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

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

  async function fetchWorkspaceInfo(): Promise<{ nombre: string; logoUrl: string | null }> {
    try {
      const sb = createClient();
      const { data } = await sb.from("workspaces").select("nombre, logo_url").eq("id", wsId).maybeSingle();
      return { nombre: (data as any)?.nombre ?? "Pangui", logoUrl: (data as any)?.logo_url ?? null };
    } catch { return { nombre: "Pangui", logoUrl: null }; }
  }

  const exporterName = () => {
    const u = usuarios.find(u => u.id === myId);
    return u?.nombre ?? "Usuario";
  };

  const meta = parseDescMeta(orden.descripcion ?? null);
  const nOT  = meta.nOT ?? `OT-${orden.id.slice(-8).toUpperCase()}`;

  function handleExportPDF() {
    setExportMenuOpen(false);
    setPdfConfigOpen(true);
  }

  async function doExportPDF(includeSubOrdenes = false) {
    setExporting("pdf");
    setPdfConfigOpen(false);
    try {
      const mapFotoGruposForPdf = (groups: FotoGrupo[]) => groups.map((g) => ({
        ...g,
        foto_grupo_items: [...(g.items ?? [])].sort((a, b) => a.orden_display - b.orden_display),
      }));
      const loadFotoGruposForPdf = async (ordenId: string) => (
        pdfFields.fotos_grupos ? mapFotoGruposForPdf(await fetchFotoGrupos(ordenId)) : []
      );

      const shouldIncludeSubOrdenes = includeSubOrdenes && !orden.parent_id;
      const [act, wsInfo, freshProcs, hojaGrupos, freshSubOrdenes] = await Promise.all([
        fetchActividadForExport(),
        fetchWorkspaceInfo(),
        getOTProcedimientos(orden.id),
        loadFotoGruposForPdf(orden.id),
        shouldIncludeSubOrdenes ? fetchSubOrdenes(orden.id) : Promise.resolve([]),
      ]);
      const enrichedSubOrdenes = await Promise.all(
        freshSubOrdenes.map(async (sub) => {
          const [subProcedimientos, subFotoGrupos] = await Promise.all([
            pdfFields.procedimientos ? getOTProcedimientos(sub.id) : Promise.resolve([]),
            loadFotoGruposForPdf(sub.id),
          ]);
          return {
            ...sub,
            procedimientos: subProcedimientos,
            fotoGrupos: subFotoGrupos,
          };
        }),
      );
      // Keep this payload in lockstep with the mobile generator
      // (pangui-native-stable/lib/generate-orden-pdf.ts) so the shared PDF
      // service at pdf.getpangui.com renders an identical document on both
      // platforms. Same keys, same shapes; fields web has no equivalent for are
      // sent as null (the template ignores unknown/null keys by contract).
      const parentActivo = (orden as any).activos ?? null;
      const activosCatalog: any[] = [];
      {
        const seen: Record<string, true> = {};
        if (parentActivo?.id) { activosCatalog.push(parentActivo); seen[parentActivo.id] = true; }
        for (const sub of (shouldIncludeSubOrdenes ? enrichedSubOrdenes : [])) {
          const sa = (sub as any).activos;
          if (sa?.id && !seen[sa.id]) { activosCatalog.push(sa); seen[sa.id] = true; }
        }
      }
      const res = await fetch("/api/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orden,
          activo: parentActivo,
          activos: activosCatalog,
          actividad: act, usuarios,
          exportadoPor: exporterName(),
          workspaceNombre: wsInfo.nombre,
          nOT: meta.nOT,
          subOrdenes: shouldIncludeSubOrdenes ? enrichedSubOrdenes : [],
          // Send the same price-stripped partes shape mobile sends, so the PDF
          // service renders the materials block identically. Gated by the
          // materiales toggle.
          partes: pdfFields.materiales
            ? ordenPartes.map(op => ({
                ...op,
                parte: op.parte ? { ...op.parte, precio_unitario: undefined } : op.parte,
              }))
            : [],
          procedimientos: freshProcs,
          fotoGrupos: hojaGrupos,
          fields: pdfFields,
          // Mode-aware extras — flat block, same as mobile. Web has no
          // workspace-mode / client-signature concept yet, so those are null.
          workspaceMode: undefined,
          workspaceBrand: { logo_url: wsInfo.logoUrl, nombre: wsInfo.nombre },
          sociedad: (orden as any).sociedad ?? null,
          pdfMode: "single",
          historyRows: undefined,
          kpis: undefined,
          clientSignature: null,
          // Back-compat: keep the flat logoUrl the previous payload sent.
          logoUrl: wsInfo.logoUrl,
        }),
      });
      if (!res.ok) throw new Error(`PDF service error ${res.status}`);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      a.href = url;
      a.download = `OT-${nOT}_${stamp}.pdf`;
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
      if (f.solicitante)     resCols.push({ header: "Solicitante",      value: orden.solicitante ?? meta.solicitante ?? "—", width: 22 });
      if (f.solicitante)     resCols.push({ header: "Tel. solicitante",  value: orden.solicitante_telefono ?? "—", width: 16 });
      if (f.solicitante)     resCols.push({ header: "Email solicitante", value: orden.solicitante_email ?? "—",    width: 24 });
      if (f.hito)            resCols.push({ header: "ITO",              value: meta.hito ?? "—",                  width: 18 });
      if (f.descripcion)     resCols.push({ header: "Descripción",      value: meta.descripcion ?? "—",           width: 44 });
      if (f.asignados)       resCols.push({ header: "Asignados",        value: asignadosNames || "—",             width: 28 });
      if (f.empresa)         resCols.push({ header: "Empresa",          value: (orden as any).sociedad?.nombre ?? "—", width: 20 });
      if (f.ubicacion)       resCols.push({ header: "Ubicación",        value: orden.ubicaciones ? [orden.ubicaciones.edificio, orden.ubicaciones.detalle].filter(Boolean).join(" · ") : "—", width: 26 });
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

      // ── Sheet 3: Hoja de cálculo ────────────────────────────────────────────
      if (f.hoja_calculo) {
        const sb = createClient();
        const { data: hojas } = await sb
          .from("hojas_inventario")
          .select("id, nombre, columnas")
          .eq("orden_id", orden.id)
          .order("created_at");

        const hojaIds = (hojas ?? []).map((h: any) => h.id);
        const { data: filas } = hojaIds.length > 0
          ? await sb.from("hojas_inventario_filas").select("hoja_id, celdas, orden").in("hoja_id", hojaIds).order("orden")
          : { data: [] };

        for (const hoja of (hojas ?? []) as any[]) {
          const cols: { id: string; label: string }[] = hoja.columnas ?? [];
          const hojaFilas = ((filas ?? []) as any[]).filter(row => row.hoja_id === hoja.id);
          const headers = cols.map((c: any) => c.label);
          const rows = hojaFilas.map((fila: any) =>
            cols.map((c: any) => fila.celdas?.[c.id] ?? "")
          );
          const wsH = XLS.utils.aoa_to_sheet([headers, ...rows]);
          applyStyles(wsH, headers, rows.length, cols.map(() => 22));
          XLS.utils.book_append_sheet(wb, wsH, hoja.nombre.slice(0, 31));
        }
      }

      // ── Sheet 4: Actividad ───────────────────────────────────────────────────
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
      `Solicitante:     ${orden.solicitante ?? meta.solicitante ?? "—"}`,
      `Tel. solicitante:${orden.solicitante_telefono ?? "—"}`,
      `Email solic.:    ${orden.solicitante_email ?? "—"}`,
      `ITO:             ${meta.hito ?? "—"}`,
      ``,
      `Asignados:       ${asignadosNames || "—"}`,
      `Empresa:         ${(orden as any).sociedad?.nombre ?? "—"}`,
      `Ubicación:       ${orden.ubicaciones ? [orden.ubicaciones.edificio, orden.ubicaciones.detalle].filter(Boolean).join(" · ") : "—"}`,
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
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo iniciar la OT.");
    } finally {
      setTimerBusy(false);
    }
  };

  const closePause = () => {
    if (timerBusy) return;
    setPauseOpen(false);
    setPauseReason(null);
    setPauseComment("");
    setPauseDate("");
  };

  const confirmPause = async () => {
    if (!pauseReason) return;
    const trimmed = pauseComment.trim();
    if ((pauseReason === "acceso" || pauseReason === "otro") && !trimmed) return;
    if (pauseReason === "reprogramar" && !pauseDate) return;

    const comment = pauseReason === "materiales"
      ? "Faltan materiales"
      : pauseReason === "reprogramar"
        ? `Reprogramar: ${pauseDate}${trimmed ? ` - ${trimmed}` : ""}`
        : trimmed;

    setTimerBusy(true);
    try {
      if (pauseReason === "reprogramar") {
        await updateOrden(orden.id, myId, { fecha_inicio: pauseDate, fecha_termino: pauseDate });
        onOrdenUpdated({ fecha_inicio: pauseDate, fecha_termino: pauseDate });
      }
      if (pauseReason === "materiales") {
        const hoja = await createHoja(wsId, "materiales_solicitados", myId, orden.id);
        setPendingMaterialRequestSheetId(hoja.id);
        setPauseOpen(false);
        setPauseReason(null);
        setPauseComment("");
        setPauseDate("");
        setTab("hoja");
        return;
      }
      await pausarOrden(orden.id, myId, comment, elapsed);
      onOrdenUpdated({
        en_ejecucion: false,
        pausado_at: new Date().toISOString(),
        tiempo_total_segundos: elapsed,
        estado: "en_espera",
      });
      setPauseOpen(false);
      setPauseReason(null);
      setPauseComment("");
      setPauseDate("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo pausar la OT.");
    } finally {
      setTimerBusy(false);
    }
  };

  const handleSheetContentSaved = useCallback(async (hoja: { id: string }) => {
    if (hoja.id !== pendingMaterialRequestSheetId || materialRequestPauseBusyRef.current) return;
    materialRequestPauseBusyRef.current = true;
    try {
      await pausarOrden(orden.id, myId, "Faltan materiales", elapsed);
      onOrdenUpdated({ en_ejecucion: false, pausado_at: new Date().toISOString(), tiempo_total_segundos: elapsed, estado: "en_espera" });
      notifySolicitudMateriales({ workspaceId: wsId, ordenId: orden.id, titulo: orden.titulo ?? `OT ${orden.numero ?? orden.id}` });
      setPendingMaterialRequestSheetId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo registrar la solicitud de materiales.");
    } finally {
      materialRequestPauseBusyRef.current = false;
    }
  }, [elapsed, myId, onOrdenUpdated, orden.id, orden.numero, orden.titulo, pendingMaterialRequestSheetId, wsId]);

  const handleReanudar = async () => {
    setTimerBusy(true);
    try {
      await reanudarOrden(orden.id, myId);
      onOrdenUpdated({ en_ejecucion: true, pausado_at: null, iniciado_at: new Date().toISOString(), estado: "en_curso" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo reanudar la OT.");
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
        const comment = timerComment || undefined;
        await closeWithRequirements(async (forceClose) => {
          await completarOrden(orden.id, myId, comment, elapsed, wsId && orden.titulo ? {
            titulo: orden.titulo,
            workspaceId: wsId,
            asignadosIds: orden.asignados_ids ?? [],
          } : undefined, forceClose);
          analytics.otCompleted({
            ot_id: orden.id,
            workspace_id: wsId ?? "",
            tiempo_total_segundos: elapsed,
          });
          onOrdenUpdated({
            en_ejecucion: false,
            tiempo_total_segundos: elapsed,
            estado: "completado",
          });
        });
      }
      setTimerAction(null);
      setTimerComment("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo completar la acción.");
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

  const handleAdjuntosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (selected.length === 0 || uploadingAdjuntos) return;

    const oversized = selected.find(file => file.size > 20 * 1024 * 1024);
    if (oversized) {
      alert(`“${oversized.name}” supera el tamaño máximo de 20 MB.`);
      return;
    }

    setUploadingAdjuntos(true);
    try {
      const uploaded = [] as NonNullable<OrdenTrabajo["links"]>;
      for (const file of selected) {
        const url = await uploadToR2(file, `ordenes/${orden.id}/documentos`);
        uploaded.push({
          url,
          nombre: file.name,
          label: file.name,
          tipo: "archivo",
          origen: "ejecucion",
        });
      }

      const links = [...(Array.isArray(orden.links) ? orden.links : []), ...uploaded];
      const sb = createClient();
      const { error } = await sb.from("ordenes_trabajo").update({ links }).eq("id", orden.id);
      if (error) throw error;
      onOrdenUpdated({ links });
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudieron subir los archivos.");
    } finally {
      setUploadingAdjuntos(false);
    }
  };

  const handleAdjuntoDownload = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.download = name;
      anchor.click();
    }
  };

  // ── Lightbox keyboard navigation (Esc to close, arrows to navigate)
  useEffect(() => {
    if (lightboxGrupo === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  setLightboxGrupo(g => g && { ...g, idx: Math.max(0, g.idx - 1) });
      if (e.key === "ArrowRight") setLightboxGrupo(g => g && { ...g, idx: Math.min(g.urls.length - 1, g.idx + 1) });
      if (e.key === "Escape")     setLightboxGrupo(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxGrupo]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const ESTADO_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
    pendiente:   { bg: "var(--st-open-bg)", color: "var(--brand-fg)", dot: "var(--st-open-dot)" },
    en_espera:   { bg: "var(--st-wait-bg)", color: "var(--pr-high)", dot: "var(--st-wait-dot)" },
    en_curso:    { bg: "var(--st-progress-bg)", color: "var(--success)", dot: "var(--st-progress-dot)" },
    completado:  { bg: "var(--st-progress-bg)", color: "var(--success)", dot: "var(--st-done-dot)" },
  };
  const PRIO_COLOR: Record<string, string> = {
    ninguna: "var(--pr-low)", baja: "var(--pr-low)", media: "var(--pr-medium)", alta: "var(--pr-high)", urgente: "var(--danger)",
  };
  const estadoStyle = ESTADO_STYLE[orden.estado] ?? ESTADO_STYLE.pendiente;
  const prioColor   = PRIO_COLOR[orden.prioridad] ?? "var(--pr-low)";
  const prioLabel   = PRIORIDADES.find(p => p.value === orden.prioridad)?.label ?? "Sin prioridad";
  const prioIcon    = PRIO_ICON[orden.prioridad] ?? Minus;
  const prioSolid   = PRIO_COLOR_SOLID[orden.prioridad] ?? "var(--fg-3)";
  const totalFotos = fotoGrupos.length > 0
    ? fotoGrupos.reduce((total, grupo) => total + (grupo.items?.length ?? 0), 0)
    : fotos.length;
  const completedProcedures = otProcs.filter((otp) => otp.ejecucion?.estado === "completado").length;
  // Procedimiento visible en Detalles (null = el primero).
  const [procVisibleId, setProcVisibleId] = useState<string | null>(null);
  // Salto rápido a Procedimientos: en una OT larga la sección queda muy abajo.
  const detalleScrollRef = useRef<HTMLDivElement | null>(null);
  const procSectionRef = useRef<HTMLDivElement | null>(null);
  const [procFueraDeVista, setProcFueraDeVista] = useState(false);
  // UUID → nombre, para atribuir cada respuesta de procedimiento.
  const nombrePorUsuario = useMemo(
    () => new Map(usuarios.map(u => [u.id, u.nombre])),
    [usuarios],
  );
  const dashboardNav = ([
    { tab: "detalle", label: "Detalles", value: "Ver", caption: "información de la OT", icon: <Info size={19} />, color: "var(--brand-fg)", tint: "var(--brand-tint)" },
    { tab: "actividad", label: "Actividad", value: String(actividad.length), caption: "eventos", icon: <CircleDot size={19} />, color: "var(--brand-fg)", tint: "var(--brand-tint)" },
    { tab: "fotos", label: "Fotos", value: String(totalFotos), caption: "fotos", icon: <Camera size={19} />, color: "var(--brand-fg)", tint: "var(--brand-tint)" },
    { tab: "materiales", label: "Materiales", value: String(ordenPartes.length), caption: "ítems usados", icon: <Package size={19} />, color: "var(--fg-2)", tint: "var(--surface-hover)" },
    { tab: "hoja", label: "Hoja de cálculo", value: "Abrir", caption: "registros", icon: <Sheet size={19} />, color: "var(--success)", tint: "var(--success-bg)" },
  ] as Array<{
    tab: Tab | null; label: string; value: string; caption: string;
    icon: React.ReactNode; color: string; tint: string;
  }>).filter((item) => {
    if (item.tab === "materiales" && modoRegistro === "hoja") return false;
    if (item.tab === "hoja" && modoRegistro === "materiales") return false;
    return true;
  });

  return (
    // Canvas, so the detail pane reads as a surface with white cards on it
    // rather than one flat white sheet.
    <div style={{ position: "relative", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: "var(--surface-canvas)" }}>
      {/* Salto directo a Procedimientos: en una OT con muchas fotos y
          materiales la sección queda muy abajo y no se sabe que existe. */}
      {tab === "detalle" && procFueraDeVista && (
        <button
          type="button"
          onClick={() => procSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          style={{
            position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
            zIndex: 60, height: 40, padding: "0 18px",
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "var(--brand)", color: "var(--fg-on-brand)",
            border: "none", borderRadius: 999, cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <ClipboardCheck size={15} />
          Ir a procedimientos
        </button>
      )}

      {/* Lightbox a nivel de componente: antes vivía dentro de la pestaña
          Fotos, así que al abrirlo desde una firma en Detalles el estado
          cambiaba pero no había nada montado que lo dibujara. */}
      {lightboxGrupo !== null && (
        <div
          // z-index must beat GlobalTopBar (zIndex 100), otherwise the
          // breadcrumb bar shows through the fullscreen lightbox.
          style={{ background: "var(--surface-0)", zIndex: 200 }}
          className="fixed inset-0 flex items-center justify-center"
          onClick={() => setLightboxGrupo(null)}
        >
          {/* Close — top-right of the viewport */}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setLightboxGrupo(null); }}
            aria-label="Cerrar"
            className="absolute top-5 flex items-center justify-center"
            style={{
              // Horizontally center the X over the right chevron:
              // chevron inset md:right-1 (0.25rem), size 150 → center at 0.25rem + 75px.
              // X size 64 → center at inset + 32px. Match: inset = 0.25rem + 43px.
              right: "calc(0.25rem + 15px)",
              color: "var(--fg-1)", background: "transparent", border: "none", padding: 0, cursor: "pointer",
            }}
          >
            <X size={64} strokeWidth={1} />
          </button>

          {/* Prev — left edge of the viewport, vertically centered */}
          {lightboxGrupo.idx > 0 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setLightboxGrupo(g => g && { ...g, idx: g.idx - 1 }); }}
              aria-label="Anterior"
              className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center md:left-1"
              style={{ color: "var(--fg-1)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              <ChevronDown size={100} strokeWidth={1} className="rotate-90" />
            </button>
          )}

          {/* Next — right edge of the viewport, vertically centered */}
          {lightboxGrupo.idx < lightboxGrupo.urls.length - 1 && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setLightboxGrupo(g => g && { ...g, idx: g.idx + 1 }); }}
              aria-label="Siguiente"
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center md:right-1"
              style={{ color: "var(--fg-1)", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
            >
              <ChevronDown size={100} strokeWidth={1} className="-rotate-90" />
            </button>
          )}

          {/* Image */}
          <div className="relative inline-block max-h-[82vh] max-w-[78vw]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxGrupo.urls[lightboxGrupo.idx]}
              alt=""
              className="block max-h-[82vh] max-w-[78vw] select-none object-contain shadow-2xl"
            />
          </div>

          {/* Counter — only when there's more than one image */}
          {lightboxGrupo.urls.length > 1 && (
            <div
              className="absolute bottom-6 left-1/2 -translate-x-1/2 text-sm font-medium"
              style={{ color: "var(--fg-1)" }}
            >
              {lightboxGrupo.idx + 1} / {lightboxGrupo.urls.length}
            </div>
          )}
        </div>
      )}

      {/* Shared confirmation popup for every destructive action in this view. */}
      <ConfirmDeleteModal pending={confirmDelete} onClose={() => setConfirmDelete(null)} />

      <div ref={detalleScrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>

      {/* An OT closed with unmet requisitos says so permanently — the audit trail
          is worthless if it only lives in the activity log nobody scrolls to. */}
      {orden.cierre_forzado && (
        <div style={{ display: "flex", gap: 10, padding: "12px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
          <AlertTriangle size={15} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg-2)" }}>
            <strong style={{ color: "var(--fg-1)" }}>Cierre forzado</strong>
            {" — se cerró con requisitos pendientes."}
            {orden.cierre_forzado_motivo && (
              <div style={{ marginTop: 2, color: "var(--fg-3)" }}>{orden.cierre_forzado_motivo}</div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ position: "relative", flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        {/* Top bar: title + optional close (modal overlays). Timer was moved into the body.
            Solo se muestra en la pestaña principal: dentro de una pestaña el
            título ya no aporta y ocupaba una franja alta de la pantalla. Las
            otras pestañas usan la barra compacta de más abajo. */}
        {tab === "detalle" && (
        <div style={{ display: "flex", alignItems: "flex-start", padding: "24px 28px 18px", minHeight: 52, gap: 16 }}>
          {showBackButton && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Volver a órdenes"
              title="Volver a órdenes"
              style={{ width: 36, height: 36, marginTop: 1, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", cursor: "pointer" }}
            >
              <ChevronLeft size={19} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0, paddingRight: 190 }}>
            {orden.numero != null && (
              <div style={{ display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", border: "1px solid var(--border-strong)", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--fg-1)", fontSize: 12, fontWeight: 500, marginBottom: 8 }}>
                OT #{orden.numero}
              </div>
            )}
            <h1
              style={{
                fontSize: 27, fontWeight: 700, color: "var(--fg-1)",
                margin: 0, lineHeight: 1.3,
                overflowWrap: "break-word",
                wordBreak: "break-word",
              }}
            >
              {orden.titulo || "Sin título"}
              <CopyOTUrlButton ordenId={orden.id} />
            </h1>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px 12px", marginTop: 12, color: "var(--fg-3)", fontSize: 13 }}>
              {orden.ubicaciones?.edificio && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MapPin size={15} />{orden.ubicaciones.edificio}</span>
              )}
              {orden.sociedad?.nombre && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Building2 size={15} />{orden.sociedad.nombre}</span>
              )}
              {orden.fecha_termino && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={15} />Vencimiento: {fmtFechaLocal(orden.fecha_termino)}</span>
              )}
              {orden.prioridad !== "ninguna" && (
                <DetailBadge icon={prioIcon} iconColor={prioSolid}>{prioLabel}</DetailBadge>
              )}
            </div>
          </div>
          {showCloseButton && (
            <button
              type="button" onClick={onClose}
              style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-4)", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <X size={15} />
            </button>
          )}
        </div>
        )}

        {/* Barra compacta para las pestañas que no son la principal: solo el
            botón de volver y el nombre de la sección, al estilo del panel de
            edición. Volver lleva a la pestaña principal, no cierra la OT. */}
        {tab !== "detalle" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "0 28px", height: 64, flexShrink: 0,
          }}>
            <button
              type="button"
              onClick={() => setTab("detalle")}
              aria-label="Volver al detalle"
              title="Volver al detalle"
              style={{ width: 32, height: 32, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              <ChevronLeft size={17} />
            </button>
            <h2 style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {TAB_TITLE[tab] ?? "Detalle"}
            </h2>
            {/* El cierre del modal vive en la cabecera grande, que acá está
                oculta: sin esto, una OT abierta en modal quedaría sin forma de
                cerrarse desde una pestaña interna. */}
            {showCloseButton && (
              <button
                type="button" onClick={onClose}
                aria-label="Cerrar"
                style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-4)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* Scrollable tab bar: navigation stays readable in the split view.
            Solo en la pestaña principal — dentro de una sección se navega con
            el botón de volver, que es justamente para lo que está. */}
        {tab === "detalle" && (
        <div style={{ margin: "0 28px 22px", overflowX: "auto", overflowY: "hidden" }}>
          <div role="tablist" aria-label="Secciones de la orden" style={{ display: "flex", alignItems: "center", gap: 8, width: "max-content", minWidth: "100%" }}>
          {dashboardNav.map((item) => {
            const active = item.tab != null && tab === item.tab;
            return (
            <button
              key={item.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => { if (item.tab) setTab(item.tab); }}
              style={{
                height: 32,
                padding: "0 14px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                background: active ? "var(--surface-hover)" : "transparent",
                border: "1px solid var(--brand)",
                borderRadius: "var(--r-xs)",
                color: "var(--brand-fg)",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontWeight: 700,
                transition: "background 0.12s, box-shadow 0.12s",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              onFocus={e => { e.currentTarget.style.outline = "none"; }}
            >
              <span style={{ width: 20, height: 20, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--brand-fg)" }}>
                {item.icon}
              </span>
              <span style={{ color: "var(--brand-fg)", fontSize: 13, fontWeight: 700 }}>
                {item.label}{item.tab !== "detalle" && item.tab !== "hoja" ? ` (${item.value})` : ""}
              </span>
            </button>
            );
          })}
          </div>

                    <div ref={exportMenuRef} style={{ position: "absolute", top: 24, right: 28, zIndex: 20 }}>
            <button
              type="button"
              onClick={() => setExportMenuOpen(v => !v)}
              title="Mas acciones"
              style={{ width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-1)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
            >
              {exporting ? <Loader2 size={14} className="animate-spin" /> : <MoreVertical size={17} />}
            </button>
            {exportMenuOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 300,
                background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                boxShadow: "var(--shadow-sm)", width: 190, overflow: "hidden",
              }}>
                {onToggleMarcada && (
                  <button
                    type="button"
                    onClick={() => { onToggleMarcada(orden.id, !isMarcada); setExportMenuOpen(false); }}
                    aria-pressed={isMarcada}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 12px", background: "var(--surface-1)", border: "none",
                      borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 13,
                      color: isMarcada ? "var(--brand-fg)" : "var(--fg-1)", fontFamily: "inherit", textAlign: "left",
                      fontWeight: isMarcada ? 700 : 400,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                  >
                    {isMarcada ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    {isMarcada ? "Marcar como no leída" : "Marcar como leída"}
                  </button>
                )}
                {[
                  { key: "pdf",  label: "Exportar PDF",   action: handleExportPDF },
                  { key: "csv",  label: "Exportar Excel", action: () => { setExportMenuOpen(false); setExportConfigOpen(true); } },
                  { key: "txt",  label: "Exportar TXT",   action: handleExportTXT },
                ].map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.action}
                    disabled={!!exporting}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      padding: "10px 12px", background: "var(--surface-1)", border: "none",
                      cursor: exporting ? "default" : "pointer", fontSize: 13,
                      color: "var(--fg-1)", fontFamily: "inherit", textAlign: "left",
                      opacity: exporting && exporting !== item.key ? 0.5 : 1,
                    }}
                    onMouseEnter={e => { if (!exporting) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                  >
                    {item.label}
                    {exporting === item.key && <Loader2 size={11} className="animate-spin" style={{ marginLeft: "auto" }} />}
                  </button>
                ))}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen(false);
                      setConfirmDelete({
                        title: "¿Eliminar esta orden?",
                        description: "Esta acción no se puede deshacer. La orden y su información asociada dejarán de estar disponibles.",
                        confirmLabel: "Eliminar",
                        onConfirm: onDelete,
                      });
                    }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      padding: "10px 12px", background: "var(--surface-1)", border: "none",
                      borderTop: "1px solid var(--border)", cursor: "pointer", fontSize: 13,
                      color: "var(--danger)", fontFamily: "inherit", textAlign: "left",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            )}
          </div>

          {(canManage || orden.creado_por === myId) && (
            <button
              type="button" onClick={onEdit}
              style={{ position: "absolute", top: 24, right: 80, zIndex: 19, height: 42, padding: "0 15px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.96)"; }}
              onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}
            >
              <Pencil size={14} />
              Editar
            </button>
          )}
        </div>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ minHeight: 0, overflow: "visible" }}>

        {/* ── Detalle ── */}
        {tab === "detalle" && (
          <div style={{ padding: "28px 28px 120px" }}>
            {orden.parent_id && (
              <button
                type="button"
                onClick={() => orden.parent_id && openOrden(orden.parent_id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  marginBottom: 14, padding: "10px 12px",
                  border: "1px solid var(--brand-tint-2)", borderRadius: "var(--r-md)",
                  background: "var(--brand-tint)", color: "var(--brand-fg)",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <GitBranch size={15} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>Sub-OT · Ver orden principal</span>
                  {parentOrden?.titulo && (
                    <span style={{ display: "block", marginTop: 2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {parentOrden.titulo}
                    </span>
                  )}
                </span>
                <ChevronDown size={14} style={{ transform: "rotate(-90deg)" }} />
              </button>
            )}

            {/* N° OT badge */}
            {meta.nOT && <NOTBadge nOT={meta.nOT} />}

            {/* Description */}
            {meta.descripcion && (
              <div style={{ maxWidth: 1100 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 4px" }}>Descripción</p>
                <p style={{ fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75, whiteSpace: "pre-wrap", margin: 0 }}>{meta.descripcion}</p>
              </div>
            )}

            {/* Estado */}
            {(() => {
              // Solid per-status fill when selected; the unselected state always
              // shows the brand blue (see button styles below).
              return (
                <div style={{ marginTop: 28 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Estado</p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {ESTADOS.map(e => {
                      // "pendiente" flips to "Asignada" once someone is assigned,
                      // mirroring the OT list badge so the two views never disagree.
                      // El icono acompana a la etiqueta: usuario con X sin
                      // asignados, usuario con check cuando los hay.
                      const hasAssignees = (orden.asignados_ids ?? []).length > 0;
                      const Icon = e.value === "pendiente" && hasAssignees
                        ? UserRoundCheck
                        : e.icon;
                      const label = e.value === "pendiente" && hasAssignees ? "Asignada" : e.label;
                      const isSelected = orden.estado === e.value;
                      // "Sin asignar" no tiene color propio: queda neutro hasta
                      // que alguien toma la OT, y ahí pasa a ser "Asignada" con
                      // el mismo azul que "En curso".
                      const accent = e.value === "pendiente"
                        ? (hasAssignees ? "var(--st-progress-dot)" : null)
                        : ESTADO_ACCENT[e.value];
                      const handleClick = async () => {
                        if (e.value === "en_espera" && orden.en_ejecucion) {
                          setPauseOpen(true);
                          return;
                        }
                        if (e.value === "en_curso") {
                          if (orden.en_ejecucion) return; // already running
                          if (orden.pausado_at) {
                            await handleReanudar();
                          } else {
                            await handleIniciar();
                          }
                        } else {
                          if (orden.en_ejecucion) {
                            if (e.value === "completado") {
                              // Completion validates requirements first and the
                              // canonical command closes the running timer.
                              await closeWithRequirements(async (forceClose) => {
                                if (!await changeStatus("completado", forceClose, Boolean(forceClose))) {
                                  throw new Error("No se pudo cambiar el estado de la OT.");
                                }
                              });
                              return;
                            }
                            // Pausing already transitions the OT to en_espera.
                            // Do not issue a second status command for that same state.
                            setTimerBusy(true);
                            try {
                              await pausarOrden(orden.id, myId, "", elapsed);
                              onOrdenUpdated({ en_ejecucion: false, pausado_at: new Date().toISOString(), estado: "en_espera" });
                              if (e.value !== "en_espera") {
                                await changeStatus(e.value);
                              }
                            } catch (err) {
                              alert(err instanceof Error ? err.message : "No se pudo cambiar el estado de la OT.");
                            } finally {
                              setTimerBusy(false);
                            }
                          } else if (e.value === "completado") {
                            await closeWithRequirements(async (forceClose) => {
                              if (!await changeStatus("completado", forceClose, Boolean(forceClose))) {
                                throw new Error("No se pudo cambiar el estado de la OT.");
                              }
                            });
                          } else {
                            await changeStatus(e.value);
                          }
                        }
                      };
                      return (
                        <button
                          key={e.value}
                          type="button"
                          onClick={handleClick}
                          disabled={timerBusy}
                          // Sin seleccionar: todos iguales — borde e ícono
                          // azules sobre fondo transparente. Seleccionado: se
                          // rellena con el color del estado y el ícono y el
                          // texto pasan a blanco. "Sin asignar" no tiene color
                          // propio hasta que la OT tiene asignados.
                          style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                            gap: 7, padding: "10px 16px", minWidth: 86, minHeight: 62,
                            border: `1px solid ${isSelected && accent ? accent : "var(--brand)"}`,
                            borderRadius: "var(--r-md)",
                            background: isSelected ? (accent ?? "transparent") : "transparent",
                            color: isSelected && accent ? "#FFFFFF" : "var(--fg-1)",
                            cursor: timerBusy ? "default" : "pointer",
                            transition: "background var(--dur-fast) var(--ease)",
                          }}
                          onMouseEnter={ev => {
                            if (!timerBusy && !isSelected) ev.currentTarget.style.background = "var(--brand-tint)";
                          }}
                          onMouseLeave={ev => {
                            if (!isSelected) ev.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Icon size={18} style={{ color: isSelected && accent ? "#FFFFFF" : "var(--brand)" }} />
                          {e.value === "en_curso" && orden.en_ejecucion ? (
                            <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", textAlign: "center", lineHeight: 1.2 }}>
                              {fmtSecs(elapsed)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{label}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Pause-reason banner (en_espera). Highlights "Reprogramar" because
                it carries a user-coordinated date the supervisor should see. */}
            {orden.estado === "en_espera" && latestPause && (() => {
              const c = (latestPause.comentario ?? "").trim();
              const isReprogramar = /^reprogramar/i.test(c);
              // Mobile format: "Reprogramar: <localized date>[ - <comment>]"
              const reprogramarMatch = isReprogramar
                ? c.replace(/^reprogramar\s*:\s*/i, "").split(/\s+-\s+/, 2)
                : null;
              const fechaTxt = reprogramarMatch?.[0] ?? null;
              const extraTxt = reprogramarMatch?.[1] ?? null;

              const tone = isReprogramar
                ? { bg: "var(--st-wait-bg)", border: "var(--st-wait-fg)", fg: "var(--st-wait-fg)" }
                : { bg: "var(--surface-hover)", border: "var(--border-strong)", fg: "var(--fg-2)" };

              return (
                <div style={{
                  marginTop: 22,
                  padding: "14px 16px",
                  borderRadius: "var(--r-md)",
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  display: "flex", alignItems: "flex-start", gap: 10,
                }}>
                  {isReprogramar
                    ? <Calendar size={16} style={{ color: tone.fg, flexShrink: 0, marginTop: 1 }} />
                    : <PauseCircle size={16} style={{ color: tone.fg, flexShrink: 0, marginTop: 1 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: tone.fg, margin: 0 }}>
                      {isReprogramar
                        ? `Reprogramada${fechaTxt ? ` para ${fechaTxt}` : ""}`
                        : "En espera"}
                    </p>
                    <p style={{ fontSize: 12, color: tone.fg, margin: "2px 0 0", lineHeight: 1.5 }}>
                      {isReprogramar
                        ? (extraTxt ?? "El solicitante coordinó otra fecha para esta orden.")
                        : (c || "Esta orden está pausada.")}
                    </p>
                    {latestPause.created_at && (
                      <p style={{ fontSize: 11, color: tone.fg, margin: "4px 0 0", opacity: 0.8 }}>
                        {new Date(latestPause.created_at).toLocaleString("es-CL", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Clasificacion banner (levantamiento) */}
            {clasificacion === "levantamiento" && (
              <div style={{
                marginTop: 22,
                padding: "16px 18px",
                borderRadius: "var(--r-md)",
                background: "var(--brand-tint)",
                border: "1px solid var(--brand-tint-2)",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <Search size={16} style={{ color: "var(--brand-fg)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--brand-fg)", margin: 0 }}>Levantamiento</p>
                  <p style={{ fontSize: 12, color: "var(--brand-fg)", margin: "2px 0 0", lineHeight: 1.5 }}>
                    Esta orden está marcada como levantamiento. El temporizador no corre hasta cambiarla a ejecución.
                  </p>
                  {canManage && (
                    <button
                      type="button"
                      onClick={handleApproveClasificacion}
                      disabled={changingClasif}
                      style={{
                        marginTop: 8,
                        height: 30, padding: "0 12px",
                        background: "var(--brand-hover)", color: "var(--fg-on-brand)",
                        border: "none", borderRadius: "var(--r-sm)",
                        fontSize: 12, fontWeight: 600,
                        cursor: changingClasif ? "default" : "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                        opacity: changingClasif ? 0.7 : 1,
                        fontFamily: "inherit",
                      }}
                    >
                      {changingClasif && <Loader2 size={12} className="animate-spin" />}
                      Convertir a orden de trabajo
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Presupuesto banner — informational, no actions. Lets users
                spot at a glance that the OT is licitation-driven planned
                work, not regular ejecución. */}
            {orden.tipo_trabajo === "presupuesto" && (
              <div style={{
                marginTop: 22,
                padding: "16px 18px",
                borderRadius: "var(--r-md)",
                background: "var(--st-wait-bg)",
                border: "1px solid var(--border-strong)",
                display: "flex", alignItems: "flex-start", gap: 10,
              }}>
                <DollarSign size={16} style={{ color: "var(--st-wait-fg)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--st-wait-fg)", margin: 0 }}>Presupuesto</p>
                  <p style={{ fontSize: 12, color: "var(--st-wait-fg)", margin: "2px 0 0", lineHeight: 1.5 }}>
                    Esta orden es un presupuesto: trabajo planificado, normalmente asociado a una licitación.
                  </p>
                </div>
              </div>
            )}

            {!orden.parent_id && (
              <SubOrdenesSection
                subOrdenes={subOrdenes}
                isLoading={loadingSubOrdenes}
                canCreate={canManage || orden.creado_por === myId}
                isCreating={creatingSubOrden}
                newTitle={newSubOrdenTitle}
                onTitleChange={setNewSubOrdenTitle}
                onCreate={handleCreateSubOrden}
                onOpen={openOrden}
              />
            )}

            {/* Adjuntos de creación, adjuntos de ejecución y links */}
            {(() => {
              const allLinks = Array.isArray(orden.links) ? orden.links : [];
              const urlLinks = allLinks.filter((l) => l.tipo !== "archivo");
              const creationFiles = allLinks.filter((l) => l.tipo === "archivo" && l.origen !== "ejecucion");
              const executionFiles = allLinks.filter((l) => l.tipo === "archivo" && l.origen === "ejecucion");

              const renderFiles = (files: typeof creationFiles) => (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {files.map((file, index) => {
                    const name = file.nombre?.trim() || file.label?.trim() || file.url.split("/").pop()?.split("?")[0] || "Archivo";
                    return (
                      <button
                        key={`${file.url}-${index}`}
                        type="button"
                        onClick={() => { void handleAdjuntoDownload(file.url, name); }}
                        style={{
                          minHeight: 48, width: "100%", padding: "8px 12px", boxSizing: "border-box",
                          display: "flex", alignItems: "center", gap: 10,
                          border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                          background: "var(--surface-1)", color: "var(--fg-1)", cursor: "pointer",
                          textAlign: "left", fontFamily: "inherit",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
                      >
                        <span style={{
                          width: 30, height: 30, borderRadius: "var(--r-sm)", flexShrink: 0,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          background: "var(--brand-tint)", color: "var(--brand)",
                        }}>
                          <FileText size={16} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, fontWeight: 500 }}>
                          {name}
                        </span>
                        <Download size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              );

              return (
                <>
                  <input
                    ref={adjuntosInputRef}
                    type="file"
                    multiple
                    hidden
                    accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.zip,.rar,.7z"
                    onChange={handleAdjuntosUpload}
                  />
                  {creationFiles.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                        Adjuntos de la OT
                      </div>
                      {renderFiles(creationFiles)}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Adjuntos subidos
                      </div>
                      <button
                        type="button"
                        onClick={() => adjuntosInputRef.current?.click()}
                        disabled={uploadingAdjuntos}
                        style={{
                          minHeight: 34, padding: "0 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                          border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)",
                          color: "var(--brand-fg)", cursor: uploadingAdjuntos ? "default" : "pointer", fontSize: 12, fontWeight: 600,
                          opacity: uploadingAdjuntos ? 0.65 : 1, fontFamily: "inherit",
                        }}
                      >
                        {uploadingAdjuntos ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploadingAdjuntos ? "Subiendo…" : "Subir archivos"}
                      </button>
                    </div>
                    {executionFiles.length > 0
                      ? renderFiles(executionFiles)
                      : <div style={{ padding: "14px 12px", border: "1px dashed var(--border)", borderRadius: "var(--r-sm)", color: "var(--fg-4)", fontSize: 12 }}>Todavía no se han subido archivos durante la ejecución.</div>}
                  </div>
                  {urlLinks.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                        Links
                      </div>
                      <LinksDisplay links={urlLinks} />
                    </div>
                  )}
                </>
              );
            })()}

            {/* Meta fields */}
            <div style={{ marginTop: 32, paddingTop: 26, borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "28px 72px", maxWidth: 1180 }}>
              {[
                orden.tipo_trabajo && { label: "Tipo", value: TIPO_LABEL[orden.tipo_trabajo] ?? orden.tipo_trabajo, icon: <Settings2 size={16} /> },
                orden.sociedad?.nombre && { label: "Sociedad", value: orden.sociedad.nombre, icon: <Building2 size={16} /> },
                (orden.solicitante || meta.solicitante) && { label: "Solicitante", value: orden.solicitante || meta.solicitante, icon: <User size={16} /> },
                orden.solicitante_telefono && { label: "Teléfono solicitante", value: orden.solicitante_telefono, icon: <Phone size={16} />, href: `tel:${orden.solicitante_telefono.replace(/\s+/g, "")}` },
                orden.solicitante_email && { label: "Email solicitante", value: orden.solicitante_email, icon: <Mail size={16} />, href: `mailto:${orden.solicitante_email}` },
                meta.hito && { label: "ITO", value: meta.hito, icon: <Flag size={16} /> },
                orden.presupuesto && { label: "N° de presupuesto", value: orden.presupuesto, icon: <DollarSign size={16} /> },
                orden.ubicaciones?.edificio && { label: "Ubicación", value: orden.ubicaciones.edificio + (orden.ubicaciones.detalle ? ` · ${orden.ubicaciones.detalle}` : ""), icon: <MapPin size={16} /> },
                orden.lugar?.nombre && { label: "Lugar específico", value: orden.lugar.nombre, icon: <MapPin size={16} /> },
                orden.activos?.nombre && { label: "Activo", value: orden.activos.nombre, icon: <Settings2 size={16} /> },
                orden.fecha_termino && { label: "Fecha de vencimiento", value: fmtFechaLocal(orden.fecha_termino), icon: <Calendar size={16} /> },
                orden.fecha_inicio && { label: "Fecha de inicio", value: fmtFechaLocal(orden.fecha_inicio), icon: <Calendar size={16} /> },
                (orden.tiempo_total_segundos != null && orden.tiempo_total_segundos > 0) && { label: "Tiempo total", value: fmtSecs(orden.tiempo_total_segundos), icon: <RotateCcw size={16} /> },
              ].filter(Boolean).map((field: any) => (
                <div key={field.label}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7, marginTop: 0 }}>{field.label}</p>
                  <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, display: "flex", alignItems: "center", gap: 10, lineHeight: 1.45 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: "var(--r-sm)",
                      background: "var(--brand-tint)", color: "var(--brand)",
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>{field.icon}</span>
                    {field.href
                      ? <a href={field.href} style={{ color: "var(--brand-fg)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{field.value}</a>
                      : field.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Category */}
            {orden.categorias_ot?.nombre && (
              <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                {/* El color de la categoría solo tiñe el ícono. */}
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 12, fontWeight: 400, padding: "4px 10px",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "var(--r-sm)",
                  background: "transparent",
                  color: "var(--fg-1)",
                }}>
                  <span style={{ display: "inline-flex", flexShrink: 0, color: orden.categorias_ot.color ?? "var(--fg-3)" }}>
                    <CategoriaIcon icono={orden.categorias_ot.icono} size={13} />
                  </span>
                  {orden.categorias_ot.nombre}
                </span>
              </div>
            )}

            {/* Assigned */}
            {assigned.length > 0 && (
              <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, marginTop: 0 }}>Asignados</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {assigned.map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: "linear-gradient(135deg, var(--brand-active), var(--brand))", color: "var(--fg-on-brand)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                      }}>
                        {initials(u.nombre)}
                      </span>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>{u.nombre}</p>
                        <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "2px 0 0", textTransform: "capitalize" }}>{u.rol}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creador */}
            {orden.creador?.nombre && (
              <div style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <User size={13} style={{ color: "var(--fg-4)" }} />
                <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Creado por</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-2)" }}>{orden.creador.nombre}</span>
              </div>
            )}


            {/* ── Procedimientos — vive dentro de Detalles, debajo de
                 Asignados, en vez de una pestaña aparte. ── */}
            <div ref={procSectionRef} style={{ marginTop: 30, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
              {/* Paginación junto al título: con varios procedimientos se
                  navega uno a uno en vez de apilarlos todos. */}
              {(() => {
                const idx = Math.max(0, otProcs.findIndex(o => o.id === (procVisibleId ?? otProcs[0]?.id)));
                const go = (delta: number) => {
                  const next = otProcs[idx + delta];
                  if (next) setProcVisibleId(next.id);
                };
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Procedimientos</p>
                    {otProcs.length > 1 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => go(-1)}
                          disabled={idx === 0}
                          aria-label="Procedimiento anterior"
                          style={{
                            width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1px solid var(--border)", borderRadius: "var(--r-xs)",
                            background: "var(--surface-1)", cursor: idx === 0 ? "default" : "pointer",
                            color: "var(--fg-2)", opacity: idx === 0 ? 0.4 : 1,
                          }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 11.5, color: "var(--fg-3)", minWidth: 46, textAlign: "center" }}>
                          {idx + 1} de {otProcs.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => go(1)}
                          disabled={idx >= otProcs.length - 1}
                          aria-label="Procedimiento siguiente"
                          style={{
                            width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1px solid var(--border)", borderRadius: "var(--r-xs)",
                            background: "var(--surface-1)", cursor: idx >= otProcs.length - 1 ? "default" : "pointer",
                            color: "var(--fg-2)", opacity: idx >= otProcs.length - 1 ? 0.4 : 1,
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            {loadingProcs ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
              </div>
            ) : (
              <>
                {/* Attached procedures */}
                {otProcs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-4)", fontSize: 13 }}>
                    <ClipboardCheck size={28} style={{ color: "var(--border-strong)", margin: "0 auto 8px" }} />
                    <div>No hay procedimientos adjuntos</div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 20 }}>
                    {/* Uno a la vez, elegido desde el encabezado. Con varios
                        procedimientos de decenas de pasos, apilarlos obligaba a
                        recorrer todo para llegar al que se busca. */}
                    {(() => {
                      const visible = otProcs.find(o => o.id === procVisibleId) ?? otProcs[0];
                      return (
                        <ProcedimientoEjecutado
                          otp={visible}
                          onEnsureEjecucion={() => ensureEjecucion(visible)}
                          nombrePorUsuario={nombrePorUsuario}
                          onPhotoClick={(url) => setLightboxGrupo({ urls: [url], idx: 0 })}
                          editable={canFillProcs}
                          ordenId={orden.id}
                          pendingResps={pendingResps}
                          savingResp={savingResp}
                          onUpdateResp={(pasoId, patch) => setPendingResps(prev => ({ ...prev, [pasoId]: { ...(prev[pasoId] ?? {}), ...patch } }))}
                          onSaveResp={(pasoId, extra) => handleInlineSaveResp(visible, pasoId, extra)}
                          onPreviewImage={(urls, idx) => setLightboxGrupo({ urls, idx })}
                        />
                      );
                    })()}
                  </div>
                )}

                {/* El adjuntar procedimientos vive en los formularios de crear y
                    editar OT: esta pestaña es para ejecutarlos, y la biblioteca
                    completa competía visualmente con el procedimiento en curso. */}
              </>
            )}
            </div>
          </div>
        )}

        {/* ── Actividad ── */}
        {tab === "actividad" && (
          <div style={{ padding: "24px 28px" }}>
            {loadingAct ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Loader2 size={18} style={{ color: "var(--pr-low)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : actividad.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 8, color: "var(--pr-low)" }}>
                <CircleDot size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Sin actividad registrada</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {actividad.map((act, idx) => {
                  const Icon = ACT_ICON[act.tipo] ?? CircleDot;
                  const colorClass = ACT_COLOR[act.tipo] ?? "text-zinc-400";
                  const isComment = act.tipo === "comentario";
                  const isFotosGrupo = act.tipo === "fotos_grupo_subidas";
                  const label = isFotosGrupo && act.comentario
                    ? `Fotos subidas al grupo "${act.comentario}"`
                    : (ACT_LABEL[act.tipo] ?? act.tipo);
                  const resolvedComentario = act.tipo === "asignado" && act.comentario
                    ? act.comentario.split(",").map(id => {
                        const u = usuarios.find(u => u.id === id.trim());
                        return u?.nombre ?? id.trim();
                      }).join(", ")
                    : isFotosGrupo
                      ? null
                      : act.comentario;
                  const isLast = idx === actividad.length - 1;
                  return (
                    <div key={act.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                      {/* Timeline line */}
                      {!isLast && (
                        <div style={{ position: "absolute", left: 15, top: 26, bottom: 0, width: 1, background: "var(--border)" }} />
                      )}
                      <div className={cn("mt-1 size-7 rounded-full border-2 border-white bg-gray-50 flex items-center justify-center shrink-0 shadow-sm z-10", colorClass)} style={{ minWidth: 28, minHeight: 28 }}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                          {act.usuario?.nombre && (
                            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{act.usuario.nombre}</span>
                          )}
                          {!isComment && label && (
                            <span style={{ fontSize: 12, color: "var(--fg-2)" }}>{label}</span>
                          )}
                          <span style={{ fontSize: 11, color: "var(--pr-low)", marginLeft: "auto" }}>{fmtTs(act.created_at)}</span>
                        </div>
                        {resolvedComentario && (
                          <div style={{
                            marginTop: 4, fontSize: 13, lineHeight: 1.6, color: isComment ? "var(--fg-1)" : "var(--fg-2)",
                            background: isComment ? "var(--surface-hover)" : "transparent",
                            padding: isComment ? "8px 10px" : "0",
                            borderRadius: isComment ? 6 : 0,
                            borderLeft: isComment ? "2px solid var(--brand)" : "none",
                          }}>
                            {resolvedComentario}
                          </div>
                        )}
                        {act.foto_url && (
                          <a href={act.foto_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>
                            <img
                              src={act.foto_url}
                              alt="foto"
                              style={{ maxWidth: 260, maxHeight: 200, borderRadius: 6, border: "1px solid var(--border)", objectFit: "cover", display: "block" }}
                            />
                          </a>
                        )}
                        {act.audio_url && (
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                            <Volume2 size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />
                            <audio controls src={act.audio_url} style={{ height: 28 }} />
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
          // minHeight:100% + flex column lets the gallery fill the tab's scroll
          // area instead of collapsing to its content height.
          <div style={{ padding: "20px 28px 24px", minHeight: "100%", display: "flex", flexDirection: "column" }}>
            {(
              <>
                <FotosGaleria
                  grupos={fotoGrupos}
                  loading={loadingGrupos}
                  canManage={canManageFotos}
                  canUpload={canUploadFotos}
                  isActive={isActive || canManage}
                  uploadingGrupoId={uploadingGrupoId}
                  creatingGrupo={creatingGrupo}
                  onUpload={(grupoId, file) => handleUploadToGrupo(grupoId, file)}
                  onRemoveItem={(grupoId, itemId, url) => setConfirmDelete({ label: "esta foto", onConfirm: () => handleRemoveFromGrupo(grupoId, itemId, url) })}
                  onRemoveMany={items => setConfirmDelete({
                    label: `${items.length} foto${items.length !== 1 ? "s" : ""}`,
                    onConfirm: () => handleRemoveManyFromGrupos(items),
                  })}
                  onDeleteGrupo={grupo => setConfirmDelete({ label: grupo.titulo || "este grupo de fotos", onConfirm: () => handleDeleteGrupo(grupo.id) })}
                  onSaveGrupoEdit={(grupoId, titulo, desc) => handleSaveGrupoEdit(grupoId, titulo, desc)}
                  onToggleLocked={(grupoId, locked) => handleToggleGrupoLocked(grupoId, locked)}
                  onChangeTipo={(grupoId, tipo) => handleChangeGrupoTipo(grupoId, tipo)}
                  onCreateGrupo={(titulo, desc, tipo) => handleCreateGrupoWith(titulo, desc, tipo)}
                  onLightbox={(urls, idx) => setLightboxGrupo({ urls, idx })}
                />

                {/* Lightbox. The arrows + close button live inside the image
                    frame: we wrap the <img> in an inline-block container that
                    shrinks to the image's rendered size, then position the
                    controls absolutely against that container instead of the
                    viewport. */}
              </>
            )}
          </div>
        )}
        {/* ── Partes ── */}
        {tab === "materiales" && (
          <div style={{ padding: "24px 28px 120px" }}>

            {/* Search catalogue */}
            {(isActive || canManage) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
                  <input
                    type="text"
                    placeholder="Buscar material en inventario…"
                    value={catalogSearch}
                    onChange={e => setCatalogSearch(e.target.value)}
                    style={{
                      width: "100%", height: 38, paddingLeft: 32, paddingRight: 12,
                      fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                      background: "var(--surface-0)", outline: "none", fontFamily: "inherit",
                      boxSizing: "border-box", color: "var(--fg-1)",
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>

                {filteredCatalog.length > 0 && (
                  <div style={{ marginTop: 4, border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)", boxShadow: "0 4px 12px rgba(15,23,42,0.08)" }}>
                    {filteredCatalog.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        disabled={addingParte}
                        onClick={() => handleAddParte(p)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 12,
                          padding: "9px 12px", background: "none", border: "none",
                          borderBottom: "1px solid var(--divider)", cursor: "pointer",
                          fontFamily: "inherit", textAlign: "left",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <Package size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: p.stock_actual <= 0 ? "var(--danger)" : "var(--fg-4)" }}>
                            {p.unidad} · Stock: {p.stock_actual}
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: "var(--brand-fg)", fontWeight: 600, flexShrink: 0 }}>+ Agregar</span>
                      </button>
                    ))}
                  </div>
                )}
                {loadingCatalog && <div style={{ marginTop: 4, padding: "8px 0", fontSize: 12, color: "var(--fg-4)" }}>Cargando inventario…</div>}
                {catalogSearch.length >= 1 && filteredCatalog.length === 0 && !loadingCatalog && (
                  <div style={{ marginTop: 4, padding: "8px 0", fontSize: 12, color: "var(--fg-4)" }}>
                    Sin resultados. Agrega la parte en <a href="/partes" style={{ color: "var(--brand-fg)" }}>Inventario</a> primero.
                  </div>
                )}
              </div>
            )}

            {/* Parts list */}
            {loadingPartes ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
                <Loader2 size={18} style={{ color: "var(--pr-low)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : ordenPartes.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 0", gap: 8, color: "var(--pr-low)" }}>
                <Package size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, margin: 0 }}>Sin materiales registrados</p>
                {(isActive || canManage) && <p style={{ fontSize: 12, margin: 0 }}>Busca un material del inventario arriba</p>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
                  {["Material", "Cantidad", ""].map(h => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
                  ))}
                </div>
                {ordenPartes.map(op => (
                  <div key={op.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: "1px solid var(--divider)" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)" }}>{op.parte?.nombre ?? "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{op.parte?.unidad}</div>
                    </div>
                    {(isActive || canManage) ? (
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        value={op.cantidad}
                        onChange={e => handleUpdateCantidad(op.id, parseFloat(e.target.value) || op.cantidad)}
                        style={{ height: 30, padding: "0 8px", fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)", width: "100%" }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: "var(--fg-2)" }}>{op.cantidad}</span>
                    )}
                    {(isActive || canManage) ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete({ label: op.parte?.nombre ?? "este material", onConfirm: () => handleDeleteParte(op.id) })}
                        disabled={deletingParteId === op.id}
                        style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--danger)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
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

        {/* ── Hoja de cálculo ── */}
        {wsId && (
          <div style={{ display: tab === "hoja" ? "block" : "none", padding: "24px 28px 120px" }}>
            {requiereHoja && isActive && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 14px", marginBottom: 14,
                background: "var(--st-wait-bg)", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
              }}>
                <AlertTriangle size={14} style={{ color: "var(--warning)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--st-wait-fg)" }}>
                  Esta OT requiere completar la hoja de cálculo antes de poder cerrarse.
                </span>
              </div>
            )}
            <HojaSpreadsheet
              workspaceId={wsId}
              userId={myId}
              ordenId={orden.id}
              canEdit={canManage}
              canExport={canManage}
              onSheetContentSaved={handleSheetContentSaved}
            />
          </div>
        )}

      </div>

      {/* ── Execution modal ── */}
      </div>

      {pauseOpen && (
        <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closePause(); }} style={{ position: "fixed", inset: 0, zIndex: 650, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div role="dialog" aria-modal="true" aria-label="Pausar trabajo" style={{ width: "min(520px, 100%)", maxHeight: "min(720px, calc(100vh - 48px))", overflowY: "auto", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: 58, padding: "0 16px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>{pauseReason ? ({ acceso: "Sin acceso", materiales: "Faltan materiales", reprogramar: "Reprogramar", otro: "Otro motivo" } as const)[pauseReason] : "Pausar trabajo"}</div>
              <button type="button" onClick={closePause} disabled={timerBusy} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--fg-1)", display: "grid", placeItems: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            {!pauseReason ? (
              <div style={{ padding: 20 }}>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--fg-3)" }}>¿Por qué se detiene el trabajo?</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {([
                    { id: "acceso" as const, label: "Sin acceso", description: "No se pudo ingresar al lugar de trabajo", icon: XCircle },
                    { id: "materiales" as const, label: "Faltan materiales", description: "Registra la solicitud en la hoja de cálculo", icon: Package },
                    { id: "reprogramar" as const, label: "Reprogramar", description: "El solicitante coordinó otra fecha", icon: Calendar },
                    { id: "otro" as const, label: "Otro motivo", description: "Describe brevemente la razón", icon: MoreVertical },
                  ]).map(reason => {
                    const ReasonIcon = reason.icon;
                    return <button key={reason.id} type="button" onClick={() => setPauseReason(reason.id)} style={{ width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, textAlign: "left", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", cursor: "pointer", fontFamily: "inherit" }}>
                      <span style={{ width: 40, height: 40, borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--brand-fg)", background: "var(--brand-tint)", flexShrink: 0 }}><ReasonIcon size={19} /></span>
                      <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: "block", fontSize: 14, fontWeight: 650, color: "var(--fg-1)" }}>{reason.label}</span><span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: "var(--fg-3)" }}>{reason.description}</span></span>
                      <ChevronRight size={17} style={{ color: "var(--fg-4)" }} />
                    </button>;
                  })}
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {pauseReason === "reprogramar" && <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, fontWeight: 650, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Nueva fecha programada<input type="date" min={new Date().toISOString().slice(0, 10)} value={pauseDate} onChange={e => setPauseDate(e.target.value)} style={{ height: 42, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-1)", font: "inherit", textTransform: "none", letterSpacing: 0 }} /></label>}
                {(pauseReason === "acceso" || pauseReason === "otro" || pauseReason === "reprogramar") && <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, fontWeight: 650, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{pauseReason === "reprogramar" ? "Comentario opcional" : "Motivo"}<textarea autoFocus value={pauseComment} onChange={e => setPauseComment(e.target.value)} placeholder={pauseReason === "acceso" ? "Ej: No había nadie en las instalaciones…" : "Describe el motivo…"} rows={4} style={{ resize: "vertical", minHeight: 96, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-1)", font: "inherit", fontSize: 14, lineHeight: 1.45, textTransform: "none", letterSpacing: 0 }} /></label>}
                {pauseReason === "materiales" && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--fg-2)" }}>La OT quedará en espera y se abrirá la hoja de cálculo para registrar los materiales necesarios.</p>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" onClick={() => { setPauseReason(null); setPauseComment(""); setPauseDate(""); }} disabled={timerBusy} style={{ height: 40, padding: "0 16px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-2)", font: "inherit", fontWeight: 600, cursor: "pointer" }}>Atrás</button>
                  <button type="button" onClick={confirmPause} disabled={timerBusy || ((pauseReason === "acceso" || pauseReason === "otro") && !pauseComment.trim()) || (pauseReason === "reprogramar" && !pauseDate)} style={{ height: 40, padding: "0 18px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", font: "inherit", fontWeight: 700, cursor: "pointer", opacity: timerBusy || ((pauseReason === "acceso" || pauseReason === "otro") && !pauseComment.trim()) || (pauseReason === "reprogramar" && !pauseDate) ? 0.5 : 1 }}>{timerBusy ? "Guardando…" : "Confirmar pausa"}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Autosave feedback for procedure steps. Fixed to the top of the viewport
          so it is visible regardless of how far down the form the user is. */}
      {saveToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
            zIndex: 900, display: "flex", alignItems: "center", gap: 9,
            padding: "11px 18px", borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-lg)", fontSize: 13.5, fontWeight: 600,
            color: "#FFFFFF", pointerEvents: "none",
            background: saveToast === "error" ? "var(--danger)" : saveToast === "saved" ? "var(--success)" : "var(--fg-1)",
          }}
        >
          {saveToast === "saving" && <><Loader2 size={14} className="animate-spin" /> Actualizando…</>}
          {saveToast === "saved" && <><CheckCircle2 size={14} /> ¡Campo actualizado!</>}
          {saveToast === "error" && <><AlertTriangle size={14} /> No se pudo guardar el campo</>}
        </div>
      )}

      {/* ── Close-gate: unmet requisitos ──
          Everyone sees what the OT still owes. Only owner/admin get the override,
          and only with a written justification, which is stored on the OT. */}
      {gate && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget && !gateBusy) setGate(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 660, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Requisitos pendientes" style={{ width: "min(540px, 100%)", maxHeight: "min(720px, calc(100vh - 48px))", overflowY: "auto", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: 58, padding: "0 16px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>
                <AlertTriangle size={18} style={{ color: "var(--warning)", flexShrink: 0 }} />
                No se puede cerrar la OT
              </div>
              <button type="button" onClick={() => setGate(null)} disabled={gateBusy} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--fg-1)", display: "grid", placeItems: "center", cursor: gateBusy ? "default" : "pointer" }}><X size={18} /></button>
            </div>

            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--fg-2)" }}>
                {gate.missing.length === 1
                  ? "Esta OT tiene un requisito pendiente:"
                  : `Esta OT tiene ${gate.missing.length} requisitos pendientes:`}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {gate.missing.map((item, i) => (
                  <li key={i} style={{ display: "flex", gap: 10, padding: "11px 13px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", fontSize: 13, lineHeight: 1.45, color: "var(--fg-2)" }}>
                    <AlertTriangle size={14} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 2 }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {canForceClose ? (
                <>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--fg-3)" }}>
                    Como administrador puedes cerrarla de todas formas. La OT quedará marcada
                    como <strong style={{ color: "var(--fg-2)" }}>cierre forzado</strong> y el motivo
                    quedará registrado en su historial.
                  </p>
                  <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12, fontWeight: 650, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Motivo del cierre forzado
                    <textarea
                      autoFocus
                      value={gateReason}
                      onChange={e => setGateReason(e.target.value)}
                      placeholder="Ej: El equipo fue dado de baja, no es posible tomar las fotos…"
                      rows={3}
                      // The field is autofocused, so the UA's default focus ring
                      // would otherwise sit on top of the 1px border and read as
                      // a heavy black outline.
                      onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                      style={{ resize: "vertical", minHeight: 80, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)", color: "var(--fg-1)", font: "inherit", fontSize: 14, lineHeight: 1.45, textTransform: "none", letterSpacing: 0, outline: "none" }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                    <button type="button" onClick={() => setGate(null)} disabled={gateBusy} style={{ height: 40, padding: "0 16px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-2)", font: "inherit", fontWeight: 600, cursor: gateBusy ? "default" : "pointer" }}>Cancelar</button>
                    <button
                      type="button"
                      onClick={confirmForceClose}
                      disabled={gateBusy || !gateReason.trim()}
                      style={{ height: 40, padding: "0 18px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", font: "inherit", fontWeight: 700, cursor: gateBusy || !gateReason.trim() ? "default" : "pointer", opacity: gateBusy || !gateReason.trim() ? 0.5 : 1 }}
                    >
                      {gateBusy ? "Cerrando…" : "Cerrar de todas formas"}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" onClick={() => setGate(null)} style={{ height: 40, padding: "0 18px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", font: "inherit", fontWeight: 700, cursor: "pointer" }}>Entendido</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
      {tab === "actividad" && <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", padding: "12px 16px", background: "var(--surface-1)" }}>
        {/* Recording indicator */}
        {recording && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--danger-bg)", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", display: "inline-block", animation: "pulse 1s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, color: "var(--danger)", flex: 1 }}>Grabando… {fmtRecDuration(recordingElapsed)}</span>
            <button type="button" onClick={stopRecording} style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "var(--danger)", border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>Detener</button>
          </div>
        )}
        {/* Pending audio preview */}
        {pendingAudio && !recording && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-hover)", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
            <Volume2 size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
            <audio controls src={pendingAudio.url} preload="metadata" style={{ height: 28, flex: 1, minWidth: 0 }} />
            <button type="button" onClick={() => { URL.revokeObjectURL(pendingAudio.url); setPendingAudio(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", alignItems: "center" }}>
              <X size={14} />
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          {/* Mic button */}
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={sending}
            title={recording ? "Detener grabación" : "Grabar audio"}
            style={{
              width: 38, height: 38, flexShrink: 0,
              background: recording ? "var(--danger-bg)" : "var(--surface-hover)",
              border: `1px solid ${recording ? "var(--danger)" : "var(--border)"}`,
              borderRadius: "var(--r-md)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {recording ? <MicOff size={15} style={{ color: "var(--danger)" }} /> : <Mic size={15} style={{ color: pendingAudio ? "var(--brand)" : "var(--fg-4)" }} />}
          </button>
          <textarea
            style={{
              flex: 1, minHeight: 42, maxHeight: 96, resize: "none",
              fontSize: 13, border: "1px solid var(--border)", borderRadius: "var(--r-md)",
              padding: "10px 12px", outline: "none", fontFamily: "inherit",
              background: "var(--surface-0)", color: "var(--fg-1)", lineHeight: 1.5,
              transition: "border-color 0.12s, box-shadow 0.12s",
            }}
            placeholder={pendingAudio ? "Añadir descripción (opcional)…" : "Agregar comentario…"}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.background = "var(--surface-1)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.boxShadow = "none"; }}
            onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendComment(); }}
          />
          <button
            type="button"
            onClick={sendComment}
            disabled={(!commentText.trim() && !pendingAudio) || sending}
            style={{
              width: 38, height: 38, flexShrink: 0,
              background: (commentText.trim() || pendingAudio) ? "var(--brand)" : "var(--border)",
              border: "none", borderRadius: "var(--r-md)", cursor: (commentText.trim() || pendingAudio) ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "opacity 0.15s",
            }}
          >
            {sending ? <Loader2 size={15} style={{ color: "var(--fg-on-brand)", animation: "spin 1s linear infinite" }} /> : <Send size={15} style={{ color: (commentText.trim() || pendingAudio) ? "var(--fg-on-brand)" : "var(--fg-4)" }} />}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 5, marginBottom: 0 }}>Ctrl+Enter para enviar</p>
      </div>}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

      {/* ── Export config modal ── */}
      {exportConfigOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setExportConfigOpen(false)}
        >
          <div
            style={{ background: "var(--surface-1)", borderRadius: 14, width: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.20)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>Exportar Excel</div>
                <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>Selecciona las secciones a incluir</div>
              </div>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-4)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Fields grouped */}
            <div style={{ padding: "8px 20px 4px", maxHeight: 380, overflowY: "auto" }}>
              {Array.from(new Set(EXPORT_FIELDS.map(f => f.group))).map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, paddingLeft: 10 }}>
                    {group}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    {EXPORT_FIELDS.filter(f => f.group === group).map(field => (
                      <label
                        key={field.key}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={exportFields[field.key]}
                          onChange={e => setExportFields(prev => ({ ...prev, [field.key]: e.target.checked }))}
                          style={{ width: 14, height: 14, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12.5, color: exportFields[field.key] ? "var(--fg-1)" : "var(--fg-4)" }}>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
              <button type="button" onClick={() => setExportFields(ALL_FIELDS_ON)}
                style={{ fontSize: 12, color: "var(--brand-fg)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Seleccionar todo
              </button>
              <span style={{ color: "var(--border)" }}>·</span>
              <button type="button" onClick={() => setExportFields(ALL_FIELDS_OFF)}
                style={{ fontSize: 12, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Limpiar
              </button>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-4)" }}>
                {Object.values(exportFields).filter(Boolean).length} seleccionados
              </span>
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 20px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setExportConfigOpen(false)}
                style={{ height: 36, padding: "0 16px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-1)", fontSize: 13, color: "var(--fg-2)", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
              >Cancelar</button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={!Object.values(exportFields).some(Boolean)}
                style={{
                  height: 36, padding: "0 18px", borderRadius: "var(--r-md)", border: "none",
                  background: Object.values(exportFields).some(Boolean) ? "var(--brand)" : "var(--border-strong)",
                  fontSize: 13, fontWeight: 600, color: "var(--fg-on-brand)",
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

      {/* ── PDF export config modal ── */}
      {pdfConfigOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setPdfConfigOpen(false)}
        >
          <div
            style={{ background: "var(--surface-1)", borderRadius: 14, width: 420, boxShadow: "0 20px 60px rgba(15,23,42,0.20)", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>Exportar PDF</div>
                <div style={{ fontSize: 12, color: "var(--fg-4)", marginTop: 2 }}>Selecciona las secciones a incluir</div>
              </div>
              <button
                type="button"
                onClick={() => setPdfConfigOpen(false)}
                style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-4)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Fields grouped */}
            <div style={{ padding: "8px 20px 4px", maxHeight: 380, overflowY: "auto" }}>
              {Array.from(new Set(PDF_FIELDS.map(f => f.group))).map(group => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4, paddingLeft: 10 }}>
                    {group}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
                    {PDF_FIELDS.filter(f => f.group === group).map(field => (
                      <label
                        key={field.key}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: "pointer" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface-hover)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <input
                          type="checkbox"
                          checked={pdfFields[field.key]}
                          onChange={e => setPdfFields(prev => ({ ...prev, [field.key]: e.target.checked }))}
                          style={{ width: 14, height: 14, accentColor: "var(--brand)", cursor: "pointer", flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12.5, color: pdfFields[field.key] ? "var(--fg-1)" : "var(--fg-4)" }}>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Select all / none */}
            <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, borderTop: "1px solid var(--divider)", paddingTop: 8 }}>
              <button type="button" onClick={() => setPdfFields(ALL_PDF_ON)}
                style={{ fontSize: 12, color: "var(--brand-fg)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Seleccionar todo
              </button>
              <span style={{ color: "var(--border)" }}>·</span>
              <button type="button" onClick={() => setPdfFields(ALL_PDF_OFF)}
                style={{ fontSize: 12, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
                Limpiar
              </button>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--fg-4)" }}>
                {Object.values(pdfFields).filter(Boolean).length} seleccionados
              </span>
            </div>

            {/* Footer */}
            <div style={{ padding: "10px 20px 16px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {!orden.parent_id && subOrdenes.length > 0 && (
                <button
                  type="button"
                  onClick={() => doExportPDF(true)}
                  disabled={!Object.values(pdfFields).some(Boolean)}
                  style={{
                    height: 36, padding: "0 18px", borderRadius: "var(--r-md)", border: "1px solid var(--brand)",
                    background: Object.values(pdfFields).some(Boolean) ? "var(--surface-1)" : "var(--surface-2)",
                    fontSize: 13, fontWeight: 600, color: Object.values(pdfFields).some(Boolean) ? "var(--brand-fg)" : "var(--fg-4)",
                    cursor: Object.values(pdfFields).some(Boolean) ? "pointer" : "default",
                    fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {exporting === "pdf" ? <><Loader2 size={13} className="animate-spin" />Generando...</> : <><FileDown size={13} />OT + subOTs</>}
                </button>
              )}
              <button
                type="button"
                onClick={() => setPdfConfigOpen(false)}
                style={{ height: 36, padding: "0 16px", borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-1)", fontSize: 13, color: "var(--fg-2)", cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--surface-1)"; }}
              >Cancelar</button>
              <button
                type="button"
                onClick={() => doExportPDF(false)}
                disabled={!Object.values(pdfFields).some(Boolean)}
                style={{
                  height: 36, padding: "0 18px", borderRadius: "var(--r-md)", border: "none",
                  background: Object.values(pdfFields).some(Boolean) ? "var(--brand)" : "var(--border-strong)",
                  fontSize: 13, fontWeight: 600, color: "var(--fg-on-brand)",
                  cursor: Object.values(pdfFields).some(Boolean) ? "pointer" : "default",
                  fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {exporting === "pdf" ? <><Loader2 size={13} className="animate-spin" />Generando…</> : <><FileDown size={13} />Exportar PDF</>}
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
  instruccion:        { icon: <Info size={13} />,          color: "var(--brand-fg)" },
  advertencia:        { icon: <AlertTriangle size={13} />, color: "var(--warning)" },
  texto:              { icon: <Type size={13} />,          color: "var(--brand-fg)" },
  numero:             { icon: <HashIcon size={13} />,      color: "var(--brand-fg)" },
  monto:              { icon: <DollarSign size={13} />,    color: "var(--success)" },
  si_no_na:           { icon: <CheckSquare size={13} />,   color: "var(--info)" },
  opcion_multiple:    { icon: <List size={13} />,          color: "var(--pr-high)" },
  lista_verificacion: { icon: <ListChecks size={13} />,    color: "var(--danger)" },
  inspeccion:         { icon: <ClipboardCheck size={13} />,color: "var(--pr-high)" },
  imagen:             { icon: <Camera size={13} />,        color: "var(--fg-2)" },
  firma:              { icon: <PenLine size={13} />,       color: "var(--info)" },
  // New tipos (Phase-3 rewrite will give them full renderers in ProcEjecucionDialog).
  medidor:            { icon: <HashIcon size={13} />,      color: "var(--brand-fg)" },
  archivo:            { icon: <Camera size={13} />,        color: "var(--fg-2)" },
  fecha:              { icon: <Type size={13} />,          color: "var(--brand-fg)" },
  hora:               { icon: <Type size={13} />,          color: "var(--brand-fg)" },
  fecha_hora:         { icon: <Type size={13} />,          color: "var(--brand-fg)" },
  escaneo:            { icon: <List size={13} />,          color: "var(--pr-high)" },
  falla_iso14224:     { icon: <AlertTriangle size={13} />, color: "var(--danger)" },
  sub_procedimiento:  { icon: <ClipboardCheck size={13} />,color: "var(--pr-high)" },
  seccion:            { icon: <Info size={13} />,          color: "var(--fg-3)" },
  puntuacion:         { icon: <CheckSquare size={13} />,   color: "var(--info)" },
};

function isAnsweredForType(paso: ProcedimientoPaso, resp: PendingResp | undefined): boolean {
  // Organizers and computed fields never block "completar".
  if (paso.tipo === "seccion" || paso.tipo === "puntuacion") return true;
  if (!resp) return false;
  switch (paso.tipo) {
    case "instruccion":
    case "advertencia":
      return true; // presence of any saved resp = acknowledged
    case "texto":          return !!resp.valor_texto;
    case "numero":         return resp.valor_medido != null;
    case "monto":          return resp.valor_medido != null;
    case "medidor":        return resp.valor_medido != null;
    case "si_no_na":       return !!resp.valor_texto;
    case "opcion_multiple":return !!resp.valor_texto;
    case "lista_verificacion": return resp.valor_json != null;
    case "inspeccion":     return resp.valor_json != null;
    case "imagen":         return !!resp.foto_url;
    case "archivo":        return !!resp.archivo_url;
    case "firma":          return !!resp.firma_svg;
    case "fecha":
    case "hora":
    case "fecha_hora":     return !!resp.valor_fecha;
    case "escaneo":        return !!resp.escaneo_valor;
    case "falla_iso14224": return !!resp.iso14224_modo;
    case "sub_procedimiento": return true; // Phase-5 will track child completion separately
    default:               return false;
  }
}

// Cloudflare Image Resizing rewrite — see lib/image-cdn.ts.
const optimizedProcedureImageUrl = optimizedImageUrl;

function signatureImageSrc(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("data:") || /^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("<svg")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}


/**
 * Un procedimiento ya ejecutado, desplegado dentro de Detalles: contador de
 * campos, cada paso como tarjeta con su respuesta y quién la rellenó, y la
 * firma como imagen. Espeja la vista de MaintainX y evita entrar a otra
 * pantalla solo para leer lo que se respondió.
 */
/** Nombre por tipo, para pasos guardados sin título. */
const TIPO_FALLBACK_LABEL: Partial<Record<ProcedimientoPaso["tipo"], string>> = {
  inspeccion: "Inspección",
  lista_verificacion: "Lista de verificación",
  si_no_na: "Verificación",
  firma: "Firma",
  imagen: "Foto",
  archivo: "Archivo",
  texto: "Texto",
  numero: "Valor numérico",
  monto: "Monto",
  medidor: "Lectura de medidor",
  fecha: "Fecha",
  hora: "Hora",
  fecha_hora: "Fecha y hora",
  opcion_multiple: "Opción múltiple",
};

function ProcedimientoEjecutado({
  otp, onPhotoClick, nombrePorUsuario,
  editable = false, ordenId, pendingResps, savingResp, onUpdateResp, onSaveResp, onPreviewImage,
  onEnsureEjecucion,
}: {
  otp: OTProcedimiento;
  onPhotoClick: (url: string) => void;
  /** UUID → nombre, para mostrar quién rellenó cada campo. */
  nombrePorUsuario: Map<string, string>;
  /** When false the card stays read-only (completed OT, or no permission). */
  editable?: boolean;
  /** Starts the ejecución so uploads have a real id to build their path with. */
  onEnsureEjecucion?: () => Promise<ProcedimientoEjecucion | null>;
  ordenId?: string;
  pendingResps?: Record<string, PendingResp>;
  savingResp?: string | null;
  onUpdateResp?: (pasoId: string, patch: PendingResp) => void;
  onSaveResp?: (pasoId: string, extra?: PendingResp) => void;
  onPreviewImage?: (urls: string[], index: number) => void;
}) {
  const proc = otp.procedimiento;
  const ejec = otp.ejecucion;

  // Start the ejecución as soon as an editable procedure is shown. File and photo
  // steps build their storage path from the ejecución id, so it has to exist
  // before the user can reach an upload control — not merely by the first save.
  const ensuringRef = useRef(false);
  // Held in a ref so an inline arrow from the parent can't retrigger the effect.
  const ensureRef = useRef(onEnsureEjecucion);
  useEffect(() => { ensureRef.current = onEnsureEjecucion; });
  useEffect(() => {
    if (!editable || ejec || ensuringRef.current) return;
    const run = ensureRef.current;
    if (!run) return;
    ensuringRef.current = true;
    run()
      .catch(() => { /* surfaced by the caller; the card stays uninitialised */ })
      .finally(() => { ensuringRef.current = false; });
  }, [editable, ejec, otp.procedimiento_id]);

  const pasos = (proc?.pasos ?? []) as ProcedimientoPaso[];
  const respByPaso = new Map<string, PendingResp>();
  for (const r of (ejec?.respuestas ?? []) as PendingResp[]) {
    if (r.paso_id) respByPaso.set(r.paso_id, r);
  }

  const answerable = pasos.filter(
    p => p.tipo !== "seccion" && p.tipo !== "instruccion" && p.tipo !== "advertencia",
  );
  const answered = answerable.filter(p => {
    const r = respByPaso.get(p.id);
    return r ? isAnsweredForType(p, r) : false;
  }).length;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)", marginBottom: 12 }}>
      {/* Encabezado del procedimiento */}
      <div style={{ background: "var(--brand)", color: "var(--fg-on-brand)", padding: "14px 18px", fontSize: 15, fontWeight: 700 }}>
        {proc?.nombre ?? "Procedimiento"}
      </div>

      {/* Contador de campos */}
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--fg-1)" }}>
          {answered} | {answerable.length}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 2 }}>Campos completados</div>
      </div>

      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {pasos.map(paso => {
          const resp = respByPaso.get(paso.id);

          // Secciones/instrucciones: encabezado en negrita, sin tarjeta.
          if (paso.tipo === "seccion" || paso.tipo === "instruccion" || paso.tipo === "advertencia") {
            return (
              <div key={paso.id} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--fg-1)", lineHeight: 1.4, marginTop: 4 }}>
                {paso.titulo}
                {paso.descripcion && (
                  <div style={{ fontSize: 13, fontWeight: 400, color: "var(--fg-2)", marginTop: 4, lineHeight: 1.5 }}>
                    {paso.descripcion}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={paso.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", lineHeight: 1.45 }}>
                {paso.titulo?.trim() || TIPO_FALLBACK_LABEL[paso.tipo] || "Campo"}
                {paso.requerido && (
                  <span aria-hidden="true" style={{ color: "var(--danger)", marginLeft: 2 }}>*</span>
                )}
                {paso.requerido && (
                  <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" }}>
                    {" "}(obligatorio)
                  </span>
                )}
              </div>
              {paso.descripcion && (
                <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 3, lineHeight: 1.45 }}>{paso.descripcion}</div>
              )}

              <div style={{ marginTop: 10 }}>
                {editable && onUpdateResp && onSaveResp && ordenId && ejec ? (
                  <PasoInput
                    paso={paso}
                    resp={pendingResps?.[paso.id] ?? {}}
                    existingResp={resp}
                    isSaving={savingResp === paso.id}
                    onUpdate={patch => onUpdateResp(paso.id, patch)}
                    onSave={extra => onSaveResp(paso.id, extra)}
                    ordenId={ordenId}
                    ejecucionId={ejec.id}
                    onPreviewImage={(urls, idx) => onPreviewImage?.(urls, idx)}
                  />
                ) : paso.tipo === "si_no_na"
                  ? <EstadoSegmento valor={resp?.valor_texto ?? null} variante="si_no_na" />
                  : resp
                    ? <ReadonlyAnswer paso={paso} resp={resp} onPhotoClick={onPhotoClick} />
                    : <div style={{ fontSize: 12.5, color: "var(--fg-4)" }}>Sin respuesta</div>}

                {/* La evidencia va aparte de la respuesta: cualquier tipo de
                    paso puede llevar fotos, no solo los de tipo imagen.
                    "imagen" ya las dibuja en ReadonlyAnswer. */}
                {resp && paso.tipo !== "imagen" && (
                  <EvidenciaFotos resp={resp} onPhotoClick={onPhotoClick} />
                )}
              </div>

              {(() => {
                // Quién y cuándo. La app móvil no llena firmado_nombre ni
                // firmado_por_id (siempre NULL), así que el autor se resuelve
                // con respondido_por, que sí viene siempre.
                const autor =
                  resp?.firmado_nombre ??
                  (resp?.firmado_por_id && nombrePorUsuario.get(resp.firmado_por_id)) ??
                  (resp?.respondido_por && nombrePorUsuario.get(resp.respondido_por)) ??
                  null;
                const fecha = resp?.firmado_at ?? resp?.respondido_at ?? null;
                if (!autor && !fecha) return null;
                const verbo = paso.tipo === "firma" ? "Firmado" : "Rellenado";
                return (
                  <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 10 }}>
                    {verbo} por <strong style={{ color: "var(--fg-2)" }}>{autor ?? "—"}</strong>
                    {fecha ? ` el ${new Date(fecha).toLocaleString("es-CL")}` : ""}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Los tres estados de un paso Sí/No/N-A, con el elegido resaltado. */
/**
 * Fotos de evidencia de un paso. Cualquier tipo puede llevarlas: la app móvil
 * las guarda en valor_json.evidence_images (y espeja la primera en foto_url),
 * pero la web no las mostraba en ningún paso que no fuera de tipo "imagen".
 */
function EvidenciaFotos({
  resp, onPhotoClick,
}: {
  resp: PendingResp;
  onPhotoClick?: (url: string) => void;
}) {
  const evid = (resp.valor_json as any)?.evidence_images;
  const urls: string[] = Array.isArray(evid) ? evid.filter((u: unknown) => typeof u === "string") : [];
  // foto_url suele ser la primera de evidence_images: se evita duplicarla.
  if (resp.foto_url && !urls.includes(resp.foto_url)) urls.unshift(resp.foto_url);
  if (urls.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {urls.map((u, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPhotoClick?.(u)}
          style={{ padding: 0, border: "none", background: "none", cursor: onPhotoClick ? "zoom-in" : "default", lineHeight: 0 }}
        >
          <img
            src={u}
            alt=""
            loading="lazy"
            decoding="async"
            style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", display: "block" }}
          />
        </button>
      ))}
    </div>
  );
}

function EstadoSegmento({ valor, variante = "inspeccion" }: { valor: string | null; variante?: "inspeccion" | "si_no_na" }) {
  const norm = (valor ?? "").toLowerCase();
  // Dos vocabularios distintos: la inspección evalúa (aprobado/alerta/falla) y
  // el paso Sí/No/N-A responde una pregunta. El orden de los segmentos y qué
  // valor enciende cada uno cambia entre ambos.
  const opciones: { label: string; match: string[]; color: string; bg: string }[] =
    variante === "si_no_na"
      ? [
          { label: "SÍ",  match: ["si", "sí", "yes", "true", "pass"], color: "var(--success)", bg: "var(--success-bg)" },
          { label: "NO",  match: ["no", "false", "fail"],             color: "var(--danger)",  bg: "var(--danger-bg)" },
          { label: "N/A", match: ["na", "n/a", "observation"],        color: "var(--fg-3)",    bg: "var(--surface-hover)" },
        ]
      : [
          { label: "OK",          match: ["si", "sí", "pass", "aprobado", "ok", "true"],     color: "var(--success)", bg: "var(--success-bg)" },
          // "na" es como las ejecuciones antiguas guardaban la opción del medio.
          { label: "OBSERVACIÓN", match: ["alerta", "warn", "warning", "observation", "na"], color: "var(--warning)", bg: "var(--st-wait-bg)" },
          { label: "NO CUMPLE",   match: ["no", "fail", "falla", "no_cumple", "false"],      color: "var(--danger)",  bg: "var(--danger-bg)" },
        ];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {opciones.map(o => {
        const active = o.match.includes(norm);
        return (
          <span
            key={o.label}
            style={{
              flex: 1, textAlign: "center", padding: "9px 6px",
              borderRadius: "var(--r-sm)", fontSize: 12, fontWeight: 600,
              border: `1px solid ${active ? o.color : "var(--border)"}`,
              background: active ? o.bg : "transparent",
              color: active ? o.color : "var(--fg-4)",
            }}
          >
            {o.label}
          </span>
        );
      })}
    </div>
  );
}

function ReadonlyAnswer({ paso, resp, onPhotoClick }: { paso: ProcedimientoPaso; resp: PendingResp; onPhotoClick?: (url: string) => void }) {
  const currency = paso.moneda ?? "CLP";
  switch (paso.tipo) {
    case "texto":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4, whiteSpace: "pre-wrap" }}>{resp.valor_texto}</div>;
    case "numero":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>{resp.valor_medido} {paso.unidad}</div>;
    case "monto":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>{currency} {resp.valor_medido?.toLocaleString("es-CL")}</div>;
    case "si_no_na":
    case "opcion_multiple":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>{resp.valor_texto}</div>;
    case "lista_verificacion": {
      // "N de M marcados" escondía justo lo que interesa: cuáles. Se listan
      // todos los ítems con su estado.
      const checked: string[] = (resp.valor_json as any)?.checked ?? [];
      const opciones = paso.opciones ?? [];
      if (opciones.length === 0 && checked.length === 0) return null;
      const lista = opciones.length > 0 ? opciones : checked;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          {lista.map((op, i) => {
            const done = checked.includes(op);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: done ? "var(--fg-1)" : "var(--fg-3)" }}>
                {done
                  ? <CheckCircle2 size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
                  : <Circle size={13} style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
                <span>{op}</span>
              </div>
            );
          })}
        </div>
      );
    }
    case "inspeccion": {
      // Cada ítem se muestra con el mismo segmento de tres estados que un paso
      // Sí/No/N-A, y debajo sus fotos. Un "3/3 pasaron" no decía qué se revisó
      // ni mostraba la evidencia, que sí estaba guardada.
      const items: { item: string; result: string; foto_urls?: string[] }[] = (resp.valor_json as any)?.items ?? [];
      if (items.length === 0) return null;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{it.item}</div>
              <EstadoSegmento valor={it.result} />
              {(it.foto_urls ?? []).length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(it.foto_urls ?? []).map((u, k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onPhotoClick?.(u)}
                      style={{ padding: 0, border: "none", background: "none", cursor: onPhotoClick ? "zoom-in" : "default", lineHeight: 0 }}
                    >
                      <img
                        src={u}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", display: "block" }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "imagen":
      if (!resp.foto_url) return null;
      const thumbUrl = optimizedProcedureImageUrl(resp.foto_url, 360);
      // If a click handler is provided, render the photo as a button that
      // opens the lightbox. Otherwise it's a plain static thumbnail.
      return onPhotoClick ? (
        <button
          type="button"
          onClick={() => onPhotoClick(resp.foto_url!)}
          style={{
            marginTop: 6, padding: 0, border: "1px solid var(--border)",
            borderRadius: "var(--r-sm)", background: "var(--surface-1)",
            cursor: "pointer", display: "inline-block", position: "relative",
          }}
          title="Click para ampliar"
        >
          <img
            src={thumbUrl}
            alt="foto"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              if (e.currentTarget.src !== resp.foto_url) e.currentTarget.src = resp.foto_url!;
            }}
            style={{ display: "block", width: 180, maxHeight: 140, objectFit: "cover", borderRadius: "var(--r-sm)", background: "var(--surface-hover)" }}
          />
          <span style={{
            position: "absolute", top: 4, right: 4,
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "2px 6px", fontSize: 10, fontWeight: 600,
            color: "#fff", background: "rgba(0,0,0,0.55)", borderRadius: 10,
          }}>
            <Image size={10} /> Ver
          </span>
        </button>
      ) : (
        <img
          src={thumbUrl}
          alt="foto"
          loading="lazy"
          decoding="async"
          onError={(e) => {
            if (e.currentTarget.src !== resp.foto_url) e.currentTarget.src = resp.foto_url!;
          }}
          style={{ marginTop: 6, width: 180, maxHeight: 140, objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-hover)" }}
        />
      );
    case "firma": {
      const src = signatureImageSrc(resp.firma_svg);
      return src
        ? (
          // La firma se captura con trazo fino sobre lienzo blanco: a tamaño
          // pequeño casi no se ve. Se renderiza grande y con contraste para
          // que el trazo sea legible al revisar o auditar la OT.
          <button
            type="button"
            onClick={() => onPhotoClick?.(src)}
            title="Ver firma en grande"
            style={{
              display: "block", marginTop: 6, padding: 10, width: "100%", maxWidth: 560,
              boxSizing: "border-box", textAlign: "left",
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              background: "#fff",
              cursor: onPhotoClick ? "zoom-in" : "default",
            }}
          >
            <img
              src={src}
              alt="firma"
              loading="lazy"
              decoding="async"
              style={{
                width: "100%", height: 200, display: "block",
                // Alineada a la izquierda: centrada quedaba flotando en medio
                // de una caja ancha y se leía como un error de maquetación.
                objectFit: "contain", objectPosition: "left center",
                filter: "contrast(1.6) saturate(0)",
              }}
            />
          </button>
        )
        : <div style={{ fontSize: 12.5, color: "var(--success)", marginTop: 4 }}>✓ Firmado</div>;
    }
    case "medidor":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>{resp.valor_medido} {paso.unidad}{resp.lectura_delta != null ? ` (Δ ${resp.lectura_delta})` : ""}</div>;
    case "fecha":
    case "hora":
    case "fecha_hora":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>{resp.valor_fecha ? new Date(resp.valor_fecha).toLocaleString() : ""}</div>;
    case "archivo":
      return resp.archivo_url
        ? <a href={resp.archivo_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--brand)", marginTop: 4, display: "inline-block" }}>📎 {resp.archivo_nombre ?? "Archivo"}</a>
        : null;
    case "escaneo":
      return <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{resp.escaneo_valor}</div>;
    case "falla_iso14224":
      return (
        <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {resp.iso14224_modo && <span><strong>Modo:</strong> {resp.iso14224_modo}</span>}
          {resp.iso14224_causa && <span><strong>Causa:</strong> {resp.iso14224_causa}</span>}
          {resp.iso14224_mecanismo && <span><strong>Mec:</strong> {resp.iso14224_mecanismo}</span>}
          {resp.iso14224_accion && <span><strong>Acc:</strong> {resp.iso14224_accion}</span>}
        </div>
      );
    case "seccion":
      return null;
    case "puntuacion":
      return resp.puntaje_obtenido != null
        ? <div style={{ fontSize: 12.5, color: "var(--fg-2)", marginTop: 4 }}>Puntaje: <strong>{resp.puntaje_obtenido}</strong></div>
        : null;
    case "sub_procedimiento":
      return <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4 }}>Sub-procedimiento referenciado.</div>;
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
  const [open, setOpen] = useState(false);
  // Clearing discards a signed record, so it asks first.
  const [confirmClear, setConfirmClear] = useState(false);

  // Runs when the modal opens: the canvas is unmounted until then, so the
  // context has to be configured (and any existing signature redrawn) each time.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    // Tinta fija a propósito: la firma se guarda como imagen y se imprime en el
    // PDF, así que no puede seguir el tema (en oscuro quedaría blanca sobre
    // blanco en el reporte).
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.fillStyle = "#0F172A";
    const normalizedExisting = signatureImageSrc(existingDataUrl);
    if (normalizedExisting) {
      const img = new window.Image();
      // Flag the strokes only once the bitmap is actually on the canvas, so a
      // failed load can't leave the modal claiming a signature it never drew.
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        setHasStrokes(true);
        setSaved(true);
      };
      img.src = normalizedExisting;
    }
  }, [open, existingDataUrl]);

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

  const existingSrc = signatureImageSrc(existingDataUrl);

  // Signing happens in a modal: a canvas sitting inline in a scrolling form
  // swallows drag gestures and gives too little room to sign comfortably.
  return (
    <div>
      {existingSrc && !open ? (
        <>
          <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-0)", padding: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={existingSrc} alt="Firma registrada" style={{ display: "block", width: "100%", maxHeight: 120, objectFit: "contain" }} />
          </div>
          <button
            onClick={() => setConfirmClear(true)}
            disabled={isSaving}
            style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: isSaving ? "default" : "pointer", fontSize: 13, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit" }}
          >
            Limpiar
          </button>
        </>
      ) : (
        <button
          onClick={() => setOpen(true)}
          style={{
            width: "100%", minHeight: 96, display: "grid", placeItems: "center",
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            background: "var(--surface-0)", cursor: "pointer",
            fontSize: 13.5, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit",
          }}
        >
          Haz clic aquí para firmar
        </button>
      )}

      {confirmClear && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmClear(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 810, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Eliminar firma" style={{ width: "min(420px, 100%)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", padding: 24 }}>
            <p style={{ margin: "0 0 20px", fontSize: 14.5, lineHeight: 1.5, color: "var(--fg-1)", textAlign: "center" }}>
              ¿Estás seguro de que quieres eliminar la firma?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => { setHasStrokes(false); setSaved(false); onSave(""); setConfirmClear(false); }}
                style={{ width: "100%", height: 42, border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                style={{ background: "none", border: "none", padding: 4, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 800, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Firma" style={{ width: "min(720px, 100%)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: 58, padding: "0 16px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>Firma a continuación:</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--fg-1)", display: "grid", placeItems: "center", cursor: "pointer" }}><X size={18} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <canvas
                ref={canvasRef}
                width={880}
                height={280}
                style={{
                  width: "100%", height: 240, display: "block",
                  border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                  background: "#FFFFFF", cursor: "crosshair", touchAction: "none",
                }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
              <button
                onClick={clear}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit" }}
              >
                Limpiar
              </button>
              <button
                onClick={() => { save(); setOpen(false); }}
                disabled={!hasStrokes || isSaving}
                style={{
                  height: 40, padding: "0 20px", border: "none", borderRadius: "var(--r-md)",
                  background: hasStrokes ? "var(--brand)" : "var(--surface-2)",
                  color: hasStrokes ? "var(--fg-on-brand)" : "var(--fg-4)",
                  cursor: hasStrokes && !isSaving ? "pointer" : "default",
                  fontSize: 13.5, fontWeight: 700, fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PasoInput({
  paso, resp, existingResp, isSaving, onUpdate, onSave, ordenId, ejecucionId, onPreviewImage,
}: {
  paso: ProcedimientoPaso;
  resp: PendingResp;
  existingResp: PendingResp | undefined;
  isSaving: boolean;
  onUpdate: (patch: PendingResp) => void;
  onSave: (extra?: PendingResp) => void;
  ordenId: string;
  ejecucionId: string;
  onPreviewImage: (urls: string[], index: number) => void;
}) {
  const val = (k: keyof PendingResp) => (resp as any)[k] ?? (existingResp as any)?.[k];
  const responseJson = ((val("valor_json") as Record<string, unknown> | null) ?? {});
  const evidenceUrls = Array.isArray(responseJson.evidence_images)
    ? responseJson.evidence_images.filter((url): url is string => typeof url === "string" && url.length > 0)
    : val("foto_url") ? [val("foto_url") as string] : [];
  const inputStyle: React.CSSProperties = {
    width: "100%", height: 40, padding: "0 12px",
    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
    fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
    background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
  };
  /**
   * Autosave helper for free-text/number fields, which save on blur rather than
   * on every keystroke. Only writes when the pending value actually differs from
   * what is already stored, so tabbing through a form issues no requests.
   */
  const saveIfDirty = () => {
    const keys: (keyof PendingResp)[] = ["valor_texto", "valor_medido", "notas", "valor_fecha"];
    const dirty = keys.some(k => resp[k] !== undefined && resp[k] !== (existingResp as any)?.[k]);
    if (dirty) onSave();
  };

  const saveBtn = (label: string, disabled = false) => (
    <button
      onClick={() => onSave()}
      disabled={isSaving || disabled}
      style={{
        height: 30, padding: "0 14px", background: "var(--brand-tint)",
        border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", cursor: disabled || isSaving ? "default" : "pointer",
        fontSize: 12, fontWeight: 600, color: "var(--brand-fg)", fontFamily: "inherit",
        display: "flex", alignItems: "center", gap: 4, opacity: disabled ? 0.5 : 1,
      }}
    >
      {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
      {label}
    </button>
  );

  if (paso.tipo === "instruccion" || paso.tipo === "advertencia") {
    const isAck = !!existingResp;
    const bg = paso.tipo === "instruccion" ? "var(--brand-tint)" : "var(--warning-bg)";
    const bc = paso.tipo === "instruccion" ? "var(--brand)" : "var(--warning)";
    const tc = paso.tipo === "instruccion" ? "var(--brand-fg)" : "var(--warning)";
    return (
      <button
        onClick={() => onSave({})}
        disabled={isAck || isSaving}
        style={{ height: 28, padding: "0 12px", background: isAck ? "var(--success-bg)" : bg, border: `1px solid ${isAck ? "var(--success)" : bc}`, borderRadius: "var(--r-sm)", cursor: isAck ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: isAck ? "var(--success)" : tc, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}
      >
        {isSaving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
        {isAck ? (paso.tipo === "instruccion" ? "Confirmado" : "Leído y entendido") : (paso.tipo === "instruccion" ? "Confirmar lectura" : "Leído y entendido")}
      </button>
    );
  }

  if (paso.tipo === "si_no_na") {
    const cur = val("valor_texto");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Las tres opciones van en una fila de celdas iguales: es un set corto y
            excluyente, y apiladas ocupaban tres veces el alto sin ganar nada. */}
        <div style={{ display: "flex", gap: 10 }}>
        {["Sí", "No", "N/A"].map(opt => (
          <button
            key={opt}
            onClick={() => onSave({ valor_texto: opt })}
            disabled={isSaving}
            style={{
              flex: 1, minWidth: 0,
              minHeight: 42, padding: "0 16px", borderRadius: "var(--r-sm)", cursor: "pointer",
              fontSize: 14, fontWeight: 500, fontFamily: "inherit",
              // La opción elegida se marca con el azul de marca, no con
              // semáforo: "No" y "N/A" son respuestas válidas, no errores.
              border: `1px solid ${cur === opt ? "var(--brand)" : "var(--border)"}`,
              background: cur === opt ? "var(--brand-tint)" : "var(--surface-1)",
              color: "var(--brand)",
            }}
          >
            {isSaving && cur === opt ? <Loader2 size={11} className="animate-spin" /> : opt}
          </button>
        ))}
        </div>
        {cur && (
          <PasoExtras
            pasoId={paso.id} ordenId={ordenId} ejecucionId={ejecucionId}
            fotoUrls={evidenceUrls} isSaving={isSaving} onPreview={onPreviewImage}
            nota={(val("notas") as string | null | undefined) ?? ""}
            onNotaChange={v => onUpdate({ notas: v })}
            onNotaCommit={saveIfDirty}
            inputStyle={inputStyle}
            onUploaded={(url) => { const next = [...evidenceUrls, url]; onSave({ valor_json: { ...responseJson, evidence_images: next }, foto_url: next[0] ?? null }); }}
            onClearPhoto={(url) => { const next = evidenceUrls.filter(current => current !== url); onSave({ valor_json: { ...responseJson, evidence_images: next }, foto_url: next[0] ?? null }); }}
          />
        )}
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
            // Igual que la lista de verificación: fila limpia, el control es
            // quien marca el estado.
            style={{
              minHeight: 34, padding: "4px 2px", borderRadius: "var(--r-sm)", cursor: "pointer",
              fontSize: 14, fontWeight: 400, fontFamily: "inherit", textAlign: "left",
              border: "none", background: "transparent", color: "var(--fg-1)",
              display: "flex", alignItems: "center", gap: 10,
            }}
          >
            <span style={{ width: 17, height: 17, borderRadius: "50%", border: `1.5px solid ${cur === opt ? "var(--brand)" : "var(--border-strong)"}`, display: "grid", placeItems: "center", flexShrink: 0 }}>
              {cur === opt && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--brand)" }} />}
            </span>
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
              // Filas limpias, sin relleno ni borde: la casilla marcada ya
              // comunica el estado y un bloque de color por ítem satura la lista.
              style={{
                minHeight: 34, padding: "4px 2px", borderRadius: "var(--r-sm)", cursor: "pointer",
                fontSize: 14, fontWeight: 400, fontFamily: "inherit", textAlign: "left",
                border: "none", background: "transparent", color: "var(--fg-1)",
                display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ width: 17, height: 17, borderRadius: 3, border: `1.5px solid ${isChecked ? "var(--brand)" : "var(--border-strong)"}`, background: isChecked ? "var(--brand)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isChecked && <Check size={12} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  if (paso.tipo === "inspeccion") {
    const items: { item: string; result: "pass" | "fail" | "na" | ""; foto_urls?: string[]; nota?: string }[] =
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
          <div key={item} style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{item}</span>
            {/* Fila de celdas iguales, como el resto de los selectores cortos.
                Cada opción lleva siempre su color: el estado se lee de un
                vistazo aunque el ítem todavía no tenga respuesta. */}
            <div style={{ display: "flex", gap: 10 }}>
            {/* Orden APROBADO → ALERTA → FALLA: de mejor a peor, como el resto
                de las escalas de la app. */}
            {(["pass", "na", "fail"] as const).map(r => {
              const labels = { pass: "APROBADO", fail: "FALLA", na: "ALERTA" };
              const colors = { pass: "var(--success)", fail: "var(--danger)", na: "var(--warning)" };
              return (
                <button
                  key={r}
                  onClick={() => setResult(item, r)}
                  disabled={isSaving}
                  style={{
                    flex: 1, minWidth: 0,
                    minHeight: 42, padding: "0 10px", borderRadius: "var(--r-sm)", cursor: "pointer",
                    fontSize: 13, fontWeight: 600, fontFamily: "inherit", letterSpacing: "0.02em",
                    border: `1px solid ${result === r ? colors[r] : "var(--border)"}`,
                    background: result === r ? colors[r] + "15" : "var(--surface-1)",
                    color: colors[r],
                  }}
                >
                  {labels[r]}
                </button>
              );
            })}
            </div>
            {result && (
              <PasoExtras
                pasoId={`${paso.id}-${item}`} ordenId={ordenId} ejecucionId={ejecucionId}
                fotoUrls={items.find(i => i.item === item)?.foto_urls ?? []}
                isSaving={isSaving} onPreview={onPreviewImage}
                nota={items.find(i => i.item === item)?.nota ?? ""}
                onNotaChange={v => onUpdate({ valor_json: { items: items.map(i => i.item === item ? { ...i, nota: v } : i) } })}
                onNotaCommit={() => onSave()}
                inputStyle={inputStyle}
                onUploaded={(url) => onSave({ valor_json: { items: items.map(i => i.item === item ? { ...i, foto_urls: [...(i.foto_urls ?? []), url] } : i) } })}
                onClearPhoto={(url) => onSave({ valor_json: { items: items.map(i => i.item === item ? { ...i, foto_urls: (i.foto_urls ?? []).filter(current => current !== url) } : i) } })}
              />
            )}
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
            placeholder="Introducir texto"
            style={{ ...inputStyle, height: "auto", minHeight: 72, padding: "7px 10px", resize: "vertical", lineHeight: 1.5 }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
            // Autosave on blur: no explicit Save button to forget to press.
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; saveIfDirty(); }}
          />
        ) : (
          <input
            type="text"
            value={cur}
            onChange={e => onUpdate({ valor_texto: e.target.value })}
            placeholder="Introducir texto"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; saveIfDirty(); }}
          />
        )}
      </div>
    );
  }

  if (paso.tipo === "numero" || paso.tipo === "monto") {
    const currency = paso.moneda ?? "CLP";
    return (
      <NumericInputField
        value={val("valor_medido")}
        onChange={(n) => onUpdate({ valor_medido: n })}
        inputStyle={inputStyle}
        placeholder={paso.tipo === "monto" ? "Introducir importe" : "Introducir número"}
        prefix={paso.tipo === "monto" ? currency : undefined}
        suffix={paso.tipo === "numero" ? paso.unidad ?? undefined : undefined}
        rangeHint={paso.tipo === "numero" && paso.valor_min != null ? `${paso.valor_min} – ${paso.valor_max}` : undefined}
        onCommit={saveIfDirty}
      />
    );
  }

  if (paso.tipo === "imagen") {
    return (
      <PasoImagenField
        pasoId={paso.id}
        ordenId={ordenId}
        ejecucionId={ejecucionId}
        fotoUrl={(val("foto_url") as string | null | undefined) ?? null}
        isSaving={isSaving}
        onPreview={onPreviewImage}
        onUploaded={(url) => onSave({ foto_url: url })}
        onClear={() => onSave({ foto_url: null })}
      />
    );
  }

  if (paso.tipo === "firma") {
    return (
      <div>
        {paso.rol_firmante && (
          <div style={{ fontSize: 12, color: "var(--fg-2)", marginBottom: 6 }}>
            Firma de: <strong>{paso.rol_firmante}</strong>
          </div>
        )}
        <SignatureCanvas
          existingDataUrl={existingResp?.firma_svg ?? null}
          isSaving={isSaving}
          onSave={dataUrl => onSave(dataUrl
            ? { firma_svg: dataUrl, firmado_at: new Date().toISOString() }
            // Empty means the user cleared it: wipe the signature and its
            // timestamp rather than storing a blank image.
            : { firma_svg: null, firmado_at: null })}
        />
      </div>
    );
  }

  if (paso.tipo === "medidor") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <NumericInputField value={val("valor_medido")} onChange={(n) => onUpdate({ valor_medido: n })} inputStyle={inputStyle} placeholder="Lectura" width={140} suffix={paso.unidad ?? undefined} rangeHint={paso.valor_min != null && paso.valor_max != null ? `${paso.valor_min} – ${paso.valor_max}` : undefined} onCommit={saveIfDirty} />
        <PasoImagenField pasoId={paso.id} ordenId={ordenId} ejecucionId={ejecucionId} fotoUrls={evidenceUrls} isSaving={isSaving} onPreview={onPreviewImage} onUploaded={(url) => { const next = [...evidenceUrls, url]; onSave({ valor_json: { ...responseJson, evidence_images: next }, foto_url: next[0] ?? null }); }} onClear={(url) => { const next = evidenceUrls.filter(current => current !== url); onSave({ valor_json: { ...responseJson, evidence_images: next }, foto_url: next[0] ?? null }); }} />
      </div>
    );
  }

  if (paso.tipo === "fecha" || paso.tipo === "hora" || paso.tipo === "fecha_hora") {
    const inputType = paso.tipo === "fecha" ? "date" : paso.tipo === "hora" ? "time" : "datetime-local";
    const stored = (val("valor_fecha") as string | null | undefined) ?? "";
    // For <input type="datetime-local"> we strip seconds + tz to render correctly.
    const displayed = stored
      ? (paso.tipo === "fecha"
          ? new Date(stored).toISOString().slice(0, 10)
          : paso.tipo === "hora"
            ? new Date(stored).toISOString().slice(11, 16)
            : new Date(stored).toISOString().slice(0, 16))
      : "";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type={inputType}
          value={displayed}
          onChange={e => {
            // Convert back to a full ISO timestamp for the column (timestamptz).
            const v = e.target.value;
            // A date picker commits a whole value at once, so save immediately
            // rather than waiting for a blur the user may never trigger.
            if (!v) {
              onUpdate({ valor_fecha: null });
              onSave({ valor_fecha: null });
              return;
            }
            const iso = paso.tipo === "hora"
              ? `1970-01-01T${v}:00.000Z`
              : new Date(v).toISOString();
            onUpdate({ valor_fecha: iso });
            onSave({ valor_fecha: iso });
          }}
          style={{ ...inputStyle, width: 200 }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      </div>
    );
  }

  if (paso.tipo === "archivo") {
    const url = (val("archivo_url") as string | null | undefined) ?? null;
    const name = (val("archivo_nombre") as string | null | undefined) ?? null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {url && <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--brand)" }}>📎 {name ?? "Archivo subido"}</a>}
        <input
          type="file"
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const folder = `ordenes/${ordenId}/procedimientos/${ejecucionId}/${paso.id}`;
              const u = await uploadToR2(f, folder);
              onSave({ archivo_url: u, archivo_nombre: f.name, archivo_mime: f.type || null });
            } catch (err: any) {
              alert(err?.message ?? "Error al subir archivo");
            } finally {
              e.target.value = "";
            }
          }}
          style={{ fontSize: 12 }}
        />
      </div>
    );
  }

  if (paso.tipo === "escaneo") {
    const cur = (val("escaneo_valor") as string | null | undefined) ?? "";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          value={cur}
          onChange={e => onUpdate({ escaneo_valor: e.target.value })}
          onBlur={() => { if (resp.escaneo_valor !== undefined && resp.escaneo_valor !== existingResp?.escaneo_valor) onSave(); }}
          placeholder="Introducir código"
          style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
          onBlurCapture={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
      </div>
    );
  }

  if (paso.tipo === "falla_iso14224") {
    // Inline lightweight cascade — real picker fed by workspace_taxonomias
    // lands later. Keep four free-text fields so users can record now.
    const fields: { key: "iso14224_modo" | "iso14224_causa" | "iso14224_mecanismo" | "iso14224_accion"; label: string }[] = [
      { key: "iso14224_modo",      label: "Modo" },
      { key: "iso14224_causa",     label: "Causa" },
      { key: "iso14224_mecanismo", label: "Mecanismo" },
      { key: "iso14224_accion",    label: "Acción" },
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <label style={{ fontSize: 11, color: "var(--fg-3)", fontWeight: 600 }}>{f.label}</label>
            <input
              type="text"
              value={(val(f.key) as string | null | undefined) ?? ""}
              onChange={e => onUpdate({ [f.key]: e.target.value || null } as PendingResp)}
              style={{ ...inputStyle }}
              placeholder="—"
            />
          </div>
        ))}
        <div style={{ gridColumn: "1 / -1" }}>
          {saveBtn("Guardar", !val("iso14224_modo"))}
        </div>
      </div>
    );
  }

  if (paso.tipo === "seccion") {
    return null; // organizer — no input
  }

  if (paso.tipo === "puntuacion") {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-3)", fontStyle: "italic" }}>
        Puntaje calculado automáticamente al completar.
      </div>
    );
  }

  if (paso.tipo === "sub_procedimiento") {
    return (
      <div style={{ fontSize: 12, color: "var(--fg-3)", fontStyle: "italic" }}>
        Este paso embebe un sub-procedimiento (selector próximamente).
      </div>
    );
  }

  return null;
}

// ── NumericInputField ─────────────────────────────────────────────────────────
// Replacement for `<input type="number">` that preserves a partially-typed
// decimal point. The old code stringified the parsed value back into `value=`,
// so typing "12." became "12" mid-keystroke, blocking decimals entirely.
// This component holds a draft string locally; the parent only sees the parsed
// number once it's actually a finite number.
function NumericInputField({
  value, onChange, inputStyle, placeholder, prefix, suffix, rangeHint, width = 120, renderSaveBtn,
  onCommit,
}: {
  value: number | null | undefined;
  onChange: (n: number | null | undefined) => void;
  inputStyle: React.CSSProperties;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  rangeHint?: string;
  width?: number;
  renderSaveBtn?: (disabled: boolean) => React.ReactNode;
  /** Autosave hook: fires on blur once the user leaves the field. */
  onCommit?: () => void;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  // When the upstream value changes (e.g. after save), resync the draft so
  // the next time we open the field it shows the saved value.
  useEffect(() => {
    if (value == null) {
      setDraft("");
      return;
    }
    // Only resync if the draft would parse to something different — avoids
    // overwriting an in-flight "12." with "12" while typing.
    const parsed = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed !== value) {
      setDraft(String(value));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Un solo campo a lo ancho, con la moneda, la unidad y el rango DENTRO del
  // borde. Antes colgaban a la derecha del input y cada paso quedaba con un
  // ancho distinto, así que la columna de respuestas no alineaba nunca.
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        height: 40, padding: "0 12px", boxSizing: "border-box",
        border: `1px solid ${focused ? "var(--brand)" : "var(--border)"}`,
        borderRadius: "var(--r-sm)", background: "var(--surface-1)",
      }}
    >
      {prefix && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-3)", flexShrink: 0 }}>{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.,-]/g, "").replace(",", ".");
          setDraft(cleaned);
          if (cleaned === "" || cleaned === "." || cleaned === "-") {
            onChange(undefined);
            return;
          }
          const n = parseFloat(cleaned);
          if (Number.isFinite(n)) onChange(n);
        }}
        placeholder={placeholder ?? "Introducir número"}
        style={{
          flex: 1, minWidth: 0, height: "100%", padding: 0,
          border: "none", outline: "none", background: "transparent",
          fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); onCommit?.(); }}
      />
      {suffix && <span style={{ fontSize: 13, color: "var(--fg-3)", flexShrink: 0 }}>{suffix}</span>}
      {rangeHint && <span style={{ fontSize: 12, color: "var(--fg-4)", flexShrink: 0 }}>({rangeHint})</span>}
      {renderSaveBtn?.(!draft || draft === "." || draft === "-")}
    </div>
  );
}

// ── PasoExtras ────────────────────────────────────────────────────────────────
// Notes and attachments for an answered step. Both start collapsed behind text
// links: most answers need neither, and showing an empty dropzone plus a note
// box under every step buried the actual questions.

function PasoExtras({
  pasoId, ordenId, ejecucionId, fotoUrls, isSaving, onPreview,
  nota, onNotaChange, onNotaCommit, inputStyle, onUploaded, onClearPhoto,
}: {
  pasoId: string;
  ordenId: string;
  ejecucionId: string;
  fotoUrls: string[];
  isSaving: boolean;
  onPreview: (urls: string[], index: number) => void;
  nota: string;
  onNotaChange: (value: string) => void;
  onNotaCommit: () => void;
  inputStyle: React.CSSProperties;
  onUploaded: (url: string) => void;
  onClearPhoto: (url: string) => void;
}) {
  // Anything already filled in stays open, so a saved note or photo is never
  // hidden behind a link the user has to rediscover.
  const [showNota, setShowNota] = useState(!!nota);
  const [showFotos, setShowFotos] = useState(fotoUrls.length > 0);

  const linkStyle: React.CSSProperties = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    fontSize: 13, fontWeight: 500, color: "var(--brand)", fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(!showNota || !showFotos) && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {!showNota && <button type="button" onClick={() => setShowNota(true)} style={linkStyle}>+ Añadir notas</button>}
          {!showFotos && <button type="button" onClick={() => setShowFotos(true)} style={linkStyle}>+ Agregar Imágenes/Archivos</button>}
        </div>
      )}

      {showFotos && (
        <PasoImagenField
          pasoId={pasoId} ordenId={ordenId} ejecucionId={ejecucionId}
          fotoUrls={fotoUrls} isSaving={isSaving} onPreview={onPreview}
          onUploaded={onUploaded} onClear={onClearPhoto}
        />
      )}

      {showNota && (
        <textarea
          value={nota}
          onChange={e => onNotaChange(e.target.value)}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; onNotaCommit(); }}
          placeholder="Introducir nota"
          rows={2}
          style={{ ...inputStyle, height: "auto", minHeight: 64, padding: "9px 12px", resize: "vertical", lineHeight: 1.5 }}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
        />
      )}
    </div>
  );
}

// ── PasoImagenField (web) ─────────────────────────────────────────────────────
// Real R2-backed photo upload for the "imagen" step type. Uses the existing
// lib/r2.ts uploadToR2 helper — same path as OT/foto-grupo uploads on web.
// `capture="environment"` opens the device camera on mobile browsers.

function PasoImagenField({
  pasoId, ordenId, ejecucionId, fotoUrl, fotoUrls, isSaving, onUploaded, onClear, onPreview,
}: {
  pasoId: string;
  ordenId: string;
  ejecucionId: string;
  fotoUrl?: string | null;
  fotoUrls?: string[];
  isSaving: boolean;
  onUploaded: (url: string) => void;
  onClear: (url: string) => void;
  onPreview: (urls: string[], index: number) => void;
}) {
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Deleting an attachment is destructive and the trash icon is easy to hit by
  // accident on a dense card, so it confirms first.
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setUploading(true);
    try {
      // Inspection steps qualify pasoId with the item label, which is free text
      // and can carry spaces or accents. The presign endpoint rejects those, so
      // the segment is sanitised rather than passed through verbatim.
      const safePasoId = pasoId.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
      const folder = `ordenes/${ordenId}/procedimientos/${ejecucionId}/${safePasoId || "paso"}`;
      const url = await uploadToR2(f, folder);
      onUploaded(url);
    } catch (e: any) {
      // The raw error carries the presign JSON payload, which means nothing to
      // the person filling in the procedure.
      console.error("[paso-imagen] fallo la subida", e);
      setErr("No se pudo subir el archivo. Inténtalo nuevamente.");
    } finally {
      setUploading(false);
      // Reset the input so picking the same file twice still fires onChange.
      if (libraryInputRef.current) libraryInputRef.current.value = "";
    }
  }

  const busy = uploading || isSaving;
  const urls = fotoUrls ?? (fotoUrl ? [fotoUrl] : []);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10, width: "100%" }}>
      {/* Los adjuntos van en su propio panel sobre la zona de carga: la miniatura
          a la izquierda con su formato, y la papelera al extremo derecho. */}
      {urls.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", width: "100%", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-canvas)", overflow: "hidden" }}>
          {urls.map((url, index) => (
            <div key={url} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderTop: index === 0 ? "none" : "1px solid var(--border)" }}>
              <span style={{ flexShrink: 0, padding: "5px 8px", borderRadius: "var(--r-xs)", background: "var(--surface-1)", fontSize: 10.5, fontWeight: 600, color: "var(--fg-3)", textTransform: "uppercase" }}>
                {(url.split("?")[0].split(".").pop() ?? "img").slice(0, 4)}
              </span>
              <button type="button" onClick={() => onPreview(urls, index)} style={{ padding: 0, border: 0, background: "transparent", cursor: "zoom-in", flexShrink: 0 }} aria-label="Ver imagen">
                <img
                  src={optimizedProcedureImageUrl(url, 480)}
                  alt="Foto del paso"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { if (e.currentTarget.src !== url) e.currentTarget.src = url; }}
                  style={{ display: "block", width: 180, height: 180, objectFit: "contain", background: "transparent" }}
                />
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setConfirmDelete(url)} disabled={busy} aria-label="Quitar imagen" style={{ flexShrink: 0, width: 32, height: 32, display: "grid", placeItems: "center", padding: 0, border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--fg-2)", cursor: busy ? "default" : "pointer" }}>
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Una sola zona de carga en vez de dos botones: el selector de archivos
          del sistema ya ofrece cámara en móvil, así que separarlos duplicaba la
          decisión sin agregar nada. */}
      <button
        type="button"
        onClick={() => libraryInputRef.current?.click()}
        disabled={busy}
        // Mismo vacío punteado tenue que Procedimiento y Adjuntos.
        style={{
          width: "100%", minHeight: 96, padding: "16px 12px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
          border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)",
          background: "var(--surface-canvas)",
          cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
          fontSize: 13, fontWeight: 500, color: "var(--brand)", fontFamily: "inherit",
        }}
      >
        {uploading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
        {uploading ? "Subiendo…" : "Agregar Imágenes/Archivos"}
      </button>
      {err && <div style={{ fontSize: 11, color: "var(--danger)" }}>{err}</div>}
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {confirmDelete && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 820, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Eliminar archivo adjunto" style={{ width: "min(440px, 100%)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)", padding: 24, textAlign: "left" }}>
            <p style={{ margin: "0 0 22px", fontSize: 15, fontWeight: 600, lineHeight: 1.45, color: "var(--fg-1)" }}>
              ¿Estás seguro de que quieres eliminar el archivo adjunto?
            </p>
            <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{ background: "none", border: "none", padding: 4, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { onClear(confirmDelete); setConfirmDelete(null); }}
                style={{ height: 40, padding: "0 20px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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

  // Per-paso "editing after completion" state. Tap "Editar" on a completed
  // paso card → that paso re-renders its input widget so the user can change
  // the value and re-save. Saved values trigger the audit-log trigger so we
  // get full edit history for ISO 9001 cl. 7.5.3.
  const [editingPasos, setEditingPasos] = useState<Record<string, boolean>>({});

  // Lightbox preview for a foto step. Clicking the thumbnail opens it full-
  // screen with a "Reemplazar" button. (PhotoEditor proper is mobile-only;
  // on web we keep it to preview + replace, no in-browser annotation.)
  const [lightboxImages, setLightboxImages] = useState<{ urls: string[]; idx: number } | null>(null);

  const savedResps: Record<string, PendingResp> = {};
  for (const r of ejec.respuestas ?? []) savedResps[r.paso_id] = r as PendingResp;

  const allRequired = pasos.filter(p => p.requerido && p.tipo !== "instruccion" && p.tipo !== "advertencia");
  const answeredRequired = allRequired.filter(p => isAnsweredForType(p, savedResps[p.id]));

  const canComplete = answeredRequired.length === allRequired.length;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15,23,42,0.50)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: "var(--surface-1)", width: "100%", maxWidth: 680, maxHeight: "85vh", borderRadius: 16, display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", flexShrink: 0, background: "var(--surface-0)", borderRadius: "16px 16px 0 0" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)" }}>Procedimiento</div>
            <div style={{ fontSize: 12, color: "var(--fg-4)" }}>{proc?.nombre ?? "Sin título"}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-4)" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 20px" }}>
          {pasos.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--fg-4)", fontSize: 13 }}>Sin campos definidos</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pasos.map((paso) => {
                const saved = savedResps[paso.id];
                const pending = pendingResps[paso.id] ?? {};
                const isSaving = savingResp === paso.id;
                const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia";

                return (
                  <div
                    key={paso.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-lg)", background: "var(--surface-1)",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ padding: "12px 14px" }}>
                      {/* Step header */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: (paso.descripcion || !isInfoOnly) ? 8 : 0 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)", lineHeight: 1.3 }}>
                            {paso.titulo}
                            {!paso.requerido && !isInfoOnly && (
                              <span style={{ fontSize: 11, color: "var(--fg-4)", fontWeight: 400, marginLeft: 6 }}>(opcional)</span>
                            )}
                          </div>
                          {paso.descripcion && (
                            <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.5, marginTop: 3 }}>{paso.descripcion}</div>
                          )}
                        </div>
                      </div>

                      {/* Input or read-only answer.
                          - When isCompleted: show ReadonlyAnswer + "Editar" pill.
                          - When user clicks Editar: replace with PasoInput so they
                            can change the saved value and re-save (writes flow
                            through the audit log trigger).
                          - When !isCompleted: always show PasoInput. */}
                      {(() => {
                        const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia" || paso.tipo === "seccion";
                        const editing = !!editingPasos[paso.id];
                        if (isCompleted && saved && !editing) {
                          return (
                            <div style={{ paddingLeft: 36, display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <ReadonlyAnswer paso={paso} resp={saved} onPhotoClick={(url) => setLightboxImages({ urls: [url], idx: 0 })} />
                                {saved.editado_at && (
                                  <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 4, fontStyle: "italic" }}>
                                    Editado {new Date(saved.editado_at!).toLocaleString()}
                                  </div>
                                )}
                              </div>
                              {!isInfoOnly && (
                                <button
                                  onClick={() => setEditingPasos(prev => ({ ...prev, [paso.id]: true }))}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 4,
                                    padding: "4px 8px", fontSize: 11.5, fontWeight: 600,
                                    color: "var(--brand)", background: "var(--brand-tint)",
                                    border: "1px solid var(--brand)", borderRadius: "var(--r-sm)",
                                    cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
                                  }}
                                >
                                  <Pencil size={11} /> Editar
                                </button>
                              )}
                            </div>
                          );
                        }
                        if (true) {
                          return (
                            <div>
                              {editing && (
                                <button
                                  onClick={() => setEditingPasos(prev => { const n = { ...prev }; delete n[paso.id]; return n; })}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    fontSize: 11, color: "var(--fg-3)",
                                    background: "transparent", border: "none", cursor: "pointer",
                                    marginBottom: 6, fontFamily: "inherit", padding: 0,
                                  }}
                                >
                                  <X size={11} /> Cancelar edición
                                </button>
                              )}
                              <PasoInput
                                paso={paso}
                                resp={pending}
                                existingResp={saved}
                                isSaving={isSaving}
                                onUpdate={patch => onUpdateResp(paso.id, patch)}
                                onSave={extra => {
                                  onSaveResp(paso.id, extra);
                                  // Collapse the "editing" panel after save fires.
                                  setEditingPasos(prev => { const n = { ...prev }; delete n[paso.id]; return n; });
                                }}
                                ordenId={ejec.orden_id}
                                ejecucionId={ejec.id}
                                onPreviewImage={(urls, idx) => setLightboxImages({ urls, idx })}
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isCompleted && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-0)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontSize: 12, color: "var(--fg-4)" }}>
                {answeredRequired.length}/{allRequired.length} campos requeridos completados
              </div>
            </div>
            <button
              onClick={onComplete}
              disabled={!canComplete || completingEjec}
              style={{
                height: 36, padding: "0 18px",
                background: canComplete ? "var(--success)" : "var(--border)",
                border: "none", borderRadius: "var(--r-md)", cursor: canComplete ? "pointer" : "default",
                fontSize: 13, fontWeight: 600, color: canComplete ? "var(--fg-on-brand)" : "var(--fg-4)",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {completingEjec ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Completar
            </button>
          </div>
        )}
      </div>

      {/* Lightbox preview for a saved foto step. Opens at full size with a
          close button. PhotoEditor proper is mobile-only; on web we keep this
          to plain preview (replace + remove go through the existing PasoInput
          path once the user hits "Editar"). */}
      {lightboxImages && (
        <div
          onClick={() => setLightboxImages(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 80,
            background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, cursor: "zoom-out",
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxImages(null); }}
            style={{
              position: "absolute", top: 20, right: 20,
              width: 36, height: 36, borderRadius: 18,
              background: "rgba(255,255,255,0.15)", border: "none",
              color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
          {lightboxImages.idx > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxImages(current => current && { ...current, idx: current.idx - 1 }); }} aria-label="Imagen anterior" style={{ position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: 20, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <ChevronLeft size={22} />
            </button>
          )}
          {lightboxImages.idx < lightboxImages.urls.length - 1 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setLightboxImages(current => current && { ...current, idx: current.idx + 1 }); }} aria-label="Imagen siguiente" style={{ position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: 20, border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <ChevronRight size={22} />
            </button>
          )}
          <img
            src={lightboxImages.urls[lightboxImages.idx]}
            alt="Vista ampliada"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: "var(--r-md)", cursor: "default" }}
          />
          <a
            href={lightboxImages.urls[lightboxImages.idx]}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", bottom: 20, left: "50%",
              transform: "translateX(-50%)",
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              color: "#fff", background: "rgba(255,255,255,0.15)",
              borderRadius: "var(--r-md)", textDecoration: "none",
            }}
          >
            {lightboxImages.urls.length > 1 ? `${lightboxImages.idx + 1} / ${lightboxImages.urls.length}` : "Abrir en nueva pestaña"}
          </a>
        </div>
      )}
    </div>
  );
}
