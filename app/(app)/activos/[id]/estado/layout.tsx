// Vista de detalle. El selector "Activos | Ubicaciones" del layout padre se
// oculta solo en estas rutas (ver AssetViewTabs): es de las vistas de lista y
// no tiene sentido dentro de la ficha de un activo.
export const metadata = { title: "Estado del activo" };

export default function EstadoActivoLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100%", minHeight: 0, overflowY: "auto", background: "var(--surface-canvas)" }}>{children}</div>;
}
