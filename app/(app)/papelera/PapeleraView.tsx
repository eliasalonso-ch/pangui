"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { fetchTrashedOrdenes, restoreOrden, purgeOrden } from "@/lib/ordenes-api";
import type { OrdenListItem } from "@/types/ordenes";

function deletedAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "hace un momento";
  if (diff < 60) return `hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

export default function PapeleraView({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<OrdenListItem[] | null>(null);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<OrdenListItem | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const data = await fetchTrashedOrdenes(workspaceId);
      setItems(data);
    } catch {
      setError(true);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (id: string) => {
    setBusyId(id);
    try {
      await restoreOrden(id);
      setItems((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (id: string) => {
    setBusyId(id);
    try {
      await purgeOrden(id);
      setItems((prev) => (prev ? prev.filter((o) => o.id !== id) : prev));
      setConfirmPurge(null);
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ padding: "24px 28px", maxWidth: 880, margin: "0 auto" }}>
      <header style={{ marginBottom: 8 }}>
        <h1 style={{ fontSize: "var(--fs-xl)", fontWeight: 700, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 10 }}>
          <Trash2 size={22} /> Papelera
        </h1>
        <p style={{ fontSize: "var(--fs-sm)", color: "var(--fg-3)", marginTop: 4 }}>
          Las órdenes eliminadas se conservan aquí 30 días antes de borrarse definitivamente. Puedes restaurarlas en cualquier momento.
        </p>
      </header>

      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, background: "var(--danger-bg)", color: "var(--danger)", borderRadius: "var(--r-md)", fontSize: "var(--fs-sm)", margin: "12px 0" }}>
          <AlertTriangle size={16} /> No se pudo completar la acción. Intenta de nuevo.
        </div>
      )}

      {items === null ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--fg-4)" }} />
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 16px", color: "var(--fg-3)" }}>
          <Trash2 size={36} style={{ color: "var(--fg-5)", marginBottom: 12 }} />
          <p style={{ fontSize: "var(--fs-md)", fontWeight: 600, color: "var(--fg-2)" }}>La papelera está vacía</p>
          <p style={{ fontSize: "var(--fs-sm)", marginTop: 4 }}>Las órdenes que elimines aparecerán aquí.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {items.map((o) => {
            const busy = busyId === o.id;
            return (
              <div
                key={o.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.numero ? `#${o.numero} · ` : ""}{o.titulo || "Sin título"}
                  </div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--fg-4)", marginTop: 2 }}>
                    Eliminada {deletedAgo((o as OrdenListItem & { deleted_at?: string }).deleted_at)}
                  </div>
                </div>

                <button
                  onClick={() => handleRestore(o.id)}
                  disabled={busy}
                  title="Restaurar"
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 12px", fontSize: "var(--fs-sm)", fontWeight: 500,
                    color: "var(--brand-fg)", background: "var(--brand-tint)",
                    border: "1px solid var(--brand)", borderRadius: "var(--r-sm)",
                    cursor: busy ? "default" : "pointer", fontFamily: "inherit",
                  }}
                >
                  <RotateCcw size={14} /> Restaurar
                </button>

                <button
                  onClick={() => setConfirmPurge(o)}
                  disabled={busy}
                  title="Eliminar definitivamente"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 34,
                    color: "var(--danger)", background: "none",
                    border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                    cursor: busy ? "default" : "pointer",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {confirmPurge && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onMouseDown={() => busyId ? undefined : setConfirmPurge(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 400, background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", padding: 24, boxShadow: "var(--shadow-lg)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <AlertTriangle size={20} style={{ color: "var(--danger)" }} />
              <h2 style={{ fontSize: "var(--fs-lg)", fontWeight: 700, color: "var(--fg-1)" }}>Eliminar definitivamente</h2>
            </div>
            <p style={{ fontSize: "var(--fs-sm)", color: "var(--fg-3)", lineHeight: 1.5 }}>
              Se eliminará <strong style={{ color: "var(--fg-1)" }}>{confirmPurge.titulo || "esta orden"}</strong> de forma permanente, junto con sus fotos. Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <button
                onClick={() => setConfirmPurge(null)}
                disabled={!!busyId}
                style={{ padding: "8px 14px", fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--fg-2)", background: "none", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handlePurge(confirmPurge.id)}
                disabled={!!busyId}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--fg-on-danger, #fff)", background: "var(--danger)", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "inherit" }}
              >
                {busyId ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={14} />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
