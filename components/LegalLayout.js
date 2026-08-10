"use client";

import "../app/landing.css";
import { motion } from "framer-motion";
import { LandingFooter, LandingNav } from "../app/Landing";
import PublicPageTheme from "./PublicPageTheme";

// ── Variantes de animación ──────────────────────────────────────
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
};

// ── Sección legal reutilizable ──────────────────────────────────
export function LegalSection({ icon: Icon, title, children }) {
  return (
    <motion.section
      variants={fadeUp}
      style={{
        marginBottom: "clamp(1.75rem, 4vw, 2.5rem)",
        paddingBottom: "clamp(1.75rem, 4vw, 2.5rem)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {Icon && (
          <div
            style={{
              width: 36,
              height: 36,
              background: "rgba(39, 61, 136, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--accent)",
            }}
          >
            <Icon size={17} />
          </div>
        )}
        <h2
          style={{
            fontSize: "clamp(1.05rem, 3vw, 1.35rem)",
            fontWeight: 900,
            color: "var(--ink)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
            margin: 0,
            wordBreak: "break-word",
            hyphens: "auto",
          }}
        >
          {title}
        </h2>
      </div>

      <div
        style={{
          color: "var(--ink-2)",
          lineHeight: 1.7,
          fontSize: "clamp(14px, 2vw, 15px)",
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}

// ── Layout principal ───────────────────────────────────────────
export default function LegalLayout({ children, title, description }) {
  return (
    // `landing-root` scopes the marketing palette here: these are public pages,
    // so they must stay light regardless of the dashboard's theme setting.
    <div
      className="landing-root antialiased"
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <PublicPageTheme />
      <LandingNav />

      {/* ── Hero del encabezado legal ──────────────────────────── */}
      <div
        className="landing-hero-grid"
        style={{
          paddingTop: "calc(68px + clamp(2rem, 6vw, 3.5rem))",
          paddingBottom: "clamp(1.75rem, 5vw, 3rem)",
          paddingLeft: "clamp(16px, 4vw, 24px)",
          paddingRight: "clamp(16px, 4vw, 24px)",
        }}
      >
        <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <motion.div initial="hidden" animate="visible" variants={stagger}>
            <motion.span
              variants={fadeUp}
              style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: "#EEF1FB",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                borderLeft: "4px solid #EEF1FB",
                paddingLeft: 10,
                marginBottom: 20,
              }}
            >
              Pangui · Legal
            </motion.span>

            <motion.h1
              className="font-display"
              variants={fadeUp}
              style={{
                fontSize: "clamp(1.6rem, 5vw, 3rem)",
                fontWeight: 800,
                color: "#fff",
                lineHeight: 1.12,
                letterSpacing: "-0.03em",
                marginBottom: 12,
              }}
            >
              {title}
            </motion.h1>

            {description && (
              <motion.p
                variants={fadeUp}
                style={{
                  color: "rgba(255,255,255,0.78)",
                  fontSize: "clamp(13.5px, 2.5vw, 15px)",
                  maxWidth: 520,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {description}
              </motion.p>
            )}
          </motion.div>
        </div>
      </div>

      {/* ── Contenido principal ─────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          maxWidth: "48rem",
          width: "100%",
          margin: "0 auto",
          padding: "clamp(1.75rem, 5vw, 3rem) clamp(16px, 4vw, 24px)",
        }}
      >
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={stagger}
        >
          {children}
        </motion.div>
      </main>

      <div style={{ marginTop: "auto" }}>
        <LandingFooter />
      </div>
    </div>
  );
}
