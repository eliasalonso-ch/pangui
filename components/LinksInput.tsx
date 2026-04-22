"use client";

import { Plus, X, Link2, ExternalLink } from "lucide-react";
import type { OTLink } from "@/types/ordenes";

interface Props {
  links: OTLink[];
  onChange: (links: OTLink[]) => void;
  disabled?: boolean;
}

function isValidUrl(s: string) {
  try {
    const u = new URL(s.startsWith("http") ? s : "https://" + s);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

function normalizeUrl(s: string) {
  if (!s) return s;
  return s.startsWith("http://") || s.startsWith("https://") ? s : "https://" + s;
}

export default function LinksInput({ links, onChange, disabled }: Props) {
  function add() {
    onChange([...links, { url: "", label: "" }]);
  }

  function update(i: number, field: keyof OTLink, value: string) {
    onChange(links.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function remove(i: number) {
    onChange(links.filter((_, idx) => idx !== i));
  }

  function handleUrlBlur(i: number, value: string) {
    if (value && !value.startsWith("http")) {
      update(i, "url", "https://" + value);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>

      {links.map((link, i) => {
        const urlValid = !link.url || isValidUrl(link.url);
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            {/* URL */}
            <div style={{ flex: 2, minWidth: 0 }}>
              <input
                type="url"
                placeholder="https://ejemplo.com"
                value={link.url}
                disabled={disabled}
                onChange={e => update(i, "url", e.target.value)}
                onBlur={e => handleUrlBlur(i, e.target.value)}
                style={{
                  width: "100%", height: 36, padding: "0 10px",
                  border: `1px solid ${!urlValid && link.url ? "#EF4444" : "#E2E8F0"}`,
                  borderRadius: 7, fontSize: 13, color: "#0F172A",
                  background: disabled ? "#F8FAFC" : "#fff",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)"; }}
                onBlurCapture={e => { e.currentTarget.style.borderColor = !urlValid && link.url ? "#EF4444" : "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Label */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="text"
                placeholder="Nombre (opcional)"
                value={link.label ?? ""}
                disabled={disabled}
                onChange={e => update(i, "label", e.target.value)}
                style={{
                  width: "100%", height: 36, padding: "0 10px",
                  border: "1px solid #E2E8F0", borderRadius: 7,
                  fontSize: 13, color: "#0F172A",
                  background: disabled ? "#F8FAFC" : "#fff",
                  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.10)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Remove */}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(i)}
                style={{
                  width: 36, height: 36, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "none", border: "1px solid #E2E8F0",
                  borderRadius: 7, cursor: "pointer", color: "#94A3B8",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#EF4444"; e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.background = "#FEF2F2"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.background = "none"; }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}

      {!disabled && (
        <button
          type="button"
          onClick={add}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            height: 32, padding: "0 10px", alignSelf: "flex-start",
            background: "none", border: "1px dashed #CBD5E1",
            borderRadius: 7, cursor: "pointer",
            fontSize: 12, fontWeight: 500, color: "#64748B",
            fontFamily: "inherit", transition: "all 0.12s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.color = "#2563EB"; e.currentTarget.style.background = "#EFF6FF"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.color = "#64748B"; e.currentTarget.style.background = "none"; }}
        >
          <Plus size={12} />
          Agregar link
        </button>
      )}
    </div>
  );
}

// ── Read-only display used in OTDetail ────────────────────────────────────────

export function LinksDisplay({ links }: { links: OTLink[] }) {
  if (!links || links.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {links.map((link, i) => {
        const href = normalizeUrl(link.url);
        const label = link.label?.trim() || link.url;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 6,
              background: "#EFF6FF", border: "1px solid #BFDBFE",
              fontSize: 12, fontWeight: 500, color: "#1D4ED8",
              textDecoration: "none", transition: "all 0.12s",
              maxWidth: 260, overflow: "hidden",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#DBEAFE"; (e.currentTarget as HTMLElement).style.borderColor = "#93C5FD"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#EFF6FF"; (e.currentTarget as HTMLElement).style.borderColor = "#BFDBFE"; }}
          >
            <Link2 size={11} style={{ flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
            <ExternalLink size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
          </a>
        );
      })}
    </div>
  );
}
