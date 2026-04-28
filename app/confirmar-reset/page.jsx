"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const BRAND = "#1E3A8A";

function ConfirmarResetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleConfirm() {
    // Forward all query params (code, etc.) to the actual reset page
    router.push(`/reset-contrasena?${searchParams.toString()}`);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#F8FAFC", padding: "24px 16px",
      fontFamily: 'var(--font-sans, "Geist"), system-ui, sans-serif',
    }}>
      <div style={{
        width: "100%", maxWidth: 420, background: "#fff", borderRadius: 16,
        padding: "40px 36px", textAlign: "center",
        boxShadow: "0 1px 3px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.06)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "#EFF6FF",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", fontSize: 26,
        }}>
          🔑
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginBottom: 8, letterSpacing: "-0.02em" }}>
          Cambiar contraseña
        </h1>
        <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, marginBottom: 28 }}>
          Haz clic en el botón para continuar con el restablecimiento de tu contraseña.
        </p>
        <button
          onClick={handleConfirm}
          style={{
            width: "100%", height: 44,
            background: `linear-gradient(135deg, ${BRAND}, #2563EB)`,
            color: "#fff", border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 700, fontFamily: "inherit",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(37,99,235,0.30)",
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
        >
          Continuar →
        </button>
      </div>
    </div>
  );
}

export default function ConfirmarResetPage() {
  return (
    <Suspense>
      <ConfirmarResetContent />
    </Suspense>
  );
}
