"use client";

// Attach procedures to a work order from the create and edit forms. Both screens
// render this same component so the flow (and its wording) cannot drift apart.
//
// The picker only manages the *selection*. Persisting it differs per screen —
// create attaches after the OT exists, edit diffs against what is already
// attached — so the parent owns the writes and this component stays controlled.

import { useMemo, useState } from "react";
import { ClipboardCheck, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { listProcedimientos } from "@/lib/procedimientos-api";
import type { ProcedimientoListItem } from "@/types/procedimientos";

export type ProcedimientoSeleccionado = {
  id: string;
  nombre: string;
  pasos_count?: number;
  categoria?: string | null;
};

export default function ProcedimientosPicker({
  workspaceId, value, onChange, onPreview,
}: {
  workspaceId: string | null | undefined;
  value: ProcedimientoSeleccionado[];
  onChange: (next: ProcedimientoSeleccionado[]) => void;
  /** Opens the read-only step preview. Omit to hide the "Vista previa" link. */
  onPreview?: (procedimientoId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [library, setLibrary] = useState<ProcedimientoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<ProcedimientoSeleccionado | null>(null);

  // The library is only fetched when the picker is first opened: most OTs are
  // created without touching procedures, and it is a full-workspace read.
  function openPicker() {
    setOpen(true);
    if (!workspaceId || library.length > 0 || loading) return;
    setLoading(true);
    listProcedimientos(workspaceId)
      .then(rows => setLibrary(rows))
      .catch(() => setLibrary([]))
      .finally(() => setLoading(false));
  }

  const attachedIds = useMemo(() => new Set(value.map(v => v.id)), [value]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library
      .filter(p => !attachedIds.has(p.id))
      .filter(p => !q || p.nombre.toLowerCase().includes(q));
  }, [library, attachedIds, query]);

  function closePicker() {
    setOpen(false);
    setQuery("");
    setPicked([]);
  }

  function confirmAdd() {
    const additions = library
      .filter(p => picked.includes(p.id))
      .map(p => ({ id: p.id, nombre: p.nombre, pasos_count: p.pasos_count, categoria: p.categoria }));
    onChange([...value, ...additions]);
    closePicker();
  }

  const linkStyle: React.CSSProperties = {
    background: "none", border: "none", padding: 0, cursor: "pointer",
    fontSize: 13, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit",
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-3)", letterSpacing: "0.01em", marginBottom: 10 }}>
        Procedimiento
      </div>

      {value.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "18px 12px", border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-canvas)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--fg-3)" }}>
            <ClipboardCheck size={15} style={{ color: "var(--brand)" }} />
            Crear o adjuntar nuevo Procedimiento
          </div>
          <button
            type="button"
            onClick={openPicker}
            style={{ height: 38, padding: "0 18px", display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--brand)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", color: "var(--brand)", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
          >
            <Plus size={15} /> Añadir Procedimiento
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {value.map(proc => (
            <div key={proc.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: "var(--r-md)", background: "var(--brand-tint)" }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: "var(--surface-1)", display: "grid", placeItems: "center", color: "var(--brand)" }}>
                <ClipboardCheck size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {proc.nombre}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 1 }}>
                  {proc.pasos_count != null ? `${proc.pasos_count} campos · ` : ""}De la biblioteca de Procedimiento
                </div>
              </div>
              <button
                type="button"
                onClick={() => onPreview ? onPreview(proc.id) : window.open(`/procedimientos/${proc.id}`, "_blank")}
                style={linkStyle}
              >
                Vista previa
              </button>
              <span aria-hidden="true" style={{ width: 1, height: 20, background: "var(--border-strong)" }} />
              <button
                type="button"
                onClick={() => window.open(`/procedimientos/${proc.id}/editar`, "_blank")}
                aria-label={`Editar ${proc.nombre}`}
                style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--brand)", cursor: "pointer" }}
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(proc)}
                aria-label={`Quitar ${proc.nombre}`}
                style={{ width: 30, height: 30, display: "grid", placeItems: "center", border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--brand)", cursor: "pointer" }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button type="button" onClick={openPicker} style={{ ...linkStyle, display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 700 }}>
            <Plus size={16} /> Añadir otro Procedimiento
          </button>
        </div>
      )}

      {/* ── Library picker ── */}
      {open && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) closePicker(); }}
          style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Añadir procedimiento" style={{ width: "min(620px, 100%)", maxHeight: "min(760px, calc(100vh - 48px))", display: "flex", flexDirection: "column", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ height: 58, padding: "0 16px 0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)" }}>Añadir Procedimiento</div>
              <button type="button" onClick={closePicker} aria-label="Cerrar" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface-0)", color: "var(--fg-1)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: "16px 20px", flexShrink: 0 }}>
              <div style={{ position: "relative" }}>
                <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar plantillas del Procedimiento"
                  style={{ width: "100%", height: 42, padding: "0 12px 0 34px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-0)", color: "var(--fg-1)", font: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
                />
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 20px" }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--fg-2)", marginBottom: 10 }}>
                Todos Procedimientos
              </div>
              {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "36px 0" }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
                </div>
              ) : results.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--fg-4)", padding: "24px 0", textAlign: "center" }}>
                  {library.length === 0
                    ? "No hay procedimientos en la biblioteca."
                    : query.trim()
                      ? "Ningún procedimiento coincide con la búsqueda."
                      : "Todos los procedimientos ya están adjuntos."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {results.map(p => {
                    const isPicked = picked.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPicked(prev => isPicked ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                        style={{
                          display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left",
                          padding: "12px 10px", border: "none", borderRadius: "var(--r-sm)",
                          background: isPicked ? "var(--brand-tint)" : "transparent",
                          cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: "50%", background: isPicked ? "var(--brand)" : "var(--surface-canvas)", display: "grid", placeItems: "center", color: isPicked ? "var(--fg-on-brand)" : "var(--brand)" }}>
                          <ClipboardCheck size={17} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.nombre}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: "var(--fg-3)", marginTop: 1 }}>
                            {p.pasos_count} campos{p.categoria ? ` · ${p.categoria}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
              <button
                type="button"
                onClick={confirmAdd}
                disabled={picked.length === 0}
                style={{
                  height: 42, padding: "0 20px", border: "none", borderRadius: "var(--r-md)",
                  background: picked.length ? "var(--brand)" : "var(--surface-2)",
                  color: picked.length ? "var(--fg-on-brand)" : "var(--fg-4)",
                  fontSize: 13.5, fontWeight: 700, fontFamily: "inherit",
                  cursor: picked.length ? "pointer" : "default",
                }}
              >
                Añadir Procedimiento{picked.length > 1 ? `s (${picked.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove confirmation ── */}
      {confirmRemove && (
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) setConfirmRemove(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 710, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        >
          <div role="dialog" aria-modal="true" aria-label="Eliminar procedimiento" style={{ width: "min(460px, 100%)", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-xl)", boxShadow: "var(--shadow-lg)" }}>
            <div style={{ padding: "20px 24px 0" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)", marginBottom: 8 }}>¿Elimine procedimiento?</div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--fg-2)" }}>
                ¿Estás seguro de que quieres eliminar el procedimiento adjunto? La
                información introducida en el procedimiento se perderá.
              </p>
            </div>
            <div style={{ marginTop: 20, padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmRemove(null)} style={linkStyle}>Cancelar</button>
              <button
                type="button"
                onClick={() => { onChange(value.filter(v => v.id !== confirmRemove.id)); setConfirmRemove(null); }}
                style={{ height: 40, padding: "0 20px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
