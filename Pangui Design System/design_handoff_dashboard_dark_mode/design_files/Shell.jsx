/* global React */
// Pangui v2 — Shell (sidebar + topbar + theme)

const { useState, useEffect } = React;

// ============ Theme manager ============
window.useTheme = function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem("pg2_theme") || "auto"; } catch { return "auto"; }
  });
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", theme);
    try { localStorage.setItem("pg2_theme", theme); } catch {}
  }, [theme]);
  return [theme, setThemeState];
};

// ============ Sidebar ============
window.Sidebar = function Sidebar({ active, onNav }) {
  const items = [
    { k: "inicio",         label: "Inicio",         icon: "home" },
    { k: "ordenes",        label: "Órdenes",        icon: "clipboard-list", badge: 3 },
    { k: "partes",         label: "Partes",         icon: "boxes" },
    { k: "equipo",         label: "Equipo",         icon: "users" },
    { k: "notificaciones", label: "Notificaciones", icon: "bell" },
    { k: "configuracion",  label: "Configuración",  icon: "settings" },
  ];
  return (
    <aside className="sb">
      <div className="sb-brand">
        <img src="assets/pangui-logo.svg" alt="Pangui" className="logo-light" />
        <img src="assets/pangui-logo-white.svg" alt="Pangui" className="logo-dark" />
      </div>
      <div className="sb-group-label">Trabajo</div>
      {items.slice(0, 4).map(i => (
        <button key={i.k}
          className={"sb-item " + (active === i.k ? "active" : "")}
          onClick={() => onNav(i.k)}>
          <Ic n={i.icon} />
          <span>{i.label}</span>
          {i.badge && <span className="badge">{i.badge}</span>}
        </button>
      ))}
      <div className="sb-group-label" style={{ marginTop: 16 }}>Sistema</div>
      {items.slice(4).map(i => (
        <button key={i.k}
          className={"sb-item " + (active === i.k ? "active" : "")}
          onClick={() => onNav(i.k)}>
          <Ic n={i.icon} />
          <span>{i.label}</span>
        </button>
      ))}
      <button className="sb-user">
        <Avatar ini="CS" color="#273D88" size="md" />
        <div className="meta">
          <div className="name">Carlos Sepúlveda</div>
          <div className="role">Admin · Mantenciones Norte</div>
        </div>
        <Ic n="chevron-right" />
      </button>
    </aside>
  );
};

// ============ Theme toggle (segmented) ============
window.ThemeToggle = function ThemeToggle({ theme, onChange }) {
  const opts = [
    { k: "light", icon: "sun",     l: "Claro" },
    { k: "auto",  icon: "monitor", l: "Auto" },
    { k: "dark",  icon: "moon",    l: "Oscuro" },
  ];
  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      {opts.map(o => (
        <button key={o.k}
          className={theme === o.k ? "active" : ""}
          onClick={() => onChange(o.k)}
          title={`Tema: ${o.l}`}>
          <Ic n={o.icon} />
        </button>
      ))}
    </div>
  );
};

// ============ Topbar ============
window.Topbar = function Topbar({ title, sub, actions, theme, onTheme }) {
  return (
    <div className="topbar">
      <div>
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <div className="topbar-actions">
        <IconBtn icon="search" sm title="Buscar (⌘K)"/>
        <IconBtn icon="bell" sm title="Notificaciones"/>
        <ThemeToggle theme={theme} onChange={onTheme} />
        {actions}
      </div>
    </div>
  );
};
