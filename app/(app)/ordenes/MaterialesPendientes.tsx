"use client";

/**
 * Materiales "no listados" — exclusivo de Electrilam. Cuando un maestro no
 * encuentra un material en el picker, la fila queda con Material escrito y
 * Código vacío. Aquí la oficina elige el código (y se aprende el alias para la
 * próxima vez) o, si de verdad no existe, lo crea en el catálogo. Los maestros
 * nunca crean códigos.
 */

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageSearch, Loader2, ChevronDown } from "lucide-react";
import { crearMaterial, fetchPendientes, resolverPendiente, type Pendiente } from "@/lib/catalogo-api";
import { useMateriales } from "@/lib/use-materiales";
import { buscarEnCatalogo, type Material } from "@/lib/materiales-busqueda";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });

const input: React.CSSProperties = {
  width: "100%", height: 30, padding: "0 8px", fontSize: 14, fontFamily: "inherit",
  border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--surface-1)", color: "var(--fg-1)",
  boxSizing: "border-box",
};

function FilaPendiente({ p, wsId, onListo }: { p: Pendiente; wsId: string; onListo: () => void }) {
  const mats = useMateriales(wsId);
  const [texto, setTexto] = useState(p.texto);
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<Material>({ codigo: "", descripcion: p.texto, unidad: "", clasificacion: "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opciones = useMemo(
    () => buscarEnCatalogo({ texto, catalogo: mats.catalogo, alias: mats.alias, usos: mats.usos, limite: 6 }),
    [texto, mats.catalogo, mats.alias, mats.usos],
  );
  const clasificaciones = useMemo(
    () => [...new Set(mats.catalogo.map((m) => m.clasificacion).filter(Boolean))].sort(),
    [mats.catalogo],
  );

  async function correr(fn: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try { await fn(); onListo(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(false); }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 2 }}>
        {p.numero != null ? `#${p.numero} · ` : ""}{p.autor ?? "—"} · {fecha(p.fecha)}
      </div>
      <div style={{ fontSize: 14, color: "var(--fg-1)", marginBottom: 6 }}>
        «{p.texto}»{p.cantidad ? ` × ${p.cantidad}` : ""}
      </div>
      {!creando ? (
        <>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar código o material" style={input} />
          {opciones.map((m) => (
            <button
              key={m.codigo}
              type="button"
              disabled={ocupado}
              onClick={() => void correr(() => resolverPendiente(p.fila_id, m.codigo))}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "5px 6px", marginTop: 2,
                border: "none", borderRadius: 6, background: "transparent", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--brand)", marginRight: 8 }}>{m.codigo}</span>
              <span style={{ fontSize: 13, color: "var(--fg-1)" }}>{m.descripcion}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCreando(true)}
            style={{ marginTop: 6, border: "none", background: "transparent", color: "var(--fg-3)", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
          >
            No está en el catálogo → crear código
          </button>
        </>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <input value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value.trim() })} placeholder="Código (como en la base de Patricio)" style={input} />
          <input value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Descripción" style={input} />
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })} placeholder="Unidad" style={{ ...input, width: 90 }} />
            <select value={nuevo.clasificacion} onChange={(e) => setNuevo({ ...nuevo, clasificacion: e.target.value })} style={input}>
              <option value="">Categoría…</option>
              {clasificaciones.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              disabled={ocupado || !nuevo.codigo || !nuevo.descripcion || !nuevo.clasificacion}
              onClick={() => void correr(async () => { await crearMaterial(wsId, nuevo); await resolverPendiente(p.fila_id, nuevo.codigo); })}
              style={{ flex: 1, height: 30, border: "none", borderRadius: 6, background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Crear y usar
            </button>
            <button
              type="button"
              onClick={() => setCreando(false)}
              style={{ height: 30, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6, background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function MaterialesPendientes({ wsId }: { wsId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data: pendientes = [], isLoading } = useQuery({
    queryKey: ["materiales", "pendientes", wsId],
    queryFn: fetchPendientes,
    staleTime: 60_000,
  });
  // Resolver cambia la fila, el alias y (si se creó) el catálogo: se recarga todo lo de materiales.
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["materiales"] });

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Materiales que los maestros anotaron sin código del catálogo"
        style={{
          height: 38, padding: "0 12px",
          display: "inline-flex", alignItems: "center", gap: 7,
          border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", color: "var(--fg-2)",
          fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <PackageSearch size={16} style={{ color: pendientes.length ? "var(--danger)" : "var(--brand)" }} />}
        Pendientes{pendientes.length ? ` (${pendientes.length})` : ""}
        <ChevronDown size={13} style={{ color: "var(--fg-4)" }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            role="dialog"
            aria-label="Materiales pendientes"
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 41,
              width: 420, maxHeight: "70vh", overflowY: "auto", padding: "4px 12px 12px",
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)", borderRadius: 9,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
          >
            {pendientes.length === 0
              ? <div style={{ fontSize: 14, color: "var(--fg-3)", padding: "12px 0" }}>No hay materiales pendientes.</div>
              : pendientes.map((p) => <FilaPendiente key={p.fila_id} p={p} wsId={wsId} onListo={refrescar} />)}
          </div>
        </>
      )}
    </div>
  );
}
