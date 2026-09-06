"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Activos", href: "/activos/activos" },
  { label: "Ubicaciones", href: "/activos/ubicaciones" },
];

export default function AssetViewTabs() {
  const pathname = usePathname();
  // El conmutador es de las vistas de lista. En una ficha de activo
  // (/activos/<id>/...) no aplica: ninguna pestaña está seleccionada y ocupa
  // una barra entera sin decir nada.
  if (!tabs.some(t => pathname === t.href)) return null;
  return (
    // La franja (padding + linea inferior) va acá y no en el layout: si vive
    // afuera, al ocultarse las pestañas queda una barra vacía con su borde
    // colgando arriba de la ficha del activo.
    <div style={{ flexShrink: 0, padding: "9px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-canvas)" }}>
    <nav aria-label="Vistas de activos" style={{ display: "inline-flex", overflow: "hidden", border: "1px solid var(--divider)", borderRadius: 9, background: "var(--color-kumo-recessed)" }}>
      {tabs.map(tab => {
        const selected = pathname === tab.href;
        return <Link key={tab.href} href={tab.href} scroll={false} aria-current={selected ? "page" : undefined} style={{ minHeight: 34, padding: "0 11px", display: "inline-flex", alignItems: "center", background: selected ? "var(--surface-1)" : "transparent", border: selected ? "1px solid var(--border)" : "1px solid transparent", borderRadius: selected ? 7 : 0, boxShadow: selected ? "var(--shadow-sm)" : "none", color: selected ? "var(--fg-1)" : "var(--fg-3)", fontSize: 14, fontWeight: 400, textDecoration: "none" }}>{tab.label}</Link>;
      })}
    </nav>
    </div>
  );
}
