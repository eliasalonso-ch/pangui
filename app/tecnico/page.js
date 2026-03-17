"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";

// ── Helpers ──────────────────────────────────────────────────

function formatId(orden) {
  const year = new Date(orden.created_at).getFullYear();
  const suffix = orden.id.slice(-4).toUpperCase();
  const prefix = orden.tipo === "emergencia" ? "EM" : "OT";
  return `${prefix}-${year}-${suffix}`;
}

function formatFechaHora(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  const esHoy = d.toDateString() === hoy.toDateString();
  if (esHoy) {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuracion(min) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Badge ─────────────────────────────────────────────────────

const BADGE_CLASS = {
  emergencia:  styles.badgeEmergencia,
  pendiente:   styles.badgePendiente,
  en_curso:    styles.badgeEnCurso,
  en_revision: styles.badgeEnRevision,
  completado:  styles.badgeCompletado,
  cancelado:   styles.badgeCancelado,
};

const BADGE_LABEL = {
  emergencia:  "emergencia",
  pendiente:   "pendiente",
  en_curso:    "en curso",
  en_revision: "en revisión",
  completado:  "completado",
  cancelado:   "cancelado",
};

function BadgeEstado({ estado, tipo }) {
  const key =
    tipo === "emergencia" && estado !== "completado" && estado !== "en_revision" && estado !== "cancelado"
      ? "emergencia"
      : estado;
  return (
    <span className={`${styles.badge} ${BADGE_CLASS[key] ?? ""}`}>
      {BADGE_LABEL[key] ?? estado}
    </span>
  );
}

// ── Orden Card ────────────────────────────────────────────────

function OrdenCard({ orden, onClick }) {
  const isEmergencia = orden.tipo === "emergencia";
  const matCount = orden.materiales_usados?.length ?? 0;

  return (
    <div
      className={`${styles.card} ${isEmergencia ? styles.cardEmergencia : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{formatId(orden)}</span>
        <div className={styles.cardHeaderRight}>
          <BadgeEstado estado={orden.estado} tipo={orden.tipo} />
          <span className={styles.cardTime}>
            {formatFechaHora(orden.created_at)}
          </span>
        </div>
      </div>

      {orden.ubicaciones && (
        <p className={styles.cardUbicacion}>
          {orden.ubicaciones.edificio}
          {orden.ubicaciones.detalle ? ` · ${orden.ubicaciones.detalle}` : ""}
        </p>
      )}

      <p className={styles.cardDesc}>{orden.descripcion}</p>

      <div className={styles.cardFooter}>
        {orden.numero_meconecta ? (
          <span className={styles.cardMeta}>
            Ref. {orden.numero_meconecta}
          </span>
        ) : null}

        {matCount > 0 && (
          <>
            {orden.numero_meconecta && (
              <span className={styles.cardMetaDivider}>·</span>
            )}
            <span className={styles.cardMeta}>
              {matCount} material{matCount !== 1 ? "es" : ""}
            </span>
          </>
        )}

        {orden.duracion_min ? (
          <span className={styles.cardDuracion}>
            {formatDuracion(orden.duracion_min)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

const QUERY_SELECT =
  "id, tipo, numero_meconecta, descripcion, estado, prioridad, " +
  "created_at, hora_inicio, hora_termino, duracion_min, " +
  "ubicaciones(edificio, detalle), materiales_usados(id)";

function sortActivas(list) {
  return [...list].sort((a, b) => {
    const aEm = a.tipo === "emergencia" ? 1 : 0;
    const bEm = b.tipo === "emergencia" ? 1 : 0;
    if (aEm !== bEm) return bEm - aEm;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

export default function TecnicoPage() {
  const router = useRouter();
  const [tab, setTab] = useState("activas");
  const [activas, setActivas] = useState([]);
  const [completadas, setCompletadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombre, setNombre] = useState("");

  const cargarOrdenes = useCallback(async (uid) => {
    const supabase = createClient();

    const [{ data: actv }, { data: comp }] = await Promise.all([
      supabase
        .from("ordenes_trabajo")
        .select(QUERY_SELECT)
        .eq("tecnico_id", uid)
        .neq("estado", "completado")
        .order("created_at", { ascending: false }),

      supabase
        .from("ordenes_trabajo")
        .select(QUERY_SELECT)
        .eq("tecnico_id", uid)
        .eq("estado", "completado")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (actv) setActivas(sortActivas(actv));
    if (comp) setCompletadas(comp);
  }, []);

  useEffect(() => {
    let channel;

    async function init() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) { router.push("/login"); return; }

        const { data: perfil } = await supabase
          .from("usuarios").select("nombre").eq("id", user.id).maybeSingle();
        if (perfil?.nombre) setNombre(perfil.nombre);

        // Suscribir ANTES de cargar para no perder eventos
        channel = supabase
          .channel("tecnico-ordenes")
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "ordenes_trabajo",
              filter: `tecnico_id=eq.${user.id}`,
            },
            () => cargarOrdenes(user.id)
          )
          .subscribe();

        await cargarOrdenes(user.id);
      } catch (err) {
        console.error("TecnicoPage init error:", err);
      } finally {
        setCargando(false);
      }
    }

    init();

    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [cargarOrdenes, router]);

  const pendientes = activas.filter((o) => o.estado === "pendiente").length;

  return (
    <>
      {nombre && (
        <div className={styles.saludo}>
          <p className={styles.saludoNombre}>Hola, {nombre.split(" ")[0]}</p>
          <p className={styles.saludoSub}>
            {cargando
              ? "Cargando trabajos…"
              : pendientes > 0
              ? `Tienes ${pendientes} trabajo${pendientes !== 1 ? "s" : ""} pendiente${pendientes !== 1 ? "s" : ""}`
              : "No tienes trabajos pendientes"}
          </p>
        </div>
      )}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "activas" ? styles.tabActive : ""}`}
          onClick={() => setTab("activas")}
        >
          Mis trabajos{activas.length > 0 ? ` (${activas.length})` : ""}
        </button>
        <button
          className={`${styles.tab} ${tab === "completadas" ? styles.tabActive : ""}`}
          onClick={() => setTab("completadas")}
        >
          Completados
        </button>
      </div>

      <main className={styles.main}>
        {cargando ? (
          <p className={styles.empty}>Cargando…</p>
        ) : tab === "activas" ? (
          activas.length === 0 ? (
            <p className={styles.empty}>No tienes órdenes activas.</p>
          ) : (
            <div className={styles.list}>
              {activas.map((o) => (
                <OrdenCard
                  key={o.id}
                  orden={o}
                  onClick={() => router.push(`/tecnico/trabajo/${o.id}`)}
                />
              ))}
            </div>
          )
        ) : completadas.length === 0 ? (
          <p className={styles.empty}>No hay órdenes completadas aún.</p>
        ) : (
          <div className={styles.list}>
            {completadas.map((o) => (
              <OrdenCard
                key={o.id}
                orden={o}
                onClick={() => router.push(`/tecnico/trabajo/${o.id}`)}
              />
            ))}
          </div>
        )}
      </main>

    </>
  );
}
