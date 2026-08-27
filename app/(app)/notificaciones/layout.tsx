import NotificationSettingsTabs from "@/components/NotificationSettingsTabs";

// Both halves are required. Any `title` in a layout replaces the parent's
// template for the routes beneath it, so declaring one here stripped the root's
// "%s | Pangui" from every child (the bandeja tab rendered a bare "Bandeja").
// `default` names this segment; `template` restates the suffix so child routes
// keep it. Same pattern in every section layout that has children.
export const metadata = { title: { default: "Notificaciones", template: "%s | Pangui" } };

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100%", background: "var(--surface-canvas)" }}>
      <div style={{ padding: "9px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
        <NotificationSettingsTabs />
      </div>

      {children}
    </div>
  );
}
