"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Boxes, Plus, Search, X, ChevronRight, Loader2,
  Package, Minus, Pencil, Trash2, Upload,
  MapPin, Tag,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Parte {
  id: string;
  nombre: string;
  descripcion?: string;
  codigo?: string;
  unidad?: string;
  precio_unitario?: number;
  ubicacion_bodega?: string;
  stock_actual?: number;
  stock_minimo?: number;
  imagen_url?: string;
  workspace_id?: string;
}

type StockFilter = "todos" | "agotado" | "bajo" | "ok";
type PanelMode = null | "view" | "edit" | "create";

// ── Helpers ────────────────────────────────────────────────────────────────────
function stockEstado(actual?: number, minimo?: number): "critico" | "bajo" | "ok" {
  const a = actual ?? 0;
  const m = minimo ?? 0;
  if (a <= 0) return "critico";
  if (a < m) return "bajo";
  return "ok";
}

const STOCK_COLOR = { critico: "#EF4444", bajo: "#F59E0B", ok: "#16A34A" } as const;
const STOCK_BG    = { critico: "#FEF2F2", bajo: "#FFFBEB", ok: "#F0FDF4" } as const;
const STOCK_LABEL = { critico: "Agotado",  bajo: "Stock bajo", ok: "En stock" } as const;

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#9CA3AF", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 12px",
  border: "1px solid #E2E8F0", borderRadius: 6,
  fontSize: 13, fontFamily: "inherit", color: "#111827",
  background: "#fff", outline: "none", boxSizing: "border-box",
};

function emptyForm(): Partial<Parte> {
  return {
    nombre: "", descripcion: "", codigo: "",
    unidad: "un", precio_unitario: undefined,
    ubicacion_bodega: "", stock_actual: 0, stock_minimo: 0,
  };
}

// ── Inline combo with create ───────────────────────────────────────────────────
function ComboCreate({
  items, value, onChange, onCreate, placeholder,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (nombre: string) => Promise<void>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));
  const selected = items.find(i => i.id === value);

  async function handleCreate() {
    if (!newName.trim()) return;
    await onCreate(newName.trim());
    setNewName("");
    setCreating(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", background: "#fff",
        }}
      >
        <span style={{ color: selected ? "#111827" : "#9CA3AF" }}>
          {selected?.label ?? placeholder ?? "Seleccionar…"}
        </span>
        <ChevronRight size={12} style={{ transform: open ? "rotate(90deg)" : "none", color: "#9CA3AF" }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
          background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden",
        }}>
          <input
            autoFocus
            type="text"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, borderRadius: 0, border: "none", borderBottom: "1px solid #F3F4F6" }}
          />
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 12, color: "#9CA3AF", fontFamily: "inherit" }}>
                — Ninguno
              </button>
            )}
            {filtered.map(i => (
              <button key={i.id} type="button"
                onClick={() => { onChange(i.id); setOpen(false); setSearch(""); }}
                style={{ width: "100%", padding: "8px 12px", background: i.id === value ? "#F8F9FF" : "none", border: "none", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#111827", fontFamily: "inherit" }}>
                {i.label}
              </button>
            ))}
            {filtered.length === 0 && !creating && (
              <p style={{ padding: "8px 12px", fontSize: 12, color: "#9CA3AF", margin: 0 }}>Sin resultados</p>
            )}
          </div>
          {creating ? (
            <div style={{ display: "flex", gap: 4, padding: "6px 8px", borderTop: "1px solid #F3F4F6" }}>
              <input
                autoFocus
                type="text"
                placeholder="Nombre…"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                style={{ ...inputStyle, height: 30, flex: 1, fontSize: 12 }}
              />
              <button type="button" onClick={handleCreate}
                style={{ height: 30, padding: "0 10px", background: "#1E3A8A", border: "none", borderRadius: 6, color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Crear
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }}
                style={{ height: 30, width: 30, background: "none", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={12} style={{ color: "#9CA3AF" }} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)}
              style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", borderTop: "1px solid #F3F4F6", cursor: "pointer", textAlign: "left", fontSize: 12, color: "#1E3A8A", fontWeight: 600, fontFamily: "inherit" }}>
              + Crear nuevo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PartesPage() {
  const router = useRouter();
  const [plantaId, setPlantaId] = useState<string | null>(null);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [loading, setLoading] = useState(true);

  const [busqueda, setBusqueda] = useState("");
  const [filtroStock, setFiltroStock] = useState<StockFilter>("todos");

  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [parteData, setParteData] = useState<Parte | null>(null);
  const [form, setForm] = useState<Partial<Parte>>(emptyForm());

  const [imgPreview, setImgPreview] = useState<string | null>(null);
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Parte | null>(null);

  const imgInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const { data: perfil } = await sb.from("usuarios")
        .select("workspace_id").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }
      const pId = perfil.workspace_id;
      setPlantaId(pId);

      const { data: p } = await sb.from("partes")
        .select("id, nombre, descripcion, codigo, unidad, stock_actual, stock_minimo, precio_unitario, ubicacion_bodega, imagen_url, workspace_id")
        .eq("workspace_id", pId).eq("activo", true).order("nombre");
      setPartes(p ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function reloadPartes() {
    if (!plantaId) return;
    const sb = createClient();
    const { data } = await sb.from("partes")
      .select("id, nombre, descripcion, codigo, unidad, stock_actual, stock_minimo, precio_unitario, ubicacion_bodega, imagen_url, workspace_id")
      .eq("workspace_id", plantaId).eq("activo", true).order("nombre");
    setPartes(data ?? []);
  }

  function openView(p: Parte) {
    setParteData(p);
    setPanelMode("view");
    setSaveErr(null);
  }

  function openEdit(p: Parte) {
    setParteData(p);
    setForm({
      nombre: p.nombre, descripcion: p.descripcion ?? "", codigo: p.codigo ?? "",
      unidad: p.unidad ?? "un", precio_unitario: p.precio_unitario,
      ubicacion_bodega: p.ubicacion_bodega ?? "", stock_actual: p.stock_actual ?? 0,
      stock_minimo: p.stock_minimo ?? 0,
    });
    setImgPreview(p.imagen_url ?? null);
    setImgFile(null);
    setSaveErr(null);
    setPanelMode("edit");
  }

  function openCreate() {
    setParteData(null);
    setForm(emptyForm());
    setImgPreview(null);
    setImgFile(null);
    setSaveErr(null);
    setPanelMode("create");
  }

  function closePanel() {
    setPanelMode(null);
    setParteData(null);
    setSaveErr(null);
    setImgPreview(null);
    setImgFile(null);
  }

  function setF<K extends keyof Parte>(k: K, v: Parte[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function ajustarStock(p: Parte, delta: number) {
    const newStock = Math.max(0, (p.stock_actual ?? 0) + delta);
    const sb = createClient();
    await sb.from("partes").update({ stock_actual: newStock }).eq("id", p.id);
    setPartes(prev => prev.map(x => x.id === p.id ? { ...x, stock_actual: newStock } : x));
    if (parteData?.id === p.id) setParteData(prev => prev ? { ...prev, stock_actual: newStock } : prev);
  }

  async function guardar() {
    setSaveErr(null);
    if (!form.nombre?.trim()) { setSaveErr("El nombre es obligatorio."); return; }
    setSaving(true);
    const sb = createClient();

    let imagen_url = parteData?.imagen_url;
    if (imgFile) {
      setUploadingImg(true);
      const ext = imgFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { data: up } = await sb.storage.from("partes-imagenes").upload(path, imgFile, { upsert: true });
      if (up) {
        const { data: { publicUrl } } = sb.storage.from("partes-imagenes").getPublicUrl(up.path);
        imagen_url = publicUrl;
      }
      setUploadingImg(false);
    }

    const payload = {
      workspace_id: plantaId,
      nombre: form.nombre!.trim(),
      descripcion: form.descripcion || null,
      codigo: form.codigo || null,
      unidad: form.unidad?.trim() || "un",
      precio_unitario: form.precio_unitario ?? null,
      ubicacion_bodega: form.ubicacion_bodega || null,
      stock_actual: form.stock_actual ?? 0,
      stock_minimo: form.stock_minimo ?? 0,
      imagen_url: imagen_url ?? null,
      activo: true,
    };

    if (panelMode === "create") {
      const { error } = await sb.from("partes").insert(payload);
      if (error) { setSaveErr("Error al crear parte."); setSaving(false); return; }
    } else {
      const { error } = await sb.from("partes").update(payload).eq("id", parteData!.id);
      if (error) { setSaveErr("Error al guardar."); setSaving(false); return; }
    }

    await reloadPartes();
    setSaving(false);
    closePanel();
  }

  async function eliminar(p: Parte) {
    const sb = createClient();
    await sb.from("partes").update({ activo: false }).eq("id", p.id);
    setPartes(prev => prev.filter(x => x.id !== p.id));
    setConfirm(null);
    closePanel();
  }

  const filtered = partes.filter(p => {
    const q = busqueda.toLowerCase();
    const matchSearch = !q || p.nombre?.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q);
    const estado = stockEstado(p.stock_actual, p.stock_minimo);
    const matchStock =
      filtroStock === "todos" ? true :
      filtroStock === "agotado" ? estado === "critico" :
      filtroStock === "bajo" ? estado === "bajo" :
      estado === "ok";
    return matchSearch && matchStock;
  });

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "#9CA3AF" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando partes…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#fff" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid #E2E8F0",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.3px" }}>Partes</h1>
        <button
          type="button"
          onClick={openCreate}
          style={{
            height: 32, padding: "0 14px",
            display: "flex", alignItems: "center", gap: 6,
            background: "#1E3A8A", border: "none", borderRadius: 6,
            fontSize: 13, fontWeight: 600, color: "#fff",
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          <Plus size={14} />
          Nueva parte
        </button>
      </div>

      {/* Filters */}
      <div style={{
        flexShrink: 0, padding: "10px 24px", borderBottom: "1px solid #F3F4F6",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder="Buscar por nombre o código…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 32, height: 32, fontSize: 12 }}
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", color: "#9CA3AF" }}>
              <X size={12} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {([["todos", "Todos"], ["agotado", "Agotado"], ["bajo", "Stock bajo"], ["ok", "En stock"]] as [StockFilter, string][]).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltroStock(k)}
              style={{
                height: 28, padding: "0 10px",
                background: filtroStock === k ? "#1E3A8A" : "#F3F4F6",
                border: "none", borderRadius: 20,
                fontSize: 11, fontWeight: 600,
                color: filtroStock === k ? "#fff" : "#6B7280",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 12, color: "#9CA3AF" }}>
              <Boxes size={36} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 13, margin: 0 }}>{busqueda || filtroStock !== "todos" ? "Sin resultados." : "No hay partes registradas."}</p>
            </div>
          ) : (
            <div>
              {filtered.map(p => {
                const estado = stockEstado(p.stock_actual, p.stock_minimo);
                const isSelected = panelMode !== null && parteData?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openView(p)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 24px",
                      background: isSelected ? "#F8F9FF" : "none",
                      border: "none", borderBottom: "1px solid #F3F4F6",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                      background: "#F3F4F6", overflow: "hidden",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <Package size={18} style={{ color: "#D1D5DB" }} />
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{p.nombre}</span>
                        {p.codigo && (
                          <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>{p.codigo}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                        {p.unidad ?? ""}
                        {p.ubicacion_bodega && ` · ${p.ubicacion_bodega}`}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                        background: STOCK_BG[estado], color: STOCK_COLOR[estado],
                      }}>
                        {p.stock_actual ?? 0} · {STOCK_LABEL[estado]}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: "#D1D5DB", flexShrink: 0 }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel */}
        {panelMode !== null && (
          <div style={{
            width: 380, flexShrink: 0,
            borderLeft: "1px solid #E2E8F0",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            {/* Panel header */}
            <div style={{
              flexShrink: 0, padding: "0 20px", height: 48,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid #F3F4F6",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {panelMode === "create" ? "Nueva parte" : (parteData?.nombre ?? "Parte")}
              </span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                {panelMode === "view" && (
                  <>
                    <button type="button" onClick={() => openEdit(parteData!)}
                      title="Editar"
                      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #E2E8F0", borderRadius: 6, cursor: "pointer", color: "#6B7280" }}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" onClick={() => setConfirm(parteData!)}
                      title="Eliminar"
                      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "1px solid #FECACA", borderRadius: 6, cursor: "pointer", color: "#DC2626" }}>
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
                <button type="button" onClick={closePanel}
                  style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF" }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* View */}
            {panelMode === "view" && parteData && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                {parteData.imagen_url && (
                  <img
                    src={parteData.imagen_url}
                    alt={parteData.nombre}
                    style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8 }}
                  />
                )}
                {/* Stock block */}
                <div style={{ display: "flex", gap: 10 }}>
                  {(["stock_actual", "stock_minimo"] as const).map(k => {
                    const estado = k === "stock_actual" ? stockEstado(parteData.stock_actual, parteData.stock_minimo) : "ok";
                    return (
                      <div key={k} style={{ flex: 1, padding: "10px 14px", background: k === "stock_actual" ? STOCK_BG[estado] : "#F9FAFB", borderRadius: 8, textAlign: "center" }}>
                        <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: k === "stock_actual" ? STOCK_COLOR[estado] : "#374151" }}>
                          {parteData[k] ?? 0}
                        </p>
                        <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>
                          {k === "stock_actual" ? "Actual" : "Mínimo"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {/* Stock adjust */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => ajustarStock(parteData, -1)}
                    style={{ width: 32, height: 32, border: "1px solid #E2E8F0", borderRadius: 6, background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                    <Minus size={14} />
                  </button>
                  <span style={{ flex: 1, textAlign: "center", fontSize: 13, color: "#374151", fontWeight: 600 }}>Ajustar stock</span>
                  <button type="button" onClick={() => ajustarStock(parteData, 1)}
                    style={{ width: 32, height: 32, border: "1px solid #E2E8F0", borderRadius: 6, background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
                    <Plus size={14} />
                  </button>
                </div>
                {/* Meta */}
                {[
                  { icon: Tag,    label: "Código",     val: parteData.codigo },
                  { icon: MapPin, label: "Ubicación",  val: parteData.ubicacion_bodega },
                  { icon: Package, label: "Unidad",    val: parteData.unidad },
                ].filter(m => m.val).map(m => (
                  <div key={m.label} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <m.icon size={14} style={{ color: "#9CA3AF", marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{m.label}</p>
                      <p style={{ fontSize: 12, color: "#374151", margin: "1px 0 0" }}>{m.val}</p>
                    </div>
                  </div>
                ))}
                {parteData.precio_unitario !== undefined && parteData.precio_unitario !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#6B7280" }}>Precio unitario:</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      ${parteData.precio_unitario.toLocaleString("es-CL")}
                    </span>
                  </div>
                )}
                {parteData.descripcion && (
                  <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.6 }}>{parteData.descripcion}</p>
                )}
              </div>
            )}

            {/* Edit / Create form */}
            {(panelMode === "edit" || panelMode === "create") && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>

                {/* Image upload */}
                <div>
                  <label style={labelStyle}>Imagen</label>
                  <div
                    onClick={() => imgInputRef.current?.click()}
                    style={{
                      width: "100%", aspectRatio: "16/9", borderRadius: 8,
                      border: "1.5px dashed #E2E8F0", cursor: "pointer",
                      overflow: "hidden", background: "#F9FAFB",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {imgPreview
                      ? <img src={imgPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "#9CA3AF" }}>
                          <Upload size={20} style={{ margin: "0 auto 6px" }} />
                          <p style={{ fontSize: 11, margin: 0 }}>Subir imagen</p>
                        </div>
                    }
                  </div>
                  <input ref={imgInputRef} type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) { setImgFile(f); setImgPreview(URL.createObjectURL(f)); }
                    }} />
                </div>

                <div>
                  <label style={labelStyle}>Nombre *</label>
                  <input style={inputStyle} value={form.nombre ?? ""} onChange={e => setF("nombre", e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                </div>

                <div>
                  <label style={labelStyle}>Código</label>
                  <input style={inputStyle} value={form.codigo ?? ""} placeholder="SKU, código interno…"
                    onChange={e => setF("codigo", e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                </div>

                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea
                    value={form.descripcion ?? ""} rows={2} placeholder="Descripción opcional…"
                    onChange={e => setF("descripcion", e.target.value)}
                    style={{ ...inputStyle, height: "auto", padding: "8px 12px", resize: "vertical" }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Unidad *</label>
                  <input style={inputStyle} value={form.unidad ?? "un"} placeholder="un, kg, m, lt…"
                    onChange={e => setF("unidad", e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Stock actual</label>
                    <input type="number" min={0} style={inputStyle}
                      value={form.stock_actual ?? 0}
                      onChange={e => setF("stock_actual", Number(e.target.value))}
                      onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                  </div>
                  <div>
                    <label style={labelStyle}>Stock mínimo</label>
                    <input type="number" min={0} style={inputStyle}
                      value={form.stock_minimo ?? 0}
                      onChange={e => setF("stock_minimo", Number(e.target.value))}
                      onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Precio unitario</label>
                  <input type="number" min={0} style={inputStyle} placeholder="0"
                    value={form.precio_unitario ?? ""}
                    onChange={e => setF("precio_unitario", e.target.value ? Number(e.target.value) : undefined)}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                </div>

                <div>
                  <label style={labelStyle}>Ubicación en bodega</label>
                  <input style={inputStyle} value={form.ubicacion_bodega ?? ""} placeholder="Ej. Estante A3, Bodega 2…"
                    onChange={e => setF("ubicacion_bodega", e.target.value)}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }} />
                </div>

                {saveErr && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{saveErr}</p>}

                <button
                  type="button"
                  onClick={guardar}
                  disabled={saving}
                  style={{
                    height: 38, border: "none", borderRadius: 6,
                    background: "#1E3A8A", color: "#fff",
                    fontSize: 13, fontWeight: 600,
                    cursor: saving ? "default" : "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving
                    ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
                    : panelMode === "create" ? "Crear parte" : "Guardar cambios"
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {confirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12,
            width: "100%", maxWidth: 360, padding: 24,
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
              ¿Eliminar parte?
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", margin: "0 0 20px" }}>
              <strong>{confirm.nombre}</strong> será eliminada permanentemente.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setConfirm(null)}
                style={{ flex: 1, height: 36, border: "1px solid #E2E8F0", borderRadius: 6, background: "none", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>
                Cancelar
              </button>
              <button type="button" onClick={() => eliminar(confirm)}
                style={{ flex: 1, height: 36, border: "none", borderRadius: 6, background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
