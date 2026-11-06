"use client";

import { useState, useRef, useEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Clock, MapPin, Copy, Check as CheckIcon, AlertCircle, UserPlus, X as XIcon,
  CheckCircle2, Circle,
  Minus, Pause, Check, RotateCw, UserRoundX, UserRoundCheck,
  ArrowUp, ArrowDown, AlertTriangle, FlagTriangleRight, ClipboardCheck,
  Printer, PrinterCheck, Loader2, BadgeDollarSign,
  type LucideIcon,
} from "lucide-react";
import { COLORES_BANDERA, type OTBandera } from "@/lib/ot-banderas";
import type { OTImpresion } from "@/lib/ot-impresiones";
import type { OTCobro } from "@/lib/ot-cobros";
import { parseDescMeta, updateOrden } from "@/lib/ordenes-api";
import { clienteDeOT } from "@/lib/envios-api";
import type { OrdenListItem, OrdenBulkItem, Usuario, Estado, Prioridad } from "@/types/ordenes";
import { chileDateKey, dateKey, daysBetweenKeys } from "./date-utils";
import { iniciales } from "@/lib/avatar";
import { FotoOIniciales } from "@/components/FotoPerfil";

// Estado y prioridad se muestran como etiquetas sin relleno: borde de 1px,
// texto casi negro en peso normal y el ícono como único portador del color.
const ESTADO: Record<Estado, { label: string; icon: LucideIcon; color: string }> = {
  pendiente:   { label: "Sin asignar", icon: UserRoundX,  color: "var(--st-open-dot)"     },
  en_espera:   { label: "En espera",   icon: Pause,       color: "var(--st-wait-dot)"     },
  en_curso:    { label: "En curso",    icon: RotateCw,    color: "var(--st-progress-dot)" },
  en_revision: { label: "En revisión", icon: ClipboardCheck, color: "var(--st-review-dot)" },
  completado:  { label: "Completada",  icon: Check,       color: "var(--st-done-dot)"     },
};

const ESTADO_ASIGNADA = {
  label: "Asignada",
  icon:  UserRoundCheck,
  color: "var(--st-progress-dot)",
};

// La dirección de la flecha comunica la intensidad y el color la refuerza:
// verde → azul → naranja → rojo.
const PRIORIDAD: Record<Prioridad, { label: string; icon: LucideIcon; color: string }> = {
  ninguna: { label: "",        icon: Minus,     color: "transparent"      },
  baja:    { label: "Baja",    icon: ArrowDown, color: "var(--pr-low)"    },
  media:   { label: "Media",   icon: Minus,     color: "var(--pr-medium)" },
  alta:    { label: "Alta",    icon: ArrowUp,   color: "var(--pr-high)"   },
  urgente: { label: "Urgente", icon: AlertTriangle, color: "var(--pr-urgent)" },
};

/** Ícono de la etiqueta: glifo de contorno en el color del estado, sin disco
 *  ni relleno. El color queda en el trazo, que es suficiente para distinguir
 *  el estado sin agregar una mancha de color a cada fila.
 *
 *  `display: block` + `flexShrink: 0` evitan que el SVG se apoye en la línea
 *  base del texto o se comprima cuando falta espacio horizontal. */
function SolidIcon({ icon: Icon, color, size = 14 }: { icon: LucideIcon; color: string; size?: number }) {
  return <Icon size={size} color={color} strokeWidth={2.25} style={{ display: "block", flexShrink: 0 }} />;
}

/** Etiqueta sin relleno: borde de 1px, texto casi negro en peso normal y el
 *  ícono sólido como único portador del color. */
function RowBadge({
  icon: Icon,
  iconColor,
  children,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 14, fontWeight: 400,
      padding: "0 8px", minHeight: 22,
      border: "1px solid var(--border)",
      borderRadius: "var(--r-sm)",
      color: "var(--fg-1)",
      background: "var(--surface-1)",
      whiteSpace: "nowrap",
      // Las etiquetas no se encogen: el espacio que falte lo cede la ubicación.
      flexShrink: 0,
    }}>
      {Icon && <SolidIcon icon={Icon} color={iconColor ?? "var(--fg-3)"} />}
      {children}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1)  return "ahora";
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `${d}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function dueLabel(fecha: string, todayKey: string): { text: string; overdue: boolean } | null {
  const dueKey = dateKey(fecha);
  if (!dueKey) return null;
  const diff = daysBetweenKeys(todayKey, dueKey);
  if (diff < 0)   return { text: `Vencio hace ${Math.abs(diff)}d`, overdue: true };
  if (diff === 0) return { text: "Vence hoy", overdue: false };
  if (diff === 1) return { text: "Manana", overdue: false };
  if (diff <= 7)  return { text: `${diff}d`, overdue: false };
  return null;
}

// ── HoverTooltip ──────────────────────────────────────────────────────────────

function HoverTooltip({ label, body, children, triggerStyle }: {
  label: string;
  body: React.ReactNode;
  children: React.ReactNode;
  triggerStyle?: React.CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });
  const triggerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  function show() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const W = 300;
    const vw = window.innerWidth;
    let left = r.left;
    if (left + W > vw - 12) left = vw - W - 12;
    if (left < 12) left = 12;
    const flipUp = window.innerHeight - r.bottom < 160;
    setPos({ top: flipUp ? r.top : r.bottom + 6, left, flipUp });
    setVisible(true);
  }

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        style={{ cursor: "default", ...triggerStyle }}
      >
        {children}
      </div>

      {visible && mounted && createPortal(
        <div
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width: 300,
            zIndex: 9999,
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-md)",
            padding: "12px 14px",
            transform: pos.flipUp ? "translateY(-100%) translateY(-6px)" : "none",
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 6px" }}>
            {label}
          </p>
          <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {body}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Motivo de pausa ───────────────────────────────────────────────────────────

export interface HojaSolicitudResumen {
  nombre: string;
  /** "Material — cantidad unidad", ya armado; solo los primeros. */
  items: string[];
  total: number;
}

export interface MotivoEspera {
  label: string;
  comment: string | null;
  /** Hojas "Solicitud de materiales" de la OT (pueden ser varias). */
  hojas?: HojaSolicitudResumen[];
}

// Cuerpo del tooltip de "En espera": el comentario del técnico y, si hay, cada
// hoja de solicitud de materiales con lo pedido.
function MotivoEsperaBody({ motivo }: { motivo: MotivoEspera }) {
  const hojas = motivo.hojas ?? [];
  return (
    <>
      {motivo.comment && <div>{motivo.comment}</div>}
      {!motivo.comment && hojas.length === 0 && <div>{motivo.label}</div>}
      {hojas.map((h, i) => (
        <div key={i} style={{ marginTop: motivo.comment || i > 0 ? 10 : 0 }}>
          <div style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 2 }}>
            {h.nombre}{hojas.length > 1 ? ` (${i + 1}/${hojas.length})` : ""}
          </div>
          {h.items.length === 0 ? (
            <div style={{ color: "var(--fg-4)" }}>Sin materiales anotados</div>
          ) : (
            h.items.map((it, j) => <div key={j}>• {it}</div>)
          )}
          {h.total > h.items.length && (
            <div style={{ color: "var(--fg-4)" }}>+{h.total - h.items.length} más</div>
          )}
        </div>
      ))}
    </>
  );
}

// ── AssignDropdown ────────────────────────────────────────────────────────────

function AssignDropdown({ orden, usuarios, myId, onAssigned, onClose, anchorRect }: {
  orden:       OrdenBulkItem;
  usuarios:    Usuario[];
  myId:        string;
  onAssigned:  (ids: string[]) => void;
  onClose:     () => void;
  anchorRect:  DOMRect;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const currentIds = orden.asignados_ids ?? [];
  // La lista incluye a los dados de baja para poder mostrar su nombre en OTs
  // viejas; aca se filtran porque no pueden recibir trabajo nuevo.
  const asignables = usuarios.filter(u => !u.deleted_at);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const W = 220;
  const vw = window.innerWidth;
  let left = anchorRect.right - W;
  if (left < 8) left = 8;
  if (left + W > vw - 8) left = vw - W - 8;
  const flipUp = window.innerHeight - anchorRect.bottom < 220;
  const top = flipUp ? anchorRect.top : anchorRect.bottom + 6;

  // Optimista: la tarjeta cambia al instante; si el servidor rechaza, vuelve a
  // los asignados de antes y se avisa.
  async function toggle(userId: string) {
    const already = currentIds.includes(userId);
    const newIds = already ? currentIds.filter(id => id !== userId) : [...currentIds, userId];
    const antes = currentIds;
    setSaving(userId);
    onAssigned(newIds);
    try {
      await updateOrden(orden.id, myId, {
        // Array vacio, no null: la validacion del comando exige un array
        // cuando la clave viene presente (400 "asignados_ids must be an
        // array" al desasignar al ultimo usuario).
        asignados_ids: newIds,
      }, antes);
    } catch {
      onAssigned(antes);
      toast.error("No se pudo cambiar la asignación. Inténtalo de nuevo.");
    } finally {
      setSaving(null);
    }
  }

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: W,
        zIndex: 9999,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-md)",
        overflow: "hidden",
        transform: flipUp ? "translateY(-100%) translateY(-6px)" : "none",
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{ padding: "8px 12px 6px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em" }}>
          Asignar
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
          <XIcon size={14} />
        </button>
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {asignables.length === 0 && (
          <p style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-4)", margin: 0 }}>Sin usuarios</p>
        )}
        {asignables.map(u => {
          const isAssigned = currentIds.includes(u.id);
          const isSaving = saving === u.id;
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              disabled={isSaving}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: isAssigned ? "var(--brand-tint)" : "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                opacity: isSaving ? 0.6 : 1,
                transition: "background var(--dur-fast) var(--ease)",
              }}
              onMouseEnter={e => { if (!isAssigned) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { if (!isAssigned) e.currentTarget.style.background = "none"; }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: isAssigned ? "linear-gradient(135deg, var(--brand-active), var(--brand))" : "var(--surface-hover)",
                color: isAssigned ? "var(--fg-on-brand)" : "var(--fg-3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 400,
              }}>
                <FotoOIniciales id={u.id}>{iniciales(u.nombre)}</FotoOIniciales>
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u.nombre}
              </span>
              {isAssigned && <CheckIcon size={14} color="var(--brand-fg)" />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// ── Imprimir PDF de la solicitud (OTs creadas desde MeConecta) ────────────────

// Tenue sin imprimir (como "marcar como leída"); impresa, el verde de
// "Completada" con check y, al pasar el mouse, quién y cuándo.
//
// El navegador no dice si el diálogo de impresión terminó en imprimir o en
// cancelar, así que tras abrirlo se pregunta "¿Se imprimió?" y solo un "Sí"
// marca la OT. Reimprimir una ya marcada no pregunta (la marca guarda la
// primera vez).
function ImprimirTrigger({ ordenId, impresion, usuarios, onImprimir, onMarcar }: {
  ordenId:    string;
  impresion:  OTImpresion;
  usuarios:   Usuario[];
  onImprimir: (pdfUrl: string) => Promise<void>;
  onMarcar:   (ordenId: string) => Promise<void>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [pregunta, setPregunta] = useState<DOMRect | null>(null);
  const impresa = Boolean(impresion.impresaAt);

  const boton = (
    <button
      ref={ref}
      type="button"
      disabled={busy}
      title={impresa ? undefined : "Imprimir solicitud"}
      aria-label={impresa ? "Reimprimir solicitud" : "Imprimir solicitud"}
      onClick={e => {
        e.stopPropagation();
        setBusy(true);
        onImprimir(impresion.pdfUrl)
          .then(() => { if (!impresa) setPregunta(ref.current?.getBoundingClientRect() ?? null); })
          .catch(() => undefined)
          .finally(() => setBusy(false));
      }}
      style={{
        background: "none", border: "none", cursor: busy ? "wait" : "pointer", padding: 2,
        display: "flex", alignItems: "center",
        color: impresa ? "var(--st-done-dot)" : "var(--fg-4)", // verde de "Completada"
        transition: "color var(--dur-fast) var(--ease)",
      }}
      onMouseEnter={e => { if (!impresa) e.currentTarget.style.color = "var(--fg-2)"; }}
      onMouseLeave={e => { if (!impresa) e.currentTarget.style.color = "var(--fg-4)"; }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : impresa ? <PrinterCheck size={14} /> : <Printer size={14} />}
    </button>
  );

  if (!impresa) {
    return (
      <>
        {boton}
        {pregunta && (
          <PreguntaImpresa anchorRect={pregunta} onClose={() => setPregunta(null)} onSi={() => onMarcar(ordenId)} />
        )}
      </>
    );
  }
  const quien = usuarios.find(u => u.id === impresion.impresaPor)?.nombre ?? "—";
  const cuando = new Date(impresion.impresaAt!).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <HoverTooltip label="Impresa" body={`${cuando} · ${quien}`}>{boton}</HoverTooltip>;
}

// ── Marcar como cobrada (Electrilam, OTs completadas) ─────────────────────────

// Mismo dibujo que la impresora: tenue sin cobrar; cobrada, el verde de
// "Completada" y, al pasar el mouse, quién y cuándo. Otro clic la desmarca.
// El Excel de cobros lo toma: no la vuelve a sacar y al actualizar la marca.
function CobradaTrigger({ ordenId, cobro, usuarios, onMarcar }: {
  ordenId:  string;
  cobro:    OTCobro | null;
  usuarios: Usuario[];
  onMarcar: (ordenId: string, cobrada: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const cobrada = Boolean(cobro?.cobradaAt);

  const boton = (
    <button
      type="button"
      disabled={busy}
      title={cobrada ? undefined : "Marcar como cobrada"}
      aria-label={cobrada ? "Cobrada — clic para desmarcar" : "Marcar como cobrada"}
      aria-pressed={cobrada}
      onClick={e => {
        e.stopPropagation();
        setBusy(true);
        onMarcar(ordenId, !cobrada)
          .catch(err => toast.error(err instanceof Error ? err.message : "No se pudo marcar la OT"))
          .finally(() => setBusy(false));
      }}
      style={{
        background: "none", border: "none", cursor: busy ? "wait" : "pointer", padding: 2,
        display: "flex", alignItems: "center",
        color: cobrada ? "var(--st-done-dot)" : "var(--fg-4)",
        transition: "color var(--dur-fast) var(--ease)",
      }}
      onMouseEnter={e => { if (!cobrada) e.currentTarget.style.color = "var(--fg-2)"; }}
      onMouseLeave={e => { if (!cobrada) e.currentTarget.style.color = "var(--fg-4)"; }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeDollarSign size={14} />}
    </button>
  );

  if (!cobrada) return boton;
  const quien = usuarios.find(u => u.id === cobro!.cobradaPor)?.nombre ?? "—";
  const cuando = new Date(cobro!.cobradaAt!).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return <HoverTooltip label="Cobrada — clic para desmarcar" body={`${cuando} · ${quien}`}>{boton}</HoverTooltip>;
}

function PreguntaImpresa({ anchorRect, onClose, onSi }: {
  anchorRect: DOMRect;
  onClose:    () => void;
  onSi:       () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const W = 220;
  let left = anchorRect.right - W;
  if (left < 8) left = 8;
  if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="¿Se imprimió?"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed", top: anchorRect.bottom + 6, left, width: W, zIndex: 9999,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-md)", boxShadow: "var(--shadow-md)", padding: 12,
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <span style={{ fontSize: 14, color: "var(--fg-1)" }}>¿Se imprimió la solicitud?</span>
      {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" disabled={saving} onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-2)", fontSize: 14, padding: "6px 8px" }}>
          No
        </button>
        <button type="button" disabled={saving}
          onClick={() => {
            setSaving(true);
            setError(null);
            onSi().then(onClose).catch(() => setError("No se pudo marcar. Inténtalo de nuevo.")).finally(() => setSaving(false));
          }}
          style={{
            border: "none", cursor: "pointer", borderRadius: "var(--r-sm)", padding: "6px 14px",
            background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, opacity: saving ? 0.6 : 1,
          }}>
          Sí, marcar
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── Bandera (solo dueño/admin) ────────────────────────────────────────────────

// Sin bandera: ícono tenue. Con bandera: relleno de su color; al pasar el mouse
// muestra la nota. Click → popover para elegir color y escribir la nota.
function BanderaTrigger({ ordenId, bandera, onGuardar, onQuitar }: {
  ordenId:   string;
  bandera:   OTBandera | null;
  onGuardar: (ordenId: string, color: string, nota: string) => Promise<void>;
  onQuitar:  (ordenId: string) => Promise<void>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const boton = (
    <button
      ref={ref}
      type="button"
      title={bandera ? undefined : "Marcar con bandera"}
      aria-label={bandera ? "Editar bandera" : "Marcar con bandera"}
      onClick={e => {
        e.stopPropagation();
        setAnchor(a => (a ? null : ref.current?.getBoundingClientRect() ?? null));
      }}
      style={{
        background: "none", border: "none", cursor: "pointer", padding: 2,
        display: "flex", alignItems: "center",
        color: bandera ? bandera.color : "var(--fg-4)",
        opacity: bandera ? 1 : 0.45,
      }}
    >
      <FlagTriangleRight size={17} fill={bandera ? bandera.color : "none"} />
    </button>
  );

  return (
    <>
      {bandera?.nota ? <HoverTooltip label="Nota" body={bandera.nota}>{boton}</HoverTooltip> : boton}
      {anchor && (
        <BanderaPopover
          anchorRect={anchor}
          bandera={bandera}
          onClose={() => setAnchor(null)}
          onGuardar={(color, nota) => onGuardar(ordenId, color, nota)}
          onQuitar={() => onQuitar(ordenId)}
        />
      )}
    </>
  );
}

function BanderaPopover({ anchorRect, bandera, onClose, onGuardar, onQuitar }: {
  anchorRect: DOMRect;
  bandera:    OTBandera | null;
  onClose:    () => void;
  onGuardar:  (color: string, nota: string) => Promise<void>;
  onQuitar:   () => Promise<void>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState<string>(bandera?.color ?? COLORES_BANDERA[0]);
  const [nota, setNota] = useState(bandera?.nota ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch {
      setError("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const W = 260;
  const vw = window.innerWidth;
  let left = anchorRect.right - W;
  if (left < 8) left = 8;
  if (left + W > vw - 8) left = vw - W - 8;
  const flipUp = window.innerHeight - anchorRect.bottom < 260;
  const top = flipUp ? anchorRect.top : anchorRect.bottom + 6;

  return createPortal(
    <div
      ref={ref}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: "fixed", top, left, width: W, zIndex: 9999,
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: "var(--r-md)", boxShadow: "var(--shadow-md)", padding: 12,
        transform: flipUp ? "translateY(-100%) translateY(-6px)" : "none",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, color: "var(--fg-1)" }}>Bandera</span>
        <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2, display: "flex" }}>
          <XIcon size={14} />
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {COLORES_BANDERA.map(c => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={c === color}
            onClick={() => setColor(c)}
            style={{
              width: 26, height: 26, borderRadius: "50%", cursor: "pointer", background: c,
              border: "none",
              boxShadow: c === color ? `0 0 0 2px var(--surface-2), 0 0 0 4px ${c}` : "none",
            }}
          />
        ))}
      </div>
      <textarea
        value={nota}
        onChange={e => setNota(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="Nota (opcional): por qué la marcaste…"
        style={{
          width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14,
          padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
          background: "var(--surface-1)", color: "var(--fg-1)", outline: "none",
        }}
      />
      {error && <span style={{ fontSize: 13, color: "var(--danger)" }}>{error}</span>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        {bandera ? (
          <button type="button" disabled={saving} onClick={() => void run(onQuitar)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 14, padding: "6px 0" }}>
            Quitar bandera
          </button>
        ) : <span />}
        <button type="button" disabled={saving} onClick={() => void run(() => onGuardar(color, nota))}
          style={{
            border: "none", cursor: "pointer", borderRadius: "var(--r-sm)", padding: "6px 14px",
            background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, opacity: saving ? 0.6 : 1,
          }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  orden:        OrdenBulkItem;
  rowNumber?:   number;
  usuarios:     Usuario[];
  isSelected:   boolean;
  onClick:      (id: string) => void;
  onPrefetch?:  (id: string) => void;
  myId?:        string;
  onAssigned?:  (id: string, newIds: string[]) => void;
  // When set (only in the "Reprogramadas" tab), render a pill with the
  // coordinated date so the supervisor sees it without opening the OT.
  coordinadaPara?: string | null;
  // Per-user "marcar como leída/vista" state + toggle.
  isMarcada?:       boolean;
  onToggleMarcada?: (id: string, next: boolean) => void;
  todayKey?:         string;
  // En espera: por qué (del comentario de pausa). Se suma a la pastilla de estado.
  motivoEspera?: MotivoEspera | null;
  // Bandera (color + nota), solo dueño/admin. `undefined` = sin permiso (no
  // se dibuja); `null` = puede marcar pero la OT no tiene bandera.
  bandera?:          OTBandera | null;
  onGuardarBandera?: (ordenId: string, color: string, nota: string) => Promise<void>;
  onQuitarBandera?:  (ordenId: string) => Promise<void>;
  // PDF de la solicitud MeConecta: solo las OTs que creó la integración lo traen.
  impresion?:       OTImpresion;
  onImprimir?:      (pdfUrl: string) => Promise<void>;
  onMarcarImpresa?: (ordenId: string) => Promise<void>;
  // Cobro (Electrilam, dueño/admin, OTs completadas). `undefined` = no se
  // dibuja; `null` = puede marcar pero la OT no tiene fila en ot_cobros.
  cobro?:            OTCobro | null;
  onMarcarCobrada?:  (ordenId: string, cobrada: boolean) => Promise<void>;
}

// `rowNumber` sigue en Props porque el contenedor lo pasa, pero ya no se
// muestra: el número correlativo no aportaba y competía con el N° de OT real.
function OTRow({ orden, usuarios, isSelected, onClick, onPrefetch, myId, onAssigned, coordinadaPara, isMarcada, onToggleMarcada, todayKey, motivoEspera, bandera, onGuardarBandera, onQuitarBandera, impresion, onImprimir, onMarcarImpresa, cobro, onMarcarCobrada }: Props) {
  const effectiveTodayKey = todayKey ?? chileDateKey();
  const isPending = Boolean(orden._pending);
  const hasAssignees = (orden.asignados_ids ?? []).length > 0;
  const estado = orden.estado === "pendiente"
    ? (hasAssignees ? ESTADO_ASIGNADA : ESTADO["pendiente"])
    : ESTADO[orden.estado];
  const prio      = PRIORIDAD[orden.prioridad];
  const cliente   = clienteDeOT(orden.id);
  // Parsing the description is non-trivial; memoize so it only re-runs when the
  // description text actually changes, not on every parent re-render.
  const meta      = useMemo(() => parseDescMeta(orden.descripcion ?? null), [orden.descripcion]);
  const titulo    = orden.titulo || meta.descripcion?.slice(0, 80) || "Sin título";
  const [copied, setCopied] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const avatarRef = useRef<HTMLButtonElement>(null);

  const assigned = (orden.asignados_ids ?? [])
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is Usuario => Boolean(u));

  const due = mounted && orden.fecha_termino && !isPending && orden.estado !== "completado" ? dueLabel(orden.fecha_termino, effectiveTodayKey) : null;

  function copyNOT(e: React.MouseEvent) {
    e.stopPropagation();
    if (!meta.nOT) return;
    navigator.clipboard.writeText(meta.nOT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openDrop(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onAssigned || !myId) return;
    if (avatarRef.current) setAnchorRect(avatarRef.current.getBoundingClientRect());
    setDropOpen(v => !v);
  }

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={isPending ? undefined : () => onClick(orden.id)}
      onMouseEnter={e => {
        if (!isPending) onPrefetch?.(orden.id);
        if (!isSelected) e.currentTarget.style.background = "var(--surface-hover)";
      }}
      onFocus={() => { if (!isPending) onPrefetch?.(orden.id); }}
      style={{
        padding: "16px 20px",
        // Altura fija: todas las tarjetas miden lo mismo aunque el título, la
        // ubicación o el número de etiquetas cambien. Subió de 124 al crecer
        // los chips (22) y los metadatos (12px): con 124 el contenido se salía.
        height: 148,
        // The list is now a flex column; without this, rows would be squeezed
        // below their fixed height when the list overflows.
        flexShrink: 0,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        // El `gap` reemplaza a los márgenes sueltos de cada fila: separación
        // uniforme entre cabecera, título, ITO y etiquetas.
        gap: 6,
        // Cards on the canvas, not a continuous white sheet: each row keeps its
        // own border and the list gaps them, so --surface-canvas shows between.
        background: isSelected ? "var(--row-selected)" : "var(--surface-1)",
        border: `1px solid ${isSelected ? "var(--brand)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        // Selection is shown with a 3px accent, but the border width stays 1px
        // so the card's content never shifts sideways when it is selected.
        boxShadow: isSelected ? "inset 3px 0 0 0 var(--brand)" : "none",
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.55 : isMarcada ? 0.62 : 1,
        transition: "background var(--dur-fast) var(--ease), opacity var(--dur-fast) var(--ease)",
      }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "var(--surface-1)"; }}
    >
      {/* Top: row number + N°OT + due date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {meta.nOT && (
            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--brand-fg)", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
                {meta.nOT}
              </span>
              <button
                type="button"
                onClick={copyNOT}
                title="Copiar N° OT"
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: copied ? "var(--success)" : "var(--fg-4)", transition: "color var(--dur-fast) var(--ease)" }}
                onMouseEnter={e => { if (!copied) e.currentTarget.style.color = "var(--fg-3)"; }}
                onMouseLeave={e => { if (!copied) e.currentTarget.style.color = "var(--fg-4)"; }}
              >
                {copied ? <CheckIcon size={14} /> : <Copy size={14} />}
              </button>
            </span>
          )}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {impresion && onImprimir && onMarcarImpresa && !isPending && (
            <ImprimirTrigger ordenId={orden.id} impresion={impresion} usuarios={usuarios} onImprimir={onImprimir} onMarcar={onMarcarImpresa} />
          )}
          {cobro !== undefined && onMarcarCobrada && !isPending && (
            <CobradaTrigger ordenId={orden.id} cobro={cobro} usuarios={usuarios} onMarcar={onMarcarCobrada} />
          )}
          {due && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
              {due.overdue
                ? <AlertCircle size={14} style={{ color: "var(--danger)", flexShrink: 0 }} />
                : <Clock size={14} style={{ color: "var(--warning)", flexShrink: 0 }} />}
              {due.text}
            </span>
          )}
          {onToggleMarcada && !isPending && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onToggleMarcada(orden.id, !isMarcada); }}
              title={isMarcada ? "Marcada como leída — clic para desmarcar" : "Marcar como leída"}
              aria-pressed={isMarcada}
              style={{
                display: "flex", alignItems: "center", background: "none", border: "none",
                cursor: "pointer", padding: 2,
                color: isMarcada ? "var(--brand-fg)" : "var(--fg-4)",
                transition: "color var(--dur-fast) var(--ease)",
              }}
              onMouseEnter={e => { if (!isMarcada) e.currentTarget.style.color = "var(--fg-2)"; }}
              onMouseLeave={e => { if (!isMarcada) e.currentTarget.style.color = "var(--fg-4)"; }}
            >
              {isMarcada ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            </button>
          )}
        </span>
      </div>

      {/* Title — una sola línea con elipsis. La descripción se quitó a propósito:
          era la fila de alto variable. El detalle completo está a un clic. */}
      <HoverTooltip label="Título" body={titulo} triggerStyle={{ margin: 0 }}>
        <p style={{
          fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
          lineHeight: 1.4, margin: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {titulo}
        </p>
      </HoverTooltip>

      {/* ITO — altura reservada siempre, con o sin valor, para que las tarjetas
          con y sin ITO midan exactamente lo mismo. */}
      <p style={{
        fontSize: 14, fontWeight: 400, color: "var(--fg-3)", margin: 0,
        height: 20, lineHeight: "20px",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {meta.hito && <><span style={{ color: "var(--fg-4)" }}>ITO:</span> {meta.hito}</>}
      </p>

      {/* Bottom row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        {/* `nowrap` + `overflow: hidden`: si las etiquetas se envolvieran a una
            segunda línea la tarjeta crecería y se rompería la altura uniforme. */}
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden" }}>

          {/* Status pill. En espera: al pasar el mouse, el motivo de la pausa
              con el comentario del técnico. */}
          {motivoEspera ? (
            <HoverTooltip label={`Motivo: ${motivoEspera.label}`} body={<MotivoEsperaBody motivo={motivoEspera} />}>
              <RowBadge icon={estado.icon} iconColor={estado.color}>
                {estado.label}
              </RowBadge>
            </HoverTooltip>
          ) : (
            <RowBadge icon={estado.icon} iconColor={estado.color}>
              {estado.label}
            </RowBadge>
          )}

          {/* OT recibida: la envió un cliente desde su propio workspace. */}
          {cliente && (
            <RowBadge>
              {cliente}
            </RowBadge>
          )}

          {/* Coordinated date — only shown inside the Reprogramadas tab. */}
          {coordinadaPara && (
            <RowBadge icon={Clock} iconColor="var(--success)">
              Coordinada para {new Date(coordinadaPara + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
            </RowBadge>
          )}

          {/* Priority */}
          {orden.prioridad !== "ninguna" && (
            <RowBadge icon={prio.icon} iconColor={prio.color}>
              {prio.label}
            </RowBadge>
          )}

          {/* Location — lo único que se encoge (con elipsis) cuando falta
              espacio, en vez de cortarse en seco. */}
          {orden.ubicaciones?.edificio && (
            <HoverTooltip label="Ubicación" body={orden.ubicaciones.edificio} triggerStyle={{ minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 14, fontWeight: 400, color: "var(--fg-3)", minWidth: 0 }}>
                <MapPin size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {orden.ubicaciones.edificio}
                </span>
              </span>
            </HoverTooltip>
          )}

        </div>

        {/* Right: time + avatars + flag. La bandera va al final, pegada al
            borde: así cae en el mismo lugar en todas las tarjetas sin reservar
            anchos fijos que le quiten espacio a la ubicación. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span suppressHydrationWarning style={{ whiteSpace: "nowrap", fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{mounted ? timeAgo(orden.created_at) : ""}</span>

          {/* Avatar trigger — always shown as a button when onAssigned is wired */}
          <button
            ref={avatarRef}
            type="button"
            onClick={openDrop}
            title={assigned.length === 0 ? "Asignar usuario" : "Cambiar asignados"}
            style={{
              background: "none", border: "none", cursor: onAssigned ? "pointer" : "default",
              padding: 0, display: "flex", alignItems: "center",
            }}
          >
            {assigned.length === 0 ? (
              <span style={{
                width: 27, height: 27, borderRadius: "50%",
                border: "1.5px dashed var(--border-strong)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--fg-4)",
              }}>
                <UserPlus size={16} />
              </span>
            ) : (
              <span style={{ display: "flex" }}>
                {assigned.slice(0, 3).map((u, i) => (
                  <span
                    key={u.id}
                    title={u.nombre}
                    style={{
                      width: 30, height: 30, borderRadius: "50%",
                      background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                      color: "var(--fg-on-brand)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 400, flexShrink: 0,
                      marginLeft: i > 0 ? -7 : 0,
                    }}
                  >
                    <FotoOIniciales id={u.id}>{iniciales(u.nombre)}</FotoOIniciales>
                  </span>
                ))}
                {assigned.length > 3 && (
                  <span style={{
                    width: 30, height: 30, borderRadius: "50%",
                    background: "var(--surface-hover)", color: "var(--fg-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 400, marginLeft: -7,
                  }}>
                    +{assigned.length - 3}
                  </span>
                )}
              </span>
            )}
          </button>

          {dropOpen && anchorRect && myId && onAssigned && (
            <AssignDropdown
              orden={orden}
              usuarios={usuarios}
              myId={myId}
              onAssigned={newIds => { onAssigned(orden.id, newIds); setDropOpen(false); }}
              onClose={() => setDropOpen(false)}
              anchorRect={anchorRect}
            />
          )}

          {bandera !== undefined && onGuardarBandera && onQuitarBandera && (
            <BanderaTrigger ordenId={orden.id} bandera={bandera} onGuardar={onGuardarBandera} onQuitar={onQuitarBandera} />
          )}
        </div>
      </div>
    </div>
  );
}

// Memoized so a parent re-render (e.g. selecting another row, the 60s list
// poll) only re-renders rows whose props actually changed — not all 70+. This
// is the main lever for INP on the orders list. Requires the parent to pass
// stable onClick/onAssigned callbacks (see OrdenesBandeja).
export default memo(OTRow);
