"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera, Check, Download, DownloadCloud, FolderOpen, FolderPlus, Image as ImageIcon, Images, ImageUp,
  Loader2, Lock, LockOpen, Maximize2, MoreHorizontal, Paperclip, Pencil, Plus, Trash, Trash2, X,
} from "lucide-react";
import type { FotoGrupo } from "@/lib/foto-grupos-api";

/**
 * Photo gallery for the OT detail "Fotos" tab.
 *
 * Layout mirrors a desktop photo app: a folder sidebar on the left (all photos
 * + one entry per grupo, following the shadcn Sidebar composition) and a photo
 * grid on the right. Every capability the old stacked-cards view had is kept —
 * upload, create/rename/delete grupo, lock, referencia/evidencia toggle — just
 * relocated to the selected folder's header or the sidebar footer.
 */

type Tipo = "referencia" | "evidencia";

/** "All photos" pseudo-folder; real folders are keyed by grupo id. */
const ALL = "__all__";

/** Minimum tile width; the grid auto-fills so tiles grow past this. */
const TILE_MIN = 176;

/**
 * How far outside the scroll viewport a tile starts loading. Generous enough
 * that scrolling feels instant, tight enough that opening an album with 200
 * photos fetches ~12 instead of all 200.
 */
const LAZY_ROOT_MARGIN = "600px";

/**
 * R2 egress note
 * ──────────────
 * cdn.getpangui.com serves R2 originals with no transform pipeline, so a grid
 * tile and a fullscreen view cost the same bytes. Until Cloudflare Image
 * Resizing is enabled on the zone we cannot shrink a single image, so the
 * lever is fetching FEWER of them:
 *
 *  - tiles only mount their <img> once near the viewport (IntersectionObserver
 *    below) — off-screen photos are never requested at all;
 *  - `loading="lazy"` + `decoding="async"` as a second line of defence;
 *  - the browser cache dedupes the lightbox/download hit against the tile.
 *
 * If Transformations is turned on later, the single change needed is routing
 * `src` through a `/cdn-cgi/image/width=…` helper — see lib/image-cdn.ts, which
 * already implements exactly that and is used by the procedimientos photos.
 */

export type FotosGaleriaProps = {
  grupos: FotoGrupo[];
  loading: boolean;
  canManage: boolean;
  canUpload: boolean;
  /** OT is open — controls whether create/upload affordances show at all. */
  isActive: boolean;
  uploadingGrupoId: string | null;
  creatingGrupo: boolean;
  onUpload: (grupoId: string, file: File) => void;
  onRemoveItem: (grupoId: string, itemId: string, url: string) => void;
  /**
   * Bulk delete for a marquee/Ctrl+A selection. Receives every selected photo
   * with its owning album so the caller can remove them in one confirmation.
   */
  onRemoveMany: (items: { grupoId: string; itemId: string; url: string }[]) => void;
  onDeleteGrupo: (grupo: FotoGrupo) => void;
  onSaveGrupoEdit: (grupoId: string, titulo: string, descripcion: string) => void;
  onToggleLocked: (grupoId: string, locked: boolean) => void;
  onChangeTipo: (grupoId: string, tipo: Tipo) => void;
  onCreateGrupo: (titulo: string, descripcion: string, tipo: Tipo) => Promise<void> | void;
  onLightbox: (urls: string[], idx: number) => void;
};

export function FotosGaleria({
  grupos, loading, canManage, canUpload, isActive,
  uploadingGrupoId, creatingGrupo,
  onUpload, onRemoveItem, onRemoveMany, onDeleteGrupo, onSaveGrupoEdit, onToggleLocked,
  onChangeTipo, onCreateGrupo, onLightbox,
}: FotosGaleriaProps) {
  const [selectedId, setSelectedId] = useState<string>(ALL);
  const [creating, setCreating] = useState(false);
  const [newTitulo, setNewTitulo] = useState("");
  const [newTipo, setNewTipo] = useState<Tipo>("referencia");
  const [editing, setEditing] = useState(false);
  const [editTitulo, setEditTitulo] = useState("");
  const [editTipo, setEditTipo] = useState<Tipo>("referencia");
  // Preserved verbatim: the edit modal doesn't expose description, so the
  // album's existing text must survive a rename instead of being blanked.
  const [editDesc, setEditDesc] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // ── Selection ──────────────────────────────────────────────────────────
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement | null>(null);
  // Live marquee rectangle in grid-content coordinates (scroll-independent).
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeRef = useRef<{ additive: boolean; base: Set<string> } | null>(null);

  // Closed OTs hide empty folders — there is nothing to add to them anymore.
  const visibles = useMemo(
    () => (isActive ? grupos : grupos.filter(g => (g.items?.length ?? 0) > 0)),
    [grupos, isActive],
  );

  // Derived, not synced via an effect: if the selected folder disappears
  // (deleted, or filtered out when the OT closes) this falls back to "all" on
  // the very same render, with no intermediate empty pane.
  const selected = selectedId === ALL ? null : visibles.find(g => g.id === selectedId) ?? null;
  // Resolved id — a stale selectedId (deleted album) reads as "all" everywhere,
  // including the sidebar highlight, without a separate state write.
  const activeId = selected?.id ?? ALL;

  const totalFotos = visibles.reduce((n, g) => n + (g.items?.length ?? 0), 0);

  // Flattened view for "all photos", tagged so each tile can still show which
  // folder it belongs to and delete against the right grupo.
  const allItems = useMemo(
    () => visibles.flatMap(g => (g.items ?? []).map(item => ({ item, grupo: g }))),
    [visibles],
  );

  const shownItems = useMemo(
    () => (selected ? (selected.items ?? []).map(item => ({ item, grupo: selected })) : allItems),
    [selected, allItems],
  );
  const shownUrls = useMemo(() => shownItems.map(x => x.item.url), [shownItems]);

  const isLocked = selected?.locked === true;
  // Admins bypass the lock; everyone else needs upload rights and an open folder.
  const canEditSelected = selected ? (canManage || (canUpload && !isLocked)) : false;
  const uploading = selected ? uploadingGrupoId === selected.id : false;

  // Selection is scoped to what's currently shown. Rather than pruning stale
  // ids in an effect, the visible selection is derived: ids for photos that
  // aren't on screen (album switch, deletion) simply never match.
  const selectedList = useMemo(
    () => shownItems.filter(x => selectedItems.has(x.item.id)),
    [shownItems, selectedItems],
  );
  const selectionCount = selectedList.length;

  const canDeleteSelection = selectedList.length > 0 && selectedList.every(
    ({ grupo }) => canManage || (canUpload && grupo.locked !== true),
  );

  // Ctrl/Cmd+A selects everything in the current grid. Bound to the grid's own
  // focus so it never hijacks the shortcut while typing in an input.
  function handleGridKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelectedItems(new Set(shownItems.map(x => x.item.id)));
      return;
    }
    if (e.key === "Escape") setSelectedItems(new Set());
  }

  /**
   * Pointer → grid-content coordinates, clamped to the scrollable content box.
   * Without the clamp, dragging past an edge would place the marquee div
   * outside the content and grow the container's scroll extent, so the tab
   * could be scrolled into empty space.
   */
  function contentPoint(e: React.PointerEvent | PointerEvent) {
    const el = gridRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left + el.scrollLeft;
    const y = e.clientY - r.top + el.scrollTop;
    return {
      // clientWidth, not scrollWidth: the grid never scrolls horizontally, so
      // the marquee must stay inside the visible width.
      x: Math.max(0, Math.min(x, el.clientWidth)),
      y: Math.max(0, Math.min(y, el.scrollHeight)),
    };
  }

  function beginMarquee(e: React.PointerEvent<HTMLDivElement>) {
    // Left button only, and never when the press starts on a tile/menu/button —
    // those keep their own click behaviour.
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-photo-tile],button,a,input")) return;

    const p = contentPoint(e);
    const additive = e.ctrlKey || e.metaKey || e.shiftKey;
    marqueeRef.current = { additive, base: additive ? new Set(selectedItems) : new Set() };
    if (!additive) setSelectedItems(new Set());
    setMarquee({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    gridRef.current?.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moveMarquee(e: React.PointerEvent<HTMLDivElement>) {
    if (!marquee || !marqueeRef.current) return;
    const p = contentPoint(e);
    const box = { ...marquee, x2: p.x, y2: p.y };
    setMarquee(box);

    // Hit-test tiles against the marquee, in the same content coordinate space.
    const el = gridRef.current;
    if (!el) return;
    const gridRect = el.getBoundingClientRect();
    const left = Math.min(box.x1, box.x2), right = Math.max(box.x1, box.x2);
    const top = Math.min(box.y1, box.y2), bottom = Math.max(box.y1, box.y2);

    const hit = new Set(marqueeRef.current.base);
    el.querySelectorAll<HTMLElement>("[data-photo-tile]").forEach(node => {
      const r = node.getBoundingClientRect();
      const nx1 = r.left - gridRect.left + el.scrollLeft;
      const ny1 = r.top - gridRect.top + el.scrollTop;
      const nx2 = nx1 + r.width, ny2 = ny1 + r.height;
      const intersects = nx1 < right && nx2 > left && ny1 < bottom && ny2 > top;
      const id = node.dataset.photoTile;
      if (intersects && id) hit.add(id);
    });
    setSelectedItems(hit);
  }

  function endMarquee(e: React.PointerEvent<HTMLDivElement>) {
    if (!marquee) return;
    // A click with no drag = clear selection (empty-space click).
    const dragged = Math.abs(marquee.x2 - marquee.x1) > 3 || Math.abs(marquee.y2 - marquee.y1) > 3;
    if (!dragged && !marqueeRef.current?.additive) setSelectedItems(new Set());
    setMarquee(null);
    marqueeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  /** Toggle a single tile (Ctrl/Cmd/Shift-click), else select just that one. */
  function toggleItem(id: string, additive: boolean) {
    setSelectedItems(prev => {
      const next = new Set(additive ? prev : []);
      if (additive && prev.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Sequential so a 30-photo download doesn't trip popup blocking. */
  async function downloadSelected() {
    for (const { item } of selectedList) {
      const a = document.createElement("a");
      a.href = item.url;
      a.download = "";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise(r => setTimeout(r, 250));
    }
  }

  function startEdit(g: FotoGrupo) {
    setEditTitulo(g.titulo);
    setEditTipo(g.tipo as Tipo);
    setEditDesc(g.descripcion);
    setEditing(true);
  }

  function submitEdit() {
    if (!selected || !editTitulo.trim()) return;
    onSaveGrupoEdit(selected.id, editTitulo.trim(), editDesc);
    if (editTipo !== selected.tipo) onChangeTipo(selected.id, editTipo);
    setEditing(false);
  }

  async function submitCreate() {
    if (!newTitulo.trim() || creatingGrupo) return;
    // Albums are created without a description — see NuevoAlbumModal.
    await onCreateGrupo(newTitulo.trim(), "", newTipo);
    setNewTitulo(""); setNewTipo("referencia"); setCreating(false);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", gap: 8, color: "var(--fg-4)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando fotos…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, height: "100%", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)" }}>

      {/* ── Folder sidebar ──────────────────────────────────────────────── */}
      {/* Sidebar/header share the card surface so the gallery reads as one flat
          white (light) or black (dark) panel rather than banded greys. */}
      <aside style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--surface-1)", borderRight: "1px solid var(--border)" }}>
        <div style={{ padding: "12px 12px 8px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-4)" }}>
            Álbumes
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
          <FolderButton
            icon={<Images size={14} />}
            label="Todas las fotos"
            count={totalFotos}
            active={activeId === ALL}
            onClick={() => { setSelectedId(ALL); setEditing(false); }}
          />

          {/* Grouped by type: referencia (supervisor's guidance) above,
              evidencia (what the technician must capture) below. */}
          {(["referencia", "evidencia"] as const).map(t => {
            const delGrupo = visibles.filter(g => g.tipo === t);
            if (delGrupo.length === 0) return null;
            return (
              <div key={t} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 1, background: "var(--border)", margin: "6px 4px 4px" }} />
                <div style={{ padding: "0 8px 2px", fontSize: 14, fontWeight: 600, color: "var(--fg-4)" }}>
                  {t === "referencia" ? "Referencia" : "Evidencia"}
                </div>
                {delGrupo.map(g => (
                  <FolderButton
                    key={g.id}
                    icon={g.locked ? <Lock size={14} /> : <FolderOpen size={14} />}
                    label={g.titulo || "Sin título"}
                    count={g.items?.length ?? 0}
                    active={activeId === g.id}
                    onClick={() => { setSelectedId(g.id); setEditing(false); }}
                  />
                ))}
              </div>
            );
          })}

          {visibles.length === 0 && (
            <div style={{ padding: "16px 8px", fontSize: 12, color: "var(--fg-4)", textAlign: "center", lineHeight: 1.5 }}>
              Sin álbumes
            </div>
          )}

          {/* Sits directly under the last album and scrolls with the list,
              rather than being pinned to the bottom of the sidebar. */}
          {(isActive || canManage) && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{
                width: "100%", height: 32, marginTop: 4, flexShrink: 0,
                display: "flex", alignItems: "center", gap: 8, padding: "0 8px",
                border: "none", borderRadius: "var(--r-sm)",
                background: "transparent", color: "var(--fg-3)",
                fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--brand)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-3)"; }}
            >
              <span style={{ flexShrink: 0, display: "flex" }}><Plus size={14} /></span>
              Nuevo álbum
            </button>
          )}
        </div>
      </aside>

      {/* ── Photo pane ──────────────────────────────────────────────────── */}
      <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>

        {/* Header: folder title + its actions */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", lineHeight: 1.3 }}>
                  {selected ? (selected.titulo || "Sin título") : "Todas las fotos"}
                </div>
                {selected?.descripcion && (
                  <div style={{ fontSize: 12, color: "var(--fg-2)", marginTop: 3, lineHeight: 1.4 }}>{selected.descripcion}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 11, color: "var(--fg-4)" }}>
                    {shownItems.length} foto{shownItems.length !== 1 ? "s" : ""}
                    {!selected && visibles.length > 0 && ` · ${visibles.length} álbum${visibles.length !== 1 ? "es" : ""}`}
                  </span>
                  {/* Read-only badge; admins get the segmented control on the right. */}
                  {selected && !canManage && (
                    <span style={tipoChipStyle(selected.tipo as Tipo, false)}>
                      <TipoLabel tipo={selected.tipo as Tipo} />
                    </span>
                  )}
                </div>
              </div>

              {/* Shown when the user can do anything here: technicians get the
                  upload button, admins additionally get edit/delete/lock. */}
              {(selectionCount > 0 || (selected && (canManage || canEditSelected))) && (
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>

                  {/* Selection actions take over the same icon row while a
                      selection exists, so there is only ever one control strip. */}
                  {selectionCount > 0 ? (
                    <>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--brand)", marginRight: 2 }}>
                        {selectionCount} seleccionada{selectionCount !== 1 ? "s" : ""}
                      </span>

                      <button
                        type="button"
                        onClick={() => void downloadSelected()}
                        title="Descargar las fotos seleccionadas"
                        style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--fg-3)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--brand)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-3)"; }}
                      >
                        <DownloadCloud size={20} />
                      </button>

                      {canDeleteSelection && (
                        <button
                          type="button"
                          onClick={() => onRemoveMany(selectedList.map(({ item, grupo }) => ({ grupoId: grupo.id, itemId: item.id, url: item.url })))}
                          title="Eliminar las fotos seleccionadas"
                          style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--danger)" }}
                          onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <Trash size={20} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedItems(new Set())}
                        title="Cancelar selección"
                        aria-label="Cancelar selección"
                        style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--fg-3)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--fg-1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-3)"; }}
                      >
                        <X size={20} />
                      </button>
                    </>
                  ) : selected && (
                  <>
                  {/* Referencia / Evidencia as a segmented control — the current
                      type is the selected segment rather than a toggle chip.
                      Changing an album's type is an admin-only action. */}
                  {canManage && (
                  <div
                    role="radiogroup"
                    aria-label="Tipo de álbum"
                    style={{ display: "flex", padding: 2, gap: 2, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-0)" }}
                  >
                    {(["referencia", "evidencia"] as const).map(t => {
                      const on = selected.tipo === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={t === "referencia"
                            ? "Referencia: fotos del supervisor para guiar al técnico"
                            : "Evidencia: fotos que el técnico debe subir en campo"}
                          onClick={() => { if (!on) onChangeTipo(selected.id, t); }}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            height: 26, padding: "0 9px",
                            border: "none", borderRadius: 5,
                            background: on ? "var(--brand)" : "transparent",
                            color: on ? "var(--fg-on-brand)" : "var(--fg-3)",
                            fontSize: 11.5, fontWeight: 600,
                            cursor: on ? "default" : "pointer", fontFamily: "inherit",
                            transition: "background 0.12s, color 0.12s",
                          }}
                          onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--surface-hover)"; }}
                          onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}
                        >
                          {t === "referencia" ? "Referencia" : "Evidencia"}
                        </button>
                      );
                    })}
                  </div>
                  )}

                  {/* Icon sizing matches GlobalTopBar: 20px glyph in a 34px button. */}
                  {canEditSelected && (
                    <>
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        title="Agregar fotos"
                        style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: uploading ? "default" : "pointer", color: "var(--fg-3)" }}
                        onMouseEnter={e => { if (!uploading) { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--brand)"; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-3)"; }}
                      >
                        {uploading ? <Loader2 size={20} className="animate-spin" /> : <ImageUp size={20} />}
                      </button>
                      <input
                        ref={fileRef}
                        type="file" accept="image/*" multiple style={{ display: "none" }}
                        onChange={e => {
                          Array.from(e.target.files ?? []).forEach(f => onUpload(selected.id, f));
                          e.target.value = "";
                        }}
                      />
                    </>
                  )}

                  {canManage && (
                  <>
                  <button
                    type="button" onClick={() => startEdit(selected)} title="Editar álbum"
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--fg-3)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = "var(--fg-1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-3)"; }}
                  >
                    <Pencil size={20} />
                  </button>
                  <button
                    type="button" onClick={() => onDeleteGrupo(selected)} title="Eliminar álbum"
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "50%", cursor: "pointer", color: "var(--danger)" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--danger-bg)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <Trash2 size={20} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleLocked(selected.id, !isLocked)}
                    title={isLocked ? "Desbloquear álbum" : "Bloquear álbum"}
                    aria-pressed={!isLocked}
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "50%", background: isLocked ? "transparent" : "var(--brand-tint)", color: isLocked ? "var(--fg-3)" : "var(--brand)", cursor: "pointer", fontFamily: "inherit" }}
                    onMouseEnter={e => { if (isLocked) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isLocked ? "transparent" : "var(--brand-tint)"; }}
                  >
                    {isLocked ? <Lock size={20} /> : <LockOpen size={20} />}
                  </button>
                  </>
                  )}
                  </>
                  )}
                </div>
              )}
            </div>
        </div>

        {/* Grid — also the marquee surface and the Ctrl+A key target. */}
        <div
          ref={gridRef}
          tabIndex={-1}
          onKeyDown={handleGridKeyDown}
          onPointerDown={beginMarquee}
          onPointerMove={moveMarquee}
          onPointerUp={endMarquee}
          onPointerCancel={endMarquee}
          style={{ flex: 1, padding: 14, overflowY: "auto", position: "relative", outline: "none", userSelect: marquee ? "none" : undefined }}
        >
          {/* Rubber-band rectangle, drawn in content coordinates.
              The outer div is zero-sized and overflow-hidden so the rectangle
              can never enlarge the grid's scrollable area (which would let the
              tab scroll into empty space during a drag). */}
          {marquee && (
            <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "visible", pointerEvents: "none", zIndex: 5 }}>
              <div
                style={{
                  position: "absolute",
                  left: Math.min(marquee.x1, marquee.x2),
                  top: Math.min(marquee.y1, marquee.y2),
                  width: Math.abs(marquee.x2 - marquee.x1),
                  height: Math.abs(marquee.y2 - marquee.y1),
                  border: "1px solid var(--brand)",
                  background: "var(--brand-tint)",
                  opacity: 0.55,
                  borderRadius: 2,
                }}
              />
            </div>
          )}
          {shownItems.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 8, color: "var(--fg-4)" }}>
              <ImageIcon size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: 13 }}>
                {isLocked ? "Álbum bloqueado" : selected ? "Sin fotos en este álbum" : "Sin fotos"}
              </span>
              {canEditSelected && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px", marginTop: 2, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 12.5, fontWeight: 600, cursor: uploading ? "default" : "pointer", fontFamily: "inherit" }}
                  onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.color = "var(--brand)"; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--fg-2)"; }}
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageUp size={14} />}
                  Agregar fotos
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN}px, 1fr))`, gap: 10 }}>
              {shownItems.map(({ item, grupo }, idx) => (
                <PhotoTile
                  key={item.id}
                  itemId={item.id}
                  url={item.url}
                  albumLabel={selected ? null : (grupo.titulo || "Sin título")}
                  canDelete={canManage || (canUpload && grupo.locked !== true)}
                  isSelected={selectedItems.has(item.id)}
                  selectionActive={selectionCount > 0}
                  onToggleSelect={additive => toggleItem(item.id, additive)}
                  onOpen={() => onLightbox(shownUrls, idx)}
                  onDelete={() => onRemoveItem(grupo.id, item.id, item.url)}
                />
              ))}

            </div>
          )}

          {/* "All photos" can't receive uploads — point at the albums instead. */}
          {!selected && shownItems.length === 0 && (isActive || canManage) && visibles.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-4)", textAlign: "center" }}>
              Selecciona un álbum para agregar fotos.
            </div>
          )}
        </div>
      </section>

      {creating && (
        <NuevoAlbumModal
          titulo={newTitulo}
          tipo={newTipo}
          saving={creatingGrupo}
          onTitulo={setNewTitulo}
          onTipo={setNewTipo}
          onCancel={() => { setCreating(false); setNewTitulo(""); setNewTipo("referencia"); }}
          onSubmit={() => void submitCreate()}
        />
      )}

      {editing && selected && (
        <NuevoAlbumModal
          mode="editar"
          titulo={editTitulo}
          tipo={editTipo}
          saving={false}
          onTitulo={setEditTitulo}
          onTipo={setEditTipo}
          onCancel={() => setEditing(false)}
          onSubmit={submitEdit}
        />
      )}
    </div>
  );
}

/**
 * Centered modal for creating an album: name and type only.
 * Description is deliberately omitted — mobile never surfaces it, so new albums
 * are created with an empty one. Existing descriptions still render in the
 * album header and stay editable through the pencil/edit form.
 *
 * Rendered inline (not a portal) — the gallery container is the tab's own
 * stacking context, and a fixed-position overlay escapes it fine.
 */
function NuevoAlbumModal({
  mode = "crear", titulo, tipo, saving,
  onTitulo, onTipo, onCancel, onSubmit,
}: {
  /** "crear" for a new album, "editar" to rename an existing one. */
  mode?: "crear" | "editar";
  titulo: string;
  tipo: Tipo;
  saving: boolean;
  onTitulo: (v: string) => void;
  onTipo: (v: Tipo) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isEdit = mode === "editar";
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  const valid = titulo.trim().length > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Editar álbum" : "Nuevo álbum"}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 430, padding: "26px 30px 30px",
          borderRadius: 14, border: "1px solid var(--border)",
          background: "var(--surface-1)", boxShadow: "var(--shadow-lg)",
          position: "relative",
        }}
      >
        {/* Close sits top-left, mirroring the reference dialog. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar"
          style={{ position: "absolute", top: 14, left: 14, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--fg-2)", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <X size={19} />
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 20 }}>
          {isEdit
            ? <Pencil size={34} strokeWidth={1.6} style={{ color: "var(--brand)" }} />
            : <FolderPlus size={38} strokeWidth={1.6} style={{ color: "var(--brand)" }} />}
          <div style={{ fontSize: 19, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>{isEdit ? "Editar álbum" : "Nuevo álbum"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            autoFocus
            type="text"
            placeholder="Nombre del álbum"
            value={titulo}
            onChange={e => onTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && valid && !saving) onSubmit(); }}
            style={{ height: 42, padding: "0 14px", border: "2px solid var(--brand)", borderRadius: 9, fontSize: 14, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)", width: "100%" }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            {(["referencia", "evidencia"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTipo(t)}
                title={t === "referencia"
                  ? "Fotos del supervisor para guiar al técnico"
                  : "Fotos que el técnico debe subir en campo"}
                style={{
                  flex: 1, height: 40, borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${tipo === t ? "var(--brand)" : "var(--border)"}`,
                  background: tipo === t ? "var(--brand-tint)" : "var(--surface-1)",
                  color: tipo === t ? "var(--brand-fg)" : "var(--fg-2)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <TipoLabel tipo={t} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!valid || saving}
            style={{
              height: 44, marginTop: 4, border: "none", borderRadius: 9,
              background: valid ? "var(--brand)" : "var(--border)",
              color: valid ? "var(--fg-on-brand)" : "var(--fg-4)",
              fontSize: 14.5, fontWeight: 600, cursor: valid && !saving ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit",
              transition: "opacity 0.12s", opacity: valid && !saving ? 1 : 0.75,
            }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────────────────

/** One photo tile: image, optional album caption, and a ⋯ actions menu. */
function PhotoTile({ itemId, url, albumLabel, canDelete, isSelected, selectionActive, onToggleSelect, onOpen, onDelete }: {
  itemId: string;
  url: string;
  /** Album name overlay, shown only in the flattened "all photos" view. */
  albumLabel: string | null;
  canDelete: boolean;
  isSelected: boolean;
  /** True while any selection exists — a plain click then extends it. */
  selectionActive: boolean;
  onToggleSelect: (additive: boolean) => void;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const tileRef = useRef<HTMLDivElement | null>(null);

  // Egress control: don't request the image until the tile is near the
  // viewport. Opening a 200-photo album then costs ~a dozen requests, not 200.
  // Initialised true when IntersectionObserver is unavailable (SSR/old browser)
  // so those environments simply render every image, no effect-time setState.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = tileRef.current;
    if (!node || visible) return;
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: LAZY_ROOT_MARGIN });
    io.observe(node);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  return (
    <div
      ref={tileRef}
      className="group"
      data-photo-tile={itemId}
      style={{
        position: "relative", aspectRatio: "1", borderRadius: "var(--r-md)",
        overflow: "hidden", background: "var(--surface-hover)", cursor: "pointer",
        border: isSelected ? "2px solid var(--brand)" : "1px solid var(--border)",
        outline: isSelected ? "2px solid var(--brand-tint)" : "none",
      }}
    >
      {/* Served straight from R2 (no transform pipeline on the zone), and only
          once near the viewport — see the egress note at the top of the file. */}
      {visible ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onClick={e => {
            const additive = e.ctrlKey || e.metaKey || e.shiftKey;
            // Once a selection exists, plain clicks keep selecting rather than
            // yanking the user into the lightbox.
            if (additive || selectionActive) { e.stopPropagation(); onToggleSelect(additive || selectionActive); return; }
            onOpen();
          }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%" }} />
      )}

      {/* Selection tick */}
      {isSelected && (
        <div style={{ position: "absolute", top: 6, left: 6, width: 20, height: 20, borderRadius: "50%", background: "var(--brand)", color: "var(--fg-on-brand)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 2 }}>
          <Check size={13} strokeWidth={3} />
        </div>
      )}

      {albumLabel && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 8px 6px", fontSize: 11, fontWeight: 600, color: "#fff", background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {albumLabel}
        </div>
      )}

      {/* ⋯ menu — appears on hover, or stays visible while its menu is open. */}
      <div ref={menuRef} style={{ position: "absolute", top: 6, right: 6 }}>
        <button
          type="button"
          aria-label="Más opciones"
          aria-expanded={menuOpen}
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          className={menuOpen ? "" : "opacity-0 group-hover:opacity-100"}
          style={{
            width: 26, height: 26, borderRadius: "50%", border: "none",
            background: "rgba(0,0,0,0.6)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "opacity 0.12s, background 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.8)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.6)"; }}
        >
          <MoreHorizontal size={14} />
        </button>

        {menuOpen && (
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute", top: 30, right: 0, zIndex: 20, width: 178, padding: 4,
              borderRadius: "var(--r-md)", border: "1px solid var(--border)",
              background: "var(--surface-1)", boxShadow: "var(--shadow-lg)",
            }}
          >
            <MenuItem icon={<Maximize2 size={14} />} label="Ver foto" onClick={() => { setMenuOpen(false); onOpen(); }} />
            <MenuItem
              icon={<Download size={14} />}
              label="Descargar"
              // Original, not the resized variant — a download should be full quality.
              onClick={() => { setMenuOpen(false); window.open(url, "_blank", "noopener,noreferrer"); }}
            />
            {canDelete && (
              <>
                <div style={{ height: 1, margin: "4px 6px", background: "var(--divider)" }} />
                <MenuItem icon={<Trash2 size={14} />} label="Eliminar" danger onClick={() => { setMenuOpen(false); onDelete(); }} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 9,
        minHeight: 32, padding: "6px 8px", border: 0, borderRadius: "var(--r-sm)",
        background: "transparent", color: danger ? "var(--danger)" : "var(--fg-1)",
        fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? "var(--danger-bg)" : "var(--surface-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ display: "flex", flexShrink: 0, color: danger ? "var(--danger)" : "var(--fg-3)" }}>{icon}</span>
      {label}
    </button>
  );
}

/**
 * Type label. Uses Lucide glyphs rather than 📎/📷 emoji — emoji render in their
 * own fixed colors (the paperclip reads green), which ignores the theme. These
 * inherit `currentColor` from the chip/button instead.
 */
function TipoLabel({ tipo }: { tipo: Tipo }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {tipo === "referencia" ? <Paperclip size={12} /> : <Camera size={12} />}
      {tipo === "referencia" ? "Referencia" : "Evidencia"}
    </span>
  );
}

function tipoChipStyle(tipo: Tipo, clickable: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    height: 20, padding: "0 8px", borderRadius: "var(--r-xs)", fontSize: 11, fontWeight: 600,
    border: "1px solid var(--border-strong)",
    background: tipo === "referencia" ? "var(--brand-tint)" : "var(--st-progress-bg)",
    color: tipo === "referencia" ? "var(--brand-fg)" : "var(--st-progress-fg)",
    cursor: clickable ? "pointer" : "default",
    fontFamily: "inherit",
  };
}

function FolderButton({ icon, label, count, active, onClick }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", height: 32, padding: "0 8px",
        border: "none", borderRadius: "var(--r-sm)",
        background: active ? "var(--brand-tint)" : "transparent",
        color: active ? "var(--brand)" : "var(--fg-2)",
        fontSize: 14, fontWeight: active ? 600 : 500,
        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ flexShrink: 0, display: "flex", color: active ? "var(--brand)" : "var(--fg-3)" }}>{icon}</span>
      {/* Sentence case: capitalize the first letter only, leaving the rest of
          the user's typed name untouched (so "OT norte" keeps its caps). */}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label.charAt(0).toUpperCase() + label.slice(1)}
      </span>
      <span style={{ flexShrink: 0, fontSize: 11, color: active ? "var(--brand)" : "var(--fg-4)", fontVariantNumeric: "tabular-nums" }}>
        {count}
      </span>
    </button>
  );
}
