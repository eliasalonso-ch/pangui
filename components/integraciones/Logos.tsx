import { ESTADO_VISIBLE, type EstadoVisible } from "@/lib/meconecta-conexion";

// Placeholder hasta tener el logo oficial de la UdeC.
export function LogoUdec({ size }: { size: number }) {
  return (
    <div
      role="img"
      aria-label="Universidad de Concepción"
      style={{
        width: size, height: size, borderRadius: size * 0.22, flexShrink: 0,
        display: "grid", placeItems: "center",
        background: "var(--brand-tint)", color: "var(--brand)",
        fontSize: Math.round(size * 0.3), fontWeight: 500, letterSpacing: "-0.02em",
      }}
    >
      UdeC
    </div>
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
