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

export function LogoPangui({ size }: { size: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt="Pangui" width={size} height={size} style={{ objectFit: "contain", flexShrink: 0 }} />;
}

export function EstadoBadge({ estado }: { estado: EstadoVisible }) {
  const e = ESTADO_VISIBLE[estado];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "3px 10px", fontSize: 13, background: e.bg, color: e.fg, whiteSpace: "nowrap" }}>
      {e.label}
    </span>
  );
}
