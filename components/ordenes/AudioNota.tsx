"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWavesurfer } from "@wavesurfer/react";
import { Download, Loader2, Pause, Play } from "lucide-react";

// Nota de voz de la Actividad: play/pausa, la onda real del audio (wavesurfer),
// velocidad 1× / 1.5× / 2×, duración y descarga. Reemplaza el <audio controls>
// del navegador. Click o arrastre sobre la onda = saltar a ese punto.

const VELOCIDADES = [1, 1.5, 2] as const;

function mmss(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** El canvas de wavesurfer no entiende var(--x): se leen del tema al montar. */
function colorDelTema(nombre: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || fallback;
}

export function AudioNota({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [velocidad, setVelocidad] = useState<(typeof VELOCIDADES)[number]>(1);
  const [descargando, setDescargando] = useState(false);
  const colores = useMemo(() => ({
    wave: colorDelTema("--border-strong", "#CBD5E1"),
    progress: colorDelTema("--brand", "#273D88"),
  }), []);

  const { wavesurfer, isReady, isPlaying, currentTime } = useWavesurfer({
    container: containerRef,
    url: src,
    height: 28,
    waveColor: colores.wave,
    progressColor: colores.progress,
    barWidth: 3,
    barGap: 2,
    barRadius: 2,
    cursorWidth: 0,
    normalize: true,
    dragToSeek: true,
  });

  // Al terminar vuelve al inicio (la onda se vacía), como en el móvil.
  useEffect(() => {
    if (!wavesurfer) return;
    return wavesurfer.on("finish", () => wavesurfer.seekTo(0));
  }, [wavesurfer]);

  const duracion = wavesurfer?.getDuration() ?? 0;
  // En reposo, el largo; sonando o en pausa a medio camino, lo avanzado.
  const mostrado = isPlaying || currentTime > 0 ? currentTime : duracion;

  const cambiarVelocidad = () => {
    const siguiente = VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length];
    setVelocidad(siguiente);
    wavesurfer?.setPlaybackRate(siguiente);
  };

  // `download` se ignora en enlaces de otro dominio (el CDN), así que se baja
  // como blob y se guarda desde una URL local.
  const descargar = async () => {
    setDescargando(true);
    try {
      const blob = await (await fetch(src)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nota-de-voz.${src.split("?")[0].split(".").pop() || "m4a"}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDescargando(false);
    }
  };

  const botonChico: React.CSSProperties = {
    border: "none", background: "none", cursor: "pointer", padding: 4,
    color: "var(--fg-3)", display: "flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 10,
        width: 340, maxWidth: "100%", padding: "6px 10px 6px 6px",
        // Mismo tinte que la fila "Trabajo iniciado" de la Actividad
        // (TINTE_ESTADO.progress en OTDetail).
        borderRadius: 999, background: "color-mix(in srgb, var(--st-progress-dot) 7%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={() => wavesurfer?.playPause()}
        disabled={!isReady}
        aria-label={isPlaying ? "Pausar audio" : "Reproducir audio"}
        style={{
          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
          border: "none", cursor: isReady ? "pointer" : "default",
          background: "var(--brand)", color: "var(--fg-on-brand)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: isReady ? 1 : 0.6,
        }}
      >
        {!isReady ? <Loader2 size={14} className="animate-spin" />
          : isPlaying ? <Pause size={14} fill="currentColor" />
          : <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />}
      </button>

      <div ref={containerRef} style={{ flex: 1, minWidth: 0, cursor: "pointer" }} />

      <span style={{ fontSize: 13, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums", minWidth: 32, textAlign: "right" }}>
        {mmss(mostrado)}
      </span>
      <button
        type="button"
        onClick={cambiarVelocidad}
        title="Velocidad de reproducción"
        style={{
          ...botonChico, minWidth: 36, height: 22, padding: "0 6px", borderRadius: 11,
          background: "var(--surface-1)", border: "1px solid var(--border)",
          fontSize: 12, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--fg-2)",
        }}
      >
        {velocidad}×
      </button>
      <button type="button" onClick={() => void descargar()} disabled={descargando} title="Descargar audio" style={botonChico}>
        {descargando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      </button>
    </div>
  );
}
