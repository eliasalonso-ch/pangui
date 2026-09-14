"use client";

/**
 * El formulario de alta de medidor, en una ventana.
 *
 * Existe solo por el contenedor: desde /medidores el formulario ocupa el panel
 * derecho del master-detail, pero desde la ficha de un activo no hay panel
 * donde montarlo —la tarjeta de medidores vive dentro del detalle del activo—,
 * así que ahí va flotando.
 *
 * Lo que NO hace es duplicar el formulario: por dentro monta el mismo
 * `MedidorCrearPanel`. Dos copias de diez campos con umbrales y validaciones se
 * separan en cuanto alguien toca una.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import MedidorCrearPanel, { type MedidorCrearPanelProps } from "./MedidorCrearPanel";

export default function MedidorCrearVentana(props: MedidorCrearPanelProps) {
  const { onClose } = props;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Portal sobre document.body, NO opcional: esta tarjeta cuelga de una barra
  // `position:relative; zIndex:100`, que es un contexto de apilamiento. Sin el
  // portal, un zIndex alto acá dentro solo compite contra sus hermanos y la
  // barra queda encima — el mismo problema que ya tuvo el visor de fotos.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 640, height: "min(760px, calc(100vh - 48px))",
        background: "var(--surface-canvas)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "var(--shadow-lg)", overflow: "hidden",
      }}>
        <MedidorCrearPanel {...props} />
      </div>
    </div>,
    document.body,
  );
}
