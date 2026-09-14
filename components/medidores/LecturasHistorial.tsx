"use client";

/**
 * Historial de lecturas: la lista completa y la ficha de una lectura.
 *
 * Es la sub-vista a la que lleva "Ver todas las lecturas". Reemplaza el panel de
 * detalle del medidor mientras está abierta y vuelve con la flecha, en vez de
 * navegar a otra ruta: la lectura pertenece al medidor y sacar al usuario de su
 * ficha para ver una fila es perderle el contexto.
 *
 * La lectura NO se edita en su sitio: `medidor_lecturas` no tiene policy de
 * UPDATE a propósito —una lectura es un hecho medido, no un campo—. "Editar" es
 * borrar y volver a cargar, que es exactamente lo que hace el diálogo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, MoreVertical, Plus } from "lucide-react";
import {
  deleteLectura, fetchAutores, fetchLecturasPagina, nivelDeLectura, origenDeLectura,
  type Lectura, type MedidorConUltima,
} from "@/lib/medidores-api";

/** Filas por página. El historial de un automatizado puede ser enorme. */
const POR_PAGINA = 20;

const NIVEL_COLOR = {
  normal: "var(--fg-1)",
  advertencia: "var(--warning)",
  critico: "var(--danger)",
} as const;

function fmtLargo(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })} - ${d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
}

/** Cómo se describe el origen en texto, que es lo que lee el usuario. */
function frase(l: Lectura, autor: string | null): string {
  switch (origenDeLectura(l)) {
    case "procedimiento":
      return `Registrado desde un procedimiento${autor ? ` por ${autor}` : ""}`;
    case "manual":
      return `Registrado manualmente${autor ? ` por ${autor}` : ""}`;
    default:
      return "Registrado automáticamente por el equipo";
  }
}

export interface LecturasHistorialProps {
  medidor: MedidorConUltima;
  /** Se avanza al registrar/borrar, para volver a pedir la serie. */
  refrescar: number;
  puedeEditar: boolean;
  onVolver: () => void;
  onRegistrar: () => void;
  /** Abre la carga para reemplazar esta lectura. No borra nada todavía. */
  onCorregir: (l: Lectura) => void;
  onCambio: () => void;
}

export default function LecturasHistorial({
  medidor, refrescar, puedeEditar, onVolver, onRegistrar, onCorregir, onCambio,
}: LecturasHistorialProps) {
  const [seleccion, setSeleccion] = useState<Lectura | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["medidor-lecturas-todas", medidor.id, refrescar],
    queryFn: ({ pageParam }) => fetchLecturasPagina(medidor.id, POR_PAGINA, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (ultima) => ultima.cursor,
    staleTime: 60 * 1000,
  });

  // Ya vienen ordenadas desc por página, así que basta con concatenarlas.
  const lecturas = useMemo(
    () => q.data?.pages.flatMap(p => p.lecturas) ?? [],
    [q.data],
  );

  const observador = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observador.current?.disconnect(), []);

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;

  /**
   * Centinela al final de la lista: cuando entra en pantalla se pide la página
   * siguiente.
   *
   * IntersectionObserver y no un handler de scroll: no hay que medir alturas ni
   * throttlear, y se desconecta solo. El `rootMargin` dispara la carga un poco
   * antes del borde, para que en un scroll rápido no se vea el spinner.
   */
  const centinela = useCallback((nodo: HTMLDivElement | null) => {
    observador.current?.disconnect();
    if (!nodo) return;

    observador.current = new IntersectionObserver(
      entradas => {
        if (entradas[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observador.current.observe(nodo);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Los nombres van en una consulta aparte y no en el join: `creado_por` apunta
  // a `usuarios`, y traerlo embebido en cada lectura repetiría el mismo nombre
  // en cada fila del payload.
  // La clave son los IDS de autor, no el largo de la lista: al cargar otra
  // página con las mismas personas no hace falta volver a preguntar los nombres.
  const idsAutores = useMemo(
    () => [...new Set(lecturas.map(l => l.creado_por).filter(Boolean) as string[])].sort(),
    [lecturas],
  );

  const autores = useQuery({
    queryKey: ["medidor-lecturas-autores", medidor.id, idsAutores.join(",")],
    queryFn: () => fetchAutores(idsAutores),
    enabled: idsAutores.length > 0,
    staleTime: 15 * 60 * 1000,
  });

  const nombreDe = (l: Lectura) => (l.creado_por ? autores.data?.get(l.creado_por) ?? null : null);

  if (seleccion) {
    return (
      <LecturaDetalle
        l={seleccion}
        medidor={medidor}
        autor={nombreDe(seleccion)}
        puedeEditar={puedeEditar}
        onVolver={() => setSeleccion(null)}
        onBorrada={() => { setSeleccion(null); onCambio(); }}
        /* Corregir NO borra acá: abre la carga con el valor y el id de la que
           se reemplaza, y el diálogo borra la vieja recién después de guardar
           la nueva. Cerrar sin guardar no cuesta la lectura. */
        onCorregir={() => { setSeleccion(null); onCorregir(seleccion); }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>
      <Encabezado titulo="Historial de lecturas" onVolver={onVolver}>
        {medidor.tipo === "manual" && (
          <button
            type="button"
            onClick={onRegistrar}
            style={{
              height: 38, padding: "0 16px", display: "inline-flex", alignItems: "center", gap: 6,
              border: "1px solid var(--brand)", borderRadius: 8, background: "var(--surface-1)",
              fontSize: 14, fontFamily: "inherit", color: "var(--brand)", cursor: "pointer",
            }}
          >
            <Plus size={15} /> Registrar lectura
          </button>
        )}
      </Encabezado>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {q.isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 48, color: "var(--fg-4)" }}>
            <Loader2 size={16} className="animate-spin" />
            <span style={{ fontSize: 14 }}>Cargando lecturas…</span>
          </div>
        ) : lecturas.length === 0 ? (
          <p style={{ padding: 28, fontSize: 14, color: "var(--fg-2)", margin: 0 }}>
            Todavía no hay lecturas registradas.
          </p>
        ) : (
          lecturas.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => setSeleccion(l)}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
              style={{
                display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                padding: "12px 28px", border: "none", borderBottom: "1px solid var(--border)",
                background: "transparent", fontFamily: "inherit",
              }}
            >
              <span style={{ display: "block", fontSize: 14, color: NIVEL_COLOR[nivelDeLectura(Number(l.valor), medidor)] }}>
                {l.valor} {medidor.unidad}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", marginTop: 2 }}>
                {fmtLargo(l.ts)}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-2)", marginTop: 2 }}>
                {frase(l, nombreDe(l))}
              </span>
            </button>
          ))
        )}

        {/* Centinela + estado de carga de la página siguiente. Va dentro del
            contenedor con scroll, que es el `root` implícito del observer. */}
        {q.hasNextPage && (
          <div ref={centinela} style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
            {q.isFetchingNextPage && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-4)" }}>
                <Loader2 size={14} className="animate-spin" /> Cargando más…
              </span>
            )}
          </div>
        )}

        {/* Cierre explícito: sin esto, una lista larga termina en blanco y no se
            distingue de una que todavía está cargando. */}
        {!q.hasNextPage && lecturas.length > POR_PAGINA && (
          <p style={{ padding: "16px 28px", margin: 0, fontSize: 14, color: "var(--fg-4)", textAlign: "center" }}>
            {lecturas.length} lecturas en total.
          </p>
        )}
      </div>
    </div>
  );
}

function LecturaDetalle({ l, medidor, autor, puedeEditar, onVolver, onBorrada, onCorregir }: {
  l: Lectura;
  medidor: MedidorConUltima;
  autor: string | null;
  puedeEditar: boolean;
  onVolver: () => void;
  onBorrada: () => void;
  /**
   * Borra esta lectura y reabre el diálogo de carga.
   *
   * "Editar" es borrar y recargar porque `medidor_lecturas` no tiene policy de
   * UPDATE —una lectura es un hecho medido, no un campo— y porque el trigger
   * que abre la OT mira el INSERT: con un UPDATE, corregir un valor por encima
   * de la alarma no abriría nada, que es justo el caso grave.
   */
  onCorregir: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function borrar() {
    setBorrando(true); setErr(null);
    try {
      await deleteLectura(l.id);
      onBorrada();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo eliminar la lectura.");
      setBorrando(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--surface-canvas)" }}>
      <Encabezado titulo="Detalle de la lectura" onVolver={onVolver}>
        {puedeEditar && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenu(v => !v)}
              aria-label="Acciones de la lectura"
              style={{
                width: 34, height: 34, display: "grid", placeItems: "center",
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--surface-1)", color: "var(--fg-2)", cursor: "pointer",
              }}
            >
              <MoreVertical size={15} />
            </button>
            {menu && (
              <>
                {/* Capa de cierre: un clic fuera cierra el menú sin capturar el
                    scroll ni bloquear la pantalla. */}
                <span
                  onClick={() => setMenu(false)}
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                />
                <div style={{
                  position: "absolute", right: 0, top: 40, zIndex: 11, minWidth: 170,
                  background: "var(--surface-1)", border: "1px solid var(--border)",
                  borderRadius: 8, boxShadow: "var(--shadow-lg)", overflow: "hidden",
                }}>
                  <button
                    type="button"
                    onClick={() => { setMenu(false); onCorregir(); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
                    }}
                  >
                    Corregir
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMenu(false); setConfirmar(true); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
                      border: "none", background: "transparent", cursor: "pointer",
                      fontSize: 14, fontFamily: "inherit", color: "var(--danger)",
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Encabezado>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "36px 28px" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{
            margin: 0, fontSize: 34, fontWeight: 400,
            color: NIVEL_COLOR[nivelDeLectura(Number(l.valor), medidor)],
            fontVariantNumeric: "tabular-nums", lineHeight: 1.2,
          }}>
            {l.valor} {medidor.unidad}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-2)" }}>{fmtLargo(l.ts)}</p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: 28, paddingTop: 20 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-2)", lineHeight: 1.75 }}>
            {frase(l, autor)}.
          </p>

          {l.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={l.foto_url}
              alt="Foto del instrumento"
              style={{ marginTop: 18, maxWidth: "100%", maxHeight: 320, borderRadius: 8, border: "1px solid var(--border)", display: "block" }}
            />
          )}

          {err && (
            <p style={{ margin: "14px 0 0", fontSize: 14, color: "var(--danger)" }}>{err}</p>
          )}
        </div>
      </div>

      {confirmar && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 600, background: "rgba(15,23,42,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
          }}
          onMouseDown={e => { if (e.target === e.currentTarget && !borrando) setConfirmar(false); }}
        >
          <div style={{
            width: "100%", maxWidth: 420, background: "var(--surface-1)",
            border: "1px solid var(--border)", borderRadius: 12,
            boxShadow: "var(--shadow-lg)", padding: 24, textAlign: "center",
          }}>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--fg-1)", lineHeight: 1.6 }}>
              ¿Seguro que quieres eliminar la lectura de {l.valor} {medidor.unidad}?
            </p>
            <div style={{ display: "grid", gap: 10 }}>
              <button
                type="button" onClick={borrar} disabled={borrando}
                style={{
                  height: 40, border: "none", borderRadius: 8,
                  background: borrando ? "var(--fg-3)" : "var(--danger)", color: "#fff",
                  fontSize: 14, fontFamily: "inherit", cursor: borrando ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
                }}
              >
                {borrando && <Loader2 size={13} className="animate-spin" />}
                Confirmar
              </button>
              <button
                type="button" onClick={() => setConfirmar(false)} disabled={borrando}
                style={{
                  height: 36, border: "none", borderRadius: 8, background: "transparent",
                  color: "var(--brand)", fontSize: 14, fontFamily: "inherit",
                  cursor: borrando ? "default" : "pointer",
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Encabezado con flecha de vuelta, del alto del header de OTCrearPanel. */
function Encabezado({ titulo, onVolver, children }: {
  titulo: string;
  onVolver: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "0 28px", height: 64, borderBottom: "1px solid var(--border)", flexShrink: 0,
    }}>
      <button
        type="button" onClick={onVolver} aria-label="Volver"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--fg-3)", display: "flex" }}
      >
        <ChevronLeft size={20} />
      </button>
      <h2 style={{ flex: 1, fontSize: 20, fontWeight: 400, color: "var(--fg-1)", margin: 0 }}>{titulo}</h2>
      {children}
    </div>
  );
}
