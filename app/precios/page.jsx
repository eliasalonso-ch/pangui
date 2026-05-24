import "../landing.css";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import { UI_VISIBLE_PLANS, TRIAL_DAYS } from "@/lib/flow-plans";

export const metadata = {
  title: "Precios · Pangui",
  description: "Planes por usuario para equipos de mantención. Prueba Pro gratis por 14 días.",
};

const fmtCLP = (n) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const limitLabel = (value, suffix = "") => {
  if (value === Infinity) return "Ilimitado";
  return `${value}${suffix}`;
};

const MATRIX_ROWS = [
  {
    section: "Órdenes de trabajo",
    rows: [
      { label: "Órdenes de trabajo",            value: () => "Ilimitadas" },
      { label: "OT con procedimientos / mes",   value: (p) => limitLabel(p.limits.ots_con_procedimientos_mes) },
      { label: "OT con fotos adjuntas / mes",   value: (p) => limitLabel(p.limits.ots_con_fotos_mes) },
      { label: "OT repetitivas / mes",          value: (p) => limitLabel(p.limits.ots_repetitivas_mes) },
      { label: "Exportar OT a PDF",             value: () => "Sí" },
      { label: "Exportar OT a Excel / CSV",     feature: "exports" },
    ],
  },
  {
    section: "Procedimientos y activos",
    rows: [
      { label: "Procedimientos (catálogo)",       value: (p) => limitLabel(p.limits.procedimientos) },
      { label: "Activos",                         value: (p) => limitLabel(p.limits.activos) },
      { label: "QR / códigos de barras",          feature: "qr_codes" },
      { label: "Jerarquías de activos",           feature: "jerarquias_activos" },
      { label: "Mantenimiento preventivo",        feature: "preventivos" },
      { label: "Auto-attach de procedimientos",   feature: "procedimiento_auto_attach" },
    ],
  },
  {
    section: "Inventario",
    rows: [
      { label: "Módulo Partes (inventario)",      feature: "inventario" },
      { label: "Hojas de cálculo en OT",          feature: "inventario" },
    ],
  },
  {
    section: "Analítica e insights",
    rows: [
      { label: "Historial de analítica",          value: (p) => limitLabel(p.limits.historial_meses, " meses") },
      { label: "Dashboard avanzado (MTTR/MTBF)",  feature: "analytics_pro" },
      { label: "Analítica de materiales",         feature: "analytics_pro" },
      { label: "Exportes programados",            feature: "scheduler" },
    ],
  },
  {
    section: "Avanzado",
    rows: [
      { label: "Notificaciones push web y móvil", feature: "push" },
      { label: "Normativa y cumplimiento",        feature: "normativa" },
      { label: "Escaneo de OT con IA",            feature: "ai_scan" },
    ],
  },
];

export default function PreciosPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <LandingNav context="precios" />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:items-end xl:px-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Precios por usuario activo
              </p>
              <h1 className="mt-5 max-w-[880px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[64px]">
                Elige qué queda desbloqueado para tu operación.
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[560px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
                Todos parten con {TRIAL_DAYS} días de Pro sin tarjeta. Después puedes quedarte en Basic o subir de plan para quitar límites y activar funciones avanzadas.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/registro"
                  className="inline-flex h-12 items-center justify-center gap-3 bg-[var(--accent)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Empezar prueba Pro
                  <ArrowRight size={17} />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center border border-[var(--hairline-strong)] px-6 text-[15px] font-semibold transition-colors hover:bg-black/5"
                >
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] lg:grid-cols-3">
              {UI_VISIBLE_PLANS.map((plan) => (
                <PricingCard key={plan.key} plan={plan} featured={plan.key === "pro"} />
              ))}
            </div>
            <p className="mt-5 text-[13px] leading-[1.55] text-[var(--ink-3)]">
              Los precios son mensuales por usuario activo. Sin compromiso anual; puedes cancelar cuando quieras.
            </p>
          </div>
        </section>

        <ComparisonTable plans={UI_VISIBLE_PLANS} />

        <section className="border-t border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 xl:px-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Cómo se bloquea
              </p>
              <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] md:text-[48px]">
                La prueba abre Pro. Basic vuelve a límites claros.
              </h2>
            </div>
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] lg:col-span-7">
              {[
                ["Durante la prueba", `Todas las funciones de Pro quedan disponibles por ${TRIAL_DAYS} días.`],
                ["Si no eliges plan", "El workspace pasa a Basic y se bloquean preventivos, exportaciones, analítica avanzada, push, normativa, exportes programados e IA."],
                ["Al subir de plan", "El cobro se calcula por usuarios activos y el acceso se actualiza desde Configuración → Suscripción."],
              ].map(([title, body]) => (
                <article key={title} className="bg-white p-6 md:p-8">
                  <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em]">{title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[var(--ink-2)]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--accent)] text-white">
          <div className="mx-auto max-w-[1080px] px-4 py-14 text-center md:py-20">
            <h2 className="font-display text-[32px] font-bold tracking-[-0.03em] md:text-[46px]">
              Prueba Pangui con Pro desbloqueado
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-white/82 md:text-[17px]">
              Sin tarjeta, sin instalación y con el camino claro para decidir qué plan necesita tu equipo.
            </p>
            <Link
              href="/registro"
              className="mt-8 inline-flex h-12 items-center justify-center gap-3 bg-white px-7 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-9"
            >
              Crear mi cuenta
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter context="precios" />
    </div>
  );
}

function PricingCard({ plan, featured }) {
  const isEnterprise = plan.key === "enterprise";

  return (
    <article className={`flex min-h-[430px] flex-col bg-white p-6 md:p-7 ${featured ? "is-recommended" : ""} ${isEnterprise ? "bg-[#0A0B0D] text-white" : ""}`}>
      <div>
        <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.16em] ${isEnterprise ? "text-white/65" : "text-[var(--accent)]"}`}>
          {plan.name}
        </p>
        <h2 className="mt-4 font-display text-[24px] font-semibold leading-[1.12] tracking-[-0.02em]">
          {plan.tagline}
        </h2>
      </div>

      <div className="mt-7">
        {isEnterprise ? (
          <>
            <p className="font-display text-[38px] font-bold leading-none tracking-[-0.03em]">A medida</p>
            <p className="mt-2 text-[13px] text-white/65">vía contrato</p>
          </>
        ) : (
          <>
            <p className="font-display text-[38px] font-bold leading-none tracking-[-0.03em]">{fmtCLP(plan.pricePerUser)}</p>
            <p className="mt-2 text-[13px] text-[var(--ink-3)]">por usuario activo / mes</p>
          </>
        )}
      </div>

      <ul className="mt-7 flex flex-col gap-3">
        {plan.highlights.slice(0, 6).map((item) => (
          <li key={item} className={`flex items-start gap-2.5 text-[14px] leading-[1.45] ${isEnterprise ? "text-white/82" : "text-[var(--ink-2)]"}`}>
            <Check size={15} className={`mt-0.5 shrink-0 ${isEnterprise ? "text-white" : "text-[var(--accent)]"}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {isEnterprise ? (
        <a
          href="mailto:contacto@getpangui.com?subject=Pangui%20Enterprise"
          className="mt-auto inline-flex h-11 items-center justify-center border border-white/40 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-white hover:text-black"
        >
          Contactar ventas
        </a>
      ) : (
        <Link
          href={`/registro?plan=${plan.key}`}
          className={`mt-auto inline-flex h-11 items-center justify-center px-5 text-[14px] font-semibold transition-colors ${
            featured
              ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              : "border border-[var(--hairline-strong)] hover:bg-black/5"
          }`}
        >
          Empezar con {plan.name}
        </Link>
      )}
    </article>
  );
}

function ComparisonTable({ plans }) {
  return (
    <section className="border-t border-[var(--hairline)] bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
        <div className="max-w-[760px]">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
            Comparación por plan
          </p>
          <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] md:text-[52px]">
            Qué se mantiene activo y qué queda bloqueado.
          </h2>
        </div>

        <div className="mt-10 overflow-x-auto border border-[var(--hairline)]">
          <table className="w-full min-w-[860px] border-collapse bg-white text-left">
            <thead>
              <tr>
                <th className="w-[280px] border-b border-[var(--hairline)] bg-[#F6F8FB] p-4 text-[13px] font-semibold text-[var(--ink-2)]">
                  Función
                </th>
                {plans.map((plan) => (
                  <th key={plan.key} className="border-b border-l border-[var(--hairline)] bg-[#F6F8FB] p-4 text-center">
                    <span className="font-display text-[18px] font-semibold tracking-[-0.02em]">{plan.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MATRIX_ROWS.map((group) => (
                <RowGroup key={group.section} group={group} plans={plans} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RowGroup({ group, plans }) {
  return (
    <>
      <tr>
        <td colSpan={plans.length + 1} className="border-b border-[var(--hairline)] bg-[var(--accent)] px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white">
          {group.section}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label}>
          <th className="border-b border-[var(--hairline)] p-4 text-[14px] font-semibold text-[var(--ink)]">
            {row.label}
          </th>
          {plans.map((plan) => (
            <td key={plan.key} className="border-b border-l border-[var(--hairline)] p-4 text-center text-[14px] text-[var(--ink-2)]">
              {row.feature ? <FeatureMark enabled={plan.features[row.feature]} /> : row.value(plan)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function FeatureMark({ enabled }) {
  return enabled ? (
    <span className="inline-flex items-center justify-center text-[var(--accent)]" aria-label="Incluido">
      <Check size={18} strokeWidth={2.4} />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center text-[var(--ink-4)]" aria-label="Bloqueado">
      <Minus size={18} />
    </span>
  );
}
