"use client";

import { useState, useRef, useEffect } from "react";
import { X, ChevronDown, Check, Search } from "lucide-react";
import type { CategoriaOT } from "@/types/ordenes";
import { CategoriaIcon } from "@/components/ordenes/categoria-icon";

// Multi-select dropdown for OT categorías (react-select / MaintainX style):
// selected items render as removable chips inside the control, a search box
// filters the options, and each option toggles on click. Stores an array of
// category ids. Purely a UI control — persistence is handled by the caller.
export default function CategoriaMultiSelect({ categorias, value, onChange }: {
  categorias: CategoriaOT[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  }

  const selected = value
    .map(id => categorias.find(c => c.id === id))
    .filter(Boolean) as CategoriaOT[];
  const filtered = categorias.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Control */}
      <div
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6,
          minHeight: 40, padding: "5px 10px",
          border: `1px solid ${open ? "var(--brand)" : "var(--border)"}`, borderRadius: 8,
          background: "var(--surface-1)", cursor: "text",
        }}
      >
        <Search size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
        {selected.map(c => (
          <span key={c.id} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 6px 2px 8px", borderRadius: 6, fontSize: 12, fontWeight: 600,
            background: c.color ?? "var(--brand-tint)",
            color: c.color ? "var(--fg-on-brand)" : "var(--brand)",
          }}>
            <CategoriaIcon icono={c.icono} size={13} />
            {c.nombre}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggle(c.id); }}
              style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, opacity: 0.8 }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? "Empiece a escribir…" : ""}
          style={{
            flex: 1, minWidth: 60, height: 26, border: "none", outline: "none",
            background: "transparent", fontSize: 13, color: "var(--fg-1)", fontFamily: "inherit",
          }}
        />
        <ChevronDown size={14} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 200,
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden", maxHeight: 240, overflowY: "auto",
        }}>
          {filtered.map(c => {
            const sel = value.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggle(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "9px 12px", fontSize: 13, textAlign: "left",
                  background: sel ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-1)",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `1px solid ${sel ? "var(--brand)" : "var(--border-strong, var(--border))"}`,
                  background: sel ? "var(--brand)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {sel && <Check size={11} style={{ color: "var(--fg-on-brand)" }} />}
                </span>
                <CategoriaIcon icono={c.icono} size={14} color={c.color ?? undefined} />
                <span style={{ flex: 1 }}>{c.nombre}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--fg-4)" }}>Sin categorías</div>
          )}
        </div>
      )}
    </div>
  );
}
