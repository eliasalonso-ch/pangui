"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { buscarGiros, giroPorCodigo, etiquetaGiro, codigoDesdeEtiqueta } from "@/lib/giros-sii";

/**
 * Selector de giro (código de actividad económica del SII).
 *
 * Combobox con búsqueda en vez de <select>: el catálogo tiene 674 códigos y una
 * lista desplegable de ese largo es inusable. Se busca por código o por
 * palabras del nombre, ignorando tildes.
 *
 * El valor que se guarda es la etiqueta completa "620100 - NOMBRE", que es lo
 * que va impreso en la factura. Los perfiles creados antes del selector tienen
 * texto libre sin código; se muestran tal cual y se pueden reemplazar
 * eligiendo de la lista.
 */
interface Props {
  value:      string | null;
  onChange:   (valor: string | null) => void;
  inputStyle: React.CSSProperties;
  placeholder?: string;
}

const MAX_RESULTADOS = 40;

export function GiroSelect({ value, onChange, inputStyle, placeholder }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState("");
  const contenedor = useRef<HTMLDivElement>(null);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  const resultados = useMemo(() => buscarGiros(consulta, MAX_RESULTADOS), [consulta]);

  // El código guardado puede venir de una etiqueta ("620100 - ...") o ser texto
  // libre de un perfil antiguo.
  const codigoActual = codigoDesdeEtiqueta(value);
  const giroActual = codigoActual ? giroPorCodigo(codigoActual) : null;
  const textoMostrado = giroActual ? etiquetaGiro(giroActual) : (value ?? "");

  // Cierra al hacer clic fuera; sin esto el panel queda abierto sobre el resto
  // del formulario.
  useEffect(() => {
    if (!abierto) return;
    function alClic(evento: MouseEvent) {
      if (!contenedor.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function alEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    campoBusqueda.current?.focus();
    // El panel empuja el contenido hacia abajo, así que puede nacer fuera de la
    // parte visible del modal. Se lo trae a la vista para no obligar a buscarlo
    // con scroll.
    contenedor.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [abierto]);

  function elegir(codigo: string) {
    const giro = giroPorCodigo(codigo);
    if (giro) onChange(etiquetaGiro(giro));
    setAbierto(false);
    setConsulta("");
  }

  return (
    <div ref={contenedor} style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
      <label style={{ color: "var(--fg-2)", fontSize: 14, fontWeight: 400 }}>Giro</label>

      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        style={{
          ...inputStyle,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          textAlign: "left", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          color: textoMostrado ? "var(--fg-1)" : "var(--fg-4)",
        }}>
          {textoMostrado || (placeholder ?? "Selecciona el giro…")}
        </span>
        <ChevronDown size={15} style={{ flexShrink: 0, color: "var(--fg-3)" }} />
      </button>

      {abierto && (
        // En el flujo del documento, no `position: absolute`. El modal que lo
        // contiene tiene `overflow-y: auto`, así que un panel flotante quedaba
        // recortado y obligaba a hacer scroll dentro de la tarjeta para ver los
        // resultados. Empujando el contenido hacia abajo, la lista se ve
        // completa y el modal crece lo necesario.
        <div style={{
          marginTop: 4,
          border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
          background: "var(--surface-1)", boxShadow: "0 8px 24px rgba(0,0,0,.16)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
            borderBottom: "1px solid var(--border)",
          }}>
            <Search size={14} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
            <input
              ref={campoBusqueda}
              value={consulta}
              onChange={e => setConsulta(e.target.value)}
              placeholder="Buscar por código o actividad…"
              style={{
                flex: 1, border: 0, outline: "none", background: "transparent",
                color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit",
              }}
            />
            {consulta && (
              <button type="button" onClick={() => setConsulta("")} aria-label="Limpiar búsqueda"
                style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--fg-3)", display: "flex" }}>
                <X size={14} />
              </button>
            )}
          </div>

          {/* 220px ≈ 8 resultados: suficiente para elegir sin que el panel
              empuje el botón de guardar fuera de la pantalla. */}
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {resultados.length === 0 ? (
              <p style={{ margin: 0, padding: "14px 12px", color: "var(--fg-3)", fontSize: 14 }}>
                Sin resultados para “{consulta}”.
              </p>
            ) : (
              resultados.map(giro => (
                <button
                  key={giro.codigo}
                  type="button"
                  onClick={() => elegir(giro.codigo)}
                  style={{
                    display: "block", width: "100%", padding: "9px 12px", border: 0,
                    textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                    background: giro.codigo === codigoActual ? "var(--surface-2)" : "transparent",
                    color: "var(--fg-1)", borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-3)", marginRight: 8 }}>
                    {giro.codigo}
                  </span>
                  {giro.nombre}
                </button>
              ))
            )}
          </div>

          {resultados.length >= MAX_RESULTADOS && (
            <p style={{ margin: 0, padding: "7px 12px", borderTop: "1px solid var(--border)", color: "var(--fg-4)", fontSize: 14 }}>
              Mostrando los primeros {MAX_RESULTADOS}. Afina la búsqueda para ver más.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
