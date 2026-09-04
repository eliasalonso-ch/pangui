"use client";

/**
 * Los cuatro gráficos del tablero, separados de la página para poder cargarlos
 * con `next/dynamic`.
 *
 * recharts pesa más que todo el resto de /inicio junto y ninguno de estos
 * gráficos está sobre el pliegue: dejarlos en el bundle inicial retrasaba el
 * primer pintado del tablero por una librería que el usuario todavía no ve.
 * Aquí se importa normal; quien decide que sea diferido es la página.
 */

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { BacklogBucket, FlowPoint } from "@/lib/ot-flow";

interface Plan {
  planificadas: number;
  noPlanificadas: number;
  pctPlanificado: number | null;
}

export interface InicioChartsProps {
  flujo: FlowPoint[];
  flujoLargo: FlowPoint[];
  plan: Plan;
  backlogEdad: BacklogBucket[];
}

/** Alto de cada fila de gráficos. Lo usa también el esqueleto de carga de la
 *  página, para que al llegar recharts el contenido de abajo no salte. */
export const ALTO_FILA_1 = 150;
export const ALTO_FILA_2 = 200;

export default function InicioCharts({ flujo, flujoLargo, plan, backlogEdad }: InicioChartsProps) {
  return (
    <>
      {/* ── Gráficos ──
          Sólo dos, y sólo porque el número solo no basta: "246 completadas" no
          dice si el backlog crece, y "16 preventivas" no dice que son el 2%.
          Los contadores de estado de arriba se quedan como número. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 28 }}>
        <ChartCard title="Creadas vs completadas" hint="Últimos 14 días">
          <ResponsiveContainer width="100%" height={ALTO_FILA_1}>
            <BarChart data={flujo} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }} />
              <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
              <Bar dataKey="creadas" name="Creadas" fill="var(--brand)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completadas" name="Completadas" fill="var(--success)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Planificado vs no planificado"
          hint={plan.pctPlanificado == null ? "Sin mantenciones" : `${plan.pctPlanificado.toFixed(0)}% planificado`}
        >
          {plan.pctPlanificado == null ? (
            <div style={{ height: ALTO_FILA_1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", fontSize: 14 }}>
              Sin datos
            </div>
          ) : (
            /* Barra apilada, no torta: con un reparto 98/2 una torta es un
               círculo con una astilla invisible. */
            <div style={{ height: ALTO_FILA_1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <div style={{ display: "flex", height: 34, borderRadius: 6, overflow: "hidden", background: "var(--surface-hover)" }}>
                <div style={{ width: `${plan.pctPlanificado}%`, background: "var(--success)", minWidth: plan.planificadas > 0 ? 3 : 0 }} />
                <div style={{ flex: 1, background: "var(--danger)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { c: "var(--success)", l: "Planificado (preventiva)", v: plan.planificadas },
                  { c: "var(--danger)",  l: "No planificado (reactiva/emergencia)", v: plan.noPlanificadas },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-2)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.c, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{r.l}</span>
                    <span style={{ fontWeight: 400, color: "var(--fg-1)" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Flujo y backlog — el mismo gráfico de /analitica/ordenes. Va debajo de
          los otros dos y a ancho completo porque son tres series sobre 30 días:
          en media columna las líneas se pisan. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 28 }}>
        <ChartCard title="Flujo de OTs" hint="Últimos 30 días">
          <ResponsiveContainer width="100%" height={ALTO_FILA_2}>
            <LineChart data={flujoLargo} margin={{ top: 4, right: 8, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }} />
              <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="creadas" name="Creadas" stroke="var(--warning)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completadas" name="Completadas" stroke="var(--success)" strokeWidth={2} dot={false} />
              {/* El backlog es la línea que importa: si sube, se abren más OTs
                  de las que se cierran. */}
              <Line type="monotone" dataKey="backlog" name="Backlog" stroke="var(--brand)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Antigüedad del backlog: dice cuánto lleva esperando la cola, no
            sólo cuánta hay. Las barras se tiñen por tramo. */}
        <ChartCard title="Antigüedad del backlog" hint={`${backlogEdad.reduce((n, b) => n + b.count, 0)} pendientes`}>
          <ResponsiveContainer width="100%" height={ALTO_FILA_2}>
            <BarChart data={backlogEdad} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 14, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
                       cursor={{ fill: "var(--surface-hover)" }} />
              <Bar dataKey="count" name="OTs pendientes" radius={[3, 3, 0, 0]}>
                {backlogEdad.map(b => (
                  <Cell key={b.label} fill={b.tone === "bad" ? "var(--danger)" : b.tone === "warn" ? "var(--warning)" : "var(--brand)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}

// ── ChartCard ──────────────────────────────────────────────────────────────────

/** Contenedor de gráfico: mismo lenguaje que Card, con una nota a la derecha. */
function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{title}</span>
        {hint && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{hint}</span>}
      </div>
      <div style={{ padding: "12px 12px 8px" }}>{children}</div>
    </div>
  );
}
