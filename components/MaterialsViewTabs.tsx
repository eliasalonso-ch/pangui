"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Materiales", href: "/partes/materiales" },
  { label: "Ubicaciones", href: "/partes/ubicaciones" },
];

export default function MaterialsViewTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Vistas de materiales" style={{ display: "inline-flex", overflow: "hidden", border: "1px solid var(--divider)", borderRadius: 9, background: "var(--color-kumo-recessed)" }}>
      {tabs.map(tab => {
        const selected = pathname === tab.href;
        return <Link key={tab.href} href={tab.href} scroll={false} aria-current={selected ? "page" : undefined} style={{ minHeight: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", background: selected ? "var(--surface-1)" : "transparent", border: selected ? "1px solid var(--border)" : "1px solid transparent", borderRadius: selected ? 7 : 0, boxShadow: selected ? "var(--shadow-sm)" : "none", color: selected ? "var(--fg-1)" : "var(--fg-3)", fontSize: 14, fontWeight: 400, textDecoration: "none" }}>{tab.label}</Link>;
      })}
    </nav>
  );
}
