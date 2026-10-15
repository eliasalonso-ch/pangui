"use client";

import { useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { inputStyle, focoInput, seccionDetalle } from "@/components/catalogo/PanelCatalogo";

/**
 * Personas de contacto de un proveedor (`proveedor_contactos`).
 *
 * En la ficha se guardan al tiro; en el formulario se guardan con el resto al
 * apretar Guardar, igual que los vínculos con activos y materiales.
 */

export interface Contacto {
  id?: string;
  nombre: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  anexo: string | null;
}

const queryKey = (proveedorId: string | null) => ["proveedor-contactos", proveedorId];

export function useContactos(proveedorId: string | null) {
  return useQuery({
    queryKey: queryKey(proveedorId),
    enabled: !!proveedorId,
    staleTime: 60_000,
    queryFn: async (): Promise<Contacto[]> => {
      const { data, error } = await createClient()
        .from("proveedor_contactos")
        .select("id,nombre,cargo,email,telefono,anexo")
        .eq("proveedor_id", proveedorId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Contacto[];
    },
  });
}

export interface ContactoResumen { id: string; proveedor_id: string; nombre: string; email: string | null }

/** Todos los contactos del workspace (RLS acota), para filtros y búsqueda. */
export function useTodosContactos() {
  return useQuery({
    queryKey: ["proveedor-contactos", "todos"],
    staleTime: 60_000,
    queryFn: async (): Promise<ContactoResumen[]> => {
      const { data, error } = await createClient()
        .from("proveedor_contactos")
        .select("id,proveedor_id,nombre,email")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as ContactoResumen[];
    },
  });
}

/** Escribe la diferencia con lo guardado y refresca. Lanza si algo falla. */
export async function guardarContactos(qc: QueryClient, proveedorId: string, lista: Contacto[]) {
  const sb = createClient();
  const antes = qc.getQueryData<Contacto[]>(queryKey(proveedorId)) ?? [];
  const campos = (c: Contacto) => ({
    nombre: c.nombre.trim(), cargo: limpio(c.cargo), email: limpio(c.email),
    telefono: limpio(c.telefono), anexo: limpio(c.anexo),
  });
  try {
    const quedan = new Set(lista.map(c => c.id).filter(Boolean));
    const borrar = antes.filter(c => c.id && !quedan.has(c.id)).map(c => c.id!);
    if (borrar.length) {
      const { error } = await sb.from("proveedor_contactos").delete().in("id", borrar);
      if (error) throw new Error(error.message);
    }
    for (const c of lista.filter(c => c.id)) {
      const previo = antes.find(a => a.id === c.id);
      if (previo && JSON.stringify(campos(previo)) === JSON.stringify(campos(c))) continue;
      const { error } = await sb.from("proveedor_contactos").update(campos(c)).eq("id", c.id!);
      if (error) throw new Error(error.message);
    }
    const nuevos = lista.filter(c => !c.id).map(c => ({ ...campos(c), proveedor_id: proveedorId }));
    if (nuevos.length) {
      const { error } = await sb.from("proveedor_contactos").insert(nuevos);
      if (error) throw new Error(error.message);
    }
  } finally {
    // Prefijo: refresca este proveedor y también la lista de todos (filtros).
    await qc.invalidateQueries({ queryKey: ["proveedor-contactos"] });
  }
}

function limpio(v: string | null) {
  const t = (v ?? "").trim();
  return t || null;
}

// ── Ficha ─────────────────────────────────────────────────────────────────────

/**
 * Contactos en la ficha. Si puede editar, cada cambio se guarda al tiro (como
 * en la ficha de MaintainX); si no, sólo se listan.
 * `legado`: el `proveedores.contacto` de texto, sólo si no hay contactos.
 */
export function ContactosLista({ proveedorId, legado, editable }: { proveedorId: string; legado: string | null; editable: boolean }) {
  const qc = useQueryClient();
  const { data: contactos = [], isLoading } = useContactos(proveedorId);
  if (isLoading) return null;
  const filas = contactos.length > 0 || !legado
    ? contactos
    : [{ nombre: legado, cargo: null, email: null, telefono: null, anexo: null }];

  return (
    <div style={seccionDetalle}>
      <p style={{ fontSize: 14, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>Contactos ({filas.length})</p>
      {editable ? (
        <ContactosEditor
          contactos={contactos}
          onChange={async lista => {
            try { await guardarContactos(qc, proveedorId, lista); }
            catch (e) { alert((e as Error).message); }
          }}
        />
      ) : filas.length === 0
        ? <p style={{ fontSize: 14, color: "var(--fg-4)", margin: 0 }}>Sin personas de contacto.</p>
        : <Tabla contactos={filas} />}
    </div>
  );
}

// ── Formulario ────────────────────────────────────────────────────────────────

export function ContactosEditor({ contactos, onChange }: {
  contactos: Contacto[];
  onChange: (c: Contacto[]) => void;
}) {
  // null = cerrado; -1 = nuevo; i = editando la fila i.
  const [editando, setEditando] = useState<number | null>(null);

  return (
    <div>
      {contactos.length > 0 && (
        <Tabla
          contactos={contactos}
          onEditar={i => setEditando(i)}
          onBorrar={i => onChange(contactos.filter((_, j) => j !== i))}
        />
      )}
      <button
        type="button"
        onClick={() => setEditando(-1)}
        style={{ display: "flex", alignItems: "center", gap: 6, marginTop: contactos.length ? 8 : 0, padding: "6px 0", background: "none", border: "none", color: "var(--brand)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
      >
        <Plus size={16} /> Nuevo contacto
      </button>

      {editando !== null && (
        <ContactoDialog
          inicial={editando >= 0 ? contactos[editando] : null}
          onCancel={() => setEditando(null)}
          onSave={c => {
            onChange(editando >= 0 ? contactos.map((x, j) => (j === editando ? { ...c, id: x.id } : x)) : [...contactos, c]);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function ContactoDialog({ inicial, onCancel, onSave }: {
  inicial: Contacto | null;
  onCancel: () => void;
  onSave: (c: Contacto) => void;
}) {
  const [c, setC] = useState<Contacto>(inicial ?? { nombre: "", cargo: null, email: null, telefono: null, anexo: null });
  const set = (k: keyof Contacto, v: string) => setC(prev => ({ ...prev, [k]: v }));
  const valido = c.nombre.trim().length > 0;
  const campo = (k: keyof Contacto, label: string, placeholder: string, type = "text") => (
    <label style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
      <span style={{ display: "block", marginBottom: 8 }}>{label}</span>
      <input type={type} value={(c[k] as string | null) ?? ""} onChange={e => set(k, e.target.value)} placeholder={placeholder} style={inputStyle} {...focoInput} />
    </label>
  );

  return (
    // El diálogo vive dentro del <form> del panel: sin esto, Enter en un campo
    // enviaría el proveedor entero en vez de agregar el contacto.
    <div role="dialog" aria-modal="true" aria-label={inicial ? "Editar contacto" : "Nuevo contacto"}
      onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); if (valido) onSave(c); }
        if (e.key === "Escape") onCancel();
      }}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.38)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "min(640px, 100%)", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-1)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
        <div style={{ height: 56, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)" }}>
          <strong style={{ fontSize: 16, fontWeight: 500, color: "var(--fg-1)" }}>{inicial ? "Editar contacto" : "Nuevo contacto"}</strong>
          <button type="button" onClick={onCancel} aria-label="Cerrar" style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--fg-3)" }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>
          <Iniciales nombre={c.nombre || "?"} size={72} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {campo("nombre", "Nombre completo", "Nombre")}
            {campo("cargo", "Cargo", "Ej: Jefe de ventas")}
            {campo("email", "Correo", "nombre@proveedor.cl", "email")}
            {campo("telefono", "Teléfono", "+56 9 1234 5678", "tel")}
            {campo("anexo", "Anexo", "Ej: 204")}
          </div>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onCancel} style={{ height: 40, padding: "0 18px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
          <button type="button" disabled={!valido} onClick={() => onSave(c)}
            style={{ height: 40, padding: "0 22px", borderRadius: 8, border: "none", background: valido ? "var(--brand)" : "var(--fg-3)", color: "var(--fg-on-brand)", fontSize: 14, cursor: valido ? "pointer" : "default", fontFamily: "inherit" }}>
            {inicial ? "Guardar" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────────

function Tabla({ contactos, onEditar, onBorrar }: {
  contactos: Contacto[];
  onEditar?: (i: number) => void;
  onBorrar?: (i: number) => void;
}) {
  const editable = !!onEditar;
  const columnas = `minmax(160px, 1.3fr) minmax(90px, 1fr) minmax(160px, 1.4fr) minmax(120px, 1fr)${editable ? " 64px" : ""}`;
  const celda: React.CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const link: React.CSSProperties = { ...celda, color: "var(--brand)", textDecoration: "none" };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", overflowX: "auto" }}>
      <div style={{ minWidth: 560 }}>
        <div style={{ display: "grid", gridTemplateColumns: columnas, gap: 12, padding: "10px 14px", fontSize: 14, color: "var(--fg-3)", borderBottom: "1px solid var(--border)" }}>
          <span>Nombre</span><span>Cargo</span><span>Correo</span><span>Teléfono</span>{editable && <span />}
        </div>
        {contactos.map((c, i) => (
          <div key={c.id ?? `nuevo-${i}`} style={{ display: "grid", gridTemplateColumns: columnas, gap: 12, alignItems: "center", padding: "10px 14px", fontSize: 14, color: "var(--fg-1)", borderTop: i ? "1px solid var(--divider)" : "none" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Iniciales nombre={c.nombre} size={26} />
              <span style={celda}>{c.nombre}</span>
            </span>
            <span style={celda}>{c.cargo ?? "—"}</span>
            {c.email ? <a href={`mailto:${c.email}`} style={link}>{c.email}</a> : <span style={celda}>—</span>}
            {c.telefono
              ? <a href={`tel:${c.telefono.replace(/\s/g, "")}`} style={link}>{c.telefono}{c.anexo ? ` anexo ${c.anexo}` : ""}</a>
              : <span style={celda}>—</span>}
            {editable && (
              <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => onEditar!(i)} aria-label={`Editar ${c.nombre}`} style={{ display: "flex", padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--fg-2)" }}><Pencil size={15} /></button>
                <button type="button" onClick={() => onBorrar!(i)} aria-label={`Quitar ${c.nombre}`} style={{ display: "flex", padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={15} /></button>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Color estable por nombre, de los tokens de la app (funcionan en tema oscuro).
const COLORES = ["var(--brand)", "var(--success)", "var(--warning)", "var(--danger)"];

function Iniciales({ nombre, size }: { nombre: string; size: number }) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const iniciales = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: COLORES[h % COLORES.length], color: "var(--fg-on-brand)",
      fontSize: Math.round(size * 0.4), fontWeight: 500,
    }}>
      {iniciales}
    </span>
  );
}
