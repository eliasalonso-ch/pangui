"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Box, ChevronDown, ExternalLink, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { createClient, logRealtimeChannel } from "@/lib/supabase";
import { ACTIVO_SELECT, createActivo, deleteActivo, updateActivo } from "@/lib/activos-api";
import type { Activo, AssetCriticality, AssetStatus, Sociedad, Ubicacion, Usuario } from "@/types/ordenes";

const CRITICIDAD_LABEL: Record<AssetCriticality, string> = {
  critico: "Crítico",
  semi_critico: "Semi-crítico",
  no_critico: "No crítico",
};

const CRITICIDAD_COLOR: Record<AssetCriticality, { bg: string; color: string }> = {
  critico: { bg: "#FEF2F2", color: "#DC2626" },
  semi_critico: { bg: "#FFF7ED", color: "#C2410C" },
  no_critico: { bg: "#F0FDF4", color: "#15803D" },
};

const ESTADO_LABEL: Record<AssetStatus, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ESTADO_COLOR: Record<AssetStatus, string> = {
  operativo: "#22C55E",
  fuera_servicio: "#EF4444",
  mantencion: "#F97316",
  baja: "#94A3B8",
};

type CritFilter = AssetCriticality | "all";

interface Props {
  initialActivos: Activo[];
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  sociedades: Sociedad[];
  myRol: string | null;
  wsId: string;
  initialSelectedId?: string | null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #E2E8F0",
  fontSize: 13,
  color: "#0F172A",
  background: "#fff",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "block",
  marginBottom: 4,
};

function estadoLabel(estado: string | null | undefined) {
  return ESTADO_LABEL[estado as AssetStatus] ?? estado ?? "Sin estado";
}

function estadoColor(estado: string | null | undefined) {
  return ESTADO_COLOR[estado as AssetStatus] ?? "#94A3B8";
}

function ubicacionLabel(activo: Activo) {
  return activo.ubicacion ? [activo.ubicacion.edificio, activo.ubicacion.detalle].filter(Boolean).join(" · ") : null;
}

function SelectChevron() {
  return <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />;
}

function ActivoRow({ activo, selected, onClick }: { activo: Activo; selected: boolean; onClick: () => void }) {
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const critCfg = CRITICIDAD_COLOR[crit];
  const location = ubicacionLabel(activo);

  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        gap: 12,
        padding: "12px 16px",
        border: "none",
        borderBottom: "1px solid #F1F5F9",
        borderLeft: selected ? "3px solid #2563EB" : "3px solid transparent",
        background: selected ? "#EFF6FF" : "#fff",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {activo.imagen_url ? (
        <img src={activo.imagen_url} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: "cover", background: "#F1F5F9", flexShrink: 0 }} />
      ) : (
        <span style={{ width: 46, height: 46, borderRadius: 8, background: "#EFF6FF", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#2563EB", flexShrink: 0 }}>
          <Box size={22} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activo.nombre}</span>
        <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[activo.numero_serie, location].filter(Boolean).join(" · ") || "Sin n° de serie"}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#64748B" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: estadoColor(activo.estado) }} />
            {estadoLabel(activo.estado)}
          </span>
          <span style={{ padding: "2px 7px", borderRadius: 6, background: critCfg.bg, color: critCfg.color, fontSize: 11, fontWeight: 700 }}>
            {CRITICIDAD_LABEL[crit]}
          </span>
        </span>
      </span>
    </button>
  );
}

function DetailRow({ label, value, link }: { label: string; value?: string | null; link?: string | null }) {
  return (
    <div style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
      <div style={{ width: 150, flexShrink: 0, fontSize: 13, fontWeight: 600, color: "#64748B" }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: value ? "#0F172A" : "#94A3B8" }}>
        {link && value ? (
          <a href={link} target="_blank" rel="noreferrer" style={{ color: "#2563EB", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {value}<ExternalLink size={13} />
          </a>
        ) : value || "—"}
      </div>
    </div>
  );
}

function ActivoForm({
  activo, usuarios, ubicaciones, sociedades, activos, wsId, onSaved, onClose,
}: {
  activo?: Activo | null;
  usuarios: Usuario[];
  ubicaciones: Ubicacion[];
  sociedades: Sociedad[];
  activos: Activo[];
  wsId: string;
  onSaved: (activo: Activo) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    nombre: activo?.nombre ?? "",
    descripcion: activo?.descripcion ?? "",
    sociedad_id: activo?.sociedad_id ?? "",
    ubicacion_id: activo?.ubicacion_id ?? "",
    responsable_id: activo?.responsable_id ?? "",
    activo_padre_id: activo?.activo_padre_id ?? "",
    criticidad: (activo?.criticidad ?? "no_critico") as AssetCriticality,
    estado: (activo?.estado ?? "operativo") as AssetStatus,
    numero_serie: activo?.numero_serie ?? "",
    año_fabricacion: activo?.año_fabricacion ? String(activo.año_fabricacion) : "",
  });
  const [saving, setSaving] = useState(false);
  const filteredUbicaciones = ubicaciones.filter(u => !form.sociedad_id || u.sociedad_id === form.sociedad_id);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        sociedad_id: form.sociedad_id || null,
        ubicacion_id: form.ubicacion_id || null,
        responsable_id: form.responsable_id || null,
        activo_padre_id: form.activo_padre_id || null,
        criticidad: form.criticidad,
        estado: form.estado,
        numero_serie: form.numero_serie || null,
        año_fabricacion: form.año_fabricacion ? Number(form.año_fabricacion) : null,
      };
      const saved = activo ? await updateActivo(activo.id, payload) : await createActivo(wsId, payload);
      onSaved(saved);
    } finally {
      setSaving(false);
    }
  }

  const selectStyle = { ...inputStyle, appearance: "none", WebkitAppearance: "none" } as React.CSSProperties;

  return (
    <form onSubmit={handleSubmit} style={{ height: "100%", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{activo ? "Editar activo" : "Nuevo activo"}</h2>
        <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}><X size={18} /></button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "grid", gap: 16 }}>
        <div>
          <label style={labelStyle}>Nombre *</label>
          <input value={form.nombre} onChange={e => set("nombre", e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label style={labelStyle}>N° serie</label>
          <input value={form.numero_serie} onChange={e => set("numero_serie", e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Descripción</label>
          <textarea value={form.descripcion} onChange={e => set("descripcion", e.target.value)} rows={3} style={{ ...inputStyle, resize: "none" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Estado</label>
            <div style={{ position: "relative" }}>
              <select value={form.estado} onChange={e => set("estado", e.target.value as AssetStatus)} style={selectStyle}>
                <option value="operativo">Operativo</option>
                <option value="fuera_servicio">Fuera de servicio</option>
                <option value="mantencion">En mantención</option>
                <option value="baja">De baja</option>
              </select>
              <SelectChevron />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Criticidad</label>
            <div style={{ position: "relative" }}>
              <select value={form.criticidad} onChange={e => set("criticidad", e.target.value as AssetCriticality)} style={selectStyle}>
                <option value="critico">Crítico</option>
                <option value="semi_critico">Semi-crítico</option>
                <option value="no_critico">No crítico</option>
              </select>
              <SelectChevron />
            </div>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Cliente</label>
          <div style={{ position: "relative" }}>
            <select value={form.sociedad_id} onChange={e => { set("sociedad_id", e.target.value); set("ubicacion_id", ""); }} style={selectStyle}>
              <option value="">Sin cliente</option>
              {sociedades.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Ubicación</label>
          <div style={{ position: "relative" }}>
            <select value={form.ubicacion_id} onChange={e => set("ubicacion_id", e.target.value)} style={selectStyle}>
              <option value="">Sin ubicación</option>
              {filteredUbicaciones.map(u => <option key={u.id} value={u.id}>{u.edificio}{u.detalle ? ` · ${u.detalle}` : ""}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Responsable</label>
          <div style={{ position: "relative" }}>
            <select value={form.responsable_id} onChange={e => set("responsable_id", e.target.value)} style={selectStyle}>
              <option value="">Sin responsable</option>
              {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Activo padre</label>
          <div style={{ position: "relative" }}>
            <select value={form.activo_padre_id} onChange={e => set("activo_padre_id", e.target.value)} style={selectStyle}>
              <option value="">Sin activo padre</option>
              {activos.filter(a => a.id !== activo?.id).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <SelectChevron />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Año</label>
            <input value={form.año_fabricacion} onChange={e => set("año_fabricacion", e.target.value)} type="number" min="1900" max="2100" style={inputStyle} />
          </div>
        </div>
      </div>
      <div style={{ padding: 20, borderTop: "1px solid #E2E8F0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onClose} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#64748B", cursor: "pointer" }}>Cancelar</button>
        <button type="submit" disabled={!form.nombre.trim() || saving} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: form.nombre.trim() && !saving ? "#2563EB" : "#94A3B8", color: "#fff", fontSize: 13, fontWeight: 700, cursor: form.nombre.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6 }}>
          {saving && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
          Guardar
        </button>
      </div>
    </form>
  );
}

function ActivoDetail({
  activo, activos, onEdit, onClose, onDeleted,
}: {
  activo: Activo;
  activos: Activo[];
  onEdit: () => void;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const crit = (activo.criticidad ?? "no_critico") as AssetCriticality;
  const critCfg = CRITICIDAD_COLOR[crit];
  const hijos = activos.filter(a => a.activo_padre_id === activo.id);
  const adjuntos = Array.isArray(activo.adjuntos) ? activo.adjuntos : [];

  async function handleDelete() {
    if (!confirm("¿Eliminar este activo? Se ocultará del catálogo, pero las OTs históricas conservarán su referencia.")) return;
    setDeleting(true);
    await deleteActivo(activo.id);
    onDeleted(activo.id);
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", background: "#F8FAFC" }}>
      <div style={{ background: "#fff", padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "flex-start", gap: 16 }}>
        {activo.imagen_url ? (
          <img src={activo.imagen_url} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", background: "#F1F5F9" }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: 12, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563EB" }}><Box size={32} /></div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{activo.nombre}</h2>
              <div style={{ marginTop: 4, fontSize: 13, color: "#64748B" }}>{activo.numero_serie || "Sin n° de serie"}</div>
            </div>
            <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", height: 28 }}><X size={18} /></button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#64748B" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: estadoColor(activo.estado) }} />
              {estadoLabel(activo.estado)}
            </span>
            <span style={{ padding: "3px 8px", borderRadius: 6, background: critCfg.bg, color: critCfg.color, fontSize: 12, fontWeight: 700 }}>{CRITICIDAD_LABEL[crit]}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: 20, display: "grid", gap: 16 }}>
        <section style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 16px" }}>
          <DetailRow label="Descripción" value={activo.descripcion} />
          <DetailRow label="Fabricante" value={activo.fabricante?.nombre} />
          <DetailRow label="Modelo" value={activo.modelo?.nombre} />
          <DetailRow label="N° serie" value={activo.numero_serie} />
          <DetailRow label="Año" value={activo.año_fabricacion ? String(activo.año_fabricacion) : null} />
          <DetailRow label="Cliente" value={activo.sociedad?.nombre} />
          <DetailRow label="Ubicación" value={ubicacionLabel(activo)} />
          <DetailRow label="Responsable" value={activo.responsable?.nombre} />
          <DetailRow label="Proveedor" value={activo.proveedor?.nombre} />
          <DetailRow label="Garantía" value={activo.fecha_garantia ? new Date(activo.fecha_garantia).toLocaleDateString("es-CL") : null} />
        </section>

        {(activo.parent || hijos.length > 0) && (
          <section style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: 16 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "#0F172A" }}>Jerarquía</h3>
            {activo.parent && <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>Padre: <strong style={{ color: "#0F172A" }}>{activo.parent.nombre}</strong></div>}
            {hijos.map(h => <div key={h.id} style={{ fontSize: 13, color: "#64748B" }}>Hijo: <strong style={{ color: "#0F172A" }}>{h.nombre}</strong></div>)}
          </section>
        )}

        {adjuntos.length > 0 && (
          <section style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, padding: "4px 16px" }}>
            {adjuntos.map((a, idx) => <DetailRow key={`${a.url}-${idx}`} label={a.tipo ?? "Adjunto"} value={a.nombre} link={a.url} />)}
          </section>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={handleDelete} disabled={deleting} style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#fff", color: "#DC2626", cursor: "pointer", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Trash2 size={14} /> Eliminar
          </button>
          <button onClick={onEdit} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Editar</button>
        </div>
      </div>
    </div>
  );
}

export default function ActivosBandeja({ initialActivos, usuarios, ubicaciones, sociedades, myRol, wsId, initialSelectedId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activos, setActivos] = useState<Activo[]>(initialActivos);
  const [selected, setSelected] = useState<string | null>(initialSelectedId ?? null);
  const selectedRef = useRef<string | null>(initialSelectedId ?? null);
  const [editing, setEditing] = useState<Activo | null | "new">(null);
  const [search, setSearch] = useState("");
  const [filterCrit, setFilterCrit] = useState<CritFilter>("all");
  const [filterSociedadId, setFilterSociedadId] = useState<string | "all">("all");

  const canCreate = myRol !== "requester";
  const selectedActivo = selected ? activos.find(a => a.id === selected) ?? null : null;

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (selected) params.set("id", selected);
    else params.delete("id");
    router.replace(`/activos${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false });
  }, [selected]);

  useEffect(() => {
    const sb = createClient();
    const channelName = "activos-list";
    const channelDetails = {
      channelName,
      screen: "ActivosBandeja",
      table: "activos",
      filter: `workspace_id=eq.${wsId}`,
    };
    logRealtimeChannel("create", channelDetails, sb);
    const channel = sb
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "activos", filter: `workspace_id=eq.${wsId}` }, async (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { id?: string; activo?: boolean } | null;
        if (!row?.id) return;

        if (payload.eventType === "DELETE" || row.activo === false) {
          setActivos(prev => prev.filter(a => a.id !== row.id));
          if (selectedRef.current === row.id) setSelected(null);
          return;
        }

        const { data } = await sb
          .from("activos")
          .select(ACTIVO_SELECT)
          .eq("id", row.id)
          .eq("workspace_id", wsId)
          .eq("activo", true)
          .maybeSingle();

        if (!data) return;
        const changed = data as unknown as Activo;
        setActivos(prev => {
          const exists = prev.some(a => a.id === changed.id);
          const next = exists
            ? prev.map(a => a.id === changed.id ? changed : a)
            : [changed, ...prev];
          return next.sort((a, b) => a.nombre.localeCompare(b.nombre));
        });
      })
      .subscribe((status) => {
        logRealtimeChannel("status", { ...channelDetails, status }, sb);
      });
    return () => {
      logRealtimeChannel("remove:start", channelDetails, sb);
      void sb.removeChannel(channel).then(() => {
        logRealtimeChannel("remove:done", channelDetails, sb);
      });
    };
  }, [wsId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activos.filter(a => {
      if (filterCrit !== "all" && a.criticidad !== filterCrit) return false;
      if (filterSociedadId !== "all" && a.sociedad_id !== filterSociedadId) return false;
      if (!q) return true;
      return [a.nombre, a.numero_serie, a.fabricante?.nombre, a.modelo?.nombre, a.sociedad?.nombre, ubicacionLabel(a)]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [activos, search, filterCrit, filterSociedadId]);

  const sociedadCounts = useMemo(() => {
    const counts = new Map<string, number>();
    activos.forEach(a => { if (a.sociedad_id) counts.set(a.sociedad_id, (counts.get(a.sociedad_id) ?? 0) + 1); });
    return counts;
  }, [activos]);

  const handleSaved = useCallback((saved: Activo) => {
    setActivos(prev => {
      const exists = prev.some(a => a.id === saved.id);
      return exists ? prev.map(a => a.id === saved.id ? saved : a) : [saved, ...prev].sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
    setEditing(null);
    setSelected(saved.id);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setActivos(prev => prev.filter(a => a.id !== id));
    setSelected(null);
  }, []);

  const showRight = editing || selectedActivo;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: showRight ? 360 : "100%", maxWidth: showRight ? 360 : undefined, minWidth: 300, display: "flex", flexDirection: "column", background: "#fff", borderRight: showRight ? "1px solid #E2E8F0" : "none", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 0", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", margin: 0 }}>Activos</h1>
            {canCreate && (
              <button onClick={() => { setEditing("new"); setSelected(null); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, background: "#2563EB", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                <Plus size={14} /> Nuevo
              </button>
            )}
          </div>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, código, modelo..." style={{ ...inputStyle, paddingLeft: 32, paddingRight: search ? 28 : 10, background: "#F8FAFC" }} />
            {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 0 }}><X size={14} /></button>}
          </div>
          {sociedades.length > 0 && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10 }}>
              {[{ id: "all" as const, nombre: "Todos", count: activos.length }, ...sociedades.map(s => ({ id: s.id, nombre: s.nombre, count: sociedadCounts.get(s.id) ?? 0 }))].map(opt => {
                const active = filterSociedadId === opt.id;
                return (
                  <button key={opt.id} onClick={() => setFilterSociedadId(opt.id)} style={{ flexShrink: 0, padding: "6px 10px", borderRadius: 16, border: `1px solid ${active ? "#2563EB" : "#E2E8F0"}`, background: active ? "#EFF6FF" : "#fff", color: active ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {opt.nombre} <span style={{ color: active ? "#2563EB" : "#94A3B8" }}>{opt.count}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: "flex", gap: 0 }}>
            {(["all", "critico", "semi_critico", "no_critico"] as CritFilter[]).map(value => (
              <button key={value} onClick={() => setFilterCrit(value)} style={{ flex: 1, padding: "8px 0", background: "none", border: "none", borderBottom: `2px solid ${filterCrit === value ? "#2563EB" : "transparent"}`, color: filterCrit === value ? "#2563EB" : "#94A3B8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                {value === "all" ? "Todos" : value === "semi_critico" ? "Semi" : CRITICIDAD_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 ? (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#94A3B8", padding: 32 }}>
              <Box size={40} strokeWidth={1.5} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "#64748B", textAlign: "center" }}>{search || filterCrit !== "all" ? "Sin resultados" : "Aún no hay activos"}</span>
            </div>
          ) : filtered.map(activo => (
            <ActivoRow key={activo.id} activo={activo} selected={selected === activo.id} onClick={() => { setEditing(null); setSelected(prev => prev === activo.id ? null : activo.id); }} />
          ))}
        </div>
      </div>
      {showRight && (
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {editing ? (
            <ActivoForm
              activo={editing === "new" ? null : editing}
              usuarios={usuarios}
              ubicaciones={ubicaciones}
              sociedades={sociedades}
              activos={activos}
              wsId={wsId}
              onSaved={handleSaved}
              onClose={() => setEditing(null)}
            />
          ) : selectedActivo ? (
            <ActivoDetail
              activo={selectedActivo}
              activos={activos}
              onEdit={() => setEditing(selectedActivo)}
              onClose={() => setSelected(null)}
              onDeleted={handleDeleted}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
