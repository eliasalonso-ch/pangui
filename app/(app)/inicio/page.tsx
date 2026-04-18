"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  TrendingUp, Plus, ArrowRight, MapPin, Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad } from "@/types/ordenes";
import { parseDescMeta } from "@/lib/ordenes-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  href: string;
}

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

// ── Config ────────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente:   "Abierta",
  en_espera:   "En espera",
  en_curso:    "En curso",
  en_revision: "En revisión",
  completado:  "Completada",
  cancelado:   "Cancelada",
};

const ESTADO_STYLE: Record<Estado, { bg: string; color: string; dot: string }> = {
  pendiente:   { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_espera:   { bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  en_curso:    { bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  en_revision: { bg: "#F0F9FF", color: "#0369A1", dot: "#0EA5E9" },
  completado:  { bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
  cancelado:   { bg: "#F9FAFB", color: "#6B7280", dot: "#9CA3AF" },
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  ninguna: "#9CA3AF", baja: "#9CA3AF", media: "#3B82F6", alta: "#F97316", urgente: "#EF4444",
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

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      // Load user name
      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.nombre) setUserName(perfil.nombre.split(" ")[0]);

      const workspaceId = perfil?.workspace_id;
      if (!workspaceId) { setLoading(false); return; }

      // Load all active orders
      const { data: ordenes } = await sb
        .from("ordenes_trabajo")
        .select("id, titulo, descripcion, estado, prioridad, created_at, fecha_termino, ubicaciones(edificio)")
        .eq("workspace_id", workspaceId)
        .not("estado", "in", '("cancelado")')
        .order("created_at", { ascending: false })
        .limit(200);

      if (!ordenes) { setLoading(false); return; }

      const todayStr = new Date().toISOString().slice(0, 10);

      const abiertas      = ordenes.filter(o => o.estado === "pendiente" || o.estado === "en_espera").length;
      const en_curso      = ordenes.filter(o => o.estado === "en_curso" || o.estado === "en_revision").length;
      const urgentes      = ordenes.filter(o => o.prioridad === "urgente" && o.estado !== "completado").length;
      const completadas_hoy = ordenes.filter(o => o.estado === "completado" && o.created_at.slice(0, 10) === todayStr).length;

      setStats({ abiertas, en_curso, urgentes, completadas_hoy });

      // Recent 5
      const recentMapped: RecentOT[] = ordenes.slice(0, 5).map(o => ({
        ...o,
        ubicaciones: Array.isArray(o.ubicaciones) ? o.ubicaciones[0] : (o.ubicaciones as any),
        nOT: parseDescMeta(o.descripcion).nOT,
      }));
      setRecent(recentMapped);

      // Vencen hoy or overdue
      const due: RecentOT[] = ordenes
        .filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) <= todayStr && o.estado !== "completado")
        .slice(0, 5)
        .map(o => ({
          ...o,
          ubicaciones: Array.isArray(o.ubicaciones) ? o.ubicaciones[0] : (o.ubicaciones as any),
          nOT: parseDescMeta(o.descripcion).nOT,
        }));
      setVencenHoy(due);

      setLoading(false);
    }
    load();
  }, []);

  const statCards: StatCard[] = [
    { label: "Abiertas",        value: stats.abiertas,       icon: <ClipboardList size={18} />, color: "#1D4ED8", bg: "#EFF6FF", href: "/ordenes" },
    { label: "En curso",        value: stats.en_curso,        icon: <Wrench size={18} />,        color: "#15803D", bg: "#F0FDF4", href: "/ordenes" },
    { label: "Urgentes",        value: stats.urgentes,        icon: <AlertTriangle size={18} />, color: "#DC2626", bg: "#FEF2F2", href: "/ordenes" },
    { label: "Completadas hoy", value: stats.completadas_hoy, icon: <CheckCircle2 size={18} />,  color: "#166534", bg: "#DCFCE7", href: "/ordenes" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8594A3", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0A0F1E", letterSpacing: "-0.02em", margin: "0 0 4px", fontFamily: '"Inter", system-ui, sans-serif' }}>
          {greeting()}{userName ? `, ${userName}` : ""} 👋
        </h1>
        <p style={{ fontSize: 13, color: "#8594A3", margin: 0 }}>
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
        {statCards.map(s => (
          <button
            key={s.label}
            onClick={() => router.push(s.href)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "16px", background: "#fff",
              border: "1px solid #E5E7EB", borderRadius: 8,
              cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              transition: "box-shadow 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 12px rgba(15,23,42,0.08)"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0A0F1E", lineHeight: 1, fontFamily: '"Inter", system-ui, sans-serif' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "#8594A3", marginTop: 3, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: vencenHoy.length > 0 ? "1fr 1fr" : "1fr", gap: 20 }}>

        {/* Recent orders */}
        <Section
          title="Órdenes recientes"
          action={{ label: "Ver todas", href: "/ordenes" }}
          onAction={() => router.push("/ordenes")}
        >
          {recent.length === 0 ? (
            <Empty label="Sin órdenes aún" />
          ) : (
            recent.map(o => <OTItem key={o.id} ot={o} onClick={() => router.push(`/ordenes/${o.id}`)} />)
          )}
          <NewOTButton onClick={() => router.push("/ordenes/crear")} />
        </Section>

        {/* Vencen hoy */}
        {vencenHoy.length > 0 && (
          <Section
            title="Vencidas o vencen hoy"
            titleColor="#DC2626"
            action={{ label: "Ver todas", href: "/ordenes" }}
            onAction={() => router.push("/ordenes")}
          >
            {vencenHoy.map(o => <OTItem key={o.id} ot={o} onClick={() => router.push(`/ordenes/${o.id}`)} />)}
          </Section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, titleColor, action, onAction, children }: {
  title: string;
  titleColor?: string;
  action: { label: string; href: string };
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #F1F3F5" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: titleColor ?? "#0A0F1E" }}>{title}</span>
        <button
          onClick={onAction}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#273D88", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          {action.label} <ArrowRight size={12} />
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
        padding: "10px 16px", borderBottom: "1px solid #F9FAFB",
        cursor: "pointer", gap: 12, transition: "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {ot.nOT && (
          <div style={{ fontSize: 10, fontWeight: 600, color: "#273D88", fontFamily: "monospace", marginBottom: 2 }}>{ot.nOT}</div>
        )}
        <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </div>
        {ot.ubicaciones?.edificio && (
          <div style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>
            <MapPin size={10} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ot.ubicaciones.edificio}</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, padding: "2px 7px", background: estado.bg, color: estado.color, borderRadius: 20 }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: estado.dot }} />
          {ESTADO_LABEL[ot.estado]}
        </span>
        {ot.prioridad !== "ninguna" && ot.prioridad !== "baja" && (
          <span style={{ fontSize: 10, fontWeight: 600, color: PRIORIDAD_COLOR[ot.prioridad] }}>{ot.prioridad}</span>
        )}
        <span style={{ fontSize: 10, color: "#C4CDD6" }}>{timeAgo(ot.created_at)}</span>
      </div>
    </div>
  );
}

function NewOTButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "10px 16px", background: "none", border: "none", borderTop: "1px solid #F1F3F5",
        cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#273D88", fontFamily: "inherit",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#F5F7FF"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
    >
      <Plus size={13} /> Nueva orden de trabajo
    </button>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "32px 16px", textAlign: "center", color: "#C4CDD6", fontSize: 13 }}>
      {label}
    </div>
  );
}
