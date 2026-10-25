"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { TriangleAlert, X } from "lucide-react";
import { COLORES_REF, esFormula, referencias, type Resultado } from "@/lib/hoja-formulas";
import { CATALOGO, GRUPOS, argumentoActual, explicarError, funcionPorNombre, type Funcion } from "@/lib/hoja-funciones";

// ── Barra de fórmulas de la hoja web ─────────────────────────────────────────
// Lo escrito en la celda abierta (se edita aquí o en la celda: es el mismo
// texto), con las referencias pintadas del color con que se marcan en la
// grilla, el resultado en vivo y la guía fx de funciones.

const PANEL: React.CSSProperties = {
  background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,.18)", fontSize: 13, color: "var(--fg-1)",
};
const MONO = "var(--font-mono)";

/**
 * Caja pegada bajo un elemento, en un portal: así no la recorta el scroll de la
 * grilla. No roba el foco: el input sigue escribiendo mientras se usa.
 */
export function Flotante({ ancla, derecha, children }: { ancla: HTMLElement | null; derecha?: boolean; children: ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!ancla) return;
    // ponytail: siempre hacia abajo; si algún día queda fuera de la pantalla, voltearla hacia arriba.
    const medir = () => {
      const r = ancla.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: derecha ? r.right : r.left });
    };
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [ancla, derecha]);
  if (!ancla || !pos) return null;
  return createPortal(
    <div
      onMouseDown={e => e.preventDefault()}
      // Por encima de la vista ampliada (200) y de los menús de columna (600).
      style={{ position: "fixed", top: pos.top, left: pos.left, transform: derecha ? "translateX(-100%)" : undefined, zIndex: 700 }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** "SUMA(número1; [número2]; …)" con el argumento donde va el cursor en negrita. */
function Firma({ f, indice }: { f: Funcion; indice?: number }) {
  const ultimo = f.args.at(-1) === "…" ? f.args.length - 2 : f.args.length - 1;
  const activo = indice == null ? -1 : Math.min(indice, ultimo);
  return (
    <span style={{ fontFamily: MONO, fontSize: 12.5 }}>
      {f.nombre}(
      {f.args.map((a, i) => (
        <span key={i}>
          {i > 0 && "; "}
          <span style={{ fontWeight: i === activo ? 600 : 400, color: i === activo ? "var(--fg-1)" : "var(--fg-3)" }}>{a}</span>
        </span>
      ))}
      )
    </span>
  );
}

/** Bajo el campo que se edita: las funciones que calzan con lo escrito, o la firma de la función en curso. */
export function AyudaFormula({ valor, caret, sugerencias, indice, onElegir }: {
  valor: string;
  caret: number;
  sugerencias: Funcion[];
  indice: number;
  onElegir: (f: Funcion) => void;
}) {
  if (sugerencias.length) {
    return (
      <div role="listbox" aria-label="Funciones" style={{ ...PANEL, width: 340, padding: 4 }}>
        {sugerencias.map((f, i) => (
          <div
            key={f.nombre}
            role="option"
            aria-selected={i === indice}
            onMouseDown={() => onElegir(f)}
            style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", background: i === indice ? "var(--surface-hover)" : undefined }}
          >
            <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600 }}>{f.nombre}</div>
            <div style={{ color: "var(--fg-3)", fontSize: 12 }}>{f.desc}</div>
          </div>
        ))}
        <div style={{ padding: "4px 8px 2px", color: "var(--fg-4)", fontSize: 11 }}>Tab o Enter para elegir · Esc para cerrar</div>
      </div>
    );
  }
  const arg = argumentoActual(valor, caret);
  const f = arg && funcionPorNombre(arg.nombre);
  if (!arg || !f) return null;
  return (
    <div style={{ ...PANEL, maxWidth: 380, padding: "8px 10px" }}>
      <Firma f={f} indice={arg.indice} />
      <div style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 2 }}>{f.desc}</div>
    </div>
  );
}

// Lo escrito en tramos, con cada referencia en su color (el mismo que en la grilla).
function tramos(f: string): { texto: string; color?: string }[] {
  const out: { texto: string; color?: string }[] = [];
  let i = 0;
  referencias(f).forEach((r, n) => {
    if (r.inicio > i) out.push({ texto: f.slice(i, r.inicio) });
    out.push({ texto: f.slice(r.inicio, r.fin), color: COLORES_REF[n % COLORES_REF.length] });
    i = r.fin;
  });
  if (i < f.length) out.push({ texto: f.slice(i) });
  return out;
}

const REGLAS: [string, string][] = [
  ["Parten con =", "=B2*C2"],
  ["La letra es la columna y el número la fila. La fila 1 son los nombres de columna: los datos parten en la 2.", "B2"],
  ["Mientras escribes, haz clic en una celda para insertarla. Arrastra (o Shift+clic) para un rango.", "B2:B10"],
  ["Argumentos con ; y decimales con coma. 1.500 es mil quinientos.", "=REDONDEAR(B2*1,19;0)"],
  ["Operadores: + − * / ^ (potencia), & junta textos, y > < = >= <= <> comparan.", "=B2^2&\" m²\""],
  ["F4 pone $ en la referencia ($B$2): en Excel, al copiar la fórmula esa parte no se mueve.", "=B2*$C$1"],
  ["Enter guarda y baja · Tab va a la derecha · Esc deshace lo escrito.", ""],
];

/** Guía del botón fx: cómo se escriben y qué funciones hay. Un clic en una la inserta (con una celda abierta). */
function Guia({ panelRef, puedeInsertar, onFuncion, onCerrar }: {
  panelRef: RefObject<HTMLDivElement | null>;
  puedeInsertar: boolean;
  onFuncion: (f: Funcion) => void;
  onCerrar: () => void;
}) {
  return (
    <div ref={panelRef} role="dialog" aria-label="Guía de fórmulas" style={{ ...PANEL, width: 440, maxHeight: "min(70vh, 560px)", overflowY: "auto" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", alignItems: "center", padding: "10px 12px", background: "var(--surface-1)", borderBottom: "1px solid var(--divider)" }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Fórmulas</span>
        <button type="button" aria-label="Cerrar guía" onClick={onCerrar} style={{ display: "grid", placeItems: "center", width: 26, height: 26, padding: 0, border: "none", borderRadius: 6, background: "none", color: "var(--fg-3)", cursor: "pointer" }}>
          <X size={15} />
        </button>
      </div>
      <ul style={{ margin: 0, padding: "8px 12px 4px 28px", display: "grid", gap: 6 }}>
        {REGLAS.map(([regla, ej]) => (
          <li key={regla} style={{ color: "var(--fg-2)", lineHeight: 1.4 }}>
            {regla} {ej && <code style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg-1)" }}>{ej}</code>}
          </li>
        ))}
      </ul>
      {GRUPOS.map(g => (
        <section key={g} style={{ padding: "6px 4px" }}>
          <h4 style={{ margin: "6px 8px 4px", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--fg-4)" }}>{g}</h4>
          {CATALOGO.filter(f => f.grupo === g).map(f => (
            <div
              key={f.nombre}
              role={puedeInsertar ? "button" : undefined}
              title={puedeInsertar ? "Insertar en la celda" : undefined}
              onMouseDown={() => puedeInsertar && onFuncion(f)}
              className={puedeInsertar ? "hover:bg-[var(--surface-hover)]" : undefined}
              style={{ padding: "6px 8px", borderRadius: 6, cursor: puedeInsertar ? "pointer" : "default" }}
            >
              <Firma f={f} />
              <div style={{ color: "var(--fg-3)", fontSize: 12 }}>{f.desc}</div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--fg-2)", marginTop: 1 }}>
                {f.ejemplo}
                {/* El resultado solo en los ejemplos sin celdas: los otros dependen de la hoja. */}
                {f.resultado !== undefined && referencias(f.ejemplo).length === 0 && <span style={{ color: "var(--fg-4)" }}>  →  {f.resultado}</span>}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function HojaBarraFormula({ celda, valor, resultado, inputRef, campo, onFuncion }: {
  /** Dirección de la celda abierta ("B3"), o null si no hay ninguna. */
  celda: string | null;
  valor: string;
  resultado?: Resultado;
  inputRef: RefObject<HTMLInputElement | null>;
  /** Los mismos eventos que el input de la celda (los maneja la grilla). */
  campo: React.InputHTMLAttributes<HTMLInputElement>;
  onFuncion: (f: Funcion) => void;
}) {
  const [guia, setGuia] = useState(false);
  const [fx, setFx] = useState<HTMLButtonElement | null>(null);
  const capaRef = useRef<HTMLDivElement>(null);
  const guiaRef = useRef<HTMLDivElement>(null);
  const formula = esFormula(valor);

  // El texto pintado va debajo del input (transparente) y se corre con su scroll.
  const alinear = () => {
    const capa = capaRef.current;
    if (capa && inputRef.current) capa.style.transform = `translateX(${-inputRef.current.scrollLeft}px)`;
  };
  useLayoutEffect(alinear);

  // Un clic fuera de la guía (y fuera de fx, que ya la alterna) la cierra.
  useEffect(() => {
    if (!guia) return;
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!guiaRef.current?.contains(t) && !fx?.contains(t)) setGuia(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [guia, fx]);

  const texto: React.CSSProperties = { padding: "0 10px", fontSize: 14, fontFamily: "inherit", whiteSpace: "pre" };

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 36, borderBottom: "1px solid var(--divider)", background: "var(--surface-0)" }}>
      <button
        ref={setFx}
        type="button"
        aria-label="Guía de fórmulas"
        aria-expanded={guia}
        title="Guía de fórmulas"
        onMouseDown={e => e.preventDefault()}
        onClick={() => setGuia(v => !v)}
        className={guia ? "bg-[var(--surface-hover)]" : "bg-transparent hover:bg-[var(--surface-hover)]"}
        style={{ width: 40, border: "none", borderRight: "1px solid var(--divider)", color: "var(--fg-2)", fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 15, cursor: "pointer" }}
      >
        fx
      </button>
      <div style={{ width: 56, display: "grid", placeItems: "center", borderRight: "1px solid var(--divider)", fontFamily: MONO, fontSize: 12.5, color: "var(--fg-3)" }}>
        {celda ?? ""}
      </div>
      <div style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {formula && (
          <div ref={capaRef} aria-hidden style={{ ...texto, position: "absolute", inset: 0, display: "flex", alignItems: "center", pointerEvents: "none", color: "var(--fg-1)" }}>
            {tramos(valor).map((t, i) => <span key={i} style={t.color ? { color: t.color, fontWeight: 500 } : undefined}>{t.texto}</span>)}
          </div>
        )}
        <input
          ref={inputRef}
          {...campo}
          value={valor}
          disabled={!celda}
          aria-label={celda ? `Contenido de ${celda}` : "Contenido de la celda"}
          placeholder={celda ? "" : "Elige una celda. Las fórmulas parten con ="}
          spellCheck={false}
          autoComplete="off"
          onScroll={alinear}
          onSelect={e => { campo.onSelect?.(e); requestAnimationFrame(alinear); }}
          style={{
            ...texto, position: "relative", width: "100%", height: "100%", border: "none", outline: "none", background: "transparent",
            color: formula ? "transparent" : "var(--fg-1)", caretColor: "var(--fg-1)", boxSizing: "border-box",
            // Sin esto la fuente del input no siempre calza con la de la capa pintada.
            fontWeight: 400, letterSpacing: "normal",
          }}
        />
      </div>
      {formula && resultado && (
        <div
          title={resultado.error ? `${resultado.texto}: ${explicarError(resultado.texto)}` : undefined}
          style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "45%", padding: "0 12px", fontSize: 13, color: resultado.error ? "var(--danger)" : "var(--fg-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {resultado.error ? <><TriangleAlert size={14} style={{ flexShrink: 0 }} /> {explicarError(resultado.texto)}</> : <>= {resultado.texto}</>}
        </div>
      )}
      {guia && (
        <Flotante ancla={fx}>
          <Guia panelRef={guiaRef} puedeInsertar={!!celda} onFuncion={onFuncion} onCerrar={() => setGuia(false)} />
        </Flotante>
      )}
    </div>
  );
}
