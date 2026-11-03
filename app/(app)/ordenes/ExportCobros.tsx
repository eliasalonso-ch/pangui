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
import { libroCobros, MESES, type OtCobro } from "@/lib/cobros-excel";
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
      .select("id, n_serie, numero_meconecta, descripcion, titulo, observacion, solicitante, tipo_trabajo, completado_en, tiempo_total_segundos, asignados_ids, ubicacion_texto, lugar, ubicaciones(edificio, detalle), lugares(nombre)")
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
      // Sin ubicación del catálogo, el texto libre que se escribió al crear la OT.
      lugar: [txt(ubi.edificio), txt(ubi.detalle), txt(lug.nombre)].filter(Boolean).join(" · ")
        || txt(o.ubicacion_texto) || txt(o.lugar),
      fecha: o.completado_en ? dateKey(new Date(String(o.completado_en))) : "",
      descripcion: txt(o.titulo),
      emergencia: o.tipo_trabajo === "emergencia",
      minutosApp: o.tiempo_total_segundos ? Number(o.tiempo_total_segundos) / 60 : null,
      asignados: Array.isArray(o.asignados_ids) ? o.asignados_ids.length : 0,
      hojas: hojasPorOt.get(String(o.id)) ?? [],
    };
  });
}

type Rango = { desde: string; hasta: string };

function RangoFechas({ titulo, nota, rango, onChange }: { titulo: string; nota: string; rango: Rango; onChange: (r: Rango) => void }) {
  const input = {
    flex: 1, minWidth: 0, height: 30, padding: "0 6px",
    border: "1px solid var(--border)", borderRadius: 6,
    background: "var(--surface-1)", color: "var(--fg-1)",
    fontSize: 14, fontFamily: "inherit",
  } as const;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, color: "var(--fg-2)", marginBottom: 2 }}>{titulo}</div>
      <div style={{ fontSize: 13, color: "var(--fg-4)", marginBottom: 6 }}>{nota}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="date" aria-label={`${titulo} desde`} value={rango.desde} max={rango.hasta || undefined} onChange={(e) => onChange({ ...rango, desde: e.target.value })} style={input} />
        <span style={{ color: "var(--fg-4)" }}>→</span>
        <input type="date" aria-label={`${titulo} hasta`} value={rango.hasta} min={rango.desde || undefined} onChange={(e) => onChange({ ...rango, hasta: e.target.value })} style={input} />
      </div>
    </div>
  );
}

export default function ExportCobros({ wsId }: { wsId: string }) {
  // Por defecto el mes pasado en las dos: el cobro se arma a mes cerrado. CON OT
  // suele cortar distinto (julio fue del 17-jun al 21-jul), por eso va aparte.
  const hoy = new Date();
  const mesPasado = (): Rango => ({
    desde: dateKey(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
    hasta: dateKey(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
  });
  const [conOt, setConOt] = useState<Rango>(mesPasado);
  const [sinOt, setSinOt] = useState<Rango>(mesPasado);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completo = !!(conOt.desde && conOt.hasta && sinOt.desde && sinOt.hasta);

  async function descargar() {
    if (loading || !completo) return;
    setLoading(true);
    setError(null);
    try {
      // Una sola lectura que cubre los dos rangos; cada pestaña filtra el suyo.
      const desde = conOt.desde < sinOt.desde ? conOt.desde : sinOt.desde;
      const hasta = conOt.hasta > sinOt.hasta ? conOt.hasta : sinOt.hasta;
      const [XLSX, ots, catalogo, logo] = await Promise.all([
        import("xlsx-js-style"),
        cargarOts(wsId, desde, hasta),
        todoElCatalogo(wsId),
        // Sin logo el Excel sale igual: no vale la pena fallar por la imagen.
        fetch("/cobros/electrilam-logo.png").then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
      ]);
      if (ots.length === 0) { setError("No hay OTs completadas en esos rangos"); return; }

      const bytes = libroCobros(XLSX as unknown as XlsxHoja, { ots, catalogo, conOt, sinOt, logo: logo ? new Uint8Array(logo) : undefined });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      a.download = `COBROS CON Y SIN OT ${MESES[Number(sinOt.hasta.slice(5, 7)) - 1]} ${sinOt.hasta.slice(0, 4)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el Excel de cobros");
    } finally {
      setLoading(false);
    }
  }

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
              width: 320, padding: 12,
              background: "var(--surface-1)",
              border: "1px solid var(--border-strong)", borderRadius: 9,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}
          >
            <RangoFechas titulo="CON OT" nota="Según el corte del ITO" rango={conOt} onChange={setConOt} />
            <RangoFechas titulo="SIN OT" nota="Mes calendario" rango={sinOt} onChange={setSinOt} />
            {error && <div style={{ fontSize: 14, color: "var(--danger)", marginBottom: 8 }}>{error}</div>}
            <button
              type="button"
              onClick={descargar}
              disabled={loading || !completo}
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
              Para ver los precios, pega la tabla de Materiales de Patricio en la pestaña <b>Materiales</b>, desde B4.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
