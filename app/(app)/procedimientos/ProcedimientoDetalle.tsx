"use client";

import { useEffect, useState } from "react";
import { Pencil, Loader2, Info, Camera } from "lucide-react";
import { getProcedimiento } from "@/lib/procedimientos-api";
import type { Procedimiento, ProcedimientoPaso } from "@/types/procedimientos";


export default function ProcedimientoDetalle({
  id, isAdmin, onEdit,
}: {
  id: string;
  isAdmin: boolean;
  onEdit: () => void;
}) {
  const [proc, setProc] = useState<Procedimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getProcedimiento(id)
      .then(setProc)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id]);


  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "var(--fg-4)" }} />
      </div>
    );
  }

  if (!proc) {
    return (
      <div style={{ padding: 32, color: "var(--danger)", fontSize: 13 }}>
        {error ?? "No se pudo cargar el procedimiento."}
      </div>
    );
  }

  const pasos = proc.pasos ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)",
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>{proc.nombre}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
            {proc.categoria && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", background: "var(--brand-tint)", borderRadius: 4, padding: "2px 6px" }}>
                {proc.categoria}
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--fg-4)" }}>
              {pasos.length} {pasos.length === 1 ? "campo" : "campos"}
            </span>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={onEdit}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              height: 40, padding: "0 15px", flexShrink: 0,
              background: "var(--brand)", border: "1px solid var(--brand)", borderRadius: "var(--r-sm)",
              cursor: "pointer", color: "var(--fg-on-brand)", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
            }}
          >
            <Pencil size={13} />
            Editar
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 24px", background: "var(--surface-canvas)" }}>
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>

          {proc.descripcion && (
            <div style={{ background: "var(--surface-1)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)", padding: "14px 18px" }}>
              <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.6 }}>{proc.descripcion}</div>
            </div>
          )}

          {/* Campos: se previsualizan como los verá el técnico, deshabilitados.
              Para cambiar cualquier cosa hay que entrar a "Editar". */}
          {pasos.length === 0 ? (
            <div style={{
              background: "var(--surface-1)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)",
              padding: "28px 18px", textAlign: "center", color: "var(--fg-4)", fontSize: 13,
            }}>
              Sin campos definidos
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pasos.map(paso => <CampoPreview key={paso.id} paso={paso} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Un campo tal como lo verá el técnico, en solo lectura. */
function CampoPreview({ paso }: { paso: ProcedimientoPaso }) {
  const isInfoOnly = paso.tipo === "instruccion" || paso.tipo === "advertencia" || paso.tipo === "seccion";

  const control = (() => {
    if (isInfoOnly) return null;

    if (paso.tipo === "si_no_na") {
      return (
        <div style={{ display: "flex", gap: 6 }}>
          {["Sí", "No", "N/A"].map(o => (
            <span key={o} style={{ ...fieldBox, padding: "6px 14px", fontSize: 12.5 }}>{o}</span>
          ))}
        </div>
      );
    }

    if (paso.tipo === "opcion_multiple" || paso.tipo === "lista_verificacion" || paso.tipo === "inspeccion") {
      const opts = (paso.opciones ?? []).filter(Boolean);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(opts.length ? opts : ["Opción 1", "Opción 2"]).map((o, i) => (
            <label key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--fg-3)" }}>
              <input
                type={paso.tipo === "opcion_multiple" ? "radio" : "checkbox"}
                disabled
                style={{ width: 15, height: 15, accentColor: "var(--brand)" }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }

    if (paso.tipo === "firma") {
      return (
        <div style={{ ...fieldBox, height: 72, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5 }}>
          Espacio para la firma
        </div>
      );
    }

    if (paso.tipo === "imagen" || paso.tipo === "archivo") {
      return (
        <div style={{ ...fieldBox, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          {paso.tipo === "imagen" ? <Camera size={14} /> : <Info size={14} />}
          {paso.tipo === "imagen" ? "Se adjuntará una foto" : "Se adjuntará un archivo"}
        </div>
      );
    }

    if (paso.tipo === "texto") {
      return <div style={{ ...fieldBox, minHeight: paso.multilinea ? 62 : 38 }}>El texto se ingresará aquí</div>;
    }

    const hint =
      paso.tipo === "numero"  ? (paso.unidad ? `Valor en ${paso.unidad}` : "Valor numérico") :
      paso.tipo === "monto"   ? `Monto en ${paso.moneda || "CLP"}` :
      paso.tipo === "medidor" ? (paso.unidad ? `Lectura en ${paso.unidad}` : "Lectura del medidor") :
      paso.tipo === "fecha"   ? "dd-mm-aaaa" :
      paso.tipo === "hora"    ? "--:--" :
      paso.tipo === "fecha_hora" ? "dd-mm-aaaa --:--" :
      "Respuesta del técnico";
    return <div style={fieldBox}>{hint}</div>;
  })();

  return (
    <div style={{
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: "var(--r-lg)", padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: control ? 9 : 0 }}>
        <span style={{
          fontSize: 13.5, fontWeight: isInfoOnly ? 400 : 600,
          color: isInfoOnly ? "var(--fg-2)" : "var(--fg-1)",
          fontStyle: isInfoOnly ? "italic" : "normal", lineHeight: 1.4,
        }}>
          {paso.titulo}
        </span>
        {paso.requerido && !isInfoOnly && <span style={{ fontSize: 12, color: "var(--danger)" }}>*</span>}
      </div>
      {paso.descripcion && (
        <div style={{ fontSize: 12.5, color: "var(--fg-3)", lineHeight: 1.5, marginBottom: control ? 9 : 0 }}>
          {paso.descripcion}
        </div>
      )}
      {control}
    </div>
  );
}

const fieldBox: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  background: "var(--surface-0)", padding: "10px 12px",
  fontSize: 13, color: "var(--fg-4)",
};

