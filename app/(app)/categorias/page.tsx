"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Plus, Search, X, Loader2, Tag, Pencil, Trash2, Inbox,
} from "lucide-react";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";
import {
  listCategorias, createCategoria, guardarCategoria, archivarCategoria,
  contarOrdenesDeCategoria, esGlobal, type CategoriaConUso,
} from "@/lib/categorias-api";
import HistorialOT from "@/components/catalogo/HistorialOT";
import CategoriaForm from "@/components/catalogo/CategoriaForm";
import AccionesCatalogo from "@/components/catalogo/AccionesCatalogo";

// Master–detail igual que Procedimientos y Órdenes: buscador y acción principal
// arriba, lista de tarjetas a la izquierda, ficha a la derecha.

export default function CategoriasPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [items, setItems] = useState<CategoriaConUso[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "crear" | "editar">("ver");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ cat: CategoriaConUso; enUso: number } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!active || !data?.workspace_id) return;
      setWorkspaceId(data.workspace_id);
      setRol(data.rol);
      try {
        setItems(await listCategorias(data.workspace_id));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const isAdmin = rol === "admin" || rol === "owner";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(c => c.nombre.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const selected = items.find(c => c.id === selectedId) ?? null;

  async function handleCreate(v: { nombre: string; icono: string; color: string }) {
    if (!workspaceId) return;
    setGuardando(true);
    setError(null);
    try {
      const nueva = await createCategoria(workspaceId, v.nombre, v.color, v.icono);
      setItems(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setSelectedId(nueva.id);
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function handleUpdate(v: { nombre: string; icono: string; color: string }) {
    if (!selected || !workspaceId) return;
    setGuardando(true);
    setError(null);
    try {
      // Editar una categoría por defecto no la modifica en el lugar: crea una
      // copia de este workspace y reapunta las OTs. Ver `guardarCategoria`.
      const { categoria, reemplazaId } = await guardarCategoria(workspaceId, selected, v);
      setItems(prev => prev
        .filter(c => c.id !== reemplazaId && c.id !== categoria.id)
        .concat(categoria)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setSelectedId(categoria.id);
      setModo("ver");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // Se cuenta el uso ANTES de ofrecer borrar: borrar una categoría en uso deja
  // las OTs sin categoría, así que el aviso tiene que decir cuántas.
  async function pedirBorrar(cat: CategoriaConUso) {
    if (!workspaceId) return;
    try {
      const enUso = await contarOrdenesDeCategoria(workspaceId, cat.id);
      setConfirmDelete({ cat, enUso });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete || !workspaceId) return;
    const { cat } = confirmDelete;
    setGuardando(true);
    try {
      // Se archiva, no se borra: las OTs que la usan la conservan.
      await archivarCategoria(workspaceId, cat);
      setItems(prev => prev.filter(c => c.id !== cat.id));
      if (selectedId === cat.id) setSelectedId(null);
      setConfirmDelete(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Toolbar */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", justifyContent: "flex-end" }}>
          <div style={{ position: "relative", width: 320 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="Buscar categorías…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", height: 36, paddingLeft: 32, paddingRight: search ? 32 : 12,
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: 14,
                background: "var(--surface-1)", outline: "none", fontFamily: "inherit", color: "var(--fg-1)",
                boxSizing: "border-box",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--shadow-focus)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Limpiar búsqueda"
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 2 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {isAdmin && (
            <button
              onClick={() => { setModo("crear"); setSelectedId(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px",
                background: "var(--brand)", border: "none", borderRadius: "var(--r-md)", cursor: "pointer",
                fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)", fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={14} />
              Nueva categoría
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          flexShrink: 0, padding: "8px 16px", fontSize: 14,
          background: "var(--danger-bg)", color: "var(--danger)",
          borderBottom: "1px solid var(--border)",
        }}>
          {error}
        </div>
      )}

      {/* Master–detail */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

        {/* Lista */}
        <div style={{
          width: 380, flexShrink: 0, borderRight: "1px solid var(--border)",
          overflowY: "auto", background: "var(--surface-canvas)",
          display: "flex", flexDirection: "column", gap: 8, padding: "8px 10px",
        }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              height: 240, color: "var(--fg-4)", gap: 8, padding: 24, textAlign: "center",
            }}>
              <Tag size={32} />
              <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>
                {search ? "Sin resultados" : "No hay categorías aún"}
              </div>
              {!search && isAdmin && (
                <div style={{ fontSize: 14 }}>Crea la primera con el botón de arriba</div>
              )}
            </div>
          ) : (
            filtered.map(cat => (
              <CategoriaRow
                key={cat.id}
                cat={cat}
                selected={selectedId === cat.id}
                puedeEditar={isAdmin}
                puedeBorrar={isAdmin}
                onSelect={() => { setSelectedId(cat.id); setModo("ver"); }}
                onEdit={() => { setSelectedId(cat.id); setModo("editar"); }}
                onDelete={() => pedirBorrar(cat)}
              />
            ))
          )}
        </div>

        {/* Detalle */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {modo === "crear" ? (
            <CategoriaForm
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleCreate}
            />
          ) : modo === "editar" && selected ? (
            <CategoriaForm
              key={selected.id}
              inicial={{ nombre: selected.nombre, icono: selected.icono, color: selected.color }}
              guardando={guardando}
              error={error}
              onCancel={() => { setModo("ver"); setError(null); }}
              onSubmit={handleUpdate}
            />
          ) : selected ? (
            <CategoriaDetalle
              cat={selected}
              puedeEditar={isAdmin}
              puedeBorrar={isAdmin}
              workspaceId={workspaceId}
              onEdit={() => setModo("editar")}
              onDelete={() => pedirBorrar(selected)}
              onNuevaOT={() => router.push(`/ordenes/crear?categoria=${selected.id}`)}
            />
          ) : (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)",
            }}>
              <Tag size={40} style={{ opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>Selecciona una categoría</div>
              <div style={{ fontSize: 14 }}>El detalle aparecerá aquí</div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmación de borrado */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", marginBottom: 8 }}>Eliminar categoría</div>
            <div style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 20 }}>
              <strong>{confirmDelete.cat.nombre}</strong> dejará de estar disponible al crear o editar órdenes.{" "}
              {confirmDelete.enUso > 0
                ? `${confirmDelete.enUso === 1 ? "La orden que la usa la conservará" : `Las ${confirmDelete.enUso} órdenes que la usan la conservarán`}.`
                : "Ninguna orden la está usando."}
              {esGlobal(confirmDelete.cat) && " Solo se oculta en tu espacio de trabajo; los demás la siguen viendo."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", color: "var(--fg-2)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={guardando}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 8, background: "var(--danger)", color: "var(--fg-on-brand)", fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
              >
                {guardando && <Loader2 size={12} className="animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriaRow({ cat, selected, puedeEditar, puedeBorrar, onSelect, onEdit, onDelete }: {
  cat: CategoriaConUso;
  selected: boolean;
  puedeEditar: boolean;
  puedeBorrar: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", cursor: "pointer", flexShrink: 0,
        background: selected ? "var(--brand-tint)" : "var(--surface-1)",
        border: `1px solid ${selected ? "var(--brand)" : hover ? "var(--border-strong)" : "var(--border)"}`,
        borderRadius: "var(--r-lg)",
        transition: "border-color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)",
      }}
    >
      <div style={{
        width: 32, height: 32, flexShrink: 0, borderRadius: "var(--r-md)",
        background: (cat.color ?? "#9CA3AF") + "22",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <CategoriaIcon icono={cat.icono} size={16} color={cat.color ?? undefined} />
      </div>
      <div style={{
        flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {cat.nombre}
      </div>
      {hover && (puedeEditar || puedeBorrar) && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {puedeEditar && (
            <button
              onClick={onEdit}
              aria-label="Editar"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
            >
              <Pencil size={12} />
            </button>
          )}
          {puedeBorrar && (
            <button
              onClick={onDelete}
              aria-label="Eliminar"
              style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CategoriaDetalle({ cat, puedeEditar, puedeBorrar, workspaceId, onEdit, onDelete, onNuevaOT }: {
  cat: CategoriaConUso;
  puedeEditar: boolean;
  puedeBorrar: boolean;
  workspaceId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onNuevaOT: () => void;
}) {
  // El padding superior calza con el de la lista (8px) para que la tarjeta del
  // detalle arranque a la misma altura que la primera de la izquierda.
  return (
    <div style={{ padding: "8px 20px 20px" }}>
      {/* `overflow: visible` para que el pie pegajoso no quede recortado por la
          tarjeta; el redondeado se conserva en el pie con su propio radio. */}
      <div style={{
        background: "var(--surface-1)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}>
        {/* Encabezado. `minHeight` fija el alto de la fila para que el ícono de
            32px y los botones de 36px queden centrados sobre la misma línea. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          minHeight: 64, padding: "12px 18px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0, borderRadius: "var(--r-md)",
            background: (cat.color ?? "#9CA3AF") + "22",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CategoriaIcon icono={cat.icono} size={18} color={cat.color ?? undefined} />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
            {cat.nombre}
          </div>
          <AccionesCatalogo
            puedeEditar={puedeEditar}
            puedeEliminar={puedeBorrar}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>

        {/* Metadatos */}
        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontSize: 14, color: "var(--fg-3)" }}>
          Creada el {new Date(cat.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })}
          {esGlobal(cat) && " · Categoría por defecto (al editarla se creará una copia para tu espacio)"}
        </div>

        {/* Historial */}
        <div style={{ padding: 18 }}>
          <HistorialOT
            workspaceId={workspaceId}
            target={{ tipo: "categoria", categoriaId: cat.id }}
          />
        </div>

        {/* CTA fija al pie: queda a mano por larga que sea la lista. */}
        <div style={{
          position: "sticky", bottom: 0, zIndex: 10,
          padding: "14px 18px", borderTop: "1px solid var(--border)",
          background: "var(--surface-1)", display: "flex", justifyContent: "center",
          borderRadius: "0 0 var(--r-lg) var(--r-lg)",
        }}>
          <button
            onClick={onNuevaOT}
            style={{
              display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 16px",
              border: "1px solid var(--brand)", borderRadius: "var(--r-md)",
              background: "var(--surface-1)", cursor: "pointer",
              fontSize: 14, fontWeight: 400, color: "var(--brand)", fontFamily: "inherit",
            }}
          >
            <Inbox size={14} />
            Utilizar en una nueva orden de trabajo
          </button>
        </div>
      </div>
    </div>
  );
}
