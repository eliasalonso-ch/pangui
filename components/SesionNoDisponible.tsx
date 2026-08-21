"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/**
 * Shown when the server could not VERIFY the session — not when the user is
 * signed out. Rendering this instead of redirecting to /login is the whole
 * point: a network blip between the app and the Supabase auth server used to
 * bounce people to the login page and throw away whatever they were typing.
 *
 * The session cookies are left untouched, so a retry normally succeeds.
 */
export default function SesionNoDisponible() {
  const router = useRouter();

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        textAlign: "center",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: "var(--fg-1)" }}>
        No pudimos verificar tu sesión
      </h2>
      <p style={{ margin: 0, maxWidth: 380, fontSize: 13.5, lineHeight: 1.5, color: "var(--fg-3)" }}>
        Es un problema temporal de conexión, no cerramos tu sesión. Tu trabajo
        sigue guardado. Reintenta en unos segundos.
      </p>
      <button
        type="button"
        onClick={() => router.refresh()}
        style={{
          minHeight: 38,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface-1)",
          color: "var(--fg-1)",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <RefreshCw size={15} aria-hidden />
        Reintentar
      </button>
    </div>
  );
}
