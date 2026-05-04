"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, X, ClipboardList, Loader2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { LEV_SELECT, createLevantamiento } from "@/lib/levantamientos-api";
import LevantamientoDetail from "./LevantamientoDetail";
import type { Levantamiento, EstadoLevantamiento } from "@/types/levantamientos";
import type { Usuario, Ubicacion, Sociedad } from "@/types/ordenes";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACTIVE_ESTADOS: EstadoLevantamiento[] = ["creado", "en_terreno", "en_revision", "requiere_info"];
const CLOSED_ESTADOS: EstadoLevantamiento[] = ["aprobado", "no_viable"];

const ESTADO_CONFIG: Record<EstadoLevantamiento, { label: string; bg: string; color: string; dot: string }> = {
  creado:        { label: "Creado",        bg: "#F8FAFC", color: "#64748B", dot: "#94A3B8" },
  en_terreno:    { label: "En terreno",    bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_revision:   { label: "En revisión",   bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  aprobado:      { label: "Aprobado",      bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  no_viable:     { label: "No viable",     bg: "#FEF2F2", color: "#DC2626", dot: "#EF4444" },
  requiere_info: { label: "Requiere info", bg: "#FDF4FF", color: "#7C3AED", dot: "#A855F7" },
};

// ── CreatePanel ───────────────────────────────────────────────────────────────

function CreatePanel({
  myId, wsId, usuarios, ubicaciones, sociedades,
  onCreated, onClose,
}: {
  myId: string; wsId: string;
  usuarios: Usuario[]; ubicaciones: Ubicacion[]; sociedades: Sociedad[];
  onCreated: (lev: Levantamiento) => void; onClose: () => void;
}) {
  const [titulo, setTitulo]       = useState("");
  const [descripcion, setDesc]    = useState("");
  const [sociedadId, setSociedad] = useState<string>("");
  const [ubicacionId, setUbicacion] = useState<string>("");
  const [lugar, setLugar]         = useState("");
  const [asignadoA, setAsignado]  = useState<string>("");
  const [saving, setSaving]       = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const filteredUbicaciones = ubicaciones.filter(u =>
    !sociedadId || u.sociedad_id === sociedadId,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      const lev = await createLevantamiento({
        workspaceId: wsId,
        creadoPor: myId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        ubicacionId: ubicacionId || null,
        sociedadId: sociedadId || null,
        lugar: lugar.trim() || undefined,
        asignadoA: asignadoA || null,
      });
      onCreated(lev);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  const selectStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8,
    border: "1px solid #E2E8F0", fontSize: 13, color: "#0F172A",
    background: "#fff", outline: "none", appearance: "none",
    WebkitAppearance: "none",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "8px 10px",
    borderRadius: 8, border: "1px solid #E2E8F0",
    fontSize: 13, color: "#0F172A", background: "#fff", outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "#64748B",
    textTransform: "uppercase", letterSpacing: "0.05em",
    display: "block", marginBottom: 4,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0F172A" }}>Nuevo levantamiento</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={labelStyle}>Título *</label>
          <input
            ref={titleRef}
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            placeholder="Descripción breve del levantamiento"
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea
            value={descripcion}
            onChange={e => setDesc(e.target.value)}
            placeholder="Contexto adicional..."
            rows={3}
            style={{ ...inputStyle, resize: "none" }}
          />
        </div>

        <div>
          <label style={labelStyle}>Asociación</label>
          <div style={{ position: "relative" }}>
            <select value={sociedadId} onChange={e => { setSociedad(e.target.value); setUbicacion(""); }} style={selectStyle}>
              <option value="">Sin asociación</option>
              {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Ubicación</label>
          <div style={{ position: "relative" }}>
            <select value={ubicacionId} onChange={e => setUbicacion(e.target.value)} style={selectStyle}>
              <option value="">Sin ubicación</option>
              {filteredUbicaciones.map(u => (
                <option key={u.id} value={u.id}>{u.edificio}{u.piso ? ` · ${u.piso}` : ""}</option>
              ))}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Lugar específico</label>
          <input
            value={lugar}
            onChange={e => setLugar(e.target.value)}
            placeholder="Sala, piso, área..."
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Asignar a</label>
          <div style={{ position: "relative" }}>
            <select value={asignadoA} onChange={e => setAsignado(e.target.value)} style={selectStyle}>
              <option value="">Sin asignar</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
          </div>
        </div>

        <div style={{ paddingTop: 8, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!titulo.trim() || saving}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: titulo.trim() && !saving ? "#2563EB" : "#94A3B8",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: titulo.trim() ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            Crear levantamiento
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  initialLevantamientos: Levantamiento[];
  usuarios:    Usuario[];
  ubicaciones: Ubicacion[];
  sociedades:  Sociedad[];
  myId:    string;
  myRol:   string | null;
  wsId:    string;
  initialSelectedId?: string | null;
}

// ── LevRow ────────────────────────────────────────────────────────────────────

function LevRow({ lev, selected, onClick }: { lev: Levantamiento; selected: boolean; onClick: () => void }) {
  const cfg = ESTADO_CONFIG[lev.estado];
  const locationParts = [
    lev.sociedad?.nombre,
    lev.ubicaciones?.edificio,
    lev.ubicaciones?.piso,
    lev.lugar,
  ].filter(Boolean);

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 16px",
        borderBottom: "1px solid #F1F5F9",
        background: selected ? "#EFF6FF" : "#fff",
        borderLeft: selected ? "3px solid #3B82F6" : "3px solid transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "#fff"; }}
    >
      {/* Top: number + time */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", fontFamily: "monospace" }}>
          LEV-{lev.numero ?? "—"}
        </span>
        <span style={{ fontSize: 11, color: "#94A3B8" }}>
          {new Date(lev.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", lineHeight: "1.4", marginBottom: 6 }}>
        {lev.titulo}
      </div>

      {/* Bottom: estado + location */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 8px", borderRadius: 6,
          background: cfg.bg, color: cfg.color,
          fontSize: 11, fontWeight: 600,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
          {cfg.label}
        </span>
        {locationParts.length > 0 && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{locationParts.join(" · ")}</span>
        )}
        {lev.asignado && (
          <span style={{ fontSize: 11, color: "#94A3B8" }}>{lev.asignado.nombre}</span>
        )}
      </div>
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LevantamientosBandeja({
  initialLevantamientos, usuarios, ubicaciones, sociedades,
  myId, myRol, wsId, initialSelectedId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [levantamientos, setLevantamientos] = useState<Levantamiento[]>(initialLevantamientos);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<"activos" | "cerrados">("activos");
  const [search, setSearch] = useState("");

  const isAdmin = myRol === "admin" || myRol === "owner" || myRol === "jefe";
  const canCreate = myRol !== "requester";

  // Sync URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (selected) params.set("id", selected);
    else params.delete("id");
    router.replace(`/levantamientos?${params.toString()}`, { scroll: false });
  }, [selected]);

  // Realtime refresh
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("levantamientos-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "levantamientos", filter: `workspace_id=eq.${wsId}` }, async () => {
        const { data } = await sb.from("levantamientos").select(LEV_SELECT).eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(300);
        if (data) setLevantamientos(data as unknown as Levantamiento[]);
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [wsId]);

  const filtered = useMemo(() => {
    const base = levantamientos.filter(l =>
      tab === "activos" ? ACTIVE_ESTADOS.includes(l.estado) : CLOSED_ESTADOS.includes(l.estado),
    );
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter(l =>
      l.titulo.toLowerCase().includes(q) ||
      (l.sociedad?.nombre ?? "").toLowerCase().includes(q) ||
      (l.ubicaciones?.edificio ?? "").toLowerCase().includes(q) ||
      (l.asignado?.nombre ?? "").toLowerCase().includes(q) ||
      String(l.numero ?? "").includes(q),
    );
  }, [levantamientos, tab, search]);

  const handleDeleted = useCallback((id: string) => {
    setLevantamientos(prev => prev.filter(l => l.id !== id));
    if (selected === id) setSelected(null);
  }, [selected]);

  const handleUpdated = useCallback((updated: Levantamiento) => {
    setLevantamientos(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
  }, []);

  const handleCreated = useCallback((lev: Levantamiento) => {
    setLevantamientos(prev => [lev, ...prev]);
    setCreating(false);
    setSelected(lev.id);
    setTab("activos");
  }, []);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left panel ──────────────────────────────────────────────────────── */}
      <div style={{
        width: (selected || creating) ? 340 : "100%",
        maxWidth: (selected || creating) ? 340 : undefined,
        minWidth: 280,
        display: "flex",
        flexDirection: "column",
        borderRight: (selected || creating) ? "1px solid #E2E8F0" : "none",
        background: "#fff",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{ padding: "16px 16px 0", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", margin: 0 }}>Levantamientos</h1>
            {canCreate && (
              <button
                onClick={() => { setCreating(true); setSelected(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 8,
                  background: creating ? "#1D4ED8" : "#2563EB", color: "#fff",
                  border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                }}
              >
                <Plus size={14} />
                Nuevo
              </button>
            )}
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: "100%", boxSizing: "border-box",
                paddingLeft: 32, paddingRight: search ? 28 : 10,
                paddingTop: 8, paddingBottom: 8,
                border: "1px solid #E2E8F0", borderRadius: 8,
                fontSize: 13, color: "#0F172A",
                outline: "none", background: "#F8FAFC",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 0 }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {(["activos", "cerrados"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "8px 0", background: "none", border: "none",
                  borderBottom: `2px solid ${tab === t ? "#2563EB" : "transparent"}`,
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  color: tab === t ? "#2563EB" : "#94A3B8",
                }}
              >
                {t === "activos" ? "Activos" : "Cerrados"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 32, color: "#94A3B8" }}>
              <ClipboardList size={40} strokeWidth={1.5} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#64748B", textAlign: "center" }}>
                {search ? "Sin resultados" : tab === "activos" ? "Sin levantamientos activos" : "Sin levantamientos cerrados"}
              </span>
            </div>
          ) : (
            filtered.map(lev => (
              <LevRow
                key={lev.id}
                lev={lev}
                selected={selected === lev.id}
                onClick={() => setSelected(prev => prev === lev.id ? null : lev.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right panel: create or detail ───────────────────────────────────── */}
      {(creating || selected) && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {creating ? (
            <CreatePanel
              myId={myId}
              wsId={wsId}
              usuarios={usuarios}
              ubicaciones={ubicaciones}
              sociedades={sociedades}
              onCreated={handleCreated}
              onClose={() => setCreating(false)}
            />
          ) : selected ? (
            <LevantamientoDetail
              id={selected}
              myId={myId}
              myRol={myRol}
              wsId={wsId}
              usuarios={usuarios}
              ubicaciones={ubicaciones}
              sociedades={sociedades}
              onClose={() => setSelected(null)}
              onDeleted={() => handleDeleted(selected)}
              onUpdated={handleUpdated}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
