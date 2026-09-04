"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Ubicaciones", href: "/ubicaciones/ubicaciones" },
  { label: "Lugares específicos", href: "/ubicaciones/lugares" },
  { label: "Asociaciones", href: "/ubicaciones/asociaciones" },
];

export default function LocationsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones de ubicaciones" style={{ display: "inline-flex", overflow: "hidden", border: "1px solid var(--divider)", borderRadius: 9, background: "var(--color-kumo-recessed)" }}>
      {tabs.map(tab => {
        const selected = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} aria-current={selected ? "page" : undefined} style={{ minHeight: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", background: selected ? "var(--surface-1)" : "transparent", border: selected ? "1px solid var(--border)" : "1px solid transparent", borderRadius: selected ? 7 : 0, boxShadow: selected ? "var(--shadow-sm)" : "none", color: selected ? "var(--fg-1)" : "var(--fg-3)", fontSize: 14, fontWeight: 400, textDecoration: "none" }}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
