import LocationsTabs from "@/components/LocationsTabs";

export const metadata = { title: { default: "Ubicaciones", template: "%s | Pangui" } };

export default function LocationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* La barra (padding y linea incluidos) la dibuja LocationsTabs: en
          /ubicaciones/mapa no se muestra, y si el contenedor viviera aca
          quedaria una franja vacia con una linea suelta sobre el mapa. */}
      <LocationsTabs />
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
