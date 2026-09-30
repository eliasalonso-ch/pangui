// JSON-LD for the public marketing pages. Rendered into <head> — keeping it
// out of <body> avoids React trying to hydrate it against the PostHog loader
// scripts, which inject themselves into the body pre-hydration.
//
// Scoped per page on purpose: Google expects FAQPage and Article to describe
// the page they appear on. Emitting them site-wide from the root layout put
// them on /precios, /login and every gated app route too.

/** Site-wide: rendered from app/layout.js on every route. */
export const siteStructuredData = {
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
        "App móvil para iOS y Android",
      ],
      publisher: { "@id": "https://getpangui.com/#organization" },
    },
    {
      "@type": "Organization",
      "@id": "https://getpangui.com/#organization",
      name: "Pangui",
      url: "https://getpangui.com",
      email: "contacto@getpangui.com",
      address: { "@type": "PostalAddress", addressCountry: "CL" },
    },
  ],
};

/**
 * Preguntas frecuentes de la landing. Una sola lista para la sección visible
 * (Landing.jsx) y para el FAQPage de abajo: Google exige que el schema calce
 * con lo que se ve, y dos copias ya se habían desalineado.
 *
 * Ordenadas por la objeción que frena la prueba, no por tema. Cada respuesta
 * describe lo que Pangui hace hoy: nada de funciones a medio terminar.
 */
export const FAQS = [
  {
    q: "¿Mi cliente tiene que pagar o instalar algo?",
    a: "No. Su mandante no necesita cuenta ni app: firma la conformidad en el celular del técnico, y usted le envía el respaldo de cada trabajo en PDF.",
  },
  {
    q: "¿El informe sirve para mi estado de pago?",
    a: "Sí. Cada OT queda con fotos, firma, fecha, ubicación y materiales. Puede descargar cada OT en PDF y, en Esencial y Pro, el listado del mes en Excel, listo para adjuntar al estado de pago o a la recepción conforme.",
  },
  {
    q: "¿Mis técnicos necesitan saber de tecnología?",
    a: "No. Si usan WhatsApp, pueden usar Pangui: abren la OT en el celular, siguen los pasos, sacan fotos y piden la firma. La planificación y los informes se hacen en la web, desde la oficina. Le ayudamos a capacitar a su equipo.",
  },
  {
    q: "¿Cuánto demora empezar?",
    a: "El mismo día. Cree su cuenta, invite a su equipo y cree la primera OT. Si prefiere, agende una demo y lo dejamos funcionando juntos.",
  },
  {
    q: "¿Cuánto cuesta Pangui?",
    a: "Basic es gratis para hasta 3 usuarios. Esencial cuesta $59.000 + IVA al mes con 5 usuarios incluidos, y Pro $129.000 + IVA al mes con 10. Cada usuario adicional cuesta $8.000 + IVA en Esencial y $10.000 + IVA en Pro, sin contrato anual. Empresa parte en $349.000 + IVA al mes, con contrato anual.",
  },
  {
    q: "¿Qué pasa cuando terminan los 30 días de prueba?",
    a: "Si no elige un plan, su cuenta pasa al plan gratis. No se borra nada: sus OTs, fotos e informes quedan guardados, y al elegir un plan vuelve a tener todas las funciones.",
  },
  {
    q: "¿Emiten factura?",
    a: "Sí, factura electrónica a nombre de su empresa por la suscripción mensual. Pangui no factura a sus clientes: eso lo sigue haciendo con su sistema actual.",
  },
  {
    q: "¿Qué es un CMMS y para qué sirve?",
    a: "Un CMMS (software de gestión de mantenimiento) centraliza órdenes de trabajo, activos, materiales y evidencia en un solo sistema. Pangui es un CMMS pensado para contratistas y empresas de servicios de mantención en Chile: reemplaza planillas, WhatsApp y papeles por un flujo trazable entre oficina y terreno.",
  },
];

/** Landing page only (app/page.js) — matches the "Preguntas frecuentes" section. */
export const faqStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ],
};

/** Case-study page only (app/casos-de-exito/electrilam/page.jsx). */
export const articleStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Article",
      "@id": "https://getpangui.com/casos-de-exito/electrilam#article",
      url: "https://getpangui.com/casos-de-exito/electrilam",
      mainEntityOfPage: "https://getpangui.com/casos-de-exito/electrilam",
      // headline must stay under 110 characters or Google drops the rich result.
      headline: "Electrilam: de papel y Excel a 603 órdenes de trabajo trazables",
      description:
        "Ingeniería y Construcción Electrilam SpA ejecuta el mantenimiento eléctrico de la Universidad de Concepción. Con Pangui gestionó 603 órdenes de trabajo y 2.824 fotos de evidencia en cuatro meses, reemplazando el registro en papel y planillas Excel.",
      inLanguage: "es-CL",
      // image and datePublished are REQUIRED by Google for Article. Without
      // them the page is ineligible for rich results and Search Console reports
      // a validation error — which is what Ahrefs was flagging.
      image: {
        "@type": "ImageObject",
        url: "https://getpangui.com/opengraph-image",
        width: 1200,
        height: 630,
      },
      datePublished: "2026-08-10",
      dateModified: "2026-08-10",
      author: { "@id": "https://getpangui.com/#organization" },
      publisher: { "@id": "https://getpangui.com/#organization" },
      about: {
        "@type": "Organization",
        name: "Ingeniería y Construcción Electrilam SpA",
        address: {
          "@type": "PostalAddress",
          addressCountry: "CL",
          addressRegion: "Biobío",
        },
      },
      // The named entities this case is about. Gives Google and LLMs the real
      // subject matter — a Chilean maintenance contractor working a university
      // campus — rather than leaving it to be inferred from prose.
      mentions: [
        {
          "@type": "CollegeOrUniversity",
          name: "Universidad de Concepción",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Concepción",
            addressRegion: "Biobío",
            addressCountry: "CL",
          },
        },
        {
          "@type": "Thing",
          name: "Mantenimiento eléctrico",
        },
        {
          "@type": "SoftwareApplication",
          name: "Pangui",
          applicationCategory: "BusinessApplication",
        },
      ],
    },
  ],
};
