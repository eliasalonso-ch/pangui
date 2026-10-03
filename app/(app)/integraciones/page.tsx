"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Plug, Send, ArrowRight } from "lucide-react";
import { INTEGRACIONES } from "@/lib/integraciones";
import { getConexionMeconecta, estadoVisible, type EstadoVisible } from "@/lib/meconecta-conexion";
import { LogoUdec, EstadoBadge } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";

export default function IntegracionesPage() {
  const gate = useGateIntegraciones();
  const [estado, setEstado] = useState<EstadoVisible | null>(null);

  useEffect(() => {
    if (gate !== "permitido") return;
    getConexionMeconecta()
      .then((c) => setEstado(estadoVisible(c)))
      .catch(() => setEstado("sin_conexion"));
  }, [gate]);

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--fg-1)" }}>Integraciones</h1>
      <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-3)" }}>Conecta Pangui con los sistemas que ya usa tu equipo.</p>

      <h2 style={{ margin: "32px 0 12px", fontSize: 15, fontWeight: 500, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 8 }}>
        <Plug size={16} /> Conectores
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRACIONES.map((i) => (
          <div key={i.slug} style={{ display: "flex", flexDirection: "column", gap: 14, padding: 16, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--fg-3)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "2px 8px" }}>{i.proveedor}</span>
              {estado && <EstadoBadge estado={estado} />}
            </div>
            <div style={{ height: 120, display: "grid", placeItems: "center", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-0)" }}>
              <LogoUdec size={64} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>{i.nombre}</p>
              <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>{i.descripcion}</p>
            </div>
            <Link
              href={i.href}
              prefetch={false}
              style={{ marginTop: "auto", height: 38, display: "grid", placeItems: "center", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--brand-fg)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
            >
              {estado && estado !== "sin_conexion" ? "Administrar" : "Conectar"}
            </Link>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 32, padding: "28px 24px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Send size={22} style={{ color: "var(--brand)", flexShrink: 0 }} />
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>¿No encuentras lo que buscas?</p>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-3)" }}>Cuéntanos qué sistema usa tu equipo y lo evaluamos.</p>
          </div>
        </div>
        <a
          href="mailto:contacto@getpangui.com?subject=Solicitud%20de%20integraci%C3%B3n"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: "var(--r-md)", border: "1px solid var(--brand)", color: "var(--brand)", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
        >
          Solicitar integración <ArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
