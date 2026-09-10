"use client";

import { useRef, useState } from "react";
import {
  Truck, Loader2, FileText, Building2, MapPin, Contact, Mail, Phone, Globe,
  DollarSign, Camera, X,
} from "lucide-react";
import { uploadToR2 } from "@/lib/r2";
import {
  PanelCatalogo, FieldRow, tituloInputStyle,
  inputStyle, textareaStyle, focoInput,
} from "@/components/catalogo/PanelCatalogo";
import type { Proveedor, ProveedorForm as FormValues } from "@/types/proveedores";

/**
 * Alta y edición de un proveedor.
 *
 * Los campos van en tres bloques porque responden a preguntas distintas: cómo
 * se llama, cómo se le factura y cómo se le contacta. Solo el nombre es
 * obligatorio — un proveedor recién anotado en terreno sirve igual, y exigirle
 * RUT haría que nadie lo cargue.
 */
export default function ProveedorFormPanel({
  inicial, guardando, error, onCancel, onSubmit,
}: {
  inicial?: Proveedor | null;
  guardando: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [dragLogo, setDragLogo] = useState(false);
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [v, setV] = useState<FormValues>({
    nombre: inicial?.nombre ?? "",
    rut: inicial?.rut ?? "",
    giro: inicial?.giro ?? "",
    direccion: inicial?.direccion ?? "",
    comuna: inicial?.comuna ?? "",
    ciudad: inicial?.ciudad ?? "",
    contacto: inicial?.contacto ?? "",
    email: inicial?.email ?? "",
    telefono: inicial?.telefono ?? "",
    sitio_web: inicial?.sitio_web ?? "",
    condiciones_pago: inicial?.condiciones_pago ?? "",
    notas: inicial?.notas ?? "",
    logo_url: inicial?.logo_url ?? null,
  });

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true); setErrorLogo(null);
    try {
      // Carpeta libre en r2-presign: el logo se sube antes de que exista la fila.
      set("logo_url", await uploadToR2(file, "proveedores"));
    } catch (err) {
      setErrorLogo(err instanceof Error ? err.message : "No se pudo subir el logo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function soltarLogo(e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault(); setDragLogo(false);
    if (subiendo) return;
    const file = Array.from(e.dataTransfer.files).find(f => f.type.startsWith("image/"));
    if (!file) return;
    setSubiendo(true); setErrorLogo(null);
    try { set("logo_url", await uploadToR2(file, "proveedores")); }
    catch (err) { setErrorLogo(err instanceof Error ? err.message : "No se pudo subir el logo."); }
    finally { setSubiendo(false); }
  }

  function set<K extends keyof FormValues>(k: K, val: FormValues[K]) {
    setV(prev => ({ ...prev, [k]: val }));
  }

  return (
    <PanelCatalogo
      titulo={inicial ? "Editar proveedor" : "Nuevo proveedor"}
      guardando={guardando}
      puedeGuardar={v.nombre.trim().length > 0}
      error={error}
      textoGuardar={inicial ? "Guardar" : "Crear proveedor"}
      onCancel={onCancel}
      onSubmit={() => onSubmit(v)}
    >
      <div style={{ marginBottom: 10 }}>
        <input
          autoFocus
          value={v.nombre}
          onChange={e => set("nombre", e.target.value)}
          placeholder="Ej: Maestranza Aconcagua Ltda."
          style={{ ...tituloInputStyle(v.nombre), fontSize: 20, fontWeight: 400, lineHeight: 1.35 }}
        />
      </div>

      <FieldRow icon={<Camera size={16} />} label="Logo">
        <input ref={logoInputRef} type="file" accept="image/*" onChange={subirLogo} disabled={subiendo} style={{ display: "none" }} />
        <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
          <button type="button" onClick={() => logoInputRef.current?.click()} disabled={subiendo}
            onDragOver={e => { e.preventDefault(); if (!subiendo) setDragLogo(true); }} onDragLeave={() => setDragLogo(false)} onDrop={soltarLogo}
            style={{ flex: v.logo_url ? "0 0 132px" : 1, minHeight: v.logo_url ? 108 : 96, border: `1px dashed ${dragLogo ? "var(--brand)" : "var(--border-strong)"}`, borderRadius: "var(--r-md)", background: dragLogo ? "var(--brand-tint)" : "var(--surface-canvas)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, color: "var(--fg-3)", fontSize: 14, fontFamily: "inherit", cursor: subiendo ? "default" : "pointer", padding: 12 }}>
            {subiendo ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--brand)" }} /> : <Camera size={16} style={{ color: "var(--brand)" }} />}
            <span>{subiendo ? "Subiendo…" : v.logo_url ? "Reemplazar" : "Agregue o arrastre un logo"}</span>
          </button>
          {v.logo_url && <div style={{ position: "relative", flex: "0 0 132px", minHeight: 108, borderRadius: "var(--r-md)", overflow: "hidden", border: "1px solid var(--border)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.logo_url} alt="Logo del proveedor" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <button type="button" onClick={() => set("logo_url", null)} aria-label="Quitar logo" style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--r-sm)", background: "rgba(0,0,0,.55)", color: "#fff", cursor: "pointer", padding: 0 }}><X size={13} /></button>
          </div>}
        </div>
        {errorLogo && <div style={{ fontSize: 14, color: "var(--danger)", marginTop: 6 }}>{errorLogo}</div>}
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow icon={<FileText size={16} />} label="RUT">
          <input value={v.rut ?? ""} onChange={e => set("rut", e.target.value)} placeholder="76.543.210-K" style={inputStyle} {...focoInput} />
        </FieldRow>
        <FieldRow icon={<Building2 size={16} />} label="Giro">
          <input value={v.giro ?? ""} onChange={e => set("giro", e.target.value)} placeholder="Maestranza y mecanizado" style={inputStyle} {...focoInput} />
        </FieldRow>
      </div>

      <FieldRow icon={<MapPin size={16} />} label="Dirección">
        <input value={v.direccion ?? ""} onChange={e => set("direccion", e.target.value)} style={inputStyle} {...focoInput} />
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow icon={<MapPin size={16} />} label="Comuna">
          <input value={v.comuna ?? ""} onChange={e => set("comuna", e.target.value)} style={inputStyle} {...focoInput} />
        </FieldRow>
        <FieldRow icon={<MapPin size={16} />} label="Ciudad">
          <input value={v.ciudad ?? ""} onChange={e => set("ciudad", e.target.value)} style={inputStyle} {...focoInput} />
        </FieldRow>
      </div>

      <FieldRow icon={<Contact size={16} />} label="Persona de contacto">
        <input value={v.contacto ?? ""} onChange={e => set("contacto", e.target.value)} style={inputStyle} {...focoInput} />
      </FieldRow>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow icon={<Mail size={16} />} label="Correo">
          {/* A esta dirección se envía la orden de compra. */}
          <input type="email" value={v.email ?? ""} onChange={e => set("email", e.target.value)} placeholder="ventas@proveedor.cl" style={inputStyle} {...focoInput} />
        </FieldRow>
        <FieldRow icon={<Phone size={16} />} label="Teléfono">
          <input value={v.telefono ?? ""} onChange={e => set("telefono", e.target.value)} style={inputStyle} {...focoInput} />
        </FieldRow>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <FieldRow icon={<Globe size={16} />} label="Sitio web">
          <input value={v.sitio_web ?? ""} onChange={e => set("sitio_web", e.target.value)} style={inputStyle} {...focoInput} />
        </FieldRow>
        <FieldRow icon={<DollarSign size={16} />} label="Condiciones de pago">
          <input value={v.condiciones_pago ?? ""} onChange={e => set("condiciones_pago", e.target.value)} placeholder="30 días" style={inputStyle} {...focoInput} />
        </FieldRow>
      </div>

      <FieldRow icon={<FileText size={16} />} label="Notas">
        <textarea
          value={v.notas ?? ""}
          onChange={e => set("notas", e.target.value)}
          rows={3}
          style={textareaStyle}
          {...focoInput}
        />
      </FieldRow>
    </PanelCatalogo>
  );
}
