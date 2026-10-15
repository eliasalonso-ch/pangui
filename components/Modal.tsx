"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Modal centrado con fondo oscuro sobre toda la ventana.
 *
 * Mismo overlay que ConfirmDeleteModal (zIndex 500): el AlertDialog de shadcn
 * pinta z-50 y la topbar (zIndex 100) quedaba iluminada encima del fondo.
 */
export default function Modal({ open, title, onClose, children, footer, width = 560, busy = false }: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Mientras hay una acción en vuelo no se cierra con Esc, clic afuera ni la X. */
  busy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;
  const close = () => { if (!busy) onClose(); };

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
        style={{
          width: "100%", maxWidth: width, maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column",
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-lg, 12px)",
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h2>
          <button
            type="button" aria-label="Cerrar" disabled={busy} onClick={close}
            style={{ width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: busy ? "default" : "pointer", color: "var(--fg-3)" }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "20px 24px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, fontSize: 14, color: "var(--fg-1)" }}>
          {children}
        </div>
        {footer && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px", borderTop: "1px solid var(--border)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
