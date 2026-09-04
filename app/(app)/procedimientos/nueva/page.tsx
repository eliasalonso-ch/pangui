"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import ProcedimientoBuilder from "../ProcedimientoBuilder";

/**
 * Paso 1: nombre y descripción en un diálogo, antes de abrir el constructor.
 *
 * Antes se caía directo en un formulario largo con el campo de nombre perdido
 * entre metadatos. Pedir primero lo mínimo —y solo eso— deja claro qué se está
 * creando y evita procedimientos "Sin título" a medio armar.
 */
export default function NuevaProcedimientoPage() {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  if (started) {
    return <ProcedimientoBuilder initialNombre={nombre.trim()} initialDescripcion={descripcion.trim()} />;
  }

  const canContinue = nombre.trim().length > 0;

  return (
    <div style={{
      height: "100%", background: "var(--surface-canvas)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        width: "100%", maxWidth: 560, background: "var(--surface-1)",
        border: "1px solid var(--border)", borderRadius: 14,
        boxShadow: "var(--shadow-lg)", padding: "28px 32px 24px",
      }}>
        <h1 style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>
          Da vida a tu nuevo procedimiento
        </h1>

        <div style={{ display: "flex", justifyContent: "center", padding: "26px 0 22px" }}>
          <span style={{
            width: 108, height: 108, borderRadius: "50%",
            background: "var(--brand-tint)", color: "var(--brand)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ClipboardCheck size={44} strokeWidth={1.4} />
          </span>
        </div>

        <label style={labelStyle} htmlFor="proc-nombre">
          Ponle un nombre <span style={{ color: "var(--fg-4)", fontWeight: 400 }}>(Necesario)</span>
        </label>
        <input
          id="proc-nombre"
          autoFocus
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && canContinue) setStarted(true); }}
          placeholder="Nombre del procedimiento"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 18 }} htmlFor="proc-desc">Añade una descripción</label>
        <textarea
          id="proc-desc"
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Qué hay que hacer"
          rows={4}
          style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "vertical", lineHeight: 1.5 }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 26 }}>
          <button
            onClick={() => router.push("/procedimientos")}
            style={{
              height: 38, padding: "0 16px", border: "none", background: "none",
              color: "var(--brand)", fontSize: 14, fontWeight: 400,
              cursor: "pointer", fontFamily: "inherit", borderRadius: 8,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => setStarted(true)}
            disabled={!canContinue}
            style={{
              height: 38, padding: "0 20px", border: "none", borderRadius: 8,
              background: canContinue ? "var(--brand)" : "var(--surface-hover)",
              color: canContinue ? "var(--fg-on-brand)" : "var(--fg-4)",
              fontSize: 14, fontWeight: 400,
              cursor: canContinue ? "pointer" : "default", fontFamily: "inherit",
            }}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 14, fontWeight: 400,
  color: "var(--fg-1)", marginBottom: 7,
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px", boxSizing: "border-box",
  border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--surface-0)", color: "var(--fg-1)",
  fontSize: 14, fontFamily: "inherit", outline: "none",
};
