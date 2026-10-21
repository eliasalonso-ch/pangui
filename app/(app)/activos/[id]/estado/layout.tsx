// Vista de detalle: el GlobalTopBar muestra Operaciones › Activos › Estado.
export const metadata = { title: "Estado del activo" };

export default function EstadoActivoLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100%", minHeight: 0, overflowY: "auto", background: "var(--surface-canvas)" }}>{children}</div>;
}
