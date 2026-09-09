"use client";

import { User } from "lucide-react";

/** Iniciales para el avatar, igual que en OTDetail. */
function initials(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0].slice(0, 2).toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Línea de auditoría: avatar de 30 + nombre · fecha. */
function AuditLine({ label, usuario, fecha }: {
  label: string;
  usuario?: { id: string; nombre: string } | null;
  fecha: string;
}) {
  const cuando = new Date(fecha).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", margin: "0 0 8px" }}>{label}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: "50%",
          background: usuario
            ? "linear-gradient(135deg, var(--brand-active), var(--brand))"
            : "var(--surface-hover)",
          color: usuario ? "var(--fg-on-brand)" : "var(--fg-4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 400, flexShrink: 0,
        }}>
          {usuario ? initials(usuario.nombre) : <User size={15} />}
        </span>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
          {usuario ? `${usuario.nombre} · ${cuando}` : cuando}
        </span>
      </div>
    </div>
  );
}

/**
 * Pie "Creado / Última actualización" de una ficha.
 *
 * Sale del detalle de material (/partes), que fue el primero en tenerlo, para
 * que activos y planes muestren exactamente lo mismo en vez de tres variantes
 * parecidas. Las filas anteriores a las columnas de auditoría no tienen autor:
 * ahí va sólo la fecha, con un avatar gris — inventar un autor sería mentir
 * sobre quién tocó el registro.
 *
 * No dibuja nada si no hay ninguna fecha que mostrar.
 */
export default function AuditFooter({ creador, creadoEn, actualizador, actualizadoEn }: {
  creador?: { id: string; nombre: string } | null;
  creadoEn?: string | null;
  actualizador?: { id: string; nombre: string } | null;
  actualizadoEn?: string | null;
}) {
  if (!creadoEn && !actualizadoEn) return null;
  return (
    <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {creadoEn && <AuditLine label="Creado" usuario={creador} fecha={creadoEn} />}
      {actualizadoEn && (
        <AuditLine label="Última actualización" usuario={actualizador} fecha={actualizadoEn} />
      )}
    </div>
  );
}
