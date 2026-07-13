"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  AlertTriangle, Box, Boxes, Check, ChevronRight, CircleAlert, ImagePlus,
  Filter, Loader2, MapPin, Minus, Package, Pencil, Plus, RotateCcw, Search, Trash2, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import styles from "./partes.module.css";

interface Material {
  id: string; nombre: string; descripcion: string | null; codigo: string;
  unidad: string; precio_unitario: number | null; ubicacion_bodega: string | null;
  stock_actual: number; stock_minimo: number; imagen_url: string | null; workspace_id: string;
}
interface Ubicacion { id: string; edificio: string; direccion: string | null; }
interface Lugar { id: string; nombre: string; ubicacion_id: string | null; }
interface Reservation {
  id: string; parte_id: string; ubicacion_id: string; lugar_id: string | null; cantidad: number;
  parte: Pick<Material, "id" | "nombre" | "codigo" | "unidad" | "imagen_url"> | null;
  lugar: Pick<Lugar, "id" | "nombre"> | null;
}
type Segment = "materiales" | "ubicaciones";
type StockFilter = "todos" | "agotado" | "bajo" | "ok";
type EditorState = { mode: "create" | "edit"; material: Material | null } | null;

const emptyForm = {
  nombre: "", descripcion: "", codigo: "", unidad: "und", precio_unitario: "",
  ubicacion_bodega: "", stock_actual: "0", stock_minimo: "0", imagen_url: "",
};

function stockState(material: Material): "agotado" | "bajo" | "ok" {
  if (Number(material.stock_actual) <= 0) return "agotado";
  if (Number(material.stock_actual) <= Number(material.stock_minimo)) return "bajo";
  return "ok";
}

function MaterialImage({ material, large = false }: { material: Pick<Material, "nombre" | "imagen_url">; large?: boolean }) {
  return (
    <div className={large ? styles.heroImage : styles.thumbnail}>
      {material.imagen_url
        ? <Image src={material.imagen_url} alt={material.nombre} fill sizes={large ? "720px" : "40px"} unoptimized />
        : <Package size={large ? 40 : 20} />}
    </div>
  );
}

export default function MaterialesPage() {
  const subscription = useSuscripcion();
  if (subscription.loading) return <Loading />;
  if (subscription.data?.plan_features && !subscription.data.plan_features.inventario) {
    return <UpgradePrompt variant="card" title="Inventario está disponible en Pro" description="Sube tu plan para gestionar materiales, stock disponible y reservas por ubicación." upgradeTo="Pro" />;
  }
  return <MaterialesPageInner />;
}

function Loading() {
  return <div className={styles.loading}><Loader2 size={20} className="animate-spin" /><span>Cargando inventario…</span></div>;
}

function MaterialesPageInner() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [role, setRole] = useState("tecnico");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [locations, setLocations] = useState<Ubicacion[]>([]);
  const [places, setPlaces] = useState<Lugar[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [reservationWarning, setReservationWarning] = useState(false);
  const [segment, setSegment] = useState<Segment>("materiales");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [locationFilterId, setLocationFilterId] = useState<string | null>(null);
  const [materialFilterId, setMaterialFilterId] = useState<string | null>(null);
  const [requiresMaterials, setRequiresMaterials] = useState(false);
  const [requiresSheet, setRequiresSheet] = useState(false);

  const loadData = useCallback(async (wsId: string) => {
    const sb = createClient();
    const [materialRes, locationRes, placeRes, reservationRes, workspaceRes] = await Promise.all([
      sb.from("partes").select("id,nombre,descripcion,codigo,unidad,precio_unitario,ubicacion_bodega,stock_actual,stock_minimo,imagen_url,workspace_id").eq("workspace_id", wsId).eq("activo", true).order("nombre"),
      sb.from("ubicaciones").select("id,edificio,direccion").eq("workspace_id", wsId).eq("activa", true).order("edificio"),
      sb.from("lugares").select("id,nombre,ubicacion_id").eq("workspace_id", wsId).eq("activo", true).order("nombre"),
      sb.from("material_reservations").select("id,parte_id,ubicacion_id,lugar_id,cantidad,parte:partes!parte_id(id,nombre,codigo,unidad,imagen_url),lugar:lugares!lugar_id(id,nombre)").eq("workspace_id", wsId).order("created_at", { ascending: false }),
      sb.from("workspaces").select("requiere_materiales_global,requiere_hoja_global").eq("id", wsId).maybeSingle(),
    ]);
    setMaterials((materialRes.data ?? []) as Material[]);
    setLocations((locationRes.data ?? []) as Ubicacion[]);
    setPlaces((placeRes.data ?? []) as Lugar[]);
    if (reservationRes.error) {
      setReservations([]); setReservationWarning(true);
    } else {
      setReservations((reservationRes.data ?? []) as unknown as Reservation[]); setReservationWarning(false);
    }
    setRequiresMaterials(workspaceRes.data?.requiere_materiales_global ?? false);
    setRequiresSheet(workspaceRes.data?.requiere_hoja_global ?? false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from("usuarios").select("workspace_id,rol").eq("id", user.id).maybeSingle();
      if (!active || !profile?.workspace_id) return;
      setWorkspaceId(profile.workspace_id); setRole(profile.rol ?? "tecnico");
      await loadData(profile.workspace_id);
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [loadData]);

  const selectedMaterial = materials.find(item => item.id === selectedMaterialId) ?? null;
  const selectedLocation = locations.find(item => item.id === selectedLocationId) ?? null;
  const canManage = role === "admin" || role === "owner" || role === "supervisor";
  const lowCount = materials.filter(item => stockState(item) !== "ok").length;

  const filteredMaterials = useMemo(() => materials.filter(material => {
    const q = search.trim().toLowerCase();
    const matches = !q || [material.nombre, material.codigo, material.ubicacion_bodega].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    const reservedAtLocation = !locationFilterId || reservations.some(item => item.ubicacion_id === locationFilterId && item.parte_id === material.id);
    return matches && reservedAtLocation && (stockFilter === "todos" || stockState(material) === stockFilter);
  }), [locationFilterId, materials, reservations, search, stockFilter]);

  const filteredLocations = useMemo(() => locations.filter(location => {
    const q = search.trim().toLowerCase();
    const containsMaterial = !materialFilterId || reservations.some(item => item.parte_id === materialFilterId && item.ubicacion_id === location.id);
    return containsMaterial && (!q || [location.edificio, location.direccion].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }), [locations, materialFilterId, reservations, search]);

  const chooseSegment = (next: Segment) => {
    setSegment(next); setSearch(""); setSelectedMaterialId(null); setSelectedLocationId(null); setEditor(null);
  };

  const refresh = async () => { if (workspaceId) await loadData(workspaceId); };

  const adjustStock = async (material: Material, delta: number) => {
    const next = Math.max(0, Number(material.stock_actual) + delta);
    const sb = createClient();
    const { error } = await sb.from("partes").update({ stock_actual: next }).eq("id", material.id);
    if (!error) setMaterials(prev => prev.map(item => item.id === material.id ? { ...item, stock_actual: next } : item));
  };

  const removeMaterial = async (material: Material) => {
    if (!window.confirm(`¿Eliminar “${material.nombre}” del inventario?`)) return;
    const sb = createClient();
    const { error } = await sb.from("partes").update({ activo: false }).eq("id", material.id);
    if (!error) { setMaterials(prev => prev.filter(item => item.id !== material.id)); setSelectedMaterialId(null); }
  };

  const toggleWorkspaceSetting = async (field: "requiere_materiales_global" | "requiere_hoja_global", value: boolean) => {
    if (!workspaceId) return;
    const sb = createClient();
    const { error } = await sb.from("workspaces").update({ [field]: value }).eq("id", workspaceId);
    if (!error) field === "requiere_materiales_global" ? setRequiresMaterials(value) : setRequiresSheet(value);
  };

  if (loading) return <Loading />;

  const showRight = !!(editor || selectedMaterial || selectedLocation);
  const activeRelationFilter = segment === "materiales" ? locationFilterId : materialFilterId;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Inventario</h1>
        <div className={styles.headerActions}>
          <div className={styles.searchBox}>
            <Search size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={segment === "materiales" ? "Buscar materiales…" : "Buscar ubicaciones…"} />
            {search && <button onClick={() => setSearch("")} aria-label="Limpiar búsqueda"><X size={13} /></button>}
          </div>
          <button className={`${styles.filterButton} ${activeRelationFilter ? styles.filterButtonActive : ""}`} onClick={() => setFilterOpen(true)} aria-label="Filtrar inventario" title="Filtrar">
            <Filter size={16} />
            {activeRelationFilter && <span />}
          </button>
          {segment === "materiales" && canManage && <button className={styles.primaryButton} onClick={() => setEditor({ mode: "create", material: null })}><Plus size={16} />Nuevo material</button>}
        </div>
      </header>

      <div className={styles.subnav}>
        <div className={styles.segmented}>
          <button className={segment === "materiales" ? styles.segmentActive : ""} onClick={() => chooseSegment("materiales")}>Materiales <span>{materials.length}</span></button>
          <button className={segment === "ubicaciones" ? styles.segmentActive : ""} onClick={() => chooseSegment("ubicaciones")}>Ubicaciones <span>{locations.length}</span></button>
        </div>
        {segment === "materiales" && <div className={styles.filters}>{([['todos','Todos'],['agotado','Agotado'],['bajo','Stock bajo'],['ok','En stock']] as [StockFilter,string][]).map(([value,label]) => <button key={value} className={stockFilter === value ? styles.filterActive : ""} onClick={() => setStockFilter(value)}>{label}</button>)}</div>}
      </div>

      {reservationWarning && <div className={styles.warning}><CircleAlert size={15} />Las reservas todavía no están habilitadas en la base de datos. Aplica la migración para usar esta sección.</div>}

      <main className={styles.main}>
        <section className={`${styles.listPane} ${showRight ? styles.mobileHidden : ""}`}>
          {segment === "materiales" ? (
            <>
              <div className={styles.summary}>
                <Summary icon={<Package size={18} />} value={materials.length} label="Materiales" />
                <Summary icon={<AlertTriangle size={18} />} value={lowCount} label="Stock bajo" danger={lowCount > 0} />
              </div>
              <div className={styles.list}>
                {filteredMaterials.length ? filteredMaterials.map(material => <MaterialRow key={material.id} material={material} selected={selectedMaterialId === material.id} onClick={() => { setEditor(null); setSelectedMaterialId(material.id); }} />) : <Empty icon={<Boxes size={38} />} title="Sin materiales" subtitle="No hay materiales que coincidan con los filtros." />}
              </div>
            </>
          ) : (
            <div className={styles.list}>
              {filteredLocations.length ? filteredLocations.map(location => {
                const assigned = reservations.filter(item => item.ubicacion_id === location.id);
                const unique = new Set(assigned.map(item => item.parte_id)).size;
                const total = assigned.reduce((sum, item) => sum + Number(item.cantidad), 0);
                return <LocationRow key={location.id} location={location} selected={selectedLocationId === location.id} count={unique} total={total} onClick={() => { setEditor(null); setSelectedLocationId(location.id); }} />;
              }) : <Empty icon={<MapPin size={38} />} title="Sin ubicaciones" subtitle="No hay ubicaciones que coincidan con la búsqueda." />}
            </div>
          )}
        </section>

        <section className={styles.detailPane}>
          {editor ? <MaterialEditor state={editor} workspaceId={workspaceId!} onClose={() => setEditor(null)} onSaved={async () => { await refresh(); setEditor(null); }} />
            : selectedMaterial ? <MaterialDetail material={selectedMaterial} reservations={reservations.filter(item => item.parte_id === selectedMaterial.id)} locations={locations} canManage={canManage} onClose={() => setSelectedMaterialId(null)} onEdit={() => setEditor({ mode: "edit", material: selectedMaterial })} onDelete={() => removeMaterial(selectedMaterial)} onAdjust={delta => adjustStock(selectedMaterial, delta)} onOpenLocation={id => { setSegment("ubicaciones"); setSelectedMaterialId(null); setSelectedLocationId(id); }} />
            : selectedLocation ? <LocationDetail location={selectedLocation} reservations={reservations.filter(item => item.ubicacion_id === selectedLocation.id)} canManage={canManage} onClose={() => setSelectedLocationId(null)} onReserve={() => setReserveOpen(true)} onRefresh={refresh} onOpenMaterial={id => { setSegment("materiales"); setSelectedLocationId(null); setSelectedMaterialId(id); }} />
            : <Empty icon={<Package size={32} />} title={segment === "materiales" ? "Selecciona un material" : "Selecciona una ubicación"} subtitle="El detalle aparecerá aquí." />}
        </section>
      </main>

      {canManage && <div className={styles.settingsBar}>
        <span>Configuración de OTs</span>
        <label><input type="checkbox" checked={requiresMaterials} onChange={e => toggleWorkspaceSetting("requiere_materiales_global", e.target.checked)} />Exigir materiales</label>
        <label><input type="checkbox" checked={requiresSheet} onChange={e => toggleWorkspaceSetting("requiere_hoja_global", e.target.checked)} />Exigir hoja de cálculo</label>
      </div>}

      {reserveOpen && selectedLocation && <ReservationDialog location={selectedLocation} materials={materials.filter(item => Number(item.stock_actual) > 0)} places={places.filter(item => item.ubicacion_id === selectedLocation.id)} onClose={() => setReserveOpen(false)} onSaved={async () => { await refresh(); setReserveOpen(false); }} />}
      {filterOpen && <InventoryFilterDialog segment={segment} locations={locations} materials={materials} selectedId={activeRelationFilter} onSelect={id => { if (segment === "materiales") setLocationFilterId(id); else setMaterialFilterId(id); setFilterOpen(false); }} onClose={() => setFilterOpen(false)} />}
    </div>
  );
}

function Summary({ icon, value, label, danger }: { icon: React.ReactNode; value: number; label: string; danger?: boolean }) {
  return <div className={styles.summaryItem}><span className={styles.iconTile}>{icon}</span><div><strong className={danger ? styles.dangerText : ""}>{value}</strong><small>{label}</small></div></div>;
}

function MaterialRow({ material, selected, onClick }: { material: Material; selected: boolean; onClick: () => void }) {
  const state = stockState(material);
  return <button className={`${styles.row} ${selected ? styles.selected : ""}`} onClick={onClick}><MaterialImage material={material} /><div className={styles.rowText}><strong>{material.nombre}</strong><span>{[material.codigo, material.ubicacion_bodega].filter(Boolean).join(" · ") || material.unidad}</span></div><div className={styles.stock}><strong className={state !== "ok" ? styles.dangerText : ""}>{material.stock_actual}</strong><span>{material.unidad}</span></div><ChevronRight size={17} /></button>;
}

function LocationRow({ location, selected, count, total, onClick }: { location: Ubicacion; selected: boolean; count: number; total: number; onClick: () => void }) {
  return <button className={`${styles.row} ${selected ? styles.selected : ""}`} onClick={onClick}><span className={styles.iconTile}><MapPin size={20} /></span><div className={styles.rowText}><strong>{location.edificio}</strong><span>{count ? `${count} material${count === 1 ? "" : "es"} · ${total.toLocaleString("es-CL")} unidades` : "Sin materiales reservados"}</span></div><ChevronRight size={17} /></button>;
}

function DetailHeader({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return <div className={styles.detailHeader}><button className={styles.mobileBack} onClick={onClose}><ChevronRight size={18} />Volver</button><strong>{title}</strong><div>{children}<button className={styles.iconButton} onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div></div>;
}

function MaterialDetail({ material, reservations, locations, canManage, onClose, onEdit, onDelete, onAdjust, onOpenLocation }: { material: Material; reservations: Reservation[]; locations: Ubicacion[]; canManage: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void; onAdjust: (delta: number) => void; onOpenLocation: (id: string) => void }) {
  const state = stockState(material);
  return <div className={styles.detail}><DetailHeader title="Material" onClose={onClose}>{canManage && <><button className={styles.iconButton} onClick={onEdit} title="Editar"><Pencil size={15} /></button><button className={`${styles.iconButton} ${styles.deleteButton}`} onClick={onDelete} title="Eliminar"><Trash2 size={15} /></button></>}</DetailHeader><div className={styles.detailScroll}><div className={styles.heroCard}><MaterialImage material={material} large /><h2>{material.nombre}</h2><p>{material.codigo}</p><div className={styles.stockHero}><span className={styles.iconTile}>{state === "ok" ? <Check size={18} /> : <AlertTriangle size={18} />}</span><div><strong className={state !== "ok" ? styles.dangerText : ""}>{material.stock_actual} {material.unidad}</strong><small>{state === "ok" ? "Stock disponible" : state === "bajo" ? "Stock bajo el mínimo" : "Material agotado"}</small></div></div></div>{material.descripcion && <InfoCard title="Descripción"><p>{material.descripcion}</p></InfoCard>}<InfoCard title="Inventario"><InfoRow label="Stock actual" value={`${material.stock_actual} ${material.unidad}`} /><InfoRow label="Stock mínimo" value={`${material.stock_minimo} ${material.unidad}`} /><InfoRow label="Unidad" value={material.unidad} /><div className={styles.adjust}><button onClick={() => onAdjust(-1)}><Minus size={15} /></button><span>Ajustar stock disponible</span><button onClick={() => onAdjust(1)}><Plus size={15} /></button></div></InfoCard><InfoCard title="Identificación"><InfoRow label="Código" value={material.codigo || "Sin código"} /><InfoRow label="Ubicación en bodega" value={material.ubicacion_bodega || "Sin ubicación"} /></InfoCard>{reservations.length > 0 && <InfoCard title="Reservado en">{reservations.map(item => { const location = locations.find(value => value.id === item.ubicacion_id); return <button key={item.id} className={styles.linkedRow} onClick={() => onOpenLocation(item.ubicacion_id)}><span className={styles.iconTile}><MapPin size={18} /></span><div><strong>{location?.edificio ?? "Ubicación"}</strong><small>{item.lugar?.nombre ?? "Ubicación general"} · {Number(item.cantidad).toLocaleString("es-CL")} {material.unidad}</small></div><ChevronRight size={17} /></button>; })}</InfoCard>}</div></div>;
}

function LocationDetail({ location, reservations, canManage, onClose, onReserve, onRefresh, onOpenMaterial }: { location: Ubicacion; reservations: Reservation[]; canManage: boolean; onClose: () => void; onReserve: () => void; onRefresh: () => Promise<void>; onOpenMaterial: (id: string) => void }) {
  const release = async (reservation: Reservation) => {
    if (!window.confirm(`¿Devolver ${reservation.cantidad} ${reservation.parte?.unidad ?? "unidades"} al inventario disponible?`)) return;
    const sb = createClient();
    const { error } = await sb.rpc("release_material_reservation", { p_reservation_id: reservation.id, p_cantidad: reservation.cantidad });
    if (error) window.alert(error.message); else await onRefresh();
  };
  return <div className={styles.detail}><DetailHeader title={location.edificio} onClose={onClose}>{canManage && <button className={styles.primarySmall} onClick={onReserve}><Plus size={15} />Reservar</button>}</DetailHeader><div className={styles.detailScroll}><InfoCard title="Inventario reservado">{reservations.length ? reservations.map(item => <div className={styles.reservationRow} key={item.id}><MaterialImage material={{ nombre: item.parte?.nombre ?? "Material", imagen_url: item.parte?.imagen_url ?? null }} /><button className={styles.reservationLink} onClick={() => onOpenMaterial(item.parte_id)}><strong>{item.parte?.nombre ?? "Material"}</strong><span>{item.lugar?.nombre ?? "Ubicación general"}</span></button><b>{Number(item.cantidad).toLocaleString("es-CL")} {item.parte?.unidad}</b>{canManage && <button onClick={() => release(item)} title="Devolver"><RotateCcw size={15} /></button>}<ChevronRight size={16} /></div>) : <Empty icon={<Package size={34} />} title="Sin materiales reservados" subtitle="Reserva materiales disponibles para esta ubicación." />}</InfoCard></div></div>;
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className={styles.infoSection}><h3>{title}</h3><div className={styles.infoCard}>{children}</div></section>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className={styles.infoRow}><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) { return <div className={styles.empty}>{icon}<strong>{title}</strong><span>{subtitle}</span></div>; }

function MaterialEditor({ state, workspaceId, onClose, onSaved }: { state: NonNullable<EditorState>; workspaceId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const material = state.material;
  const [form, setForm] = useState({ ...emptyForm, ...(material ? { nombre: material.nombre, descripcion: material.descripcion ?? "", codigo: material.codigo, unidad: material.unidad, precio_unitario: material.precio_unitario?.toString() ?? "", ubicacion_bodega: material.ubicacion_bodega ?? "", stock_actual: material.stock_actual.toString(), stock_minimo: material.stock_minimo.toString(), imagen_url: material.imagen_url ?? "" } : {}) });
  const [file, setFile] = useState<File | null>(null); const [saving, setSaving] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof form, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    if (!form.nombre.trim()) return;
    setSaving(true); const sb = createClient(); let imageUrl = form.imagen_url || null;
    if (file) { const ext = file.name.split(".").pop() ?? "jpg"; const path = `${workspaceId}/${Date.now()}.${ext}`; const upload = await sb.storage.from("partes-imagenes").upload(path, file, { upsert: true }); if (upload.data) imageUrl = sb.storage.from("partes-imagenes").getPublicUrl(upload.data.path).data.publicUrl; }
    const payload = { workspace_id: workspaceId, nombre: form.nombre.trim(), descripcion: form.descripcion.trim() || null, codigo: form.codigo.trim(), unidad: form.unidad || "und", precio_unitario: form.precio_unitario ? Number(form.precio_unitario) : null, ubicacion_bodega: form.ubicacion_bodega.trim() || null, stock_actual: Number(form.stock_actual) || 0, stock_minimo: Number(form.stock_minimo) || 0, imagen_url: imageUrl, activo: true };
    const result = state.mode === "create" ? await sb.from("partes").insert(payload) : await sb.from("partes").update(payload).eq("id", material!.id);
    setSaving(false); if (result.error) window.alert(result.error.message); else await onSaved();
  };
  return <div className={styles.detail}><DetailHeader title={state.mode === "create" ? "Nuevo material" : "Editar material"} onClose={onClose}><button className={styles.primarySmall} onClick={save} disabled={saving || !form.nombre.trim()}>{saving && <Loader2 size={14} className="animate-spin" />}Guardar</button></DetailHeader><div className={styles.form}><button className={styles.imagePicker} onClick={() => inputRef.current?.click()}>{form.imagen_url ? <Image src={form.imagen_url} alt="Vista previa" fill sizes="720px" unoptimized /> : <><ImagePlus size={26} /><span>Agregar imagen</span></>}<input ref={inputRef} hidden type="file" accept="image/*" onChange={e => { const next = e.target.files?.[0]; if (next) { setFile(next); set("imagen_url", URL.createObjectURL(next)); } }} /></button><Field label="Nombre" value={form.nombre} onChange={value => set("nombre", value)} required /><Field label="Descripción" value={form.descripcion} onChange={value => set("descripcion", value)} multiline /><div className={styles.formGrid}><Field label="Código" value={form.codigo} onChange={value => set("codigo", value)} /><Field label="Unidad" value={form.unidad} onChange={value => set("unidad", value)} /></div><div className={styles.formGrid}><Field label="Stock actual" value={form.stock_actual} onChange={value => set("stock_actual", value)} type="number" /><Field label="Stock mínimo" value={form.stock_minimo} onChange={value => set("stock_minimo", value)} type="number" /></div><Field label="Ubicación en bodega" value={form.ubicacion_bodega} onChange={value => set("ubicacion_bodega", value)} /><Field label="Precio unitario" value={form.precio_unitario} onChange={value => set("precio_unitario", value)} type="number" /></div></div>;
}

function Field({ label, value, onChange, type = "text", required, multiline }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; multiline?: boolean }) { return <label className={styles.field}><span>{label}{required ? " *" : ""}</span>{multiline ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} /> : <input type={type} value={value} onChange={e => onChange(e.target.value)} />}</label>; }

function InventoryFilterDialog({ segment, locations, materials, selectedId, onSelect, onClose }: { segment: Segment; locations: Ubicacion[]; materials: Material[]; selectedId: string | null; onSelect: (id: string | null) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const options = segment === "materiales"
    ? locations.map(item => ({ id: item.id, label: item.edificio }))
    : materials.map(item => ({ id: item.id, label: item.nombre }));
  const normalized = query.trim().toLocaleLowerCase("es");
  const filteredOptions = options.filter(option => option.label.toLocaleLowerCase("es").includes(normalized));
  return <div className={styles.overlay} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className={styles.dialog}><div className={styles.dialogHeader}><div><h2>Filtrar inventario</h2><p>{segment === "materiales" ? "Materiales reservados por ubicación" : "Ubicaciones que contienen un material"}</p></div><button className={styles.iconButton} onClick={onClose}><X size={17} /></button></div><div className={styles.filterSearch}><Search size={16} /><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder={segment === "materiales" ? "Buscar ubicaciones" : "Buscar materiales"} />{query && <button onClick={() => setQuery("")} aria-label="Borrar búsqueda"><X size={15} /></button>}</div><div className={styles.filterOptions}>{!query && <button className={!selectedId ? styles.filterOptionActive : ""} onClick={() => onSelect(null)}><span>Todos</span>{!selectedId && <Check size={17} />}</button>}{filteredOptions.map(option => <button key={option.id} className={selectedId === option.id ? styles.filterOptionActive : ""} onClick={() => onSelect(option.id)}><span>{option.label}</span>{selectedId === option.id && <Check size={17} />}</button>)}{filteredOptions.length === 0 && <div className={styles.filterEmpty}>No hay resultados para “{query}”.</div>}</div></div></div>;
}

function ReservationDialog({ location, materials, places, onClose, onSaved }: { location: Ubicacion; materials: Material[]; places: Lugar[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [materialId, setMaterialId] = useState(""); const [placeId, setPlaceId] = useState(""); const [quantity, setQuantity] = useState("1"); const [saving, setSaving] = useState(false);
  const selected = materials.find(item => item.id === materialId);
  const save = async () => { const amount = Number(quantity); if (!selected || amount <= 0 || amount > selected.stock_actual) return; setSaving(true); const sb = createClient(); const { error } = await sb.rpc("reserve_material", { p_parte_id: selected.id, p_ubicacion_id: location.id, p_lugar_id: placeId || null, p_cantidad: amount }); setSaving(false); if (error) window.alert(error.message); else await onSaved(); };
  return <div className={styles.overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className={styles.dialog}><div className={styles.dialogHeader}><div><h2>Reservar material</h2><p>{location.edificio}</p></div><button className={styles.iconButton} onClick={onClose}><X size={17} /></button></div><div className={styles.dialogBody}><label className={styles.field}><span>Material disponible</span><select value={materialId} onChange={e => setMaterialId(e.target.value)}><option value="">Seleccionar material…</option>{materials.map(item => <option key={item.id} value={item.id}>{item.nombre} · {item.stock_actual} {item.unidad}</option>)}</select></label><label className={styles.field}><span>Destino</span><select value={placeId} onChange={e => setPlaceId(e.target.value)}><option value="">Ubicación general</option>{places.map(place => <option key={place.id} value={place.id}>{place.nombre}</option>)}</select></label><Field label={`Cantidad${selected ? ` (${selected.unidad})` : ""}`} value={quantity} onChange={setQuantity} type="number" />{selected && Number(quantity) > selected.stock_actual && <p className={styles.error}>Solo hay {selected.stock_actual} {selected.unidad} disponibles.</p>}</div><div className={styles.dialogFooter}><button className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton} disabled={!selected || Number(quantity) <= 0 || Number(quantity) > (selected?.stock_actual ?? 0) || saving} onClick={save}>{saving && <Loader2 size={14} className="animate-spin" />}Reservar</button></div></div></div>;
}
