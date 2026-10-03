"use client";

/**
 * Corriente de color animada entre los bloques de Pangui y la UdeC (banda de
 * /integraciones/meconecta). Shader WebGL de @instantshader/react, cargado solo
 * en el navegador y solo en esta página.
 *
 * - Bordes fundidos con el color sólido de cada bloque, para que la corriente
 *   "salga" de Pangui por la izquierda y "llegue" a la UdeC por la derecha.
 * - Lento y calmo: es UI de producto, no una landing.
 * - Con "reducir movimiento" no se monta: queda el degradado estático de la banda.
 * - Se pausa cuando la banda sale de la pantalla, para no gastar GPU.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

const Flow = dynamic(() => import("@instantshader/react").then((m) => m.Flow), { ssr: false });

const SIN_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

function suscribirMovimiento(cb: () => void) {
  const mq = window.matchMedia(SIN_MOVIMIENTO);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function BandaFlujo({ desde, hasta, colores }: {
  /** Color sólido del bloque izquierdo (la corriente nace de él). */
  desde: string;
  /** Color sólido del bloque derecho (la corriente desemboca en él). */
  hasta: string;
  colores: string[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  // En el servidor se asume "sin movimiento": el shader solo existe en el navegador.
  const movimiento = useSyncExternalStore(
    suscribirMovimiento,
    () => !window.matchMedia(SIN_MOVIMIENTO).matches,
    () => false,
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {movimiento && (
        <Flow
          colors={colores}
          speed={0.4}
          paused={!visible}
          params={{ scale: 1.5, curl: 0.6, drift: 0.5, openness: 0.25, grain: 0.03 }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />
      )}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `linear-gradient(90deg, ${desde} 0%, transparent 18%, transparent 82%, ${hasta} 100%)`,
      }} />
    </div>
  );
}
