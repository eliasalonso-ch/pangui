import NotificationSettingsTabs from "@/components/NotificationSettingsTabs";

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
