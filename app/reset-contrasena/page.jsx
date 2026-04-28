"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

const BRAND = "#1E3A8A";

export default function ResetContrasenaPage() {
  const router = useRouter();
  const [stage, setStage] = useState("loading"); // loading | form | success | error
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();

      // createBrowserClient auto-exchanges ?code= on init via PKCE.
      // Wait briefly then check if a session was established.
      const searchParams = new URLSearchParams(window.location.search);
      const hasCode = searchParams.has("code");

      if (hasCode) {
        // Poll briefly for the session the SDK auto-exchanged
        let session = null;
        for (let i = 0; i < 10; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) { session = data.session; break; }
          await new Promise(r => setTimeout(r, 200));
        }
        if (!session) {
          setStage("error");
          return;
        }
        setStage("form");
        return;
      }

      // Legacy implicit flow: tokens in URL fragment
      const hash = window.location.hash.slice(1);
      const params = Object.fromEntries(new URLSearchParams(hash));
      const access_token = params["access_token"];
      const refresh_token = params["refresh_token"];
      const type = params["type"];

      if (!access_token || !refresh_token || type !== "recovery") {
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
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await supabase.auth.signOut();
    setStage("success");
    setTimeout(() => router.push("/login"), 2000);
  }

  if (stage === "loading") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 14 }}>Verificando enlace…</div>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>
            ✕
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 8, textAlign: "center" }}>Enlace inválido</h2>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, textAlign: "center", marginBottom: 24 }}>
            Este enlace de recuperación no es válido o ya expiró. Solicita uno nuevo.
          </p>
          <div style={{ textAlign: "center" }}>
            <Link href="/recuperar-contrasena" style={{ fontSize: 14, color: BRAND, fontWeight: 600, textDecoration: "none" }}>
              Solicitar nuevo enlace →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "success") {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22 }}>
            ✓
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", marginBottom: 8, textAlign: "center" }}>Contraseña actualizada</h2>
          <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, textAlign: "center" }}>
            Tu contraseña fue cambiada. Redirigiendo…
          </p>
        </div>
      </div>
    );
  }

  const canSubmit = password.length >= 8 && password === confirm;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", marginBottom: 6 }}>
            Nueva contraseña
          </h1>
          <p style={{ fontSize: 14, color: "#64748B" }}>
            Elige una contraseña segura para tu cuenta.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={styles.label}>Nueva contraseña</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                required
                autoFocus
                style={{ ...styles.input, paddingRight: 42 }}
                onFocus={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 13, padding: 0 }}
              >
                {showPw ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div>
            <label style={styles.label}>Confirmar contraseña</label>
            <input
              type={showPw ? "text" : "password"}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Repite tu contraseña"
              required
              style={{
                ...styles.input,
                borderColor: confirm.length > 0 && confirm !== password ? "#EF4444" : "#E2E8F0",
              }}
              onFocus={e => { e.currentTarget.style.borderColor = confirm !== password ? "#EF4444" : BRAND; e.currentTarget.style.boxShadow = `0 0 0 3px ${confirm !== password ? "rgba(239,68,68,0.12)" : "rgba(37,99,235,0.12)"}`; }}
              onBlur={e => { e.currentTarget.style.borderColor = confirm.length > 0 && confirm !== password ? "#EF4444" : "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
            />
            {confirm.length > 0 && confirm !== password && (
              <p style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>Las contraseñas no coinciden</p>
            )}
          </div>

          {errorMsg && (
            <div style={{ fontSize: 13, color: "#DC2626", background: "#FEF2F2", borderLeft: "3px solid #EF4444", padding: "10px 14px", borderRadius: "0 6px 6px 0", lineHeight: 1.4 }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            style={{
              height: 44, background: loading ? "#64748B" : "linear-gradient(135deg, #1E3A8A, #2563EB)",
              color: "#fff", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: loading || !canSubmit ? "not-allowed" : "pointer",
              opacity: !canSubmit ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loading ? "Guardando…" : "Cambiar contraseña"}
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
