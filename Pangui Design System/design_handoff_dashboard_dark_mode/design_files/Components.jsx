/* global React */
// Pangui v2 — shared components

const { useState, useEffect, useRef } = React;

// ============ Icon helper (renders lucide via name) ============
window.Ic = function Ic({ n, className = "ic", style }) {
  return <i data-lucide={n} className={className} style={style}></i>;
};

// ============ Button ============
window.Btn = function Btn({ variant = "secondary", icon, iconRight, sm, children, ...rest }) {
  const cls = `btn btn-${variant}${sm ? " btn-sm" : ""}` + (rest.className ? " " + rest.className : "");
  return (
    <button {...rest} className={cls}>
      {icon && <Ic n={icon} />}
      {children}
      {iconRight && <Ic n={iconRight} />}
    </button>
  );
};

window.IconBtn = function IconBtn({ icon, sm, ...rest }) {
  return (
    <button {...rest} className={`btn btn-icon${sm ? " btn-sm" : ""}` + (rest.className ? " " + rest.className : "")}>
      <Ic n={icon} />
    </button>
  );
};

// ============ Pills ============
window.StatusPill = function StatusPill({ s }) {
  const map = {
    abierta:   { c: "open",     l: "Abierta" },
    espera:    { c: "wait",     l: "En espera" },
    curso:     { c: "progress", l: "En curso" },
    revision:  { c: "review",   l: "En revisión" },
    completada:{ c: "done",     l: "Completada" },
    cancelada: { c: "cancel",   l: "Cancelada" },
  };
  const o = map[s] || map.abierta;
  return (
    <span className={`pill pill-status-${o.c}`}>
      <span className="dot" />
      {o.l}
    </span>
  );
};

window.PriorityPill = function PriorityPill({ p }) {
  const map = {
    baja:    "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
  };
  return <span className={`pill pill-prio pill-prio-${p}`}>{map[p] || "Media"}</span>;
};

// ============ Avatar ============
window.Avatar = function Avatar({ ini, color, size = "md", title }) {
  return (
    <div className={`av av-${size}`} style={{ background: color }} title={title}>
      {ini}
    </div>
  );
};

window.AvatarStack = function AvatarStack({ people = [], size = "sm", max = 3 }) {
  const visible = people.slice(0, max);
  const rest = people.length - visible.length;
  return (
    <div className={`av-stack ${size}`}>
      {visible.map((p, i) => (
        <Avatar key={i} ini={p.ini} color={p.color} size={size} title={p.name} />
      ))}
      {rest > 0 && (
        <div className={`av av-${size} more`}>+{rest}</div>
      )}
    </div>
  );
};

// ============ Search ============
window.Search = function Search({ placeholder = "Buscar…", kbd = "⌘K", onChange }) {
  return (
    <div className="searchbar">
      <Ic n="search" />
      <input placeholder={placeholder} onChange={onChange} />
      {kbd && <kbd>{kbd}</kbd>}
    </div>
  );
};

// ============ Empty state ============
window.Empty = function Empty({ icon = "inbox", title, sub, action }) {
  return (
    <div className="empty">
      <div className="ic-wrap"><Ic n={icon} /></div>
      <div className="h">{title}</div>
      {sub && <div className="s">{sub}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
};
