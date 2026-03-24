"use client";
import { Lock, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Full-page paywall screen shown when a Basic user tries to access a Pro feature.
 *
 * Props:
 *  - feature:    string   e.g. "Mantenimiento Preventivo"
 *  - description: string  one-line value prop
 *  - bullets:    string[] list of what they unlock
 *  - icon:       component (optional) Lucide icon to display
 */
export default function PaywallBanner({ feature, description, bullets = [], icon: Icon }) {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "60dvh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1.25rem calc(var(--bottomnav-height) + 2rem)",
    }}>
      <div style={{
        maxWidth: 480,
        width: "100%",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0,
      }}>
        {/* Icon */}
        <div style={{
          width: 64, height: 64, borderRadius: 18,
          background: "var(--accent-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent-1)", marginBottom: 20,
        }}>
          {Icon ? <Icon size={28} /> : <Lock size={28} />}
        </div>

        {/* Badge */}
        <span style={{
          display: "inline-block", fontSize: 11, fontWeight: 700,
          color: "var(--accent-1)", textTransform: "uppercase",
          letterSpacing: "0.1em", background: "var(--accent-2)",
          padding: "3px 12px", borderRadius: 20, marginBottom: 14,
        }}>
          Plan Pro
        </span>

        <h2 style={{
          fontSize: "clamp(1.3rem, 4vw, 1.7rem)", fontWeight: 900,
          color: "var(--black)", letterSpacing: "-0.02em",
          margin: "0 0 10px",
        }}>
          {feature}
        </h2>

        <p style={{
          fontSize: 14, color: "var(--accent-5)", lineHeight: 1.6,
          margin: "0 0 24px", maxWidth: 360,
        }}>
          {description}
        </p>

        {/* Bullets */}
        {bullets.length > 0 && (
          <ul style={{
            listStyle: "none", padding: 0, margin: "0 0 28px",
            display: "flex", flexDirection: "column", gap: 10,
            alignSelf: "stretch", textAlign: "left",
            background: "var(--accent-2)", borderRadius: 12,
            padding: "18px 20px",
          }}>
            {bullets.map((b) => (
              <li key={b} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                fontSize: 13, color: "var(--black)", lineHeight: 1.5,
              }}>
                <Zap size={13} style={{ color: "var(--accent-1)", flexShrink: 0, marginTop: 2 }} />
                {b}
              </li>
            ))}
          </ul>
        )}

        {/* CTA */}
        <button
          onClick={() => router.push("/configuracion/suscripcion")}
          style={{
            width: "100%", padding: "14px 0",
            background: "var(--accent-1)", color: "#fff",
            border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Zap size={15} /> Ver planes Pro
        </button>

        <p style={{ marginTop: 12, fontSize: 12, color: "var(--accent-6)" }}>
          $29.990 CLP / mes · Cancela cuando quieras
        </p>
      </div>
    </div>
  );
}
