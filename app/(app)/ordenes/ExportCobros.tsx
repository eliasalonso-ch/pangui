"use client";

/**
 * "Cobros" — exclusivo de Electrilam. Descarga las OTs completadas en un rango
 * de fechas con el dibujo del Excel de cobros de Claudio (ver lib/cobros-excel),
 * para que no tenga que transcribir OT por OT lo que escribieron los técnicos.
 */

import { useState } from "react";
import { FileSpreadsheet, Loader2, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { celdasConResultados } from "@/lib/hoja-formulas";
import { numeroOtCliente } from "@/lib/cobro-export";
import { todoElCatalogo } from "@/lib/catalogo-api";
import { libroCobros, norm, type OtCobro } from "@/lib/cobros-excel";
import type { XlsxHoja } from "@/lib/hoja-excel";

/** "YYYY-MM-DD" con el calendario local: toISOString() correría el día a UTC. */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Rel = Record<string, unknown> | Record<string, unknown>[] | null;
const uno = (rel: Rel): Record<string, unknown> => (Array.isArray(rel) ? rel[0] : rel) ?? {};
const txt = (v: unknown) => (v == null ? "" : String(v).trim());

async function cargarOts(wsId: string, desde: string, hasta: string): Promise<OtCobro[]> {
  const sb = createClient();
  const fin = new Date(`${hasta}T00:00:00`);
  fin.setDate(fin.getDate() + 1); // "hasta" incluye el día completo

  const ots: Record<string, unknown>[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb
      .from("ordenes_trabajo")
      .select("id, n_serie, numero_meconecta, descripcion, titulo, observacion, solicitante, tipo_trabajo, completado_en, ubicaciones(edificio, detalle), lugares(nombre)")
      .eq("workspace_id", wsId)
      .eq("estado", "completado")
      .is("deleted_at", null)
      .gte("completado_en", new Date(`${desde}T00:00:00`).toISOString())
      .lt("completado_en", fin.toISOString())
      .order("completado_en")
      .range(i, i + 999);
    if (error) throw error;
    ots.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // Hojas con sus filas; de a 100 OTs para no armar una URL gigante.
  const hojasPorOt = new Map<string, OtCobro["hojas"]>();
  const ids = ots.map((o) => String(o.id));
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb
      .from("hojas_inventario")
      .select("orden_id, tipo, columnas, created_at, filas:hojas_inventario_filas(orden, celdas)")
      .in("orden_id", ids.slice(i, i + 100))
      .order("created_at");
    if (error) throw error;
    for (const h of (data ?? []) as { orden_id: string; tipo: string; columnas: { id: string; label: string }[] | null; filas: { orden: number | null; celdas: Record<string, unknown> | null }[] | null }[]) {
      const filas = [...(h.filas ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
      const columnas = h.columnas ?? [];
      hojasPorOt.set(h.orden_id, [...(hojasPorOt.get(h.orden_id) ?? []), { tipo: h.tipo, columnas, filas: celdasConResultados(columnas, filas, true) }]);
    }
  }

  return ots.map((o) => {
    const ubi = uno(o.ubicaciones as Rel);
    const lug = uno(o.lugares as Rel);
    return {
      numeroOt: numeroOtCliente(txt(o.n_serie), txt(o.numero_meconecta), txt(o.descripcion), txt(o.titulo), txt(o.observacion)),
      solicitante: txt(o.solicitante),
      lugar: [txt(ubi.edificio), txt(ubi.detalle), txt(lug.nombre)].filter(Boolean).join(" · "),
      fecha: o.completado_en ? dateKey(new Date(String(o.completado_en))) : "",
      descripcion: txt(o.titulo),
      emergencia: o.tipo_trabajo === "emergencia",
      hojas: hojasPorOt.get(String(o.id)) ?? [],
    };
  });
}

export default function ExportCobros({ wsId }: { wsId: string }) {
  // Por defecto el mes pasado: el cobro se arma a mes cerrado.
  const hoy = new Date();
  const [desde, setDesde] = useState(() => dateKey(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)));
  const [hasta, setHasta] = useState(() => dateKey(new Date(hoy.getFullYear(), hoy.getMonth(), 0)));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    if (loading || !desde || !hasta) return;
    setLoading(true);
    setError(null);
    try {
      const [XLSX, ots, catalogo] = await Promise.all([
        import("xlsx-js-style"),
        cargarOts(wsId, desde, hasta),
        todoElCatalogo(wsId),
      ]);
      if (ots.length === 0) { setError("No hay OTs completadas en ese rango"); return; }
      // Texto normalizado → código: se busca tanto por código como por descripción.
      const mapa = new Map<string, string>();
      for (const m of catalogo) mapa.set(norm(m.descripcion), m.codigo);
      for (const m of catalogo) mapa.set(norm(m.codigo), m.codigo);

      const bytes = libroCobros(XLSX as unknown as XlsxHoja, ots, mapa);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      a.download = `cobros_${desde}_a_${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el Excel de cobros");
    } finally {
      setLoading(false);
    }
  }

  const input = {
    width: "100%", height: 30, marginBottom: 8, padding: "0 8px",
    border: "1px solid var(--border)", borderRadius: 6,
    background: "var(--surface-1)", color: "var(--fg-1)",
    fontSize: 14, fontFamily: "inherit",
  } as const;

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Excel de cobros con el formato CON OT / SIN OT"
        style={{
          height: 38, padding: "0 12px",
          display: "inline-flex", alignItems: "center", gap: 7,
          border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", color: "var(--fg-2)",
          fontSize: 14, fontWeight: 400, fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} style={{ color: "var(--brand)" }} />}
        Cobros
        <ChevronDown size={13} style={{ color: "var(--fg-4)" }} />
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            role="dialog"
            aria-label="Exportar cobros"
            style={{
              position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 41,
              width: 280, padding: 12,
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)", borderRadius: 9,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontSize: 14, color: "var(--fg-4)", marginBottom: 10 }}>
              OTs completadas en el rango, separadas en CON OT y SIN OT.
            </div>
            <label style={{ display: "block", fontSize: 14, color: "var(--fg-4)", marginBottom: 3 }}>Desde</label>
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} style={input} />
            <label style={{ display: "block", fontSize: 14, color: "var(--fg-4)", marginBottom: 3 }}>Hasta</label>
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} style={input} />
            {error && <div style={{ fontSize: 14, color: "var(--danger)", marginBottom: 8 }}>{error}</div>}
            <button
              type="button"
              onClick={descargar}
              disabled={loading || !desde || !hasta}
              style={{
                width: "100%", height: 32, border: "none", borderRadius: 6,
                background: "var(--brand)", color: "var(--fg-on-brand)",
                fontSize: 14, fontWeight: 400, cursor: loading ? "default" : "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              {loading ? <><Loader2 size={13} className="animate-spin" />Armando…</> : "Descargar Excel"}
            </button>
            <div style={{ fontSize: 13, color: "var(--fg-4)", marginTop: 10, lineHeight: 1.4 }}>
              En tu plantilla: copia desde C13, pega en C13 con Pegado especial → <b>Saltar blancos</b> para no borrar las fórmulas.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
