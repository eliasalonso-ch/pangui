"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./BuscadorMaterial.module.css";

function stockColor(actual, minimo) {
  if (Number(actual) <= 0)          return styles.stockRojo;
  if (minimo <= 0)                   return styles.stockVerde;
  const r = Number(actual) / Number(minimo);
  if (r < 0.2)  return styles.stockRojo;
  if (r < 1)    return styles.stockAmarillo;
  return styles.stockVerde;
}

export default function BuscadorMaterial({
  plantaId,
  onSelect,
  placeholder = "Buscar por nombre o código…",
  disabled = false,
}) {
  const [query, setQuery]         = useState("");
  const [resultados, setResultados] = useState(null); // null = idle
  const [buscando, setBuscando]   = useState(false);
  const timer = useRef(null);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timer.current);
    if (!val.trim()) { setResultados(null); setBuscando(false); return; }
    setBuscando(true);
    timer.current = setTimeout(async () => {
      if (!plantaId) { setBuscando(false); return; }
      const supabase = createClient();
      const { data } = await supabase.rpc("buscar_materiales", {
        planta: plantaId,
        query:  val.trim(),
      });
      setResultados(data ?? []);
      setBuscando(false);
    }, 300);
  }

  function limpiar() {
    clearTimeout(timer.current);
    setQuery("");
    setResultados(null);
    setBuscando(false);
  }

  function seleccionar(mat) {
    limpiar();
    onSelect(mat);
  }

  const mostrarPanel = buscando || resultados !== null;

  return (
    <div className={styles.wrap}>
      <div className={styles.inputWrap}>
        <span className={styles.searchIcon}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <input
          className={styles.input}
          placeholder={placeholder}
          value={query}
          onChange={handleChange}
          disabled={disabled || !plantaId}
          autoComplete="off"
        />
        {query && (
          <button className={styles.clearBtn} onClick={limpiar} type="button" aria-label="Limpiar">
            ×
          </button>
        )}
      </div>

      {mostrarPanel && (
        <div className={styles.panel}>
          {buscando && (
            <p className={styles.panelMsg}>Buscando…</p>
          )}

          {!buscando && resultados !== null && resultados.length === 0 && (
            <p className={styles.panelMsg}>Sin resultados en inventario.</p>
          )}

          {!buscando && resultados && resultados.map((mat) => (
            <button
              key={mat.id}
              type="button"
              className={styles.resultCard}
              onClick={() => seleccionar(mat)}
            >
              <div className={styles.resultTop}>
                <span className={styles.resultNombre}>{mat.nombre}</span>
                <span className={styles.resultCodigo}>{mat.codigo}</span>
              </div>
              <div className={styles.resultMeta}>
                <span className={`${styles.resultStock} ${stockColor(mat.stock_actual, mat.stock_minimo)}`}>
                  {Number(mat.stock_actual)} {mat.unidad} en stock
                  {Number(mat.stock_actual) <= 0 && " · SIN STOCK"}
                </span>
                {mat.descripcion && (
                  <span className={styles.resultDesc}>{mat.descripcion}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
