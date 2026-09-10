"use client";

import { useState } from "react";
import {
  Truck, Loader2, FileText, Building2, MapPin, Contact, Mail, Phone, Globe,
  DollarSign, ImagePlus, Pencil,
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
  const [errorLogo, setErrorLogo] = useState<string | null>(null);
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
      <FieldRow icon={<Pencil size={16} />} label="Nombre o razón social">
        <input
          autoFocus
          value={v.nombre}
          onChange={e => set("nombre", e.target.value)}
          placeholder="Ej: Maestranza Aconcagua Ltda."
          style={tituloInputStyle(v.nombre)}
        />
      </FieldRow>

      <FieldRow icon={<ImagePlus size={16} />} label="Logo">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            width: 48, height: 48, borderRadius: "var(--r-md)", flexShrink: 0, overflow: "hidden",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--brand-tint)", color: "var(--brand)",
          }}>
            {v.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={v.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Truck size={20} />}
          </span>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px",
            border: "1px solid var(--border)", borderRadius: "var(--r-md)", cursor: "pointer",
            fontSize: 14, color: "var(--fg-1)", background: "var(--surface-1)",
          }}>
            {subiendo ? <Loader2 size={14} className="animate-spin" /> : null}
            {v.logo_url ? "Cambiar" : "Subir logo"}
            <input type="file" accept="image/*" onChange={subirLogo} disabled={subiendo} style={{ display: "none" }} />
          </label>
          {v.logo_url && (
            <button type="button" onClick={() => set("logo_url", null)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--fg-3)" }}>
              Quitar
            </button>
          )}
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
