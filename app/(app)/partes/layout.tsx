export const metadata = { title: { default: "Materiales", template: "%s | Pangui" } };

export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
