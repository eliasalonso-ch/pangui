import OrderViewTabs from "@/components/OrderViewTabs";

// Covers every route below /ordenes (lista, kanban, calendario, crear, [id]).
// The root layout's "%s | Pangui" template turns this into "Órdenes | Pangui".
export const metadata = { title: { default: "Órdenes", template: "%s | Pangui" } };

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      <div style={{ flexShrink: 0, padding: "9px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}><OrderViewTabs /></div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
