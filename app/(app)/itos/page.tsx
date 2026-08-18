"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Plus, Search, X, Loader2, Zap, Trash2, Inbox, Pencil,
} from "lucide-react";
import {
  listHitos, createHito, archivarHito, contarOrdenesDeIto, listItosSinCatalogo,
  renameHito, type Hito,
} from "@/lib/hitos-api";
import AccionesCatalogo from "@/components/catalogo/AccionesCatalogo";
import { tieneItos } from "@/lib/itos-gate";
import HistorialOT from "@/components/catalogo/HistorialOT";
import ItoForm from "@/components/catalogo/ItoForm";

// Misma estructura que /categorias: buscador arriba, tarjetas a la izquierda,
// ficha con historial a la derecha.
//
// Diferencia de modelo: las OTs NO apuntan a `hitos.id`, guardan el nombre del
// ITO como texto en `ordenes_trabajo.hito`. Por eso el historial se resuelve por
// nombre y no hay opción de renombrar: cambiar el nombre acá dejaría huérfanas
// las OTs que lo mencionan.

export default function ItosPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [items, setItems] = useState<Hito[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<Hito | null>(null);
  const [otsDelEditado, setOtsDelEditado] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ hito: Hito; enUso: number } | null>(null);
  const [sinCatalogo, setSinCatalogo] = useState<{ nombre: string; ots: number }[]>([]);

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
      setListo(true);
      if (!tieneItos(data.workspace_id)) { setLoading(false); return; }
      try {
        const catalogo = await listHitos(data.workspace_id);
        if (!active) return;
        setItems(catalogo);
        // Variantes de texto que no están en el catálogo (tildes, nombre
        // completo). Se avisan para que nadie las dé por perdidas.
        const sueltos = await listItosSinCatalogo(data.workspace_id, catalogo);
        if (active) setSinCatalogo(sueltos);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  const isAdmin = rol === "admin" || rol === "owner";
  const habilitado = tieneItos(workspaceId);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter(h => h.nombre.toLowerCase().includes(q)) : items;
  }, [items, search]);

  const selected = items.find(h => h.id === selectedId) ?? null;

  async function handleCreate(nombre: string) {
    if (!workspaceId || !nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const nuevo = await createHito(workspaceId, nombre);
      setItems(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setSelectedId(nuevo.id);
      setCreando(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // Se cuenta antes de abrir el panel para poder avisar cuántas OTs se
  // reescribirán si cambia el nombre.
  async function pedirEditar(hito: Hito) {
    if (!workspaceId) return;
    setEditando(hito);
    setCreando(false);
    setOtsDelEditado(0);
    try {
      setOtsDelEditado(await contarOrdenesDeIto(workspaceId, hito.nombre));
    } catch { /* el aviso es informativo: si falla, el panel igual sirve */ }
  }

  async function handleRename(nombre: string) {
    if (!workspaceId || !editando) return;
    setGuardando(true);
    setError(null);
    try {
      const { hito } = await renameHito(workspaceId, editando, nombre);
      setItems(prev => prev
        .map(h => (h.id === hito.id ? hito : h))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setSelectedId(hito.id);
      setEditando(null);
      // El renombre puede haber dejado (o resuelto) variantes sueltas.
      const catalogo = await listHitos(workspaceId);
      setItems(catalogo);
      setSinCatalogo(await listItosSinCatalogo(workspaceId, catalogo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function pedirBorrar(hito: Hito) {
    if (!workspaceId) return;
    try {
      const enUso = await contarOrdenesDeIto(workspaceId, hito.nombre);
      setConfirmDelete({ hito, enUso });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setGuardando(true);
    try {
      // Se archiva, no se borra: las OTs conservan el texto del ITO.
      await archivarHito(confirmDelete.hito.id);
      setItems(prev => prev.filter(h => h.id !== confirmDelete.hito.id));
      if (selectedId === confirmDelete.hito.id) setSelectedId(null);
      setConfirmDelete(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  // Espacio de trabajo sin ITOs: se avisa en vez de mostrar una lista vacía que
  // parecería un error.
  if (listo && !habilitado) {
    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 10,
        color: "var(--fg-4)", background: "var(--surface-canvas)",
      }}>
        <Zap size={40} style={{ opacity: 0.5 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-3)" }}>ITOs no está disponible</div>
        <div style={{ fontSize: 12.5 }}>Esta sección no está habilitada para tu espacio de trabajo</div>
      </div>
    );
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
              placeholder="Buscar ITOs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", height: 36, paddingLeft: 32, paddingRight: search ? 32 : 12,
                border: "1px solid var(--border)", borderRadius: "var(--r-md)", fontSize: 13,
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
              onClick={() => { setCreando(true); setSelectedId(null); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                height: 36, padding: "0 14px",
                background: "var(--brand)", border: "none", borderRadius: "var(--r-md)", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "var(--fg-on-brand)", fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              <Plus size={14} />
              Nuevo ITO
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          flexShrink: 0, padding: "8px 16px", fontSize: 12.5,
          background: "var(--danger-bg)", color: "var(--danger)",
          borderBottom: "1px solid var(--border)",
        }}>
          {error}
        </div>
      )}

      {/* Master–detail */}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>

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
              <Zap size={32} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg-3)" }}>
                {search ? "Sin resultados" : "No hay ITOs aún"}
              </div>
              {!search && isAdmin && (
                <div style={{ fontSize: 12.5 }}>Crea el primero con el botón de arriba</div>
              )}
            </div>
          ) : (
            filtered.map(hito => (
              <ItoRow
                key={hito.id}
                hito={hito}
                selected={selectedId === hito.id}
                isAdmin={isAdmin}
                onSelect={() => { setSelectedId(hito.id); setCreando(false); setEditando(null); }}
                onEdit={() => pedirEditar(hito)}
                onDelete={() => pedirBorrar(hito)}
              />
            ))
          )}

          {/* Textos de ITO usados en OTs que no están en el catálogo. Su
              historial no aparece en ninguna ficha, así que se avisan acá en
              vez de dejarlos invisibles. */}
          {!loading && sinCatalogo.length > 0 && (
            <div style={{
              marginTop: 4, padding: "10px 12px",
              border: "1px dashed var(--border-strong)", borderRadius: "var(--r-lg)",
              background: "var(--surface-1)",
            }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fg-3)", marginBottom: 6 }}>
                Sin catálogo
              </div>
              {sinCatalogo.map(s => (
                <div key={s.nombre} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  padding: "3px 0", fontSize: 12, color: "var(--fg-2)",
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.nombre}
                  </span>
                  <span style={{ color: "var(--fg-4)", flexShrink: 0 }}>
                    {s.ots} {s.ots === 1 ? "OT" : "OTs"}
                  </span>
                </div>
              ))}
              <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 6, lineHeight: 1.5 }}>
                Escrituras usadas en OTs que no existen en el catálogo. Créalas para ver su historial.
              </div>
            </div>
          )}
        </div>

        {/* Detalle */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          {creando ? (
            <ItoForm
              guardando={guardando}
              error={error}
              onCancel={() => { setCreando(false); setError(null); }}
              onSubmit={handleCreate}
            />
          ) : editando ? (
            <ItoForm
              key={editando.id}
              inicial={{ nombre: editando.nombre }}
              ordenesVinculadas={otsDelEditado}
              guardando={guardando}
              error={error}
              onCancel={() => { setEditando(null); setError(null); }}
              onSubmit={handleRename}
            />
          ) : selected ? (
            <ItoDetalle
              hito={selected}
              isAdmin={isAdmin}
              workspaceId={workspaceId}
              onEdit={() => pedirEditar(selected)}
              onDelete={() => pedirBorrar(selected)}
              onNuevaOT={() => router.push(`/ordenes/crear?hito=${encodeURIComponent(selected.nombre)}`)}
            />
          ) : (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 10, color: "var(--fg-4)",
            }}>
              <Zap size={40} style={{ opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-3)" }}>Selecciona un ITO</div>
              <div style={{ fontSize: 12.5 }}>El detalle aparecerá aquí</div>
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--surface-1)", borderRadius: 12, padding: 24, maxWidth: 400, width: "90%", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-1)", marginBottom: 8 }}>Eliminar ITO</div>
            <div style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 20 }}>
              <strong>{confirmDelete.hito.nombre}</strong> dejará de estar disponible al crear o editar órdenes.{" "}
              {confirmDelete.enUso > 0
                ? `${confirmDelete.enUso === 1 ? "La orden que lo usa lo conservará" : `Las ${confirmDelete.enUso} órdenes que lo usan lo conservarán`}.`
                : "Ninguna orden lo está usando."}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", color: "var(--fg-2)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={guardando}
                style={{ height: 36, padding: "0 14px", border: "none", borderRadius: 8, background: "var(--danger)", color: "var(--fg-on-brand)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
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

function ItoRow({ hito, selected, isAdmin, onSelect, onEdit, onDelete }: {
  hito: Hito;
  selected: boolean;
  isAdmin: boolean;
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
        background: "var(--brand-tint)", color: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Zap size={16} />
      </div>
      <div style={{
        flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {hito.nombre}
      </div>
      {isAdmin && hover && (
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={onEdit}
            aria-label="Editar"
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            aria-label="Eliminar"
            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "var(--fg-3)" }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function ItoDetalle({ hito, isAdmin, workspaceId, onEdit, onDelete, onNuevaOT }: {
  hito: Hito;
  isAdmin: boolean;
  workspaceId: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onNuevaOT: () => void;
}) {
  // El padding superior calza con el de la lista (8px) para que la tarjeta del
  // detalle arranque a la misma altura que la primera de la izquierda.
  return (
    <div style={{ padding: "8px 20px 20px" }}>
      {/* `overflow: visible` para que el pie pegajoso no quede recortado. */}
      <div style={{
        background: "var(--surface-1)", border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}>
        {/* Encabezado. `minHeight` fija el alto de la fila para que el ícono y
            los botones de 36px queden centrados sobre la misma línea. */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          minHeight: 64, padding: "12px 18px", borderBottom: "1px solid var(--border)",
        }}>
          <div style={{
            width: 36, height: 36, flexShrink: 0, borderRadius: "var(--r-md)",
            background: "var(--brand-tint)", color: "var(--brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Zap size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 600, color: "var(--fg-1)" }}>
            {hito.nombre}
          </div>
          <AccionesCatalogo
            puedeEditar={isAdmin}
            puedeEliminar={isAdmin}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>

        <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--fg-3)" }}>
          Creado el {new Date(hito.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })}
        </div>

        <div style={{ padding: 18 }}>
          <HistorialOT
            workspaceId={workspaceId}
            target={{ tipo: "ito", nombre: hito.nombre }}
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
              fontSize: 13, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit",
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
