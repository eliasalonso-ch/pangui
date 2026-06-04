"use client";

// App Router global error boundary. Reports uncaught render errors to Sentry.
// Renders the absolute fallback UI (replaces the root layout when it crashes).
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Algo salió mal</h2>
        <p style={{ color: "#71717A", maxWidth: 360 }}>
          Ocurrió un error inesperado. Ya fuimos notificados. Intenta de nuevo.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            background: "#4361EE",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Reintentar
        </button>
      </body>
    </html>
  );
}
