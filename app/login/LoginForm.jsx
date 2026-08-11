"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import posthog from "posthog-js";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Mail, KeyRound } from "lucide-react";
import { LandingNav } from "../Landing";
import {
  resendCooldownSeconds,
  normalizeEmail,
  isPlausibleEmail,
  normalizeOtpCode,
  isCompleteOtpCode,
  OTP_LENGTH,
} from "@/lib/magic-link";

const FEATURES = [
  "Órdenes de trabajo en tiempo real",
  "Gestión de inventario y stock crítico",
  "Informes PDF y Excel exportables",
  "Firma digital del cliente en terreno",
];

/**
 * Brand palette, taken from the design system (tokens.css) rather than the
 * ad-hoc blues this page used to hardcode. #273D88 is the same navy the logo is
 * filled with, so the mark and the UI finally match.
 */
const BRAND = {
  navy:      "#273D88",
  navyHover: "#1F316E",
  navyDeep:  "#18254F",
  tint:      "#EEF1FB",
  tint2:     "#DCE3F6",
};
const FG = { primary: "#0F1729", secondary: "#4A5568", muted: "#6B7689", faint: "#9AA3B5" };
const LINE = { border: "#E5E8EE", strong: "#D5DAE3", divider: "#EEF0F4" };
const SURFACE = { page: "#F7F8FA", card: "#FFFFFF" };

const FOCUS_RING = `0 0 0 3px ${BRAND.tint2}`;

const inp = {
  width: "100%",
  height: 44,
  padding: "0 14px",
  border: `1px solid ${LINE.border}`,
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "inherit",
  color: FG.primary,
  background: SURFACE.card,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.12s, box-shadow 0.12s",
};

function focusIn(e) {
  e.currentTarget.style.borderColor = BRAND.navy;
  e.currentTarget.style.boxShadow = FOCUS_RING;
}
function focusOut(e) {
  e.currentTarget.style.borderColor = LINE.border;
  e.currentTarget.style.boxShadow = "none";
}

/**
 * Six single-character boxes instead of one field: on a phone the digits stay
 * legible, the numeric keypad opens, and the user can see at a glance how many
 * are left. Typing advances, Backspace on an empty box steps back, and pasting
 * the whole code from the email fills every box at once.
 */
function CodeBoxes({ value, onChange, onComplete, disabled }) {
  const refs = useRef([]);
  const last = OTP_LENGTH - 1;
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  function setDigit(i, raw) {
    const d = raw.replace(/\D/g, "");
    if (!d) return;
    const next = normalizeOtpCode(
      value.slice(0, i) + d[d.length - 1] + value.slice(i + 1),
    );
    onChange(next);
    if (i < last) refs.current[i + 1]?.focus();
    if (next.length === OTP_LENGTH) onComplete?.(next);
  }

  function handleKeyDown(i, e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) {
        onChange(normalizeOtpCode(value.slice(0, i) + value.slice(i + 1)));
      } else if (i > 0) {
        onChange(normalizeOtpCode(value.slice(0, i - 1) + value.slice(i)));
        refs.current[i - 1]?.focus();
      }
    }
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < last) refs.current[i + 1]?.focus();
  }

  function handlePaste(e) {
    const pasted = normalizeOtpCode(e.clipboardData.getData("text"));
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, last)]?.focus();
    if (pasted.length === OTP_LENGTH) onComplete?.(pasted);
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          value={d}
          onChange={e => setDigit(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={e => { e.currentTarget.select(); focusIn(e); }}
          onBlur={focusOut}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1} de ${OTP_LENGTH}`}
          maxLength={1}
          style={{
            // Flexes so the row still fits the 400px card on a narrow phone.
            flex: "1 1 0", minWidth: 0, maxWidth: 48, height: 56,
            padding: 0,
            textAlign: "center",
            fontSize: 22, fontWeight: 700,
            fontFamily: "var(--font-mono, ui-monospace, monospace)",
            color: d ? BRAND.navy : FG.primary,
            border: `1px solid ${d ? BRAND.navy : LINE.border}`,
            borderRadius: 12,
            background: disabled ? SURFACE.page : SURFACE.card,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.12s, box-shadow 0.12s",
          }}
        />
      ))}
    </div>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // "magic" is the default; "password" stays available while mobile still
  // signs in with a password and until every user has used a link at least once.
  const [mode, setMode] = useState("magic");
  // magic sub-flow: "request" (asking for the email) → "sent" (link + code sent)
  const [magicStage, setMagicStage] = useState("request");
  const [code, setCode] = useState("");
  const [lastSentAt, setLastSentAt] = useState(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = Object.fromEntries(new URLSearchParams(hash));
    if (params.type === "recovery" && params.access_token) {
      window.location.replace(`/reset-contrasena#${hash}`);
    }
  }, []);

  // Tick the resend cooldown. Supabase rejects a second email to the same
  // address inside the configured interval, so the button has to show the wait
  // instead of letting the user tap into a server error.
  useEffect(() => {
    if (lastSentAt == null) return;
    const tick = () => setCooldown(resendCooldownSeconds(Date.now(), lastSentAt));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSentAt]);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (authError) {
      setError("Correo o contraseña incorrectos.");
      setLoading(false);
      return;
    }
    if (posthog.__loaded) posthog.capture("signed_in", { method: "password" });
    router.push("/inicio");
  }

  async function sendMagicLink(e) {
    if (e) e.preventDefault();
    setError(null);
    if (!isPlausibleEmail(email)) {
      setError("Escribe un correo válido.");
      return;
    }
    if (cooldown > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: {
        // Existing accounts only. Self-serve signup happens through /registro,
        // so an unknown address here is a typo, not a new user.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/inicio`,
      },
    });
    setLoading(false);

    if (otpError) {
      // 429 is its own case: telling someone to check their address when the
      // real problem is a rate limit sends them to re-check a correct email and
      // tap again, which digs further into the limit. Start the cooldown here
      // too — otherwise the button stays live after a failed send.
      if (otpError.status === 429) {
        setLastSentAt(Date.now());
        setError("Demasiados intentos. Espera un momento antes de pedir otro código.");
        return;
      }
      // Any other failure stays deliberately vague: the response looks the same
      // for an unknown address, so a specific message would leak which emails
      // have accounts.
      setError("No pudimos enviar el código. Revisa el correo e intenta de nuevo.");
      return;
    }
    if (posthog.__loaded) posthog.capture("magic_link_requested");
    setLastSentAt(Date.now());
    setMagicStage("sent");
  }

  // Shared by the auto-submit on the sixth digit and the button, so a user who
  // pastes the code and one who types it hit exactly the same path.
  const submitCode = useCallback(async (raw) => {
    const token = normalizeOtpCode(raw ?? "");
    if (!isCompleteOtpCode(token)) {
      setError(`El código son ${OTP_LENGTH} dígitos.`);
      return;
    }
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token,
      type: "email",
    });
    if (verifyError) {
      // Don't clear a code the user typed correctly just because we were rate
      // limited — they'd retype the same six digits for nothing.
      if (verifyError.status === 429) {
        setError("Demasiados intentos. Espera un momento y vuelve a intentar.");
        setLoading(false);
        return;
      }
      setError("Código incorrecto o vencido.");
      setCode("");
      setLoading(false);
      return;
    }
    if (posthog.__loaded) posthog.capture("signed_in", { method: "magic_link" });
    router.push("/inicio");
  }, [email, router]);

  function handleCodeSubmit(e) {
    e.preventDefault();
    submitCode(code);
  }

  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: 'var(--font-sans, "Geist"), system-ui, sans-serif',
    }}>
      <LandingNav mobileOnly />

      {/* ── Left panel (brand) ── */}
      <div
        className="login-left-panel"
        style={{
          display: "none",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "52%",
          minHeight: "100vh",
          background: `linear-gradient(165deg, ${BRAND.navyDeep} 0%, ${BRAND.navy} 62%, #32499B 100%)`,
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
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <Link href="/" aria-label="Pangui - inicio" style={{ display: "inline-flex" }}>
            <img src="/logo6.svg" alt="Pangui" style={{ height: 28, width: "auto"}}
              onError={e => { e.currentTarget.src = "/logo6.svg";}}
            />
          </Link>
          <Link
            href="/"
            aria-label="Volver al inicio"
            style={{
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
            }}
          >
            <ArrowLeft size={16} />
            Inicio
          </Link>
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
            Órdenes de trabajo, inventario y reportes para pymes de mantención en Chile.
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
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        padding: "14px 24px",
        background: BRAND.navy,
        borderBottom: "1px solid rgba(255,255,255,0.1)",
      }}>
        <Link
          href="/"
          aria-label="Volver al inicio"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            color: "#FFFFFF",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 8,
            background: "rgba(255,255,255,0.08)",
          }}
        >
          <ArrowLeft size={18} />
        </Link>
        <img src="/logo2.svg" alt="Pangui" style={{ height: 24, width: "auto", filter: "brightness(0) invert(1)" }}
          onError={e => { e.currentTarget.style.filter = "none"; }} />
      </div>

      {/* ── Right panel (form) ── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: SURFACE.page,
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
            border: `1px solid ${LINE.border}`,
          }}>

            {/* Heading. Centred with the mark above it when a code is pending,
                so the screen reads as one focused task. */}
            <div style={{
              marginBottom: 30,
              textAlign: magicStage === "sent" ? "center" : "left",
            }}>
              <img
                src="/logo2.svg"
                alt="Pangui"
                style={{
                  height: 26, width: "auto", marginBottom: 20,
                  display: "block", marginLeft: "auto", marginRight: "auto",
                }}
              />
              <h2 style={{
                fontSize: 24, fontWeight: 800,
                color: FG.primary, margin: "0 0 6px",
                letterSpacing: "-0.025em",
                fontFamily: '"Inter", system-ui, sans-serif',
              }}>
                {mode === "magic" && magicStage === "sent" ? "Revisa tu correo" : "Inicia sesión"}
              </h2>
              <p style={{ color: FG.secondary, fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                {mode === "magic" && magicStage === "sent"
                  ? "El código vence en unos minutos."
                  : "Accede a tu panel de mantención."}
              </p>
            </div>

            {/* Form */}
            <form
              onSubmit={
                mode === "password"
                  ? handlePasswordSubmit
                  : magicStage === "sent"
                    ? handleCodeSubmit
                    : sendMagicLink
              }
              style={{ display: "flex", flexDirection: "column", gap: 18 }}
            >
              {!(mode === "magic" && magicStage === "sent") && (
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: FG.muted, marginBottom: 6 }}>
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
                    onFocus={focusIn}
                    onBlur={focusOut}
                  />
                </div>
              )}

              {mode === "password" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: FG.muted }}>
                      Contraseña
                    </label>
                    <a href="/recuperar-contrasena" style={{ fontSize: 12, color: BRAND.navy, fontWeight: 500, textDecoration: "none" }}>
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
                      onFocus={focusIn}
                      onBlur={focusOut}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: FG.faint, display: "flex", padding: 0 }}
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {mode === "magic" && magicStage === "sent" && (
                <>
                  <p style={{
                    fontSize: 13, color: FG.secondary, lineHeight: 1.6,
                    textAlign: "center", margin: 0,
                  }}>
                    Enviamos un código a <strong style={{ color: FG.primary }}>{normalizeEmail(email)}</strong>.
                    Escríbelo abajo para entrar.
                  </p>
                  <CodeBoxes
                    value={code}
                    onChange={setCode}
                    onComplete={submitCode}
                    disabled={loading}
                  />
                </>
              )}

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
                  background: loading ? FG.faint : BRAND.navy,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: "inherit",
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  boxShadow: loading ? "none" : "0 1px 2px rgba(39,61,136,0.28)",
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = BRAND.navyHover; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = BRAND.navy; }}
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading
                  ? "Un momento…"
                  : mode === "password"
                    ? "Iniciar sesión"
                    : magicStage === "sent"
                      ? "Entrar con el código"
                      : "Enviarme un código"}
              </button>

              {mode === "magic" && magicStage === "sent" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                  <button
                    type="button"
                    onClick={() => { setMagicStage("request"); setCode(""); setError(null); }}
                    style={{
                      background: "none", border: "none", padding: 0,
                      fontSize: 13, fontWeight: 600, color: BRAND.navy,
                      cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    ← Cambiar correo
                  </button>
                  <span style={{ color: LINE.strong }}>·</span>
                  <button
                    type="button"
                    onClick={sendMagicLink}
                    disabled={cooldown > 0 || loading}
                    style={{
                      background: "none", border: "none", padding: 0,
                      fontSize: 13, fontWeight: 600,
                      color: cooldown > 0 ? FG.faint : BRAND.navy,
                      cursor: cooldown > 0 ? "default" : "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
                  </button>
                </div>
              )}
            </form>

            {/* Switch between magic link and password. Hidden while a code is
                pending so the screen stays focused on entering it. */}
            {!(mode === "magic" && magicStage === "sent") && (
            <button
              type="button"
              onClick={() => {
                setMode(m => (m === "magic" ? "password" : "magic"));
                setMagicStage("request");
                setCode("");
                setError(null);
              }}
              style={{
                marginTop: 18, width: "100%", height: 40,
                background: "none",
                border: `1px solid ${LINE.border}`,
                borderRadius: 8,
                fontSize: 13, fontWeight: 600, color: FG.secondary,
                fontFamily: "inherit", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {mode === "magic"
                ? (<><KeyRound size={15} /> Usar contraseña</>)
                : (<><Mail size={15} /> Entrar con código por correo</>)}
            </button>
            )}

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LINE.divider}`, fontSize: 13, color: FG.muted, textAlign: "center" }}>
              ¿Aún no tienes cuenta?{" "}
              <a href="mailto:contacto@getpangui.com" style={{ color: BRAND.navy, fontWeight: 600, textDecoration: "none" }}>
                Contáctanos →
              </a>
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", fontSize: 12, color: FG.faint, textAlign: "center" }}>
          © 2026 Pangui
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-left-panel { display: flex !important; }
          .login-mobile-bar { display: none !important; }
        }
        .login-mobile-bar { display: none !important; }
      `}</style>
    </div>
  );
}
