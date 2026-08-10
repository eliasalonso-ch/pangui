// Case study registry. Each entry drives the index card and its detail page.
// Figures come from the client's real workspace — update the metric together
// with the copy so the page never overstates a result.
export const CASOS = [
  {
    slug: "electrilam",
    empresa: "Electrilam",
    razonSocial: "Ingeniería y Construcción Electrilam SpA",
    industria: "Mantenimiento eléctrico",
    cliente: "Universidad de Concepción",
    periodo: "Abril – agosto 2026",
    metrica: "603",
    metricaLabel: "órdenes de trabajo gestionadas en 4 meses",
    resumen:
      "Reemplazaron el registro en papel y planillas Excel por OTs trazables con evidencia fotográfica en un campus de 160 ubicaciones.",
    metricas: [
      { valor: "603", label: "órdenes de trabajo gestionadas en 4 meses" },
      { valor: "2.824", label: "fotos de evidencia asociadas a sus OTs" },
      { valor: "160", label: "ubicaciones del campus bajo control" },
      { valor: "96%", label: "de las OTs de abril a julio cerradas en la plataforma" },
    ],
  },
];

export const getCaso = (slug) => CASOS.find((caso) => caso.slug === slug);
