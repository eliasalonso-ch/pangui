"use client";

/**
 * "Revisar MeConecta" — Electrilam-exclusive reconciliation button for /ordenes.
 *
 * Compares what is pending on the MeConecta (UdeC) portal against the OTs in
 * this workspace, matching on the folio stored in `n_serie` (SF9…), so no
 * solicitud is ever silently missed. The heavy lifting lives server-side in
 * /api/meconecta/check; this is the trigger + the result panel.
 *
 * Spam control is deliberately two-layered: a 5s client cooldown for immediate
 * feedback, and the same cooldown enforced server-side (a reload resets React
 * state but not the server's clock, and the portal is someone else's server).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Loader2, Check, AlertTriangle, ExternalLink, X, ChevronDown } from "lucide-react";

const COOLDOWN_MS = 5_000;

type PeriodoKey = "todo" | "7d" | "30d" | "mes" | "custom";

const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: "todo",   label: "Todo" },
  { key: "7d",     label: "Últimos 7 días" },
  { key: "30d",    label: "Últimos 30 días" },
  { key: "mes",    label: "Este mes" },
  { key: "custom", label: "Personalizado…" },
];

/**
 * Local date key ("YYYY-MM-DD"). Built from the local calendar fields rather
 * than toISOString(), which would shift to UTC and silently pick the wrong day
 * for Chile in the evening.
 */
function dateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Resolves a preset to the { desde, hasta } window the API expects. */
function rangoDe(periodo: PeriodoKey, customDesde: string, customHasta: string): { desde: string | null; hasta: string | null } {
  const hoy = new Date();
  switch (periodo) {
    case "7d": {
      const d = new Date(hoy); d.setDate(d.getDate() - 6);
      return { desde: dateKey(d), hasta: dateKey(hoy) };
    }
    case "30d": {
      const d = new Date(hoy); d.setDate(d.getDate() - 29);
      return { desde: dateKey(d), hasta: dateKey(hoy) };
    }
    case "mes":
      return { desde: dateKey(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: dateKey(hoy) };
    case "custom":
      return { desde: customDesde || null, hasta: customHasta || null };
    default:
      return { desde: null, hasta: null };
  }
}

interface Faltante {
  folio: string;
  idExterno: number;
  fecha: string | null;
  estado: string;
  url: string;
}

interface Huerfana {
  id: string;
  folio: string;
  numero: number | null;
  titulo: string;
  estado: string;
}

interface CheckResult {
  ok: true;
  checkedAt: string;
  desde: string | null;
  hasta: string | null;
  portalPending: number;
  portalTotal: number;
  portalInWindow: number;
  matched: number;
  faltantes: Faltante[];
  huerfanas: Huerfana[];
}

interface Props {
  /** Opens an existing OT in the bandeja (used by the "huérfanas" list). */
  onOpenOrden?: (id: string) => void;
}

export default function MeconectaCheck({ onOpenOrden }: Props) {
  const [loading, setLoading]   = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [result, setResult]     = useState<CheckResult | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [open, setOpen]         = useState(false);

  // Period selection. Defaults to "todo" so the safe answer (miss nothing) is
  // what you get without touching anything.
  const [periodo, setPeriodo]       = useState<PeriodoKey>("todo");
  const [periodoOpen, setPeriodoOpen] = useState(false);
  const [customDesde, setCustomDesde] = useState("");
  const [customHasta, setCustomHasta] = useState("");

  const periodoLabel = useMemo(() => {
    if (periodo !== "custom") return PERIODOS.find((p) => p.key === periodo)!.label;
    if (customDesde && customHasta) return `${customDesde} → ${customHasta}`;
    if (customDesde) return `Desde ${customDesde}`;
    if (customHasta) return `Hasta ${customHasta}`;
    return "Personalizado…";
  }, [periodo, customDesde, customHasta]);

  // Interval id kept in a ref so the unmount cleanup can always reach the
  // current one, even across re-renders that restart the countdown.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  const startCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (tickRef.current) clearInterval(tickRef.current);
          tickRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  const run = useCallback(async () => {
    if (loading || cooldown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/meconecta/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rangoDe(periodo, customDesde, customHasta)),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data?.error ?? "No se pudo revisar MeConecta");
        // Honour the server's own backoff when it is the one rate-limiting us.
        startCooldown(typeof data?.retryIn === "number" ? data.retryIn : COOLDOWN_MS / 1000);
        setOpen(true);
        return;
      }

      setResult(data as CheckResult);
      setOpen(true);
      startCooldown(COOLDOWN_MS / 1000);
    } catch {
      setError("Error de red al consultar MeConecta");
      setOpen(true);
      startCooldown(COOLDOWN_MS / 1000);
    } finally {
      setLoading(false);
    }
  }, [loading, cooldown, startCooldown, periodo, customDesde, customHasta]);

  const disabled = loading || cooldown > 0;
  const faltantes = result?.faltantes ?? [];
  const huerfanas = result?.huerfanas ?? [];

  return (
    // Split control: the action on the left, a hairline divider, then the
    // período selector on the right — one button-shaped unit, two targets.
    <div
      style={{
        position: "relative", flexShrink: 0,
        display: "flex", alignItems: "stretch",
        height: 38,
        border: "1px solid var(--border)", borderRadius: 8,
        background: "var(--surface-1)", overflow: "visible",
      }}
    >
      {/* Left half — runs the check. */}
      <button
        type="button"
        onClick={run}
        disabled={disabled}
        title={
          cooldown > 0
            ? `Espera ${cooldown}s para volver a revisar`
            : "Comparar las solicitudes pendientes de MeConecta con las OTs de este espacio"
        }
        aria-label="Revisar MeConecta"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "0 14px",
          background: "transparent",
          color: disabled ? "var(--fg-4)" : "var(--fg-2)",
          border: "none", borderRadius: "7px 0 0 7px",
          // Matches the search input's type: 14px / 500.
          fontSize: 14, fontWeight: 500,
          cursor: disabled ? "default" : "pointer",
          fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        {loading
          ? <Loader2 size={15} className="animate-spin" />
          : <RefreshCw size={15} />}
        {loading ? "Revisando…" : cooldown > 0 ? `Revisar MeConecta (${cooldown}s)` : "Revisar MeConecta"}
      </button>

      {/* Divider between the two halves. */}
      <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />

      {/* Right half — período selector. */}
      <div style={{ position: "relative", display: "flex" }}>
        <button
          type="button"
          onClick={() => setPeriodoOpen((v) => !v)}
          title="Período a revisar"
          aria-label={`Período: ${periodoLabel}`}
          aria-expanded={periodoOpen}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "0 10px", maxWidth: 180,
            background: "transparent", color: "var(--fg-3)",
            border: "none", borderRadius: "0 7px 7px 0",
            fontSize: 14, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{periodoLabel}</span>
          <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
        </button>

        {periodoOpen && (
          <>
            <div onClick={() => setPeriodoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
            <div
              style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 41,
                width: 230, padding: 6,
                background: "var(--surface-1)",
                border: "1px solid var(--border-strong)", borderRadius: 9,
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => {
                    setPeriodo(p.key);
                    if (p.key !== "custom") setPeriodoOpen(false);
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 7, width: "100%",
                    padding: "7px 9px", border: "none", borderRadius: 6,
                    background: periodo === p.key ? "var(--brand-tint)" : "transparent",
                    color: periodo === p.key ? "var(--brand)" : "var(--fg-2)",
                    fontSize: 12.5, fontWeight: periodo === p.key ? 700 : 500,
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                >
                  {periodo === p.key ? <Check size={12} /> : <span style={{ width: 12 }} />}
                  {p.label}
                </button>
              ))}

              {periodo === "custom" && (
                <div style={{ padding: "8px 9px 4px", borderTop: "1px solid var(--border)", marginTop: 4 }}>
                  <label style={{ display: "block", fontSize: 11, color: "var(--fg-4)", marginBottom: 3 }}>Desde</label>
                  <input
                    type="date"
                    value={customDesde}
                    max={customHasta || undefined}
                    onChange={(e) => setCustomDesde(e.target.value)}
                    style={{
                      width: "100%", height: 30, marginBottom: 8, padding: "0 8px",
                      border: "1px solid var(--border)", borderRadius: 6,
                      background: "var(--surface-1)", color: "var(--fg-1)",
                      fontSize: 12, fontFamily: "inherit",
                    }}
                  />
                  <label style={{ display: "block", fontSize: 11, color: "var(--fg-4)", marginBottom: 3 }}>Hasta</label>
                  <input
                    type="date"
                    value={customHasta}
                    min={customDesde || undefined}
                    onChange={(e) => setCustomHasta(e.target.value)}
                    style={{
                      width: "100%", height: 30, marginBottom: 8, padding: "0 8px",
                      border: "1px solid var(--border)", borderRadius: 6,
                      background: "var(--surface-1)", color: "var(--fg-1)",
                      fontSize: 12, fontFamily: "inherit",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setPeriodoOpen(false)}
                    style={{
                      width: "100%", height: 30, border: "none", borderRadius: 6,
                      background: "var(--brand)", color: "var(--fg-on-brand)",
                      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Listo
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            role="dialog"
            aria-label="Resultado de la revisión de MeConecta"
            style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 41,
              width: 420, maxHeight: 460, overflowY: "auto",
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)", borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--fg-1)", flex: 1 }}>
                Revisión MeConecta
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>

            {error && (
              <div style={{
                display: "flex", gap: 8, padding: "10px 12px",
                background: "var(--st-late-bg, #fdecec)", borderRadius: 8,
                fontSize: 12.5, color: "var(--st-late-fg, #a13030)",
              }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}

            {result && !error && (
              <>
                <div style={{ fontSize: 12, color: "var(--fg-3)", marginBottom: 4 }}>
                  {result.portalPending} pendientes en MeConecta · {result.matched} con OT ·{" "}
                  <strong style={{ color: faltantes.length ? "var(--st-late-fg, #a13030)" : "var(--fg-3)" }}>
                    {faltantes.length} sin OT
                  </strong>
                </div>
                <div style={{ fontSize: 11, color: "var(--fg-4)", marginBottom: 12 }}>
                  {result.desde || result.hasta
                    ? `Período: ${result.desde ?? "inicio"} → ${result.hasta ?? "hoy"} · ${result.portalInWindow} de ${result.portalTotal} solicitudes`
                    : `Todas las solicitudes (${result.portalTotal})`}
                </div>

                {faltantes.length === 0 && huerfanas.length === 0 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "12px", background: "var(--st-done-bg, #eaf6ed)",
                    borderRadius: 8, fontSize: 13, color: "var(--st-done-fg, #2b6b3f)",
                  }}>
                    <Check size={15} />
                    Todo al día — no falta ninguna solicitud.
                  </div>
                )}

                {faltantes.length > 0 && (
                  <div style={{ marginBottom: huerfanas.length ? 14 : 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", marginBottom: 6 }}>
                      Sin OT en Pangui ({faltantes.length})
                    </div>
                    {faltantes.map((f) => (
                      <a
                        key={f.idExterno}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 10px", marginBottom: 4,
                          border: "1px solid var(--border)", borderRadius: 7,
                          textDecoration: "none", color: "inherit",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)" }}>{f.folio}</div>
                          <div style={{ fontSize: 11, color: "var(--fg-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {[f.estado, f.fecha].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <ExternalLink size={12} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                )}

                {huerfanas.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", marginBottom: 2 }}>
                      Abiertas aquí, ya no pendientes allá ({huerfanas.length})
                    </div>
                    <div style={{ fontSize: 11, color: "var(--fg-4)", marginBottom: 6 }}>
                      Revisa si corresponde cerrarlas.
                    </div>
                    {huerfanas.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => { onOpenOrden?.(h.id); setOpen(false); }}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, width: "100%",
                          padding: "8px 10px", marginBottom: 4,
                          border: "1px solid var(--border)", borderRadius: 7,
                          background: "var(--surface-1)", textAlign: "left",
                          cursor: onOpenOrden ? "pointer" : "default", fontFamily: "inherit",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {h.numero ? `#${h.numero} · ` : ""}{h.titulo}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--fg-4)" }}>{h.folio}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
