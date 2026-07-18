"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, ReceiptText } from "lucide-react";

interface InvoiceRow {
  id: number;
  created: string;
  subject: string;
  currency: string;
  amount: number;
  status: 0 | 1 | 2;
  period_start: string | null;
  period_end: string | null;
}

interface InvoiceResponse {
  data: InvoiceRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  error?: string;
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: currency || "CLP", maximumFractionDigits: 0 }).format(amount);

const date = (value: string) =>
  new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "Z")),
  );

export function InvoicesPanel() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<InvoiceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<number | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/suscripcion/invoices?page=${nextPage}`, { cache: "no-store" });
      const json = await response.json() as InvoiceResponse;
      if (!response.ok) throw new Error(json.error || "No se pudieron cargar los documentos.");
      setResult(json);
      setPage(json.page);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(page); }, [load, page]);

  async function download(invoice: InvoiceRow) {
    setDownloading(invoice.id);
    setError(null);
    try {
      const response = await fetch(`/api/suscripcion/invoices/${invoice.id}/download`, { cache: "no-store" });
      if (!response.ok) {
        const json = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(json?.error || "No se pudo descargar el documento.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pangui-flow-${invoice.id}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError((downloadError as Error).message);
    } finally {
      setDownloading(null);
    }
  }

  const invoices = result?.data ?? [];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 16 }}>
        <div style={{ padding: "16px 18px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
          <p style={{ margin: 0, color: "var(--fg-1)", fontSize: 14, lineHeight: 1.55 }}>
            Aquí encontrarás los cobros generados por tu suscripción mediante Flow.cl. Puedes descargar un comprobante PDF de cada período.
          </p>
          <p style={{ margin: "6px 0 0", color: "var(--fg-3)", fontSize: 12.5, lineHeight: 1.5 }}>
            Los comprobantes son informativos y no reemplazan un documento tributario electrónico (DTE).
          </p>
        </div>

        {error ? (
          <div role="alert" style={{ padding: "12px 14px", border: "1px solid var(--danger)", borderRadius: "var(--r-md)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--surface-1)" }}>
          {loading && !result ? (
            <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: "var(--fg-3)" }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div style={{ minHeight: 280, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <ReceiptText size={42} style={{ color: "var(--fg-4)", marginBottom: 14 }} />
              <p style={{ margin: 0, color: "var(--fg-1)", fontSize: 16, fontWeight: 600 }}>Aún no hay documentos</p>
              <p style={{ margin: "6px 0 0", maxWidth: 390, color: "var(--fg-3)", fontSize: 13, lineHeight: 1.5 }}>
                Los cobros aparecerán aquí cuando Flow.cl genere el primer importe de tu suscripción.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760, color: "var(--fg-1)", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--surface-2)" }}>
                    {['Fecha', 'Tipo', 'Número', 'Monto', 'Estado', ''].map((heading, index) => (
                      <th key={`${heading}-${index}`} style={{ height: 46, padding: "0 16px", textAlign: index === 5 ? "right" : "left", fontWeight: 600, borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice, index) => (
                    <tr key={invoice.id}>
                      <td style={cell(index === invoices.length - 1)}>{date(invoice.created)}</td>
                      <td style={cell(index === invoices.length - 1)}><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><FileText size={15} color="var(--brand)" /> Importe Flow</span></td>
                      <td style={{ ...cell(index === invoices.length - 1), fontVariantNumeric: "tabular-nums" }}>FL-{invoice.id}</td>
                      <td style={{ ...cell(index === invoices.length - 1), fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{money(invoice.amount, invoice.currency)}</td>
                      <td style={cell(index === invoices.length - 1)}><Status status={invoice.status} /></td>
                      <td style={{ ...cell(index === invoices.length - 1), textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() => void download(invoice)}
                          disabled={downloading === invoice.id}
                          aria-label={`Descargar documento FL-${invoice.id}`}
                          title="Descargar PDF"
                          style={{ width: 34, height: 34, display: "inline-grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", cursor: "pointer" }}
                        >
                          {downloading === invoice.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {result && result.total > 0 ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, color: "var(--fg-3)", fontSize: 12.5 }}>
            <span>{result.total} {result.total === 1 ? "documento" : "documentos"}</span>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface-1)" }}>
              <PageButton label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}><ChevronLeft size={16} /></PageButton>
              <span style={{ minWidth: 48, height: 34, display: "grid", placeItems: "center", borderInline: "1px solid var(--border)", color: "var(--fg-1)", fontWeight: 600 }}>{page}</span>
              <PageButton label="Página siguiente" disabled={page >= result.totalPages || loading} onClick={() => setPage(current => current + 1)}><ChevronRight size={16} /></PageButton>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Status({ status }: { status: 0 | 1 | 2 }) {
  const config = status === 1
    ? { label: "Pagado", background: "var(--success-bg)", color: "var(--st-done-fg)" }
    : status === 2
      ? { label: "Anulado", background: "var(--surface-2)", color: "var(--fg-3)" }
      : { label: "Pendiente", background: "var(--warning-bg)", color: "var(--warning)" };
  return <span style={{ display: "inline-flex", borderRadius: 999, padding: "3px 9px", fontSize: 12, fontWeight: 600, background: config.background, color: config.color }}>{config.label}</span>;
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} style={{ width: 38, height: 34, display: "grid", placeItems: "center", border: 0, background: "transparent", color: "var(--fg-1)", cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}>{children}</button>;
}

function cell(last: boolean): React.CSSProperties {
  return { height: 52, padding: "8px 16px", borderBottom: last ? 0 : "1px solid var(--border)", whiteSpace: "nowrap" };
}
