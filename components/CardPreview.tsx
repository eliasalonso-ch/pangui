"use client";

import { useRef, useState } from "react";

/**
 * Vista previa de la tarjeta guardada en Flow.cl.
 *
 * Flow solo devuelve `creditCardType` y `last4CardDigits` (ver FlowCustomer en
 * lib/flow.ts) — no entrega fecha de expiración, así que la tarjeta no la
 * muestra. Inventar un vencimiento en una pantalla de facturación sería peor
 * que omitirlo.
 *
 * El tilt sigue al cursor con transform 3D; en dispositivos táctiles no se
 * dispara porque depende de onMouseMove.
 */
export function CardPreview({ brand, last4 }: { brand: string | null; last4: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 50, gy: 50, active: false });

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    setTilt({
      x: (0.5 - py) * 10,   // rotateX: arriba/abajo
      y: (px - 0.5) * 14,   // rotateY: izquierda/derecha
      gx: px * 100,
      gy: py * 100,
      active: true,
    });
  }

  return (
    <div style={{ perspective: 700 }}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setTilt({ x: 0, y: 0, gx: 50, gy: 50, active: false })}
        style={{
          position: "relative",
          overflow: "hidden",
          padding: 18,
          minHeight: 168,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          background: "var(--surface-0)",
          boxShadow: tilt.active ? "var(--shadow-lg)" : "var(--shadow-sm)",
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: tilt.active ? "box-shadow .2s" : "transform .4s ease-out, box-shadow .3s",
          transformStyle: "preserve-3d",
        }}
      >
        {/* Brillo que sigue al cursor */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: tilt.active ? 1 : 0,
            transition: "opacity .3s",
            background: `radial-gradient(circle at ${tilt.gx}% ${tilt.gy}%, color-mix(in srgb, var(--fg-1) 7%, transparent) 0%, transparent 60%)`,
          }}
        />

        <ChipIcon />

        <div style={{ display: "grid", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 14, letterSpacing: 2 }}>
            <span style={{ color: "var(--fg-4)" }}>••••</span>
            <span style={{ color: "var(--fg-4)" }}>••••</span>
            <span style={{ color: "var(--fg-4)" }}>••••</span>
            <span style={{ color: "var(--fg-1)" }}>{last4 || "••••"}</span>
          </div>
          <div style={{ display: "grid", gap: 1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-2)" }}>{brand || "Tarjeta"}</p>
            <p style={{ margin: 0, fontSize: 14, color: "var(--fg-4)" }}>Procesada por Flow.cl</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="25" fill="none" viewBox="0 0 30 25" style={{ color: "var(--fg-4)" }} aria-hidden>
      <path
        fill="currentColor"
        d="M19.288 8.715h5.229v2.904h-5.229V8.715ZM5.229 13.362h5.229v2.905H5.229v-2.905Zm0-4.647h5.229v2.904H5.229V8.715ZM12.2 9.876h5.345v5.23H12.2v-5.23Zm7.088 3.486h5.229v2.905h-5.229v-2.905Zm-7.958-6.39c.48 0 .87.39.87.871v.29h1.802V6.1a.87.87 0 0 1 .255-.616l.255-.255H5.23v1.743h6.1Zm4.415-.511v1.673h1.8v-.29c0-.482.39-.872.872-.872h6.1V5.229h-7.54L15.745 6.46Zm2.672 11.549a.871.871 0 0 1-.872-.871v-.29h-1.8v2.032a.871.871 0 0 1-.256.617l-.255.255h9.283V18.01h-6.1Zm-4.415.51v-1.672H12.2v.29c0 .482-.39.872-.872.872h-6.1v1.743h7.54l1.233-1.232Z"
      />
      <path
        fill="currentColor"
        d="M25.388 0H4.358A4.362 4.362 0 0 0 0 4.357v16.267a4.362 4.362 0 0 0 4.357 4.358h21.031a4.362 4.362 0 0 0 4.358-4.358V4.357A4.362 4.362 0 0 0 25.388 0Zm.872 20.624c0 .482-.39.872-.872.872H4.358a.871.871 0 0 1-.872-.872V4.357c0-.481.39-.871.871-.871h21.031c.482 0 .872.39.872.871v16.267Z"
      />
    </svg>
  );
}
