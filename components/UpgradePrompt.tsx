"use client";

import Link from "next/link";
import { ArrowUpRight, Lock, Sparkles } from "lucide-react";

interface UpgradePromptProps {
  /** What the user tried to do, e.g. "adjuntar más procedimientos este mes". */
  title:        string;
  /** Optional sub-line, e.g. "Llegaste al límite de 5 OT con procedimientos / mes en Basic." */
  description?: string;
  /** Recommended upgrade target plan name, e.g. "Esencial" or "Pro". */
  upgradeTo?:   string;
  /** Visual size — "inline" for tooltip/inline messaging, "card" for blocking screens. */
  variant?:     "inline" | "card";
  /** Custom CTA label. Defaults to "Sube a <plan>" / "Ver planes". */
  ctaLabel?:    string;
  /** Override link target. Defaults to /configuracion/suscripcion. */
  href?:        string;
}

export function UpgradePrompt({
  title,
  description,
  upgradeTo,
  variant = "inline",
  ctaLabel,
  href = "/configuracion/suscripcion",
}: UpgradePromptProps) {
  const cta = ctaLabel ?? (upgradeTo ? `Sube a ${upgradeTo}` : "Ver planes");

  if (variant === "card") {
    return (
      <div style={{
        background: "linear-gradient(135deg, var(--brand-tint), var(--surface-1))",
        border: "1px solid var(--border-strong)",
        borderRadius: 12,
        padding: 24,
        textAlign: "center",
        maxWidth: 480,
        margin: "40px auto",
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "var(--brand)", color: "var(--surface-1)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          marginBottom: 14,
        }}>
          <Sparkles size={20} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)", margin: "0 0 8px" }}>{title}</h2>
        {description && (
          <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "0 0 18px", lineHeight: 1.5 }}>{description}</p>
        )}
        <Link href={href} style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          height: 40, padding: "0 18px",
          background: "var(--brand)", color: "var(--surface-1)",
          borderRadius: "var(--r-md)", fontSize: 13, fontWeight: 600,
          textDecoration: "none",
        }}>
          {cta} <ArrowUpRight size={14} />
        </Link>
      </div>
    );
  }

  // inline variant — compact banner for use beside disabled controls
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "8px 12px",
      background: "var(--st-wait-bg)",
      border: "1px solid var(--border-strong)",
      borderRadius: "var(--r-sm)",
      fontSize: 12, color: "var(--fg-1)",
    }}>
      <Lock size={13} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
        <strong>{title}</strong>{description ? ` — ${description}` : ""}
      </span>
      <Link href={href} style={{
        marginLeft: 4,
        color: "var(--brand-fg)", fontWeight: 600,
        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3,
      }}>
        {cta} <ArrowUpRight size={11} />
      </Link>
    </div>
  );
}
