"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

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
        borderBottom: "1px solid var(--divider-1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {Icon && (
          <div
            style={{
              width: 36,
              height: 36,
              background: "var(--accent-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "var(--accent-1)",
            }}
          >
            <Icon size={17} />
          </div>
        )}
        <h2
          style={{
            fontSize: "clamp(1.05rem, 3vw, 1.35rem)",
            fontWeight: 900,
            color: "var(--black)",
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
          color: "var(--accent-5)",
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
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        fontFamily: "var(--font-sans, 'DM Sans', system-ui, sans-serif)",
        background: "var(--background)",
        color: "var(--black)",
      }}
    >
      {/* ── Navbar (sticky) ─────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "#273D88",
          height: 60,
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingLeft: "clamp(12px, 4vw, 24px)",
          paddingRight: "clamp(12px, 4vw, 24px)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "48rem",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          {/* Logo */}
          <Link href="/" style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <img
              src="/logo6.svg"
              alt="Pangui"
              style={{ width: "clamp(100px, 22vw, 130px)", height: "auto" }}
            />
          </Link>

          {/* Volver */}
          {mounted && (
            <button
              onClick={handleBack}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.85)",
                background: "transparent",
                padding: "6px clamp(8px, 2vw, 14px)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 4,
                cursor: "pointer",
                transition: "color 0.15s, background 0.15s",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#fff";
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "rgba(255,255,255,0.85)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <ArrowLeft size={13} />
              Volver
            </button>
          )}
        </div>
      </header>

      {/* ── Hero del encabezado legal ──────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0a0f1e 0%, #0d1530 100%)",
          paddingTop: "clamp(2rem, 6vw, 3.5rem)",
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
              variants={fadeUp}
              style={{
                fontSize: "clamp(1.6rem, 5vw, 3rem)",
                fontWeight: 900,
                color: "#fff",
                lineHeight: 1.12,
                letterSpacing: "-0.025em",
                marginBottom: 12,
              }}
            >
              {title}
            </motion.h1>

            {description && (
              <motion.p
                variants={fadeUp}
                style={{
                  color: "#94a3b8",
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

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        style={{
          background: "#0A1628",
          padding: "1.5rem clamp(16px, 4vw, 24px)",
          marginTop: "auto",
        }}
      >
        <div
          style={{
            maxWidth: "48rem",
            margin: "0 auto",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
            color: "#475569",
          }}
        >
          <p style={{ margin: 0, flex: "1 1 auto", minWidth: 0 }}>
            © 2026 Pangui. Hecho en Chile con ♥ para pymes de mantención.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px" }}>
            {[
              { label: "Privacidad", href: "/privacidad" },
              { label: "Términos", href: "/terminos" },
              { label: "Portal ARCO", href: "/arco" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ color: "#475569", textDecoration: "none", transition: "color 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
