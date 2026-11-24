import { ESTADO_VISIBLE, type EstadoVisible } from "@/lib/meconecta-conexion";

/**
 * Logo oficial de la UdeC. `completo` es el escudo + "Universidad de
 * Concepción" en texto negro: solo va sobre fondo blanco fijo (en modo oscuro
 * el texto desaparece). El escudo solo funciona sobre cualquier fondo.
 */
export function LogoUdec({ alto, completo = false }: { alto: number; completo?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={completo ? "/integraciones/udec.webp" : "/integraciones/udec-escudo.webp"}
      alt="Universidad de Concepción"
      height={alto}
      width={Math.round(alto * (completo ? 727 / 287 : 233 / 287))}
      style={{ height: alto, width: "auto", flexShrink: 0 }}
    />
  );
}

/** Ícono de la integración con Google Calendar (1280×1375). */
export function LogoGoogleCalendar({ alto }: { alto: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/integraciones/google-calendar.webp"
      alt="Google Calendar"
      height={alto}
      width={Math.round(alto * 1280 / 1375)}
      style={{ height: alto, width: "auto", flexShrink: 0 }}
    />
  );
}

/** Ícono de la integración con Google Tasks (1280×1214). */
export function LogoGoogleTasks({ alto }: { alto: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/integraciones/google-tasks.svg"
      alt="Google Tasks"
      height={alto}
      width={Math.round(alto * 1280 / 1214)}
      style={{ height: alto, width: "auto", flexShrink: 0 }}
    />
  );
}

export function LogoPangui({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="Pangui" width={size} height={size} style={{ objectFit: "contain", flexShrink: 0 }} />;
}

export function EstadoBadge({ estado, label }: {
  estado: EstadoVisible;
  /** Texto propio con el color de `estado` (p. ej. Google Calendar: "Elige calendario"). */
  label?: string;
}) {
  const e = { ...ESTADO_VISIBLE[estado], ...(label ? { label } : {}) };
  return (
    // Misma forma que la etiqueta del proveedor en la tarjeta del catálogo.
    <span style={{
      display: "inline-flex", alignItems: "center", borderRadius: "var(--r-md)", padding: "2px 8px", fontSize: 12,
      background: e.bg, color: e.fg, whiteSpace: "nowrap",
      // "Sin conectar" no tiene color propio: el borde lo separa de la tarjeta blanca.
      border: `1px solid ${estado === "sin_conexion" ? "var(--border)" : "transparent"}`,
    }}>
      {e.label}
    </span>
  );
}
