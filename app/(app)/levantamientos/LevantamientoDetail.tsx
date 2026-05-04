"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X, MapPin, User, Calendar, FileText, CheckCircle2, XCircle, MessageSquare,
  AlertCircle, ChevronDown, Loader2, Image as ImageIcon, Link2, Trash2,
  ClipboardList, Camera,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchLevantamiento, setLevantamientoEstado, addComentario,
  deleteLevantamiento, linkOrdenToLevantamiento,
} from "@/lib/levantamientos-api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  LevantamientoDetalle, LevantamientoActividad,
  EstadoLevantamiento, LevantamientoSeccion, LevantamientoFotoGrupo,
} from "@/types/levantamientos";
import type { Usuario, Ubicacion, Sociedad } from "@/types/ordenes";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_CONFIG: Record<EstadoLevantamiento, { label: string; bg: string; color: string; dot: string }> = {
  creado:        { label: "Creado",        bg: "#F8FAFC", color: "#64748B", dot: "#94A3B8" },
  en_terreno:    { label: "En terreno",    bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_revision:   { label: "En revisión",   bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  aprobado:      { label: "Aprobado",      bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  no_viable:     { label: "No viable",     bg: "#FEF2F2", color: "#DC2626", dot: "#EF4444" },
  requiere_info: { label: "Requiere info", bg: "#FDF4FF", color: "#7C3AED", dot: "#A855F7" },
};

const ACTIVIDAD_LABEL: Record<string, string> = {
  creado:          "Levantamiento creado",
  asignado:        "Asignado",
  estado_cambiado: "Estado cambiado",
  enviado_revision:"Enviado a revisión",
  aprobado:        "Aprobado",
  no_viable:       "Marcado como no viable",
  requiere_info:   "Requiere más información",
  ot_creada:       "OT vinculada",
  comentario:      "Comentario",
};

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function itemValueDisplay(item: { tipo: string; valor_texto: string | null; valor_numero: number | null; valor_bool: boolean | null; unidad: string | null }) {
  if (item.tipo === "si_no") return item.valor_bool === true ? "Sí" : item.valor_bool === false ? "No" : "—";
  if (item.tipo === "numero" || item.tipo === "medicion") {
    return item.valor_numero !== null ? `${item.valor_numero}${item.unidad ? " " + item.unidad : ""}` : "—";
  }
  return item.valor_texto ?? "—";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EstadoPill({ estado }: { estado: EstadoLevantamiento }) {
  const cfg = ESTADO_CONFIG[estado];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 8, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
      {cfg.label}
    </span>
  );
}

function SeccionView({ seccion }: { seccion: LevantamientoSeccion }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {seccion.titulo}
      </div>
      {seccion.items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94A3B8" }}>Sin campos</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {seccion.items.map(item => (
            <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{item.campo}</span>
              <span style={{ fontSize: 13, color: "#0F172A", fontWeight: 500 }}>{itemValueDisplay(item)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FotoGrupoView({ grupo, onLightbox }: { grupo: LevantamientoFotoGrupo; onLightbox: (urls: string[], idx: number) => void }) {
  const items = grupo.items ?? [];
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {grupo.titulo}
      </div>
      {grupo.descripcion && (
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 8 }}>{grupo.descripcion}</div>
      )}
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: "#94A3B8" }}>Sin fotos</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {items.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => onLightbox(items.map(i => i.url), idx)}
              style={{ padding: 0, border: "none", borderRadius: 6, overflow: "hidden", cursor: "pointer", aspectRatio: "1", background: "#F1F5F9" }}
            >
              <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActividadItem({ act }: { act: LevantamientoActividad }) {
  const isComment = act.tipo === "comentario";
  return (
    <div style={{ display: "flex", gap: 10, paddingBottom: 16 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
        background: isComment ? "#EFF6FF" : "#F1F5F9",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isComment
          ? <MessageSquare size={13} color="#2563EB" />
          : <AlertCircle size={13} color="#64748B" />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>
            {act.usuario?.nombre ?? "Sistema"}
          </span>
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{formatTs(act.created_at)}</span>
        </div>
        <div style={{ fontSize: 12, color: isComment ? "#0F172A" : "#64748B" }}>
          {isComment ? act.comentario : ACTIVIDAD_LABEL[act.tipo] ?? act.tipo}
        </div>
        {!isComment && act.comentario && (
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, padding: "6px 10px", background: "#F8FAFC", borderRadius: 6, borderLeft: "3px solid #E2E8F0" }}>
            {act.comentario}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ urls, startIdx, onClose }: { urls: string[]; startIdx: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIdx);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx(i => Math.min(urls.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [urls.length, onClose]);
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "#fff", cursor: "pointer" }}><X size={24} /></button>
      <button onClick={e => { e.stopPropagation(); setIdx(i => Math.max(0, i - 1)); }} disabled={idx === 0} style={{ position: "absolute", left: 16, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
      <img onClick={e => e.stopPropagation()} src={urls[idx]} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} />
      <button onClick={e => { e.stopPropagation(); setIdx(i => Math.min(urls.length - 1, i + 1)); }} disabled={idx === urls.length - 1} style={{ position: "absolute", right: 16, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
      {urls.length > 1 && (
        <div style={{ position: "absolute", bottom: 20, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{idx + 1} / {urls.length}</div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  id: string;
  myId: string;
  myRol: string | null;
  wsId: string;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  sociedades: Sociedad[];
  onClose: () => void;
  onDeleted: () => void;
  onUpdated: (updated: import("@/types/levantamientos").Levantamiento) => void;
}

type PanelTab = "info" | "observaciones" | "fotos" | "actividad";

export default function LevantamientoDetail({ id, myId, myRol, wsId, onClose, onDeleted, onUpdated }: Props) {
  const [lev, setLev]           = useState<LevantamientoDetalle | null>(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>("info");

  // Estado transition
  const [transitioning, setTransitioning] = useState(false);
  const [notasModal, setNotasModal] = useState<{ estado: EstadoLevantamiento } | null>(null);
  const [notas, setNotas]           = useState("");

  // Comentario
  const [comentario, setComentario] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // Lightbox
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);

  const isAdmin = myRol === "admin" || myRol === "owner" || myRol === "jefe";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLevantamiento(id);
      setLev(data);
      onUpdated(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel(`lev-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "levantamientos", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "levantamiento_actividad", filter: `levantamiento_id=eq.${id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [id, load]);

  async function handleEstado(estado: EstadoLevantamiento, comentario?: string) {
    if (!lev) return;
    setTransitioning(true);
    try {
      await setLevantamientoEstado(lev.id, estado, myId, comentario);
      await load();
    } finally {
      setTransitioning(false);
      setNotasModal(null);
      setNotas("");
    }
  }

  async function handleComment() {
    if (!comentario.trim() || !lev) return;
    setSendingComment(true);
    try {
      await addComentario(lev.id, myId, comentario.trim());
      setComentario("");
      await load();
    } finally {
      setSendingComment(false);
    }
  }

  if (loading || !lev) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#94A3B8" }} />
      </div>
    );
  }

  const cfg = ESTADO_CONFIG[lev.estado];
  const locationParts = [lev.sociedad?.nombre, lev.ubicaciones?.edificio, lev.ubicaciones?.piso, lev.lugar].filter(Boolean);

  const canApprove = isAdmin && lev.estado === "en_revision";
  const canSendRevision = lev.estado === "en_terreno" || lev.estado === "requiere_info";
  const canStartField = isAdmin && lev.estado === "creado";

  const TABS: { id: PanelTab; label: string }[] = [
    { id: "info", label: "Info" },
    { id: "observaciones", label: "Observaciones" },
    { id: "fotos", label: `Fotos${lev.foto_grupos.length > 0 ? ` (${lev.foto_grupos.flatMap(g => g.items ?? []).length})` : ""}` },
    { id: "actividad", label: "Actividad" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #E2E8F0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", fontFamily: "monospace" }}>LEV-{lev.numero ?? "—"}</span>
              <EstadoPill estado={lev.estado} />
              {lev.orden_id && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2563EB", fontWeight: 600 }}>
                  <Link2 size={11} /> OT vinculada
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A", lineHeight: 1.3 }}>{lev.titulo}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        {/* Action buttons */}
        {(canApprove || canSendRevision || canStartField) && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {canStartField && (
              <button
                onClick={() => handleEstado("en_terreno")}
                disabled={transitioning}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Enviar a terreno
              </button>
            )}
            {canSendRevision && (
              <button
                onClick={() => handleEstado("en_revision")}
                disabled={transitioning}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Enviar a revisión
              </button>
            )}
            {canApprove && (
              <>
                <button
                  onClick={() => setNotasModal({ estado: "aprobado" })}
                  disabled={transitioning}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <CheckCircle2 size={13} /> Aprobar
                </button>
                <button
                  onClick={() => setNotasModal({ estado: "requiere_info" })}
                  disabled={transitioning}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "#FDF4FF", color: "#7C3AED", border: "1px solid #E9D5FF", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <AlertCircle size={13} /> Requiere info
                </button>
                <button
                  onClick={() => setNotasModal({ estado: "no_viable" })}
                  disabled={transitioning}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <XCircle size={13} /> No viable
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", flexShrink: 0, background: "#fff" }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: "10px 16px",
              background: "none", border: "none",
              borderBottom: `2px solid ${activeTab === t.id ? "#2563EB" : "transparent"}`,
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              color: activeTab === t.id ? "#2563EB" : "#94A3B8",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>

        {/* ── Info tab ─────────────────────────────────────────────────────── */}
        {activeTab === "info" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {lev.descripcion && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Descripción</div>
                <p style={{ margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.6 }}>{lev.descripcion}</p>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Creado por</div>
                <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                  <User size={13} color="#94A3B8" /> {lev.creador?.nombre ?? "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Asignado a</div>
                <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                  <User size={13} color="#94A3B8" /> {lev.asignado?.nombre ?? "Sin asignar"}
                </div>
              </div>
              {locationParts.length > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Ubicación</div>
                  <div style={{ fontSize: 13, color: "#0F172A", fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={13} color="#94A3B8" /> {locationParts.join(" · ")}
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Creado</div>
                <div style={{ fontSize: 13, color: "#64748B", display: "flex", alignItems: "center", gap: 5 }}>
                  <Calendar size={13} color="#94A3B8" /> {formatTs(lev.created_at)}
                </div>
              </div>
              {lev.enviado_revision_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Enviado a revisión</div>
                  <div style={{ fontSize: 13, color: "#64748B" }}>{formatTs(lev.enviado_revision_at)}</div>
                </div>
              )}
              {lev.revisado_at && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Revisado</div>
                  <div style={{ fontSize: 13, color: "#64748B" }}>{formatTs(lev.revisado_at)}</div>
                </div>
              )}
            </div>

            {lev.resultado_notas && (
              <div style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 8, borderLeft: "3px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Notas de revisión</div>
                <p style={{ margin: 0, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>{lev.resultado_notas}</p>
              </div>
            )}

            {/* Delete */}
            {isAdmin && (
              <div style={{ marginTop: 8, paddingTop: 16, borderTop: "1px solid #F1F5F9" }}>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}>
                      <Trash2 size={13} /> Eliminar levantamiento
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar levantamiento?</AlertDialogTitle>
                      <AlertDialogDescription>Esta acción no se puede deshacer. Se eliminarán también todas las secciones, items y fotos.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => { await deleteLevantamiento(lev.id); onDeleted(); }}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
        )}

        {/* ── Observaciones tab ────────────────────────────────────────────── */}
        {activeTab === "observaciones" && (
          <div>
            {lev.secciones.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 0", color: "#94A3B8" }}>
                <ClipboardList size={36} strokeWidth={1.5} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>Sin observaciones registradas</span>
              </div>
            ) : (
              lev.secciones.map(s => <SeccionView key={s.id} seccion={s} />)
            )}
          </div>
        )}

        {/* ── Fotos tab ─────────────────────────────────────────────────────── */}
        {activeTab === "fotos" && (
          <div>
            {lev.foto_grupos.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "40px 0", color: "#94A3B8" }}>
                <Camera size={36} strokeWidth={1.5} />
                <span style={{ fontSize: 14, fontWeight: 600, color: "#64748B" }}>Sin grupos de fotos</span>
              </div>
            ) : (
              lev.foto_grupos.map(g => (
                <FotoGrupoView
                  key={g.id}
                  grupo={g}
                  onLightbox={(urls, idx) => setLightbox({ urls, idx })}
                />
              ))
            )}
          </div>
        )}

        {/* ── Actividad tab ─────────────────────────────────────────────────── */}
        {activeTab === "actividad" && (
          <div>
            {/* Comment box */}
            <div style={{ marginBottom: 20 }}>
              <Textarea
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                placeholder="Agregar comentario..."
                rows={3}
                style={{ marginBottom: 8, resize: "none" }}
              />
              <Button
                size="sm"
                onClick={handleComment}
                disabled={!comentario.trim() || sendingComment}
              >
                {sendingComment ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                Comentar
              </Button>
            </div>

            {lev.actividad.length === 0 ? (
              <div style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", padding: "20px 0" }}>Sin actividad aún</div>
            ) : (
              lev.actividad.map(act => <ActividadItem key={act.id} act={act} />)
            )}
          </div>
        )}
      </div>

      {/* Notas modal for review outcomes */}
      {notasModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setNotasModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, padding: 24, width: 400, boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#0F172A" }}>
              {notasModal.estado === "aprobado" ? "Aprobar levantamiento" :
               notasModal.estado === "no_viable" ? "Marcar como no viable" : "Solicitar más información"}
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "#64748B" }}>Agrega notas opcionales para el técnico.</p>
            <Textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Notas (opcional)..."
              rows={4}
              style={{ marginBottom: 16, resize: "none" }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => { setNotasModal(null); setNotas(""); }}>Cancelar</Button>
              <Button
                onClick={() => handleEstado(notasModal.estado, notas || undefined)}
                disabled={transitioning}
                className={
                  notasModal.estado === "aprobado" ? "bg-green-600 hover:bg-green-700" :
                  notasModal.estado === "no_viable" ? "bg-red-600 hover:bg-red-700" : ""
                }
              >
                {transitioning ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox urls={lightbox.urls} startIdx={lightbox.idx} onClose={() => setLightbox(null)} />}
    </div>
  );
}
