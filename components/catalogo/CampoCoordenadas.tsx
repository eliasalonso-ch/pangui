"use client";

import { useState } from "react";
import { MapPin, Check, X, ExternalLink } from "lucide-react";
import { parseCoordenadas, mensajeError, formatearCoordenadas } from "@/lib/geo-parse";

/**
 * Campo para fijar la coordenada de una sociedad o ubicación.
 *
 * El usuario pega un enlace de Google Maps o un par "lat, lng". Se prefiere esto
 * por sobre geocodificar el nombre: sobre nombres reales de ubicaciones el
 * geocodificador acierta ~20% y a veces falla con confianza (un "EDIF. N 3"
 * termino sobre un puente a 12 km). Quien conoce el terreno resuelve en segundos.
 */
export default function CampoCoordenadas({
  lat,
  lng,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  onChange: (coords: { lat: number; lng: number } | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tieneCoords = lat != null && lng != null;

  /**
   * Interpreta el texto y fija la coordenada.
   *
   * NO se llama en cada tecla a proposito. Una URL de Google Maps trae el
   * viewport (@lat,lng) ANTES del marcador real (!3d/!4d); si se parsea el
   * texto a medio llegar, el "@" hace match primero y se guardaba la posicion
   * de la camara en vez del lugar -- ademas de borrar el resto de la URL.
   * Por eso solo se confirma al pegar, al salir del campo o con Enter.
   */
  function confirmar(valor: string) {
    if (!valor.trim()) {
      setError(null);
      return;
    }
    const r = parseCoordenadas(valor);
    if (r.ok) {
      setError(null);
      setTexto("");
      onChange({ lat: r.lat, lng: r.lng });
    } else {
      setError(mensajeError(r.motivo));
    }
  }

  function limpiar() {
    onChange(null);
    setTexto("");
    setError(null);
  }

  return (
    <div>
      {tieneCoords ? (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 10px", border: "1px solid var(--border)",
            borderRadius: 6, background: "var(--surface-1)",
          }}
        >
          <MapPin size={15} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: "var(--fg-1)", fontVariantNumeric: "tabular-nums" }}>
            {formatearCoordenadas(lat, lng)}
          </span>
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Verificar en Google Maps"
            style={{ display: "inline-flex", alignItems: "center", color: "var(--fg-4)", marginLeft: "auto" }}
          >
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={limpiar}
            title="Quitar coordenada"
            style={{
              display: "inline-flex", alignItems: "center", background: "none",
              border: "none", padding: 2, cursor: "pointer", color: "var(--fg-4)",
            }}
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={texto}
          onChange={e => { setTexto(e.target.value); if (error) setError(null); }}
          onPaste={e => {
            // Se lee del portapapeles el texto COMPLETO: el onChange del input
            // puede llegar por fragmentos y dejar la URL a medias.
            const pegado = e.clipboardData.getData("text");
            if (pegado) {
              e.preventDefault();
              setTexto(pegado);
              confirmar(pegado);
            }
          }}
          onBlur={e => confirmar(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmar((e.target as HTMLInputElement).value);
            }
          }}
          placeholder="Pega el enlace de Google Maps o -36.829934, -73.035702"
          style={{
            width: "100%", height: 36, padding: "0 10px",
            border: `1px solid ${error ? "var(--danger, #dc2626)" : "var(--border)"}`,
            borderRadius: 6, fontSize: 14, color: "var(--fg-1)", outline: "none",
            fontFamily: "inherit", background: "var(--surface-1)", boxSizing: "border-box",
          }}
          onFocus={e => { if (!error) e.currentTarget.style.borderColor = "var(--brand)"; }}
        />
      )}

      {error && (
        <p style={{ fontSize: 13, color: "var(--danger, #dc2626)", margin: "5px 0 0" }}>
          {error}
        </p>
      )}

      {!tieneCoords && !error && (
        <p style={{ fontSize: 13, color: "var(--fg-4)", margin: "5px 0 0" }}>
          Busca el lugar en Google Maps y copia la URL de la barra de direcciones.
        </p>
      )}

      {tieneCoords && (
        <p style={{ fontSize: 13, color: "var(--fg-4)", margin: "5px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
          <Check size={12} /> Coordenada fijada manualmente
        </p>
      )}
    </div>
  );
}
