import { REGISTRO_URL, planUrl } from "@/lib/app-urls";
import "../landing.css";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";
import { UI_VISIBLE_PLANS, TRIAL_DAYS } from "@/lib/flow-plans";

const PRECIOS_DESCRIPTION =
  "Planes por equipo, con usuarios incluidos, para contratistas de mantención. Pruebe Pro gratis por 30 días.";

export const metadata = {
  title: "Precios",
  description: PRECIOS_DESCRIPTION,
  alternates: { canonical: "/precios" },
  openGraph: {
    title: "Precios · Pangui",
    description: PRECIOS_DESCRIPTION,
    url: "/precios",
    type: "website",
  },
};

const fmtCLP = (n) =>
  n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

const limitLabel = (value, suffix = "") => {
  if (value === Infinity) return "Ilimitado";
  return `${value}${suffix}`;
};

// Cada fila sale del catálogo (lib/flow-plans.ts), que es lo que realmente
// habilita o limita cada plan en la app. Las filas `all` son capacidades que no
// dependen del plan; `only` son compromisos de servicio sin bandera en código.
// Antes de sumar una fila, confirmar que la función existe y a qué plan va.
const MATRIX_ROWS = [
  {
    section: "Equipo",
    rows: [
      { label: "Usuarios incluidos",              value: (p) => (Number.isFinite(p.includedUsers) ? `${p.includedUsers}` : "Según contrato") },
      { label: "Usuario adicional / mes",         value: (p) => (p.extraUserPrice > 0 ? `${fmtCLP(p.extraUserPrice)} + IVA` : null) },
      { label: "App móvil iOS y Android",         all: true },
      { label: "Notificaciones push",             all: true },
      { label: "Almacenamiento de fotos y archivos", value: (p) => limitLabel(p.limits.storage_gb, " GB") },
    ],
  },
  {
    section: "Órdenes de trabajo y procedimientos",
    rows: [
      { label: "Órdenes de trabajo ilimitadas",   all: true },
      { label: "Actividad por OT con fotos y audio", all: true },
      { label: "Firma de conformidad del cliente", all: true },
      { label: "Procedimientos con lógica condicional", all: true },
      { label: "Registro de tiempo por OT",       all: true },
      { label: "OT con procedimientos",           value: (p) => perMonth(p.limits.ots_con_procedimientos_mes) },
      { label: "OT con fotos adjuntas",           value: (p) => perMonth(p.limits.ots_con_fotos_mes) },
      { label: "Procedimientos en catálogo",      value: (p) => limitLabel(p.limits.procedimientos) },
      { label: "Hojas de cálculo en OT",          feature: "inventario" },
      { label: "Escaneo de OT con IA",            value: (p) => (p.features.ai_scan ? perMonth(p.limits.ai_scans_mes) : null) },
    ],
  },
  {
    section: "Mantenimiento preventivo",
    rows: [
      { label: "OT repetitivas",                  value: (p) => perMonth(p.limits.ots_repetitivas_mes) },
      { label: "Medidores y mantenimiento por condición", feature: "medidores" },
      { label: "Planes de mantención",            feature: "planes_mantencion" },
      { label: "Automatizaciones (medidor → OT)", feature: "automatizaciones" },
    ],
  },
  {
    section: "Activos y ubicaciones",
    rows: [
      { label: "Activos",                         value: (p) => limitLabel(p.limits.activos) },
      { label: "Ubicaciones ilimitadas",          all: true },
      { label: "QR / códigos de barras",          feature: "qr_codes" },
      { label: "Jerarquías de activos",           feature: "jerarquias_activos" },
    ],
  },
  {
    section: "Inventario y compras",
    rows: [
      { label: "Inventario de repuestos",         feature: "inventario" },
      { label: "Proveedores",                     feature: "proveedores" },
      { label: "Órdenes de compra",               feature: "ordenes_compra" },
    ],
  },
  {
    section: "Reportes y analítica",
    rows: [
      { label: "Exportar OT a PDF",               all: true },
      { label: "Exportar a Excel / CSV",          feature: "exports" },
      { label: "Exportes programados",            feature: "scheduler" },
      { label: "Historial de analítica",          value: (p) => (p.limits.historial_meses === Infinity ? "Ilimitado" : `Últimos ${p.limits.historial_meses} ${p.limits.historial_meses === 1 ? "mes" : "meses"}`) },
      { label: "Analítica de órdenes (MTTR / MTBF)", feature: "analytics_pro" },
      { label: "Analítica de activos",            feature: "analytics_pro" },
    ],
  },
  {
    section: "Soporte",
    rows: [
      { label: "Soporte en español, desde Chile", all: true },
      { label: "Soporte prioritario",             only: ["pro", "enterprise"] },
      { label: "Onboarding, SLA y account manager", only: ["enterprise"] },
    ],
  },
];

function perMonth(value) {
  return value === Infinity ? "Ilimitadas" : `${value} / mes`;
}

function cellValue(row, plan) {
  if (row.all) return true;
  if (row.only) return row.only.includes(plan.key);
  if (row.feature) return plan.features[row.feature];
  return row.value(plan);
}

export default function PreciosPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:items-end xl:px-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Precios
              </p>
              <h1 className="mt-5 max-w-[880px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[64px]">
                Precio por equipo, no por persona.
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[560px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
                Cada plan incluye usuarios y un precio fijo por el equipo.
                Todos parten con {TRIAL_DAYS} días de Pro gratis, sin tarjeta.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {UI_VISIBLE_PLANS.map((plan, i) => (
                <PricingCard
                  key={plan.key}
                  plan={plan}
                  previous={UI_VISIBLE_PLANS[i - 1]}
                  featured={plan.key === "pro"}
                />
              ))}
            </div>
            <p className="mt-6 text-[13px] leading-[1.55] text-[var(--ink-3)]">
              Precios mensuales en pesos chilenos, sin IVA (19%), que se agrega al momento del cobro. Sin compromiso anual; puede cancelar cuando quiera.
            </p>
          </div>
        </section>

        <ComparisonTable plans={UI_VISIBLE_PLANS} />

        <section className="border-t border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 xl:px-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Qué pasa después de la prueba
              </p>
              <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] md:text-[48px]">
                La prueba abre Pro. Basic vuelve a límites claros.
              </h2>
            </div>
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] lg:col-span-7">
              {[
                ["Durante la prueba", `Todas las funciones de Pro quedan disponibles por ${TRIAL_DAYS} días.`],
                ["Si no eliges plan", "El workspace pasa a Basic y se bloquean preventivos, exportaciones, analítica avanzada, exportes programados e IA."],
                ["Al subir de plan", "Paga la base del plan. Si su equipo supera los usuarios incluidos, cada usuario adicional se suma al cobro mensual."],
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
              Pruebe Pangui con todo Pro desbloqueado
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-white/82 md:text-[17px]">
              Sin tarjeta, sin instalación y con el camino claro para decidir qué plan necesita su equipo.
            </p>
            <Link
              href={REGISTRO_URL}
              className="mt-8 inline-flex h-12 items-center justify-center gap-3 bg-white px-7 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-9"
            >
              Crear mi cuenta
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function PricingCard({ plan, previous, featured }) {
  const isEnterprise = plan.key === "enterprise";
  const isFree = !isEnterprise && plan.basePrice === 0;
  const muted = isEnterprise ? "text-white/70" : "text-[var(--ink-3)]";

  // El ribbon "Más popular" ocupa el mismo alto que el espaciador de las otras
  // tarjetas, así precios y botones quedan alineados en una sola fila.
  return (
    <div className="flex flex-col">
      <div
        className={`h-10 items-center justify-center text-[14px] font-semibold ${
          featured ? "flex bg-[var(--accent)] text-white" : "hidden lg:flex"
        }`}
      >
        {featured ? "Más popular" : null}
      </div>
      <article
        className={`flex flex-1 flex-col p-6 md:p-7 ${
          isEnterprise
            ? "bg-[#0F1A3D] text-white"
            : featured
              ? "border-2 border-t-0 border-[var(--accent)] bg-white"
              : "border border-[var(--hairline-strong)] bg-white"
        }`}
      >
        <h2 className="font-display text-[34px] font-bold leading-none tracking-[-0.03em] md:text-[38px]">
          {plan.name}
        </h2>
        <p className={`mt-4 text-[15px] leading-[1.5] lg:min-h-[92px] ${isEnterprise ? "text-white/85" : "text-[var(--ink-2)]"}`}>
          {plan.tagline}
        </p>

        <div className="mt-6 lg:min-h-[126px]">
          {/* Fila de etiqueta de alto fijo en las cuatro tarjetas (vacía en
              Basic): así los precios quedan en la misma línea base. */}
          <div className="mb-2 flex h-6 items-center">
            {isEnterprise ? (
              <span className="text-[13px] font-semibold text-white/70">Desde</span>
            ) : !isFree ? (
              <span className="bg-[#E8EDFA] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Precio de lanzamiento
              </span>
            ) : null}
          </div>
          {isEnterprise ? (
            <>
              <p className="font-display text-[44px] font-bold leading-none tracking-[-0.03em]">{fmtCLP(plan.desdePrecio)}</p>
              <p className={`mt-3 text-[13px] leading-[1.45] ${muted}`}>
                + IVA al mes
                <br />
                Contrato anual en UF
              </p>
            </>
          ) : isFree ? (
            <>
              <p className="font-display text-[44px] font-bold leading-none tracking-[-0.03em]">$0</p>
              <p className={`mt-3 text-[13px] ${muted}`}>para siempre · hasta {plan.includedUsers} usuarios</p>
            </>
          ) : (
            <>
              <p className="flex items-baseline gap-3">
                <span className="font-display text-[44px] font-bold leading-none tracking-[-0.03em]">{fmtCLP(plan.basePrice)}</span>
                {plan.listPrice && (
                  <span className={`text-[16px] line-through ${muted}`} aria-label={`Precio normal ${fmtCLP(plan.listPrice)}`}>
                    {fmtCLP(plan.listPrice)}
                  </span>
                )}
              </p>
              <p className={`mt-3 text-[13px] leading-[1.45] ${muted}`}>
                + IVA al mes · incluye {plan.includedUsers} usuarios
                <br />
                Usuario adicional {fmtCLP(plan.extraUserPrice)} + IVA
              </p>
            </>
          )}
        </div>

        <div className="mt-6">
          {isEnterprise ? (
            <Link
              href="/demo"
              className="flex h-14 w-full items-center justify-center bg-[var(--accent)] text-[17px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Agendar demo
            </Link>
          ) : isFree ? (
            <Link
              href={planUrl(plan.key)}
              className="flex h-14 w-full items-center justify-center border-2 border-[var(--accent)] text-[17px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
            >
              Crear cuenta gratis
            </Link>
          ) : (
            <Link
              href={planUrl(plan.key)}
              className="flex h-14 w-full items-center justify-center bg-[var(--accent)] text-[17px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Pruebe gratis {TRIAL_DAYS} días
            </Link>
          )}
          <p className={`mt-2 h-4 text-center text-[12px] ${muted}`}>
            {!isEnterprise && !isFree ? "Sin tarjeta de crédito" : null}
          </p>
        </div>

        <p className="mt-8 text-[15px] font-semibold">
          {previous ? `Todo lo de ${previous.name}, más:` : `${plan.name} incluye:`}
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {plan.highlights.map((item) => (
            <li
              key={item}
              className={`flex items-start gap-2.5 text-[14px] leading-[1.45] ${isEnterprise ? "text-white/85" : "text-[var(--ink-2)]"}`}
            >
              <Check size={15} className={`mt-0.5 shrink-0 ${isEnterprise ? "text-white" : "text-[var(--accent)]"}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

const ENTERPRISE_BG = "bg-[#0F1A3D]";

function ComparisonTable({ plans }) {
  // El encabezado es sticky solo en escritorio: sticky no funciona dentro de un
  // contenedor con overflow, y en móvil la tabla necesita scroll horizontal.
  return (
    <section className="border-t border-[var(--hairline)] bg-white">
      <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
        <h2 className="font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] md:text-[48px]">
          Qué incluye cada plan.
        </h2>

        <div className="mt-10 overflow-x-auto lg:overflow-visible">
          <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
            <colgroup>
              <col className="w-[28%]" />
              {plans.map((plan) => (
                <col key={plan.key} className="w-[18%]" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="border-y border-l border-[var(--hairline-strong)] bg-white p-4 align-top lg:sticky lg:top-[68px] lg:z-20">
                  <span className="font-display text-[20px] font-bold tracking-[-0.02em]">Compare planes</span>
                </th>
                {plans.map((plan) => (
                  <PlanHeader key={plan.key} plan={plan} />
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

function PlanHeader({ plan }) {
  const featured = plan.key === "pro";
  const isEnterprise = plan.key === "enterprise";
  const isFree = !isEnterprise && plan.basePrice === 0;

  const bg = featured ? "bg-[var(--accent)] text-white" : isEnterprise ? `${ENTERPRISE_BG} text-white` : "bg-white";
  const button = isEnterprise
    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
    : featured
      ? "bg-white text-[var(--accent)] hover:bg-white/90"
      : isFree
        ? "border-2 border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
        : "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]";

  return (
    <th className={`border-y border-l border-[var(--hairline-strong)] p-4 align-top lg:sticky lg:top-[68px] lg:z-20 ${bg}`}>
      <div className="flex items-center gap-2">
        <span className="font-display text-[20px] font-bold tracking-[-0.02em]">{plan.name}</span>
        {featured && (
          <span className="rounded-full border border-white/70 px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
            Más popular
          </span>
        )}
      </div>
      <Link
        href={isEnterprise ? "/demo" : planUrl(plan.key)}
        className={`mt-4 flex h-11 w-full items-center justify-center text-[15px] font-semibold transition-colors ${button}`}
      >
        {isEnterprise ? "Agendar demo" : isFree ? "Crear cuenta gratis" : "Pruebe gratis"}
      </Link>
    </th>
  );
}

function RowGroup({ group, plans }) {
  return (
    <>
      <tr>
        <th
          scope="colgroup"
          className="border-b border-l border-[var(--hairline)] bg-white px-4 pb-4 pt-10 text-[17px] font-bold text-[var(--ink)]"
        >
          {group.section}
        </th>
        {plans.map((plan) => (
          <td
            key={plan.key}
            className={`border-b border-l border-[var(--hairline)] ${plan.key === "enterprise" ? ENTERPRISE_BG : "bg-white"}`}
          />
        ))}
      </tr>
      {group.rows.map((row) => (
        <tr key={row.label} className="group">
          <th
            scope="row"
            className="border-b border-l border-[var(--hairline)] bg-white px-4 py-4 text-[14px] font-normal leading-[1.4] text-[var(--ink)] group-hover:bg-[#EEF2FC]"
          >
            {row.label}
          </th>
          {plans.map((plan) => (
            <Cell key={plan.key} value={cellValue(row, plan)} dark={plan.key === "enterprise"} />
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({ value, dark }) {
  const base = `border-b border-l px-4 py-4 text-center text-[14px] ${
    dark
      ? `${ENTERPRISE_BG} border-white/10 text-white group-hover:bg-[#16244F]`
      : "border-[var(--hairline)] bg-white text-[var(--ink-2)] group-hover:bg-[#EEF2FC]"
  }`;

  if (value === true) {
    return (
      <td className={base}>
        <Check size={18} strokeWidth={2.2} aria-label="Incluido" className={`inline ${dark ? "text-white" : "text-[var(--accent)]"}`} />
      </td>
    );
  }
  if (value === false || value === null) {
    return (
      <td className={base}>
        <span className="sr-only">No incluido</span>
      </td>
    );
  }
  return <td className={base}>{value}</td>;
}
