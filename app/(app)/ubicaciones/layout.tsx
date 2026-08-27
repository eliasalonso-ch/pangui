import LocationsTabs from "@/components/LocationsTabs";

export const metadata = { title: { default: "Ubicaciones", template: "%s | Pangui" } };

export default function LocationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
      <div style={{ flexShrink: 0, padding: "9px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <LocationsTabs />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
