"use client";

import { Loader2 } from "lucide-react";

export default function AppLoadingState({
  label = "Cargando…",
  minHeight = "320px",
}: {
  label?: string;
  minHeight?: number | string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--fg-4)",
      }}
    >
      <Loader2 size={22} className="animate-spin" style={{ color: "var(--brand)" }} />
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}
