"use client";

/**
 * /usuarios/cuadrilla — pantalla dedicada para crear y editar cuadrillas.
 *
 * Reemplaza al panel lateral de 360px que vivía dentro de Equipo. Vale su
 * propia ruta por lo mismo que /usuarios/invitar: el formulario es largo (foto,
 * tipo, miembros) y en el panel lateral obligaba a hacer scroll dentro de una
 * columna angosta. Además se puede compartir por link y sobrevive a un F5.
 *
 * `?id=` la pone en modo edición; sin id, crea.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ChevronRight, Loader2, Check, AlertCircle, Camera, X,
  Users, Zap, Wrench, Settings2, HardHat, Sparkles, Wind, Cpu,
  Droplets, ShieldAlert, Flame, Paintbrush, Leaf, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { getAuthUser } from "@/lib/auth-user";
import { ROL_LABEL, esAdmin } from "@/lib/roles";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import AppLoadingState from "@/components/AppLoadingState";

const TIPOS_CUADRILLA = [
  { id: "electrica",       label: "Eléctrica",       icono: "Zap",        color: "#F59E0B" },
  { id: "mecanica",        label: "Mecánica",         icono: "Wrench",     color: "#3B82F6" },
  { id: "instrumentacion", label: "Instrumentación",  icono: "Settings2",  color: "#8B5CF6" },
  { id: "obra_civil",      label: "Obra civil",       icono: "HardHat",    color: "#F97316" },
  { id: "aseo",            label: "Aseo y ornato",    icono: "Sparkles",   color: "#22C55E" },
  { id: "climatizacion",   label: "Climatización",    icono: "Wind",       color: "#06B6D4" },
  { id: "automatizacion",  label: "Automatización",   icono: "Cpu",        color: "#14B8A6" },
  { id: "gasfiteria",      label: "Gasfitería",       icono: "Droplets",   color: "#60A5FA" },
  { id: "seguridad",       label: "Seguridad",        icono: "ShieldAlert",color: "#EF4444" },
  { id: "soldadura",       label: "Soldadura",        icono: "Flame",      color: "#F43F5E" },
  { id: "pintura",         label: "Pintura",          icono: "Paintbrush", color: "#EC4899" },
  { id: "paisajismo",      label: "Paisajismo",       icono: "Leaf",       color: "#16A34A" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Zap, Wrench, Settings2, HardHat, Sparkles, Wind, Cpu,
  Droplets, ShieldAlert, Flame, Paintbrush, Leaf, Users,
};

function DynamicIcon({ name, size = 16, ...props }: { name?: string; size?: number; [k: string]: unknown }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Users;
  return <Icon size={size} {...props} />;
}

interface UsuarioRow { id: string; nombre: string; rol: string; activo: boolean }

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-4)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

/**
 * Selector de miembros: fichas de los elegidos + desplegable buscable.
 *
 * La grilla de casillas que habia antes dibujaba a TODO el equipo de una: con
 * 60 personas era una pared de checkboxes y habia que buscar a ojo. Aca la
 * lista se filtra al escribir y se dibuja de a 20, pidiendo la siguiente tanda
 * cuando el centinela entra en pantalla.
 */
function MiembrosPicker({ usuarios, selected, myId, onToggle }: {
  usuarios: UsuarioRow[];
  selected: string[];
  myId: string | null;
  onToggle: (id: string) => void;
}) {
  const PAGINA = 20;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [paginado, setPaginado] = useState({ clave: "", n: 1 });
  const ref = useRef<HTMLDivElement>(null);
  const centinelaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtrados = usuarios.filter(u => !q || u.nombre.toLowerCase().includes(q));
  // La tanda se guarda junto a la clave del filtro y se descarta durante el
  // render al cambiar la busqueda: un useEffect con setState dispararia un
  // segundo render (y la regla `set-state-in-effect` lo rechaza).
  const clave = `${query}|${open}`;
  const n = paginado.clave === clave ? paginado.n : 1;
  const mostrados = filtrados.slice(0, PAGINA * n);
  const hayMas = filtrados.length > mostrados.length;

  useEffect(() => {
    const node = centinelaRef.current;
    if (!node || !hayMas || !open) return;
    const obs = new IntersectionObserver(
      es => {
        if (es[0]?.isIntersecting) {
          setPaginado(p => ({ clave, n: (p.clave === clave ? p.n : 1) + 1 }));
        }
      },
      { root: node.parentElement, rootMargin: "80px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hayMas, open, clave]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4,
          minHeight: 40, padding: "4px 8px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`,
          borderRadius: 8, background: "var(--surface-1)", cursor: "text",
        }}
      >
        {selected.map(id => {
          const u = usuarios.find(x => x.id === id);
          return (
            <span
              key={id}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 240,
                padding: "2px 4px 2px 7px", borderRadius: 4,
                background: "var(--brand-tint)", color: "var(--brand)", fontSize: 14,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {u?.nombre ?? "Miembro"}
              </span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggle(id); }}
                aria-label={`Quitar ${u?.nombre ?? "miembro"}`}
                style={{ display: "flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.7 }}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length ? "" : "Buscar personas…"}
          style={{ flex: 1, minWidth: 120, fontSize: 14, border: "none", outline: "none", background: "transparent", color: "var(--fg-1)", fontFamily: "inherit", height: 30 }}
        />
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ maxHeight: 280, overflowY: "auto", padding: "2px 0 6px" }}>
            {mostrados.map(u => {
              const activo = selected.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  role="checkbox"
                  aria-checked={activo}
                  onClick={() => onToggle(u.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%", minWidth: 0,
                    padding: "8px 12px", background: activo ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { if (!activo) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!activo) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: activo ? "var(--brand)" : "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {u.nombre}{u.id === myId ? " (tú)" : ""}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--fg-4)", flexShrink: 0 }}>
                    {(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                      border: activo ? "none" : "1.5px solid var(--border-strong, var(--border))",
                      background: activo ? "var(--brand)" : "var(--surface-0)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {activo && <Check size={11} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
                  </span>
                </button>
              );
            })}
            {hayMas && <div ref={centinelaRef} style={{ height: 1 }} />}
            {filtrados.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-4)" }}>
                {usuarios.length === 0 ? "No hay miembros en el equipo todavía." : "Sin resultados"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CuadrillaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [wsId, setWsId] = useState<string | null>(null);
  const [myRol, setMyRol] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargando, setCargando] = useState(true);

  // El id se lee en un efecto y no en el useState inicial: el servidor no ve el
  // query param, y sembrarlo rompía la hidratación (ver useDeepLinkId).
  const [editId, setEditId] = useState<string | null>(null);

  const [form, setForm] = useState({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });
  const [miembros, setMiembros] = useState<string[]>([]);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  useEffect(() => {
    (async () => {
      const user = await getAuthUser();
      if (!user) { router.replace("/login"); return; }
      setMyId(user.id);

      const sb = createClient();
      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setCargando(false); return; }
      setWsId(perfil.workspace_id);
      setMyRol(perfil.rol);

      const { data: u } = await sb.from("usuarios")
        .select("id,nombre,rol,activo")
        .eq("workspace_id", perfil.workspace_id)
        .is("deleted_at", null)
        .order("nombre");
      setUsuarios((u ?? []) as UsuarioRow[]);

      const id = searchParams.get("id");
      if (id) {
        setEditId(id);
        const { data: c } = await sb.from("cuadrillas").select("*").eq("id", id).maybeSingle();
        if (c) {
          setForm({
            nombre: c.nombre ?? "",
            descripcion: c.descripcion ?? "",
            tipo: c.tipo ?? "",
            icono: c.icono ?? "",
            color: c.color ?? "",
          });
          setImagenUrl(c.imagen_url ?? null);
        }
        const { data: m } = await sb.from("cuadrilla_usuarios")
          .select("usuario_id").eq("cuadrilla_id", id);
        setMiembros((m ?? []).map(x => x.usuario_id));
      }
      setCargando(false);
    })();
    // Solo al montar: el id de la URL no cambia sin recargar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function subirFoto(file: File) {
    setSubiendo(true);
    try {
      const url = await uploadToR2(file, "cuadrillas");
      setImagenUrl(url);
    } catch {
      setError("No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitarFoto() {
    if (imagenUrl) await deleteFromR2(imagenUrl).catch(() => {});
    setImagenUrl(null);
  }

  async function guardar() {
    setError(null);
    if (!form.nombre.trim()) { setError("Ingresa el nombre de la cuadrilla."); return; }
    if (!form.tipo) { setError("Selecciona un tipo."); return; }
    if (!wsId) return;

    setGuardando(true);
    const sb = createClient();
    const payload = {
      workspace_id: wsId,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || null,
      tipo: form.tipo,
      icono: form.icono,
      color: form.color,
      imagen_url: imagenUrl,
    };

    try {
      let id = editId;
      if (id) {
        const { error: e } = await sb.from("cuadrillas").update(payload).eq("id", id);
        if (e) throw new Error(e.message);
        // Los miembros se reescriben enteros: es una lista corta y el diff no
        // compensa la complejidad.
        await sb.from("cuadrilla_usuarios").delete().eq("cuadrilla_id", id);
      } else {
        const { data, error: e } = await sb.from("cuadrillas").insert(payload).select("id").maybeSingle();
        if (e || !data) throw new Error(e?.message ?? "No se pudo crear la cuadrilla.");
        id = data.id;
      }
      if (miembros.length > 0) {
        const { error: e2 } = await sb.from("cuadrilla_usuarios").insert(
          miembros.map(uid => ({ cuadrilla_id: id, usuario_id: uid })),
        );
        if (e2) throw new Error(e2.message);
      }
      router.push("/usuarios?tab=cuadrillas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!editId) return;
    setBorrando(true);
    const sb = createClient();
    // Baja logica, como el resto de los catalogos: las ubicaciones y activos
    // que la referencian quedan con la FK en null (ON DELETE SET NULL).
    await sb.from("cuadrillas").update({ activo: false }).eq("id", editId);
    router.push("/usuarios?tab=cuadrillas");
  }

  if (cargando) return <AppLoadingState label="Cargando…" minHeight="60dvh" />;

  const puedeEditar = esAdmin(myRol) || myRol === "jefe";
  if (!puedeEditar) {
    return (
      <div style={{ padding: 24, fontSize: 14, color: "var(--fg-3)" }}>
        No tienes permisos para gestionar cuadrillas.
      </div>
    );
  }

  return (
    <div style={{ background: "var(--surface-canvas)", minHeight: "100%" }}>
      <div style={{ padding: "28px 24px 64px", maxWidth: 1100, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--fg-3)", marginBottom: 14 }}>
          <Link href="/usuarios?tab=cuadrillas" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", textDecoration: "none" }}>
            <ArrowLeft size={14} /> Equipo
          </Link>
          <ChevronRight size={13} style={{ color: "var(--fg-4)" }} />
          <span style={{ color: "var(--fg-1)", fontWeight: 400 }}>
            {editId ? "Editar cuadrilla" : "Nueva cuadrilla"}
          </span>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          {editId ? "Editar cuadrilla" : "Nueva cuadrilla"}
        </h1>
        <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "0 0 22px" }}>
          Una cuadrilla agrupa a quienes hacen un mismo oficio. Se asigna a activos y
          ubicaciones, y sirve para asignar una OT al grupo entero de una vez.
        </p>

        {/* Tarjeta del formulario */}
        {/* La tarjeta va en el crema del lienzo y NO en blanco: asi el blanco
            queda reservado para los campos, que es lo que se puede escribir.
            Con la tarjeta blanca los inputs desaparecian dentro de ella. */}
        <div style={{
          background: "var(--surface-canvas)", border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)", padding: 20,
        }}>
          {/* Nombre */}
          <div>
            <label style={labelStyle}>Nombre</label>
            <input
              style={inputStyle}
              placeholder="Ej. Cuadrilla Eléctrica"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Descripción */}
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Descripción</label>
            <textarea
              placeholder="¿De qué se encarga esta cuadrilla?"
              value={form.descripcion}
              onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
              style={{
                width: "100%", fontSize: 14, color: "var(--fg-1)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: "12px 14px", outline: "none", resize: "vertical",
                fontFamily: "inherit", background: "var(--surface-1)", lineHeight: 1.7,
                minHeight: 80, boxSizing: "border-box",
              }}
            />
          </div>

          {/* Foto */}
          <div style={{ marginTop: 16 }}>
            <label style={labelStyle}>Foto</label>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); e.target.value = ""; }}
            />
            {imagenUrl ? (
              <div style={{ position: "relative", width: 104, height: 104, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagenUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button
                  type="button"
                  onClick={quitarFoto}
                  title="Quitar imagen"
                  aria-label="Quitar imagen"
                  style={{
                    position: "absolute", top: 4, right: 4, width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", borderRadius: "var(--r-sm)",
                    background: "rgba(0,0,0,0.55)", color: "#fff", cursor: "pointer", padding: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={subiendo}
                onDragOver={e => { e.preventDefault(); if (!subiendo) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  if (subiendo) return;
                  const f = Array.from(e.dataTransfer.files).find(x => x.type.startsWith("image/"));
                  if (f) subirFoto(f);
                }}
                style={{
                  width: "100%", minHeight: 96,
                  border: `1px dashed ${dragOver ? "var(--brand)" : "var(--border-strong)"}`,
                  borderRadius: "var(--r-md)",
                  // Crema y no blanco: la zona de arrastre no es un campo que se
                  // escriba, asi que no compite con los inputs.
                  background: dragOver ? "var(--brand-tint)" : "var(--surface-canvas)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 7, color: "var(--fg-3)", fontSize: 14, fontFamily: "inherit",
                  cursor: subiendo ? "default" : "pointer", padding: 12,
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {subiendo
                  ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--brand)" }} />
                  : <Camera size={16} style={{ color: "var(--brand)" }} />}
                <span style={{ textAlign: "center", lineHeight: 1.35 }}>
                  {subiendo ? "Subiendo…" : "Agregue o arrastre una foto"}
                </span>
              </button>
            )}
          </div>

          {/* Tipo */}
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>Tipo</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
              {TIPOS_CUADRILLA.map(t => {
                const sel = form.tipo === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tipo: t.id, icono: t.icono, color: t.color }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      minHeight: 40, padding: "8px 12px", borderRadius: 8,
                      border: sel ? `1.5px solid ${t.color}` : "1px solid var(--border)",
                      background: sel ? "var(--surface-hover)" : "var(--surface-1)",
                      cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <DynamicIcon name={t.icono} size={15} style={{ color: t.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, color: sel ? t.color : "var(--fg-2)" }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Miembros */}
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>
              Miembros {miembros.length > 0 && <span style={{ color: "var(--fg-3)" }}>({miembros.length})</span>}
            </label>
            <MiembrosPicker
              usuarios={usuarios.filter(u => u.activo !== false)}
              selected={miembros}
              myId={myId}
              onToggle={id => setMiembros(prev =>
                prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
              )}
            />
          </div>
        </div>

        {error && (
          <p style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--danger)", margin: "16px 0 0" }}>
            <AlertCircle size={14} /> {error}
          </p>
        )}

        {/* Acciones */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || subiendo}
            style={{
              height: 38, padding: "0 18px",
              display: "inline-flex", alignItems: "center", gap: 8,
              border: "none", borderRadius: 8,
              background: "var(--brand)", color: "var(--fg-on-brand)",
              fontSize: 14, fontWeight: 400, fontFamily: "inherit",
              cursor: guardando ? "not-allowed" : "pointer",
              opacity: guardando ? 0.7 : 1,
            }}
          >
            {guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            {guardando ? "Guardando…" : editId ? "Guardar cambios" : "Crear cuadrilla"}
          </button>

          <button
            type="button"
            onClick={() => router.push("/usuarios?tab=cuadrillas")}
            style={{
              height: 38, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--fg-2)",
              fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer",
            }}
          >
            Cancelar
          </button>

          {editId && esAdmin(myRol) && (
            <button
              type="button"
              onClick={eliminar}
              disabled={borrando}
              style={{
                marginLeft: "auto",
                height: 38, padding: "0 16px",
                display: "inline-flex", alignItems: "center", gap: 7,
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--surface-1)", color: "var(--danger)",
                fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer",
              }}
            >
              {borrando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
