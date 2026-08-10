// JSON-LD for the landing page. Rendered into <head> from app/layout.js —
// keeping it out of <body> avoids React trying to hydrate it against the
// PostHog loader scripts, which inject themselves into the body pre-hydration.
export const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Pangui",
      url: "https://getpangui.com",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      description:
        "Software de órdenes de trabajo y mantenimiento (CMMS) para contratistas y empresas de servicios de mantención en Chile. Planificación, ejecución en terreno, activos, materiales, evidencia y reportes.",
      inLanguage: "es-CL",
      offers: {
        "@type": "Offer",
        price: "7990",
        priceCurrency: "CLP",
        description: "Por usuario al mes. Incluye 30 días de prueba gratis.",
        url: "https://getpangui.com/precios",
      },
      featureList: [
        "Órdenes de trabajo",
        "Mantenimiento preventivo",
        "Gestión de activos",
        "Inventario y materiales",
        "Listas e inspecciones",
        "Reportes PDF y Excel",
        "App móvil con modo sin conexión",
      ],
      publisher: {
        "@type": "Organization",
        name: "Pangui",
        url: "https://getpangui.com",
        email: "contacto@getpangui.com",
        address: { "@type": "PostalAddress", addressCountry: "CL" },
      },
    },
    {
      "@type": "Article",
      url: "https://getpangui.com/casos-de-exito/electrilam",
      headline:
        "Caso de éxito: Electrilam pasa de papel y Excel a 603 órdenes de trabajo trazables con Pangui",
      description:
        "Ingeniería y Construcción Electrilam SpA ejecuta el mantenimiento eléctrico de la Universidad de Concepción. Con Pangui gestionó 603 órdenes de trabajo y 2.824 fotos de evidencia en cuatro meses, reemplazando el registro en papel y planillas Excel.",
      inLanguage: "es-CL",
      about: {
        "@type": "Organization",
        name: "Ingeniería y Construcción Electrilam SpA",
        address: { "@type": "PostalAddress", addressCountry: "CL" },
      },
      publisher: { "@type": "Organization", name: "Pangui" },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "¿Qué es un CMMS y para qué sirve?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Un CMMS (software de gestión de mantenimiento) centraliza órdenes de trabajo, activos, materiales y evidencia en un solo sistema. Pangui es un CMMS pensado para contratistas y empresas de servicios de mantención en Chile: reemplaza planillas, WhatsApp y papeles por un flujo trazable entre oficina y terreno.",
          },
        },
        {
          "@type": "Question",
          name: "¿Pangui es solo para crear órdenes de trabajo?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. La OT es el centro del flujo, pero alrededor de ella se conectan activos, evidencia, materiales, procedimientos, firmas, estados de espera, reportes y analítica operativa.",
          },
        },
        {
          "@type": "Question",
          name: "¿La app móvil sigue siendo necesaria si existe la web?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Sí, para terreno. La web está pensada para administración y revisión; la app móvil nativa está pensada para técnicos, fotos, firmas, procedimientos y trabajo sin conexión.",
          },
        },
        {
          "@type": "Question",
          name: "¿Qué tan flexibles son los procedimientos?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Usted decide qué contiene cada procedimiento. Se arma con 20 tipos de paso —secciones, instrucciones, advertencias, texto, números, montos, lecturas de medidor, fechas, opciones, listas de verificación, inspecciones, fotos, archivos, escaneo QR y firma— con pasos obligatorios y lógica condicional. El caso más usado es agregar una firma de conformidad obligatoria para poder cerrar la OT.",
          },
        },
        {
          "@type": "Question",
          name: "¿Cuánto cuesta Pangui?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Pangui tiene un plan único por usuario al mes, con 30 días de prueba gratis para todo el equipo. El detalle está en getpangui.com/precios.",
          },
        },
        {
          "@type": "Question",
          name: "¿Incluye factura electrónica?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Pangui prepara evidencia operacional, materiales, costos y reportes para respaldo administrativo. La emisión de documentos tributarios se gestiona fuera de la plataforma.",
          },
        },
      ],
    },
  ],
};

