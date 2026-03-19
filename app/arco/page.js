"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const TIPOS = [
  { value: "acceso",        label: "Acceso", desc: "Quiero saber qué datos personales míos tiene registrado el sistema." },
  { value: "rectificacion", label: "Rectificación", desc: "Quiero corregir datos personales incorrectos o desactualizados." },
  { value: "cancelacion",   label: "Cancelación / Supresión", desc: "Quiero que eliminen mis datos personales del sistema." },
  { value: "oposicion",     label: "Oposición", desc: "Me opongo al tratamiento de mis datos personales." },
];

export default function ARCOPage() {
  const [form, setForm] = useState({ tipo: "acceso", rut: "", email: "", detalle: "" });
  const [saving,  setSaving]  = useState(false);
  const [ok,      setOk]      = useState(false);
  const [error,   setError]   = useState(null);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function enviar() {
    if (!form.rut.trim())   { setError("Ingresa tu RUT."); return; }
    if (!form.email.trim()) { setError("Ingresa tu email."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError("Ingresa un email válido."); return;
    }
    setError(null);
    setSaving(true);

    const supabase = createClient();
    const { error: dbErr } = await supabase.from("solicitudes_arco").insert({
      tipo:    form.tipo,
      rut:     form.rut.trim(),
      email:   form.email.trim(),
      detalle: form.detalle.trim() || null,
      estado:  "pendiente",
    });

    setSaving(false);
    if (dbErr) { setError("Error al enviar. Intenta nuevamente."); return; }
    setOk(true);
  }

  if (ok) {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <div className={styles.successIcon}>✓</div>
          <h1 className={styles.successTitle}>Solicitud enviada</h1>
          <p className={styles.successText}>
            Tu solicitud de <strong>{TIPOS.find((t) => t.value === form.tipo)?.label}</strong> fue
            registrada. Nos contactaremos al email <strong>{form.email}</strong> en un plazo máximo de 10 días
            hábiles, conforme a la Ley 21.719.
          </p>
        </div>
      </main>
    );
  }

  const tipoInfo = TIPOS.find((t) => t.value === form.tipo);

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <span className={styles.logoText}>Pangui</span>
          <span className={styles.legalBadge}>Ley 21.719</span>
        </div>

        <h1 className={styles.title}>Portal ARCO</h1>
        <p className={styles.subtitle}>
          Ejerce tus derechos sobre tus datos personales conforme a la Ley 21.719 de
          Protección de Datos Personales de Chile.
        </p>

        {/* Tipo */}
        <div className={styles.field}>
          <label className={styles.label}>Tipo de solicitud</label>
          <div className={styles.tipoGrid}>
            {TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                className={`${styles.tipoBtn} ${form.tipo === t.value ? styles.tipoBtnActive : ""}`}
                onClick={() => set("tipo", t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tipoInfo && <p className={styles.tipoDesc}>{tipoInfo.desc}</p>}
        </div>

        {/* RUT */}
        <div className={styles.field}>
          <label className={styles.label}>RUT *</label>
          <input
            className={styles.input}
            type="text"
            placeholder="12.345.678-9"
            value={form.rut}
            onChange={(e) => set("rut", e.target.value)}
          />
        </div>

        {/* Email */}
        <div className={styles.field}>
          <label className={styles.label}>Email de contacto *</label>
          <input
            className={styles.input}
            type="email"
            placeholder="tu@email.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>

        {/* Detalle opcional */}
        <div className={styles.field}>
          <label className={styles.label}>Detalle adicional (opcional)</label>
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="Describe tu solicitud con más detalle si lo deseas…"
            value={form.detalle}
            onChange={(e) => set("detalle", e.target.value)}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.btnSend} onClick={enviar} disabled={saving}>
          {saving ? "Enviando…" : "Enviar solicitud"}
        </button>

        <p className={styles.legal}>
          Tus datos son tratados exclusivamente para gestionar esta solicitud conforme a la
          Ley 21.719 y serán eliminados una vez resuelta.
        </p>
      </div>
    </main>
  );
}
