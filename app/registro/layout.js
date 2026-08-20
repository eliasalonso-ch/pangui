// /registro is a genuine conversion page and is listed in the sitemap, so it
// gets a real title, description and canonical (unlike /login and /invite).
export const metadata = {
  title: "Crear cuenta · Pangui",
  description:
    "Crea tu cuenta de Pangui y prueba gratis por 30 días el software de órdenes de trabajo y mantenimiento para tu equipo.",
  alternates: { canonical: "/registro" },
  openGraph: {
    title: "Crear cuenta · Pangui",
    description:
      "Crea tu cuenta de Pangui y prueba gratis por 30 días el software de órdenes de trabajo y mantenimiento para tu equipo.",
    url: "/registro",
    type: "website",
  },
};

export default function RegistroLayout({ children }) {
  return children;
}
