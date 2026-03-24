"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  ArrowLeft, ArrowRight, CheckCircle2, Sun, Moon, Monitor,
  User, Mail, Lock, Building2, Briefcase, Users, MapPin, Layers,
  Eye, EyeOff,
} from "lucide-react";

const THEME_KEY = "pangui_theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };

function applyTheme(t) {
  const html = document.documentElement;
  if (t === "system") { html.removeAttribute("data-theme"); localStorage.removeItem(THEME_KEY); }
  else { html.setAttribute("data-theme", t); localStorage.setItem(THEME_KEY, t); }
}

const SECTORES = [
  { value: "mineria", label: "Minería" },
  { value: "facilities", label: "Facilities / Universidades / Hospitales" },
  { value: "industria", label: "Industria manufacturera" },
  { value: "construccion", label: "Construcción" },
  { value: "puertos", label: "Puertos y logística" },
  { value: "agro", label: "Agricultura" },
  { value: "otro", label: "Otro" },
];

const CARGOS = [
  { value: "jefe_mantencion", label: "Jefe de Mantención" },
  { value: "supervisor", label: "Supervisor de Operaciones" },
  { value: "ingeniero", label: "Ingeniero de Mantenimiento" },
  { value: "tecnico_senior", label: "Técnico Senior" },
  { value: "gerente", label: "Gerente de Planta" },
  { value: "contratista", label: "Contratista independiente" },
  { value: "otro", label: "Otro" },
];

const TAMAÑOS = [
  { value: "1-5", label: "1 – 5 técnicos" },
  { value: "6-15", label: "6 – 15 técnicos" },
  { value: "16-40", label: "16 – 40 técnicos" },
  { value: "40+", label: "Más de 40 técnicos" },
];

const REGIONES = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama",
  "Coquimbo", "Valparaíso", "Metropolitana de Santiago",
  "Libertador Gral. Bernardo O'Higgins", "Maule", "Ñuble",
  "Biobío", "La Araucanía", "Los Ríos", "Los Lagos",
  "Aysén", "Magallanes",
];

const inputStyle = {
  width: "100%", padding: "11px 14px 11px 38px",
  border: "1.5px solid var(--divider-1)", borderRadius: 0,
  fontSize: 15, fontFamily: "inherit", color: "var(--black)",
  background: "var(--background)", outline: "none",
  boxSizing: "border-box", transition: "border-color 0.15s",
};

const selectStyle = {
  width: "100%", padding: "11px 14px",
  border: "1.5px solid var(--divider-1)", borderRadius: 0,
  fontSize: 15, fontFamily: "inherit", color: "var(--black)",
  background: "var(--background)", outline: "none",
  boxSizing: "border-box", cursor: "pointer",
  appearance: "none",
};

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: "var(--accent-5)", textTransform: "uppercase",
  letterSpacing: "0.08em", marginBottom: 7,
};

function Field({ icon: Icon, label, children }) {
  return (
    <div style={{ position: "relative" }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        {Icon && (
          <Icon size={15} style={{
            position: "absolute", left: 12, top: "50%",
            transform: "translateY(-50%)", color: "var(--accent-5)", pointerEvents: "none",
          }} />
        )}
        {children}
      </div>
    </div>
  );
}

export default function RegistroPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [theme, setTheme] = useState("system");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2
  const [empresaNombre, setEmpresaNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [sector, setSector] = useState("");
  const [tamañoEquipo, setTamañoEquipo] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next);
  }

  const ThemeIcon = THEME_ICON[theme];

  function validateStep1() {
    if (!nombre.trim()) return "Ingresa tu nombre completo.";
    if (!email.trim() || !email.includes("@")) return "Ingresa un correo válido.";
    if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
    return null;
  }

  function handleNext(e) {
    e.preventDefault();
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!empresaNombre.trim()) { setError("Ingresa el nombre de tu empresa."); return; }
    setError(null);
    setLoading(true);

    try {
      // 1. Crear cuenta vía API (service role server-side)
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          password,
          empresa_nombre: empresaNombre.trim(),
          cargo: cargo || null,
          sector: sector || null,
          tamaño_equipo: tamañoEquipo || null,
          region: region || null,
        }),
      });

      const data = await res.json();
      if (!data.ok) { setError(data.error ?? "Error al crear la cuenta."); setLoading(false); return; }

      // 2. Iniciar sesión automáticamente
      const supabase = createClient();
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (loginErr) {
        setError("Cuenta creada. Inicia sesión manualmente.");
        router.push("/login");
        return;
      }

      router.push("/ordenes");
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setLoading(false);
    }
  }

  const progressPct = step === 1 ? 50 : 100;

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      fontFamily: "var(--font-sans, 'DM Sans', system-ui, sans-serif)",
    }}>
      {/* ── Panel izquierdo (brand) ──────────────────── */}
      <div
        className="registro-left"
        style={{
          display: "none", flexDirection: "column", justifyContent: "space-between",
          width: "45%", minHeight: "100vh",
          background: "linear-gradient(160deg, #0d1530 0%, #1a2a6c 60%, #273D88 100%)",
          padding: "40px 48px", position: "relative", overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -60, left: -60, width: 280, height: 280, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
          <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 90, height: "auto" }} />
          <button onClick={toggleTheme} style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0,
            color: "rgba(255,255,255,0.7)", cursor: "pointer",
          }}>
            <ThemeIcon size={14} />
          </button>
        </div>

        {/* Copy */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700, color: "#EEF1FB",
            textTransform: "uppercase", letterSpacing: "0.14em",
            borderLeft: "3px solid #EEF1FB", paddingLeft: 10, marginBottom: 20,
          }}>
            30 días gratis · Sin tarjeta
          </span>
          <h1 style={{
            fontSize: "clamp(1.6rem, 2.5vw, 2.2rem)", fontWeight: 900, color: "#fff",
            lineHeight: 1.12, letterSpacing: "-0.025em", marginBottom: 16,
          }}>
            Tu equipo de mantención,<br />digitalizado en minutos.
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, maxWidth: 340, marginBottom: 36 }}>
            Usado por jefes de mantención en minería, facilities e industria en Chile.
          </p>

          {[
            "Órdenes de trabajo en tiempo real",
            "Checklists DS 594 y firma digital",
            "Facturación electrónica SII incluida",
            "Inventario con alertas de stock crítico",
            "Reportes KPI para gerencia",
          ].map((f) => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              <CheckCircle2 size={14} style={{ color: "#10b981", flexShrink: 0 }} />
              {f}
            </div>
          ))}
        </div>

        {/* Back link */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
            <ArrowLeft size={12} /> Volver al sitio
          </Link>
        </div>
      </div>

      {/* ── Panel derecho (form) ─────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--background)", minHeight: "100vh" }}>

        {/* Mobile top bar */}
        <div className="registro-mobile-bar" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--divider-1)",
          background: "var(--accent-1)",
        }}>
          <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 76, height: "auto" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={toggleTheme} style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 0,
              color: "rgba(255,255,255,0.8)", cursor: "pointer",
            }}>
              <ThemeIcon size={13} />
            </button>
            <Link href="/" style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)",
              textDecoration: "none", padding: "5px 10px",
              border: "1px solid rgba(255,255,255,0.2)", borderRadius: 0,
            }}>
              <ArrowLeft size={11} /> Volver
            </Link>
          </div>
        </div>

        {/* Form area */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
          <div style={{ width: "100%", maxWidth: 400 }}>

            {/* Progress */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Paso {step} de 2
                </span>
                <span style={{ fontSize: 11, color: "var(--accent-5)" }}>{progressPct}%</span>
              </div>
              <div style={{ height: 3, background: "var(--divider-1)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: "var(--accent-1)", borderRadius: 2, transition: "width 0.4s ease" }} />
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700,
                color: "var(--accent-1)", textTransform: "uppercase",
                letterSpacing: "0.12em", borderLeft: "3px solid var(--accent-1)",
                paddingLeft: 8, marginBottom: 12,
              }}>
                {step === 1 ? "Crear cuenta" : "Tu empresa"}
              </span>
              <h1 style={{
                fontSize: "clamp(1.3rem, 4vw, 1.7rem)", fontWeight: 900,
                color: "var(--black)", letterSpacing: "-0.025em", marginBottom: 6,
              }}>
                {step === 1 ? "Comienza tu prueba gratis" : "Cuéntanos sobre tu equipo"}
              </h1>
              <p style={{ fontSize: 13, color: "var(--accent-5)" }}>
                {step === 1
                  ? "30 días gratis. Sin tarjeta de crédito."
                  : "Nos ayuda a personalizar tu experiencia."}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: "10px 12px", borderLeft: "3px solid var(--accent-1)",
                background: "var(--accent-2)", color: "var(--accent-1)",
                fontSize: 13, marginBottom: 20, lineHeight: 1.4,
              }}>
                {error}
              </div>
            )}

            {/* ── Step 1: Credenciales ─────────────────── */}
            {step === 1 && (
              <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field icon={User} label="Nombre completo">
                  <input
                    type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                    placeholder="Juan Pérez" required style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-1)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--divider-1)")}
                  />
                </Field>

                <Field icon={Mail} label="Correo electrónico">
                  <input
                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="juan@empresa.cl" required style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-1)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--divider-1)")}
                  />
                </Field>

                <Field icon={Lock} label="Contraseña">
                  <input
                    type={showPass ? "text" : "password"}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres" required style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-1)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--divider-1)")}
                  />
                  <button
                    type="button" onClick={() => setShowPass(!showPass)}
                    style={{
                      position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", cursor: "pointer",
                      color: "var(--accent-5)", padding: 2,
                    }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </Field>

                {/* Strength indicator */}
                {password.length > 0 && (
                  <div style={{ marginTop: -8 }}>
                    <div style={{ height: 2, background: "var(--divider-1)", borderRadius: 1 }}>
                      <div style={{
                        height: "100%", borderRadius: 1, transition: "width 0.2s, background 0.2s",
                        width: password.length >= 12 ? "100%" : password.length >= 8 ? "65%" : "30%",
                        background: password.length >= 12 ? "#10b981" : password.length >= 8 ? "#f59e0b" : "#ef4444",
                      }} />
                    </div>
                    <p style={{ fontSize: 11, color: "var(--accent-5)", marginTop: 4 }}>
                      {password.length >= 12 ? "Contraseña fuerte" : password.length >= 8 ? "Contraseña aceptable" : "Muy corta"}
                    </p>
                  </div>
                )}

                <button type="submit" style={{
                  width: "100%", padding: "13px", marginTop: 4,
                  background: "var(--accent-1)", color: "#fff",
                  border: "none", borderRadius: 0, fontSize: 15, fontWeight: 700,
                  fontFamily: "inherit", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                  Continuar <ArrowRight size={16} />
                </button>
              </form>
            )}

            {/* ── Step 2: Empresa ─────────────────────── */}
            {step === 2 && (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <Field icon={Building2} label="Nombre de la empresa *">
                  <input
                    type="text" value={empresaNombre} onChange={(e) => setEmpresaNombre(e.target.value)}
                    placeholder="Minera Los Andes S.A." required
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "var(--accent-1)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--divider-1)")}
                  />
                </Field>

                <div>
                  <label style={labelStyle}><Briefcase size={11} style={{ display: "inline", marginRight: 4 }} />Tu cargo</label>
                  <select value={cargo} onChange={(e) => setCargo(e.target.value)} style={selectStyle}>
                    <option value="">Selecciona tu cargo...</option>
                    {CARGOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}><Layers size={11} style={{ display: "inline", marginRight: 4 }} />Sector industria</label>
                  <select value={sector} onChange={(e) => setSector(e.target.value)} style={selectStyle}>
                    <option value="">Selecciona tu sector...</option>
                    {SECTORES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}><Users size={11} style={{ display: "inline", marginRight: 4 }} />Tamaño equipo</label>
                    <select value={tamañoEquipo} onChange={(e) => setTamañoEquipo(e.target.value)} style={selectStyle}>
                      <option value="">Técnicos...</option>
                      {TAMAÑOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}><MapPin size={11} style={{ display: "inline", marginRight: 4 }} />Región</label>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle}>
                      <option value="">Región...</option>
                      {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    type="button" onClick={() => { setStep(1); setError(null); }}
                    style={{
                      padding: "13px 16px", background: "transparent",
                      border: "1.5px solid var(--divider-1)", borderRadius: 0,
                      fontSize: 14, fontWeight: 600, color: "var(--accent-5)",
                      cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <ArrowLeft size={14} /> Atrás
                  </button>
                  <button
                    type="submit" disabled={loading}
                    style={{
                      flex: 1, padding: "13px",
                      background: loading ? "var(--accent-5)" : "var(--accent-1)",
                      color: "#fff", border: "none", borderRadius: 0,
                      fontSize: 15, fontWeight: 700, fontFamily: "inherit",
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                  >
                    {loading ? "Creando cuenta…" : (<>Comenzar prueba gratis <CheckCircle2 size={16} /></>)}
                  </button>
                </div>
              </form>
            )}

            <p style={{ marginTop: 24, fontSize: 12, color: "var(--accent-5)", textAlign: "center", lineHeight: 1.6 }}>
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" style={{ color: "var(--accent-1)", fontWeight: 600, textDecoration: "none" }}>
                Iniciar sesión
              </Link>
            </p>
            <p style={{ marginTop: 8, fontSize: 11, color: "var(--accent-5)", textAlign: "center", lineHeight: 1.5 }}>
              Al registrarte aceptas nuestros{" "}
              <Link href="/terminos" style={{ color: "var(--accent-5)", textDecoration: "underline" }}>Términos</Link>
              {" "}y{" "}
              <Link href="/privacidad" style={{ color: "var(--accent-5)", textDecoration: "underline" }}>Política de Privacidad</Link>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 20px", borderTop: "1px solid var(--divider-1)",
          fontSize: 11, color: "var(--accent-5)",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
        }}>
          <span>© 2026 Pangui · 30 días gratis sin tarjeta</span>
          <div style={{ display: "flex", gap: 14 }}>
            <Link href="/privacidad" style={{ color: "var(--accent-5)", textDecoration: "none" }}>Privacidad</Link>
            <Link href="/terminos" style={{ color: "var(--accent-5)", textDecoration: "none" }}>Términos</Link>
          </div>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .registro-left { display: flex !important; }
          .registro-mobile-bar { display: none !important; }
        }
      `}</style>
    </div>
  );
}
