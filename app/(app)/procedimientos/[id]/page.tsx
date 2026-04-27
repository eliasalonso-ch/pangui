"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Loader2, Shield,
  Info, AlertTriangle, Type, Hash, DollarSign,
  CheckSquare, List, ListChecks, ClipboardCheck, Camera, PenLine,
} from "lucide-react";
import { getProcedimiento } from "@/lib/procedimientos-api";
import type { Procedimiento, TipoPasoProc } from "@/types/procedimientos";

const TIPO_META: Record<TipoPasoProc, { label: string; icon: React.ReactNode; color: string }> = {
  instruccion:        { label: "Instrucción",           icon: <Info size={13} />,          color: "#3B82F6" },
  advertencia:        { label: "Advertencia",            icon: <AlertTriangle size={13} />, color: "#F59E0B" },
  texto:              { label: "Campo de texto",         icon: <Type size={13} />,          color: "#8B5CF6" },
  numero:             { label: "Campo numérico",         icon: <Hash size={13} />,          color: "#6366F1" },
  monto:              { label: "Monto ($)",              icon: <DollarSign size={13} />,    color: "#10B981" },
  si_no_na:           { label: "Sí / No / N/A",          icon: <CheckSquare size={13} />,   color: "#14B8A6" },
  opcion_multiple:    { label: "Opción múltiple",        icon: <List size={13} />,          color: "#F97316" },
  lista_verificacion: { label: "Lista de verificación",  icon: <ListChecks size={13} />,    color: "#EF4444" },
  inspeccion:         { label: "Inspección",             icon: <ClipboardCheck size={13} />,color: "#EC4899" },
  imagen:             { label: "Imagen / foto",          icon: <Camera size={13} />,        color: "#64748B" },
  firma:              { label: "Firma",                  icon: <PenLine size={13} />,       color: "#0EA5E9" },
};

export default function ProcedimientoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [proc, setProc] = useState<Procedimiento | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProcedimiento(id)
      .then(setProc)
      .catch(() => router.push("/procedimientos"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={20} className="animate-spin" style={{ color: "#94A3B8" }} />
      </div>
    );
  }

  if (!proc) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ padding: "16px 32px", borderBottom: "1px solid #E2E8F0", background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => router.push("/procedimientos")}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: 6, cursor: "pointer", color: "#64748B" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "#0F172A", margin: 0 }}>{proc.nombre}</h1>
            {proc.categoria && (
              <span style={{ fontSize: 11, fontWeight: 600, color: "#2563EB", background: "#EFF6FF", borderRadius: 4, padding: "2px 6px", marginTop: 3, display: "inline-block" }}>
                {proc.categoria}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => router.push(`/procedimientos/${proc.id}/editar`)}
          style={{
            display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px",
            border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff",
            cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#475569", fontFamily: "inherit",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
        >
          <Pencil size={13} />
          Editar
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>

          {proc.descripcion && (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: "16px 20px" }}>
              <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{proc.descripcion}</div>
            </div>
          )}

          {proc.bloquea_cierre_ot && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
              <Shield size={14} style={{ color: "#F59E0B", flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: "#92400E", fontWeight: 500 }}>
                Este procedimiento bloquea el cierre de la OT hasta ser completado.
              </span>
            </div>
          )}

          {/* Fields */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E2E8F0", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
              {(proc.pasos ?? []).length} campo{(proc.pasos ?? []).length !== 1 ? "s" : ""}
            </div>
            {(proc.pasos ?? []).length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                Sin campos definidos
              </div>
            ) : (
              <div>
                {(proc.pasos ?? []).map((paso, idx) => {
                  const meta = TIPO_META[paso.tipo];
                  return (
                    <div
                      key={paso.id}
                      style={{ padding: "14px 20px", borderBottom: idx < (proc.pasos?.length ?? 0) - 1 ? "1px solid #F1F5F9" : "none" }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{
                          width: 28, height: 28, borderRadius: 6,
                          background: meta.color + "15", color: meta.color,
                          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                        }}>
                          {meta.icon}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{idx + 1}.</span>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: "#0F172A" }}>{paso.titulo}</span>
                            <span style={{ fontSize: 10.5, color: meta.color, background: meta.color + "15", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>
                              {meta.label}
                            </span>
                            {!paso.requerido && paso.tipo !== "instruccion" && paso.tipo !== "advertencia" && (
                              <span style={{ fontSize: 10.5, color: "#94A3B8", background: "#F1F5F9", borderRadius: 4, padding: "1px 5px" }}>
                                Opcional
                              </span>
                            )}
                          </div>
                          {paso.descripcion && (
                            <div style={{ fontSize: 12.5, color: "#64748B", lineHeight: 1.5 }}>{paso.descripcion}</div>
                          )}
                          {paso.tipo === "numero" && (paso.unidad || paso.valor_min != null) && (
                            <div style={{ fontSize: 12, color: "#6366F1", marginTop: 4, display: "flex", gap: 12 }}>
                              {paso.unidad && <span>Unidad: {paso.unidad}</span>}
                              {paso.valor_min != null && <span>Mín: {paso.valor_min}</span>}
                              {paso.valor_max != null && <span>Máx: {paso.valor_max}</span>}
                            </div>
                          )}
                          {paso.tipo === "monto" && paso.moneda && (
                            <div style={{ fontSize: 12, color: "#10B981", marginTop: 4 }}>Moneda: {paso.moneda}</div>
                          )}
                          {(paso.tipo === "opcion_multiple" || paso.tipo === "lista_verificacion" || paso.tipo === "inspeccion") && paso.opciones && paso.opciones.length > 0 && (
                            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {paso.opciones.map((op, i) => (
                                <span key={i} style={{ fontSize: 11.5, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 4, padding: "2px 7px", color: "#475569" }}>
                                  {op}
                                </span>
                              ))}
                            </div>
                          )}
                          {paso.tipo === "texto" && paso.multilinea && (
                            <div style={{ fontSize: 11.5, color: "#94A3B8", marginTop: 4 }}>Multilínea</div>
                          )}
                          {paso.tipo === "firma" && paso.rol_firmante && (
                            <div style={{ fontSize: 12, color: "#0EA5E9", marginTop: 4 }}>Firmante: {paso.rol_firmante}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
