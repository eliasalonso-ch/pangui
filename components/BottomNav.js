"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Package,
  MoreHorizontal,
  Plus,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./BottomNav.module.css";

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isJefe = pathname.startsWith("/jefe");
  const base = isJefe ? "/jefe" : "/tecnico";

  function isActive(href) {
    return pathname === href || (href !== base && pathname.startsWith(href));
  }

  async function cerrarSesion() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function darFeedback() {
    window.open("mailto:feedback@pangi.cl?subject=Feedback%20Pangi", "_blank");
    setMoreOpen(false);
  }

  return (
    <>
      {/* ── Más sheet ── */}
      {moreOpen && (
        <div className={styles.overlay} onClick={() => setMoreOpen(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />

            <button className={styles.sheetItem} onClick={darFeedback}>
              <span className={styles.sheetIconWrap}>
                <MessageSquare className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>Dar feedback</span>
                <span className={styles.sheetSub}>Ayúdanos a mejorar</span>
              </div>
            </button>

            <div className={styles.sheetDivider} />

            <button
              className={`${styles.sheetItem} ${styles.sheetItemDanger}`}
              onClick={cerrarSesion}
              disabled={signingOut}
            >
              <span className={styles.sheetIconWrap}>
                <LogOut className={styles.sheetIcon} />
              </span>
              <div className={styles.sheetText}>
                <span className={styles.sheetTitle}>
                  {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── Nav bar ── */}
      <nav className={styles.nav}>
        <button
          className={`${styles.itemNueva} ${isActive(`${base}/trabajo/nuevo`) ? styles.active : ""}`}
          onClick={() => router.push(`${base}/trabajo/nuevo`)}
        >
          <Plus className={styles.nuevaIcon} />
          <span className={styles.label}>Nueva Orden</span>
        </button>

        <button
          className={`${styles.item} ${isActive(base) ? styles.active : ""}`}
          onClick={() => router.push(base)}
        >
          <Home className={styles.icon} />
          <span className={styles.label}>Inicio</span>
        </button>

        <button
          className={`${styles.item} ${isActive(`${base}/inventario`) ? styles.active : ""}`}
          onClick={() => router.push(`${base}/inventario`)}
        >
          <Package className={styles.icon} />
          <span className={styles.label}>Inventario</span>
        </button>

        <button
          className={`${styles.item} ${moreOpen ? styles.active : ""}`}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal className={styles.icon} />
          <span className={styles.label}>Más</span>
        </button>
      </nav>
    </>
  );
}
