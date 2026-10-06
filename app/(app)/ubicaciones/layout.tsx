export const metadata = { title: { default: "Ubicaciones", template: "%s | Pangui" } };

export default function LocationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      {/* Ubicaciones / Lugares específicos / Asociaciones se cambia desde el
          breadcrumb del GlobalTopBar. */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
