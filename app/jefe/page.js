"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import ExportButtons from "@/components/ExportButtons";
import styles from "./page.module.css";

// ── Query ─────────────────────────────────────────────────────

const QUERY_SELECT =
  "id, tipo, numero_meconecta, descripcion, estado, prioridad, " +
  "tecnico_id, hora_inicio, hora_termino, duracion_min, observacion, " +
  "created_at, firmado_at, nombre_solicitante, firma_solicitante, " +
  "tecnicos:usuarios(nombre), " +
  "ubicaciones(edificio, piso, detalle), " +
  "materiales_usados(id, nombre, cantidad, unidad)";

// ── Helpers ───────────────────────────────────────────────────

function formatId(o) {
  const year = new Date(o.created_at).getFullYear();
  const suffix = o.id.slice(-4).toUpperCase();
  return `${o.tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
}

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatFechaHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) {
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
  if (!min) return "—";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function calcularKPIs(ordenes) {
  const total = ordenes.length;
  const completadas = ordenes.filter((o) => o.estado === "completado").length;
  const pendientes = ordenes.filter((o) => o.estado === "pendiente").length;
  const enCurso = ordenes.filter((o) => o.estado === "en_curso").length;
  const emergencias = ordenes.filter((o) => o.tipo === "emergencia").length;
  const conDuracion = ordenes.filter((o) => (o.duracion_min ?? 0) > 0);
  const promMin =
    conDuracion.length > 0
      ? Math.round(
          conDuracion.reduce((s, o) => s + o.duracion_min, 0) /
            conDuracion.length,
        )
      : null;
  return { total, completadas, pendientes, enCurso, emergencias, promMin };
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

// ── KPI grid ──────────────────────────────────────────────────

function KpiGrid({ kpis, destacado = false }) {
  if (!kpis || kpis.total === 0) return null;
  return (
    <div className={styles.kpiRow}>
      <div className={`${styles.kpi} ${destacado ? styles.kpiDestacado : ""}`}>
        <div className={styles.kpiLabel}>Total</div>
        <div className={styles.kpiVal}>{kpis.total}</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Completados</div>
        <div className={`${styles.kpiVal} ${styles.kpiSuccess}`}>
          {kpis.completadas}
        </div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>En curso</div>
        <div className={styles.kpiVal}>{kpis.enCurso}</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Pendientes</div>
        <div className={styles.kpiVal}>{kpis.pendientes}</div>
      </div>
      <div className={styles.kpi}>
        <div className={styles.kpiLabel}>Emergencias</div>
        <div className={`${styles.kpiVal} ${kpis.emergencias > 0 ? styles.kpiDanger : ""}`}>
          {kpis.emergencias}
        </div>
      </div>
      {kpis.promMin != null && (
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>T. promedio</div>
          <div className={styles.kpiVal}>{formatDuracion(kpis.promMin)}</div>
        </div>
      )}
    </div>
  );
}

// ── Filtros bar (shared between Semana and Reportes) ──────────

function FiltrosBar({ tecnicos, filtroTecnico, setFiltroTecnico, filtroDesde, setFiltroDesde, filtroHasta, setFiltroHasta, onAplicar }) {
  return (
    <div className={styles.filtros}>
      <div className={styles.filtroGroup}>
        <label>Técnico</label>
        <select
          value={filtroTecnico}
          onChange={(e) => setFiltroTecnico(e.target.value)}
        >
          <option value="">Todos</option>
          {tecnicos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.filtroGroup}>
        <label>Desde</label>
        <input
          type="date"
          value={filtroDesde}
          onChange={(e) => setFiltroDesde(e.target.value)}
        />
      </div>
      <div className={styles.filtroGroup}>
        <label>Hasta</label>
        <input
          type="date"
          value={filtroHasta}
          onChange={(e) => setFiltroHasta(e.target.value)}
        />
      </div>
      <div className={styles.filtroGroup}>
        <label>&nbsp;</label>
        <button className={styles.btnFiltrar} onClick={onAplicar}>
          Aplicar
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function JefePage() {
  const router = useRouter();

  const [plantaId, setPlantaId]         = useState(null);
  const [nombre, setNombre]             = useState("");
  const [tab, setTab]                   = useState("hoy");
  const [ordenesHoy, setOrdenesHoy]     = useState([]);
  const [ordenesPeriodo, setOrdenesPeriodo] = useState([]);
  const [tecnicos, setTecnicos]         = useState([]);
  const [cargando, setCargando]         = useState(true);
  const [ultimaAct, setUltimaAct]       = useState(new Date());

  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroDesde, setFiltroDesde]   = useState("");
  const [filtroHasta, setFiltroHasta]   = useState("");

  // ── Loaders ────────────────────────────────────────────────

  const cargarOrdenesHoy = useCallback(async (pId) => {
    const supabase = createClient();
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(QUERY_SELECT)
      .eq("planta_id", pId)
      .gte("created_at", inicio.toISOString())
      .order("created_at", { ascending: false });
    if (data) setOrdenesHoy(data);
    setUltimaAct(new Date());
  }, []);

  const cargarOrdenesPeriodo = useCallback(async (pId, desde, hasta) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("ordenes_trabajo")
      .select(QUERY_SELECT)
      .eq("planta_id", pId)
      .gte("created_at", `${desde}T00:00:00`)
      .lte("created_at", `${hasta}T23:59:59`)
      .order("created_at", { ascending: false });
    if (data) setOrdenesPeriodo(data);
  }, []);

  async function cargarTecnicos(pId) {
    const supabase = createClient();
    const { data: refs } = await supabase
      .from("ordenes_trabajo")
      .select("tecnico_id")
      .eq("planta_id", pId);
    const ids = [...new Set((refs || []).map((r) => r.tecnico_id).filter(Boolean))];
    if (ids.length === 0) { setTecnicos([]); return; }
    const { data } = await supabase
      .from("usuarios")
      .select("id, nombre")
      .in("id", ids)
      .order("nombre");
    setTecnicos(data || []);
  }

  // ── Init + realtime ────────────────────────────────────────

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
          .from("usuarios")
          .select("planta_id, nombre")
          .eq("id", user.id)
          .maybeSingle();
        if (!perfil) { router.push("/login"); return; }

        const pId = perfil.planta_id;
        setPlantaId(pId);
        if (perfil.nombre) setNombre(perfil.nombre);

        const hoy = new Date();
        const hace7 = new Date();
        hace7.setDate(hoy.getDate() - 7);
        const desdeStr = hace7.toISOString().split("T")[0];
        const hastaStr = hoy.toISOString().split("T")[0];
        setFiltroDesde(desdeStr);
        setFiltroHasta(hastaStr);

        await Promise.all([
          cargarOrdenesHoy(pId),
          cargarOrdenesPeriodo(pId, desdeStr, hastaStr),
          cargarTecnicos(pId),
        ]);

        channel = supabase
          .channel(`jefe-rt-${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "ordenes_trabajo",
              filter: `planta_id=eq.${pId}`,
            },
            () => cargarOrdenesHoy(pId),
          )
          .subscribe();
      } catch (err) {
        console.error("JefePage init error:", err);
      } finally {
        setCargando(false);
      }
    }

    init();
    return () => {
      if (channel) createClient().removeChannel(channel);
    };
  }, [cargarOrdenesHoy, cargarOrdenesPeriodo, router]);

  function aplicarFiltros() {
    if (plantaId) cargarOrdenesPeriodo(plantaId, filtroDesde, filtroHasta);
  }

  // ── Derived data ───────────────────────────────────────────

  const ordenesFiltradas = useMemo(() => {
    if (!filtroTecnico) return ordenesPeriodo;
    return ordenesPeriodo.filter((o) => o.tecnico_id === filtroTecnico);
  }, [ordenesPeriodo, filtroTecnico]);

  const kpisHoy     = useMemo(() => calcularKPIs(ordenesHoy), [ordenesHoy]);
  const kpisPeriodo = useMemo(() => calcularKPIs(ordenesFiltradas), [ordenesFiltradas]);

  const reporteTecnicos = useMemo(() => {
    const map = {};
    ordenesFiltradas.forEach((o) => {
      const nombre = o.tecnicos?.nombre || "Sin técnico";
      if (!map[nombre]) map[nombre] = { nombre, cantidad: 0, totalMin: 0, conDur: 0 };
      map[nombre].cantidad++;
      if ((o.duracion_min ?? 0) > 0) {
        map[nombre].totalMin += o.duracion_min;
        map[nombre].conDur++;
      }
    });
    return Object.values(map)
      .sort((a, b) => b.cantidad - a.cantidad)
      .map((t) => ({
        ...t,
        promMin: t.conDur > 0 ? Math.round(t.totalMin / t.conDur) : null,
      }));
  }, [ordenesFiltradas]);

  const reporteTipos = useMemo(() => ({
    solicitud: ordenesFiltradas.filter((o) => o.tipo !== "emergencia").length,
    emergencia: ordenesFiltradas.filter((o) => o.tipo === "emergencia").length,
  }), [ordenesFiltradas]);

  const reporteMateriales = useMemo(() => {
    const map = {};
    ordenesFiltradas.forEach((o) => {
      (o.materiales_usados || []).forEach((m) => {
        if (!m.nombre) return;
        const key = m.nombre.trim().toLowerCase();
        if (!map[key]) map[key] = { nombre: m.nombre.trim(), veces: 0, cantidad: 0, unidad: m.unidad || "un" };
        map[key].veces++;
        map[key].cantidad += Number(m.cantidad) || 0;
      });
    });
    return Object.values(map)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }, [ordenesFiltradas]);

  const reporteEdificios = useMemo(() => {
    const map = {};
    ordenesFiltradas.forEach((o) => {
      const edificio = o.ubicaciones?.edificio || "Sin ubicación";
      map[edificio] = (map[edificio] || 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [ordenesFiltradas]);

  const filtrosExport = useMemo(() => ({
    desde: filtroDesde,
    hasta: filtroHasta,
    tecnico: filtroTecnico
      ? tecnicos.find((t) => t.id === filtroTecnico)?.nombre
      : null,
  }), [filtroDesde, filtroHasta, filtroTecnico, tecnicos]);

  // ── Render ─────────────────────────────────────────────────

  if (cargando) {
    return <p className={styles.cargando}>Cargando…</p>;
  }

  const hoyCompletados = ordenesHoy.filter((o) => o.estado === "completado").length;

  return (
    <>
      {nombre && (
        <div className={styles.saludo}>
          <p className={styles.saludoNombre}>Hola, {nombre.split(" ")[0]}</p>
          <p className={styles.saludoSub}>
            {cargando
              ? "Cargando…"
              : `${ordenesHoy.length} trabajo${ordenesHoy.length !== 1 ? "s" : ""} hoy · ${hoyCompletados} completado${hoyCompletados !== 1 ? "s" : ""}`}
          </p>
        </div>
      )}
      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "hoy" ? styles.tabActive : ""}`}
          onClick={() => setTab("hoy")}
        >
          Hoy {ordenesHoy.length > 0 ? `(${ordenesHoy.length})` : ""}
        </button>
        <button
          className={`${styles.tab} ${tab === "semana" ? styles.tabActive : ""}`}
          onClick={() => setTab("semana")}
        >
          Semana
        </button>
        <button
          className={`${styles.tab} ${tab === "reportes" ? styles.tabActive : ""}`}
          onClick={() => setTab("reportes")}
        >
          Reportes
        </button>
      </div>

      <div className={styles.body}>

        {/* ── TAB HOY ── */}
        {tab === "hoy" && (
          <>
            <KpiGrid kpis={kpisHoy} destacado />

            {ordenesHoy.length === 0 ? (
              <p className={styles.empty}>No hay órdenes hoy.</p>
            ) : (
              <div className={styles.ordenList}>
                {ordenesHoy.map((o) => (
                  <div
                    key={o.id}
                    className={`${styles.ordenCard} ${o.tipo === "emergencia" ? styles.ordenCardEmergencia : ""}`}
                    onClick={() => router.push(`/jefe/trabajo/${o.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && router.push(`/jefe/trabajo/${o.id}`)}
                  >
                    <div className={styles.ordenCardTop}>
                      <span className={styles.ordenId}>{formatId(o)}</span>
                      <div className={styles.ordenCardRight}>
                        <BadgeEstado estado={o.estado} tipo={o.tipo} />
                        <span className={styles.ordenTime}>
                          {formatFechaHora(o.created_at)}
                        </span>
                      </div>
                    </div>
                    <p className={`${styles.ordenDesc} ${o.estado === "cancelado" ? styles.ordenDescCancelado : ""}`}>{o.descripcion}</p>
                    <div className={styles.ordenMeta}>
                      {o.tecnicos?.nombre && (
                        <span>{o.tecnicos.nombre}</span>
                      )}
                      {o.ubicaciones && (
                        <span>
                          {o.ubicaciones.edificio}
                          {o.ubicaciones.detalle ? ` · ${o.ubicaciones.detalle}` : ""}
                        </span>
                      )}
                      {o.duracion_min ? (
                        <span className={styles.metaDuracion}>
                          {formatDuracion(o.duracion_min)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── TAB SEMANA ── */}
        {tab === "semana" && (
          <>
            <FiltrosBar
              tecnicos={tecnicos}
              filtroTecnico={filtroTecnico}
              setFiltroTecnico={setFiltroTecnico}
              filtroDesde={filtroDesde}
              setFiltroDesde={setFiltroDesde}
              filtroHasta={filtroHasta}
              setFiltroHasta={setFiltroHasta}
              onAplicar={aplicarFiltros}
            />

            <KpiGrid kpis={kpisPeriodo} />

            <ExportButtons ordenes={ordenesFiltradas} filtros={filtrosExport} />

            {ordenesFiltradas.length === 0 ? (
              <p className={styles.empty}>No hay órdenes en este período.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Técnico</th>
                      <th>Ubicación</th>
                      <th>Descripción</th>
                      <th>Duración</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesFiltradas.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => router.push(`/jefe/trabajo/${o.id}`)}
                      >
                        <td className={styles.tdMono}>{formatId(o)}</td>
                        <td className={styles.tdNoWrap}>{formatFecha(o.created_at)}</td>
                        <td className={o.tipo === "emergencia" ? styles.tdEmergencia : ""}>
                          {o.tipo === "emergencia" ? "Emergencia" : "Solicitud"}
                        </td>
                        <td>{o.tecnicos?.nombre || "—"}</td>
                        <td>
                          {o.ubicaciones
                            ? `${o.ubicaciones.edificio}${o.ubicaciones.detalle ? ` · ${o.ubicaciones.detalle}` : ""}`
                            : "—"}
                        </td>
                        <td className={styles.tdDesc}>{o.descripcion}</td>
                        <td className={styles.tdNoWrap}>
                          {formatDuracion(o.duracion_min)}
                        </td>
                        <td>
                          <BadgeEstado estado={o.estado} tipo={o.tipo} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB REPORTES ── */}
        {tab === "reportes" && (
          <>
            <FiltrosBar
              tecnicos={tecnicos}
              filtroTecnico={filtroTecnico}
              setFiltroTecnico={setFiltroTecnico}
              filtroDesde={filtroDesde}
              setFiltroDesde={setFiltroDesde}
              filtroHasta={filtroHasta}
              setFiltroHasta={setFiltroHasta}
              onAplicar={aplicarFiltros}
            />

            <KpiGrid kpis={kpisPeriodo} destacado />

            <ExportButtons ordenes={ordenesFiltradas} filtros={filtrosExport} />

            {ordenesFiltradas.length === 0 ? (
              <p className={styles.empty}>No hay datos en este período.</p>
            ) : (
              <>
                {/* Por técnico */}
                <h3 className={styles.seccionTitulo}>Trabajos por técnico</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th>Técnico</th>
                        <th>Órdenes</th>
                        <th>T. promedio</th>
                        <th>Completadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporteTecnicos.map((t) => {
                        const completadas = ordenesFiltradas.filter(
                          (o) =>
                            (o.tecnicos?.nombre || "Sin técnico") === t.nombre &&
                            o.estado === "completado",
                        ).length;
                        return (
                          <tr key={t.nombre}>
                            <td className={styles.tdBold}>{t.nombre}</td>
                            <td>{t.cantidad}</td>
                            <td>{t.promMin ? formatDuracion(t.promMin) : "—"}</td>
                            <td>{completadas}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Por tipo */}
                <h3 className={styles.seccionTitulo}>Por tipo de orden</h3>
                <div className={styles.kpiRow}>
                  <div className={styles.kpi}>
                    <div className={styles.kpiLabel}>Solicitudes</div>
                    <div className={styles.kpiVal}>{reporteTipos.solicitud}</div>
                  </div>
                  <div className={`${styles.kpi} ${styles.kpiDangerBorder}`}>
                    <div className={styles.kpiLabel}>Emergencias</div>
                    <div className={`${styles.kpiVal} ${styles.kpiDanger}`}>
                      {reporteTipos.emergencia}
                    </div>
                  </div>
                </div>

                {/* Materiales */}
                {reporteMateriales.length > 0 && (
                  <>
                    <h3 className={styles.seccionTitulo}>
                      Top {reporteMateriales.length} materiales más usados
                    </h3>
                    <div className={styles.tableWrap}>
                      <table className={styles.tabla}>
                        <thead>
                          <tr>
                            <th>Material</th>
                            <th>Cantidad total</th>
                            <th>N° órdenes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reporteMateriales.map((m) => (
                            <tr key={m.nombre}>
                              <td>{m.nombre}</td>
                              <td className={styles.tdBold}>
                                {m.cantidad} {m.unidad}
                              </td>
                              <td>{m.veces}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Por edificio */}
                {reporteEdificios.length > 0 && (
                  <>
                    <h3 className={styles.seccionTitulo}>Trabajos por edificio</h3>
                    <div className={styles.tableWrap}>
                      <table className={styles.tabla}>
                        <thead>
                          <tr>
                            <th>Edificio</th>
                            <th>Órdenes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reporteEdificios.map(([edificio, count]) => (
                            <tr key={edificio}>
                              <td>{edificio}</td>
                              <td>{count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        <div className={styles.footer}>
          Actualizado{" "}
          {ultimaAct.toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      </div>

    </>
  );
}
