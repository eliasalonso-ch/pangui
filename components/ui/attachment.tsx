"use client"

/**
 * Tarjeta de archivo adjunto: ícono según el tipo, nombre, metadatos
 * (tipo · tamaño o estado de subida) y acciones.
 *
 * Diseño del componente "Attachment" de shadcn/ui (media + content + actions,
 * estados idle / uploading / error / done), pero con los estilos inline y las
 * variables CSS de la app: las clases Tailwind de shadcn no funcionan acá
 * (preflight desactivado, variables propias). Ver date-time-picker.tsx.
 */

import * as React from "react"
import { File, FileImage, FileSpreadsheet, FileText, Loader2, X } from "lucide-react"

export type AttachmentState = "uploading" | "error" | "done"

/** "PDF", "PNG", "XLSX"…: de la extensión del nombre o, si no hay, del MIME. */
export function tipoArchivo(nombre?: string | null, mime?: string | null): string {
  const ext = nombre?.includes(".") ? nombre.split(".").pop() : null
  return (ext || mime?.split("/").pop() || "Archivo").toUpperCase().slice(0, 5)
}

/** 820 KB, 1.4 MB… */
export function tamanoArchivo(bytes?: number | null): string | null {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Ícono según el tipo (devuelve el elemento, no el componente: así no se crea uno por render). */
function iconoPara(nombre?: string | null, mime?: string | null): React.ReactNode {
  const t = `${mime ?? ""} ${nombre ?? ""}`.toLowerCase()
  if (/image\/|\.(png|jpe?g|gif|webp|heic)\b/.test(t)) return <FileImage size={18} />
  if (/sheet|excel|csv|\.(xlsx?|csv)\b/.test(t)) return <FileSpreadsheet size={18} />
  if (/pdf|word|text|\.(pdf|docx?|txt)\b/.test(t)) return <FileText size={18} />
  return <File size={18} />
}

export function Attachment({ nombre, mime, descripcion, state = "done", href, onRemove }: {
  nombre: string
  mime?: string | null
  /** Línea secundaria; por defecto, el tipo de archivo. */
  descripcion?: string
  state?: AttachmentState
  /** Si hay URL, toda la tarjeta abre el archivo (las acciones siguen aparte). */
  href?: string | null
  onRemove?: () => void
}) {
  const error = state === "error"
  const subiendo = state === "uploading"
  const contenido = (
    <>
      <span style={{
        width: 40, height: 40, borderRadius: "var(--r-md)", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: error ? "var(--danger-bg)" : "var(--brand-tint)",
        color: error ? "var(--danger)" : "var(--brand)",
      }}>
        {subiendo ? <Loader2 size={18} className="animate-spin" /> : iconoPara(nombre, mime)}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span
          className={subiendo ? "animate-pulse" : undefined}
          style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {nombre}
        </span>
        <span style={{ display: "block", marginTop: 2, fontSize: 14, color: error ? "var(--danger)" : "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {descripcion ?? tipoArchivo(nombre, mime)}
        </span>
      </span>
    </>
  )
  const marco: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: 1,
    textDecoration: "none", color: "inherit",
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 10px 12px",
      border: `1px solid ${error ? "var(--danger)" : "var(--border)"}`, borderRadius: "var(--r-md)",
      background: "var(--surface-1)",
    }}>
      {href && !subiendo
        ? <a href={href} target="_blank" rel="noreferrer" aria-label={`Abrir ${nombre}`} style={marco}>{contenido}</a>
        : <span style={marco}>{contenido}</span>}
      {onRemove && !subiendo && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${nombre}`}
          style={{
            width: 32, height: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            border: "none", borderRadius: 6, background: "transparent", color: "var(--fg-3)", cursor: "pointer",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent" }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}

/** Zona para elegir un archivo (mismo vacío punteado que la de imágenes). */
export function AttachmentDropzone({ label, onFile, disabled }: {
  label: string
  onFile: (f: File) => void
  disabled?: boolean
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        style={{
          width: "100%", minHeight: 72, padding: "14px 12px", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          border: "1px dashed var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-canvas)",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
          fontFamily: "inherit", fontSize: 14, color: "var(--brand)",
        }}
      >
        <File size={18} />
        {label}
      </button>
      <input
        ref={ref}
        type="file"
        style={{ display: "none" }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
          e.target.value = "" // elegir el mismo archivo dos veces sigue disparando onChange
        }}
      />
    </>
  )
}
