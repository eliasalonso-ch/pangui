"use client";

import { useState, useRef, useEffect } from "react";
import { X, User, ChevronDown, Check } from "lucide-react";
import type { Usuario } from "@/types/ordenes";

/**
 * Selector de responsables. Vivía dentro de OTCrearPanel.
 *
 * Salió de ahí porque la acción "crear OT" de una automatización asigna gente
 * igual que el formulario de OT, y la alternativa era una segunda copia que se
 * separa de esta en cuanto alguien toca una.
 */
export default function AssigneeSelect({ usuarios, value, onChange }: {
  usuarios: Usuario[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = usuarios.filter(u => u.nombre.toLowerCase().includes(query.toLowerCase()));

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
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {selected.map(u => (
            <span key={u.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "2px 7px 2px 4px",
              background: "var(--brand-tint)", borderRadius: 20,
              fontSize: 14, color: "var(--brand)",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                background: "var(--brand)", color: "var(--fg-on-brand)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 400,
              }}>
                {initials(u.nombre)}
              </span>
              {u.nombre}
              <button type="button" onClick={() => toggle(u.id)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--brand)", display: "flex", padding: 0, lineHeight: 1,
              }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { setOpen(!open); setQuery(""); }}
        style={{
          height: 40, display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px", border: "1px solid var(--border)", borderRadius: 8,
          background: "var(--surface-1)", fontSize: 14, color: "var(--fg-4)",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <User size={13} />
        Asignar técnico
        <ChevronDown size={12} style={{ color: "var(--fg-4)", marginLeft: 2 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, zIndex: 200,
          minWidth: 220, background: "var(--surface-1)", border: "1px solid var(--border)",
          borderRadius: 8, boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              autoFocus
              placeholder="Buscar por nombre…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                width: "100%", height: 36, padding: "0 10px",
                border: "1px solid var(--border)", borderRadius: 6,
                fontSize: 14, outline: "none", color: "var(--fg-1)", fontFamily: "inherit",
                background: "var(--surface-1)",
              }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.map(u => {
              const sel = value.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px",
                    background: sel ? "var(--brand-tint)" : "transparent",
                    border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: sel ? "var(--brand)" : "var(--surface-hover)",
                    color: sel ? "var(--fg-on-brand)" : "var(--fg-3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 400, flexShrink: 0,
                  }}>
                    {initials(u.nombre)}
                  </span>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{u.nombre}</div>
                    <div style={{ fontSize: 14, color: "var(--fg-4)", textTransform: "capitalize" }}>{u.rol}</div>
                  </div>
                  {sel && <Check size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 14, color: "var(--fg-4)" }}>Sin resultados</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
