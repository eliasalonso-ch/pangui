export const metadata = { title: { default: "Activos", template: "%s | Pangui" } };

export default function AssetsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* Activos / Ubicaciones se cambia desde el breadcrumb del GlobalTopBar. */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
