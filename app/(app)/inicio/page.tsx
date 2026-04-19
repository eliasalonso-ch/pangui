"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, MapPin, Wrench, MessageSquare,
  UserCheck, Play, Pause, RefreshCw, Edit3, Trash2,
  CheckCheck, TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad } from "@/types/ordenes";
import { parseDescMeta } from "@/lib/ordenes-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentOT {
  id: string;
  titulo: string | null;
  descripcion: string;
  estado: Estado;
  prioridad: Prioridad;
  created_at: string;
  ubicaciones?: { edificio: string } | null;
  nOT?: string | null;
}

interface ActividadItem {
  id: string;
  tipo: string;
  comentario: string | null;
  created_at: string;
  orden_id: string;
  orden_titulo: string | null;
  usuario_nombre: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente:   "Abierta",
  en_espera:   "En espera",
  en_curso:    "En curso",
  completado:  "Completada",
};

const ESTADO_STYLE: Record<Estado, { bg: string; color: string; dot: string }> = {
  pendiente:   { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_espera:   { bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  en_curso:    { bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  completado:  { bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  ninguna: "#9CA3AF", baja: "#9CA3AF", media: "#3B82F6", alta: "#F97316", urgente: "#EF4444",
};

const ACTIVIDAD_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  creado:           { icon: <Plus size={11} />,        label: "Creó",       color: "#1E3A8A" },
  editado:          { icon: <Edit3 size={11} />,       label: "Editó",      color: "#6B7280" },
  comentario:       { icon: <MessageSquare size={11}/>, label: "Comentó",   color: "#0369A1" },
  estado_cambiado:  { icon: <RefreshCw size={11} />,   label: "Cambió estado", color: "#7C3AED" },
  asignado:         { icon: <UserCheck size={11} />,   label: "Asignó",     color: "#059669" },
  completado:       { icon: <CheckCheck size={11} />,  label: "Completó",   color: "#166534" },
  iniciado:         { icon: <Play size={11} />,        label: "Inició",     color: "#15803D" },
  pausado:          { icon: <Pause size={11} />,       label: "Pausó",      color: "#C2410C" },
  reanudado:        { icon: <Play size={11} />,        label: "Reanudó",    color: "#15803D" },
  prioridad_cambiada: { icon: <TriangleAlert size={11}/>, label: "Cambió prioridad", color: "#D97706" },
  eliminado:        { icon: <Trash2 size={11} />,      label: "Eliminó",    color: "#DC2626" },
};

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

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InicioDashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({ abiertas: 0, en_curso: 0, urgentes: 0, completadas_hoy: 0 });
  const [recent, setRecent] = useState<RecentOT[]>([]);
  const [vencenHoy, setVencenHoy] = useState<RecentOT[]>([]);
  const [actividad, setActividad] = useState<ActividadItem[]>([]);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.nombre) setUserName(perfil.nombre.split(" ")[0]);

      const workspaceId = perfil?.workspace_id;
      if (!workspaceId) { setLoading(false); return; }

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const [ordenesRes, actividadRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select("id, titulo, descripcion, estado, prioridad, created_at, fecha_termino, ubicaciones(edificio)")
          .eq("workspace_id", workspaceId)
          .neq("estado", "cancelado")
          .order("created_at", { ascending: false })
          .limit(300),
        sb.from("actividad_ot")
          .select("id, tipo, comentario, created_at, orden_id, orden:ordenes_trabajo!orden_id(titulo), usuario:usuarios!usuario_id(nombre)")
          .eq("ordenes_trabajo.workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const ordenes = ordenesRes.data ?? [];

      const abiertas       = ordenes.filter(o => o.estado === "pendiente" || o.estado === "en_espera").length;
      const en_curso       = ordenes.filter(o => o.estado === "en_curso").length;
      const urgentes       = ordenes.filter(o => o.prioridad === "urgente" && o.estado !== "completado").length;
      const completadas_hoy = ordenes.filter(o =>
        o.estado === "completado" && o.created_at >= todayStart.toISOString()
      ).length;

      setStats({ abiertas, en_curso, urgentes, completadas_hoy });

      const mapOT = (o: any): RecentOT => ({
        ...o,
        ubicaciones: Array.isArray(o.ubicaciones) ? o.ubicaciones[0] : o.ubicaciones,
        nOT: parseDescMeta(o.descripcion).nOT,
      });

      setRecent(ordenes.slice(0, 20).map(mapOT));

      setVencenHoy(
        ordenes
          .filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) <= todayStr && o.estado !== "completado")
          .slice(0, 8)
          .map(mapOT)
      );

      // Activity feed
      const rawActividad = actividadRes.data ?? [];
      setActividad(rawActividad.map((a: any) => ({
        id:             a.id,
        tipo:           a.tipo,
        comentario:     a.comentario,
        created_at:     a.created_at,
        orden_id:       a.orden_id,
        orden_titulo:   a.orden?.titulo ?? null,
        usuario_nombre: a.usuario?.nombre ?? null,
      })));

      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { label: "Abiertas",        value: stats.abiertas,        icon: <ClipboardList size={20} />, color: "#1D4ED8", bg: "#EFF6FF", filtro: "abiertas" },
    { label: "En curso",        value: stats.en_curso,        icon: <Wrench size={20} />,        color: "#15803D", bg: "#F0FDF4", filtro: "en_curso" },
    { label: "Urgentes",        value: stats.urgentes,        icon: <AlertTriangle size={20} />, color: "#DC2626", bg: "#FEF2F2", filtro: "urgentes" },
    { label: "Completadas hoy", value: stats.completadas_hoy, icon: <CheckCircle2 size={20} />,  color: "#166534", bg: "#DCFCE7", filtro: "completadas_hoy" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8594A3", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.025em", margin: "0 0 4px", fontFamily: '"Inter", system-ui, sans-serif' }}>
          {greeting()}{userName ? `, ${userName}` : ""} 👋
        </h1>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stat cards — each navigates to /ordenes with pre-applied filter */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {statCards.map(s => (
          <button
            key={s.label}
            onClick={() => router.push(`/ordenes?filtro=${s.filtro}`)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "18px 16px", background: "#fff",
              border: "1px solid #E2E8F0", borderRadius: 12,
              cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              transition: "box-shadow 0.15s, border-color 0.15s, transform 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,23,42,0.10)"; e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(15,23,42,0.06)"; e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.transform = "none"; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", lineHeight: 1, fontFamily: '"Inter", system-ui, sans-serif' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Vencidas / vencen hoy — only if there are any */}
          {vencenHoy.length > 0 && (
            <Section
              title={`⚠️ Vencidas o vencen hoy (${vencenHoy.length})`}
              titleColor="#DC2626"
              action="Ver todas"
              onAction={() => router.push("/ordenes?filtro=abiertas")}
            >
              {vencenHoy.map(o => <OTItem key={o.id} ot={o} onClick={() => router.push(`/ordenes/${o.id}`)} />)}
            </Section>
          )}

          {/* Recent orders */}
          <Section
            title="Órdenes recientes"
            action="Ver todas"
            onAction={() => router.push("/ordenes")}
          >
            {recent.length === 0 ? (
              <Empty label="Sin órdenes aún" />
            ) : (
              recent.map(o => <OTItem key={o.id} ot={o} onClick={() => router.push(`/ordenes/${o.id}`)} />)
            )}
            <button
              onClick={() => router.push("/ordenes/crear")}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 16px", background: "none", border: "none", borderTop: "1px solid #E2E8F0",
                cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563EB", fontFamily: "inherit",
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <Plus size={13} /> Nueva orden de trabajo
            </button>
          </Section>
        </div>

        {/* Right column — activity feed */}
        <Section
          title="Actividad reciente"
          action="Ver órdenes"
          onAction={() => router.push("/ordenes")}
        >
          {actividad.length === 0 ? (
            <Empty label="Sin actividad reciente" />
          ) : (
            <div style={{ padding: "4px 0" }}>
              {actividad.map((a, i) => {
                const cfg = ACTIVIDAD_CONFIG[a.tipo] ?? { icon: <RefreshCw size={11} />, label: a.tipo, color: "#6B7280" };
                return (
                  <div
                    key={a.id}
                    onClick={() => router.push(`/ordenes/${a.orden_id}`)}
                    style={{
                      display: "flex", gap: 10, padding: "8px 14px",
                      borderBottom: i < actividad.length - 1 ? "1px solid #F1F5F9" : "none",
                      cursor: "pointer", transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                      background: cfg.color + "15",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: cfg.color,
                    }}>
                      {cfg.icon}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
                        {a.usuario_nombre && (
                          <span style={{ fontWeight: 600 }}>{a.usuario_nombre.split(" ")[0]} </span>
                        )}
                        <span style={{ color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                        {a.orden_titulo && (
                          <> <span style={{ color: "#6B7280" }}>en</span>{" "}
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {a.orden_titulo.length > 30 ? a.orden_titulo.slice(0, 30) + "…" : a.orden_titulo}
                          </span></>
                        )}
                      </div>
                      {a.comentario && (
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          "{a.comentario.length > 50 ? a.comentario.slice(0, 50) + "…" : a.comentario}"
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: "#C4CDD6", marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, titleColor, action, onAction, children }: {
  title: string;
  titleColor?: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: titleColor ?? "#0F172A" }}>{title}</span>
        <button
          onClick={onAction}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          {action} <ArrowRight size={12} />
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}

function OTItem({ ot, onClick }: { ot: RecentOT; onClick: () => void }) {
  const estado = ESTADO_STYLE[ot.estado];
  const titulo = ot.titulo || ot.descripcion?.slice(0, 60) || "Sin título";
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        padding: "10px 16px", borderBottom: "1px solid #F1F5F9",
        cursor: "pointer", gap: 12, transition: "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {ot.nOT && (
          <div style={{ fontSize: 10, fontWeight: 600, color: "#1E3A8A", fontFamily: "monospace", marginBottom: 1 }}>{ot.nOT}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </div>
        {ot.ubicaciones?.edificio && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
            <MapPin size={10} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ot.ubicaciones.edificio}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, fontWeight: 600, padding: "2px 7px", background: estado.bg, color: estado.color, borderRadius: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: estado.dot }} />
          {ESTADO_LABEL[ot.estado]}
        </span>
        {ot.prioridad === "urgente" && (
          <span style={{ fontSize: 10, fontWeight: 700, color: PRIORIDAD_COLOR.urgente }}>Urgente</span>
        )}
        <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(ot.created_at)}</span>
      </div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: "#C4CDD6", fontSize: 13 }}>
      {label}
    </div>
  );
}
