"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";

const FEATURES = [
  "Órdenes de trabajo en tiempo real",
  "Gestión de inventario y stock crítico",
  "Informes PDF y Excel exportables",
  "Firma digital del cliente en terreno",
];

const inp = {
  width: "100%",
  height: 42,
  padding: "0 12px",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: 14,
  fontFamily: "inherit",
  color: "#0F172A",
  background: "#FFFFFF",
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
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (authError) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }
    router.push("/inicio");
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
          width: "52%",
          minHeight: "100vh",
          background: "linear-gradient(160deg, #0F172A 0%, #1E3A8A 55%, #2563EB 100%)",
          padding: "44px 56px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Dot grid overlay */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -140, right: -140, width: 520, height: 520, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 360, height: 360, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <img src="/logo6.svg" alt="Pangui" style={{ height: 28, width: "auto"}}
            onError={e => { e.currentTarget.src = "/logo6.svg";}}
          />
        </div>

        {/* Headline */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11, fontWeight: 700,
            color: "rgba(255,255,255,0.6)",
            textTransform: "uppercase", letterSpacing: "0.12em",
            borderLeft: "3px solid rgba(255,255,255,0.4)", paddingLeft: 10,
            marginBottom: 28,
          }}>
            Plataforma de mantención
          </span>
          <h1 style={{
            fontSize: "clamp(1.9rem, 2.8vw, 2.8rem)",
            fontWeight: 900, color: "#fff",
            lineHeight: 1.1, letterSpacing: "-0.03em",
            marginBottom: 20,
            fontFamily: '"Inter", system-ui, sans-serif',
          }}>
            Gestiona tu equipo<br />desde cualquier lugar.
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, maxWidth: 380, marginBottom: 44 }}>
            Órdenes de trabajo, inventario y facturación para pymes de mantención en Chile.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FEATURES.map(f => (
              <li key={f} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                <CheckCircle2 size={16} style={{ color: "#10B981", flexShrink: 0 }} />
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
        display: "flex", alignItems: "center",
        padding: "14px 24px",
        background: "#1E3A8A",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <img src="/logo2.svg" alt="Pangui" style={{ height: 24, width: "auto", filter: "brightness(0) invert(1)" }}
          onError={e => { e.currentTarget.style.filter = "none"; }} />
      </div>

      {/* ── Right panel (form) ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#F8FAFC",
        minHeight: "100vh",
      }}>
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}>
          <div style={{
            width: "100%", maxWidth: 400,
            background: "#FFFFFF",
            borderRadius: 16,
            padding: "40px 36px",
            boxShadow: "0 10px 40px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)",
            border: "1px solid #E2E8F0",
          }}>

            {/* Heading */}
            <div style={{ marginBottom: 32 }}>
              <h2 style={{
                fontSize: 24, fontWeight: 800,
                color: "#0F172A", margin: "0 0 6px",
                letterSpacing: "-0.025em",
                fontFamily: '"Inter", system-ui, sans-serif',
              }}>
                Inicia sesión
              </h2>
              <p style={{ color: "#475569", fontSize: 14, margin: 0 }}>
                Accede a tu panel de mantención.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", marginBottom: 6 }}>
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
                  onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>
                    Contraseña
                  </label>
                  <a href="mailto:hola@pangui.cl" style={{ fontSize: 12, color: "#2563EB", fontWeight: 500, textDecoration: "none" }}>
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
                    style={{ ...inp, paddingRight: 42 }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", padding: 0 }}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  fontSize: 13, color: "#DC2626",
                  background: "#FEF2F2",
                  borderLeft: "3px solid #EF4444",
                  padding: "10px 14px",
                  borderRadius: "0 8px 8px 0",
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
                  height: 44,
                  marginTop: 4,
                  background: loading ? "#64748B" : "linear-gradient(135deg, #1E3A8A, #2563EB)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "opacity 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: loading ? "none" : "0 2px 8px rgba(37,99,235,0.30)",
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = "1"; }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? "Ingresando…" : "Iniciar sesión"}
              </button>
            </form>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #F1F5F9", fontSize: 13, color: "#64748B", textAlign: "center" }}>
              ¿Aún no tienes cuenta?{" "}
              <a href="mailto:hola@pangui.cl" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
                Contáctanos →
              </a>
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
          © 2026 Pangui
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .login-mobile-bar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
