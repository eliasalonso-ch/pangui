"use client";

import { useEffect } from "react";
import { Camera, FolderPlus, Loader2, Paperclip, Pencil, X } from "lucide-react";

export type Tipo = "referencia" | "evidencia";

/**
 * Type label. Uses Lucide glyphs rather than 📎/📷 emoji — emoji render in their
 * own fixed colors (the paperclip reads green), which ignores the theme. These
 * inherit `currentColor` from the chip/button instead.
 */
export function TipoLabel({ tipo }: { tipo: Tipo }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {tipo === "referencia" ? <Paperclip size={12} /> : <Camera size={12} />}
      {tipo === "referencia" ? "Referencia" : "Evidencia"}
    </span>
  );
}

/**
 * Centered modal for creating an album: name and type only.
 * Description is deliberately omitted — mobile never surfaces it, so new albums
 * are created with an empty one. Existing descriptions still render in the
 * album header and stay editable through the pencil/edit form.
 *
 * Shared by the OT detail gallery and the create-OT panel so both flows get the
 * same dialog. Rendered inline (not a portal) — a fixed-position overlay
 * escapes its container's stacking context fine.
 */
export function AlbumModal({
  mode = "crear", titulo, tipo, saving,
  onTitulo, onTipo, onCancel, onSubmit,
}: {
  /** "crear" for a new album, "editar" to rename an existing one. */
  mode?: "crear" | "editar";
  titulo: string;
  tipo: Tipo;
  saving: boolean;
  onTitulo: (v: string) => void;
  onTipo: (v: Tipo) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const isEdit = mode === "editar";
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onCancel]);

  const valid = titulo.trim().length > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Editar álbum" : "Nuevo álbum"}
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 430, padding: "26px 30px 30px",
          borderRadius: 14, border: "1px solid var(--border)",
          background: "var(--surface-1)", boxShadow: "var(--shadow-lg)",
          position: "relative",
        }}
      >
        {/* Close sits top-left, mirroring the reference dialog. */}
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cerrar"
          style={{ position: "absolute", top: 14, left: 14, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: "var(--fg-2)", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          <X size={19} />
        </button>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 6, marginBottom: 20 }}>
          {isEdit
            ? <Pencil size={34} strokeWidth={1.6} style={{ color: "var(--brand)" }} />
            : <FolderPlus size={38} strokeWidth={1.6} style={{ color: "var(--brand)" }} />}
          <div style={{ fontSize: 19, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.01em" }}>{isEdit ? "Editar álbum" : "Nuevo álbum"}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input
            autoFocus
            type="text"
            placeholder="Nombre del álbum"
            value={titulo}
            onChange={e => onTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && valid && !saving) onSubmit(); }}
            style={{ height: 42, padding: "0 14px", border: "2px solid var(--brand)", borderRadius: 9, fontSize: 14, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)", width: "100%" }}
          />

          <div style={{ display: "flex", gap: 8 }}>
            {(["referencia", "evidencia"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => onTipo(t)}
                title={t === "referencia"
                  ? "Fotos del supervisor para guiar al técnico"
                  : "Fotos que el técnico debe subir en campo"}
                style={{
                  flex: 1, height: 40, borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: `1.5px solid ${tipo === t ? "var(--brand)" : "var(--border)"}`,
                  background: tipo === t ? "var(--brand-tint)" : "var(--surface-1)",
                  color: tipo === t ? "var(--brand-fg)" : "var(--fg-2)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <TipoLabel tipo={t} />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!valid || saving}
            style={{
              height: 44, marginTop: 4, border: "none", borderRadius: 9,
              background: valid ? "var(--brand)" : "var(--border)",
              color: valid ? "var(--fg-on-brand)" : "var(--fg-4)",
              fontSize: 14.5, fontWeight: 600, cursor: valid && !saving ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontFamily: "inherit",
              transition: "opacity 0.12s", opacity: valid && !saving ? 1 : 0.75,
            }}
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}
