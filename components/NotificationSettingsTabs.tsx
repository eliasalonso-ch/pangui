"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NotificationSettingsTab = "notifications" | "preferences" | "alert-rules";

export default function NotificationSettingsTabs({ active }: { active?: NotificationSettingsTab }) {
  const pathname = usePathname();
  const current = active ?? (pathname.endsWith("/reglas-alerta") ? "alert-rules" : pathname.endsWith("/preferencias") ? "preferences" : "notifications");
  const tabs = [
    { key: "notifications" as const, label: "Bandeja", href: "/notificaciones/bandeja" },
    { key: "preferences" as const, label: "Preferencias", href: "/notificaciones/preferencias" },
    { key: "alert-rules" as const, label: "Reglas de alerta", href: "/notificaciones/reglas-alerta" },
  ];

  return (
    <nav aria-label="Secciones de notificaciones" style={{ display: "inline-flex", overflow: "hidden", border: "1px solid var(--divider)", borderRadius: 9, background: "var(--color-kumo-recessed)" }}>
      {tabs.map(tab => {
        const selected = current === tab.key;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={selected ? "page" : undefined}
            style={{
              minHeight: 34,
              display: "inline-flex",
              alignItems: "center",
              padding: "0 11px",
              border: selected ? "1px solid var(--border)" : "1px solid transparent",
              borderRadius: selected ? 7 : 0,
              background: selected ? "var(--surface-1)" : "transparent",
              boxShadow: selected ? "var(--shadow-sm)" : "none",
              color: selected ? "var(--fg-1)" : "var(--fg-3)",
              fontSize: 13,
              fontWeight: selected ? 600 : 500,
              textDecoration: "none",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
