"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import {
  ArrowLeft, ArrowRight, CheckCircle2,
  User, Mail, Lock, Building2, Briefcase, Users, MapPin, Layers, Wrench,
  Eye, EyeOff, Loader2, Sparkles,
} from "lucide-react";
import { PLANS } from "@/lib/flow-plans";

const SECTORES = [
  { value: "mineria", label: "Minería" },
  { value: "facilities", label: "Facilities / Universidades / Hospitales" },
  { value: "industria", label: "Industria manufacturera" },
  { value: "construccion", label: "Construcción" },
  { value: "puertos", label: "Puertos y logística" },
  { value: "agro", label: "Agricultura" },
  { value: "otro", label: "Otro" },
];

const TAMANOS = [
  { value: "1-5", label: "1 - 5 técnicos" },
  { value: "6-15", label: "6 - 15 técnicos" },
  { value: "16-40", label: "16 - 40 técnicos" },
  { value: "40+", label: "Más de 40 técnicos" },
];

const REGIONES = [
  "Arica y Parinacota", "Tarapacá", "Antofagasta", "Atacama",
  "Coquimbo", "Valparaíso", "Metropolitana de Santiago",
  "Libertador Gral. Bernardo O'Higgins", "Maule", "Ñuble",
  "Biobío", "La Araucanía", "Los Ríos", "Los Lagos",
  "Aysén", "Magallanes",
];

const FEATURES = [
  "Órdenes de trabajo en tiempo real",
  "Procedimientos, fotos y firma digital",
  "Inventario y alertas de stock crítico",
  "Reportes PDF, Excel y analítica Pro",
];

const inputStyle = {
  width: "100%",
  height: 42,
  padding: "0 12px 0 38px",
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

const selectStyle = {
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
  cursor: "pointer",
  appearance: "none",
  transition: "border-color 0.12s, box-shadow 0.12s",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#64748B",
  marginBottom: 6,
};

function focusInput(e) {
  e.currentTarget.style.borderColor = "#2563EB";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.15)";
}

function blurInput(e) {
  e.currentTarget.style.borderColor = "#E2E8F0";
  e.currentTarget.style.boxShadow = "none";
}

function Field({ icon: Icon, label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        {Icon && (
          <Icon size={15} style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94A3B8",
            pointerEvents: "none",
          }} />
        )}
        {children}
      </div>
    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroPageInner />
    </Suspense>
  );
}

function RegistroPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  // ?plan=esencial when arriving from /precios — used to redirect post-signup
  // straight to /configuracion/suscripcion so the user can upgrade immediately.
  const requestedPlan = search.get("plan");
  const requestedPlanDef = PLANS.find(p => p.key === requestedPlan && p.selfServe);

  const [step, setStep] = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [empresaNombre, setEmpresaNombre] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [oficioId, setOficioId] = useState("");
  const [sector, setSector] = useState("");
  const [tamanoEquipo, setTamanoEquipo] = useState("");
  const [region, setRegion] = useState("");

  // Cargos + oficios fetched from the canonical DB catalog (workspace_id IS NULL).
  // Avoids the historical mismatch where hardcoded form options didn't align
  // with the rows the rest of the app reads from cargos / oficios tables.
  const [cargos, setCargos] = useState([]);
  const [oficios, setOficios] = useState([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/catalogos/cargos-oficios")
      .then(r => r.ok ? r.json() : { cargos: [], oficios: [] })
      .then(j => {
        if (cancelled) return;
        setCargos(j.cargos ?? []);
        setOficios(j.oficios ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

    // Look up the picked cargo / oficio so we can ALSO send the human-readable
    // name (back-compat for the legacy text columns).
    const cargoRow  = cargos.find(c => c.id === cargoId)   ?? null;
    const oficioRow = oficios.find(o => o.id === oficioId) ?? null;

    try {
      const res = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          email: email.trim().toLowerCase(),
          password,
          empresa_nombre: empresaNombre.trim(),
          cargo_id:    cargoId  || null,
          cargo:       cargoRow?.nombre  ?? null,
          oficio_id:   oficioId || null,
          oficio:      oficioRow?.nombre ?? null,
          sector:        sector || null,
          tamaño_equipo: tamanoEquipo || null,
          region:        region || null,
          // Surface the intent so the API can use it for routing post-signup
          requested_plan: requestedPlanDef?.key ?? null,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Error al crear la cuenta.");
        setLoading(false);
        return;
      }

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

      // If the user came from /precios with a specific plan in mind, drop them
      // on the subscription page so they can activate the card right away.
      // Otherwise go to /inicio with a welcome=trial toast.
      if (requestedPlanDef) {
        router.push(`/configuracion/suscripcion?intent=${requestedPlanDef.key}`);
      } else {
        router.push("/inicio?welcome=trial");
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setLoading(false);
    }
  }

  const progressPct = step === 1 ? 50 : 100;

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: 'var(--font-sans, "Geist"), system-ui, sans-serif',
    }}>
      <div
        className="registro-left-panel"
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
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }} />
        <div style={{ position: "absolute", top: -140, right: -140, width: 520, height: 520, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -100, left: -100, width: 360, height: 360, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.05)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <img src="/logo6.svg" alt="Pangui" style={{ height: 28, width: "auto" }} />
          <Link href="/" aria-label="Volver al inicio" style={darkBackLink}>
            <ArrowLeft size={16} />
            Inicio
          </Link>
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          <span style={{
            display: "inline-block",
            fontSize: 11,
            fontWeight: 700,
            color: "rgba(255,255,255,0.6)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            borderLeft: "3px solid rgba(255,255,255,0.4)",
            paddingLeft: 10,
            marginBottom: 28,
          }}>
            Pro gratis por 14 días
          </span>
          <h1 style={{
            fontSize: "clamp(1.9rem, 2.8vw, 2.8rem)",
            fontWeight: 900,
            color: "#FFFFFF",
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            margin: "0 0 20px",
          }}>
            Tu equipo de mantención,<br />digitalizado en minutos.
          </h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", lineHeight: 1.75, maxWidth: 390, margin: "0 0 44px" }}>
            Crea tu workspace y prueba todas las funciones Pro sin ingresar tarjeta de crédito.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {FEATURES.map((feature) => (
              <li key={feature} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                <CheckCircle2 size={16} style={{ color: "#10B981", flexShrink: 0 }} />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div />
      </div>

      <div className="registro-mobile-bar" style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "14px 24px",
        background: "#1E3A8A",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <Link href="/" aria-label="Volver al inicio" style={mobileBackBtn}>
          <ArrowLeft size={18} />
        </Link>
        <img src="/logo2.svg" alt="Pangui" style={{ height: 24, width: "auto", filter: "brightness(0) invert(1)" }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#F8FAFC", minHeight: "100vh" }}>
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 24px",
        }}>
          <div style={{
            width: "100%",
            maxWidth: 420,
            background: "#FFFFFF",
            borderRadius: 16,
            padding: "34px 34px",
            boxShadow: "0 10px 40px rgba(15,23,42,0.10), 0 1px 3px rgba(15,23,42,0.06)",
            border: "1px solid #E2E8F0",
          }}>
            <div style={{ marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Paso {step} de 2
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>{progressPct}%</span>
              </div>
              <div style={{ height: 3, background: "#E2E8F0", borderRadius: 999 }}>
                <div style={{ height: "100%", width: `${progressPct}%`, background: "#2563EB", borderRadius: 999, transition: "width 0.4s ease" }} />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 24,
                fontWeight: 800,
                color: "#0F172A",
                margin: "0 0 6px",
                letterSpacing: "-0.025em",
              }}>
                {step === 1 ? "Comienza tu prueba gratis" : "Cuéntanos sobre tu equipo"}
              </h2>
              <p style={{ color: "#475569", fontSize: 14, margin: 0, lineHeight: 1.55 }}>
                {step === 1
                  ? "14 días de Pro gratis. Sin tarjeta de crédito."
                  : "Esto nos ayuda a configurar tu workspace."}
              </p>
            </div>

            {requestedPlanDef && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 12px", marginBottom: 20,
                background: "#EFF6FF", border: "1px solid #BFDBFE",
                borderRadius: 8,
                fontSize: 12.5, color: "#1E40AF", lineHeight: 1.45,
              }}>
                <Sparkles size={14} style={{ marginTop: 2, flexShrink: 0 }} />
                <div>
                  Vienes interesado en <strong>{requestedPlanDef.name}</strong>. Crea tu cuenta con 14 días de Pro gratis y al terminar lo activas en un clic.
                </div>
              </div>
            )}

            {error && (
              <div style={{
                fontSize: 13,
                color: "#DC2626",
                background: "#FEF2F2",
                borderLeft: "3px solid #EF4444",
                padding: "10px 14px",
                borderRadius: "0 8px 8px 0",
                lineHeight: 1.4,
                marginBottom: 20,
              }}>
                {error}
              </div>
            )}

            {step === 1 && (
              <form onSubmit={handleNext} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Field icon={User} label="Nombre completo">
                  <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Juan Pérez" required style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </Field>

                <Field icon={Mail} label="Email">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="juan@empresa.cl" required autoComplete="email" autoCapitalize="none" style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </Field>

                <Field icon={Lock} label="Contraseña">
                  <input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required autoComplete="new-password" style={{ ...inputStyle, paddingRight: 42 }} onFocus={focusInput} onBlur={blurInput} />
                  <button type="button" onClick={() => setShowPass(!showPass)} style={eyeBtn} aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}>
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </Field>

                {password.length > 0 && (
                  <div style={{ marginTop: -8 }}>
                    <div style={{ height: 3, background: "#E2E8F0", borderRadius: 999 }}>
                      <div style={{
                        height: "100%",
                        borderRadius: 999,
                        transition: "width 0.2s, background 0.2s",
                        width: password.length >= 12 ? "100%" : password.length >= 8 ? "65%" : "30%",
                        background: password.length >= 12 ? "#10B981" : password.length >= 8 ? "#F59E0B" : "#EF4444",
                      }} />
                    </div>
                    <p style={{ fontSize: 11, color: "#64748B", margin: "5px 0 0" }}>
                      {password.length >= 12 ? "Contraseña fuerte" : password.length >= 8 ? "Contraseña aceptable" : "Muy corta"}
                    </p>
                  </div>
                )}

                <button type="submit" style={primaryBtn}>
                  Continuar <ArrowRight size={16} />
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field icon={Building2} label="Nombre de la empresa">
                  <input type="text" value={empresaNombre} onChange={(e) => setEmpresaNombre(e.target.value)} placeholder="Minera Los Andes S.A." required style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </Field>

                <div>
                  <label style={labelStyle}><Briefcase size={11} style={{ display: "inline", marginRight: 4 }} />Tu cargo</label>
                  <select value={cargoId} onChange={(e) => setCargoId(e.target.value)} style={selectStyle} onFocus={focusInput} onBlur={blurInput}>
                    <option value="">Selecciona tu cargo...</option>
                    {cargos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}><Wrench size={11} style={{ display: "inline", marginRight: 4 }} />Tu oficio (opcional)</label>
                  <select value={oficioId} onChange={(e) => setOficioId(e.target.value)} style={selectStyle} onFocus={focusInput} onBlur={blurInput}>
                    <option value="">Sin especificar</option>
                    {oficios.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}><Layers size={11} style={{ display: "inline", marginRight: 4 }} />Sector industria</label>
                  <select value={sector} onChange={(e) => setSector(e.target.value)} style={selectStyle} onFocus={focusInput} onBlur={blurInput}>
                    <option value="">Selecciona tu sector...</option>
                    {SECTORES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}><Users size={11} style={{ display: "inline", marginRight: 4 }} />Equipo</label>
                    <select value={tamanoEquipo} onChange={(e) => setTamanoEquipo(e.target.value)} style={selectStyle} onFocus={focusInput} onBlur={blurInput}>
                      <option value="">Técnicos...</option>
                      {TAMANOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}><MapPin size={11} style={{ display: "inline", marginRight: 4 }} />Región</label>
                    <select value={region} onChange={(e) => setRegion(e.target.value)} style={selectStyle} onFocus={focusInput} onBlur={blurInput}>
                      <option value="">Región...</option>
                      {REGIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button type="button" onClick={() => { setStep(1); setError(null); }} style={secondaryBtn}>
                    <ArrowLeft size={14} /> Atrás
                  </button>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, flex: 1, marginTop: 0, background: loading ? "#64748B" : primaryBtn.background, cursor: loading ? "not-allowed" : "pointer" }}>
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Creando...</> : <>Comenzar prueba <CheckCircle2 size={16} /></>}
                  </button>
                </div>
              </form>
            )}

            <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid #F1F5F9", fontSize: 13, color: "#64748B", textAlign: "center" }}>
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
                Iniciar sesión
              </Link>
            </div>
            <p style={{ margin: "10px 0 0", fontSize: 11, color: "#94A3B8", textAlign: "center", lineHeight: 1.5 }}>
              Al registrarte aceptas nuestros{" "}
              <Link href="/terminos" style={{ color: "#64748B", textDecoration: "underline" }}>Términos</Link>
              {" "}y{" "}
              <Link href="/privacidad" style={{ color: "#64748B", textDecoration: "underline" }}>Política de Privacidad</Link>.
            </p>
          </div>
        </div>

        <div style={{ padding: "16px 24px", fontSize: 12, color: "#94A3B8", textAlign: "center" }}>
          © 2026 Pangui
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .registro-left-panel { display: flex !important; }
          .registro-mobile-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .registro-mobile-bar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

const darkBackLink = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "rgba(255,255,255,0.78)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.06)",
};

const mobileBackBtn = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  color: "#FFFFFF",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.08)",
};

const eyeBtn = {
  position: "absolute",
  right: 12,
  top: "50%",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#94A3B8",
  display: "flex",
  padding: 0,
};

const primaryBtn = {
  width: "100%",
  height: 44,
  marginTop: 4,
  background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  boxShadow: "0 2px 8px rgba(37,99,235,0.30)",
};

const secondaryBtn = {
  height: 44,
  padding: "0 14px",
  background: "#FFFFFF",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  color: "#475569",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};
