"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, ReceiptText } from "lucide-react";
import { formatearCLP } from "@/lib/tributario";
import { nombreDte, type TipoDte, type EstadoDocumento } from "@/lib/dte/tipos";

/**
 * Documentos tributarios (facturas / boletas) emitidos ante el SII.
 *
 * Distinto de InvoicesPanel, que lista los COBROS de Flow: un cobro es el
 * movimiento de dinero, un documento tributario es la factura. Normalmente hay
 * uno por cada uno, pero un cobro puede estar pagado y su factura todavía
 * pendiente de emisión, así que se muestran por separado.
 */
interface DocumentoRow {
  id: string;
  tipo_dte: TipoDte;
  folio: number | null;
  periodo_inicio: string;
  periodo_fin: string;
  neto_clp: number;
  iva_clp: number;
  total_clp: number;
  usuarios_facturados: number;
  estado: EstadoDocumento;
  emitido_at: string | null;
}

interface DocumentosResponse {
  data: DocumentoRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  error?: string;
}

// timeZone UTC a propósito: los períodos se guardan como día calendario, no
// como instante. Formatearlos en hora de Chile (UTC−4) los corre al día
// anterior — ver el mismo comentario en page.tsx.
const fecha = (valor: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${valor.slice(0, 10)}T00:00:00Z`));

export function DocumentosPanel() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DocumentosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/suscripcion/documentos?page=${nextPage}`, { cache: "no-store" });
      const json = await response.json() as DocumentosResponse;
      if (!response.ok) throw new Error(json.error || "No se pudieron cargar los documentos tributarios.");
      setResult(json);
      setPage(json.page);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  const documentos = result?.data ?? [];

  return (
    <div>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ padding: "16px 18px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
          <p style={{ margin: 0, color: "var(--fg-1)", fontSize: 14, lineHeight: 1.55 }}>
            Documentos tributarios emitidos ante el SII por tu suscripción.
          </p>
          <p style={{ margin: "6px 0 0", color: "var(--fg-3)", fontSize: 14, lineHeight: 1.5 }}>
            Cada período pagado genera una factura electrónica afecta a IVA, que enviamos
            al email de cobros. El monto total incluye IVA; la columna de desglose muestra
            el neto y el impuesto tal como aparecen en el documento.
          </p>
        </div>

        {error ? (
          <div role="alert" style={{ padding: "12px 14px", border: "1px solid var(--danger)", borderRadius: "var(--r-md)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 14 }}>
            {error}
          </div>
        ) : null}

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--surface-1)" }}>
          {loading && !result ? (
            <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: "var(--fg-3)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : documentos.length === 0 ? (
            <div style={{ minHeight: 280, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <ReceiptText size={42} style={{ color: "var(--fg-4)", marginBottom: 14 }} />
              <p style={{ margin: 0, color: "var(--fg-1)", fontSize: 14, fontWeight: 400 }}>Aún no hay documentos tributarios</p>
              <p style={{ margin: "6px 0 0", maxWidth: 390, color: "var(--fg-3)", fontSize: 14, lineHeight: 1.5 }}>
                Se generan cuando pagas el primer período de tu suscripción.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820, color: "var(--fg-1)", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {["Período", "Tipo", "Folio", "Desglose", "Total", "Estado"].map(heading => (
                      <th key={heading} style={{ height: 46, padding: "0 16px", textAlign: "left", fontWeight: 400, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {documentos.map((documento, index) => {
                    const last = index === documentos.length - 1;
                    return (
                      <tr key={documento.id}>
                        <td style={cell(last)}>
                          {fecha(documento.periodo_inicio)} – {fecha(documento.periodo_fin)}
                        </td>
                        <td style={cell(last)}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                            <FileText size={15} color="var(--brand)" /> {nombreDte(documento.tipo_dte)}
                          </span>
                        </td>
                        <td style={{ ...cell(last), fontVariantNumeric: "tabular-nums" }}>
                          {documento.folio ?? <span style={{ color: "var(--fg-4)" }}>—</span>}
                        </td>
                        <td style={{ ...cell(last), fontVariantNumeric: "tabular-nums", color: "var(--fg-3)", fontSize: 14 }}>
                          neto {formatearCLP(documento.neto_clp)} + IVA {formatearCLP(documento.iva_clp)}
                        </td>
                        <td style={{ ...cell(last), fontVariantNumeric: "tabular-nums", fontWeight: 400 }}>
                          {formatearCLP(documento.total_clp)}
                        </td>
                        <td style={cell(last)}><Estado estado={documento.estado} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {result && result.total > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: "var(--fg-3)", fontSize: 14 }}>
            <span>{result.total} {result.total === 1 ? "documento" : "documentos"}</span>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)" }}>
              <PageButton label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}><ChevronLeft size={16} /></PageButton>
              <span style={{ minWidth: 48, height: 34, display: "grid", placeItems: "center", borderInline: "1px solid var(--border)", color: "var(--fg-1)", fontWeight: 400 }}>{page}</span>
              <PageButton label="Página siguiente" disabled={page >= result.totalPages || loading} onClick={() => setPage(current => current + 1)}><ChevronRight size={16} /></PageButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Estado({ estado }: { estado: EstadoDocumento }) {
  const config =
    estado === "emitido"  ? { label: "Emitido",   background: "var(--success-bg)", color: "var(--st-done-fg)" } :
    estado === "anulado"  ? { label: "Anulado",   background: "var(--surface-2)",  color: "var(--fg-3)" } :
    estado === "error"    ? { label: "Con error", background: "var(--danger-bg)",  color: "var(--danger)" } :
                            { label: "Pendiente", background: "var(--warning-bg)", color: "var(--warning)" };
  return <span style={{ display: "inline-flex", borderRadius: 999, padding: "3px 9px", fontSize: 14, fontWeight: 400, background: config.background, color: config.color }}>{config.label}</span>;
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} style={{ width: 38, height: 34, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "var(--fg-1)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}>{children}</button>;
}

function cell(last: boolean): React.CSSProperties {
  return { height: 52, padding: "8px 16px", borderBottom: last ? 0 : "1px solid var(--border)", whiteSpace: "nowrap" };
}
