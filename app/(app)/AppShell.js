"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import AppSidebar from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

function useTooNarrow(breakpoint = 1024) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setNarrow(mq.matches);
    const handler = (e) => setNarrow(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return narrow;
}

function MobileWall() {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#0f172a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "2rem", textAlign: "center", gap: "1.5rem",
    }}>
      {/* Logo / icon */}
      <div style={{
        width: 72, height: 72, borderRadius: 18,
        background: "#273D88",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 36,
      }}>
        🔧
      </div>

      <div style={{ color: "#fff" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>
          Pangui es una app de escritorio
        </h1>
        <p style={{ marginTop: "0.6rem", fontSize: "0.9rem", color: "#94a3b8", lineHeight: 1.6, maxWidth: 300 }}>
          Para una mejor experiencia, accede desde un computador o descarga la app móvil.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", width: "100%", maxWidth: 260 }}>
        <a
          href="https://apps.apple.com/app/pangui"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            padding: "0.7rem 1.25rem", borderRadius: 10,
            background: "#1e293b", color: "#f1f5f9",
            textDecoration: "none", fontSize: "0.875rem", fontWeight: 500,
            border: "1px solid #334155",
          }}
        >
          📱 Descargar en App Store
        </a>
        <a
          href="https://play.google.com/store/apps/details?id=com.getpangui"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            padding: "0.7rem 1.25rem", borderRadius: 10,
            background: "#1e293b", color: "#f1f5f9",
            textDecoration: "none", fontSize: "0.875rem", fontWeight: 500,
            border: "1px solid #334155",
          }}
        >
          🤖 Descargar en Google Play
        </a>
      </div>
    </div>
  );
}

export default function AppShell({ children }) {
  const tooNarrow = useTooNarrow(1024);

  useEffect(() => {
    const KEY = "pangui_last_active_ts";
    const now = Date.now();
    const last = parseInt(sessionStorage.getItem(KEY) || "0");
    if (now - last < 300000) return;
    sessionStorage.setItem(KEY, String(now));
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (user) sb.from("usuarios").update({ last_active: new Date().toISOString() }).eq("id", user.id).then(() => {});
    });
  }, []);

  return (
    <>
      {tooNarrow && <MobileWall />}
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
