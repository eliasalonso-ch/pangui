"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";

// Detail panel for each feature card in FeatureShowcase. Pure explanation —
// intro, what it covers, and who it's for — closing on the trial CTA.

export const FEATURE_DETAIL = {
  ot: {
    label: "Órdenes de trabajo",
    titulo: "Todo el trabajo en un solo lugar, desde el pedido hasta el cierre.",
    intro:
      "La OT es el centro de Pangui. Cada solicitud que entra —de un cliente, de la administración o de su propio equipo— se convierte en una orden con responsable, ubicación, prioridad y fecha, visible para todos en el mismo estado.",
    puntos: [
      ["Asignación clara", "Cada OT tiene responsable, fecha límite y prioridad. Nadie pregunta a quién le tocaba."],
      ["Contexto completo", "Ubicación, equipo, descripción, comentarios, fotos y materiales viven dentro de la orden."],
      ["Estados reales", "Asignada, en espera, en curso y completada reflejan lo que de verdad pasa en terreno."],
      ["Historial permanente", "Cada cambio queda registrado con su autor y su hora, sin depender de la memoria."],
    ],
    cierre:
      "El equipo deja de perseguir información entre WhatsApp, Excel y papeles.",
  },
  preventivo: {
    label: "Mantenimiento preventivo",
    titulo: "Las rutinas se programan una vez y se ejecutan siempre igual.",
    intro:
      "Las revisiones que se repiten cada semana o cada mes no deberían reinventarse cada vez. En Pangui se configuran como trabajo recurrente: al cerrar una OT, la siguiente se genera automáticamente.",
    puntos: [
      ["Recurrencia automática", "Diaria, semanal, mensual o a medida. La próxima OT nace sola al cerrar la anterior."],
      ["Mismo procedimiento", "Cada repetición arrastra el mismo paso a paso, así la calidad no depende de quién la haga."],
      ["Por activo o ubicación", "Programe la rutina sobre el equipo o el sector que corresponde."],
      ["Cumplimiento demostrable", "El historial muestra que el plan preventivo se ejecutó, con fechas y evidencia."],
    ],
    cierre: "Evita olvidos y estandariza revisiones sin perseguir a nadie.",
  },
  reportes: {
    label: "Reportes",
    titulo: "El respaldo se arma solo, no a fin de mes.",
    intro:
      "Toda la actividad que su equipo registra en terreno se consolida automáticamente. Cuando el cliente pide cuentas o cierra el mes, la información ya está lista.",
    puntos: [
      ["PDF por orden", "Exporte una OT completa con su evidencia, materiales y firmas para enviar al cliente."],
      ["Excel para análisis", "Baje el detalle de OTs, tiempos y consumos para cruzarlo con su propia planilla."],
      ["Reportes programados", "Configure envíos periódicos y olvídese de armarlos a mano."],
      ["Analítica operativa", "Backlog, OTs vencidas, carga por técnico y fallas repetidas, siempre al día."],
    ],
    cierre: "Menos horas armando informes y más trazabilidad para justificar el trabajo.",
  },
  activos: {
    label: "Gestión de activos",
    titulo: "Cada equipo con su historia, no solo su nombre.",
    intro:
      "Un generador, un tablero o una bomba dejan de ser una línea en una orden. Se registran con su ubicación, sus datos técnicos y su criticidad, y acumulan todo lo que se les ha hecho.",
    puntos: [
      ["Ficha técnica", "Fabricante, modelo, número de serie, ubicación, fotos y documentos adjuntos."],
      ["Criticidad", "Marque qué equipos no pueden fallar para priorizar cuando todo urge a la vez."],
      ["Historial de intervenciones", "Toda OT sobre ese equipo queda enlazada a su ficha, en orden cronológico."],
      ["Decisiones con datos", "Vea qué falla seguido y decida entre seguir reparando o reemplazar."],
    ],
    cierre: "Mejora las decisiones de reparación, reemplazo y priorización.",
  },
  procedimientos: {
    label: "Procedimientos",
    titulo: "Un procedimiento es exactamente lo que usted necesite que sea.",
    intro:
      "No es una lista de chequeo rígida. Usted arma el paso a paso con 20 tipos de campo y decide qué es obligatorio, qué se mide y qué se fotografía. El software se adapta a cómo trabaja su equipo, no al revés.",
    puntos: [
      [
        "Firma para cerrar la OT",
        "El uso más potente: exija una firma de conformidad del cliente como paso obligatorio. Sin esa firma, la orden no se cierra, y el respaldo queda dentro del trabajo.",
      ],
      ["Campos a su medida", "Texto, números, montos, lecturas de medidor, fechas, opciones, listas e inspecciones."],
      ["Evidencia integrada", "Pida fotos o archivos en el punto exacto del procedimiento donde corresponde."],
      ["Lógica condicional", "Muestre pasos solo cuando la respuesta anterior lo amerite, y puntúe el resultado."],
    ],
    cierre:
      "Menos retrabajo, menos omisiones y evidencia real de que el procedimiento se cumplió.",
    destacaPrimero: true,
  },
  inventario: {
    label: "Inventario",
    titulo: "Los repuestos conectados al trabajo que los consume.",
    intro:
      "Los materiales que su equipo usa en terreno descuentan del stock en el momento en que se registran en la OT. El inventario deja de ser una planilla separada que alguien actualiza cuando se acuerda.",
    puntos: [
      ["Consumo dentro de la OT", "El técnico registra lo que usó y el stock se ajusta solo."],
      ["Alertas de stock mínimo", "Sepa que falta un repuesto antes de que el técnico llegue al equipo."],
      ["Costos por trabajo", "Vea cuánto material se fue en cada OT y en cada activo."],
      ["Compras con respaldo", "Planifique reposición mirando consumo real, no estimaciones."],
    ],
    cierre: "Reduce visitas fallidas por faltantes y mejora la planificación de compras.",
  },
  cumplimiento: {
    label: "Cumplimiento",
    titulo: "Trazabilidad y control de acceso como parte del servicio.",
    intro:
      "Operar con datos personales y evidencia de trabajo exige orden. Pangui incorpora lo mínimo necesario para hacerlo con responsabilidad, sin que sea un módulo aparte que alguien deba configurar.",
    puntos: [
      ["Control por roles", "Cada persona ve y hace solo lo que su rol permite dentro del espacio de trabajo."],
      ["Registro de actividad", "Quién hizo qué y cuándo, por orden y por usuario."],
      ["Base legal publicada", "Política de privacidad y términos vigentes, con canal directo para ejercer derechos."],
      ["Evidencia defendible", "Fotos, firmas y fechas asociadas al trabajo que respaldan ante el cliente."],
    ],
    cierre: "El cumplimiento queda incorporado al flujo, no improvisado al final.",
  },
};

export default function FeatureDetailPanel({ featureKey, onClose }) {
  const open = Boolean(featureKey);
  const detail = featureKey ? FEATURE_DETAIL[featureKey] : null;

  // Escape closes; lock body scroll while the panel is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/45"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={detail.label}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-[var(--hairline)] px-6 py-5 md:px-8">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                {detail.label}
              </p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="-mt-1 shrink-0 text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                <X size={22} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-8">
              <h2 className="font-display text-[26px] font-bold leading-[1.14] tracking-[-0.025em] text-balance md:text-[32px]">
                {detail.titulo}
              </h2>
              <p className="mt-5 text-[15px] leading-[1.7] text-[var(--ink-2)] md:text-[16px]">
                {detail.intro}
              </p>

              <div className="mt-8 flex flex-col">
                {detail.puntos.map(([titulo, cuerpo], index) => {
                  const destacado = detail.destacaPrimero && index === 0;
                  return (
                    <article
                      key={titulo}
                      className={
                        destacado
                          ? "mb-5 rounded-[10px] border-[1.5px] border-[var(--accent)] bg-[var(--accent)]/[0.04] p-5"
                          : "border-t border-[var(--hairline)] py-5"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <Check
                          size={17}
                          strokeWidth={2.4}
                          className="mt-[3px] shrink-0 text-[var(--accent)]"
                        />
                        <div>
                          <h3 className="text-[16px] font-semibold leading-[1.35] text-[var(--ink)]">
                            {titulo}
                          </h3>
                          <p className="mt-2 text-[14.5px] leading-[1.6] text-[var(--ink-2)]">
                            {cuerpo}
                          </p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <p className="mt-6 border-t border-[var(--hairline-strong)] pt-6 text-[15px] font-semibold leading-[1.55] text-[var(--ink)]">
                {detail.cierre}
              </p>
            </div>

            {/* Trial CTA */}
            <footer className="border-t border-[var(--hairline)] bg-[#F6F8FB] px-6 py-6 md:px-8">
              <p className="font-display text-[18px] font-semibold leading-[1.25] tracking-[-0.02em]">
                Pruébelo con su propio equipo.
              </p>
              <p className="mt-2 text-[14px] leading-[1.6] text-[var(--ink-2)]">
                30 días gratis con acceso completo. Sin tarjeta y con
                configuración en minutos.
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/registro"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-3 bg-[var(--accent)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Prueba gratis 30 días
                  <ArrowRight size={17} />
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex h-12 items-center justify-center border border-[var(--accent)] px-6 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
                >
                  Agendar demo
                </Link>
              </div>
            </footer>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

export function useFeatureDetail() {
  const [featureKey, setFeatureKey] = useState(null);
  const close = useCallback(() => setFeatureKey(null), []);
  return { featureKey, open: setFeatureKey, close };
}
