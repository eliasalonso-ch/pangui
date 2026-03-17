"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./FotoUpload.module.css";

const BUCKET = "fotos-ordenes";
const MAX_WIDTH = 1200;
const QUALITY = 0.7;

// ── Compresión ────────────────────────────────────────────────
// Reduce fotos de 5-12 MB a ~200 KB usando Canvas API

async function comprimirImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("No se pudo comprimir la imagen"));
        },
        "image/jpeg",
        QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen"));
    };

    img.src = objectUrl;
  });
}

// ── Componente ────────────────────────────────────────────────

export default function FotoUpload({ ordenId, tipo, readOnly = false }) {
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const inputRef = useRef(null);

  const label = tipo === "antes" ? "Antes" : "Después";

  const cargarFotos = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("fotos_orden")
      .select("id, url, created_at")
      .eq("orden_id", ordenId)
      .eq("tipo", tipo)
      .order("created_at");
    if (data) setFotos(data);
  }, [ordenId, tipo]);

  useEffect(() => {
    cargarFotos();

    const supabase = createClient();
    const channel = supabase
      .channel(`fotos-${ordenId}-${tipo}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fotos_orden",
          filter: `orden_id=eq.${ordenId}`,
        },
        cargarFotos,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ordenId, tipo, cargarFotos]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setError(null);
    setUploading(true);

    try {
      const blob = await comprimirImagen(file);
      const path = `${ordenId}/${tipo}_${Date.now()}.jpg`;

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg" });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from(BUCKET).getPublicUrl(path);

      const { error: insError } = await supabase
        .from("fotos_orden")
        .insert({ orden_id: ordenId, tipo, url: publicUrl });

      if (insError) throw insError;
    } catch (err) {
      console.error("Error subiendo foto:", err);
      setError(
        navigator.onLine
          ? "Error al subir la foto. Intenta de nuevo."
          : "Sin conexión. Verifica tu red e intenta de nuevo.",
      );
    }

    setUploading(false);
  }

  async function eliminarFoto(fotoId, url) {
    const supabase = createClient();
    const path = url.split(`/object/public/${BUCKET}/`)[1];
    if (path) {
      await supabase.storage
        .from(BUCKET)
        .remove([decodeURIComponent(path)]);
    }
    await supabase.from("fotos_orden").delete().eq("id", fotoId);
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.subLabel}>{label}</span>

        {!readOnly && (
          <>
            <button
              className={styles.addBtn}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              aria-label={`Agregar foto ${label.toLowerCase()}`}
            >
              {uploading ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path
                    d="M6.5 1v11M1 6.5h11"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {uploading ? "Subiendo…" : "Foto"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className={styles.hiddenInput}
              onChange={handleFileChange}
            />
          </>
        )}
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {fotos.length === 0 ? (
        <p className={styles.empty}>Sin fotos</p>
      ) : (
        <div className={styles.grid}>
          {fotos.map((f) => (
            <div key={f.id} className={styles.thumbWrap}>
              <img
                src={f.url}
                alt={`Foto ${label}`}
                className={styles.thumb}
                onClick={() => setLightbox(f.url)}
                loading="lazy"
              />
              {!readOnly && (
                <button
                  className={styles.deleteBtn}
                  onClick={() => eliminarFoto(f.id, f.url)}
                  aria-label="Eliminar foto"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className={styles.overlay}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada"
        >
          <button
            className={styles.overlayClose}
            onClick={() => setLightbox(null)}
            aria-label="Cerrar"
          >
            ×
          </button>
          <img
            src={lightbox}
            alt="Foto ampliada"
            className={styles.overlayImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
