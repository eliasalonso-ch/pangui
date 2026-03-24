"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

const TABS = [
  { key: "analytics",  label: "Analytics" },
  { key: "feedback",   label: "Feedback" },
  { key: "arco",       label: "ARCO" },
  { key: "usuarios",   label: "Usuarios" },
  { key: "workspaces", label: "Workspaces" },
];

const COLORS = ["#273d88", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899"];

const ARCO_ESTADOS = ["pendiente", "en_proceso", "resuelto", "rechazado"];

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function Badge({ text, color = "#273d88", bg = "#eff6ff" }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 700,
      background: bg,
      color,
    }}>
      {text}
    </span>
  );
}

function Stars({ n }) {
  if (!n) return <span style={{ color: "#9ca3af" }}>—</span>;
  return <span style={{ color: "#f59e0b", fontSize: 14 }}>{"★".repeat(n)}{"☆".repeat(5 - n)}</span>;
}

export default function SuperadminDashboard() {
  const router = useRouter();
  const [tab, setTab]         = useState("analytics");
  const [data, setData]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const fetchTab = useCallback(async (t) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin?tab=${t}`);
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTab(tab); }, [tab, fetchTab]);

  async function updateArcoEstado(id, estado) {
    await fetch("/api/superadmin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    });
    fetchTab("arco");
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logo}>Pangui · Superadmin</span>
          <button onClick={() => router.push("/ordenes")} style={styles.backBtn}>
            ← App
          </button>
        </div>
      </header>

      <div style={styles.content}>
        <div style={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ ...styles.tabBtn, ...(tab === t.key ? styles.tabBtnActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <p style={{ color: "#dc2626", marginBottom: 16 }}>{error}</p>}
        {loading && <p style={{ color: "#6b7280" }}>Cargando…</p>}

        {/* ── ANALYTICS ── */}
        {!loading && tab === "analytics" && !Array.isArray(data) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* KPI row */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {[
                { label: "Workspaces", value: data.kpis?.workspaces ?? 0 },
                { label: "Usuarios activos", value: data.kpis?.users ?? 0 },
                { label: "Órdenes de trabajo", value: data.kpis?.ots ?? 0 },
                { label: "Feedback recibido", value: data.kpis?.feedback ?? 0 },
              ].map((k) => (
                <div key={k.label} style={styles.kpiCard}>
                  <span style={styles.kpiNum}>{k.value}</span>
                  <span style={styles.kpiLabel}>{k.label}</span>
                </div>
              ))}
            </div>

            {/* OTs por semana */}
            <div style={styles.card}>
              <h3 style={styles.chartTitle}>Órdenes de trabajo · últimas 12 semanas</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.otsByWeek ?? []} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#273d88" strokeWidth={2} dot={false} name="OTs" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Row: 3 pies */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>OTs por estado</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.otsByStatus ?? []} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={false}>
                      {(data.otsByStatus ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>OTs por tipo de trabajo</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.otsByTipoTrabajo ?? []} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={false}>
                      {(data.otsByTipoTrabajo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>OTs por tipo de solicitud</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.otsByTipo ?? []} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={false}>
                      {(data.otsByTipo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row: top workspaces + usuarios por rol */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>Top workspaces por OTs</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.topWorkspaces ?? []} margin={{ top: 4, right: 16, bottom: 40, left: 0 }} layout="vertical">
                    <CartesianGrid stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#273d88" name="OTs" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>Usuarios por rol</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.usersByRol ?? []} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={false}>
                      {(data.usersByRol ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row: user growth + feedback */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>Nuevos usuarios · últimas 12 semanas</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.userGrowth ?? []} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={2} dot={false} name="Usuarios" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>Feedback por tipo</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={data.feedbackByTipo ?? []} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75} label={false}>
                      {(data.feedbackByTipo ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={styles.card}>
                <h3 style={styles.chartTitle}>Feedback · calificaciones</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.feedbackByRating ?? []} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} tickFormatter={(v) => `★ ${v}`} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [v, "respuestas"]} labelFormatter={(l) => `${l} estrellas`} />
                    <Bar dataKey="value" fill="#f59e0b" name="Respuestas" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* ── FEEDBACK ── */}
        {!loading && tab === "feedback" && (
          <div style={styles.tableWrap}>
            <p style={styles.count}>{data.length} entradas</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Fecha", "Usuario", "Workspace", "Tipo", "Estrellas", "Mensaje"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={styles.td}>{fmt(row.created_at)}</td>
                    <td style={styles.td}>{row.usuarios?.nombre ?? "—"}</td>
                    <td style={styles.td}>{row.usuarios?.workspaces?.nombre ?? "—"}</td>
                    <td style={styles.td}>
                      <Badge
                        text={row.tipo}
                        color={row.tipo === "Problema" ? "#dc2626" : "#273d88"}
                        bg={row.tipo === "Problema" ? "#fef2f2" : "#eff6ff"}
                      />
                    </td>
                    <td style={styles.td}><Stars n={row.rating} /></td>
                    <td style={{ ...styles.td, maxWidth: 320 }}>{row.mensaje}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6} style={{ ...styles.td, color: "#9ca3af", textAlign: "center" }}>Sin entradas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── ARCO ── */}
        {!loading && tab === "arco" && (
          <div style={styles.tableWrap}>
            <p style={styles.count}>{data.length} solicitudes</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Fecha", "Tipo", "RUT", "Email", "Estado", "Detalle"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={styles.td}>{fmt(row.created_at)}</td>
                    <td style={styles.td}><Badge text={row.tipo} /></td>
                    <td style={styles.td}>{row.rut}</td>
                    <td style={styles.td}>{row.email}</td>
                    <td style={styles.td}>
                      <select
                        value={row.estado}
                        onChange={(e) => updateArcoEstado(row.id, e.target.value)}
                        style={styles.select}
                      >
                        {ARCO_ESTADOS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...styles.td, maxWidth: 280, color: "#6b7280" }}>
                      {row.detalle ?? "—"}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6} style={{ ...styles.td, color: "#9ca3af", textAlign: "center" }}>Sin solicitudes</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── USUARIOS ── */}
        {!loading && tab === "usuarios" && (
          <div style={styles.tableWrap}>
            <p style={styles.count}>{data.length} usuarios</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Nombre", "Workspace", "Rol", "Activo", "Registrado", "Últ. actividad"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={styles.td}>{row.nombre}</td>
                    <td style={styles.td}>{row.workspaces?.nombre ?? "—"}</td>
                    <td style={styles.td}><Badge text={row.rol} /></td>
                    <td style={styles.td}>
                      <Badge
                        text={row.activo ? "activo" : "inactivo"}
                        color={row.activo ? "#166534" : "#6b7280"}
                        bg={row.activo ? "#dcfce7" : "#f3f4f6"}
                      />
                    </td>
                    <td style={styles.td}>{fmt(row.created_at)}</td>
                    <td style={styles.td}>{fmt(row.last_active)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={6} style={{ ...styles.td, color: "#9ca3af", textAlign: "center" }}>Sin usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── WORKSPACES ── */}
        {!loading && tab === "workspaces" && (
          <div style={styles.tableWrap}>
            <p style={styles.count}>{data.length} workspaces</p>
            <table style={styles.table}>
              <thead>
                <tr>
                  {["Nombre", "Sector", "Región", "Usuarios activos", "Creado"].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{row.nombre}</td>
                    <td style={styles.td}>{row.sector ?? "—"}</td>
                    <td style={styles.td}>{row.region ?? "—"}</td>
                    <td style={{ ...styles.td, textAlign: "center" }}>{row.user_count}</td>
                    <td style={styles.td}>{fmt(row.created_at)}</td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr><td colSpan={5} style={{ ...styles.td, color: "#9ca3af", textAlign: "center" }}>Sin workspaces</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, sans-serif" },
  header: { position: "sticky", top: 0, zIndex: 10, background: "#0a1628", borderBottom: "1px solid #1e293b" },
  headerInner: { maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { fontSize: 14, fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.02em" },
  backBtn: { fontSize: 13, fontWeight: 600, color: "#94a3b8", background: "none", border: "1px solid #334155", borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit" },
  content: { maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px" },
  tabs: { display: "flex", gap: 4, marginBottom: 24, borderBottom: "2px solid #e5e7eb" },
  tabBtn: { padding: "8px 16px", fontSize: 14, fontWeight: 600, color: "#6b7280", background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", borderBottomColor: "transparent", marginBottom: -2, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" },
  tabBtnActive: { color: "#273d88", borderBottomColor: "#273d88" },
  count: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  tableWrap: { overflowX: "auto", background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 14px", background: "#f8fafc", fontWeight: 700, color: "#374151", textAlign: "left", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" },
  td: { padding: "10px 14px", color: "#374151", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" },
  select: { fontSize: 12, padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 4, background: "#fff", cursor: "pointer", fontFamily: "inherit" },
  card: { background: "#fff", borderRadius: 8, padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)" },
  chartTitle: { fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 0, marginBottom: 16 },
  kpiCard: { flex: 1, minWidth: 160, background: "#fff", borderRadius: 8, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 4 },
  kpiNum: { fontSize: 28, fontWeight: 800, color: "#273d88", lineHeight: 1 },
  kpiLabel: { fontSize: 13, color: "#6b7280" },
};
