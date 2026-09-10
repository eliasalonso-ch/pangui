"use client";

import { Plus, X } from "lucide-react";
import type { OrdenCompraCosto } from "@/types/ordenes-compra";

/**
 * Costos del documento aparte de las líneas: flete, despacho, instalación.
 *
 * Cada fila puede ser un monto fijo o un porcentaje del subtotal, y puede ser
 * afecta o exenta de IVA.
 *
 * EL IVA NO SE EDITA ACÁ. Se calcula solo, 19%, y se muestra en el desglose.
 * La referencia que se miró (MaintainX) deja escribir el IVA como una fila
 * libre con toggle $/%, y en la prueba real quedó en "$": escribir 19 sumó $19
 * en vez del 19%. Un documento así no cuadra contra la factura del proveedor.
 */
export default function CostosPicker({
  value, onChange,
}: {
  value: OrdenCompraCosto[];
  onChange: (c: OrdenCompraCosto[]) => void;
}) {
  function set(i: number, patch: Partial<OrdenCompraCosto>) {
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{
          border: "1px solid var(--border)", borderRadius: "var(--r-md)",
          overflow: "hidden", marginBottom: 8,
        }}>
          {value.map((c, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}>
              <input
                value={c.nombre}
                onChange={e => set(i, { nombre: e.target.value })}
                placeholder="Flete, despacho…"
                style={{ ...campo, flex: 1, minWidth: 0 }}
                aria-label="Nombre del costo"
              />

              <input
                type="number" min={0} step="any"
                value={c.valor}
                onChange={e => set(i, { valor: Math.max(Number(e.target.value) || 0, 0) })}
                style={{ ...campo, width: 90 }}
                aria-label="Valor"
              />

              {/* Monto o porcentaje. El porcentaje se resuelve contra el
                  subtotal de líneas al calcular los totales. */}
              <div style={{ display: "flex", flexShrink: 0 }}>
                {(["monto", "porcentaje"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set(i, { tipo: t })}
                    aria-pressed={c.tipo === t}
                    style={{
                      width: 32, height: 32, fontSize: 14, cursor: "pointer",
                      border: "1px solid var(--border)",
                      borderRadius: t === "monto" ? "var(--r-sm) 0 0 var(--r-sm)" : "0 var(--r-sm) var(--r-sm) 0",
                      marginLeft: t === "porcentaje" ? -1 : 0,
                      background: c.tipo === t ? "var(--brand)" : "var(--surface-1)",
                      color: c.tipo === t ? "#fff" : "var(--fg-3)",
                    }}
                  >
                    {t === "monto" ? "$" : "%"}
                  </button>
                ))}
              </div>

              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 14, color: "var(--fg-3)", flexShrink: 0, cursor: "pointer",
              }}>
                <input
                  type="checkbox"
                  checked={c.afecto !== false}
                  onChange={e => set(i, { afecto: e.target.checked })}
                />
                IVA
              </label>

              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label="Quitar costo"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 4 }}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, { nombre: "", valor: 0, tipo: "monto", afecto: true }])}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--brand)", fontSize: 14, padding: 4, fontFamily: "inherit",
        }}
      >
        <Plus size={16} /> Añadir costo
      </button>
    </div>
  );
}

const campo: React.CSSProperties = {
  height: 32, padding: "0 8px", fontSize: 14,
  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  background: "var(--surface-1)", color: "var(--fg-1)",
  outline: "none", fontFamily: "inherit",
};
