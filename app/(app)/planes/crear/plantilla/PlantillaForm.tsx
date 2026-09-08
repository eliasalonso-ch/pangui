"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft, FileText, Tag, User, Clock, Flag, Loader2,
  Paperclip, Package, X, Plus, Search, ImagePlus, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { uploadToR2 } from "@/lib/r2";
import { FieldRow, SearchSelect, AssigneeSelect } from "@/components/ot/OTFormFields";
import ProcedimientosPicker, { type ProcedimientoSeleccionado } from "@/app/(app)/ordenes/ProcedimientosPicker";
import type { Usuario } from "@/types/ordenes";
import { usePlanDraft, type PlantillaOT } from "../PlanDraftContext";

/**
 * Plantilla de la OT del plan, en su propia pantalla.
 *
 * Es un paso aparte y no una sección del formulario porque son dos preguntas de
 * distinto tamaño: el plan define CUÁNDO se mantiene el activo (pocas
 * decisiones), y la plantilla define CÓMO se ve cada orden.
 *
 * No hay "ubicación" ni "tipo de trabajo":
 *   - la ubicación ya la aporta el activo, y repetirla invita a que se
 *     contradigan;
 *   - el tipo es siempre preventiva — un plan genera trabajo planificado por
 *     definición, y dejarlo variar corrompe los KPIs que separan preventivo de
 *     correctivo. La base lo fuerza con un CHECK.
 *
 * Los materiales son la pieza que habilita la orden de compra: se eligen del
 * catálogo (no texto libre) para poder compararlos contra el stock y saber qué
 * hay que comprar antes de la fecha.
 */

const PRIORIDADES = [
  { value: "ninguna", label: "Sin prioridad", activeColor: "var(--fg-3)" },
  { value: "baja",    label: "Baja",          activeColor: "var(--fg-3)" },
  { value: "media",   label: "Media",         activeColor: "var(--brand)" },
  { value: "alta",    label: "Alta",          activeColor: "var(--warning)" },
  { value: "urgente", label: "Urgente",       activeColor: "var(--danger)" },
];

/** Filas por consulta en los selectores de esta pantalla. */
const LISTA_PAGE_SIZE = 20;

type ParteOpt = {
  id: string;
  nombre: string;
  unidad: string | null;
  stock_actual: number | null;
  imagen_url: string | null;
};

export default function PlantillaForm() {
  const router = useRouter();
  const { draft, plantilla, setPlantilla } = usePlanDraft();

  // Copia local: lo escrito solo llega al borrador al guardar, así "cancelar"
  // descarta de verdad en vez de dejar cambios a medias aplicados.
  const [form, setForm] = useState<PlantillaOT>(plantilla);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; label: string }[]>([]);
  const [proveedores, setProveedores] = useState<{ id: string; label: string }[]>([]);
  const [partes, setPartes] = useState<ParteOpt[]>([]);
  const [wsId, setWsId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  // Los procedimientos se eligen con el mismo picker que las OTs, que trabaja
  // con objetos {id, nombre}. La plantilla solo guarda los ids.
  const [procs, setProcs] = useState<ProcedimientoSeleccionado[]>([]);

  const fileRef = useRef<HTMLInputElement | null>(null);

  function set<K extends keyof PlantillaOT>(k: K, v: PlantillaOT[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: auth } = await sb.auth.getUser();
      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id")
        .eq("id", auth?.user?.id ?? "")
        .maybeSingle();
      const ws = perfil?.workspace_id;
      if (!ws) { setCargando(false); return; }
      setWsId(ws);

      // Todas las listas se piden acotadas: ninguna carga el catálogo completo.
      // Los selectores con búsqueda (materiales) consultan al servidor a medida
      // que se escribe, así que la primera página es solo lo que se ve al abrir.
      const [usr, cat, prov, part, elegidas, proc] = await Promise.all([
        sb.from("usuarios").select("id, nombre, rol, deleted_at")
          .eq("workspace_id", ws).order("nombre").limit(LISTA_PAGE_SIZE),
        sb.from("categorias_ot").select("id, nombre").order("nombre").limit(LISTA_PAGE_SIZE),
        sb.from("proveedores").select("id, nombre")
          .eq("workspace_id", ws).order("nombre").limit(LISTA_PAGE_SIZE),
        sb.from("partes").select("id, nombre, unidad, stock_actual, imagen_url")
          .eq("workspace_id", ws).eq("activo", true).order("nombre").limit(LISTA_PAGE_SIZE),
        // Los materiales YA elegidos, pedidos por id: al editar un plan pueden
        // no estar en la primera página y sus filas se verían sin nombre.
        form.materiales.length
          ? sb.from("partes").select("id, nombre, unidad, stock_actual, imagen_url")
              .in("id", form.materiales.map(m => m.parte_id))
          : Promise.resolve({ data: [] as any[] }),
        // Los nombres de los procedimientos ya elegidos, para que el picker los
        // muestre al volver a editar en vez de sólo ids.
        form.procedimiento_ids.length
          ? sb.from("procedimientos").select("id, nombre").in("id", form.procedimiento_ids)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      setUsuarios(((usr.data ?? []) as Usuario[]).filter(u => !(u as any).deleted_at));
      setCategorias(((cat.data ?? []) as any[]).map(c => ({ id: c.id, label: c.nombre })));
      setProveedores(((prov.data ?? []) as any[]).map(p => ({ id: p.id, label: p.nombre })));
      // Las elegidas van primero y sin duplicar: son las que el usuario ya
      // tiene en la tabla y deben poder pintarse siempre.
      const base = (part.data ?? []) as ParteOpt[];
      const yaElegidas = ((elegidas as any).data ?? []) as ParteOpt[];
      const vistos = new Set(yaElegidas.map(p => p.id));
      setPartes([...yaElegidas, ...base.filter(p => !vistos.has(p.id))]);
      setProcs(((proc as any).data ?? []).map((p: any) => ({ id: p.id, nombre: p.nombre })));
      setCargando(false);
    }
    load();
    // Solo al montar: recargar al cambiar la selección reescribiría el picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subirArchivos(files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    try {
      const nuevos = await Promise.all(
        Array.from(files).map(async f => ({
          // r2-presign autoriza un set fijo de raices y "planes" no esta en
          // ellas (devuelve forbidden_folder). Los adjuntos del plan son del
          // activo que mantiene, asi que cuelgan de su carpeta.
          url: await uploadToR2(f, `activos/${draft.activoId ?? "sin-activo"}/planes`),
          nombre: f.name,
          tipo: f.type || null,
        })),
      );
      set("adjuntos", [...form.adjuntos, ...nuevos]);
    } catch (e: any) {
      alert(e?.message ?? "No se pudieron subir los archivos.");
    } finally {
      setSubiendo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function guardar() {
    setPlantilla({
      ...form,
      procedimiento_ids: procs.map(p => p.id),
      definida: true,
    });
    router.push("/planes/crear");
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* Encabezado: misma construcción que el formulario del plan
          (PlanCrearForm), para que pasar de una pantalla a la otra no cambie la
          barra bajo los pies. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "14px 20px", borderBottom: "1px solid var(--border)",
        background: "var(--surface-canvas)", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/planes/crear")}
          aria-label="Volver al plan"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 6, border: "none",
            background: "transparent", color: "var(--fg-3)", cursor: "pointer",
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <h1 style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)", margin: 0 }}>
          Plantilla de la orden de trabajo
        </h1>
      </div>

      {/* Cuerpo */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 20px 120px" }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {cargando ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 50 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : (
            <>
              <Tarjeta>
                <input
                  value={form.titulo}
                  onChange={e => set("titulo", e.target.value)}
                  placeholder={draft.nombre.trim() || "Título de la orden de trabajo"}
                  style={{
                    width: "100%", border: "none", borderBottom: "1px solid var(--border)",
                    background: "transparent", padding: "14px 2px 12px",
                    fontSize: 20, fontWeight: 400, color: "var(--fg-1)",
                    fontFamily: "inherit", outline: "none",
                  }}
                />
                <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "7px 0 0" }}>
                  Si lo dejas vacío, cada orden toma el nombre del plan.
                </p>

                <FieldRow icon={<FileText size={16} />} label="Descripción">
                  <textarea
                    value={form.descripcion}
                    onChange={e => set("descripcion", e.target.value)}
                    placeholder="Qué hay que hacer en cada mantención"
                    rows={3}
                    style={{
                      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
                      padding: "12px 14px", fontSize: 14, color: "var(--fg-1)",
                      background: "var(--surface-1)", fontFamily: "inherit",
                      outline: "none", resize: "vertical", lineHeight: 1.7, minHeight: 108,
                    }}
                  />
                </FieldRow>

                <FieldRow icon={<Tag size={16} />} label="Categoría">
                  <SearchSelect
                    placeholder="Sin categoría"
                    value={form.categoria_id}
                    options={categorias}
                    onChange={v => set("categoria_id", v)}
                  />
                </FieldRow>

                <FieldRow icon={<User size={16} />} label="Asignados">
                  <AssigneeSelect
                    usuarios={usuarios}
                    value={form.asignados_ids}
                    onChange={v => set("asignados_ids", v)}
                  />
                </FieldRow>

                <FieldRow icon={<Clock size={16} />} label="Tiempo estimado">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number" min={0} placeholder="0"
                      value={form.tiempo_h}
                      onChange={e => set("tiempo_h", e.target.value)}
                      style={inputChico}
                    />
                    <span style={{ fontSize: 14, color: "var(--fg-3)" }}>h</span>
                    <input
                      type="number" min={0} max={59} placeholder="0"
                      value={form.tiempo_m}
                      onChange={e => set("tiempo_m", e.target.value)}
                      style={inputChico}
                    />
                    <span style={{ fontSize: 14, color: "var(--fg-3)" }}>min</span>
                  </div>
                </FieldRow>

                <FieldRow icon={<Flag size={16} />} label="Prioridad">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {PRIORIDADES.map(o => {
                        const active = form.prioridad === o.value;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => set("prioridad", o.value)}
                            style={{
                              height: 32, padding: "0 14px",
                              border: active ? "none" : "1px solid var(--border)",
                              borderRadius: 6, fontSize: 14, fontWeight: 400,
                              background: active ? "var(--surface-hover)" : "var(--surface-1)",
                              color: active ? o.activeColor : "var(--fg-2)",
                              cursor: "pointer", transition: "all 0.1s", fontFamily: "inherit",
                            }}
                          >
                            {o.label}
                        </button>
                      );
                    })}
                  </div>
                </FieldRow>
              </Tarjeta>

              {/* ── Procedimientos ─────────────────────────────────────── */}
              {/* Sin encabezado propio: ProcedimientosPicker ya rotula su
                  sección, y repetirlo mostraba el título dos veces. */}
              <div style={{
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--surface-canvas)", padding: 18, marginBottom: 18,
              }}>
                <ProcedimientosPicker
                  workspaceId={wsId}
                  value={procs}
                  onChange={setProcs}
                />
              </div>

              {/* ── Materiales ─────────────────────────────────────────── */}
              <Seccion
                icono={<Package size={16} />}
                titulo="Materiales"
                descripcion="Insumos que consume cada mantención. Con esto se calcula qué hay que comprar antes de la fecha."
              >
                <MaterialesPicker
                  partes={partes}
                  wsId={wsId}
                  value={form.materiales}
                  onChange={v => set("materiales", v)}
                />

                <div style={{ marginTop: 18 }}>
                  <label style={{ display: "block", fontSize: 14, color: "var(--fg-3)", marginBottom: 6 }}>
                    Proveedor preferido
                  </label>
                  <div style={{ maxWidth: 380 }}>
                    <SearchSelect
                      placeholder="Sin proveedor definido"
                      value={form.proveedor_id}
                      options={proveedores}
                      onChange={v => set("proveedor_id", v)}
                    />
                  </div>
                  <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "7px 0 0" }}>
                    Opcional. Si no lo defines, se usa el proveedor de cada material.
                  </p>
                </div>
              </Seccion>

              {/* ── Adjuntos ───────────────────────────────────────────── */}
              <Seccion
                icono={<Paperclip size={16} />}
                titulo="Imágenes y archivos"
                descripcion="Planos, manuales o fotos de referencia que hereda cada orden."
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={e => subirArchivos(e.target.files)}
                  style={{ display: "none" }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={subiendo}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "9px 15px", borderRadius: 8,
                    border: "1px dashed var(--border-strong)", background: "var(--surface-1)",
                    color: "var(--brand)", fontSize: 14, fontWeight: 500,
                    fontFamily: "inherit", cursor: subiendo ? "default" : "pointer",
                  }}
                >
                  {subiendo
                    ? <Loader2 size={15} className="animate-spin" />
                    : <ImagePlus size={15} />}
                  {subiendo ? "Subiendo…" : "Agregar imágenes o archivos"}
                </button>

                {form.adjuntos.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
                    {form.adjuntos.map((a, i) => (
                      <div
                        key={a.url}
                        style={{
                          position: "relative", width: 92,
                          border: "1px solid var(--border)", borderRadius: 8,
                          overflow: "hidden", background: "var(--surface-1)",
                        }}
                      >
                        {a.tipo?.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt="" style={{ width: "100%", height: 68, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ height: 68, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-3)" }}>
                            <FileText size={22} />
                          </div>
                        )}
                        <div style={{
                          padding: "5px 6px", fontSize: 14, color: "var(--fg-3)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {a.nombre}
                        </div>
                        <button
                          type="button"
                          onClick={() => set("adjuntos", form.adjuntos.filter((_, j) => j !== i))}
                          aria-label={`Quitar ${a.nombre}`}
                          style={{
                            position: "absolute", top: 4, right: 4,
                            width: 22, height: 22, borderRadius: "50%",
                            border: "none", background: "rgba(15,23,42,0.65)", color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>
            </>
          )}
        </div>
      </div>

      {/* Pie */}
      <div style={{
        display: "flex", justifyContent: "flex-end", gap: 10,
        padding: "12px 20px", borderTop: "1px solid var(--border)",
        background: "var(--surface-canvas)", flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/planes/crear")}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)",
            background: "var(--surface-1)", color: "var(--fg-2)",
            fontSize: 14, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={guardar}
          style={{
            padding: "8px 18px", borderRadius: 8, border: "none",
            background: "var(--brand)", color: "var(--fg-on-brand)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Guardar plantilla
        </button>
      </div>
    </div>
  );
}

/* ── Materiales ────────────────────────────────────────────────────────── */

/**
 * Selector de insumos del catálogo, con cantidad por línea.
 *
 * Muestra el stock actual junto a cada material porque es la información que
 * decide la compra: sirve para notar de inmediato que se pide más de lo que hay.
 */
function MaterialesPicker({
  partes, wsId, value, onChange,
}: {
  /** Primera página del catálogo, para mostrar algo antes de escribir. */
  partes: ParteOpt[];
  wsId: string | null;
  value: { parte_id: string; cantidad: number }[];
  onChange: (v: { parte_id: string; cantidad: number }[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Resultados de la búsqueda; vacío significa "mostrar la primera página".
  const [encontrados, setEncontrados] = useState<ParteOpt[] | null>(null);
  const [buscando, setBuscando] = useState(false);

  /**
   * La búsqueda va al servidor: con el catálogo acotado a 20 filas, filtrar en
   * memoria no encontraría un material que esté fuera de esa primera página.
   * El debounce evita una request por tecla.
   */
  useEffect(() => {
    const q = query.trim();
    if (!q || !wsId) { setEncontrados(null); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const { data } = await createClient()
        .from("partes")
        .select("id, nombre, unidad, stock_actual, imagen_url")
        .eq("workspace_id", wsId)
        .eq("activo", true)
        .ilike("nombre", `%${q}%`)
        .order("nombre")
        .limit(LISTA_PAGE_SIZE);
      setEncontrados((data ?? []) as ParteOpt[]);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, wsId]);

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [abierto]);

  // Incluye lo encontrado por búsqueda: un material elegido desde los
  // resultados no está en la primera página y su fila quedaría sin nombre.
  const porId = useMemo(
    () => new Map([...partes, ...(encontrados ?? [])].map(p => [p.id, p])),
    [partes, encontrados],
  );

  const candidatos = useMemo(() => {
    const yaElegidos = new Set(value.map(v => v.parte_id));
    const fuente = encontrados ?? partes;
    return fuente.filter(p => !yaElegidos.has(p.id)).slice(0, 8);
  }, [partes, encontrados, value]);

  return (
    <div>
      {value.length > 0 && (
        <div style={{
          border: "1px solid var(--border)", borderRadius: 8,
          overflow: "hidden", marginBottom: 12,
        }}>
          {value.map((m, i) => {
            const parte = porId.get(m.parte_id);
            const insuficiente = parte?.stock_actual != null && parte.stock_actual < m.cantidad;
            return (
              <div
                key={m.parte_id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                {parte?.imagen_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={parte.imagen_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <span style={{
                    width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                    background: "var(--brand-tint)", color: "var(--brand)",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Package size={16} />
                  </span>
                )}

                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: "block", fontSize: 14, color: "var(--fg-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {parte?.nombre ?? "Material"}
                  </span>
                  <span style={{ fontSize: 14, color: insuficiente ? "var(--warning)" : "var(--fg-3)" }}>
                    {parte?.stock_actual != null
                      ? `Stock: ${parte.stock_actual} ${parte.unidad ?? ""}`
                      : "Sin stock registrado"}
                    {insuficiente && " — insuficiente"}
                  </span>
                </span>

                <input
                  type="number" min={0.01} step="any"
                  value={m.cantidad}
                  onChange={e => {
                    const n = Number(e.target.value);
                    onChange(value.map((x, j) => j === i ? { ...x, cantidad: n > 0 ? n : 1 } : x));
                  }}
                  style={{ ...inputChico, width: 80 }}
                />
                <span style={{ fontSize: 14, color: "var(--fg-3)", minWidth: 34 }}>
                  {parte?.unidad ?? ""}
                </span>

                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label="Quitar material"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: 6, border: "none",
                    background: "transparent", color: "var(--fg-4)", cursor: "pointer",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div ref={boxRef} style={{ position: "relative", maxWidth: 420 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          border: "1px solid var(--border)", borderRadius: 8,
          padding: "9px 12px", background: "var(--surface-1)",
        }}>
          <Search size={15} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setAbierto(true); }}
            onFocus={() => setAbierto(true)}
            placeholder="Buscar material del inventario…"
            style={{
              flex: 1, border: "none", background: "transparent", outline: "none",
              fontSize: 14, color: "var(--fg-1)", fontFamily: "inherit",
            }}
          />
        </div>

        {abierto && candidatos.length > 0 && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
            background: "var(--surface-1)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "var(--shadow-lg)", overflow: "hidden",
          }}>
            {candidatos.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange([...value, { parte_id: p.id, cantidad: 1 }]);
                  setQuery("");
                  setAbierto(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "9px 12px", border: "none", background: "transparent",
                  cursor: "pointer", fontSize: 14, color: "var(--fg-1)",
                  fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              >
                <Plus size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.nombre}
                </span>
                <span style={{ fontSize: 14, color: "var(--fg-3)", flexShrink: 0 }}>
                  {p.stock_actual ?? 0} {p.unidad ?? ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {partes.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "8px 0 0" }}>
            No hay materiales en el inventario todavía.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── piezas ────────────────────────────────────────────────────────────── */

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    // El marco se conserva, pero el relleno es el del lienzo: la tarjeta
    // delimita sin destacarse, y lo que resalta son los controles de adentro,
    // que sí van en --surface-1.
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      background: "var(--surface-canvas)", padding: "6px 18px 18px", marginBottom: 18,
    }}>
      {children}
    </div>
  );
}

function Seccion({
  icono, titulo, descripcion, children,
}: {
  icono: React.ReactNode;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8,
      background: "var(--surface-canvas)", padding: 18, marginBottom: 18,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <span style={{ color: "var(--brand)", display: "flex", paddingTop: 1 }}>{icono}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-1)" }}>{titulo}</div>
          <div style={{ fontSize: 14, color: "var(--fg-3)", marginTop: 2 }}>{descripcion}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

const inputChico = {
  width: 72, height: 36,
  border: "1px solid var(--border)", borderRadius: 6,
  padding: "0 10px", fontSize: 14, color: "var(--fg-1)",
  background: "var(--surface-1)", fontFamily: "inherit", outline: "none",
} as const;
