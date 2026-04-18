"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";

const BRAND = "#273D88";
const BRAND_DARK = "#1F316E";
const BRAND_LIGHT = "#EEF1FB";

export default function InvitePage() {
  const [stage, setStage] = useState("loading"); // loading | form | success | error
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // Tokens arrive in the URL fragment: #access_token=...&refresh_token=...
      const hash = window.location.hash.slice(1);
      const params = Object.fromEntries(new URLSearchParams(hash));
      const access_token = params["access_token"];
      const refresh_token = params["refresh_token"];

      if (!access_token || !refresh_token) {
        setStage("error");
        return;
      }

      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        setStage("error");
        return;
      }

      setStage("form");
    }

    init();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!nombre.trim()) {
      setErrorMsg("Ingresa tu nombre completo.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // 1. Set password
    const { data: userData, error: pwError } = await supabase.auth.updateUser({ password });
    if (pwError) {
      setErrorMsg(pwError.message);
      setLoading(false);
      return;
    }

    // 2. Save name in usuarios table
    const userId = userData?.user?.id;
    if (userId) {
      await supabase
        .from("usuarios")
        .update({ nombre: nombre.trim() })
        .eq("id", userId);
    }

    setLoading(false);
    setStage("success");

    // Try to open the app after a short delay
    setTimeout(() => {
      window.location.href = "pangui://";
    }, 1500);
  }

  // ── Loading ──
  if (stage === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.spinner} />
          <p style={{ color: "#6B7280", fontSize: 14, marginTop: 16 }}>Verificando invitación...</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (stage === "error") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ ...styles.iconCircle, backgroundColor: "#FEE2E2" }}>
            <span style={{ fontSize: 24 }}>✕</span>
          </div>
          <h2 style={styles.heading}>Enlace inválido</h2>
          <p style={styles.sub}>
            Este enlace de invitación no es válido o ya expiró.{" "}
            Pide a tu administrador que te envíe una nueva invitación.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (stage === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ ...styles.iconCircle, backgroundColor: "#D1FAE5" }}>
            <span style={{ fontSize: 24 }}>✓</span>
          </div>
          <h2 style={styles.heading}>¡Cuenta activada!</h2>
          <p style={styles.sub}>
            Tu cuenta fue creada exitosamente. Abriendo Pangui...
          </p>
          <a
            href="pangui://"
            style={{
              display: "inline-block",
              marginTop: 20,
              padding: "12px 28px",
              backgroundColor: BRAND,
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              borderRadius: 0,
            }}
          >
            Abrir Pangui
          </a>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* Logo area */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src="/pangui-logo.svg" alt="Pangui" style={{ width: 80, height: "auto", marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1A1A1A", letterSpacing: -0.4, marginBottom: 4 }}>
            Bienvenido a Pangui
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280" }}>
            Completa tu perfil para activar tu cuenta
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Nombre */}
          <div>
            <label style={styles.label}>Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan Pérez"
              autoComplete="name"
              required
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E2E6F0")}
            />
          </div>

          {/* Contraseña */}
          <div>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              required
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = BRAND)}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#E2E6F0")}
            />
          </div>

          {/* Confirmar */}
          <div>
            <label style={styles.label}>Confirmar contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite tu contraseña"
              required
              style={{
                ...styles.input,
                borderColor: confirm.length > 0 && confirm !== password ? "#EF4444" : "#E2E6F0",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = confirm !== password ? "#EF4444" : BRAND)}
              onBlur={(e) => (e.currentTarget.style.borderColor = confirm !== password ? "#EF4444" : "#E2E6F0")}
            />
            {confirm.length > 0 && confirm !== password && (
              <p style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>Las contraseñas no coinciden</p>
            )}
          </div>

          {/* Error */}
          {errorMsg && (
            <div style={{
              borderLeft: `3px solid ${BRAND}`,
              backgroundColor: BRAND_LIGHT,
              padding: "10px 12px",
              fontSize: 13,
              color: BRAND,
              lineHeight: 1.4,
            }}>
              {errorMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !nombre.trim() || password.length < 8 || password !== confirm}
            style={{
              marginTop: 4,
              padding: "13px",
              backgroundColor: loading ? "#9CA3AF" : BRAND,
              color: "#fff",
              border: "none",
              borderRadius: 0,
              fontSize: 15,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: (!nombre.trim() || password.length < 8 || password !== confirm) ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = BRAND_DARK; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.backgroundColor = BRAND; }}
          >
            {loading ? "Guardando..." : "Activar cuenta"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4F6FB",
    padding: "24px 16px",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fff",
    padding: "36px 32px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
    textAlign: "center",
  },
  heading: {
    fontSize: 20,
    fontWeight: 700,
    color: "#1A1A1A",
    marginBottom: 8,
    marginTop: 12,
  },
  sub: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 1.6,
    maxWidth: 320,
    margin: "0 auto",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 4px",
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 7,
    textAlign: "left",
  },
  input: {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #E2E6F0",
    borderRadius: 0,
    fontSize: 15,
    fontFamily: "inherit",
    color: "#1A1A1A",
    backgroundColor: "#fff",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.15s",
  },
};
