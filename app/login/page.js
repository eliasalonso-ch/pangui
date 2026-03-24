"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { Sun, Moon, Monitor, ArrowLeft, CheckCircle2 } from "lucide-react";

const THEME_KEY = "pangui_theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: "Sistema", light: "Claro", dark: "Oscuro" };

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "system") {
    html.removeAttribute("data-theme");
    localStorage.removeItem(THEME_KEY);
  } else {
    html.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
}

const FEATURES = [
  "Órdenes de trabajo en tiempo real",
  "Gestión de inventario y stock crítico",
  "Informes PDF y Excel exportables",
  "Firma digital del cliente en terreno",
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next);
  }

  const ThemeIcon = THEME_ICON[theme];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", data.user.id)
      .maybeSingle();

    const rol = perfil?.rol;

    router.push("/ordenes");
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: "var(--font-sans, 'DM Sans', system-ui, sans-serif)",
    }}>

      {/* ── Panel izquierdo (brand) ──────────────────────────────── */}
      <div style={{
        display: "none",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "55%",
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0d1530 0%, #1a2a6c 60%, #273D88 100%)",
        padding: "40px 52px",
        position: "relative",
        overflow: "hidden",
      }}
        className="login-left-panel"
      >
        {/* Decorative circles */}
        <div style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 480,
          height: 480,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.06)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute",
          bottom: -80,
          left: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }} />

        {/* Top: logo + theme toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
          <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 100, height: "auto" }} />
          <button
            onClick={toggleTheme}
            aria-label={`Tema: ${THEME_LABEL[theme]}`}
            title={`Tema: ${THEME_LABEL[theme]}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 0,
              color: "rgba(255,255,255,0.75)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          >
            <ThemeIcon size={15} />
          </button>
        </div>

        {/* Center: headline */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 700,
            color: "#EEF1FB",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            borderLeft: "3px solid #EEF1FB",
            paddingLeft: 10,
            marginBottom: 24,
          }}>
            Plataforma de mantención
          </span>

          <h1 style={{
            fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.12,
            letterSpacing: "-0.025em",
            marginBottom: 20,
          }}>
            Gestiona tu equipo<br />desde cualquier lugar.
          </h1>

          <p style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.7,
            maxWidth: 380,
            marginBottom: 40,
          }}>
            Órdenes de trabajo, inventario y facturación para pymes de mantención en Chile.
          </p>

          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FEATURES.map((f) => (
              <li key={f} style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 12,
                fontSize: 14,
                color: "rgba(255,255,255,0.7)",
              }}>
                <CheckCircle2 size={15} style={{ color: "#10b981", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: back link */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              color: "rgba(255,255,255,0.45)",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.8)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
          >
            <ArrowLeft size={13} />
            Volver al sitio
          </Link>
        </div>
      </div>

      {/* ── Panel derecho (form) ─────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--background)",
        minHeight: "100vh",
      }}>
        {/* Mobile top bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid var(--divider-1)",
          background: "var(--accent-1)",
        }}
          className="login-mobile-bar"
        >
          <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 80, height: "auto" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={toggleTheme}
              aria-label={`Tema: ${THEME_LABEL[theme]}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 32, height: 32,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 0,
                color: "rgba(255,255,255,0.8)",
                cursor: "pointer",
              }}
            >
              <ThemeIcon size={14} />
            </button>
            <Link
              href="/"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                fontSize: 12, fontWeight: 600,
                color: "rgba(255,255,255,0.75)",
                textDecoration: "none",
                padding: "6px 12px",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 0,
              }}
            >
              <ArrowLeft size={12} />
              Volver
            </Link>
          </div>
        </div>

        {/* Form area */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}>
          <div style={{ width: "100%", maxWidth: 380 }}>

            {/* Heading */}
            <div style={{ marginBottom: 36 }}>
              <span style={{
                display: "inline-block",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--accent-1)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                borderLeft: "3px solid var(--accent-1)",
                paddingLeft: 8,
                marginBottom: 14,
              }}>
                Acceso
              </span>
              <h1 style={{
                fontSize: "clamp(1.5rem, 4vw, 1.9rem)",
                fontWeight: 900,
                color: "var(--black)",
                letterSpacing: "-0.025em",
                lineHeight: 1.15,
                marginBottom: 8,
              }}>
                Iniciar sesión
              </h1>
              <p style={{ fontSize: 14, color: "var(--accent-5)", lineHeight: 1.5 }}>
                Gestión de órdenes de trabajo
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--accent-5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 7,
                }}>
                  Correo electrónico
                </label>
                <input
                  type="email"
                  placeholder="usuario@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    border: "1.5px solid var(--divider-1)",
                    borderRadius: 0,
                    fontSize: 15,
                    fontFamily: "inherit",
                    color: "var(--black)",
                    background: "var(--background)",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-1)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--divider-1)")}
                />
              </div>

              <div>
                <label style={{
                  display: "block",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--accent-5)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: 7,
                }}>
                  Contraseña
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    border: "1.5px solid var(--divider-1)",
                    borderRadius: 0,
                    fontSize: 15,
                    fontFamily: "inherit",
                    color: "var(--black)",
                    background: "var(--background)",
                    outline: "none",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent-1)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--divider-1)")}
                />
              </div>

              {error && (
                <div style={{
                  fontSize: 13,
                  color: "var(--accent-1)",
                  background: "var(--accent-2)",
                  borderLeft: "3px solid var(--accent-1)",
                  padding: "10px 12px",
                  lineHeight: 1.4,
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "13px",
                  marginTop: 4,
                  background: loading ? "var(--accent-5)" : "var(--accent-1)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 0,
                  fontSize: 15,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  letterSpacing: "0.01em",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = "0.88"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                {loading ? "Ingresando…" : "Ingresar"}
              </button>
            </form>

            {/* Footer */}
            <p style={{
              marginTop: 32,
              fontSize: 12,
              color: "var(--accent-5)",
              textAlign: "center",
              lineHeight: 1.6,
            }}>
              ¿Problemas para acceder?{" "}
              <a href="mailto:hola@pangui.cl" style={{ color: "var(--accent-1)", textDecoration: "none", fontWeight: 600 }}>
                Contáctanos
              </a>
            </p>
          </div>
        </div>

        {/* Bottom copyright */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--divider-1)",
          fontSize: 12,
          color: "var(--accent-5)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}>
          <span>© 2026 Pangui</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/privacidad" style={{ color: "var(--accent-5)", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-1)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent-5)")}
            >Privacidad</Link>
            <Link href="/terminos" style={{ color: "var(--accent-5)", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-1)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent-5)")}
            >Términos</Link>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
