"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

const TIPO_LABEL = {
  acceso:        "Acceso",
  rectificacion: "Rectificación",
  cancelacion:   "Supresión",
  supresion:     "Supresión",
  oposicion:     "Oposición",
  portabilidad:  "Portabilidad",
  bloqueo:       "Bloqueo temporal",
};

const ESTADO_COLOR = {
  pendiente: "#f59e0b",
  resuelto:  "#22c55e",
};

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function JefeARCOPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente"); // "pendiente" | "todos"

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      const { data: perfil } = await supabase
        .from("usuarios").select("rol").eq("id", user.id).maybeSingle();
      if (perfil?.rol !== "jefe" && perfil?.rol !== "admin") { router.push("/datos"); return; }

      const { data } = await supabase
        .from("solicitudes_arco")
        .select("*")
        .order("created_at", { ascending: false });
      setSolicitudes(data ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function marcarResuelto(id) {
    const supabase = createClient();
    await supabase.from("solicitudes_arco")
      .update({ estado: "resuelto", resolved_at: new Date().toISOString() })
      .eq("id", id);
    setSolicitudes((prev) =>
      prev.map((s) => s.id === id ? { ...s, estado: "resuelto", resolved_at: new Date().toISOString() } : s)
    );
  }

  const lista = filtro === "pendiente"
    ? solicitudes.filter((s) => s.estado === "pendiente")
    : solicitudes;

  const pendienteCount = solicitudes.filter((s) => s.estado === "pendiente").length;

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>
          Solicitudes ARCO
          {pendienteCount > 0 && (
            <span className={styles.badge}>{pendienteCount}</span>
          )}
        </h1>
      </div>

      <div className={styles.filterRow}>
        <button
          className={`${styles.filterBtn} ${filtro === "pendiente" ? styles.filterBtnActive : ""}`}
          onClick={() => setFiltro("pendiente")}
        >
          Pendientes ({pendienteCount})
        </button>
        <button
          className={`${styles.filterBtn} ${filtro === "todos" ? styles.filterBtnActive : ""}`}
          onClick={() => setFiltro("todos")}
        >
          Todas ({solicitudes.length})
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando…</p>
      ) : lista.length === 0 ? (
        <div className={styles.emptyState}>
          <CheckCircle size={40} color="#22c55e" />
          <p className={styles.emptyTitle}>Sin solicitudes pendientes</p>
          <p className={styles.emptySub}>Todas las solicitudes ARCO han sido atendidas.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {lista.map((s) => (
            <div key={s.id} className={styles.card}>
              <div className={styles.cardTop}>
                <span className={styles.tipo}>{TIPO_LABEL[s.tipo] ?? s.tipo}</span>
                <span
                  className={styles.estado}
                  style={{ color: ESTADO_COLOR[s.estado] ?? "#6b7280" }}
                >
                  {s.estado === "resuelto" ? "Resuelto" : "Pendiente"}
                </span>
              </div>
              <div className={styles.detail}>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>RUT</span>
                  <span className={styles.detailVal}>{s.rut}</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Email</span>
                  <a href={`mailto:${s.email}`} className={styles.detailLink}>{s.email}</a>
                </div>
                {s.detalle && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Detalle</span>
                    <span className={styles.detailVal}>{s.detalle}</span>
                  </div>
                )}
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Recibida</span>
                  <span className={styles.detailVal}>{fmtDate(s.created_at)}</span>
                </div>
                {s.resolved_at && (
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Resuelta</span>
                    <span className={styles.detailVal}>{fmtDate(s.resolved_at)}</span>
                  </div>
                )}
              </div>
              {s.estado === "pendiente" && (
                <button className={styles.btnResolver} onClick={() => marcarResuelto(s.id)}>
                  <CheckCircle size={15} />
                  Marcar como resuelta
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.infoBox}>
        <p className={styles.infoText}>
          <strong>Ley 21.719 — Protección de Datos Personales (Chile).</strong> El responsable debe responder las solicitudes ARCO en un plazo máximo de <strong>30 días corridos</strong> desde su recepción (Art. 11). Los derechos aplicables son: Acceso, Rectificación, Supresión, Oposición, Portabilidad y Bloqueo temporal. Responde directamente al email del solicitante y conserva registro de cada respuesta.
        </p>
      </div>
    </main>
  );
}
