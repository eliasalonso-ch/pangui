"use client";

/**
 * Campos compartidos del formulario de OT.
 *
 * Vivían dentro de OTCrearForm; se sacaron aquí cuando los planes de mantención
 * necesitaron la misma plantilla de OT. Compartir el módulo —en vez de copiar el
 * markup— es lo que garantiza que crear una OT y definir la plantilla de un plan
 * se vean y se comporten igual, y que un arreglo en uno llegue al otro.
 */

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Check, User, X } from "lucide-react";
import type { Usuario } from "@/types/ordenes";

// ── Shared field row ─────────────────────────────────────

export function FieldRow({ icon, label, children }: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "14px 0" }}>
      <div style={{ width: 16, paddingTop: 3, display: "flex", justifyContent: "flex-start", flexShrink: 0, color: "var(--brand)" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 10 }}>
          {label}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Searchable dropdown ──────────────────────────────────

export function SearchSelect({ placeholder, value, options, onChange }: {
  placeholder: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14, color: selected ? "var(--fg-1)" : "var(--fg-4)",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--fg-4)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 50,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid var(--border)", borderRadius: 4,
                fontSize: 14, outline: "none", color: "var(--fg-1)", background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "8px 12px", fontSize: 14, color: "var(--fg-3)",
                background: !value ? "var(--brand-tint)" : "transparent",
                border: "none", cursor: "pointer",
              }}
            >
              Sin asignar
            </button>
            {filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", textAlign: "left",
                  padding: "8px 12px", fontSize: 14, color: "var(--fg-1)",
                  background: value === o.id ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                {value === o.id && <Check size={12} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                <span>{o.label}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-3)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assignee multi-select ───────────────────────────────

export function AssigneeSelect({ usuarios, value, onChange }: {
  usuarios: Usuario[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = usuarios.filter(u =>
    u.nombre.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function initials(name: string) {
    const p = name.trim().split(/\s+/);
    return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
    setOpen(false);
  }

  const selected = value.map(id => usuarios.find(u => u.id === id)).filter(Boolean) as Usuario[];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Chips of selected */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: selected.length ? 8 : 0 }}>
        {selected.map(u => (
          <span key={u.id} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "3px 8px 3px 5px",
            background: "var(--brand-tint)", borderRadius: 20,
            fontSize: 14, color: "var(--brand)",
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: "50%",
              background: "var(--brand)", color: "var(--fg-on-brand)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 400,
            }}>
              {initials(u.nombre)}
            </span>
            {u.nombre}
            <button type="button" onClick={() => toggle(u.id)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--brand)", display: "flex", padding: 0,
            }}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          height: 36, display: "flex", alignItems: "center", gap: 8,
          padding: "0 10px", border: "1px solid var(--border)", borderRadius: 6,
          background: "var(--surface-1)", fontSize: 14, color: "var(--fg-3)",
          cursor: "pointer",
        }}
      >
        <User size={14} />
        Asignar técnico
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          minWidth: 240, background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: 6, boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 32, padding: "0 8px",
                border: "1px solid var(--border)", borderRadius: 4,
                fontSize: 14, outline: "none", color: "var(--fg-1)", background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.map(u => {
              const sel = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "9px 12px",
                    background: sel ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: sel ? "var(--brand)" : "var(--surface-hover)",
                    color: sel ? "var(--fg-on-brand)" : "var(--fg-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 400, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{u.nombre}</div>
                    <div style={{ fontSize: 14, color: "var(--fg-3)", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={14} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 14, color: "var(--fg-3)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
