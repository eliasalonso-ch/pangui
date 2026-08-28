// /registro now lives on app.getpangui.com and is no longer in the sitemap.
//
// The canonical and og:url are ABSOLUTE on purpose. They used to be "/registro",
// which Next resolves against metadataBase — the marketing apex — so every
// signup page declared a canonical pointing at https://getpangui.com/registro,
// a URL that 308s to this one. Ahrefs flagged it as "canonical points to
// redirect", and a canonical that redirects is ignored by Google, leaving the
// ?plan= variants to compete with each other.
//
// All ?plan= variants canonicalise here, to the bare URL: they are the same
// form with a preselected plan, not distinct pages.
import { REGISTRO_URL } from "@/lib/app-urls";

const DESCRIPTION =
  "Crea tu cuenta de Pangui y prueba gratis por 30 días el software de órdenes de trabajo y mantenimiento para tu equipo.";

export const metadata = {
  title: "Crear cuenta",
  description: DESCRIPTION,
  alternates: { canonical: REGISTRO_URL },
  openGraph: {
    title: "Crear cuenta · Pangui",
    description: DESCRIPTION,
    url: REGISTRO_URL,
    type: "website",
  },
};

export default function RegistroLayout({ children }) {
  return children;
}
