"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { createClient } from "@/lib/supabase";
import { getPerfilCache, setPerfilCache } from "@/lib/perfil-cache";
import dynamic from "next/dynamic";
const ExportButtons = dynamic(() => import("@/components/ExportButtons"), { ssr: false, loading: () => null });
import styles from "./page.module.css";

// ── Query ─────────────────────────────────────────────────────

const QUERY_SELECT =
  "id, tipo, numero_meconecta, descripcion, estado, prioridad, " +
  "tecnico_id, hora_inicio, hora_termino, duracion_min, observacion, " +
  "created_at, firmado_at, nombre_solicitante, firma_solicitante, " +
  "estado_cobro, numero_factura, fecha_cobro, " +
  "costo_materiales, costo_mano_obra, costo_total, " +
  "tecnicos:usuarios(nombre), " +
  "ubicaciones(edificio, piso, detalle), " +
  "materiales_usados(id, nombre, cantidad, unidad)";

// ── SWR fetchers (module-level, outside component) ────────────

async function fetcherHoy([, pId]) {
  const supabase = createClient();
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("ordenes_trabajo")
    .select(QUERY_SELECT)
    .eq("planta_id", pId)
    .gte("created_at", inicio.toISOString())
    .order("created_at", { ascending: false });
  return data ?? [];
}

async function fetcherPeriodo([, pId, desde, hasta]) {
  const supabase = createClient();
  const { data } = await supabase
    .from("ordenes_trabajo")
    .select(QUERY_SELECT)
    .eq("planta_id", pId)
    .gte("created_at", `${desde}T00:00:00`)
    .lte("created_at", `${hasta}T23:59:59`)
    .order("created_at", { ascending: false });
  return data ?? [];
}

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

const COBRO_BADGE = {
  pendiente_cobro: { cls: styles.badgeCobroPendiente, label: "Pendiente cobro" },
  cobrado:         { cls: styles.badgeCobrado,         label: "Cobrado" },
};

function BadgeCobro({ estado_cobro }) {
  if (!estado_cobro || estado_cobro === "no_cobrable") return null;
  const b = COBRO_BADGE[estado_cobro];
  if (!b) return null;
  return <span className={`${styles.badge} ${b.cls}`}>{b.label}</span>;
}

function formatPesos(n) {
  if (n == null) return "$0";
  return "$" + Number(n).toLocaleString("es-CL");
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

  const [plantaId, setPlantaId]           = useState(null);
  const [nombre, setNombre]               = useState("");
  const [tab, setTab]                     = useState("hoy");
  const [tecnicos, setTecnicos]           = useState([]);
  const [cargando, setCargando]           = useState(true);

  const [filtroTecnico, setFiltroTecnico] = useState("");
  const [filtroDesde, setFiltroDesde]     = useState("");
  const [filtroHasta, setFiltroHasta]     = useState("");
  const [filtroAplicado, setFiltroAplicado] = useState({ desde: "", hasta: "" });

  // ── SWR — instant navigation via stale-while-revalidate ───────
  const { data: ordenesHoy = [], mutate: mutateHoy } = useSWR(
    plantaId ? ["ordenes-hoy", plantaId] : null,
    fetcherHoy,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  const { data: ordenesPeriodo = [], mutate: mutatePeriodo } = useSWR(
    plantaId && filtroAplicado.desde
      ? ["ordenes-periodo", plantaId, filtroAplicado.desde, filtroAplicado.hasta]
      : null,
    fetcherPeriodo,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  // ── Loaders ────────────────────────────────────────────────


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

        let perfil = getPerfilCache(user.id);
        if (!perfil) {
          const { data } = await supabase
            .from("usuarios")
            .select("planta_id, rol, nombre")
            .eq("id", user.id)
            .maybeSingle();
          perfil = data;
          if (perfil) setPerfilCache(user.id, perfil);
        }
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
        setFiltroAplicado({ desde: desdeStr, hasta: hastaStr });

        // SWR will auto-fetch once plantaId is set above.
        // We only need to kick off the technicians list manually.
        await cargarTecnicos(pId);

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
            () => mutateHoy(),
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
  }, [mutateHoy, router]);

  function aplicarFiltros() {
    setFiltroAplicado({ desde: filtroDesde, hasta: filtroHasta });
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
        <button
          className={`${styles.tab} ${tab === "facturacion" ? styles.tabActive : ""}`}
          onClick={() => setTab("facturacion")}
        >
          Facturación
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
                        <BadgeCobro estado_cobro={o.estado_cobro} />
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
                      <th>Descripción</th>
                      <th>Duración</th>
                      <th>Estado</th>
                      <th>Cobro</th>
                      <th>Total</th>
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
                        <td className={styles.tdDesc}>{o.descripcion}</td>
                        <td className={styles.tdNoWrap}>
                          {formatDuracion(o.duracion_min)}
                        </td>
                        <td>
                          <BadgeEstado estado={o.estado} tipo={o.tipo} />
                        </td>
                        <td><BadgeCobro estado_cobro={o.estado_cobro} /></td>
                        <td className={styles.tdNoWrap}>{o.costo_total ? formatPesos(o.costo_total) : "—"}</td>
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

        {/* ── TAB FACTURACIÓN ── */}
        {tab === "facturacion" && (() => {
          const pendientes = ordenesPeriodo.filter((o) => o.estado_cobro === "pendiente_cobro");
          const cobradas   = ordenesPeriodo.filter((o) => o.estado_cobro === "cobrado");
          const sinCobrar  = ordenesPeriodo.filter((o) => o.estado_cobro === "pendiente_cobro" || o.estado_cobro === "cobrado");

          const sumPendientes = pendientes.reduce((s, o) => s + (Number(o.costo_total) || 0), 0);
          const sumCobradas   = cobradas.reduce((s, o) => s + (Number(o.costo_total) || 0), 0);
          const sumTotal      = sinCobrar.reduce((s, o) => s + (Number(o.costo_total) || 0), 0);

          async function marcarCobrado(ordenId) {
            const supabase = createClient();
            await supabase.from("ordenes_trabajo")
              .update({ estado_cobro: "cobrado", fecha_cobro: new Date().toISOString() })
              .eq("id", ordenId);
            await mutatePeriodo();
          }

          return (
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

              {/* KPIs */}
              <div className={styles.kpiRowColumn}>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Pendientes cobro</div>
                  <div className={styles.kpiVal}>{pendientes.length}</div>
                  <div className={styles.kpiSub}>{formatPesos(sumPendientes)}</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiLabel}>Cobrados (período)</div>
                  <div className={styles.kpiVal}>{cobradas.length}</div>
                  <div className={styles.kpiSub}>{formatPesos(sumCobradas)}</div>
                </div>
                <div className={`${styles.kpi} ${styles.kpiHighlight}`}>
                  <div className={styles.kpiLabel}>Total acumulado</div>
                  <div className={styles.kpiVal}>{formatPesos(sumTotal)}</div>
                </div>
              </div>

              {/* Lista pendientes con acción rápida */}
              {pendientes.length > 0 && (
                <>
                  <h3 className={styles.seccionTitulo}>Pendientes de cobro</h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.tabla}>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Fecha</th>
                          <th>Técnico</th>
                          <th>Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendientes.map((o) => (
                          <tr key={o.id} onClick={() => router.push(`/jefe/trabajo/${o.id}`)}>
                            <td className={styles.tdMono}>{formatId(o)}</td>
                            <td className={styles.tdNoWrap}>{formatFecha(o.created_at)}</td>
                            <td>{o.tecnicos?.nombre || "—"}</td>
                            <td className={styles.tdNoWrap}>{formatPesos(o.costo_total)}</td>
                            <td>
                              <button
                                className={styles.btnCobrado}
                                onClick={(e) => { e.stopPropagation(); marcarCobrado(o.id); }}
                              >
                                ✓ Cobrado
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Full list with filter */}
              <h3 className={styles.seccionTitulo}>Todas las órdenes</h3>
              <div className={styles.tableWrap}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Fecha</th>
                      <th>Técnico</th>
                      <th>Materiales</th>
                      <th>M. obra</th>
                      <th>Total</th>
                      <th>Estado cobro</th>
                      <th>N° Factura</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesFiltradas.map((o) => (
                      <tr key={o.id} onClick={() => router.push(`/jefe/trabajo/${o.id}`)}>
                        <td className={styles.tdMono}>{formatId(o)}</td>
                        <td className={styles.tdNoWrap}>{formatFecha(o.created_at)}</td>
                        <td>{o.tecnicos?.nombre || "—"}</td>
                        <td className={styles.tdNoWrap}>{o.costo_materiales ? formatPesos(o.costo_materiales) : "—"}</td>
                        <td className={styles.tdNoWrap}>{o.costo_mano_obra ? formatPesos(o.costo_mano_obra) : "—"}</td>
                        <td className={styles.tdNoWrap}>{o.costo_total ? formatPesos(o.costo_total) : "—"}</td>
                        <td><BadgeCobro estado_cobro={o.estado_cobro} /></td>
                        <td>{o.numero_factura || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}

      </div>

      {process.env.NODE_ENV !== "production" && (
        <Link
          href="/debug-push"
          style={{ position: "fixed", bottom: 80, right: 16, fontSize: 11, background: "#273D88", color: "#fff", padding: "6px 10px", borderRadius: 8, opacity: 0.7, textDecoration: "none", zIndex: 999 }}
        >
          debug push
        </Link>
      )}
    </>
  );
}
