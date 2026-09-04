"use client";

import { Check, CloudOff, Loader2 } from "lucide-react";

/**
 * Small "Guardado" indicator for the OT create panel.
 *
 * Autosave is invisible by nature, so without this the user has no way to tell
 * a saved draft from a lost one — which is the same anxiety the drafts feature
 * exists to remove.
 */
export default function BorradorEstado({
  guardando,
  guardadoAt,
  fallo,
}: {
  guardando: boolean;
  guardadoAt: string | null;
  fallo: boolean;
}) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 14,
    fontWeight: 400,
    fontFamily: "inherit",
    whiteSpace: "nowrap" as const,
  };

  if (fallo) {
    return (
      <span style={{ ...base, color: "var(--danger)" }} role="status">
        <CloudOff size={13} aria-hidden />
        Sin guardar
      </span>
    );
  }

  if (guardando) {
    return (
      <span style={{ ...base, color: "var(--fg-3)" }} role="status">
        <Loader2 size={13} aria-hidden style={{ animation: "spin 1s linear infinite" }} />
        Guardando…
      </span>
    );
  }

  if (guardadoAt) {
    return (
      <span style={{ ...base, color: "var(--fg-3)" }} role="status">
        <Check size={13} aria-hidden />
        Guardado
      </span>
    );
  }

  return null;
}
