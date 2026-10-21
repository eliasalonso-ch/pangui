"use client";

/**
 * Metas de los KPI de UN gráfico (se abre desde su engranaje). Owner/admin,
 * plan Empresa. Una meta por KPI para todo el workspace, como MaintainX.
 *
 * Dejar un KPI vacío lo borra: vuelve a usarse la meta de referencia.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  KPI_META, borrarObjetivoKpi, guardarObjetivoKpi, referenciaPara, validarObjetivo,
  type KpiObjetivo, type ObjetivoKpi,
} from "@/lib/objetivos-kpi";

type Campo = "bueno" | "alerta" | "malo";
type Fila = Record<Campo, string>;

const input: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 10px", boxSizing: "border-box",
  border: "1px solid var(--border)", borderRadius: "var(--r-sm)", outline: "none",
  background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit",
};

const CAMPO_COLOR: Record<Campo, string> = { bueno: "var(--success)", alerta: "var(--warning)", malo: "var(--danger)" };

/** "Bueno si es ≥", "En riesgo bajo", … según la dirección del KPI. */
function rotulo(campo: Campo, menosEsMejor: boolean) {
  if (campo === "bueno") return menosEsMejor ? "Bueno si es ≤" : "Bueno si es ≥";
  if (campo === "malo") return menosEsMejor ? "Malo si es ≥" : "Malo si es ≤";
  return menosEsMejor ? "En riesgo sobre (opcional)" : "En riesgo bajo (opcional)";
}

const num = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));

export default function ObjetivosKpiDialog({ kpis, workspaceId, objetivos, onClose }: {
  /** Los KPI del gráfico (MTBF y MTTR van juntos). */
  kpis: KpiObjetivo[];
  workspaceId: string;
  objetivos: ObjetivoKpi[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [filas, setFilas] = useState<Partial<Record<KpiObjetivo, Fila>>>(() =>
    Object.fromEntries(kpis.map(k => {
      const o = objetivos.find(x => x.kpi === k);
      return [k, { bueno: o ? String(o.bueno) : "", alerta: o?.alerta != null ? String(o.alerta) : "", malo: o ? String(o.malo) : "" }];
    })));
  const [errores, setErrores] = useState<Partial<Record<KpiObjetivo, string>>>({});
  const [guardando, setGuardando] = useState(false);
  const [errGeneral, setErrGeneral] = useState<string | null>(null);

  const editar = (k: KpiObjetivo, campo: Campo, v: string) =>
    setFilas(f => ({ ...f, [k]: { ...f[k]!, [campo]: v } }));

  async function guardar() {
    setErrGeneral(null);
    const nuevosErrores: Partial<Record<KpiObjetivo, string>> = {};
    const ops: (() => Promise<void>)[] = [];
    for (const k of kpis) {
      const f = filas[k]!;
      const existente = objetivos.find(x => x.kpi === k);
      if (f.bueno.trim() === "" && f.malo.trim() === "" && f.alerta.trim() === "") {
        // Vacío = sin meta propia: vuelve la de referencia.
        if (existente?.id) ops.push(() => borrarObjetivoKpi(existente.id!));
        continue;
      }
      const bueno = num(f.bueno);
      const malo = num(f.malo);
      const alerta = f.alerta.trim() === "" ? null : num(f.alerta);
      const e = validarObjetivo(k, bueno, malo, alerta);
      if (e) { nuevosErrores[k] = e; continue; }
      if (existente && existente.bueno === bueno && existente.malo === malo && existente.alerta === alerta) continue;
      ops.push(() => guardarObjetivoKpi(workspaceId, { kpi: k, bueno, alerta, malo }));
    }
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;
    setGuardando(true);
    try {
      for (const op of ops) await op();
      await qc.invalidateQueries({ queryKey: ["objetivos-kpi", workspaceId] });
      onClose();
    } catch (e) {
      setErrGeneral(e instanceof Error ? e.message : "No se pudieron guardar las metas.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !guardando) onClose(); }}
    >
      <div style={{ width: "100%", maxWidth: 640, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-lg)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>Metas</h2>
          <button type="button" onClick={onClose} disabled={guardando} aria-label="Cerrar"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "16px 20px 4px", display: "grid", gap: 18 }}>
          {kpis.map(k => {
            const m = KPI_META[k];
            const fila = filas[k]!;
            const ref = referenciaPara(k);
            return (
              <div key={k}>
                <div style={{ fontSize: 14, color: "var(--fg-1)", marginBottom: 4 }}>
                  {m.label} <span style={{ color: "var(--fg-4)" }}>({m.unidad}) · {m.menosEsMejor ? "menos es mejor" : "más es mejor"}</span>
                </div>
                {/* Referencia de la industria, con un clic para usarla. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 14, color: "var(--fg-4)", flexWrap: "wrap" }}>
                  <span>Referencia de la industria: {ref.bueno} / {ref.alerta} / {ref.malo} {m.unidad}</span>
                  <button type="button" disabled={guardando}
                    onClick={() => setFilas(f => ({ ...f, [k]: { bueno: String(ref.bueno), alerta: String(ref.alerta), malo: String(ref.malo) } }))}
                    style={{ border: "none", background: "none", padding: 0, color: "var(--brand)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
                    Usar
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {(["bueno", "alerta", "malo"] as const).map(campo => (
                    <label key={campo} style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 14, color: CAMPO_COLOR[campo] }}>{rotulo(campo, m.menosEsMejor)}</span>
                      <input type="text" inputMode="decimal" value={fila[campo]} disabled={guardando}
                        placeholder={campo === "alerta" ? "Opcional" : String(ref[campo])}
                        onChange={e => editar(k, campo, e.target.value)} style={input}
                        onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }} />
                    </label>
                  ))}
                </div>
                {errores[k] && <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--danger)" }}>{errores[k]}</p>}
              </div>
            );
          })}
        </div>

        {errGeneral && <p style={{ margin: "8px 20px 0", fontSize: 14, color: "var(--danger)" }}>{errGeneral}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "16px 20px 18px" }}>
          <button type="button" onClick={onClose} disabled={guardando}
            style={{ height: 38, padding: "0 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", fontSize: 14, fontFamily: "inherit", cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={() => void guardar()} disabled={guardando}
            style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, fontFamily: "inherit", cursor: guardando ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
