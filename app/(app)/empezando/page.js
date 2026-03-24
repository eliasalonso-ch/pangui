"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ArrowRight, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

export default function Empezando() {
  const router = useRouter();
  const [userId, setUserId]   = useState(null);
  const [step1, setStep1]     = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }

      setUserId(user.id);

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id, onboarding_done")
        .eq("id", user.id)
        .maybeSingle();

      // Already marked done in DB — show the "all done" view
      if (perfil?.onboarding_done) {
        setStep1(true);
        setAllDone(true);
        setLoading(false);
        return;
      }

      const workspaceId = perfil?.workspace_id;
      if (!workspaceId) { setLoading(false); return; }

      // Step 1: has this user created at least one OT in the workspace?
      const { count: otCount } = await sb
        .from("ordenes_trabajo")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId);

      const s1 = (otCount ?? 0) > 0;
      setStep1(s1);

      if (s1) {
        // Mark done for this user in DB
        await sb.from("usuarios").update({ onboarding_done: true }).eq("id", user.id);
        setAllDone(true);
      }

      setLoading(false);
    }
    check();
  }, []);

  if (loading) return <div className={styles.loading}>Cargando…</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Empezando con Pangui</h1>
        <p className={styles.subtitle}>Completa este paso para sacar el máximo provecho de la plataforma.</p>
      </div>

      {allDone && (
        <div className={styles.doneBanner}>
          <CheckCircle2 size={20} />
          <span>¡Todo listo! Ya tienes Pangui configurado. Puedes revisar esta página desde <strong>Ayuda</strong> cuando quieras.</span>
        </div>
      )}

      <div className={styles.steps}>
        <div className={`${styles.stepCard} ${step1 ? styles.stepDone : ""}`}>
          <div className={styles.stepIcon}>
            {step1 ? <CheckCircle2 size={24} /> : <ClipboardList size={24} />}
          </div>
          <div className={styles.stepBody}>
            <div className={styles.stepHeader}>
              <span className={styles.stepNum}>Paso 1</span>
              {step1
                ? <span className={styles.stepBadgeDone}><CheckCircle2 size={12} /> Completado</span>
                : <span className={styles.stepBadge}>Pendiente</span>}
            </div>
            <h2 className={styles.stepTitle}>Crea tu primera orden de trabajo</h2>
            <p className={styles.stepDesc}>Las órdenes son el núcleo de Pangui. Regístralas, asígnalas y sigue su estado en tiempo real.</p>
            {!step1 && (
              <button className={styles.stepBtn} onClick={() => router.push("/ordenes?nuevo=1")}>
                Crear orden <ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {allDone && (
        <div className={styles.doneActions}>
          <button className={styles.primaryBtn} onClick={() => router.push("/ordenes")}>
            Ir a mis órdenes
          </button>
        </div>
      )}
    </div>
  );
}
