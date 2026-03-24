"use client";
import { useRouter } from "next/navigation";
import { Rocket, MessageSquare, ArrowRight } from "lucide-react";
import styles from "./page.module.css";

export default function Ayuda() {
  const router = useRouter();
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Centro de ayuda</h1>
      <div className={styles.cards}>
        <button className={styles.card} onClick={() => router.push("/empezando")}>
          <span className={styles.cardIcon}><Rocket size={22} /></span>
          <div>
            <p className={styles.cardTitle}>Guía de inicio</p>
            <p className={styles.cardDesc}>Revisa los pasos para configurar Pangui</p>
          </div>
          <ArrowRight size={16} className={styles.cardArrow} />
        </button>
        <a className={styles.card} href="mailto:soporte@pangui.cl">
          <span className={styles.cardIcon}><MessageSquare size={22} /></span>
          <div>
            <p className={styles.cardTitle}>Contactar soporte</p>
            <p className={styles.cardDesc}>soporte@pangui.cl</p>
          </div>
          <ArrowRight size={16} className={styles.cardArrow} />
        </a>
      </div>
    </div>
  );
}
