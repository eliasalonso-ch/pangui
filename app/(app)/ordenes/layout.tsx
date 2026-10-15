// Covers every route below /ordenes (lista, kanban, calendario, crear, [id]).
// The root layout's "%s | Pangui" template turns this into "Órdenes | Pangui".
export const metadata = { title: { default: "Órdenes", template: "%s | Pangui" } };

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* La vista (Lista / Calendario / Kanban) se cambia desde el breadcrumb
          del GlobalTopBar; ya no hay una barra con control segmentado acá. */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
