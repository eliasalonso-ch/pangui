"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import dynamic from "next/dynamic";
import styles from "./page.module.css";
import { BarChart2, Zap } from "lucide-react";

const KpiDash = dynamic(
  () => import("@/components/KpiDash"),
  { ssr: false, loading: () => <div className={styles.cargando}>Cargando panel…</div> }
);

export default function DatosPage() {
  const router = useRouter();
  const [plantaId,   setPlantaId]   = useState(null);
  const [plan,       setPlan]       = useState(null);
  const [planStatus, setPlanStatus] = useState(null);
  const [cargando,   setCargando]   = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      let perfil = getPerfilCache(user.id);
      if (!perfil || !perfil.workspace_id) {
        const { data } = await supabase
          .from("usuarios")
          .select("workspace_id, rol, nombre, plan, plan_status")
          .eq("id", user.id)
          .maybeSingle();
        perfil = data;
        if (perfil) setPerfilCache(user.id, perfil);
      }
      const effectivePlantaId = perfil?.workspace_id;
      if (!effectivePlantaId) { router.push("/login"); return; }
      setPlantaId(effectivePlantaId);
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);
      setCargando(false);
    }
    init();
  }, [router]);

  if (cargando) return <div className={styles.cargando}>Cargando…</div>;

  const isBasic = (plan ?? "basic") === "basic" && planStatus !== "trial";

  return (
    <div className={styles.root}>
      {isBasic ? (
        <div style={{ position: "relative" }}>
          {/* Blurred preview */}
          <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", opacity: 0.5 }}>
            <KpiDash plantaId={plantaId} />
          </div>
          {/* Overlay */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: "2rem",
          }}>
            <div style={{
              background: "var(--white)", borderRadius: 16, padding: "32px 28px",
              maxWidth: 380, width: "100%", textAlign: "center",
              boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 14, background: "var(--accent-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--accent-1)", margin: "0 auto 16px",
              }}>
                <BarChart2 size={24} />
              </div>
              <span style={{
                display: "inline-block", fontSize: 11, fontWeight: 700,
                color: "var(--accent-1)", textTransform: "uppercase",
                letterSpacing: "0.1em", background: "var(--accent-2)",
                padding: "3px 12px", borderRadius: 20, marginBottom: 12,
              }}>Plan Pro</span>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--black)", margin: "0 0 8px" }}>
                Panel de métricas
              </h2>
              <p style={{ fontSize: 13, color: "var(--accent-5)", lineHeight: 1.6, margin: "0 0 20px" }}>
                Visualiza KPIs de mantenimiento, tendencias de OTs, costos y disponibilidad de equipos.
              </p>
              <button
                onClick={() => router.push("/configuracion/suscripcion")}
                style={{
                  width: "100%", padding: "12px 0", background: "var(--accent-1)",
                  color: "#fff", border: "none", borderRadius: 10, fontSize: 14,
                  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Zap size={14} /> Ver planes Pro
              </button>
            </div>
          </div>
        </div>
      ) : (
        <KpiDash plantaId={plantaId} />
      )}
    </div>
  );
}
