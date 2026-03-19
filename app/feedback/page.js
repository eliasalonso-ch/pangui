"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import Topbar from "@/components/Topbar";
import styles from "./page.module.css";

const TIPOS = ["Sugerencia", "Problema", "Otra cosa"];

export default function FeedbackPage() {
  const router = useRouter();

  const [userId, setUserId] = useState(null);
  const [rol, setRol]       = useState("");
  const [cargando, setCargando] = useState(true);

  const [tipo, setTipo]       = useState(TIPOS[0]);
  const [mensaje, setMensaje] = useState("");
  const [rating, setRating]   = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado]   = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("id", user.id)
        .maybeSingle();

      setUserId(user.id);
      setRol(perfil?.rol ?? "");
      setCargando(false);
    }
    init();
  }, [router]);

  async function enviar(e) {
    e.preventDefault();
    if (!mensaje.trim()) { setError("Escribe tu feedback antes de enviar."); return; }
    setError(null);
    setEnviando(true);

    const supabase = createClient();
    const { error: err } = await supabase.from("feedback").insert({
      usuario_id: userId,
      tipo,
      mensaje:    mensaje.trim(),
      rating:     rating ?? null,
    });

    if (err) {
      setError("No se pudo enviar. Intenta de nuevo.");
      setEnviando(false);
      return;
    }

    setEnviado(true);
    setEnviando(false);
  }

  function volver() {
    router.push(rol === "tecnico" ? "/tecnico" : "/jefe");
  }

  if (cargando) {
    return (
      <>
        <Topbar />
        <p className={styles.loading}>Cargando…</p>
      </>
    );
  }

  return (
    <>
      <Topbar />

      <main className={styles.main}>

        {enviado ? (
          <div className={styles.confirmacion}>
            <div className={styles.confirmIcon}>✓</div>
            <h1 className={styles.confirmTitulo}>Gracias por tu feedback</h1>
            <p className={styles.confirmSub}>
              Lo leemos con atención para mejorar Pangui.
            </p>
            <button className={styles.btnVolver} onClick={volver}>
              Volver
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <h1 className={styles.titulo}>Ayúdanos a mejorar</h1>
              <p className={styles.sub}>
                Tu opinión nos ayuda a hacer Pangui mejor para ti y tu equipo.
              </p>
            </div>

            <form className={styles.form} onSubmit={enviar}>

              {/* Tipo */}
              <div className={styles.field}>
                <label className={styles.label}>
                  ¿Qué tipo de feedback?
                </label>
                <div className={styles.tipoGrid}>
                  {TIPOS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`${styles.tipoBtn} ${tipo === t ? styles.tipoBtnActive : ""}`}
                      onClick={() => setTipo(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mensaje */}
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mensaje">
                  Cuéntanos
                </label>
                <textarea
                  id="mensaje"
                  className={styles.textarea}
                  placeholder="Escribe aquí tu sugerencia, problema o comentario…"
                  rows={5}
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />
              </div>

              {/* Rating */}
              <div className={styles.field}>
                <label className={styles.label}>
                  ¿Qué tan satisfecho estás con Pangui?
                </label>
                <div className={styles.ratingRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`${styles.ratingBtn} ${rating === n ? styles.ratingBtnActive : ""}`}
                      onClick={() => setRating(rating === n ? null : n)}
                      aria-label={`${n} de 5`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className={styles.ratingHint}>
                  {rating === 1 && "Muy insatisfecho"}
                  {rating === 2 && "Insatisfecho"}
                  {rating === 3 && "Neutral"}
                  {rating === 4 && "Satisfecho"}
                  {rating === 5 && "Muy satisfecho"}
                  {!rating && <span>&nbsp;</span>}
                </p>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <button
                type="submit"
                className={styles.btnEnviar}
                disabled={enviando}
              >
                {enviando ? "Enviando…" : "Enviar feedback"}
              </button>

            </form>
          </>
        )}

      </main>
    </>
  );
}
