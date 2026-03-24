"use client";
import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Activity,
  Printer,
  Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./KpiDash.module.css";

// ── Helpers ───────────────────────────────────────────────────

function fmtNum(n) {
  return n == null ? "—" : Number(n).toLocaleString("es-CL");
}

function fmtHoras(min) {
  if (!min || min <= 0) return "—";
  const h = min / 60;
  if (h < 1) return `${Math.round(min)} min`;
  return h.toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " h";
}

// ── Custom Tooltip ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipLabel}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          {p.name}: <strong>{fmtNum(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────

function KpiCard({ icon: Icon, iconColor, label, value, sub, alert, warn }) {
  return (
    <div className={`${styles.kpiCard} ${alert ? styles.kpiCardAlert : warn ? styles.kpiCardWarn : ""}`}>
      <div
        className={styles.kpiCardIcon}
        style={{ background: `${iconColor}1a`, color: iconColor }}
      >
        <Icon size={18} />
      </div>
      <div className={styles.kpiCardBody}>
        <div className={styles.kpiCardLabel}>{label}</div>
        <div className={styles.kpiCardVal}>{value}</div>
        {sub && <div className={styles.kpiCardSub}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Chart legend dot ──────────────────────────────────────────

function LegendDot({ color, label }) {
  return (
    <span className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} />
      {label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────

export default function KpiDash({ plantaId }) {
  const [ordenes, setOrdenes] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [activosCount, setActivosCount] = useState(0);
  const [presupuestoMes, setPresupuestoMes] = useState([]);
  const [preventivosData, setPreventivosData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!plantaId) return;

    const sb = createClient();
    const from90 = new Date();
    from90.setDate(from90.getDate() - 90);

    const FULL_SELECT =
      "id,estado,prioridad,tipo,tipo_trabajo,activo_id,duracion_min,created_at,activos(nombre)";
    const BASE_SELECT =
      "id,estado,prioridad,tipo,duracion_min,created_at";

    const now = new Date();
    Promise.allSettled([
      sb.from("ordenes_trabajo").select(FULL_SELECT).eq("workspace_id", plantaId).gte("created_at", from90.toISOString()),
      sb.from("partes").select("id,nombre,stock_actual,stock_minimo,unidad").eq("workspace_id", plantaId),
      sb.from("activos").select("id", { count: "exact", head: true }).eq("workspace_id", plantaId).eq("activo", true),
      sb.from("presupuestos").select("tipo,monto").eq("workspace_id", plantaId).eq("año", now.getFullYear()).eq("mes", now.getMonth() + 1),
      sb.from("preventivos").select("id,activo,proxima_fecha,frecuencia_dias").eq("workspace_id", plantaId).eq("activo", true),
    ]).then(async ([r1, r2, r3, r4, r5]) => {
      // Fall back to base select if new columns cause a 400
      let ordenesData = r1.status === "fulfilled" ? (r1.value?.data ?? null) : null;
      if (ordenesData === null) {
        const { data: basic } = await sb.from("ordenes_trabajo").select(BASE_SELECT).eq("workspace_id", plantaId).gte("created_at", from90.toISOString());
        ordenesData = basic ?? [];
      }
      const matData = r2.status === "fulfilled" ? (r2.value?.data ?? []) : [];
      setOrdenes(ordenesData);
      setMateriales(matData);
      setActivosCount(r3.status === "fulfilled" ? (r3.value?.count ?? 0) : 0);
      setPresupuestoMes(r4.status === "fulfilled" ? (r4.value?.data ?? []) : []);
      setPreventivosData(r5.status === "fulfilled" ? (r5.value?.data ?? []) : []);
      setLoading(false);
    });
  }, [plantaId]);

  // ── KPI metrics ───────────────────────────────────────────

  const kpis = useMemo(() => {
    const total = ordenes.length;
    const completadas = ordenes.filter((o) => o.estado === "completado").length;
    const activas = ordenes.filter(
      (o) => !["completado", "cancelado"].includes(o.estado)
    ).length;
    const urgentes = ordenes.filter(
      (o) =>
        o.prioridad === "urgente" &&
        !["completado", "cancelado"].includes(o.estado)
    ).length;

    const conDur = ordenes.filter(
      (o) => o.estado === "completado" && (o.duracion_min ?? 0) > 0
    );
    const mttr =
      conDur.length > 0
        ? conDur.reduce((s, o) => s + o.duracion_min, 0) / conDur.length
        : null;

    const pctCompletadas =
      total > 0 ? Math.round((completadas / total) * 100) : null;

    const reactivas = ordenes.filter(
      (o) => o.tipo_trabajo === "reactiva" || o.tipo === "emergencia"
    ).length;
    const preventivas = ordenes.filter(
      (o) => o.tipo_trabajo === "preventiva"
    ).length;

    const hoyStr = new Date().toDateString();
    const hoy = ordenes.filter(
      (o) => new Date(o.created_at).toDateString() === hoyStr
    ).length;

    const lowStock = materiales.filter(
      (m) =>
        m.stock_minimo != null &&
        m.stock_actual != null &&
        Number(m.stock_actual) <= Number(m.stock_minimo)
    ).length;

    // ── Disponibilidad % (last 30 days, reactive OTs with activo_id) ──
    const from30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const reactivasConActivo = ordenes.filter(
      (o) =>
        o.activo_id &&
        o.tipo_trabajo === "reactiva" &&
        (o.duracion_min ?? 0) > 0 &&
        new Date(o.created_at) >= from30
    );
    const downtimeHrs = reactivasConActivo.reduce((s, o) => s + o.duracion_min / 60, 0);
    const disponibilidad =
      activosCount > 0
        ? Math.max(0, Math.min(100, (1 - downtimeHrs / (activosCount * 30 * 24)) * 100)).toFixed(1)
        : null;

    // ── Presupuesto mes ──
    const presupuestoTotal = presupuestoMes.reduce((s, p) => s + (Number(p.monto) || 0), 0);
    const presupuestoPct =
      presupuestoTotal > 0 ? Math.round((costoMes / presupuestoTotal) * 100) : null;

    // ── % Preventivo (last 90 days) ──
    const totalTipadas = reactivas + preventivas;
    const pctPreventivo = totalTipadas > 0 ? Math.round((preventivas / totalTipadas) * 100) : null;

    return {
      total,
      completadas,
      activas,
      urgentes,
      mttr,
      pctCompletadas,
      reactivas,
      preventivas,
      hoy,
      lowStock,
      disponibilidad,
      presupuestoTotal,
      presupuestoPct,
      pctPreventivo,
    };
  }, [ordenes, materiales, activosCount, presupuestoMes]);

  // ── Weekly trend (last 8 weeks) ───────────────────────────

  const tendencia = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const daysBack = (7 - i) * 7;
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() - daysBack + 6);
      weekEnd.setHours(23, 59, 59, 999);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);

      const label = weekStart.toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      });
      const wOrdenes = ordenes.filter((o) => {
        const d = new Date(o.created_at);
        return d >= weekStart && d <= weekEnd;
      });
      return {
        semana: label,
        Total: wOrdenes.length,
        Completadas: wOrdenes.filter((o) => o.estado === "completado").length,
      };
    });
  }, [ordenes]);

  // ── Estado distribution ───────────────────────────────────

  const estadoData = useMemo(
    () =>
      [
        {
          name: "Abierta",
          value: ordenes.filter((o) => o.estado === "pendiente").length,
          color: "#3B82F6",
        },
        {
          name: "En espera",
          value: ordenes.filter((o) => o.estado === "en_espera").length,
          color: "#F59E0B",
        },
        {
          name: "En curso",
          value: ordenes.filter((o) =>
            ["en_curso", "en_revision"].includes(o.estado)
          ).length,
          color: "#6366F1",
        },
        {
          name: "Completada",
          value: ordenes.filter((o) => o.estado === "completado").length,
          color: "#22C55E",
        },
        {
          name: "Cancelada",
          value: ordenes.filter((o) => o.estado === "cancelado").length,
          color: "#6B7280",
        },
      ].filter((d) => d.value > 0),
    [ordenes]
  );

  // ── Tipo trabajo ──────────────────────────────────────────

  const tipoData = useMemo(
    () =>
      [
        {
          name: "Reactiva",
          value: ordenes.filter(
            (o) => o.tipo_trabajo === "reactiva" || o.tipo === "emergencia"
          ).length,
          color: "#EF4444",
        },
        {
          name: "Preventiva",
          value: ordenes.filter((o) => o.tipo_trabajo === "preventiva").length,
          color: "#3B82F6",
        },
        {
          name: "Inspección",
          value: ordenes.filter((o) => o.tipo_trabajo === "inspeccion").length,
          color: "#6366F1",
        },
        {
          name: "Mejora",
          value: ordenes.filter((o) => o.tipo_trabajo === "mejora").length,
          color: "#22C55E",
        },
        {
          name: "Sin tipo",
          value: ordenes.filter(
            (o) =>
              !o.tipo_trabajo && o.tipo !== "emergencia"
          ).length,
          color: "#9CA3AF",
        },
      ].filter((d) => d.value > 0),
    [ordenes]
  );

  // ── Prioridad ─────────────────────────────────────────────

  const prioData = useMemo(
    () =>
      [
        {
          name: "Urgente",
          value: ordenes.filter((o) => o.prioridad === "urgente").length,
          color: "#EF4444",
        },
        {
          name: "Alta",
          value: ordenes.filter((o) => o.prioridad === "alta").length,
          color: "#F97316",
        },
        {
          name: "Media",
          value: ordenes.filter((o) => o.prioridad === "media").length,
          color: "#3B82F6",
        },
        {
          name: "Baja",
          value: ordenes.filter((o) => o.prioridad === "baja").length,
          color: "#6B7280",
        },
      ].filter((d) => d.value > 0),
    [ordenes]
  );

  // ── Activos con más fallas (top 8) ───────────────────────

  const activosFallasData = useMemo(() => {
    const map = {};
    ordenes.forEach((o) => {
      if (!o.activo_id) return;
      const nombre = o.activos?.nombre || o.activo_id.slice(0, 8);
      map[nombre] = (map[nombre] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([nombre, fallas]) => ({
        nombre: nombre.length > 14 ? nombre.slice(0, 14) + "…" : nombre,
        Fallas: fallas,
      }));
  }, [ordenes]);

  // ── Cumplimiento de preventivos ───────────────────────────

  const cumplimientoPreventivos = useMemo(() => {
    if (preventivosData.length === 0) return null;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const alDia = preventivosData.filter((p) => {
      if (!p.proxima_fecha) return true;
      return new Date(p.proxima_fecha + "T00:00:00") >= hoy;
    }).length;
    const vencidos = preventivosData.length - alDia;
    const pct = Math.round((alDia / preventivosData.length) * 100);
    return { total: preventivosData.length, alDia, vencidos, pct };
  }, [preventivosData]);

  // ── Low-stock list ────────────────────────────────────────

  const stockCritico = useMemo(
    () =>
      materiales
        .filter(
          (m) =>
            m.stock_minimo != null &&
            m.stock_actual != null &&
            Number(m.stock_actual) <= Number(m.stock_minimo)
        )
        .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual)),
    [materiales]
  );

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.loading}>Cargando panel de control…</div>;
  }

  if (ordenes.length === 0) {
    return (
      <div className={styles.empty}>
        <TrendingUp size={36} style={{ opacity: 0.15 }} />
        <p>No hay datos aún.<br />Crea tu primera orden de trabajo para ver el panel.</p>
      </div>
    );
  }

  return (
    <div className={styles.dash}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>Panel de Control</h2>
          <p className={styles.headerSub}>Últimos 90 días</p>
        </div>
        <button className={styles.printBtn} onClick={() => window.print()}>
          <Printer size={14} />
          <span>Descargar PDF</span>
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className={styles.kpiGrid}>
        <KpiCard
          icon={TrendingUp}
          iconColor="#6366F1"
          label="Total OTs"
          value={fmtNum(kpis.total)}
          sub={`${kpis.activas} activas`}
        />
        <KpiCard
          icon={CheckCircle2}
          iconColor="#22C55E"
          label="Completadas"
          value={kpis.pctCompletadas != null ? `${kpis.pctCompletadas}%` : "—"}
          sub={`${kpis.completadas} de ${kpis.total}`}
        />
        <KpiCard
          icon={Clock}
          iconColor="#3B82F6"
          label="MTTR"
          value={fmtHoras(kpis.mttr)}
          sub="Tiempo medio de reparación"
        />
        <KpiCard
          icon={AlertTriangle}
          iconColor="#EF4444"
          label="OTs urgentes"
          value={fmtNum(kpis.urgentes)}
          sub="Activas sin cerrar"
          alert={kpis.urgentes > 0}
        />
        <KpiCard
          icon={Wrench}
          iconColor="#F97316"
          label="Reactivas / Preventivas"
          value={`${kpis.reactivas} / ${kpis.preventivas}`}
          sub="Últimos 90 días"
        />
        <KpiCard
          icon={Package}
          iconColor={kpis.lowStock > 0 ? "#EF4444" : "#6B7280"}
          label="Stock crítico"
          value={fmtNum(kpis.lowStock)}
          sub="Materiales bajo mínimo"
          alert={kpis.lowStock > 0}
        />
        <KpiCard
          icon={Activity}
          iconColor="#6366F1"
          label="OTs hoy"
          value={fmtNum(kpis.hoy)}
          sub="Creadas en el día"
        />
        {kpis.disponibilidad !== null && (
          <KpiCard
            icon={CheckCircle2}
            iconColor={parseFloat(kpis.disponibilidad) < 90 ? "#F59E0B" : "#22C55E"}
            label="Disponibilidad"
            value={`${kpis.disponibilidad}%`}
            sub="Últimos 30 días"
            warn={parseFloat(kpis.disponibilidad) < 90}
          />
        )}
        {kpis.pctPreventivo !== null && (
          <KpiCard
            icon={Wrench}
            iconColor="#6366F1"
            label="% Preventivo"
            value={`${kpis.pctPreventivo}%`}
            sub={`${kpis.preventivas} prev / ${kpis.reactivas} react`}
          />
        )}
      </div>

      {/* ── Charts ── */}
      <div className={styles.chartGrid}>

        {/* Tendencia semanal — spans 2 cols */}
        <div className={`${styles.chartCard} ${styles.chartWide}`}>
          <h3 className={styles.chartTitle}>Tendencia semanal de OTs</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={tendencia}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradComp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(128,128,128,0.15)"
              />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="Total"
                stroke="#6366F1"
                fill="url(#gradTotal)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="Completadas"
                stroke="#22C55E"
                fill="url(#gradComp)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className={styles.legend}>
            <LegendDot color="#6366F1" label="Total" />
            <LegendDot color="#22C55E" label="Completadas" />
          </div>
        </div>

        {/* Distribución por estado */}
        {estadoData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>Distribución por estado</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={estadoData}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(128,128,128,0.15)"
                />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="OTs" radius={[4, 4, 0, 0]}>
                  {estadoData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* OTs por tipo de trabajo */}
        {tipoData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>OTs por tipo de trabajo</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={tipoData}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(128,128,128,0.15)"
                />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="OTs" radius={[4, 4, 0, 0]}>
                  {tipoData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* OTs por prioridad */}
        {prioData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>OTs por prioridad</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={prioData}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(128,128,128,0.15)"
                />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="OTs" radius={[4, 4, 0, 0]}>
                  {prioData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Activos con más fallas */}
        {activosFallasData.length > 0 && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>
              <Wrench size={14} />
              Activos con más fallas
            </h3>
            <ResponsiveContainer width="100%" height={Math.max(160, activosFallasData.length * 36)}>
              <BarChart
                data={activosFallasData}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11 }} width={90} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="Fallas" fill="#EF4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Cumplimiento de preventivos */}
        {cumplimientoPreventivos && (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>
              <CheckCircle2 size={14} />
              Cumplimiento de preventivos
            </h3>
            <div className={styles.cumplimientoWrap}>
              <div className={styles.cumplimientoCircle} style={{ background: `conic-gradient(#22C55E ${cumplimientoPreventivos.pct}%, var(--divider-1) 0%)` }}>
                <span className={styles.cumplimientoPct}>{cumplimientoPreventivos.pct}%</span>
                <span className={styles.cumplimientoLbl}>al día</span>
              </div>
              <div className={styles.cumplimientoStats}>
                <div className={styles.cumplimientoStat}>
                  <span className={styles.cumplimientoStatDot} style={{ background: "#22C55E" }} />
                  <span>Al día: <strong>{cumplimientoPreventivos.alDia}</strong></span>
                </div>
                <div className={styles.cumplimientoStat}>
                  <span className={styles.cumplimientoStatDot} style={{ background: "#EF4444" }} />
                  <span>Vencidos: <strong>{cumplimientoPreventivos.vencidos}</strong></span>
                </div>
                <div className={styles.cumplimientoStat}>
                  <span className={styles.cumplimientoStatDot} style={{ background: "var(--accent-5)" }} />
                  <span>Total: <strong>{cumplimientoPreventivos.total}</strong></span>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Stock crítico table ── */}
      {stockCritico.length > 0 && (
        <div className={styles.tableSection}>
          <div className={styles.tableSectionHeader}>
            <AlertTriangle size={16} style={{ color: "#EF4444", flexShrink: 0 }} />
            <h3 className={styles.tableSectionTitle}>
              Alertas de stock crítico
            </h3>
            <span className={styles.tableBadge}>{stockCritico.length}</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Unidad</th>
                  <th>Alerta</th>
                </tr>
              </thead>
              <tbody>
                {stockCritico.map((m) => (
                  <tr key={m.id}>
                    <td className={styles.tdBold}>{m.nombre}</td>
                    <td className={styles.tdDanger}>{m.stock_actual}</td>
                    <td>{m.stock_minimo}</td>
                    <td>{m.unidad || "—"}</td>
                    <td>
                      <span
                        className={
                          Number(m.stock_actual) === 0
                            ? styles.badgeOut
                            : styles.badgeLow
                        }
                      >
                        {Number(m.stock_actual) === 0
                          ? "Sin stock"
                          : "Stock bajo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
