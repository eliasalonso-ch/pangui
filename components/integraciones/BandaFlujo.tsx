/**
 * Blobs de color que viajan de un logo al otro, como un carrusel, en la banda
 * de /integraciones/meconecta.
 *
 * - Solo colores de marca: base del azul Pangui al azul UdeC (dos azules, el
 *   degradado entre ellos sigue siendo azul) y blobs sólidos en colores de
 *   marca. Bordes casi nítidos, para que no aparezcan tonos intermedios.
 * - Carrusel sin costura: la pista mide el doble de ancho con el mismo set de
 *   blobs repetido, y se desplaza exactamente la mitad.
 * - Cada blob es una forma irregular (border-radius) que rota y se estira, lo
 *   que se lee como un blob que cambia de forma. Solo se animan transforms,
 *   que corren en la GPU sin repintar.
 * - Con "reducir movimiento" todo queda quieto (los blobs siguen visibles).
 */

import type { CSSProperties } from "react";

export interface BlobDef {
  /** Posición del centro dentro de un set, en % del ancho del set y del alto de la banda. */
  x: number;
  y: number;
  /** Tamaño en px. */
  w: number;
  h: number;
  color: string;
  /** Duración del cambio de forma, en segundos. */
  dur: number;
}

const FORMAS = [
  "42% 58% 63% 37% / 41% 44% 56% 59%",
  "60% 40% 30% 70% / 60% 30% 70% 40%",
  "38% 62% 56% 44% / 53% 37% 63% 47%",
  "55% 45% 40% 60% / 45% 60% 40% 55%",
];

const CSS = `
@keyframes pg-banda-carrusel { from { transform: translateX(-50%); } to { transform: translateX(0); } }
@keyframes pg-banda-blob {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1, 1); }
  33% { transform: translate(-50%, -50%) rotate(120deg) scale(1.1, 0.92); }
  66% { transform: translate(-50%, -50%) rotate(240deg) scale(0.92, 1.08); }
}
.pg-banda-pista { animation: pg-banda-carrusel var(--pg-carrusel, 48s) linear infinite; }
.pg-banda-blob { animation: pg-banda-blob var(--pg-blob, 16s) ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .pg-banda-pista, .pg-banda-blob { animation: none; }
}
`;

function SetDeBlobs({ blobs }: { blobs: BlobDef[] }) {
  return (
    <div style={{ position: "relative", flex: "0 0 50%", height: "100%" }}>
      {blobs.map((b, i) => (
        <div
          key={i}
          className="pg-banda-blob"
          style={{
            position: "absolute", left: `${b.x}%`, top: `${b.y}%`, width: b.w, height: b.h,
            background: b.color, borderRadius: FORMAS[i % FORMAS.length], filter: "blur(1.5px)",
            transform: "translate(-50%, -50%)",
            // Desfase negativo: cada blob arranca en otro punto de su ciclo.
            animationDelay: `${-(i * 2.7)}s`,
            "--pg-blob": `${b.dur}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}

export default function BandaFlujo({ desde, hasta, blobs, segundosPorVuelta = 48 }: {
  /** Color de base a la izquierda (sale del logo de Pangui). */
  desde: string;
  /** Color de base a la derecha (llega al logo de la UdeC). */
  hasta: string;
  blobs: BlobDef[];
  segundosPorVuelta?: number;
}) {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", background: `linear-gradient(90deg, ${desde}, ${hasta})` }}>
      <style>{CSS}</style>
      <div
        className="pg-banda-pista"
        style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "200%", display: "flex", "--pg-carrusel": `${segundosPorVuelta}s` } as CSSProperties}
      >
        <SetDeBlobs blobs={blobs} />
        <SetDeBlobs blobs={blobs} />
      </div>
    </div>
  );
}
