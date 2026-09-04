"use client";

import { Loader2 } from "lucide-react";

/**
 * Armazón de los paneles de creación/edición de catálogos (Categorías, ITOs).
 *
 * Replica el panel "Nueva Orden de Trabajo" (`app/(app)/ordenes/OTCrearPanel.tsx`):
 * encabezado de 64px sobre el lienzo, cuerpo desplazable con aire abajo, y una
 * barra de acciones fija al pie con "Cancelar" y el botón principal en degradado.
 * Se comparte para que los dos catálogos no se desincronicen del original.
 */

/** Etiqueta arriba y control abajo — el `FieldRow` del panel de Órdenes. */
export function FieldRow({ label, children }: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Input de título: grande, sin caja, subrayado que se tiñe de marca al escribir.
 * Mismo tratamiento que "¿Qué trabajo se debe realizar?".
 */
export function tituloInputStyle(valor: string): React.CSSProperties {
  return {
    width: "100%", fontSize: 14, fontWeight: 400,
    color: "var(--fg-1)", border: "none", outline: "none",
    background: "transparent", padding: "8px 0",
    borderBottom: "2px solid " + (valor ? "var(--brand)" : "var(--border)"),
    fontFamily: "inherit", transition: "border-color 0.15s",
  };
}

export function PanelCatalogo({
  titulo, guardando, puedeGuardar, error, textoGuardar, onCancel, onSubmit, children,
}: {
  titulo: string;
  guardando: boolean;
  puedeGuardar: boolean;
  error?: string | null;
  textoGuardar: string;
  onCancel: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>

      {/* Encabezado */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          {titulo}
        </h2>
      </div>

      {/* Cuerpo desplazable */}
      <form
        onSubmit={e => { e.preventDefault(); if (puedeGuardar && !guardando) onSubmit(); }}
        style={{ flex: 1, overflowY: "auto", minHeight: 0 }}
      >
        <div style={{ padding: "28px 28px 60px", maxWidth: 1180 }}>
          {children}
        </div>
      </form>

      {/* Barra de acciones fija */}
      <div style={{
        borderTop: "1px solid var(--border)", padding: "16px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--surface-1)", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          {error && <span style={{ fontSize: 14, color: "var(--danger)" }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={guardando}
            style={{
              height: 40, padding: "0 18px",
              border: "1px solid var(--border)", borderRadius: 8,
              background: "var(--surface-1)", color: "var(--fg-2)",
              fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!puedeGuardar || guardando}
            style={{
              height: 40, padding: "0 24px",
              border: "none", borderRadius: 8,
              background: guardando || !puedeGuardar
                ? "var(--fg-3)"
                : "linear-gradient(135deg, var(--brand-active), var(--brand))",
              color: "var(--fg-on-brand)",
              fontSize: 14, fontWeight: 400,
              cursor: guardando || !puedeGuardar ? "default" : "pointer",
              display: "flex", alignItems: "center", gap: 7,
              transition: "opacity 0.15s", fontFamily: "inherit",
              boxShadow: guardando || !puedeGuardar ? "none" : "0 2px 6px rgba(37,99,235,0.25)",
            }}
          >
            {guardando && <Loader2 size={13} className="animate-spin" />}
            {textoGuardar}
          </button>
        </div>
      </div>
    </div>
  );
}
