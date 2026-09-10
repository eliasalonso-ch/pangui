"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { Package, Trash2, Plus, Loader2 } from "lucide-react";
import { formatearCLP } from "@/lib/tributario";
import { totalLinea } from "@/lib/ordenes-compra-api";
import { inputStyle } from "@/components/catalogo/PanelCatalogo";
import type { OrdenCompraLineaForm } from "@/types/ordenes-compra";

interface ParteOpt {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad: string | null;
  stock_actual: number | null;
  precio_unitario: number | null;
  imagen_url: string | null;
}

/** Filas dibujadas por tanda en el desplegable. La siguiente entra al llegar al final del scroll. */
const RENDER_PAGE = 20;
/**
 * Tope de filas que se traen del servidor.
 *
 * Antes eran 20 y era tambien el tope de la busqueda: con un catalogo grande no
 * habia forma de llegar a la coincidencia 21 por mucho que se scrollee. El
 * dibujado va por tandas de RENDER_PAGE, asi que traer mas no pinta mas.
 */
const CATALOGO_MAX = 500;

const numInput: React.CSSProperties = {
  height: 32, padding: "0 8px", border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)", fontSize: 14, background: "var(--surface-1)",
  color: "var(--fg-1)", outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

/**
 * Editor de líneas de la orden de compra.
 *
 * Sale del `MaterialesPicker` de los planes (misma búsqueda contra el servidor,
 * mismas filas), con lo que un documento de compra necesita y un plan no:
 * precio, descuento y total por línea.
 *
 * La diferencia de fondo es que aquí una línea puede NO ser del catálogo. Una
 * orden de compra también paga un flete o un servicio de maestranza, y obligar
 * a inventarlos como "parte" para poder cobrarlos ensucia el inventario.
 */
export default function LineasPicker({
  wsId, value, onChange,
}: {
  wsId: string | null;
  value: OrdenCompraLineaForm[];
  onChange: (v: OrdenCompraLineaForm[]) => void;
}) {
  const [partes, setPartes] = useState<ParteOpt[]>([]);
  const [query, setQuery] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [encontrados, setEncontrados] = useState<ParteOpt[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  // Tanda dibujada, guardada junto a su clave (busqueda + abierto) para volver
  // a la primera al cambiar el filtro sin un efecto que llame setState.
  const [paged, setPaged] = useState({ key: "", n: 1 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const listaRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Catalogo inicial, para mostrar algo antes de escribir.
  useEffect(() => {
    if (!wsId) return;
    let active = true;
    createClient()
      .from("partes")
      .select("id, codigo, nombre, unidad, stock_actual, precio_unitario, imagen_url")
      .eq("workspace_id", wsId).eq("activo", true).order("nombre").limit(CATALOGO_MAX)
      .then(({ data }) => { if (active) setPartes((data ?? []) as ParteOpt[]); });
    return () => { active = false; };
  }, [wsId]);

  // La búsqueda va al servidor: filtrar en memoria no encontraría un material
  // que esté fuera de lo ya cargado. Busca por nombre o código, igual que el
  // buscador del inventario.
  useEffect(() => {
    const q = query.trim();
    if (!q || !wsId) { setEncontrados(null); return; }
    setBuscando(true);
    const t = setTimeout(async () => {
      const patron = `%${q}%`;
      const { data } = await createClient()
        .from("partes")
        .select("id, codigo, nombre, unidad, stock_actual, precio_unitario, imagen_url")
        .eq("workspace_id", wsId).eq("activo", true)
        .or(`nombre.ilike.${patron},codigo.ilike.${patron}`)
        .order("nombre").limit(CATALOGO_MAX);
      setEncontrados((data ?? []) as ParteOpt[]);
      setBuscando(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, wsId]);

  useEffect(() => {
    if (!abierto) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [abierto]);

  // Todos los candidatos que pasan el filtro; el corte por tanda va aparte para
  // que `hayMas` sepa si queda algo por dibujar.
  const candidatos = useMemo(() => {
    const yaElegidos = new Set(value.map(v => v.parte_id).filter(Boolean));
    const fuente = encontrados ?? partes;
    return fuente.filter(p => !yaElegidos.has(p.id));
  }, [partes, encontrados, value]);

  const pageKey = `${query}|${abierto}`;
  const page = paged.key === pageKey ? paged.n : 1;
  const visibles = candidatos.slice(0, RENDER_PAGE * page);
  const hayMas = candidatos.length > visibles.length;

  // Centinela al final de la lista: al entrar en pantalla dibuja la tanda
  // siguiente. Los datos ya estan en memoria, asi que no agrega peticiones.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hayMas || !abierto || buscando) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setPaged(p => ({ key: pageKey, n: (p.key === pageKey ? p.n : 1) + 1 }));
        }
      },
      { root: listaRef.current, rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hayMas, abierto, buscando, pageKey]);


  function set(i: number, patch: Partial<OrdenCompraLineaForm>) {
    onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  function agregarDelCatalogo(p: ParteOpt) {
    onChange([...value, {
      parte_id: p.id,
      descripcion: p.nombre,
      codigo: p.codigo,
      unidad: p.unidad ?? "un",
      // Se sugiere el precio del catálogo, pero queda editable: el proveedor
      // cotiza distinto cada vez y el documento debe decir lo cotizado.
      precio_unitario: p.precio_unitario ?? 0,
      cantidad: 1,
      descuento: 0,
    }]);
    setQuery(""); setAbierto(false);
  }

  function agregarLibre() {
    onChange([...value, {
      parte_id: null, descripcion: "", codigo: null,
      unidad: "un", cantidad: 1, precio_unitario: 0, descuento: 0,
    }]);
    setQuery(""); setAbierto(false);
  }

  return (
    <div>
      {value.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden", marginBottom: 12 }}>
          {value.map((l, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: "var(--r-sm)", flexShrink: 0,
                background: "var(--brand-tint)", color: "var(--brand)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}>
                <Package size={16} />
              </span>

              <span style={{ flex: 1, minWidth: 0 }}>
                {l.parte_id ? (
                  <>
                    <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.descripcion}
                    </span>
                    {l.codigo && <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)" }}>{l.codigo}</span>}
                  </>
                ) : (
                  <input
                    value={l.descripcion}
                    onChange={e => set(i, { descripcion: e.target.value })}
                    placeholder="Descripción del ítem o servicio"
                    style={{ ...numInput, width: "100%" }}
                  />
                )}
              </span>

              <input
                type="number" min={0.01} step="any" value={l.cantidad}
                onChange={e => {
                  const n = Number(e.target.value);
                  set(i, { cantidad: n > 0 ? n : 1 });
                }}
                style={{ ...numInput, width: 70 }}
                aria-label="Cantidad"
              />
              <span style={{ fontSize: 14, color: "var(--fg-3)", width: 28 }}>{l.unidad ?? "un"}</span>

              <input
                type="number" min={0} step="any" value={l.precio_unitario}
                onChange={e => set(i, { precio_unitario: Math.max(Number(e.target.value) || 0, 0) })}
                style={{ ...numInput, width: 100 }}
                aria-label="Precio unitario"
              />

              {/* Un servicio u honorario no afecto a IVA. Sin esto habría que
                  cobrarle impuesto que no corresponde o dejarlo fuera. */}
              <label
                title="No afecta a IVA"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 14, color: "var(--fg-3)", flexShrink: 0, cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={l.exenta ?? false}
                  onChange={e => set(i, { exenta: e.target.checked })}
                />
                Exenta
              </label>

              <span style={{ fontSize: 14, color: "var(--fg-1)", width: 100, textAlign: "right" }}>
                {formatearCLP(totalLinea(l))}
              </span>

              <button
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label="Quitar línea"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", padding: 4 }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={boxRef} style={{ position: "relative" }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          placeholder="Buscar material del inventario…"
          style={inputStyle}
        />

        {abierto && (
          /* El desplegable NO scrollea: scrollea solo la lista de adentro, para
             que el boton de abajo quede fijo y no haya que recorrer el catalogo
             entero para alcanzarlo. */
          <div style={{
            position: "absolute", top: 40, left: 0, right: 0, zIndex: 20,
            background: "var(--surface-1)", border: "1px solid var(--border)",
            borderRadius: "var(--r-md)", boxShadow: "var(--shadow-lg)",
            display: "flex", flexDirection: "column", maxHeight: 320, overflow: "hidden",
          }}>
            {buscando ? (
              <div style={{ padding: 12, display: "flex", alignItems: "center", gap: 8, color: "var(--fg-3)", fontSize: 14 }}>
                <Loader2 size={14} className="animate-spin" /> Buscando…
              </div>
            ) : (
              <div ref={listaRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {visibles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => agregarDelCatalogo(p)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>{p.nombre}</span>
                      <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)" }}>
                        Stock {p.stock_actual ?? 0} {p.unidad ?? "un"}
                        {p.precio_unitario ? ` · ${formatearCLP(p.precio_unitario)}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
                {hayMas && <div ref={sentinelRef} style={{ height: 1 }} />}
                {candidatos.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 14, color: "var(--fg-3)" }}>
                    {query ? "Sin resultados en el inventario" : "No hay materiales en el inventario todavía."}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={agregarLibre}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                padding: "10px 12px", background: "var(--surface-1)", border: "none",
                borderTop: "1px solid var(--border)", flexShrink: 0,
                cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--brand)",
              }}
            >
              <Plus size={14} /> Agregar ítem fuera del inventario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
