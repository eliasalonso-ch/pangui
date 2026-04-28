"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

const BRAND = "#1E3A8A";

export default function RecuperarContrasenaPage() {
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState("form"); // form | sent | error
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/confirmar-reset`,
    });

    setLoading(false);

    if (error) {
      setErrorMsg("No se pudo enviar el correo. Verifica la dirección e intenta de nuevo.");
      return;
    }

    setStage("sent");
  }

  if (stage === "sent") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>
            ✓
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Revisa tu correo</h2>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, maxWidth: 320, margin: "0 auto 24px" }}>
            Enviamos un enlace de recuperación a <strong>{email}</strong>. Tiene validez por 1 hora.
          </p>
          <Link href="/login" style={{ fontSize: 13, color: BRAND, fontWeight: 600, textDecoration: "none" }}>
            ← Volver al inicio de sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", marginBottom: 6 }}>
            Recuperar contraseña
          </h1>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.5 }}>
            Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={styles.label}>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@empresa.cl"
              required
              autoFocus
              style={styles.input}
              onFocus={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          {errorMsg && (
            <div style={{ fontSize: 13, color: "#DC2626", background: "#FEF2F2", borderLeft: "3px solid #EF4444", padding: "10px 14px", borderRadius: "0 6px 6px 0", lineHeight: 1.4 }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            style={{
              height: 44, background: loading ? "#64748B" : "linear-gradient(135deg, #1E3A8A, #2563EB)",
              color: "#fff", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: loading || !email.trim() ? "not-allowed" : "pointer",
              opacity: !email.trim() ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Enviando…" : "Enviar enlace de recuperación"}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #F1F5F9", textAlign: "center" }}>
          <Link href="/login" style={{ fontSize: 13, color: "#64748B", textDecoration: "none" }}>
            ← Volver al inicio de sesión
          </Link>
        </div>
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
    background: "#F8FAFC",
    padding: "24px 16px",
    fontFamily: 'var(--font-sans, "Geist"), system-ui, sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "#fff",
    borderRadius: 16,
    padding: "40px 36px",
    boxShadow: "0 1px 3px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.06)",
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.07em",
    marginBottom: 6,
  },
  input: {
    width: "100%",
    height: 42,
    padding: "0 12px",
    border: "1px solid #E2E8F0",
    borderRadius: 8,
    fontSize: 14,
    fontFamily: "inherit",
    color: "#0F172A",
    background: "#fff",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.12s, box-shadow 0.12s",
  },
};
