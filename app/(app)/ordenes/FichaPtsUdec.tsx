"use client";

/**
 * Modal "Ficha PTS UdeC": las respuestas del formulario de la UdeC en su mismo
 * orden, para que Claudio copie los campos de texto y marque las opciones.
 * La lógica vive en lib/pts-udec.ts; esto solo la dibuja.
 */

import { useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { PTS_FORM_URL, type FilaPts } from "@/lib/pts-udec";

function FilaFicha({ fila }: { fila: FilaPts }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(fila.valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1200);
    } catch { /* sin permiso de portapapeles: el texto igual se puede seleccionar */ }
  };
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--fg-3)", marginBottom: 4 }}>
          {fila.pregunta}
          {fila.modo === "marcar" && <span style={{ color: "var(--fg-4)" }}> · marcar</span>}
        </div>
        {fila.falta
          ? <div style={{ fontSize: 14, color: "var(--warning, #b45309)" }}>Falta este dato</div>
          : <div style={{ fontSize: 14, color: "var(--fg-1)", whiteSpace: "pre-wrap", userSelect: "text" }}>{fila.valor}</div>}
      </div>
      {fila.modo === "copiar" && !fila.falta && (
        <button
          type="button"
          onClick={copiar}
          aria-label={`Copiar ${fila.pregunta}`}
          style={{
            flexShrink: 0, height: 32, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)",
            color: copiado ? "var(--success)" : "var(--brand-fg)", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
          }}
        >
          {copiado ? <Check size={14} /> : <Copy size={14} />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      )}
    </div>
  );
}

export default function FichaPtsUdec({ filas, onClose }: { filas: FilaPts[]; onClose: () => void }) {
  const faltan = filas.filter(f => f.falta).length;
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ficha PTS UdeC"
        onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 620, maxHeight: "90vh", display: "flex", flexDirection: "column", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-lg, 12px)", boxShadow: "var(--shadow-lg)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 14px 24px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "var(--fg-1)" }}>Ficha PTS UdeC</div>
            <div style={{ fontSize: 14, color: faltan ? "var(--warning, #b45309)" : "var(--fg-3)" }}>
              {faltan ? `${faltan} ${faltan === 1 ? "dato falta" : "datos faltan"}` : "En el orden del formulario"}
            </div>
          </div>
          <a
            href={PTS_FORM_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{ height: 34, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 7, borderRadius: "var(--r-sm)", background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, textDecoration: "none", whiteSpace: "nowrap" }}
          >
            <ExternalLink size={14} /> Abrir formulario
          </a>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", color: "var(--fg-3)" }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: "auto", padding: "0 24px 8px" }}>
          {filas.map(f => <FilaFicha key={f.pregunta} fila={f} />)}
        </div>
      </div>
    </div>
  );
}
