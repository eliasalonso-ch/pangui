"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

const FEATURES = [
  "Órdenes de trabajo en tiempo real",
  "Gestión de inventario y stock crítico",
  "Informes PDF y Excel exportables",
  "Firma digital del cliente en terreno",
];

const inp = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  fontSize: 13.5,
  fontFamily: "inherit",
  color: "#1E2429",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.12s, box-shadow 0.12s",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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
    router.push("/ordenes");
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: 'var(--font-sans, "Geist"), system-ui, sans-serif',
    }}>

      {/* ── Left panel (brand) ── */}
      <div
        className="login-left-panel"
        style={{
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
      >
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -120, right: -120, width: 480, height: 480, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -80, left: -80, width: 320, height: 320, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <img src="/pangui-logo-white.svg" alt="Pangui" style={{ width: 100, height: "auto" }}
            onError={e => { e.currentTarget.src = "/pangui-logo.svg"; e.currentTarget.style.filter = "brightness(0) invert(1)"; }}
          />
        </div>

        {/* Headline */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700,
            color: "#EEF1FB",
            textTransform: "uppercase", letterSpacing: "0.14em",
            borderLeft: "3px solid #EEF1FB", paddingLeft: 10,
            marginBottom: 24,
          }}>
            Plataforma de mantención
          </span>
          <h1 style={{
            fontSize: "clamp(1.8rem, 3vw, 2.6rem)",
            fontWeight: 900, color: "#fff",
            lineHeight: 1.12, letterSpacing: "-0.025em",
            marginBottom: 20,
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            Gestiona tu equipo<br />desde cualquier lugar.
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, maxWidth: 380, marginBottom: 40 }}>
            Órdenes de trabajo, inventario y facturación para pymes de mantención en Chile.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FEATURES.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                <CheckCircle2 size={15} style={{ color: "#10b981", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div />
      </div>

      {/* ── Mobile top bar ── */}
      <div className="login-mobile-bar" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px",
        background: "#273D88",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 72, height: "auto", filter: "brightness(0) invert(1)" }}
          onError={e => { e.currentTarget.style.filter = "none"; }} />
        <div />
      </div>

      {/* ── Right panel (form) ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        minHeight: "100vh",
      }}>
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}>
          <div style={{ width: "100%", maxWidth: 380 }}>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 24, fontWeight: 800,
                color: "#0A0F1E", margin: "0 0 6px",
                letterSpacing: "-0.02em",
                fontFamily: '"Inter", system-ui, sans-serif',
              }}>
                Inicia sesión
              </h2>
              <p style={{ color: "#4D5A66", fontSize: 13.5, margin: 0 }}>
                Accede a tu panel de mantención.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#4D5A66", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  placeholder="tu@empresa.cl"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  style={inp}
                  onFocus={e => { e.currentTarget.style.borderColor = "#273D88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(39,61,136,0.15)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#4D5A66", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Contraseña
                  </label>
                  <a href="mailto:hola@pangui.cl" style={{ fontSize: 12, color: "#273D88", fontWeight: 600, textDecoration: "none" }}>
                    ¿Olvidaste?
                  </a>
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ ...inp, paddingRight: 38 }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#273D88"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(39,61,136,0.15)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}
                  >
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: 12.5, color: "#DC2626",
                  background: "#FEF2F2",
                  borderLeft: "3px solid #DC2626",
                  padding: "10px 12px",
                  borderRadius: "0 6px 6px 0",
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
                  padding: "12px",
                  marginTop: 4,
                  background: loading ? "#4D5A66" : "#273D88",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#1F316E"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#273D88"; }}
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Ingresando…" : "Iniciar sesión"}
              </button>
            </form>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #F1F3F5", fontSize: 13, color: "#4D5A66", textAlign: "center" }}>
              ¿Aún no tienes cuenta?{" "}
              <a href="mailto:hola@pangui.cl" style={{ color: "#273D88", fontWeight: 600, textDecoration: "none" }}>
                Contáctanos →
              </a>
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #F1F3F5", fontSize: 12, color: "#9CA3AF" }}>
          <span>© 2026 Pangui</span>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .login-mobile-bar { display: flex !important; }
          .pg-form-wrap { padding-top: 72px !important; }
        }
      `}</style>
    </div>
  );
}
