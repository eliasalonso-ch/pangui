"use client";

/**
 * El dialogo de confirmacion de borrado de la app.
 *
 * Vivia dentro de OTDetail. Se saco a un componente propio cuando la bandeja de
 * notificaciones necesito confirmar borrados: la alternativa era el AlertDialog
 * de shadcn, pero ese pinta su overlay con z-50 y la topbar es zIndex 100, asi
 * que la barra superior quedaba iluminada por encima del fondo oscuro. Este usa
 * un overlay propio con zIndex 500, que cubre toda la ventana.
 *
 * Se movio tal cual: OTDetail se comporta igual que antes.
 */

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

export interface ConfirmDelete {
  /** The thing being deleted, interpolated into the default question (e.g. a
   *  name). Ignored when `title` is provided. */
  label?: string;
  /** Overrides the auto-generated question, e.g. "Eliminar esta orden?". */
  title?: string;
  /** Optional secondary warning line under the title. */
  description?: string;
  /** Confirm button text. Defaults to "Confirmar". */
  confirmLabel?: string;
  /** Runs on confirm. May be async. If it throws, the message is shown in the
   *  modal and the dialog stays open (so the user can retry). */
  onConfirm: () => void | Promise<void>;
}

export default function ConfirmDeleteModal({ pending, onClose }: {
  pending: ConfirmDelete | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset the inline error whenever a new confirmation is opened/closed.
  useEffect(() => { setError(null); }, [pending]);
  if (!pending) return null;

  const close = () => { if (!busy) onClose(); };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await pending.onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const title = pending.title ?? `¿Seguro que quieres eliminar “${pending.label ?? "esto"}”?`;

  return (
    <div
      role="presentation"
      onClick={close}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 420, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-lg, 12px)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={busy}
            onClick={onClose}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: busy ? "default" : "pointer", color: "var(--fg-3)" }}
            onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "4px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "center" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", lineHeight: 1.4 }}>
              {title}
            </h3>
            {pending.description && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
                {pending.description}
              </p>
            )}
          </div>
          {error && (
            <div style={{ padding: "10px 12px", border: "1px solid var(--danger)", borderRadius: 8, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 14 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              type="button"
              disabled={busy}
              onClick={run}
              style={{
                height: 44, width: "100%", border: "none", borderRadius: 8,
                background: "var(--danger)", color: "#fff", fontSize: 14, fontWeight: 400,
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: busy ? 0.75 : 1,
              }}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {pending.confirmLabel ?? "Confirmar"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              style={{
                height: 44, width: "100%", border: "none", borderRadius: 8,
                background: "transparent", color: "var(--brand-fg)", fontSize: 14, fontWeight: 400,
                cursor: busy ? "default" : "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
